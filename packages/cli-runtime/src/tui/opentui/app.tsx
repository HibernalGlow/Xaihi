/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import type { InteractionField, InteractionValue, TerminalInteractionDefinition, TerminalViewSection } from "../../interaction.js"
import type { TerminalPreferenceController, TerminalPreferenceValues } from "../index.js"
import { createTerminalTranslator, type TerminalLanguage, type TerminalTranslator } from "../i18n.js"
import { nextInteractionValue, resolveInteractionView, stepInteractionNumber } from "../screen.js"
import { useTerminalUiSession } from "../session.js"
import { useTerminalChromeActions } from "./chrome-actions.js"
import { listTerminalThemes, resolveTerminalTheme, TerminalThemeProvider, useTerminalTheme } from "../theme.js"
import { terminalIcon } from "../icons.js"
import { ProgressBar } from "./progress-bar.js"
import { PreviewTable } from "./preview-table.js"
import { ActionTabs } from "./action-tabs.js"
import { ClickTarget, WorkbenchButton, WorkbenchField, WorkbenchPanel } from "./workbench-controls.js"

export function OpenTuiTerminalApp<Input, Result>({
  definition,
  language,
  theme,
  preferences,
  onExit,
}: {
  definition: TerminalInteractionDefinition<Input, Result>
  language: TerminalLanguage
  theme?: string
  preferences?: TerminalPreferenceController
  help?: import("@xiranite/contract").NodeHelp
  onExit: () => void
}): ReactNode {
  const t = createTerminalTranslator(language)
  const [previewTheme, setPreviewTheme] = useState(theme ?? preferences?.current.theme ?? "nord")
  return (
    <TerminalThemeProvider theme={resolveTerminalTheme(previewTheme === "inherit" ? "nord" : previewTheme)}>
      <OpenTuiTerminalScreen definition={definition} preferences={preferences} onThemePreview={setPreviewTheme} onExit={onExit} t={t} />
    </TerminalThemeProvider>
  )
}

function OpenTuiTerminalScreen<Input, Result>({
  definition,
  preferences,
  onThemePreview,
  onExit,
  t,
}: {
  definition: TerminalInteractionDefinition<Input, Result>
  preferences?: TerminalPreferenceController
  onThemePreview: (theme: string) => void
  onExit: () => void
  t: TerminalTranslator
}): ReactNode {
  const theme = useTerminalTheme()
  const session = useTerminalUiSession(definition)
  useTerminalChromeActions({ onReset: session.reset, onExit })
  const view = resolveInteractionView(definition.schema, session.values, t)
  const sections = visibleSections(view.sections, session.fields, t)
  const [activeSectionId, setActiveSectionId] = useState(() => sections[0]?.id ?? "")
  const [showPreferences, setShowPreferences] = useState(false)
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0]
  const display = view.dashboard.display(session.values)
  const dashboardTable = session.resultSummary?.table ?? display.table
  useEffect(() => {
    if (!sections.some((section) => section.id === activeSectionId)) setActiveSectionId(sections[0]?.id ?? "")
  }, [activeSectionId, sections])
  const controlIds = useMemo(
    () => showPreferences
      ? ["pref-theme", "pref-mode", "pref-language", "pref-save", "pref-restore", "pref-back"]
      : session.confirming
      ? ["confirm-execute", "confirm-dismiss"]
      : [
          ...(sections.length > 1 ? ["section-tabs"] : []),
          ...(activeSection?.fields.map((field) => field.id) ?? []),
          "execute",
          "reset",
          "tab-status",
          "tab-logs",
          ...(preferences ? ["settings"] : []),
          "exit",
        ],
    [activeSection, preferences, sections.length, session.confirming, showPreferences],
  )

  useKeyboard((key) => {
    const focusedField = session.fields.find((field) => field.id === session.focusedControlId)
    const editingText = focusedField?.kind === "text" || focusedField?.kind === "multiline" || focusedField?.kind === "path-list"
    if (key.name === "escape") {
      if (showPreferences) setShowPreferences(false)
      else if (session.confirming) session.dismissConfirmation()
      else if (session.phase === "running") session.cancel()
      else onExit()
      return
    }
    if (key.name === "tab") {
      session.moveFocus(controlIds, key.shift ? -1 : 1)
      return
    }
    if (session.focusedControlId === "section-tabs") {
      const direction = key.name === "left" || key.name === "up" ? -1 : key.name === "right" || key.name === "down" ? 1 : 0
      if (direction && sections.length > 1) {
        const currentIndex = Math.max(0, sections.findIndex((section) => section.id === activeSection?.id))
        setActiveSectionId(sections[(currentIndex + direction + sections.length) % sections.length]?.id ?? activeSectionId)
      }
      return
    }
    if (key.name === "q" && !editingText && session.phase !== "running") {
      onExit()
      return
    }
    if (focusedField) {
      if (editingText) return
      handleFieldKeyboard(focusedField, session.values[focusedField.id], key, t, session.setField)
      return
    }
    if (key.name === "return" || key.name === "space" || key.sequence === " ") {
      if (session.focusedControlId === "settings" && preferences) {
        session.focus("pref-theme")
        setShowPreferences(true)
      } else {
        activateControl(session.focusedControlId, session, onExit)
      }
    }
  })

  if (showPreferences && preferences) {
    return <TerminalPreferencesScreen controller={preferences} focusedId={session.focusedControlId} onFocus={session.focus} onPreviewTheme={onThemePreview} onBack={() => setShowPreferences(false)} />
  }


  return (
    <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
      <box flexDirection="row" justifyContent="space-between" height={4} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1}>
        <box flexDirection="column">
          <text fg={theme.colors.primary}><b>{`${terminalIcon("status")} ${definition.schema.title.toUpperCase()} // NATIVE CONTROL PLANE`}</b></text>
          <text fg={theme.colors.mutedForeground}>{definition.schema.description}</text>
        </box>
        <box flexDirection="column" alignItems="flex-end">
          <text fg={phaseColor(session.phase, theme)}><b>{phaseLabel(session.phase, t).toUpperCase()}</b></text>
          <box flexDirection="row">{preferences ? <ClickTarget id="settings" focused={session.focusedControlId === "settings"} onClick={() => { session.focus("pref-theme"); setShowPreferences(true) }}>{`${terminalIcon("settings")} 设置`}</ClickTarget> : null}<text fg={theme.colors.mutedForeground}>OpenTUI · native widgets · buffered</text></box>
        </box>
      </box>
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <WorkbenchPanel title={t("parameters")} width="42%">
          {sections.length > 1 ? (
            <ActionTabs
              id="section-tabs"
              options={sections.map((section) => ({ value: section.id, label: section.title, hint: section.description }))}
              value={activeSection?.id}
              focused={session.focusedControlId === "section-tabs"}
              disabled={session.phase === "running"}
              onFocus={() => session.focus("section-tabs")}
              onChange={(value) => setActiveSectionId(String(value))}
            />
          ) : null}
          <scrollbox focused={activeSection?.fields.some((field) => field.id === session.focusedControlId)} flexGrow={1} scrollbarOptions={{ trackOptions: { foregroundColor: theme.colors.primary, backgroundColor: theme.colors.border } }}>
            {activeSection?.description ? <text fg={theme.colors.mutedForeground}>{activeSection.description}</text> : null}
            {activeSection ? <FieldList fields={activeSection.fields} session={session} t={t} /> : null}
          </scrollbox>
        </WorkbenchPanel>

        <WorkbenchPanel title={view.dashboard.title} description={view.dashboard.description} flexGrow={1}>
          <box flexDirection="row" flexShrink={0} minHeight={3}>
            <box flexDirection="column" justifyContent="center" flexGrow={1} minWidth={0}>
              {/^[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(display.primary)
                ? <ascii-font text={display.primary} font="grid" color={[theme.colors.primary, theme.colors.focusRing]} />
                : <text fg={theme.colors.primary}><b>{display.primary}</b></text>}
              {display.secondary ? <text fg={theme.colors.mutedForeground}>{display.secondary}</text> : null}
            </box>
            {display.metrics?.length ? (
              <box flexDirection="column" width="42%" justifyContent="center">
                {display.metrics.map((metric) => (
                  <box key={metric.label} flexDirection="row" justifyContent="space-between" borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1}>
                    <text fg={theme.colors.mutedForeground}>{metric.label}</text>
                    <text fg={theme.colors.foreground}><b>{metric.value}</b></text>
                  </box>
                ))}
              </box>
            ) : null}
          </box>
          {dashboardTable ? (
            <scrollbox
              id="dashboard-result-table"
              flexGrow={1}
              minHeight={3}
              scrollbarOptions={{ trackOptions: { foregroundColor: theme.colors.primary, backgroundColor: theme.colors.border } }}
            >
              <PreviewTable table={dashboardTable} maxRows={dashboardTable.rows.length} />
            </scrollbox>
          ) : (
            <scrollbox flexGrow={1} minHeight={2} scrollbarOptions={{ trackOptions: { foregroundColor: theme.colors.primary, backgroundColor: theme.colors.border } }}>
              {session.preview.map((line, index) => <text key={`${line}-${index}`} fg={index === 0 ? theme.colors.foreground : theme.colors.mutedForeground}>{`${index === 0 ? "›" : "·"} ${line}`}</text>)}
            </scrollbox>
          )}
        </WorkbenchPanel>
      </box>

      <box flexDirection="row" height={8} gap={1} marginTop={1}>
        <WorkbenchPanel title={session.confirming ? session.dangerPrompt?.title ?? t("confirmLiveTitle") : t("execution")} width="38%">
          {session.confirming ? (
            <Confirmation session={session} t={t} />
          ) : (
            <box flexDirection="column" justifyContent="flex-end" flexGrow={1}>
              <text fg={session.dangerous ? theme.colors.error : theme.colors.mutedForeground}>{session.dangerous ? t("hazardNotice") : session.preview[0] ?? t("waitingForRun")}</text>
              <WorkbenchButton
                id="execute"
                focused={session.focusedControlId === "execute"}
                danger={session.dangerous}
                onClick={() => session.phase === "running" ? session.cancel() : void session.requestExecute()}
              >
                {executeLabel(session, t)}
              </WorkbenchButton>
              <box flexDirection="row" gap={1}>
                <ClickTarget id="reset" focused={session.focusedControlId === "reset"} onClick={session.reset}>{t("resetParameters")}</ClickTarget>
                <ClickTarget id="exit" focused={session.focusedControlId === "exit"} onClick={onExit}>{t("exit")}</ClickTarget>
              </box>
            </box>
          )}
        </WorkbenchPanel>

        <WorkbenchPanel title="" flexGrow={1}>
          <box flexDirection="row" justifyContent="space-between">
            <box flexDirection="row" gap={1}>
              <ClickTarget id="tab-status" focused={session.focusedControlId === "tab-status"} selected={session.resultTab === "status"} onClick={() => session.selectResultTab("status")}>{t("statusTab")}</ClickTarget>
              <ClickTarget id="tab-logs" focused={session.focusedControlId === "tab-logs"} selected={session.resultTab === "logs"} onClick={() => session.selectResultTab("logs")}>{`${t("logsTab")} (${session.logs.length})`}</ClickTarget>
            </box>
            <text fg={theme.colors.mutedForeground}>{session.phase === "running" ? "ESC = STOP" : "TAB / MOUSE"}</text>
          </box>
          {session.resultTab === "logs" ? (
            <scrollbox focused={session.focusedControlId === "tab-logs"} flexGrow={1} marginTop={1} scrollbarOptions={{ trackOptions: { foregroundColor: theme.colors.primary, backgroundColor: theme.colors.border } }}>
              {session.logs.length
                ? session.logs.map((line, index) => <text key={`${line}-${index}`} fg={theme.colors.mutedForeground}>{`${String(index + 1).padStart(2, "0")}  ${line}`}</text>)
                : <text fg={theme.colors.mutedForeground}>{t("emptyLogs")}</text>}
            </scrollbox>
          ) : (
            <box flexDirection="column" marginTop={1} minHeight={0} flexGrow={1}>
              <ProgressBar value={session.progress} label={session.status || t("waitingForRun")} />
              {session.error ? <text fg={theme.colors.error}>{session.error}</text> : null}
              {session.resultSummary ? <text fg={session.resultSummary.success ? theme.colors.success : theme.colors.error}>{session.resultSummary.message}</text> : null}
              {session.resultSummary?.lines.slice(0, 3).map((line, index) => <text key={`${line}-${index}`}>{line}</text>)}
            </box>
          )}
        </WorkbenchPanel>
      </box>
    </box>
  )
}

export function TerminalPreferencesScreen({ controller, focusedId, onFocus, onPreviewTheme, onBack }: {
  controller: TerminalPreferenceController
  focusedId?: string
  onFocus: (id: string) => void
  onPreviewTheme: (theme: string) => void
  onBack: () => void
}): ReactNode {
  const theme = useTerminalTheme()
  const [values, setValues] = useState<TerminalPreferenceValues>(controller.current)
  const [message, setMessage] = useState("配置仅写入 nodes.<id>.cli，不影响桌面 UI。")
  const update = (patch: Partial<TerminalPreferenceValues>) => {
    const next = { ...values, ...patch }
    setValues(next)
    if (patch.theme) onPreviewTheme(patch.theme)
  }
  return (
    <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      <WorkbenchPanel title={`${terminalIcon("settings")} ${controller.nodeId} CLI 设置`} description="主题可即时预览；启动模式只影响无参数 CLI。" flexGrow={1}>
        <box flexDirection="column">
          <text fg={theme.colors.mutedForeground}>主题</text>
          <box height={3} flexShrink={0} overflow="hidden">
            <ActionTabs id="pref-theme" options={["inherit", ...listTerminalThemes()].map((value) => ({ value, label: value }))} value={values.theme} focused={focusedId === "pref-theme"} onFocus={() => onFocus("pref-theme")} onChange={(value) => update({ theme: String(value) })} />
          </box>
          <text fg={theme.colors.mutedForeground}>默认启动模式</text>
          <ActionTabs id="pref-mode" options={[{ value: "ui", label: "UI" }, { value: "gd", label: "引导" }, { value: "pipe", label: "纯命令行" }]} value={values.defaultMode} focused={focusedId === "pref-mode"} onFocus={() => onFocus("pref-mode")} onChange={(value) => update({ defaultMode: value as TerminalPreferenceValues["defaultMode"] })} />
          <text fg={theme.colors.mutedForeground}>语言</text>
          <ActionTabs id="pref-language" options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} value={values.language} focused={focusedId === "pref-language"} onFocus={() => onFocus("pref-language")} onChange={(value) => update({ language: value as TerminalPreferenceValues["language"] })} />
          <box borderStyle="rounded" borderColor={theme.colors.focusRing} height={3} flexShrink={0} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2} alignItems="center">
            <text fg={theme.colors.primary}><b>{`${terminalIcon("result")} 主题预览 / ${values.theme}`}</b></text>
            <box flexDirection="row" gap={2}><text fg={theme.colors.foreground}>主要文字</text><text fg={theme.colors.mutedForeground}>次要文字</text><text fg={theme.colors.success}>成功</text><text fg={theme.colors.warning}>警告</text><text fg={theme.colors.error}>危险</text></box>
          </box>
          <text fg={theme.colors.mutedForeground}>{message}</text>
          <box flexDirection="row" gap={1}>
            <WorkbenchButton id="pref-save" focused={focusedId === "pref-save"} onClick={() => void controller.save(values).then(() => setMessage("已保存到 xiranite.config.toml。"), (error) => setMessage(`保存失败：${String(error)}`))}>保存</WorkbenchButton>
            <ClickTarget id="pref-restore" focused={focusedId === "pref-restore"} onClick={() => void controller.restore().then((restored) => { setValues(restored); onPreviewTheme(restored.theme); setMessage("已从配置文件恢复。") })}>恢复</ClickTarget>
            <ClickTarget id="pref-back" focused={focusedId === "pref-back"} onClick={onBack}>返回工作台</ClickTarget>
          </box>
        </box>
      </WorkbenchPanel>
    </box>
  )
}

function visibleSections(
  sections: readonly TerminalViewSection[],
  fields: readonly InteractionField[],
  t: TerminalTranslator,
): Array<TerminalViewSection & { fields: readonly InteractionField[] }> {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const assigned = new Set<string>()
  const visible = sections.flatMap((section) => {
    const sectionFields = section.fieldIds.flatMap((id) => {
      const field = byId.get(id)
      if (!field) return []
      assigned.add(id)
      return [field]
    })
    return sectionFields.length ? [{ ...section, fields: sectionFields }] : []
  })
  const unassigned = fields.filter((field) => !assigned.has(field.id))
  if (unassigned.length) visible.push({ id: "other", title: t("parameters"), fieldIds: unassigned.map((field) => field.id), fields: unassigned })
  return visible
}

function FieldList({
  fields,
  session,
  t,
}: {
  fields: readonly InteractionField[]
  session: ReturnType<typeof useTerminalUiSession<unknown, unknown>>
  t: TerminalTranslator
}) {
  return (
    <box flexDirection="column">
      {fields.map((field) => (
        <WorkbenchField
          key={field.id}
          field={field}
          value={session.values[field.id]}
          error={session.fieldErrors[field.id]}
          focused={session.focusedControlId === field.id}
          disabled={session.phase === "running"}
          t={t}
          onFocus={() => session.focus(field.id)}
          onChange={(value) => session.setField(field.id, value)}
        />
      ))}
    </box>
  )
}

function Confirmation({
  session,
  t,
}: {
  session: ReturnType<typeof useTerminalUiSession<unknown, unknown>>
  t: TerminalTranslator
}) {
  const theme = useTerminalTheme()
  return (
    <box flexDirection="column">
      <text fg={theme.colors.error}>{session.dangerPrompt?.body ?? t("confirmLiveBody")}</text>
      <box flexDirection="row" gap={1} marginTop={1}>
        <WorkbenchButton id="confirm-execute" danger focused={session.focusedControlId === "confirm-execute"} onClick={() => void session.confirmExecute()}>{session.dangerPrompt?.confirmLabel ?? t("confirmLiveAction")}</WorkbenchButton>
        <ClickTarget id="confirm-dismiss" focused={session.focusedControlId === "confirm-dismiss"} onClick={session.dismissConfirmation}>{t("dismiss")}</ClickTarget>
      </box>
    </box>
  )
}

function handleFieldKeyboard(
  field: InteractionField,
  value: InteractionValue | undefined,
  key: { name: string; sequence: string },
  t: TerminalTranslator,
  setField: (fieldId: string, value: InteractionValue) => void,
) {
  if (field.kind === "select" || field.kind === "boolean") {
    const direction = key.name === "left" || key.name === "up" ? -1 : key.name === "right" || key.name === "down" || key.name === "return" || key.name === "space" || key.sequence === " " ? 1 : 0
    if (direction) {
      const next = nextInteractionValue(field, value, direction, t)
      if (next !== undefined) setField(field.id, next)
    }
    return
  }
  if (field.kind === "number") {
    const direction = key.name === "up" || key.name === "right" ? 1 : key.name === "down" || key.name === "left" ? -1 : 0
    if (direction) setField(field.id, stepInteractionNumber(field, value, direction))
    return
  }
  if (key.name === "backspace" || key.name === "delete") {
    setField(field.id, String(value ?? "").slice(0, -1))
  } else if (key.sequence && key.sequence.length === 1 && key.name !== "return") {
    setField(field.id, `${String(value ?? "")}${key.sequence}`)
  }
}

function activateControl<Result>(
  controlId: string | undefined,
  session: ReturnType<typeof useTerminalUiSession<unknown, Result>>,
  onExit: () => void,
) {
  if (controlId === "execute") void session.requestExecute()
  if (controlId === "reset") session.reset()
  if (controlId === "tab-status") session.selectResultTab("status")
  if (controlId === "tab-logs") session.selectResultTab("logs")
  if (controlId === "exit") onExit()
  if (controlId === "confirm-execute") void session.confirmExecute()
  if (controlId === "confirm-dismiss") session.dismissConfirmation()
}

function executeLabel(session: ReturnType<typeof useTerminalUiSession<unknown, unknown>>, t: TerminalTranslator): string {
  if (session.phase === "running") return t("stopAction")
  const dryRunField = session.fields.find((field) => field.kind === "boolean" && /dry/i.test(field.id))
  if (dryRunField && session.values[dryRunField.id] === true) return t("dryRunAction")
  return session.dangerous ? t("liveAction") : t("run")
}

function phaseLabel(phase: ReturnType<typeof useTerminalUiSession<unknown, unknown>>["phase"], t: TerminalTranslator) {
  if (phase === "running") return t("running")
  if (phase === "result") return t("statusTab")
  return t("ready")
}

function phaseColor(phase: ReturnType<typeof useTerminalUiSession<unknown, unknown>>["phase"], theme: ReturnType<typeof useTerminalTheme>) {
  if (phase === "running") return theme.colors.warning
  if (phase === "result") return theme.colors.success
  return theme.colors.mutedForeground
}
