import { expect, test } from "bun:test"
import { permissionPresentation } from "../../src/util/permission"

test("preserves permission roots and self-contained metadata", () => {
  expect(permissionPresentation({ action: "external_directory", resources: ["/*"] }).title).toBe(
    "Access external directory /",
  )
  expect(permissionPresentation({ action: "external_directory", resources: ["C:/*"] }).title).toBe(
    "Access external directory C:/",
  )
  expect(
    permissionPresentation({ action: "webfetch", resources: [], metadata: { url: "https://example.com" } }),
  ).toMatchObject({
    title: "WebFetch https://example.com",
    lines: ["URL: https://example.com"],
  })
  expect(permissionPresentation({ action: "websearch", resources: [], metadata: { query: "releases" } })).toMatchObject(
    {
      title: 'Web Search "releases"',
      lines: ["Query: releases"],
    },
  )
})

test("memory writes show the full note and how to reject", () => {
  const note = "Guardar en memoria (global): " + "x".repeat(900)
  const result = permissionPresentation({ action: "memory_write", resources: [note] })
  expect(result.title).toBe("Change personal memory")
  expect(result.lines[0]).toBe("Select Reject to keep your memory unchanged.")
  expect(result.lines[1]).toBe(`- ${note}`)
})
