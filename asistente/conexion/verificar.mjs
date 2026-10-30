// Comprobacion sin cambios: no usa internet, no llama a ningun modelo, no escribe archivos, no lee ni imprime secretos.
// Unica accion sobre el sistema: abre y cierra un instante el puerto local 47831 (solo 127.0.0.1) para ver si esta libre.
// Solo comprueba que esta carpeta es compatible con tu instalacion actual.
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
const dir = path.dirname(fileURLToPath(import.meta.url))
const home = path.dirname(dir)
let fallos = 0
const ok = (m) => console.log("OK     " + m)
const mal = (m) => { fallos++; console.log("FALLA  " + m) }
const aviso = (m) => console.log("AVISO  " + m)
console.log("Carpeta de instalacion: " + home)

const bun = process.versions.bun
bun === "1.4.4" ? ok("Bun 1.4.4") : mal("Se esperaba Bun 1.4.4; se encontro " + (bun ?? "otro motor (usa bun)"))

let meta
try {
  meta = JSON.parse(fs.readFileSync(path.join(home, "installation.json"), "utf8"))
  ok("installation.json legible. Campos: " + Object.keys(meta).join(", "))
} catch {
  mal("No se puede leer installation.json: esta no parece una instalacion de Asistente con memoria")
}

let lib
try {
  lib = await import(pathToFileURL(path.join(home, "launcher", "lib.mjs")).href)
  for (const f of ["environment", "session", "configuration", "validateBudget"]) typeof lib[f] === "function" ? ok("launcher/lib.mjs exporta " + f) : mal("launcher/lib.mjs no exporta " + f)
  typeof lib.COMMIT === "string" ? ok("launcher/lib.mjs exporta COMMIT " + lib.COMMIT.slice(0, 8)) : mal("launcher/lib.mjs no exporta COMMIT")
} catch (e) {
  mal("No se pudo cargar launcher/lib.mjs: " + e.message)
}
if (lib && meta) meta.commit === lib.COMMIT ? ok("installation.json coincide con el commit del lanzador") : mal("installation.json (" + String(meta.commit).slice(0, 8) + ") no coincide con launcher/lib.mjs")

if (lib?.environment) {
  try {
    const e = lib.environment(home, { PATH: "x" })
    path.resolve(e.XDG_DATA_HOME) === path.resolve(home, "data") ? ok("el entorno usa tus carpetas data/config/cache/state de la instalacion") : mal("el entorno no apunta a data de la instalacion")
  } catch (e) { mal("environment() fallo: " + e.message) }
}
if (lib?.configuration) {
  try {
    const c = lib.configuration("openai/gpt-4.1-mini")
    c.permissions?.some((p) => p.action === "*" && p.resource === "*" && p.effect === "ask") ? ok("la configuracion pide aprobacion para todas las acciones (*)") : mal("la configuracion NO pide aprobacion para todo: no uses Telegram hasta revisarlo")
  } catch (e) { mal("configuration() fallo: " + e.message) }
}

const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path.join(home, "source"), encoding: "utf8" })
if (git.status === 0 && lib?.COMMIT) git.stdout.trim() === lib.COMMIT ? ok("source esta en el commit esperado") : mal("source esta en otro commit: " + git.stdout.trim().slice(0, 8))
else aviso("No se pudo leer el commit de source con git (git ausente o no es un checkout)")
for (const f of ["packages/cli/src/index.ts", "packages/cli/src/commands/handlers/serve.ts", "packages/cli/src/server-process.ts", "packages/cli/src/services/server-connection.ts"]) {
  fs.existsSync(path.join(home, "source", f)) ? ok("existe source/" + f) : mal("falta source/" + f + " (el comando serve o --server no estaria disponible)")
}
fs.existsSync(path.join(home, "settings.json")) ? ok("settings.json presente") : mal("falta settings.json: abre Configurar.cmd")
if (process.platform === "win32") fs.existsSync(path.join(home, "openrouter.dpapi")) ? ok("openrouter.dpapi presente (no se lee)") : mal("falta openrouter.dpapi: abre Configurar.cmd")
for (const f of ["comun.mjs", "servidor.mjs", "puente.mjs", "abrir.mjs", "secreto.ps1", "configurar-telegram.ps1", "emparejar.mjs", "biblioteca.mjs"]) fs.existsSync(path.join(dir, f)) ? null : mal("falta conexion/" + f)
try {
  const b = await import(pathToFileURL(path.join(dir, "biblioteca.mjs")).href)
  const d = b.cargar()
  ok("biblioteca de Gracian: " + d.aforismos.length + " aforismos, numeracion 1-300 correcta")
  const c = await import(pathToFileURL(path.join(dir, "comun.mjs")).href)
  const cfg = c.conGracian(lib.configuration("openai/gpt-4.1-mini"))
  cfg.agents?.gracian && cfg.agents?.asistente && cfg.permissions?.some((p) => p.action === "*" && p.resource === "*" && p.effect === "ask") && cfg.model === lib.configuration("openai/gpt-4.1-mini").model
    ? ok("el agente Gracian existe, hereda tus permisos (todo con aprobacion) y no cambia el modelo")
    : mal("la configuracion de Gracian no es la esperada")
} catch (e) { mal("biblioteca o configuracion de Gracian: " + e.message) }
fs.existsSync(path.join(home, "launcher", "secret.ps1")) ? ok("launcher/secret.ps1 presente") : mal("falta launcher/secret.ps1")

const libre = await new Promise((res) => {
  const s = net.createServer()
  s.once("error", () => res(false))
  s.listen(47831, "127.0.0.1", () => s.close(() => res(true)))
})
libre ? ok("el puerto local 47831 esta libre") : mal("el puerto local 47831 esta ocupado (otro servidor ya en marcha?)")
console.log(fallos ? `\n${fallos} problema(s). No arranques nada hasta resolverlos.` : "\nTodo compatible. Esta comprobacion no cambio ningun archivo (solo abrio un instante el puerto local).")
process.exitCode = fallos ? 1 : 0
