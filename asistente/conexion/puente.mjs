// Puente Telegram -> servidor unico de tu OpenCode. Solo una persona (tu ID) puede usarlo.
// Recibe por sondeo (getUpdates): no abre puertos y no toca ningun webhook. Si el bot tiene un webhook activo, se niega a arrancar.
import path from "node:path"
import fs from "node:fs"
import zlib from "node:zlib"
import { pathToFileURL } from "node:url"
import { COMMIT, URL_SERVIDOR, dir, leerJson, leerSecreto, carpetaProyecto, sesionActual, recordarSesion, modoActual, recordarModo, session, comprobarInstalacion } from "./comun.mjs"
import { cargar as cargarBiblioteca, aforismo, formatear, buscar, bloqueFuente, AVISO_FUENTE } from "./biblioteca.mjs"

const LIMITE = 3900
const base = (() => {
  const o = process.env.TELEGRAM_API_BASE
  return o && o.startsWith("http://127.0.0.1") ? o : "https://api.telegram.org"
})()


const MAX_ARCHIVO = 20 * 1024 * 1024 // limite de descarga de Telegram para bots
const MAX_DOCX_XML = 8 * 1024 * 1024 // tope al descomprimir (evita bombas zip)
const PERMITIDAS = new Set([".pdf", ".txt", ".md", ".csv", ".json", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".gif"])
export function nombreSeguro(nombre) {
  const limpio = String(nombre || "archivo").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 80) || "archivo"
  return limpio
}
export function extensionPermitida(nombre) {
  const e = path.extname(String(nombre || "")).toLowerCase()
  return PERMITIDAS.has(e) ? e : undefined
}
// Lee solo word/document.xml de un .docx (zip) con su propio lector: sin ejecutar nada, sin macros, con tope de tamano.
export function extraerDocx(buf) {
  let fin = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break }
  if (fin < 0) throw new Error("No parece un .docx valido")
  const n = buf.readUInt16LE(fin + 10)
  let p = buf.readUInt32LE(fin + 16)
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const metodo = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const lnom = buf.readUInt16LE(p + 28), lextra = buf.readUInt16LE(p + 30), lcom = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nombre = buf.toString("utf8", p + 46, p + 46 + lnom)
    p += 46 + lnom + lextra + lcom
    if (nombre !== "word/document.xml") continue
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const datos = buf.subarray(ini, ini + csize)
    const xml = (metodo === 0 ? datos : zlib.inflateRawSync(datos, { maxOutputLength: MAX_DOCX_XML })).toString("utf8")
    return xml
      .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
      .trim()
  }
  throw new Error("El .docx no tiene word/document.xml")
}

export function trocear(texto, n = LIMITE) {
  const partes = []
  let resto = String(texto ?? "")
  while (resto.length > n) {
    let corte = resto.lastIndexOf("\n", n)
    if (corte < n / 2) corte = n
    partes.push(resto.slice(0, corte))
    resto = resto.slice(corte).replace(/^\n/, "")
  }
  if (resto.length || partes.length === 0) partes.push(resto)
  return partes
}
const recorta = (s, n) => (String(s).length > n ? String(s).slice(0, n) + "..." : String(s))

export function textoDeMensaje(m) {
  const salida = []
  for (const parte of m.content ?? []) {
    if (parte.type === "text" && parte.text?.trim()) salida.push(parte.text.trim())
    else if (parte.type === "tool") {
      const estado = parte.state?.status ?? "?"
      const entrada = parte.state?.input && typeof parte.state.input === "object" ? JSON.stringify(parte.state.input) : ""
      salida.push(`[herramienta ${parte.name}: ${estado}${entrada ? " " + recorta(entrada, 160) : ""}]`)
    }
  }
  return salida.join("\n")
}

export async function crearPuente({ token, permitido, proyecto, contrasena, servidor = URL_SERVIDOR, estadoSesion, guardarSesion, modoInicial = "asistente", guardarModo, releerContrasena, recibidos = path.join(dir, "recibidos"), espera = 1000, tope = 10 * 60 * 1000, log = console.log }) {
  let auth = "Basic " + Buffer.from("opencode:" + contrasena).toString("base64")
  const tg = async (metodo, cuerpo = {}, aborta) => {
    const r = await fetch(`${base}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: aborta,
    })
    const j = await r.json().catch(() => ({}))
    if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`)
    return j.result
  }
  const api = async (metodo, ruta, cuerpo, reintento = true) => {
    const r = await fetch(servidor + ruta, {
      method: metodo,
      headers: { authorization: auth, "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    if (r.status === 401 && reintento && releerContrasena) {
      // El servidor se reinicio y genero otra contrasena: la relee del archivo cifrado y reintenta una vez.
      const nueva = releerContrasena()
      if (nueva) {
        auth = "Basic " + Buffer.from("opencode:" + nueva).toString("base64")
        return api(metodo, ruta, cuerpo, false)
      }
    }
    if (r.status === 204) return {}
    const t = await r.text()
    let j
    try { j = t ? JSON.parse(t) : {} } catch { j = { raw: t } }
    if (!r.ok) {
      const e = new Error(`Servidor ${metodo} ${ruta}: ${r.status}`)
      e.status = r.status
      e.cuerpo = j
      throw e
    }
    return j
  }
  const enviar = async (texto, extra = {}) => {
    let ultimo
    for (const parte of trocear(texto)) ultimo = await tg("sendMessage", { chat_id: permitido, text: parte, ...extra })
    return ultimo
  }

  const archivos = new Map() // clave -> {ruta, nombre, texto}
  async function recibirArchivo(m) {
    const doc = m.document
    const foto = m.photo?.[m.photo.length - 1]
    const nombreOrig = doc?.file_name ?? (foto ? "foto.jpg" : "archivo")
    const ext = extensionPermitida(nombreOrig)
    if (!ext) return enviar(`No acepto ese tipo de archivo (${path.extname(nombreOrig) || "sin extension"}). Acepto: ${[...PERMITIDAS].join(" ")}.`)
    const tam = doc?.file_size ?? foto?.file_size ?? 0
    if (tam > MAX_ARCHIVO) return enviar("Telegram solo deja descargar a los bots archivos de hasta 20 MB. Este es mas grande.")
    const info = await tg("getFile", { file_id: doc?.file_id ?? foto.file_id })
    const r = await fetch(`${base}/file/bot${token}/${info.file_path}`)
    if (!r.ok) throw new Error("No se pudo descargar el archivo")
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > MAX_ARCHIVO) return enviar("El archivo supera 20 MB.")
    fs.mkdirSync(recibidos, { recursive: true })
    const nombre = Date.now().toString(36) + "-" + nombreSeguro(nombreOrig)
    const ruta = path.join(recibidos, nombre)
    fs.writeFileSync(ruta, buf, { mode: 0o600 })
    let adjunto = ruta
    let nota = ""
    if (ext === ".docx") {
      try {
        const texto = extraerDocx(buf)
        adjunto = ruta + ".txt"
        fs.writeFileSync(adjunto, texto, { mode: 0o600 })
        nota = ` Texto extraido del DOCX: ${texto.length} caracteres (sin imagenes ni tablas complejas).`
      } catch (e) {
        return enviar("No pude leer ese .docx: " + e.message)
      }
    }
    const clave = String(++contador)
    archivos.set(clave, { ruta: adjunto, nombre: nombreOrig, original: ruta, leyenda: m.caption })
    await enviar(
      `Recibido "${nombreOrig}" (${Math.round(buf.length / 1024)} KB). Guardado en tu PC, en una carpeta de recibidos. Todavia NO se ha enviado a ningun modelo.${nota}\nAnalizarlo lo envia al proveedor del modelo (nube).`,
      { reply_markup: { inline_keyboard: [[{ text: "Analizar ahora", callback_data: "f:a:" + clave }, { text: "Solo guardar", callback_data: "f:g:" + clave }, { text: "Borrar", callback_data: "f:d:" + clave }]] } },
    )
  }
  let sesion = estadoSesion
  let modo = modoInicial === "gracian" ? "gracian" : "asistente"
  const modoAplicado = new Map() // sesion -> modo ya aplicado en el servidor
  const pendientes = new Map() // clave corta -> {sesion, id}
  const avisados = new Set()
  const listado = []
  let contador = 0
  let ocupado = false
  let cola = Promise.resolve()

  async function asegurarSesion() {
    try {
      await api("GET", `/api/session/${sesion}`)
    } catch (e) {
      if (e.status !== 404) throw e
      await api("POST", "/api/session", { id: sesion, location: { directory: proyecto } })
      log("Sesion creada:", sesion)
    }
  }
  async function permisos() {
    const r = await api("GET", `/api/session/${sesion}/permission`)
    return r.data ?? []
  }
  async function preguntarPermisos() {
    for (const p of await permisos()) {
      if (avisados.has(p.id)) continue
      avisados.add(p.id)
      const clave = String(++contador)
      pendientes.set(clave, { sesion, id: p.id })
      const meta = p.metadata && Object.keys(p.metadata).length ? "\n" + recorta(JSON.stringify(p.metadata), 600) : ""
      await enviar(
        `OpenCode pide permiso\nAccion: ${p.action}\nRecursos: ${recorta((p.resources ?? []).join(", "), 600)}${p.message ? "\n" + recorta(p.message, 400) : ""}${meta}`,
        { reply_markup: { inline_keyboard: [[{ text: "Permitir una vez", callback_data: "p:o:" + clave }, { text: "Rechazar", callback_data: "p:r:" + clave }]] } },
      )
    }
  }
  async function activa() {
    const r = await api("GET", "/api/session/active")
    return Boolean(r.data?.[sesion])
  }

  // Cambia el agente de la sesion (misma sesion, misma memoria). No llama al modelo.
  async function aplicarModo() {
    if (modoAplicado.get(sesion) === modo) return
    await api("POST", `/api/session/${sesion}/agent`, { agent: modo === "gracian" ? "gracian" : "asistente" })
    modoAplicado.set(sesion, modo)
  }

  async function turno(texto, archivosPrompt) {
    await asegurarSesion()
    try {
      await aplicarModo()
    } catch (e) {
      await enviar("No pude cambiar al modo " + (modo === "gracian" ? "Gracian" : "asistente") + " (" + (e.status ?? e.message) + "). No envie tu mensaje al modelo.")
      return
    }
    let textoEnviado = texto
    if (modo === "gracian") {
      try {
        textoEnviado = texto + bloqueFuente(texto)
      } catch (e) {
        await enviar("No pude leer la biblioteca de Gracian (" + e.message + "). No envie tu mensaje al modelo.")
        return
      }
    }
    const estabaActiva = await activa()
    const antes = await api("GET", `/api/session/${sesion}/message?limit=1&order=desc`)
    const ultimoAntes = antes.data?.[0]?.id
    const admitido = await api("POST", `/api/session/${sesion}/prompt`, { text: textoEnviado, ...(archivosPrompt ? { files: archivosPrompt } : {}), ...(estabaActiva ? { delivery: "queue" } : {}) })
    if (estabaActiva) {
      await enviar("Ya estaba trabajando; tu mensaje queda en cola.")
      return
    }
    const inicio = Date.now()
    let quietas = 0
    while (Date.now() - inicio < tope) {
      await new Promise((r) => setTimeout(r, espera))
      await preguntarPermisos()
      if (await activa()) { quietas = 0; continue }
      quietas++
      if (quietas >= 2) break
    }
    if (quietas < 2) {
      await enviar("Sigue trabajando. Usa /estado para ver, /parar para interrumpir.")
      return
    }
    const r = await api("GET", `/api/session/${sesion}/message?limit=40&order=desc`)
    const nuevos = []
    for (const m of r.data ?? []) {
      if (m.id === admitido.data?.id || m.id === ultimoAntes) break
      if (m.type === "assistant") nuevos.unshift(m)
    }
    const texto2 = nuevos.map(textoDeMensaje).filter(Boolean).join("\n\n")
    await enviar(texto2 || "(sin texto de respuesta)")
  }

  async function comando(t) {
    const [c, ...resto] = t.trim().split(/\s+/)
    if (c === "/estado") {
      const info = await api("GET", "/api/info")
      const p = await permisos().catch(() => [])
      await enviar(`Servidor activo (version ${info.version}).\nSesion: ${sesion}\nModo: ${modo === "gracian" ? "Gracian" : "asistente normal"}\nTrabajando: ${(await activa()) ? "si" : "no"}\nPermisos pendientes: ${p.length}`)
      return true
    }
    if (c === "/parar") {
      const r = await api("POST", `/api/session/${sesion}/interrupt`)
      await enviar(r.interrupted ? "Interrumpido." : "No habia nada en ejecucion.")
      return true
    }
    if (c === "/sesiones") {
      const r = await api("GET", `/api/session?limit=8&order=desc&directory=${encodeURIComponent(proyecto)}`)
      listado.length = 0
      const filas = []
      for (const s of r.data ?? []) {
        listado.push(s.id)
        filas.push([{ text: `${listado.length}. ${recorta(s.title ?? s.id, 40)}${s.id === sesion ? " (actual)" : ""}`, callback_data: "u:" + (listado.length - 1) }])
      }
      await enviar(filas.length ? "Sesiones recientes de esta carpeta. Elige una:" : "No hay sesiones en esta carpeta.", filas.length ? { reply_markup: { inline_keyboard: filas } } : {})
      return true
    }
    if (c === "/nueva") {
      const id = "ses_tg_" + Date.now().toString(36)
      await api("POST", "/api/session", { id, location: { directory: proyecto } })
      sesion = id
      guardarSesion?.(id)
      await enviar("Sesion nueva creada y activa. Se usara tambien al abrir la terminal conectada.")
      return true
    }
    if (c === "/gracian" || c === "/asistente") {
      const nuevo = c === "/gracian" ? "gracian" : "asistente"
      if (nuevo === "gracian") {
        try { cargarBiblioteca() } catch (e) { await enviar("No puedo activar Gracian: " + e.message); return true }
      }
      const anterior = modo
      modo = nuevo
      try {
        await asegurarSesion()
        await aplicarModo()
      } catch (e) {
        modo = anterior
        await enviar("No pude cambiar de modo (" + (e.status ?? e.message) + "). Si acabas de actualizar, cierra y abre Servidor.cmd.")
        return true
      }
      guardarModo?.(modo)
      await enviar(nuevo === "gracian"
        ? "Modo Gracian activo, en la misma conversacion y con tu misma memoria. Citare a Gracian solo con texto de la biblioteca y distinguire su texto de la lectura actual. /aforismo N y /buscar tema consultan sin usar el modelo. /asistente vuelve al asistente normal."
        : "Vuelves al asistente normal. La memoria y la conversacion siguen siendo las mismas.")
      return true
    }
    if (c === "/aforismo") {
      const n = Number(resto[0])
      let d
      try { d = cargarBiblioteca() } catch (e) { await enviar("No puedo leer la biblioteca: " + e.message); return true }
      if (!Number.isInteger(n) || n < 1 || n > 300) { await enviar("Escribe /aforismo y un numero del 1 al 300. Esta consulta no usa el modelo."); return true }
      await enviar(formatear(aforismo(n, d)) + "\n\n" + AVISO_FUENTE)
      return true
    }
    if (c === "/buscar") {
      const consulta = resto.join(" ")
      let d
      try { d = cargarBiblioteca() } catch (e) { await enviar("No puedo leer la biblioteca: " + e.message); return true }
      const r = buscar(consulta, 5, d)
      await enviar(!consulta ? "Escribe /buscar y un tema, por ejemplo /buscar reputacion. Esta consulta no usa el modelo." : r.length ? "Coincidencias por palabras (no por significado):\n" + r.map((a) => `${a.n}. ${recorta(a.texto, 110)}`).join("\n") + "\nUsa /aforismo N para ver uno completo." : "No encontre aforismos con esas palabras. Prueba con otras o con la raiz de la palabra.")
      return true
    }
    if (c === "/ayuda" || c === "/start") {
      await enviar("Escribe y respondo con tu OpenCode (misma memoria y archivos).\n/estado /parar /sesiones /nueva\n/gracian (voz de Gracian) /asistente (normal) /aforismo N /buscar tema\nPuedes enviar PDF, DOCX, TXT, MD, CSV, JSON o imagenes (hasta 20 MB): se guardan en tu PC y solo se envian al modelo si pulsas Analizar.\nLas acciones delicadas piden permiso aqui con botones. Por ahora solo texto.")
      return true
    }
    return false
  }

  async function alActualizar(u) {
    if (u.callback_query) {
      const q = u.callback_query
      if (q.from?.id !== permitido) return
      const [tipo, a, b] = String(q.data).split(":")
      await tg("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {})
      if (tipo === "p") {
        const p = pendientes.get(b)
        if (!p) return enviar("Ese permiso ya no esta pendiente.")
        pendientes.delete(b)
        try {
          await api("POST", `/api/session/${p.sesion}/permission/${p.id}/reply`, { decision: a === "o" ? "once" : "reject" })
          await enviar(a === "o" ? "Permitido una vez." : "Rechazado.")
        } catch (e) {
          await enviar("No se pudo responder (quiza ya se resolvio en otro sitio): " + (e.status ?? e.message))
        }
      } else if (tipo === "f") {
        const f = archivos.get(b)
        if (!f) return enviar("Ese archivo ya no esta pendiente.")
        archivos.delete(b)
        if (a === "d") {
          for (const x of new Set([f.ruta, f.original])) fs.rmSync(x, { force: true })
          return enviar("Borrado de tu PC.")
        }
        if (a === "g") return enviar("Guardado sin enviarlo a ningun modelo: " + f.original)
        const texto = f.leyenda?.trim() || "Analiza este documento y dime lo esencial."
        cola = cola.then(() => turno(texto, [{ uri: pathToFileURL(f.ruta).href, name: f.nombre }])).catch((e) => enviar("Error: " + (e.message ?? e)).catch(() => {}))
      } else if (tipo === "u") {
        const id = listado[Number(a)]
        if (!id) return
        sesion = id
        guardarSesion?.(id)
        await enviar("Sesion activa: " + id)
      }
      return
    }
    const m = u.message
    if (!m || m.from?.id !== permitido || m.chat?.type !== "private") return
    if (m.document || m.photo) return recibirArchivo(m).catch((e) => enviar("Error con el archivo: " + e.message))
    if (typeof m.text !== "string") return enviar("Por ahora entiendo texto, documentos e imagenes.")
    if (m.text.startsWith("/") && (await comando(m.text))) return
    cola = cola.then(() => turno(m.text)).catch((e) => enviar("Error: " + (e.message ?? e)).catch(() => {}))
  }

  async function arrancar(senal) {
    const yo = await tg("getMe")
    const wh = await tg("getWebhookInfo")
    if (wh.url) throw new Error(`El bot @${yo.username} tiene un webhook activo (${new URL(wh.url).host}). No lo toco: usa otro bot o decide quitar ese webhook.`)
    await api("GET", "/api/info")
    await asegurarSesion()
    log(`Bot @${yo.username} listo. Sesion: ${sesion}. Solo responde al ID ${permitido}.`)
    await preguntarPermisos().catch(() => {})
    let offset = 0
    while (!senal?.aborted) {
      let lote
      try {
        lote = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, senal)
      } catch (e) {
        if (senal?.aborted) break
        log("Telegram:", e.message)
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      for (const u of lote) {
        offset = u.update_id + 1
        alActualizar(u).catch((e) => log("Error:", e.message))
      }
    }
  }
  return { arrancar, alActualizar, turno, get sesion() { return sesion } }
}

if (import.meta.main) {
  try {
    comprobarInstalacion()
    const cfg = leerJson(path.join(dir, "config.json"), null)
    const token = leerSecreto("telegram")
    const contrasena = leerSecreto("servidor")
    if (!cfg?.usuarioTelegram || !token) throw new Error("Falta configurar Telegram: abre ConfigurarTelegram.cmd")
    if (!contrasena) throw new Error("Primero abre Servidor.cmd y deja esa ventana abierta.")
    const proyecto = carpetaProyecto(cfg.proyecto)
    const p = await crearPuente({
      token,
      permitido: Number(cfg.usuarioTelegram),
      proyecto,
      contrasena,
      estadoSesion: sesionActual(proyecto),
      guardarSesion: recordarSesion,
      modoInicial: modoActual(),
      guardarModo: recordarModo,
      releerContrasena: () => leerSecreto("servidor"),
    })
    await p.arrancar()
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
