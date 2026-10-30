// Servidor unico con tu mismo entorno (datos, memoria, sesiones y perfil de la instalacion).
// Solo escucha en 127.0.0.1. La terminal y Telegram son clientes de este servidor.
import path from "node:path"
import { spawn } from "node:child_process"
import {
  home, PUERTO, comprobarInstalacion, clavePropia, entornoServidor, configuration, validateBudget,
  guardarSecreto, nuevaContrasena, conGracian, configuracionServidor,
} from "./comun.mjs"
try {
  comprobarInstalacion()
  const { settings, env } = entornoServidor()
  const key = clavePropia()
  if (process.env.CONEXION_OMITIR_PRESUPUESTO !== "1" || process.platform === "win32") {
    const b = await validateBudget(key)
    console.log(`Limite de tu clave: USD ${b.limit}; restante: USD ${b.remaining}; reinicio: ${b.reset}.`)
  }
  const contrasena = nuevaContrasena()
  guardarSecreto("servidor", contrasena)
  env.OPENROUTER_API_KEY = key
  env.OPENCODE_PASSWORD = contrasena
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(
    process.platform !== "win32" && process.env.CONEXION_CONFIG_PRUEBA ? conGracian(JSON.parse(process.env.CONEXION_CONFIG_PRUEBA)) : configuracionServidor(settings.model),
  )
  if (process.env.CONEXION_PRUEBA === "1" && process.platform !== "win32") {
    env.OPENCODE_DISABLE_MODELS_FETCH = "1"
  }
  console.log(`Servidor en http://127.0.0.1:${PUERTO} (solo este equipo). Cierra esta ventana para detenerlo.`)
  console.log("No abras el Abrir.cmd normal mientras este servidor este en marcha: usa AbrirConectado.cmd.")
  const child = spawn(
    "bun",
    ["run", "--cwd", path.join(home, "source", "packages", "cli"), "src/index.ts", "serve", "--hostname", "127.0.0.1", "--port", String(PUERTO)],
    { cwd: home, env, stdio: "inherit" },
  )
  child.on("error", () => {
    console.error("No se pudo iniciar Bun")
    process.exitCode = 1
  })
  child.on("exit", (code) => process.exit(code ?? 1))
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
