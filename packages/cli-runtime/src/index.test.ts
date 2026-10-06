import { describe, expect, test } from "vitest"
import {
  nodeCliName,
  normalizeNodeCliName,
  renderCliEvent,
  renderProgressBar,
  renderRichPanel,
  visibleWidth,
  writeCliEvent,
} from "./index.js"
import type { CliHost } from "./index.js"
import { createTerminalTranslator, resolveTerminalLanguage } from "./i18n.js"
import {
  resolveCliInvocation,
  resolveInteractionPreferences,
  resolveTerminalUiFlags,
} from "./interaction.js"
import { listTerminalThemes, resolveTerminalTheme, runTerminalUi } from "./terminal.js"

describe("cli-runtime", () => {
  test("derives short node command names and normalizes legacy names", () => {
    expect(nodeCliName("repacku")).toBe("xrepacku")
    expect(normalizeNodeCliName("xrepacku")).toBe("repacku")
    expect(normalizeNodeCliName("xiranite-repacku")).toBe("repacku")
  })

  test("renders rich panels within terminal width", () => {
    const host = createHost({ columns: 34 })
    const panel = renderRichPanel(host, "EngineV", ["本地图片直通", "E:/SteamLibrary/workshop/content/431960"], {
      minWidth: 18,
    })

    expect(panel).toContain("EngineV")
    expect(panel).toContain("本地图片直通")
    for (const line of panel.split(/\r?\n/)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(34)
    }
  })

  test("renders progress bars that remain meaningful without color", () => {
    const host = createHost({ columns: 48 })
    const line = renderProgressBar(host, 40, "扫描 本地预览图", { width: 10, label: "enginev" })

    expect(line).toContain("enginev")
    expect(line).toContain("━━━━──────")
    expect(line).toContain(" 40%")
    expect(line).toContain("扫描 本地预览图")
    expect(visibleWidth(line)).toBeLessThanOrEqual(48)
  })

  test("formats and writes node run events through the shared rich event output", () => {
    const host = createHost({ columns: 36 })

    expect(renderCliEvent(host, { type: "log", message: "普通日志" })).toBe("普通日志")
    writeCliEvent(host, { type: "progress", progress: 100, message: "完成 EngineV 图片加载" }, {
      label: "enginev",
      progressWidth: 8,
    })

    expect(host.output).toHaveLength(1)
    expect(host.output[0]).toContain("enginev")
    expect(host.output[0]).toContain("━━━━━━━━")
    expect(host.output[0]).toContain("100%")
  })

  test("routes ui, gd, and pipe without leaking interactive mode into pipelines", () => {
    const tty = createHost(); tty.stdin.isTTY = true; tty.stdout.isTTY = true
    expect(resolveCliInvocation([], tty, "ui")).toBe("ui")
    expect(resolveCliInvocation([], tty, "pipe")).toBe("pipe")
    expect(resolveCliInvocation(["gd"], tty)).toBe("gd")
    expect(resolveCliInvocation(["guided"], tty)).toBe("gd")
    expect(resolveCliInvocation([], createHost(), "ui")).toBe("pipe")
    expect(resolveCliInvocation(["status", "--json"], tty)).toBe("pipe")
  })

  test("extracts shared renderer, language, and theme flags", () => {
    expect(resolveTerminalUiFlags(["--renderer=opentui", "--lang", "zh", "--theme", "dracula"]))
      .toEqual({ renderer: "opentui", language: "zh", theme: "dracula", args: [] })
    expect(resolveTerminalUiFlags(["--renderer", "unknown"]).error).toContain("Unknown terminal renderer")
    expect(resolveTerminalUiFlags(["--lang", "fr"]).error).toContain("Unknown terminal language")
  })

  test("reads shared interaction preferences only from the node CLI table", () => {
    expect(resolveInteractionPreferences({
      cli: {
        default_mode: "pipe",
        renderer: "opentui",
        language: "zh",
        theme: "dracula",
      },
    })).toEqual({ mode: "pipe", renderer: "opentui", language: "zh", theme: "dracula" })
    expect(resolveInteractionPreferences({
      interaction_mode: "gd",
      interaction_language: "en",
      interaction_theme: "legacy",
    } as never)).toEqual({ mode: "ui", renderer: "opentui", language: undefined, theme: "nord" })
    expect(resolveInteractionPreferences(undefined)).toEqual({ mode: "ui", renderer: "opentui", language: undefined, theme: "nord" })
    expect(resolveInteractionPreferences({ cli: { theme: "inherit" } })).toEqual({ mode: "ui", renderer: "opentui", language: undefined, theme: "inherit" })
  })

  test("shares terminal themes and GUI-compatible Chinese common labels", () => {
    expect(listTerminalThemes()).toEqual(expect.arrayContaining(["nord", "default", "dracula", "high-contrast", "tokyo-night"]))
    expect(resolveTerminalTheme().name).toBe("nord")
    const zh = createTerminalTranslator("zh")
    expect(zh("cancel")).toBe("取消")
    expect(zh("confirm")).toBe("确认")
    expect(zh("reset")).toBe("重置")
  })

  test("defaults terminal UI to Chinese while preserving explicit English overrides", () => {
    expect(resolveTerminalLanguage(undefined, {})).toBe("zh")
    expect(resolveTerminalLanguage("en", {})).toBe("en")
    expect(resolveTerminalLanguage(undefined, { LANG: "en_US.UTF-8" })).toBe("en")
  })

  test("keeps Node hosts safe when OpenTUI needs a Bun re-exec", async () => {
    const host = createHost()
    const definition = {
      schema: {
        id: "demo",
        title: "Demo",
        description: "Demo",
        initialValues: { action: "run" },
        fields: [{ id: "action", label: "Action", kind: "text" as const }],
        toInput: () => ({ action: "run" }),
        preview: () => ["run"],
        isDangerous: () => false,
        result: () => ({ success: true, message: "ok" }),
      },
      run: async () => ({ success: true }),
    }

    await expect(runTerminalUi(definition, { renderer: "opentui", host }))
      .rejects.toThrow("OpenTUI requires the Bun runtime")
  })
})

function createHost(options: { columns?: number } = {}): CliHost & { output: string[]; errorOutput: string[] } {
  const output: string[] = []
  const errorOutput: string[] = []
  return {
    cwd: "D:/work",
    env: {},
    stdin: { isTTY: false } as CliHost["stdin"],
    stdout: {
      columns: options.columns ?? 80,
      isTTY: false,
      write: (chunk: string) => {
        output.push(String(chunk).replace(/\n$/, ""))
        return true
      },
    },
    stderr: {
      columns: options.columns ?? 80,
      isTTY: false,
      write: (chunk: string) => {
        errorOutput.push(String(chunk).replace(/\n$/, ""))
        return true
      },
    },
    output,
    errorOutput,
  }
}
