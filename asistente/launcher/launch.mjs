import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync, spawn } from "node:child_process"
import { COMMIT, environment, session, configuration, validateBudget } from "./lib.mjs"
const home = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
try {
  const settings = JSON.parse(fs.readFileSync(path.join(home, "settings.json"), "utf8"))
  const meta = JSON.parse(fs.readFileSync(path.join(home, "installation.json"), "utf8"))
  if (meta.commit !== COMMIT) throw new Error("Instalacion no reconocida")
  const actual = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path.join(home, "source"), encoding: "utf8" })
  if (actual.status !== 0 || actual.stdout.trim() !== COMMIT)
    throw new Error("El codigo instalado no coincide con esta version.")
  let key = process.env.ASSISTANT_OPENROUTER_KEY
  if (process.platform === "win32") {
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(home, "launcher", "secret.ps1"), "-Read"],
      { encoding: "utf8", windowsHide: true },
    )
    if (r.status !== 0) throw new Error("No se pudo leer tu clave. Abre Configurar.cmd con el mismo usuario Windows.")
    key = r.stdout.trim()
  }
  if (!key) throw new Error("Falta configurar tu propia clave de OpenRouter")
  const b = await validateBudget(key)
  console.log(
    `Limite de tu clave: USD ${b.limit}; restante: USD ${b.remaining}; reinicio: ${b.reset}. No es una cuota de tokens.`,
  )
  const project = fs.realpathSync(path.resolve(process.argv[2] || path.join(home, "workspace")))
  const env = environment(home)
  env.OPENROUTER_API_KEY = key
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(configuration(settings.model))
  const child = spawn(
    "bun",
    [
      "run",
      "--cwd",
      path.join(home, "source", "packages", "cli"),
      "src/index.ts",
      project,
      "--standalone",
      "--session",
      session(project),
    ],
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
