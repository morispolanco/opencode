import { test } from "node:test"
import assert from "node:assert/strict"
import { environment, configuration, session, validateBudget } from "../lib.mjs"
test("datos y credenciales heredadas no entran", () => {
  const e = environment("/tmp/new", {
    PATH: "/bin",
    OPENAI_API_KEY: "not-a-key",
    OPENCODE_CONFIG_CONTENT: "other",
    XDG_DATA_HOME: "/other",
    OPENROUTER_API_KEY: "not-a-key",
  })
  assert.equal(e.PATH, "/bin")
  assert.equal(e.OPENAI_API_KEY, undefined)
  assert.equal(e.OPENROUTER_API_KEY, undefined)
  assert.equal(e.OPENCODE_CONFIG_CONTENT, undefined)
  assert.equal(e.XDG_DATA_HOME, "/tmp/new/data")
})
test("solo proveedor elegido y todos los permisos requieren aprobacion", () => {
  const c = configuration("openai/gpt-4.1-mini")
  assert.equal(c.model, "openrouter/openai/gpt-4.1-mini")
  assert.equal(c.share, "disabled")
  assert.equal(c.permissions[0].effect, "ask")
  assert.equal(c.policies[0].effect, "deny")
  assert.equal(c.policies[1].resource, "openrouter")
  assert.equal(c.plugins, undefined)
  assert.throws(() => configuration("invalid"))
})
test("sesion estable y distinta por carpeta", () => {
  assert.equal(session("/tmp/a"), session("/tmp/a"))
  assert.notEqual(session("/tmp/a"), session("/tmp/b"))
})
const mock = (d) => async () => ({ ok: true, json: async () => ({ data: d }) })
test("rechaza sin limite, agotado, BYOK no incluido y errores", async () => {
  for (const d of [
    { limit: null, limit_remaining: 5, include_byok_in_limit: true },
    { limit: 10, limit_remaining: 0, include_byok_in_limit: true },
    { limit: 10, limit_remaining: 2, include_byok_in_limit: false },
  ])
    await assert.rejects(validateBudget("not-a-key", mock(d)))
  await assert.rejects(validateBudget("not-a-key", async () => ({ ok: false })))
})
test("acepta limite propio sin imponer cifra personal", async () => {
  assert.equal(
    (
      await validateBudget(
        "not-a-key",
        mock({ limit: 12, limit_remaining: 11, include_byok_in_limit: true, limit_reset: "monthly" }),
      )
    ).limit,
    12,
  )
})
