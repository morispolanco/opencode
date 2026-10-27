import { test } from "bun:test"
import assert from "node:assert/strict"
import { GLOBAL, buildBlock, looksSecret, makeEntry, search, validateText, visible } from "../../src/plugin/memory-store.js"

const A = "/home/u/proyectoA"
const B = "/home/u/proyectoB"
const mk = (text: string, scope: "g" | "A" | "B", t = 1, id = text.slice(0, 4)) =>
  makeEntry({ text, global: scope === "g", source: "user" }, scope === "B" ? B : A, id, t)

test("project separation: other projects never visible", () => {
  const all = [mk("prefiero español", "g"), mk("usa pnpm aqui", "A"), mk("usa yarn alla", "B")]
  const seen = visible(all, A).map((e) => e.text)
  assert.deepEqual(seen.sort(), ["prefiero español", "usa pnpm aqui"].sort())
  assert.ok(!buildBlock(all, A)!.includes("yarn"))
  assert.equal(search(all, "yarn", A).length, 0)
  assert.equal(search(all, "yarn", B).length, 1)
})
test("global scope", () => assert.equal(mk("x y z", "g").scope, GLOBAL))
test("secret filter", () => {
  assert.ok(looksSecret("mi token: abcdef123456"))
  assert.ok(looksSecret("sk-abcdefghijklmnopqrstuv"))
  assert.ok(looksSecret("ghp_abcdefghijklmnopqrstuvwxyz"))
  assert.ok(!looksSecret("prefiero respuestas cortas"))
  assert.equal(validateText("password=hunter22222").ok, false)
})
test("validation", () => {
  assert.equal(validateText("   ").ok, false)
  assert.equal(validateText("a".repeat(501)).ok, false)
  assert.deepEqual(validateText("  hola   mundo "), { ok: true, text: "hola mundo" })
})
test("block cap and order", () => {
  const many = Array.from({ length: 200 }, (_, i) => mk(`nota número ${i} ` + "x".repeat(50), "A", i, `i${i}`))
  const block = buildBlock([mk("global primero", "g", 0, "gg"), ...many], A, 1000)!
  assert.ok(block.length <= 1100)
  assert.ok(block.indexOf("global primero") < block.indexOf("nota número"))
  assert.ok(block.includes("memory_search"))
  assert.equal(buildBlock([], A), undefined)
})
test("search ranks and ignores accents", () => {
  const all = [mk("Prefiero la comunicación breve", "g", 1, "a1"), mk("deploy en Vercel", "A", 2, "a2")]
  assert.equal(search(all, "comunicacion", A)[0]!.id, "a1")
  assert.equal(search(all, "zzz", A).length, 0)
})
