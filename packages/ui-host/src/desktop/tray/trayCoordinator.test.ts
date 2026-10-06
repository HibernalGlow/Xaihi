import { describe, expect, it, vi } from "vitest"
import type { NodeTrayDeclaration } from "@xiranite/contract"

import { buildNativeTraySpecs } from "./trayCoordinator"

describe("desktop tray coordinator", () => {
  it("merges main contributions and keeps standalone trays separate", async () => {
    const onAction = vi.fn()
    const declarations = new Map<string, readonly NodeTrayDeclaration[]>([[
      "music",
      [
        {
          id: "controls",
          scope: "main",
          label: "Music",
          items: [{ id: "play", label: "Play" }],
          onAction,
        },
        {
          id: "player",
          scope: "standalone",
          tooltip: "Music player",
          icon: "/music-tray.png",
          items: [{ id: "next", label: "Next" }],
          onAction,
        },
      ],
    ]])

    const result = buildNativeTraySpecs(declarations)

    expect(result.specs).toEqual([
      {
        id: "xiranite.main",
        kind: "main",
        tooltip: "Xiranite",
        items: [{
          id: "node.music.controls.menu",
          label: "Music",
          children: [{
            id: "node.music.controls.play",
            label: "Play",
            type: undefined,
            enabled: undefined,
            checked: undefined,
            children: undefined,
          }],
        }],
      },
      {
        id: "node.music.player",
        kind: "standalone",
        tooltip: "Music player",
        icon: "/music-tray.png",
        items: [{
          id: "node.music.player.next",
          label: "Next",
          type: undefined,
          enabled: undefined,
          checked: undefined,
          children: undefined,
        }],
      },
    ])

    await result.actions.get("xiranite.main\nnode.music.controls.play")?.()
    await result.actions.get("node.music.player\nnode.music.player.next")?.()
    expect(onAction).toHaveBeenNthCalledWith(1, "play")
    expect(onAction).toHaveBeenNthCalledWith(2, "next")
  })

  it("preserves nested items, disabled state, checks, and separators", () => {
    const result = buildNativeTraySpecs(new Map([[
      "timer",
      [{
        scope: "standalone" as const,
        items: [{
          id: "modes",
          label: "Modes",
          children: [
            { id: "armed", label: "Armed", checked: true, enabled: false },
            { id: "gap", label: "", type: "separator" as const },
          ],
        }],
      }],
    ]]))

    expect(result.specs[1]?.items[0]?.children).toEqual([
      {
        id: "node.timer.standalone-0.modes.armed",
        label: "Armed",
        type: undefined,
        enabled: false,
        checked: true,
        children: undefined,
      },
      {
        id: "node.timer.standalone-0.modes.separator-1",
        label: "",
        type: "separator",
      },
    ])
  })
})
