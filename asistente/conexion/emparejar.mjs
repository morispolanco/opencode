// Vincula tu cuenta de Telegram con el bot SIN que tengas que buscar tu ID ni usar bots de terceros.
// Muestra un codigo aleatorio en ESTA ventana; tu lo escribes al bot en un chat privado; solo con ese codigo se guarda tu ID.
// No arranca el servidor de OpenCode ni llama a ningun modelo. No modifica webhooks (si hay uno, se niega).
import path from "node:path"
import fs from "node:fs"
import crypto from "node:crypto"
import { dir, leerJson, leerSecreto } from "./comun.mjs"

const baseDefecto = (() => {
  const o = process.env.TELEGRAM_API_BASE
  return o && o.startsWith("http://127.0.0.1") ? o : "https://api.telegram.org"
})()

export function nuevoCodigo(azar = crypto.randomInt) {
  return String(azar(0, 100000000)).padStart(8, "0")
}
const normaliza = (t) => String(t ?? "").replace(/[\s-]+/g, "")
export function coincide(texto, codigo) {
  const a = Buffer.from(normaliza(texto))
  const b = Buffer.from(codigo)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Devuelve { id } si se vinculo; lanza Error si caduca, se agotan los intentos o hay webhook.
export async function emparejar({ token, base = baseDefecto, codigo = nuevoCodigo(), ttl = 5 * 60 * 1000, maxIntentos = 5, ahora = () => Date.now(), guardar, mostrar = console.log, espera = 25 }) {
  const tg = async (metodo, cuerpo = {}) => {
    const r = await fetch(`${base}/bot${token}/${metodo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
    const j = await r.json().catch(() => ({}))
    if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`)
    return j.result
  }
  const yo = await tg("getMe")
  const wh = await tg("getWebhookInfo")
  if (wh.url) throw new Error(`El bot @${yo.username} tiene un webhook activo (${new URL(wh.url).host}). No lo toco: usa otro bot.`)
  // Descarta mensajes anteriores: un mensaje viejo nunca puede vincular.
  let offset = 0
  const previos = await tg("getUpdates", { offset: -1, timeout: 0 })
  if (previos.length) offset = previos[previos.length - 1].update_id + 1
  const inicio = ahora()
  const limite = inicio + ttl
  mostrar(`Bot @${yo.username}. Escribele en un chat PRIVADO este codigo (vale ${Math.round(ttl / 60000)} min, un solo uso, ${maxIntentos} intentos):`)
  mostrar("")
  mostrar("    " + codigo.slice(0, 4) + "-" + codigo.slice(4))
  mostrar("")
  let intentos = 0
  while (ahora() < limite) {
    const lote = await tg("getUpdates", { offset, timeout: espera, allowed_updates: ["message"] })
    for (const u of lote) {
      offset = u.update_id + 1
      const m = u.message
      if (!m || m.chat?.type !== "private" || !Number.isInteger(m.from?.id) || m.from.is_bot) continue
      if (typeof m.date === "number" && m.date * 1000 < Math.floor(inicio / 1000) * 1000) continue // anterior a mostrar el codigo
      if (ahora() >= limite) break
      if (typeof m.text === "string" && coincide(m.text, codigo)) {
        guardar(m.from.id)
        await tg("getUpdates", { offset, timeout: 0 }) // confirma la lectura: este mensaje no llegara al puente
        await tg("sendMessage", { chat_id: m.from.id, text: "Vinculado. Ya puedes cerrar la ventana de emparejamiento." }).catch(() => {})
        return { id: m.from.id }
      }
      intentos++
      if (intentos >= maxIntentos) throw new Error("Demasiados intentos incorrectos. Cierra y vuelve a abrir Emparejar.cmd para un codigo nuevo.")
    }
  }
  throw new Error("El codigo caduco. Vuelve a abrir Emparejar.cmd para uno nuevo.")
}

export function guardarId(id) {
  const archivo = path.join(dir, "config.json")
  const cfg = leerJson(archivo, {})
  cfg.usuarioTelegram = String(id)
  const tmp = archivo + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8")
  fs.renameSync(tmp, archivo)
}

if (import.meta.main) {
  try {
    const token = leerSecreto("telegram")
    if (!token) throw new Error("Falta el token: abre ConfigurarTelegram.cmd primero.")
    const r = await emparejar({ token, guardar: guardarId })
    console.log("Listo: tu cuenta quedo vinculada (ID " + r.id + ").")
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
