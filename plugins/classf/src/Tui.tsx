/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import { ActionTabs, ClickTarget, ExecutionActions, ProgressBar, resolveTerminalTheme, TerminalPreferencesScreen, TerminalThemeProvider, terminalIcon, useAnimation, useTerminalChromeActions, useTerminalTheme, useTerminalUiSession, WorkbenchButton, WorkbenchField, WorkbenchPanel } from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { ClassfInput, ClassfResult } from "./core.ts"

const QUEUE_FIELDS = ["alreadyEnabled", "waitEnabled", "delEnabled", "sameaGroupAlreadyEnabled", "sameaGroupWaitEnabled", "sameaGroupDelEnabled"] as const

export function ClassfTui(props: TerminalUiScreenProps<ClassfInput, ClassfResult>): import("react").ReactNode {
  const [previewTheme, setPreviewTheme] = useState(props.theme ?? props.preferences?.current.theme ?? "inherit")
  return <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}><ClassfWorkbench {...props} onThemePreview={setPreviewTheme} /></TerminalThemeProvider>
}

function ClassfWorkbench({ definition, language, preferences, onExit, onThemePreview }: TerminalUiScreenProps<ClassfInput, ClassfResult> & { onThemePreview: (theme: string) => void }) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const [settings, setSettings] = useState(false)
  const frame = useAnimation({ intervalMs: session.phase === "running" ? 110 : 620 })
  const field = (id: string) => definition.schema.fields.find((item) => item.id === id)
  const sourceCount = String(session.values.pathsText ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).length
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
  if (session.confirming) return <ConfirmTransfer language={language} session={session} />

  const Field = ({ id }: { id: string }) => {
    const item = field(id)
    if (!item) return null
    return <WorkbenchField field={item} value={session.values[id]} error={session.fieldErrors[id]} focused={session.focusedControlId === id} disabled={session.phase === "running" || (id === "targetDir" && session.values.placementMode !== "root")} t={t} onFocus={() => session.focus(id)} onChange={(value) => session.setField(id, value)} />
  }

  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between"><box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("section")} CLASSF // TRANSFER CONTROL`}</b></text><text fg={theme.colors.mutedForeground}>{session.status || (language === "zh" ? "来源列表、分类计划与安全传输" : "Source list, classification plan and safe transfer")}</text></box><box flexDirection="column" alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.primary}>{`${session.phase === "running" ? "TRANSFERRING" : "READY"} ${["◴", "◷", "◶", "◵"][frame % 4]}`}</text>{preferences ? <ClickTarget id="settings" onClick={() => setSettings(true)}>{`${terminalIcon("settings")} CONFIG`}</ClickTarget> : null}</box></box>
    <box height={3} marginTop={1} flexShrink={0} flexDirection="row" justifyContent="space-between"><ActionTabs id="field-action" options={[{ value: "plan", label: "⌕ 规划" }, { value: "classify", label: "▶ 分类" }]} value={String(session.values.action ?? "plan")} focused={session.focusedControlId === "action"} disabled={session.phase === "running"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} /><text fg={theme.colors.mutedForeground}>{`${terminalIcon("path")} ${sourceCount} · ${session.progress}%`}</text></box>
    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}><WorkbenchPanel title={`${terminalIcon("path")} ${language === "zh" ? "来源列表" : "Source list"}`} width="37%"><box flexDirection="column" flexGrow={1} minHeight={0}><Field id="pathsText" /><scrollbox flexGrow={1}>{String(session.values.pathsText ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value, index) => <text key={`${value}-${index}`} fg={theme.colors.mutedForeground}>{`${index === 0 ? "▸" : "·"} ${value}`}</text>)}</scrollbox></box></WorkbenchPanel><WorkbenchPanel title={`${terminalIcon("section")} ${language === "zh" ? "分类计划" : "Classification plan"}`} flexGrow={1}><box flexDirection="column" flexGrow={1} minHeight={0}><box flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>{`${terminalIcon("logs")} PLAN / DESTINATION`}</text><text fg={session.dangerous ? theme.colors.error : theme.colors.success}>{session.dangerous ? "LIVE / ARMED" : "DRY-RUN / SAFE"}</text></box><scrollbox flexGrow={1} minHeight={4}>{rows.length ? rows.map((row, index) => <text key={`${row.sourceName}-${index}`} fg={row.status === "error" ? theme.colors.error : theme.colors.foreground}>{`${row.status === "moved" || row.status === "copied" ? terminalIcon("result") : "▸"} ${row.sourceName} → ${row.targetRelative}`}</text>) : session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index ? theme.colors.mutedForeground : theme.colors.primary}>{`${index ? "·" : "$"} ${line}`}</text>)}</scrollbox><ProgressBar value={session.progress} label={session.status || "READY"} /></box></WorkbenchPanel></box>
    <box height={13} minHeight={13} flexShrink={0} marginTop={1} borderStyle="rounded" borderColor={session.dangerous ? theme.colors.error : theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}><box width="74%" flexDirection="column"><box flexDirection="row" gap={1}><box width="20%"><Field id="placementMode" /></box><box width="30%"><Field id="targetDir" /></box><box width="17%"><Field id="transferMode" /></box><box width="25%"><Field id="existingPolicy" /></box></box><text fg={theme.colors.mutedForeground}>{language === "zh" ? "队列 / SameA 分组" : "Queues / SameA grouping"}</text><QueueFieldRows fields={QUEUE_FIELDS} render={(id) => <Field id={id} />} /></box><box flexGrow={1} flexDirection="column"><box><Field id="dryRun" /></box><box flexGrow={1} /><ExecutionActions session={session} executeLabel={`▶ ${language === "zh" ? "执行分类" : "Run classify"}`} confirmLabel={`${terminalIcon("danger")} ${language === "zh" ? "确认传输" : "Confirm"}`} /></box></box>
  </box>
}

function QueueFieldRows(props: { fields: readonly string[]; render: (id: string) => import("react").ReactNode }) {
  return <box flexDirection="column" gap={1}>{[props.fields.slice(0, 3), props.fields.slice(3)].map((row, rowIndex) => <box key={rowIndex} flexDirection="row" gap={1}>{row.map((id) => <box key={id} width="33%">{props.render(id)}</box>)}</box>)}</box>
}

function ConfirmTransfer(props: { language: string; session: ReturnType<typeof useTerminalUiSession> }) {
  const theme = useTerminalTheme()
  return <box width="100%" height="100%" alignItems="center" justifyContent="center"><box width="70%" height={9} flexDirection="column" borderStyle="double" borderColor={theme.colors.error} paddingLeft={2} paddingRight={2}><text fg={theme.colors.error}><b>{`${terminalIcon("danger")} ${props.language === "zh" ? "确认分类传输" : "Confirm transfer"}`}</b></text><text>{props.session.dangerPrompt?.body}</text><text fg={theme.colors.mutedForeground}>{props.session.preview.join(" · ")}</text><box flexDirection="row" gap={2}><WorkbenchButton id="confirm-execute" danger onClick={() => void props.session.confirmExecute()}>{`${terminalIcon("danger")} ${props.language === "zh" ? "确认执行" : "Run now"}`}</WorkbenchButton><WorkbenchButton id="confirm-dismiss" onClick={props.session.dismissConfirmation}>{`× ${props.language === "zh" ? "取消" : "Cancel"}`}</WorkbenchButton></box></box></box>
}
