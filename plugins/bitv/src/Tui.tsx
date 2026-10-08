/* @jsxImportSource @opentui/react */
import { useState } from "react"
import { ActionTabs, ExecutionActions, ProgressBar, resolveTerminalTheme, TerminalThemeProvider, terminalIcon, useAnimation, useTerminalChromeActions, useTerminalTheme, useTerminalUiSession, WorkbenchField, WorkbenchPanel } from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { BitvInput, BitvResult } from "./core.ts"

export function BitvTui(props: TerminalUiScreenProps<BitvInput, BitvResult>): import('react').ReactNode {
  const [name] = useState(props.theme ?? "inherit")
  return <TerminalThemeProvider theme={resolveTerminalTheme(name === "inherit" ? "nord" : name)}><BitvWorkbench {...props} /></TerminalThemeProvider>
}

function BitvWorkbench({ definition, language, onExit }: TerminalUiScreenProps<BitvInput, BitvResult>) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 110 : 480 })
  useTerminalChromeActions({ onReset: session.reset, onExit })
  const source = session.fields.filter((field) => ["paths", "reportPath", "recursive", "bitrateStepMbps", "maxLevels"].includes(field.id))
  const output = session.fields.filter((field) => ["outputPath", "targetPath", "transferMode", "dryRun"].includes(field.id))
  const rows = session.resultSummary?.table?.rows

  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1}>
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("status")} BITV // VIDEO ANALYSIS LAB`}</b></text><text fg={theme.colors.mutedForeground}>{language === "zh" ? "视频队列、码率分布与安全分类" : "Video queue, bitrate distribution and safe classification"}</text></box>
      <text fg={session.phase === "running" ? theme.colors.warning : theme.colors.primary}>{`${session.phase === "running" ? "SCANNING" : "READY"} ${["⠁", "⠂", "⠄", "⡀", "⢀"][frame % 5]}`}</text>
    </box>

    <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between">
      <ActionTabs id="field-action" options={[{ value: "status", label: "◉ 状态" }, { value: "analyze", label: "⌕ 分析" }, { value: "classify", label: "▤ 分类" }, { value: "report", label: "▣ 报告" }]} value={session.values.action} focused={session.focusedControlId === "action"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} />
      <box flexDirection="row"><text fg={theme.colors.mutedForeground}>{`FILES ${rows?.length ?? 0}  ·  PROGRESS ${session.progress}%`}</text></box>
    </box>

    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
      <WorkbenchPanel title={language === "zh" ? "视频来源" : "Video sources"} width="32%">
        <scrollbox flexGrow={1}>{source.map((field) => <WorkbenchField key={field.id} field={field} value={session.values[field.id]} error={session.fieldErrors[field.id]} focused={session.focusedControlId === field.id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(field.id)} onChange={(value) => session.setField(field.id, value)} />)}</scrollbox>
      </WorkbenchPanel>
      <WorkbenchPanel title={language === "zh" ? "码率分析台" : "Bitrate workbench"} flexGrow={1}>
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <ascii-font text={session.phase === "running" ? "SCAN" : rows?.length ? "DATA" : "BITV"} font="tiny" color={[theme.colors.primary, theme.colors.focusRing]} />
          <box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>FILE</text><text fg={theme.colors.mutedForeground}>BITRATE  /  LEVEL</text></box>
          <scrollbox flexGrow={1} id="bitv-results">{rows?.length ? rows.map((row, index) => <box key={`${row.file}-${index}`} height={2} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.foreground}>{`▸ ${row.file}`}</text><text fg={theme.colors.primary}>{`${row.bitrate}  ${row.level}`}</text></box>) : session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index ? theme.colors.mutedForeground : theme.colors.foreground}>{`${index ? "·" : "▸"} ${line}`}</text>)}</scrollbox>
          <ProgressBar value={session.progress} label={session.status || "READY"} />
        </box>
      </WorkbenchPanel>
    </box>

    <box height={8} minHeight={8} flexShrink={0} marginTop={1} borderStyle="rounded" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="column">
      <text fg={theme.colors.primary}><b>{`▣ ${language === "zh" ? "分类参数闸门" : "Classification strip"}`}</b></text>
      <box flexDirection="row" flexGrow={1} gap={2}>{output.map((field) => <box key={field.id} width="23%"><WorkbenchField field={field} value={session.values[field.id]} error={session.fieldErrors[field.id]} focused={session.focusedControlId === field.id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(field.id)} onChange={(value) => session.setField(field.id, value)} /></box>)}</box>
      <box flexDirection="row" justifyContent="flex-end"><ExecutionActions session={session} executeLabel="▶ 执行分析" confirmLabel="⚠ 确认后分类" /></box>
    </box>
  </box>
}
