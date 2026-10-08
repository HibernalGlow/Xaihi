/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { ActionLauncher, ActionTabs, ExecutionActions, ProgressBar, TerminalThemeProvider, WorkbenchField, WorkbenchPanel, resolveTerminalTheme, terminalIcon, useAnimation, useTerminalChromeActions, useTerminalTheme, useTerminalUiSession } from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { SameaInput, SameaResult } from "./core.ts"

export function SameaTui(props: TerminalUiScreenProps<SameaInput, SameaResult>): import('react').ReactNode {
  const [theme] = useState(props.theme ?? props.preferences?.current.theme ?? "nord")
  return <TerminalThemeProvider theme={resolveTerminalTheme(theme === "inherit" ? "nord" : theme)}><Extractor {...props} /></TerminalThemeProvider>
}

function Extractor({ definition, language, onExit }: TerminalUiScreenProps<SameaInput, SameaResult>) {
  const theme = useTerminalTheme(), t = createTerminalTranslator(language), session = useTerminalUiSession(definition)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 90 : 520 }), data = session.result?.data
  const [filter, setFilter] = useState<"artistBlacklist" | "pathBlacklist" | "regexBlacklist">("artistBlacklist")
  useTerminalChromeActions({ onReset: session.reset, onExit })
  useKeyboard((key) => { if (key.name === "escape") onExit() })
  const field = (id: string) => definition.schema.fields.find((item) => item.id === id)!
  const Field = ({ id }: { id: string }) => <WorkbenchField field={field(id)} value={session.values[id]} error={session.fieldErrors[id]} focused={session.focusedControlId === id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(id)} onChange={(value) => session.setField(id, value)} />
  const extractor = ["[■]───◇", "[□]─■─◇", "[□]──■◇", "[□]───◆", "[□]──■◇", "[□]─■─◇"][frame % 6]
  return <box width="100%" height="100%" paddingLeft={1} paddingRight={1} flexDirection="column" overflow="hidden">
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("status")} SAMEA // EXTRACTOR PROTOCOL`}</b></text><text fg={theme.colors.mutedForeground}>归档元数据提取 · 画师矩阵 · 安全分类</text></box>
      <box alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.success}>{session.phase === "running" ? "EXTRACTING" : "PROTOCOL READY"}</text><text fg={theme.colors.focusRing}>{extractor}</text></box>
    </box>
    <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between"><ActionLauncher id="samea-command" field={field("action")} session={session} />{session.confirming || session.phase === "running" || session.phase === "paused" ? <ExecutionActions session={session} confirmLabel="▶ 确认移动" /> : <text fg={theme.colors.mutedForeground}>{`⌕ ${data?.scannedCount ?? 0} · ✓ ${data?.readyCount ?? 0} · ! ${data?.errorCount ?? 0}`}</text>}</box>
    <box height={9} flexShrink={0} marginTop={1} flexDirection="row" gap={1}>
      <WorkbenchPanel title="▣ SOURCE CONTROL" description="按行输入归档根目录" width="40%"><Field id="pathsText" /></WorkbenchPanel>
      <WorkbenchPanel title="◇ OPERATION GATE" description="分类阈值与安全开关" flexGrow={1}><box flexDirection="row" gap={1}><box width="28%"><Field id="minOccurrences" /></box><box width="24%"><Field id="centralize" /></box><box width="24%"><Field id="dryRun" /></box><box flexGrow={1}><Field id="ignorePathBlacklist" /></box></box></WorkbenchPanel>
    </box>
    <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
      <WorkbenchPanel title={`⌕ ANALYSIS CHAMBER · ${data?.items.length ?? 0}`} description="画师 / 归档 / 状态 / 目标" width="68%">
        <box height={2} flexShrink={0} flexDirection="row"><box width="22%"><text fg={theme.colors.mutedForeground}>画师</text></box><box width="32%"><text fg={theme.colors.mutedForeground}>归档</text></box><box width="12%"><text fg={theme.colors.mutedForeground}>状态</text></box><text fg={theme.colors.mutedForeground}>目标</text></box>
        <scrollbox id="samea-analysis" flexGrow={1}>{data?.items.length ? data.items.map((item, index) => <box key={`${item.sourcePath}-${index}`} height={2} flexShrink={0} flexDirection="row"><box width="22%"><text fg={theme.colors.primary}>{`♙ ${item.artistName || "—"}`}</text></box><box width="32%"><text>{`▣ ${item.sourceName}`}</text></box><box width="12%"><text fg={item.status === "ready" || item.status === "moved" ? theme.colors.success : item.status === "error" || item.status === "conflict" ? theme.colors.error : theme.colors.warning}>{item.status}</text></box><text fg={theme.colors.mutedForeground}>{`→ ${item.targetPath}`}</text></box>) : <text fg={theme.colors.mutedForeground}>点击“规划”后显示归档分类矩阵。</text>}</scrollbox>
      </WorkbenchPanel>
      <box flexGrow={1} minWidth={0} flexDirection="column" gap={1}>
        <WorkbenchPanel title="⊘ FILTER PROTOCOLS" description="过滤类型是配置视图，不是执行步骤" flexGrow={1}>
          <ActionTabs id="samea-filter-tabs" options={[{ value: "artistBlacklist", label: "♙ 画师" }, { value: "pathBlacklist", label: "▣ 路径" }, { value: "regexBlacklist", label: "⌘ 正则" }]} value={filter} focused={false} onFocus={() => undefined} onChange={(value) => setFilter(value as typeof filter)} />
          <box flexGrow={1} minHeight={0} marginTop={1}><Field id={filter} /></box>
          <box height={5} flexShrink={0}><Field id="archiveExtensions" /></box>
        </WorkbenchPanel>
        <box height={9} flexShrink={0}><WorkbenchPanel title="▦ TELEMETRY" description="扫描与分类状态" flexGrow={1}><box flexDirection="row" justifyContent="space-between"><text>扫描</text><text>{data?.scannedCount ?? 0}</text><text fg={theme.colors.success}>就绪</text><text fg={theme.colors.success}>{data?.readyCount ?? 0}</text><text fg={theme.colors.warning}>忽略</text><text fg={theme.colors.warning}>{data?.ignoredCount ?? 0}</text><text fg={theme.colors.error}>冲突</text><text fg={theme.colors.error}>{data?.conflictCount ?? 0}</text></box><scrollbox flexGrow={1}>{session.logs.map((line, index) => <text key={`${line}-${index}`} fg={theme.colors.mutedForeground}>{`${String(index + 1).padStart(2, "0")} ${line}`}</text>)}</scrollbox><ProgressBar value={session.progress} label={session.status || "EXTRACTOR READY"} /></WorkbenchPanel></box>
      </box>
    </box>
  </box>
}
