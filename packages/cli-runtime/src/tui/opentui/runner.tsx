/* @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState, type ReactNode } from "react"
import type { ReadStream, WriteStream } from "node:tty"

import type { TerminalInteractionDefinition } from "../../interaction.js"
import type { RunTerminalUiOptions } from "../index.js"
import { OpenTuiTerminalApp, TerminalPreferencesScreen } from "./app.js"
import { TerminalTaskQueueScreen } from "./task-queue-screen.js"
import { TerminalHelpScreen } from "./help-screen.js"
import { ClickTarget } from "./workbench-controls.js"
import type { TerminalTaskQueueController } from "../task-queue.js"
import { TerminalChromeActionsProvider, type TerminalChromeActions } from "./chrome-actions.js"
import { resolveTerminalTheme, TerminalThemeProvider } from "../theme.js"
import { terminalIcon } from "../icons.js"

export async function runOpenTuiTerminalUi<Input, Result>(
  definition: TerminalInteractionDefinition<Input, Result>,
  options: RunTerminalUiOptions<Input, Result> & { language: "en" | "zh" },
): Promise<void> {
  let resolveDestroyed: (() => void) | undefined
  const destroyed = new Promise<void>((resolve) => {
    resolveDestroyed = resolve
  })
  const renderer = await createCliRenderer({
    stdin: options.host.stdin as ReadStream,
    stdout: options.host.stdout as WriteStream,
    exitOnCtrlC: true,
    clearOnShutdown: true,
    useMouse: true,
    enableMouseMovement: true,
    screenMode: "alternate-screen",
    onDestroy: () => resolveDestroyed?.(),
  })
  const root = createRoot(renderer)
  const exit = () => {
    root.unmount()
    renderer.destroy()
  }
  const screen = options.screen ?? await options.loadScreen?.()
  const Screen = screen
  const content = Screen
    ? <Screen definition={definition} language={options.language} theme={options.theme} preferences={options.preferences} help={options.help} onExit={exit} />
    : <OpenTuiTerminalApp definition={definition} language={options.language} theme={options.theme} preferences={options.preferences} help={options.help} onExit={exit} />
  root.render(<TerminalRoot taskQueue={options.taskQueue} help={options.help} language={options.language} preferences={options.preferences} theme={options.theme} content={content} />)
  await destroyed
}

/** Shared fullscreen chrome. Every OpenTUI node receives this TOML preference entry. */
export function TerminalRoot({ taskQueue, help, language, preferences, theme: requestedTheme, content }: {
  taskQueue?: TerminalTaskQueueController
  help?: import("@xiranite/contract").NodeHelp
  language: "zh" | "en"
  preferences?: RunTerminalUiOptions["preferences"]
  theme?: string
  content: ReactNode
}): ReactNode {
  const [showQueue, setShowQueue] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [previewTheme, setPreviewTheme] = useState(requestedTheme ?? preferences?.current.theme ?? "nord")
  const [chromeActions, setChromeActions] = useState<TerminalChromeActions>()
  useKeyboard((key) => {
    if (key.name === "f9") setShowQueue((value) => !value)
    if (key.name === "f1" && help) setShowHelp((value) => !value)
    if (showQueue && key.name === "escape") setShowQueue(false)
    if (showHelp && key.name === "escape") setShowHelp(false)
    if (showPreferences && key.name === "escape") setShowPreferences(false)
  })
  if (showQueue && taskQueue) return <TerminalTaskQueueScreen controller={taskQueue} onBack={() => setShowQueue(false)} />
  if (showHelp && help) return <TerminalHelpScreen help={help} language={language} onBack={() => setShowHelp(false)} />
  if (showPreferences && preferences) return <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}><TerminalPreferencesScreen controller={preferences} focusedId="pref-theme" onFocus={() => undefined} onPreviewTheme={setPreviewTheme} onBack={() => setShowPreferences(false)} /></TerminalThemeProvider>
  return <TerminalChromeActionsProvider register={setChromeActions}><box width="100%" height="100%" position="relative">{content}<box position="absolute" top={0} right={2} height={3} flexDirection="row">{chromeActions ? <><ClickTarget id="reset" bordered onClick={chromeActions.onReset}>{chromeActions.resetLabel ?? "↺ 重置"}</ClickTarget><ClickTarget id="exit" bordered onClick={chromeActions.onExit}>{chromeActions.exitLabel ?? "× 退出"}</ClickTarget></> : null}{preferences ? <ClickTarget id="node-preferences-entry" bordered onClick={() => setShowPreferences(true)}>{`${terminalIcon("settings")} 节点配置`}</ClickTarget> : null}{help ? <ClickTarget id="help-entry" bordered onClick={() => setShowHelp(true)}>？帮助 F1</ClickTarget> : null}{taskQueue ? <ClickTarget id="task-queue-entry" bordered onClick={() => setShowQueue(true)}>▤ 任务队列 F9</ClickTarget> : null}</box></box></TerminalChromeActionsProvider>
}
