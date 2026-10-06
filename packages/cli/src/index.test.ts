import { describe, expect, test } from "vitest"
import { findNodeCli, formatHelp, formatNodeList, NODE_CLI_REGISTRY, normalizeNodeId, runWorkspaceNavigation } from "./index"

describe("@xiranite/cli registry", () => {
  test("registers generated node CLIs including migrated utility nodes", () => {
    expect(NODE_CLI_REGISTRY.length).toBeGreaterThanOrEqual(42)
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("cleanf")
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("envuconfig")
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("gifu")
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("smartzip")
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("samea")
    expect(NODE_CLI_REGISTRY.map((entry) => entry.id)).toContain("trename")
  })

  test("normalizes direct bin names to node ids", () => {
    expect(normalizeNodeId("xcleanf")).toBe("cleanf")
    expect(normalizeNodeId("xiranite-cleanf")).toBe("cleanf")
    expect(normalizeNodeId("CleanF")).toBe("cleanf")
  })

  test("finds nodes by id or package-local bin name", () => {
    expect(findNodeCli("linedup")?.packageName).toBe("@xiranite/node-linedup")
    expect(findNodeCli("xlinedup")?.id).toBe("linedup")
    expect(findNodeCli("missing")).toBeUndefined()
  })

  test("formats useful command discovery output", () => {
    expect(formatHelp()).toContain("xiranite [ui | <node> [args]]")
    expect(formatHelp()).toContain("fullscreen Xiranite terminal workspace")
    expect(formatNodeList()).toContain("xcleanf")
  })

  test("returns from a node TUI to the aggregate workspace until the workspace exits", async () => {
    const destinations = ["sleept", "recycleu", undefined]
    const opened: string[] = []
    let renders = 0
    await runWorkspaceNavigation(
      async () => { renders += 1; return destinations.shift() },
      async (nodeId) => { opened.push(nodeId) },
    )
    expect(opened).toEqual(["sleept", "recycleu"])
    expect(renders).toBe(3)
  })
})
