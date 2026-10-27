export * as MemoryPlugin from "./memory.js"

import { SystemPart } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import {
  GLOBAL,
  KINDS,
  MAX_ENTRIES,
  PREFIX,
  buildBlock,
  makeEntry,
  newId,
  search,
  validateText,
  visible,
  type Entry,
  type Kind,
} from "./memory-store.js"

const KindSchema = Schema.Literals(KINDS as unknown as [Kind, ...Kind[]])

/**
 * Personal, cross-session memory. Entries live in plugin storage (the global OpenCode database, namespaced to this
 * plugin), so they persist across sessions and folders. Each entry is global or tied to one project directory.
 * Every change (save, edit, forget) asks the user for approval first, so the model cannot write memory on its own
 * authority (for example from text read on a web page). Options: { enabled: false } disables the plugin;
 * { confirmWrites: false } skips the approval prompt.
 */
export const Plugin = define({
  id: "opencode.memory",
  effect: Effect.fn(function* (ctx) {
    if (ctx.options.enabled === false) return
    const project = ctx.location.project.canonical as string

    const load = Effect.fn(function* () {
      const entries: Entry[] = []
      let after: string | undefined
      for (let page = 0; page < 20; page++) {
        const result = yield* ctx.storage.scan({ prefix: PREFIX, after, limit: 500 })
        for (const item of result.entries) entries.push(item.value as unknown as Entry)
        if (result.next === undefined) break
        after = result.next
      }
      return entries
    })
    const text = (content: string) => ({ content })
    const confirm = (
      context: { readonly sessionID: any; readonly agent: any; readonly messageID: string; readonly id: string },
      summary: string,
    ) =>
      ctx.options.confirmWrites === false
        ? Effect.void
        : ctx.permission.assert({
            sessionID: context.sessionID,
            agent: context.agent,
            action: "memory_write",
            resources: [summary],
            source: { type: "tool", messageID: context.messageID, id: context.id },
          })

    // The default agents allow every action that has no rule, so an unmarked "memory_write" would pass without a
    // prompt. Turn an allow into an ask for memory writes. A deny stays a deny, and { confirmWrites: false } opts out.
    if (ctx.options.confirmWrites !== false) {
      yield* ctx.permission.hook("evaluate", (event) =>
        Effect.sync(() => {
          if (event.action === "memory_write" && event.effect === "allow") event.effect = "ask"
        }),
      )
    }

    yield* ctx.tool.transform((editor) => {
      editor.add({
        name: "memory_save",
        description:
          "Guarda una nota duradera en la memoria personal del usuario (preferencia, dato, decisión o pendiente). Úsala solo cuando el usuario lo pida o exprese algo claramente duradero sobre sí mismo o su trabajo. Por defecto queda ligada al proyecto actual; usa global=true solo si el usuario quiere que valga en todas partes. Nunca guardes claves, contraseñas ni datos privados de terceros.",
        input: Schema.Struct({
          text: Schema.String,
          kind: Schema.optional(KindSchema),
          global: Schema.optional(Schema.Boolean),
        }),
        execute: Effect.fn(function* (input, context) {
          const valid = validateText(input.text)
          if (!valid.ok) return text(valid.reason)
          yield* confirm(context, `Guardar en memoria${input.global ? " (global)" : ""}: ${valid.text}`)
          const entries = yield* load()
          if (entries.length >= MAX_ENTRIES) return text(`Memoria llena (${MAX_ENTRIES}). Borra algo con memory_forget.`)
          const id = newId()
          const entry = makeEntry({ text: valid.text, kind: input.kind, global: input.global, source: "model" }, project, id, Date.now())
          yield* ctx.storage.set(PREFIX + id, entry as unknown as Schema.Json)
          return text(`Guardado [${id}] (${entry.scope === GLOBAL ? "global" : "este proyecto"}).`)
        }),
      })
      editor.add({
        name: "memory_search",
        description: "Busca en la memoria personal del usuario (globales y del proyecto actual).",
        input: Schema.Struct({ query: Schema.String }),
        execute: Effect.fn(function* (input) {
          const found = search(yield* load(), input.query, project)
          return text(found.length ? found.map((e) => `[${e.id}] (${e.kind}, ${e.scope === GLOBAL ? "global" : "proyecto"}) ${e.text}`).join("\n") : "Sin resultados.")
        }),
      })
      editor.add({
        name: "memory_list",
        description: "Lista la memoria personal visible aquí (globales y del proyecto actual) con sus ids.",
        input: Schema.Struct({}),
        execute: Effect.fn(function* () {
          const all = visible(yield* load(), project)
          return text(all.length ? all.map((e) => `[${e.id}] (${e.kind}, ${e.scope === GLOBAL ? "global" : "proyecto"}) ${e.text}`).join("\n") : "La memoria está vacía.")
        }),
      })
      editor.add({
        name: "memory_edit",
        description: "Corrige el texto de una nota de memoria por su id. Úsala cuando el usuario corrija algo guardado.",
        input: Schema.Struct({ id: Schema.String, text: Schema.String }),
        execute: Effect.fn(function* (input, context) {
          const valid = validateText(input.text)
          if (!valid.ok) return text(valid.reason)
          const current = (yield* ctx.storage.get(PREFIX + input.id)) as unknown as Entry | undefined
          if (!current || (current.scope !== GLOBAL && current.scope !== project)) return text("No existe esa nota aquí.")
          yield* confirm(context, `Cambiar nota ${input.id} a: ${valid.text}`)
          yield* ctx.storage.set(PREFIX + input.id, { ...current, text: valid.text, updated: Date.now() } as unknown as Schema.Json)
          return text(`Actualizado [${input.id}].`)
        }),
      })
      editor.add({
        name: "memory_forget",
        description: "Borra una nota de memoria por su id. Úsala cuando el usuario pida olvidar algo.",
        input: Schema.Struct({ id: Schema.String }),
        execute: Effect.fn(function* (input, context) {
          const current = (yield* ctx.storage.get(PREFIX + input.id)) as unknown as Entry | undefined
          if (!current || (current.scope !== GLOBAL && current.scope !== project)) return text("No existe esa nota aquí.")
          yield* confirm(context, `Borrar nota ${input.id}: ${current.text}`)
          yield* ctx.storage.remove(PREFIX + input.id)
          return text(`Borrado [${input.id}].`)
        }),
      })
    })

    yield* ctx.session.hook("context", (event) =>
      Effect.gen(function* () {
        const block = buildBlock(yield* load(), project)
        if (block) event.system.push(SystemPart.make(block))
      }),
    )
  }),
})
