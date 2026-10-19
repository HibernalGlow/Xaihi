import { describe, expect, test } from "vitest"
import type { Context } from "@deepseek-ai/cordis"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NODE_REGISTRY_SERVICE, NodeRegistry, SHELLECT_SERVICE, type ShellectAction, type ShellectService } from "@hibernalglow/xaihi-sdk"
import { apply, type Config } from "../src/index.ts"

describe("dissolvef Shellect provider", () => {
  test("registers the dissolvef action with the shared Shellect service", () => {
    const registry = new NodeRegistry()
    const actions: ShellectAction[] = []
    const service: ShellectService = {
      register(action) {
        actions.push(action)
        return () => {}
      },
      catalog: () => ({}),
      list: () => [],
      prepare: async () => ({}),
      execute: async () => ({ success: true, message: "ok" }),
    }
    const ctx = {
      tools: { register: () => () => {} },
      on: () => () => {},
      get: (name: string) => name === NODE_REGISTRY_SERVICE ? registry : undefined,
      inject: (deps: readonly string[], callback: (scope: { get(name: string): unknown }) => unknown) => {
        const scope = { get: (name: string) => name === NODE_REGISTRY_SERVICE ? registry : name === SHELLECT_SERVICE ? service : undefined }
        return callback(scope)
      },
    } as unknown as Context

    const config = { historyPath: { get: () => "/tmp/xaihi-dissolvef-history.json" } } as Config
    apply(ctx, config)

    expect(actions).toHaveLength(1)
    expect(actions[0]?.id).toBe("dissolvef.direct")
    expect(actions[0]?.nodeId).toBe("dissolvef")
    expect(actions[0]?.title).toBe("解散文件夹")
    expect(actions[0]?.selection).toBe("directories")
  })

  test("returns the complete data shape used by the dissolvef panel", async () => {
    const registry = new NodeRegistry()
    const ctx = createContext(registry)
    const root = await mkdtemp(join(tmpdir(), "xaihi-dissolvef-provider-"))
    try {
      apply(ctx, { historyPath: { get: () => "" } } as Config)
      const result = await registry.run("dissolvef", { action: "plan", path: root, preview: true })
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({ plan: [], history: [], errors: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function createContext(registry: NodeRegistry): Context {
  return {
    tools: { register: () => () => {} },
    on: () => () => {},
    get: (name: string) => name === NODE_REGISTRY_SERVICE ? registry : undefined,
    inject: (deps: readonly string[], callback: (scope: { get(name: string): unknown }) => unknown) => {
      const scope = { get: (name: string) => name === NODE_REGISTRY_SERVICE ? registry : undefined }
      return callback(scope)
    },
  } as unknown as Context
}
