/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { ActionTabs, ClickTarget, ExecutionActions, ProgressBar, resolveTerminalTheme, TerminalPreferencesScreen, TerminalThemeProvider, terminalIcon, useAnimation, useTerminalChromeActions, useTerminalTheme, useTerminalUiSession, WorkbenchButton, WorkbenchField, WorkbenchPanel } from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { TimeuInput, TimeuResult } from "./core.ts"

export function TimeuTui(props: TerminalUiScreenProps<TimeuInput, TimeuResult>): import('react').ReactNode {
  const [previewTheme, setPreviewTheme] = useState(props.theme ?? props.preferences?.current.theme ?? "inherit")
  return <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}><TimeuWorkbench {...props} onThemePreview={setPreviewTheme} /></TerminalThemeProvider>
}

function TimeuWorkbench({ definition, language, preferences, onExit, onThemePreview }: TerminalUiScreenProps<TimeuInput, TimeuResult> & { onThemePreview: (theme: string) => void }) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const [settings, setSettings] = useState(false)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 120 : 540 })
  const action = String(session.values.action ?? "scan")
  const fields = definition.schema.fields
  const pathField = fields.find((field) => field.id === "listText")!
  const recordField = fields.find((field) => field.id === "recordPath")!
  const switches = fields.filter((field) => ["recursive", "includeDirectories", "dryRun"].includes(field.id))
  const rows = session.resultSummary?.table?.rows
  useTerminalChromeActions({ onReset: session.reset, onExit, resetLabel: `↺ ${t("reset")}`, exitLabel: `× ${language === "zh" ? "退出" : "Exit"}` })
  useKeyboard((key) => { if (key.name === "escape") { if (settings) setSettings(false); else if (session.confirming) session.dismissConfirmation(); else if (session.phase === "running" || session.phase === "paused") void session.cancel(); else onExit() } })
  if (settings && preferences) return <TerminalPreferencesScreen controller={preferences} focusedId={session.focusedControlId} onFocus={session.focus} onPreviewTheme={onThemePreview} onBack={() => setSettings(false)} />
  if (session.confirming) return <box width="100%" height="100%" alignItems="center" justifyContent="center"><box width="68%" height={10} flexDirection="column" borderStyle="double" borderColor={theme.colors.error} paddingLeft={2} paddingRight={2}><text fg={theme.colors.error}><b>⚠ 确认写入时间戳</b></text><text>{session.dangerPrompt?.body}</text><text fg={theme.colors.mutedForeground}>{session.preview.join(" · ")}</text><box flexDirection="row" gap={2}><WorkbenchButton id="confirm-execute" danger onClick={() => void session.confirmExecute()}>⚠ 确认执行</WorkbenchButton><WorkbenchButton id="confirm-dismiss" onClick={session.dismissConfirmation}>× 取消</WorkbenchButton></box></box></box>

  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("status")} TIMEU // TIMESTAMP LEDGER`}</b></text><text fg={theme.colors.mutedForeground}>{session.status || (language === "zh" ? "检查、备份与恢复文件时间戳" : "Inspect, back up and restore timestamps")}</text></box>
      <box flexDirection="column" alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.primary}>{`${session.phase === "running" ? "SYNCING" : "LEDGER READY"} ${["◴", "◷", "◶", "◵"][frame % 4]}`}</text>{preferences ? <ClickTarget id="settings" onClick={() => setSettings(true)}>⚙ CONFIG</ClickTarget> : null}</box>
    </box>

    <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between">
      <ActionTabs id="field-action" options={[{ value: "scan", label: "⌕ 检查" }, { value: "backup", label: "▣ 备份" }, { value: "restore", label: "↺ 恢复" }]} value={action} focused={session.focusedControlId === "action"} disabled={session.phase === "running"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} />
      <text fg={theme.colors.mutedForeground}>{`PATHS ${String(session.values.listText ?? "").split(/\r?\n/).filter(Boolean).length}  ·  RECORDS ${rows?.length ?? 0}  ·  ${session.progress}%`}</text>
    </box>

    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
      <WorkbenchPanel title={language === "zh" ? "路径队列" : "Path queue"} width="31%">
        <box flexDirection="column" flexGrow={1} minHeight={0}><WorkbenchField field={pathField} value={session.values.listText} error={session.fieldErrors.listText} focused={session.focusedControlId === "listText"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("listText")} onChange={(value) => session.setField("listText", value)} /><WorkbenchField field={recordField} value={session.values.recordPath} error={session.fieldErrors.recordPath} focused={session.focusedControlId === "recordPath"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("recordPath")} onChange={(value) => session.setField("recordPath", value)} /></box>
      </WorkbenchPanel>
      <WorkbenchPanel title={language === "zh" ? "时间记录总账" : "Timestamp ledger"} flexGrow={1}>
        <box flexDirection="column" flexGrow={1} minHeight={0}><box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>TARGET PATH</text><text fg={theme.colors.mutedForeground}>ACTION / STATUS</text></box><scrollbox id="timeu-ledger" flexGrow={1}>{rows?.length ? rows.map((row, index) => <box key={`${row.path}-${index}`} height={2} flexDirection="row" justifyContent="space-between"><text fg={row.status === "error" ? theme.colors.error : theme.colors.foreground}>{`${row.status === "success" ? "✓" : row.status === "error" ? "!" : "·"} ${row.path}`}</text><text fg={row.status === "success" ? theme.colors.success : theme.colors.mutedForeground}>{`${row.operation} / ${row.status}`}</text></box>) : session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index ? theme.colors.mutedForeground : theme.colors.foreground}>{`${index ? "·" : "▸"} ${line}`}</text>)}</scrollbox><ProgressBar value={session.progress} label={session.status || "READY"} /></box>
      </WorkbenchPanel>
    </box>

    <box height={7} minHeight={7} flexShrink={0} marginTop={1} borderStyle="rounded" borderColor={session.dangerous ? theme.colors.error : theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}>
      <box width="60%" flexDirection="row" gap={2}>{switches.map((field) => <box key={field.id} width="31%"><WorkbenchField field={field} value={session.values[field.id]} error={session.fieldErrors[field.id]} focused={session.focusedControlId === field.id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(field.id)} onChange={(value) => session.setField(field.id, value)} /></box>)}</box>
      <box flexGrow={1} flexDirection="column"><box flexDirection="row"><ClickTarget id="tab-status" selected={session.resultTab === "status"} onClick={() => session.selectResultTab("status")}>◉ 记录</ClickTarget><ClickTarget id="tab-logs" selected={session.resultTab === "logs"} onClick={() => session.selectResultTab("logs")}>{`▤ 日志 (${session.logs.length})`}</ClickTarget></box><box flexGrow={1} /><ExecutionActions session={session} executeLabel="▶ 执行时间戳任务" confirmLabel="⚠ 确认写入" /></box>
    </box>
  </box>
}
