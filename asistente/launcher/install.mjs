import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { COMMIT, REPO } from "./lib.mjs"
const root = path.dirname(fileURLToPath(import.meta.url))
const target = path.resolve(
  process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME, "Asistente con memoria"),
)
function run(cmd, args, cwd) {
  const env = { ...process.env }
  env.HUSKY = "0"
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit" })
  if (r.error || r.status !== 0) throw new Error("Fallo " + cmd + "; no se marco como instalado.")
}
try {
  run("git", ["--version"])
  const bv = spawnSync("bun", ["--version"], { encoding: "utf8" })
  if (bv.status !== 0 || bv.stdout.trim() !== "1.4.4")
    throw new Error("Se requiere Bun 1.4.4 para esta version. No se instalo nada.")
  if (fs.existsSync(target)) throw new Error("El destino ya existe. Elige otra carpeta; no se sobrescribiran datos.")
  fs.mkdirSync(target, { recursive: true })
  const source = path.join(target, "source")
  fs.mkdirSync(source)
  run("git", ["init", source])
  run("git", ["remote", "add", "origin", REPO], source)
  run("git", ["fetch", "--depth", "1", "origin", COMMIT], source)
  run("git", ["checkout", "--detach", COMMIT], source)
  const actual = spawnSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).stdout?.trim()
  if (actual !== COMMIT) throw new Error("Version inesperada")
  run("bun", ["install", "--frozen-lockfile"], source)
  run("bun", ["run", "--cwd", "packages/cli", "src/index.ts", "--help"], source)
  fs.cpSync(root, path.join(target, "launcher"), { recursive: true })
  fs.mkdirSync(path.join(target, "workspace"), { recursive: true })
  fs.writeFileSync(
    path.join(target, "installation.json"),
    JSON.stringify(
      { commit: COMMIT, bun: spawnSync("bun", ["--version"], { encoding: "utf8" }).stdout.trim() },
      null,
      2,
    ),
  )
  fs.copyFileSync(path.join(root, "Abrir.cmd"), path.join(target, "Abrir.cmd"))
  fs.copyFileSync(path.join(root, "Configurar.cmd"), path.join(target, "Configurar.cmd"))
  console.log(
    "\nInstalado en " +
      target +
      "\nAhora abre Configurar.cmd (Windows) y despues Abrir.cmd. No se ha conectado ningun modelo.",
  )
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
