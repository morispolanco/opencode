// Abre la terminal como cliente del servidor unico, en la misma sesion que usa Telegram.
import path from "node:path"
import { spawn } from "node:child_process"
import {
  home, URL_SERVIDOR, comprobarInstalacion, entornoServidor, leerSecreto, carpetaProyecto, sesionActual,
} from "./comun.mjs"
try {
  comprobarInstalacion()
  const { env } = entornoServidor()
  const contrasena = leerSecreto("servidor")
  if (!contrasena) throw new Error("Primero abre Servidor.cmd y deja esa ventana abierta.")
  const proyecto = carpetaProyecto(process.argv[2])
  env.OPENCODE_PASSWORD = contrasena
  const child = spawn(
    "bun",
    ["run", "--cwd", path.join(home, "source", "packages", "cli"), "src/index.ts", proyecto, "--server", URL_SERVIDOR, "--session", sesionActual(proyecto)],
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
