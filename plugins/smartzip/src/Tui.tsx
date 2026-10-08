/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import {
  ActionTabs,
  ClickTarget,
  ExecutionActions,
  ProgressBar,
  resolveTerminalTheme,
  TerminalPreferencesScreen,
  TerminalThemeProvider,
  terminalIcon,
  useAnimation,
  useTerminalChromeActions,
  useTerminalTheme,
  useTerminalUiSession,
  WorkbenchButton,
  WorkbenchField,
  WorkbenchPanel,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { SmartZipInput, SmartZipResult } from "./core.ts"

export function SmartZipTui(props: TerminalUiScreenProps<SmartZipInput, SmartZipResult>): import('react').ReactNode {
  const [previewTheme, setPreviewTheme] = useState(props.theme ?? props.preferences?.current.theme ?? "inherit")
  return <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}><SmartZipWorkbench {...props} onThemePreview={setPreviewTheme} /></TerminalThemeProvider>
}

function SmartZipWorkbench({ definition, language, preferences, onExit, onThemePreview }: TerminalUiScreenProps<SmartZipInput, SmartZipResult> & { onThemePreview: (theme: string) => void }) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const [settings, setSettings] = useState(false)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 100 : 560 })
  const fields = definition.schema.fields
  const pathsField = fields.find((field) => field.id === "pathsText")!
  const iniField = fields.find((field) => field.id === "iniPath")!
  const codePageField = fields.find((field) => field.id === "codePage")!
  const databaseField = fields.find((field) => field.id === "databasePath")!
  const switches = fields.filter((field) => ["recordRun", "dryRun"].includes(field.id))
  const action = String(session.values.action ?? "status")
  const pathCount = String(session.values.pathsText ?? "").split(/\r?\n/).map((path) => path.trim()).filter(Boolean).length
  const result = session.resultSummary
  const commandRows = session.resultSummary?.table?.rows ?? []

  useTerminalChromeActions({ onReset: session.reset, onExit, resetLabel: `↺ ${t("reset")}`, exitLabel: `× ${language === "zh" ? "退出" : "Exit"}` })
  useKeyboard((key) => {
    if (key.name !== "escape") return
    if (settings) setSettings(false)
    else if (session.confirming) session.dismissConfirmation()
    else if (session.phase === "running" || session.phase === "paused") void session.cancel()
    else onExit()
  })

  if (settings && preferences) return <TerminalPreferencesScreen controller={preferences} focusedId={session.focusedControlId} onFocus={session.focus} onPreviewTheme={onThemePreview} onBack={() => setSettings(false)} />
  if (session.confirming) return <box width="100%" height="100%" alignItems="center" justifyContent="center"><box width="68%" height={10} flexDirection="column" borderStyle="double" borderColor={theme.colors.error} paddingLeft={2} paddingRight={2}><text fg={theme.colors.error}><b>⚠ 确认启动 SmartZip</b></text><text>{session.dangerPrompt?.body}</text><text fg={theme.colors.mutedForeground}>{session.preview.join(" · ")}</text><box flexDirection="row" gap={2}><WorkbenchButton id="confirm-execute" danger onClick={() => void session.confirmExecute()}>⚠ 确认执行</WorkbenchButton><WorkbenchButton id="confirm-dismiss" onClick={session.dismissConfirmation}>× 取消</WorkbenchButton></box></box></box>

  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
    <box height={4} flexShrink={0} flexDirection="row" justifyContent="space-between" borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1}>
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("status")} SMARTZIP // OPERATION CHAMBER`}</b></text><text fg={theme.colors.mutedForeground}>{session.status || (language === "zh" ? "归档提取、压缩、打开与命令规划" : "Archive extract, compress, open and command planning")}</text></box>
      <box flexDirection="column" alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.primary}>{`${session.phase === "running" ? "ARCHIVING" : "SYS_ACTIVE"} ${["◴", "◷", "◶", "◵"][frame % 4]}`}</text>{preferences ? <ClickTarget id="settings" onClick={() => setSettings(true)}>⚙ CONFIG</ClickTarget> : null}</box>
    </box>

    <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between">
      <ActionTabs id="field-action" options={[{ value: "status", label: "◉ 状态" }, { value: "inspect_codepage", label: "⌕ 编码预检" }, { value: "extract", label: "⇩ 解压" }, { value: "extract_codepage", label: "⌘ 编码解压" }, { value: "open", label: "↗ 打开" }, { value: "archive", label: "▣ 打包" }]} value={action} focused={session.focusedControlId === "action"} disabled={session.phase === "running"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} />
      <text fg={theme.colors.mutedForeground}>{`QUEUE ${pathCount}  ·  ${result?.success ? "PLANNED" : "IDLE"}  ·  ${session.progress}%`}</text>
    </box>

    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
      <WorkbenchPanel title={language === "zh" ? "路径队列" : "Path queue"} width="35%">
        <box flexDirection="column" flexGrow={1} minHeight={0}><WorkbenchField field={pathsField} value={session.values.pathsText} error={session.fieldErrors.pathsText} focused={session.focusedControlId === "pathsText"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("pathsText")} onChange={(value) => session.setField("pathsText", value)} /><box marginTop={1} height={2}><text fg={theme.colors.mutedForeground}>{language === "zh" ? `已排队 ${pathCount} 个归档或目录` : `${pathCount} archive(s) or directory(s) queued`}</text></box><scrollbox flexGrow={1} minHeight={3}>{String(session.values.pathsText ?? "").split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map((path, index) => <text key={`${path}-${index}`} fg={theme.colors.mutedForeground}>{`▸ ${path}`}</text>)}</scrollbox></box>
      </WorkbenchPanel>
      <WorkbenchPanel title="Operation chamber" flexGrow={1}>
        <box flexDirection="column" flexGrow={1} minHeight={0}><box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>; TYPESCRIPT WORKFLOW PLAN</text><text fg={session.dangerous ? theme.colors.error : theme.colors.success}>{session.dangerous ? "LIVE / ARMED" : "DRY-RUN / SAFE"}</text></box><scrollbox id="smartzip-operation-chamber" flexGrow={1} minHeight={4}>{session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index ? theme.colors.mutedForeground : theme.colors.primary}>{`${index ? "·" : "$"} ${line}`}</text>)}{commandRows.map((row, index) => <text key={`${row.path}-${index}`} fg={theme.colors.foreground}>{`▸ ${row.path}`}</text>)}{session.resultSummary?.lines.map((line, index) => <text key={`${line}-${index}`} fg={theme.colors.error}>{`! ${line}`}</text>)}</scrollbox><ProgressBar value={session.progress} label={session.status || "READY"} /></box>
      </WorkbenchPanel>
    </box>

    <box height={12} minHeight={12} flexShrink={0} marginTop={1} borderStyle="rounded" borderColor={session.dangerous ? theme.colors.error : theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}>
      <box width="62%" flexDirection="column"><box height={2}><text fg={theme.colors.mutedForeground}>{language === "zh" ? "TS 智能工作流 · 旧文件名代码页 · 自动检测 7-Zip" : "TS smart workflow · legacy filename codepage · auto-detected 7-Zip"}</text></box><box flexDirection="row" gap={1}><box width="34%"><WorkbenchField field={iniField} value={session.values.iniPath} error={session.fieldErrors.iniPath} focused={session.focusedControlId === "iniPath"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("iniPath")} onChange={(value) => session.setField("iniPath", value)} /></box><box width="32%"><WorkbenchField field={codePageField} value={session.values.codePage} error={session.fieldErrors.codePage} focused={session.focusedControlId === "codePage"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("codePage")} onChange={(value) => session.setField("codePage", value)} /></box><box width="34%"><WorkbenchField field={databaseField} value={session.values.databasePath} error={session.fieldErrors.databasePath} focused={session.focusedControlId === "databasePath"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("databasePath")} onChange={(value) => session.setField("databasePath", value)} /></box></box></box>
      <box flexGrow={1} flexDirection="column"><box flexDirection="row" gap={2}>{switches.map((field) => <box key={field.id} flexGrow={1}><WorkbenchField field={field} value={session.values[field.id]} error={session.fieldErrors[field.id]} focused={session.focusedControlId === field.id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(field.id)} onChange={(value) => session.setField(field.id, value)} /></box>)}</box><box flexGrow={1} /><ExecutionActions session={session} executeLabel="▶ 运行 SmartZip" confirmLabel="⚠ 确认启动" /></box>
    </box>
  </box>
}
