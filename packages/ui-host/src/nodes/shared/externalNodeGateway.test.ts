import { beforeEach, describe, expect, it, vi } from "vitest"

import { runNodeOperation } from "@/nodes/shared/api"
import { externalNode } from "./externalNodeGateway"
import type { NodeSettingsFace } from "./NodeSettingsFaceContext"

// The gateway may only reach the settings through the injected face (bridge `config.getUi`/`config.save`);
// this mock is also the guard that the seam keeps exposing exactly these two surfaces.
vi.mock("@/nodes/shared/api", () => ({
  runNodeOperation: vi.fn(),
}))

function fakeFace() {
  return {
    read: vi.fn(),
    write: vi.fn(),
  } satisfies NodeSettingsFace & { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }
}

describe("externalNode", () => {
  beforeEach(() => {
    vi.mocked(runNodeOperation).mockReset()
  })

  it("keeps cross-node config and execution behind one typed adapter", async () => {
    const face = fakeFace()
    const classf = externalNode<{ blacklistKeywords?: string[] }>("classf", face)
    face.read.mockResolvedValue({ value: { blacklistKeywords: ["[OgoG]"] }, revision: 3 })
    vi.mocked(runNodeOperation).mockResolvedValue({ success: true, message: "Done." })

    await expect(classf.config.get()).resolves.toEqual({ config: { blacklistKeywords: ["[OgoG]"] }, path: "" })
    await classf.config.patch({ blacklistKeywords: ["[OgoG]", "[Artist]"] })
    await classf.run({ action: "plan" })

    expect(face.read).toHaveBeenCalledWith("xaihi-classf")
    expect(face.write).toHaveBeenCalledWith("xaihi-classf", { blacklistKeywords: ["[OgoG]", "[Artist]"] })
    expect(runNodeOperation).toHaveBeenCalledWith("classf", { action: "plan" })
  })

  it("refuses config access with a readable reason when no face is wired", async () => {
    const classf = externalNode<{ blacklistKeywords?: string[] }>("classf")
    await expect(classf.config.get()).rejects.toThrow("没接设置面")
    await expect(classf.config.patch({ blacklistKeywords: [] })).rejects.toThrow("没接设置面")
    expect(runNodeOperation).not.toHaveBeenCalled()
  })
})
