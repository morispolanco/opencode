import { describe, expect } from "bun:test"
import { SystemPart } from "@opencode/ai"
import { Effect } from "effect"
import type { SessionContext } from "@opencode/plugin/effect/session"
import { MemoryPlugin } from "@opencode/core/plugin/memory"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { AbsolutePath } from "@opencode/core/schema"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { Agent } from "@opencode/core/agent"
import { SessionMessage } from "@opencode/core/session/message"
import { Tool } from "@opencode/schema/tool"
import { it } from "../lib/effect"
import { host } from "./host"

const sessionID = Session.ID.make("ses_memory_test")
const loc = (dir: string) =>
  new Location.Info({
    directory: AbsolutePath.make(dir),
    project: { id: Project.ID.global, directory: AbsolutePath.make(dir), canonical: AbsolutePath.make(dir) },
  })

/** One shared in-memory KV, like the real global database: several "folders" use the same store. */
const makeKv = () => {
  const data = new Map<string, any>()
  return {
    data,
    storage: {
      get: (key: string) => Effect.succeed(data.get(key)),
      set: (key: string, value: any) => Effect.sync(() => void data.set(key, value)),
      remove: (key: string) => Effect.sync(() => void data.delete(key)),
      scan: (o: { prefix: string; after?: string; limit?: number }) =>
        Effect.succeed({
          entries: [...data.entries()]
            .filter(([k]) => k.startsWith(o.prefix) && (o.after === undefined || k > o.after))
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, value]) => ({ key, value })),
        }),
    },
  }
}

const start = Effect.fnUntraced(function* (kv: ReturnType<typeof makeKv>, dir: string, approve = true) {
  const tools = new Map<string, any>()
  const asked: string[] = []
  let contextHook: ((e: SessionContext) => Effect.Effect<void>) | undefined
  yield* MemoryPlugin.Plugin.effect({
    ...host({
      location: loc(dir),
      storage: kv.storage as any,
      permission: {
        hook: () => Effect.succeed({ dispose: Effect.void }),
        assert: (input: any) => {
          asked.push(input.resources[0])
          return approve ? Effect.void : Effect.fail(new Tool.Error({ message: "rejected" }))
        },
      } as any,
      tool: {
        transform: (cb: any) => {
          cb({ add: (t: any) => tools.set(t.name, t) })
          return Effect.succeed({ dispose: Effect.void })
        },
        reload: () => Effect.void,
        list: () => Effect.succeed([]),
        hook: () => Effect.succeed({ dispose: Effect.void }),
      } as any,
      session: {
        hook: (name: string, cb: any) => {
          if (name === "context") contextHook = cb
          return Effect.succeed({ dispose: Effect.void })
        },
      } as any,
    }),
    options: {},
  })
  const call = (name: string, input: any) =>
    tools.get(name).execute(input, {
      sessionID,
      agent: Agent.ID.make("build"),
      messageID: SessionMessage.ID.make("msg_mem"),
      id: Tool.CallID.make("call_mem"),
      progress: () => Effect.void,
    }) as Effect.Effect<{ content: string }, Tool.Error>
  const inject = Effect.gen(function* () {
    const event: SessionContext = {
      sessionID,
      agent: Agent.ID.make("build"),
      model: { id: Model.ID.make("m"), providerID: Provider.ID.make("p") },
      system: [SystemPart.make("base")],
      messages: [],
      tools: {},
      options: {},
    }
    yield* contextHook!(event)
    return event.system.map((s) => s.text).join("\n")
  })
  return { tools, call, inject, asked }
})

describe("memory plugin", () => {
  it.effect("registers the five tools and a context hook", () =>
    Effect.gen(function* () {
      const m = yield* start(makeKv(), "/a")
      expect([...m.tools.keys()].sort()).toEqual(["memory_edit", "memory_forget", "memory_list", "memory_save", "memory_search"])
    }),
  )

  it.effect("persists across plugin restarts (new session) and separates projects", () =>
    Effect.gen(function* () {
      const kv = makeKv()
      const a = yield* start(kv, "/proyectoA")
      yield* a.call("memory_save", { text: "usa pnpm en este repo" })
      yield* a.call("memory_save", { text: "prefiero respuestas breves en español", global: true })
      expect(a.asked.length).toBe(2)
      // New plugin instance, same store, other folder
      const b = yield* start(kv, "/proyectoB")
      const prompt = yield* b.inject
      expect(prompt).toContain("prefiero respuestas breves")
      expect(prompt).not.toContain("pnpm")
      expect(prompt).toContain("base")
      const again = yield* start(kv, "/proyectoA")
      expect(yield* again.inject).toContain("pnpm")
      expect((yield* b.call("memory_search", { query: "pnpm" })).content).toBe("Sin resultados.")
      expect((yield* again.call("memory_search", { query: "pnpm" })).content).toContain("pnpm")
    }),
  )

  it.effect("edit and forget work, only on visible notes, and require approval", () =>
    Effect.gen(function* () {
      const kv = makeKv()
      const a = yield* start(kv, "/A")
      const saved = (yield* a.call("memory_save", { text: "usa yarn" })).content
      const id = /\[(\w+)\]/.exec(saved)![1]!
      yield* a.call("memory_edit", { id, text: "usa pnpm" })
      expect((yield* a.call("memory_list", {})).content).toContain("usa pnpm")
      const other = yield* start(kv, "/B")
      expect((yield* other.call("memory_forget", { id })).content).toBe("No existe esa nota aquí.")
      yield* a.call("memory_forget", { id })
      expect((yield* a.call("memory_list", {})).content).toBe("La memoria está vacía.")
      expect(a.asked.length).toBe(3)
    }),
  )

  it.effect("rejected approval writes nothing; secrets are refused", () =>
    Effect.gen(function* () {
      const kv = makeKv()
      const a = yield* start(kv, "/A", false)
      const result = yield* Effect.exit(a.call("memory_save", { text: "nota válida" }))
      expect(result._tag).toBe("Failure")
      expect(kv.data.size).toBe(0)
      const ok = yield* start(kv, "/A", true)
      expect((yield* ok.call("memory_save", { text: "api_key = abcdef123456789" })).content).toContain("credencial")
      expect(kv.data.size).toBe(0)
    }),
  )
})
