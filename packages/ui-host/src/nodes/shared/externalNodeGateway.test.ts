import { beforeEach, describe, expect, it, vi } from "vitest"

import { nodeConfigApi, runNodeOperation } from "@/nodes/shared/api"
import { externalNode } from "./externalNodeGateway"

// The gateway may only reach the backend through the node UI seam (`src/nodes/shared/api.ts`); this mock is
// also the guard that the seam keeps exposing exactly these two surfaces.
vi.mock("@/nodes/shared/api", () => ({
  nodeConfigApi: {
    get: vi.fn(),
    save: vi.fn(),
  },
  runNodeOperation: vi.fn(),
}))

describe("externalNode", () => {
  beforeEach(() => {
    vi.mocked(nodeConfigApi.get).mockReset()
    vi.mocked(nodeConfigApi.save).mockReset()
    vi.mocked(runNodeOperation).mockReset()
  })

  it("keeps cross-node config and execution behind one typed adapter", async () => {
    const classf = externalNode<{ blacklistKeywords?: string[] }>("classf")
    vi.mocked(nodeConfigApi.get).mockResolvedValue({ config: { blacklistKeywords: ["[OgoG]"] }, path: "D:/xiranite.config.toml" })
    vi.mocked(runNodeOperation).mockResolvedValue({ success: true, message: "Done." })

    await expect(classf.config.get()).resolves.toEqual({ config: { blacklistKeywords: ["[OgoG]"] }, path: "D:/xiranite.config.toml" })
    await classf.config.patch({ blacklistKeywords: ["[OgoG]", "[Artist]"] })
    await classf.run({ action: "plan" })

    expect(nodeConfigApi.get).toHaveBeenCalledWith("classf")
    expect(nodeConfigApi.save).toHaveBeenCalledWith("classf", { blacklistKeywords: ["[OgoG]", "[Artist]"] })
    expect(runNodeOperation).toHaveBeenCalledWith("classf", { action: "plan" })
  })
})
