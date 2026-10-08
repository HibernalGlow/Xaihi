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
import type { RepackuInput, RepackuResult } from "./core.ts"

export function RepackuTui(props: TerminalUiScreenProps<RepackuInput, RepackuResult>): import('react').ReactNode {
  const [previewTheme, setPreviewTheme] = useState(props.theme ?? props.preferences?.current.theme ?? "inherit")
  return <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}><RepackuWorkbench {...props} onThemePreview={setPreviewTheme} /></TerminalThemeProvider>
}

function RepackuWorkbench({ definition, language, preferences, onExit, onThemePreview }: TerminalUiScreenProps<RepackuInput, RepackuResult> & { onThemePreview: (theme: string) => void }) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const [settings, setSettings] = useState(false)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 110 : 620 })
  const fields = definition.schema.fields
  const action = fields.find((field) => field.id === "action")!
  const paths = fields.find((field) => field.id === "pathsText")!
  const types = fields.find((field) => field.id === "types")!
  const minCount = fields.find((field) => field.id === "minCount")!
  const outputPath = fields.find((field) => field.id === "outputPath")!
  const configPath = fields.find((field) => field.id === "configPath")!
  const galleryMarker = fields.find((field) => field.id === "galleryMarker")!
  const switches = fields.filter((field) => ["deleteAfter", "dryRun"].includes(field.id))
  const pathCount = String(session.values.pathsText ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).length
  const rows = session.resultSummary?.table?.rows ?? []

  useTerminalChromeActions({ onReset: session.reset, onExit, resetLabel: `↺ ${t("reset")}`, exitLabel: `× ${language === "zh" ? "退出" : "Exit"}` })
  useKeyboard((key) => {
    if (key.name !== "escape") return
    if (settings) setSettings(false)
    else if (session.confirming) session.dismissConfirmation()
    else if (session.phase === "running" || session.phase === "paused") void session.cancel()
    else onExit()
  })

  if (settings && preferences) return <TerminalPreferencesScreen controller={preferences} focusedId={session.focusedControlId} onFocus={session.focus} onPreviewTheme={onThemePreview} onBack={() => setSettings(false)} />
  if (session.confirming) return <box width="100%" height="100%" alignItems="center" justifyContent="center"><box width="70%" height={10} flexDirection="column" borderStyle="double" borderColor={theme.colors.error} paddingLeft={2} paddingRight={2}><text fg={theme.colors.error}><b>{`${terminalIcon("danger")} ${language === "zh" ? "确认重打包" : "Confirm repacking"}`}</b></text><text>{session.dangerPrompt?.body}</text><text fg={theme.colors.mutedForeground}>{session.preview.join(" · ")}</text><box flexDirection="row" gap={2}><WorkbenchButton id="confirm-execute" danger onClick={() => void session.confirmExecute()}>{`${terminalIcon("danger")} ${language === "zh" ? "确认执行" : "Run now"}`}</WorkbenchButton><WorkbenchButton id="confirm-dismiss" onClick={session.dismissConfirmation}>{`× ${language === "zh" ? "取消" : "Cancel"}`}</WorkbenchButton></box></box></box>

  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("path")} REPACKU // PACKING WORKBENCH`}</b></text><text fg={theme.colors.mutedForeground}>{session.status || (language === "zh" ? "目录树分析、归档计划与安全重打包" : "Folder tree analysis, archive planning and safe repacking")}</text></box>
      <box flexDirection="column" alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.primary}>{`${session.phase === "running" ? "PACKING" : "READY"} ${["◴", "◷", "◶", "◵"][frame % 4]}`}</text>{preferences ? <ClickTarget id="settings" onClick={() => setSettings(true)}>{`${terminalIcon("settings")} CONFIG`}</ClickTarget> : null}</box>
    </box>
    <box height={3} marginTop={1} flexShrink={0} flexDirection="row" justifyContent="space-between"><ActionTabs id="field-action" options={[{ value: "analyze", label: "⌕ 分析" }, { value: "full", label: "◆ 完整" }, { value: "compress", label: "▶ 压缩" }, { value: "single-pack", label: "▣ 单层" }, { value: "gallery-pack", label: "▤ 画集" }]} value={String(session.values.action ?? "full")} focused={session.focusedControlId === "action"} disabled={session.phase === "running"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} /><text fg={theme.colors.mutedForeground}>{`${terminalIcon("path")} ${pathCount}  ·  ${session.progress}%`}</text></box>
    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
      <WorkbenchPanel title={`${terminalIcon("path")} ${language === "zh" ? "路径矩阵" : "Path matrix"}`} width="34%"><box flexDirection="column" flexGrow={1} minHeight={0}><WorkbenchField field={paths} value={session.values.pathsText} error={session.fieldErrors.pathsText} focused={session.focusedControlId === "pathsText"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("pathsText")} onChange={(value) => session.setField("pathsText", value)} /><scrollbox flexGrow={1} minHeight={3}>{String(session.values.pathsText ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value, index) => <text key={`${value}-${index}`} fg={theme.colors.mutedForeground}>{`${index === 0 ? "▸" : "·"} ${value}`}</text>)}</scrollbox><text fg={theme.colors.mutedForeground}>{`${terminalIcon("status")} ${pathCount} ${language === "zh" ? "个目录已排队" : "folder(s) queued"}`}</text></box></WorkbenchPanel>
      <WorkbenchPanel title={`${terminalIcon("section")} ${language === "zh" ? "重打包计划" : "Repack plan"}`} flexGrow={1}><box flexDirection="column" flexGrow={1} minHeight={0}><box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>{`${terminalIcon("logs")} OPERATION PLAN`}</text><text fg={session.dangerous ? theme.colors.error : theme.colors.success}>{session.dangerous ? "LIVE / ARMED" : "DRY-RUN / SAFE"}</text></box><scrollbox id="repacku-operation-plan" flexGrow={1} minHeight={4}>{rows.length ? rows.map((row, index) => <text key={`${row.sourcePath}-${index}`} fg={row.status === "error" ? theme.colors.error : theme.colors.foreground}>{`${row.status === "success" ? terminalIcon("result") : "▸"} ${row.sourcePath}  →  ${row.targetPath}`}</text>) : session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index ? theme.colors.mutedForeground : theme.colors.primary}>{`${index ? "·" : "$"} ${line}`}</text>)}{session.resultSummary?.lines.map((line, index) => <text key={`${line}-${index}`} fg={theme.colors.error}>{`${terminalIcon("danger")} ${line}`}</text>)}</scrollbox><ProgressBar value={session.progress} label={session.status || "READY"} /></box></WorkbenchPanel>
    </box>
    <box height={11} minHeight={11} flexShrink={0} marginTop={1} borderStyle="rounded" borderColor={session.dangerous ? theme.colors.error : theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}><box width="64%" flexDirection="column"><box flexDirection="row" gap={1}><box width="34%"><WorkbenchField field={types} value={session.values.types} error={session.fieldErrors.types} focused={session.focusedControlId === "types"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("types")} onChange={(value) => session.setField("types", value)} /></box><box width="22%"><WorkbenchField field={minCount} value={session.values.minCount} error={session.fieldErrors.minCount} focused={session.focusedControlId === "minCount"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("minCount")} onChange={(value) => session.setField("minCount", value)} /></box><box width="44%"><WorkbenchField field={galleryMarker} value={session.values.galleryMarker} error={session.fieldErrors.galleryMarker} focused={session.focusedControlId === "galleryMarker"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("galleryMarker")} onChange={(value) => session.setField("galleryMarker", value)} /></box></box><box flexDirection="row" gap={1}><box width="50%"><WorkbenchField field={outputPath} value={session.values.outputPath} error={session.fieldErrors.outputPath} focused={session.focusedControlId === "outputPath"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("outputPath")} onChange={(value) => session.setField("outputPath", value)} /></box><box width="50%"><WorkbenchField field={configPath} value={session.values.configPath} error={session.fieldErrors.configPath} focused={session.focusedControlId === "configPath"} disabled={session.phase === "running"} t={t} onFocus={() => session.focus("configPath")} onChange={(value) => session.setField("configPath", value)} /></box></box></box><box flexGrow={1} flexDirection="column"><box flexDirection="row" gap={1}>{switches.map((field) => <box key={field.id} flexGrow={1}><WorkbenchField field={field} value={session.values[field.id]} error={session.fieldErrors[field.id]} focused={session.focusedControlId === field.id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(field.id)} onChange={(value) => session.setField(field.id, value)} /></box>)}</box><box flexGrow={1} /><ExecutionActions session={session} executeLabel={`▶ ${language === "zh" ? "开始重打包" : "Run repack"}`} confirmLabel={`${terminalIcon("danger")} ${language === "zh" ? "确认执行" : "Confirm"}`} /></box></box>
  </box>
}
