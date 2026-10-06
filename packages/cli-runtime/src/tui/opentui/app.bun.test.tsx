/* @jsxImportSource @opentui/react */
import { testRender } from "@opentui/react/test-utils"
import { describe, expect, test } from "bun:test"
import { act, useState } from "react"

import type { TerminalInteractionDefinition } from "../../interaction.js"
import type { TerminalPreferenceValues } from "../index.js"
import { OpenTuiTerminalApp } from "./app.js"
import { TerminalTaskQueueScreen } from "./task-queue-screen.js"
import { TerminalRoot } from "./runner.js"
import { useTerminalChromeActions } from "./chrome-actions.js"
import { TerminalThemeProvider, resolveTerminalTheme } from "../theme.js"
import { NumberInput } from "../../components/ui/number-input.js"

interface DemoInput {
  action: string
  powerMode: string
  dryrun: boolean
  interval: number
}

function createDefinition(onRun?: (input: DemoInput) => void): TerminalInteractionDefinition<DemoInput, { success: boolean; message: string }> {
  return {
    schema: {
      id: "demo",
      title: "Demo",
      description: "Renderer-neutral schema",
      initialValues: { action: "run", powerMode: "sleep", dryrun: true, interval: 10 },
      fields: [
        {
          id: "action",
          label: "操作",
          kind: "select",
          options: [{ value: "run", label: "运行" }, { value: "status", label: "状态" }],
        },
        {
          id: "powerMode",
          label: "电源操作",
          kind: "select",
          options: [{ value: "sleep", label: "睡眠" }, { value: "shutdown", label: "关机" }],
        },
        { id: "dryrun", label: "演练模式", kind: "boolean" },
        { id: "interval", label: "间隔", kind: "number", min: 5, max: 60 },
      ],
      view: {
        sections: [
          { id: "trigger", title: "触发序列", fieldIds: ["action"] },
          { id: "execution", title: "执行动作", fieldIds: ["powerMode", "dryrun", "interval"] },
        ],
        dashboard: { title: "系统待命", display: (values) => ({ primary: String(values.action), secondary: "状态监控" }) },
      },
      toInput: (values) => ({
        action: String(values.action),
        powerMode: String(values.powerMode),
        dryrun: values.dryrun !== false,
        interval: Number(values.interval),
      }),
      preview: (input) => [`Action: ${input.action}`, `Power: ${input.powerMode}`],
      isDangerous: (input) => !input.dryrun,
      result: (result) => ({
        ...result,
        lines: ["Videos: 15"],
        table: {
          columns: [
            { id: "file", label: "文件", width: 28 },
            { id: "bitrate", label: "码率", width: 12 },
            { id: "resolution", label: "分辨率", width: 12 },
          ],
          rows: Array.from({ length: 15 }, (_, index) => ({
            file: `video-${String(index + 1).padStart(2, "0")}.mp4`,
            bitrate: `${index + 1} Mbps`,
            resolution: "1920x1080",
          })),
        },
      }),
    },
    run: async (input, onEvent) => {
      onRun?.(input)
      onEvent({ type: "log", message: "event log" })
      return { success: true, message: "ok" }
    },
  }
}

describe("OpenTUI terminal adapter", () => {
  test("keeps numeric input height and value stable across focus and blur", async () => {
    function Harness() {
      const [value, setValue] = useState(42)
      const [focused, setFocused] = useState(false)
      return <box width="40" height={6} flexDirection="column"><NumberInput id="number" value={value} focused={focused} colors={resolveTerminalTheme("nord").colors} onFocus={() => setFocused(true)} onChange={setValue} /><box id="outside" height={2} onMouseDown={() => setFocused(false)}><text>outside</text></box></box>
    }
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => { setup = await testRender(<Harness />, { width: 40, height: 8, useMouse: true }) })
    const click = async (id: string) => { const target = setup.renderer.root.findDescendantById(id)!; await act(async () => setup.mockMouse.click(target.x + 1, target.y + 1)); await act(async () => setup.flush()) }
    try {
      await act(async () => setup.renderOnce())
      const height = setup.renderer.root.findDescendantById("number")!.height
      await click("number")
      expect(setup.renderer.root.findDescendantById("number")!.height).toBe(height)
      expect(setup.captureCharFrame()).toContain("42")
      await click("outside")
      expect(setup.captureCharFrame()).toContain("42")
    } finally { await act(async () => setup.renderer.destroy()) }
  })

  test("keeps reset, exit, and shared help mouse targets clickable", async () => {
    let reset = 0
    let exited = 0
    const help = { title: "Demo", short: "Demo help", workflows: [{ title: "UI", ui: ["Open it"] }], commands: [{ title: "CLI", command: "xdemo --help", examples: [] }] }
    let setup!: Awaited<ReturnType<typeof testRender>>
    function DemoContent() { useTerminalChromeActions({ onReset: () => { reset += 1 }, onExit: () => { exited += 1 } }); return <box width="100%" height="100%"><text>content</text></box> }
    await act(async () => { setup = await testRender(<TerminalThemeProvider theme={resolveTerminalTheme("nord")}><TerminalRoot help={help} language="zh" content={<DemoContent />} /></TerminalThemeProvider>, { width: 100, height: 30, useMouse: true }) })
    const click = async (id: string) => { const target = setup.renderer.root.findDescendantById(id)!; await act(async () => setup.mockMouse.click(target.x + 1, target.y + 1)); await act(async () => setup.flush()) }
    try {
      await act(async () => setup.renderOnce())
      await setup.waitFor(() => setup.renderer.root.findDescendantById("reset") !== undefined)
      expect(setup.captureCharFrame()).toContain("帮助 F1")
      await click("reset")
      await click("exit")
      expect([reset, exited]).toEqual([1, 1])
    } finally { await act(async () => setup.renderer.destroy()) }
  })

  test("lists and controls backend operations from the shared task queue", async () => {
    let action = ""
    const controller = {
      available: true,
      list: async () => [{ operationId: "op-1", nodeId: "sleept", phase: "running" as const, createdAt: 1, updatedAt: 1, eventCount: 2 }],
      pause: async () => { action = "pause" },
      resume: async () => { action = "resume" },
      cancel: async () => { action = "cancel" },
      run: async () => ({ success: true, message: "done" }),
    }
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => { setup = await testRender(<TerminalThemeProvider theme={resolveTerminalTheme("nord")}><TerminalTaskQueueScreen controller={controller} onBack={() => undefined} /></TerminalThemeProvider>, { width: 100, height: 28, useMouse: true }) })
    try {
      await act(async () => setup.renderOnce())
      await setup.waitFor(() => setup.renderer.root.findDescendantById("task-pause") !== undefined)
      const pause = setup.renderer.root.findDescendantById("task-pause")!
      await act(async () => setup.mockMouse.click(pause.x + 1, pause.y + 1))
      await setup.waitFor(() => action === "pause")
      const cancel = setup.renderer.root.findDescendantById("task-cancel")!
      await act(async () => setup.mockMouse.click(cancel.x + 1, cancel.y + 1))
      await setup.waitFor(() => action === "cancel")
    } finally { await act(async () => setup.renderer.destroy()) }
  })

  test("renders the full shared workbench at the terminal dimensions", async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      setup = await testRender(
        <OpenTuiTerminalApp definition={createDefinition()} language="zh" theme="high-contrast" onExit={() => undefined} />,
        { width: 110, height: 24, useMouse: true },
      )
    })
    try {
      await act(async () => setup.renderOnce())
      const frame = setup.captureCharFrame()
      expect(frame.split("\n").slice(0, -1)).toHaveLength(24)
      expect(frame).toContain("DEMO // NATIVE CONTROL PLANE")
      expect(frame).toContain("OpenTUI · native widgets · buffered")
      expect(frame).toContain("触发序列")
      expect(frame).toContain("系统待命")
      expect(frame).toContain("执行动作")
      expect(frame).not.toContain("步骤")
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("handles mouse mode, power, safety, confirmation, execution, and log-tab actions", async () => {
    let capturedInput: DemoInput | undefined
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      setup = await testRender(
        <OpenTuiTerminalApp definition={createDefinition((input) => { capturedInput = input })} language="zh" onExit={() => undefined} />,
        { width: 110, height: 30, useMouse: true },
      )
    })
    const click = async (id: string) => {
      const target = setup.renderer.root.findDescendantById(id)
      expect(target).toBeDefined()
      await act(async () => {
        await setup.mockMouse.click(
          target!.x + Math.max(0, Math.floor(target!.width / 2)),
          target!.y + Math.max(0, Math.floor((target!.height - 1) / 2)),
        )
      })
      await act(async () => setup.flush())
    }
    try {
      await act(async () => setup.renderOnce())
      await click("field-action-status")
      expect(setup.captureCharFrame()).toContain("● 状态")
      await click("field-action-run")
      await click("section-tabs-execution")
      await click("field-powerMode-shutdown")
      await click("field-dryrun-false")
      await click("field-interval-plus")
      await click("field-interval")
      await act(async () => {
        setup.mockInput.pressBackspace()
        setup.mockInput.pressBackspace()
        await setup.mockInput.typeText("30")
      })
      await act(async () => setup.flush())

      await click("execute")
      expect(setup.captureCharFrame()).toContain("确认真实执行")
      await click("confirm-dismiss")
      expect(setup.captureCharFrame()).not.toContain("确认真实执行")

      await click("execute")
      await click("confirm-execute")
      await setup.waitFor(() => capturedInput !== undefined)
      expect(capturedInput).toEqual({ action: "run", powerMode: "shutdown", dryrun: false, interval: 30 })
      expect(setup.renderer.root.findDescendantById("dashboard-result-table")).toBeDefined()
      expect(setup.captureCharFrame()).toContain("video-01.mp4")

      await click("tab-logs")
      expect(setup.captureCharFrame()).toContain("event log")
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("previews and saves node CLI preferences from the shared mouse settings screen", async () => {
    let saved: TerminalPreferenceValues | undefined
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      setup = await testRender(
        <OpenTuiTerminalApp
          definition={createDefinition()}
          language="zh"
          preferences={{
            nodeId: "demo",
            current: { theme: "inherit", defaultMode: "ui", language: "zh" },
            save: async (values) => { saved = values },
            restore: async () => ({ theme: "inherit", defaultMode: "ui", language: "zh" }),
          }}
          onExit={() => undefined}
        />,
        { width: 110, height: 30, useMouse: true },
      )
    })
    const click = async (id: string) => {
      const target = setup.renderer.root.findDescendantById(id)
      expect(target).toBeDefined()
      await act(async () => setup.mockMouse.click(target!.x + Math.max(1, Math.floor(target!.width / 2)), target!.y + Math.max(0, Math.floor((target!.height - 1) / 2))))
      await act(async () => setup.flush())
    }
    try {
      await act(async () => setup.renderOnce())
      await click("settings")
      expect(setup.captureCharFrame()).toContain("demo CLI 设置")
      await click("pref-theme-dracula")
      await click("pref-mode-pipe")
      await click("pref-language-en")
      await click("pref-save")
      await setup.waitFor(() => saved !== undefined)
      expect(saved).toEqual({ theme: "dracula", defaultMode: "pipe", language: "en" })
      expect(setup.captureCharFrame()).toContain("主题预览 / dracula")
    } finally {
      await act(async () => setup.renderer.destroy())
    }
  })

  test("provides every OpenTUI screen with the shared top-bar TOML preferences entry", async () => {
    let setup!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      setup = await testRender(<TerminalRoot language="zh" preferences={{ nodeId: "shared-demo", current: { theme: "inherit", defaultMode: "ui", language: "zh" }, save: async () => undefined, restore: async () => ({ theme: "inherit", defaultMode: "ui", language: "zh" }) }} content={<box><text>node screen</text></box>} />, { width: 100, height: 28, useMouse: true })
    })
    try {
      await act(async () => setup.renderOnce())
      const target = setup.renderer.root.findDescendantById("node-preferences-entry")
      expect(target).toBeDefined()
      await act(async () => setup.mockMouse.click(target!.x + 1, target!.y))
      await act(async () => setup.flush())
      expect(setup.captureCharFrame()).toContain("shared-demo CLI 设置")
    } finally { await act(async () => setup.renderer.destroy()) }
  })

})
