import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field"

export interface SwimlaneInteractionSettingsValue {
  soloOnFocus: boolean
  showNavigatorInSolo: boolean
  edgeRevealDelayMs: number
  focusOnHover: boolean
  focusDelayMs: number
  manualScrollEnabled?: boolean
}

export function SwimlaneInteractionSettings({ value, labels, onChange, title = "泳道焦点与独占", description = "控制主泳道独占、切换栏和边缘调阅的响应时机。" }: {
  value: SwimlaneInteractionSettingsValue
  labels?: Partial<Record<"soloOnFocus" | "showNavigatorInSolo" | "edgeRevealDelay" | "focusOnHover" | "focusDelay" | "manualScrollEnabled", string>>
  onChange(patch: Partial<SwimlaneInteractionSettingsValue>): void
  title?: string
  description?: string
}) {
  const [edgeDelay, setEdgeDelay] = useState(String(value.edgeRevealDelayMs))
  const [focusDelay, setFocusDelay] = useState(String(value.focusDelayMs))

  useEffect(() => setEdgeDelay(String(value.edgeRevealDelayMs)), [value.edgeRevealDelayMs])
  useEffect(() => setFocusDelay(String(value.focusDelayMs)), [value.focusDelayMs])

  function commitDelay(kind: "edge" | "focus") {
    const current = kind === "edge" ? value.edgeRevealDelayMs : value.focusDelayMs
    const raw = kind === "edge" ? edgeDelay : focusDelay
    const minimum = kind === "edge" ? 100 : 200
    const next = Math.min(5_000, Math.max(minimum, Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : current))
    if (kind === "edge") setEdgeDelay(String(next))
    else setFocusDelay(String(next))
    if (next !== current) onChange(kind === "edge" ? { edgeRevealDelayMs: next } : { focusDelayMs: next })
  }

  const focusOnHoverLabel = labels?.focusOnHover ?? "启用主泳道悬停重新聚焦"
  const focusDelayLabel = labels?.focusDelay ?? "主泳道悬停重新聚焦延迟"

  return <FieldSet className="gap-3" data-swimlane-interaction-settings="true">
    <div>
      <FieldLegend variant="label" className="mb-1">{title}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
    </div>
    <FieldGroup className="gap-0 overflow-hidden rounded-md border border-border/70">
      <SettingSwitch label={labels?.soloOnFocus ?? "主泳道聚焦时自动独占"} checked={value.soloOnFocus} onCheckedChange={(soloOnFocus) => onChange({ soloOnFocus })} />
      <SettingSwitch label={labels?.showNavigatorInSolo ?? "独占时显示泳道切换栏"} checked={value.showNavigatorInSolo} onCheckedChange={(showNavigatorInSolo) => onChange({ showNavigatorInSolo })} />
      {value.manualScrollEnabled === undefined ? null : <SettingSwitch label={labels?.manualScrollEnabled ?? "允许手动横向滚动"} checked={value.manualScrollEnabled} onCheckedChange={(manualScrollEnabled) => onChange({ manualScrollEnabled })} />}
      <DelaySetting label={labels?.edgeRevealDelay ?? "左右泳道展开延迟"} value={edgeDelay} min={100} disabled={false} onChange={setEdgeDelay} onCommit={() => commitDelay("edge")} />
      <Field orientation="horizontal" className="min-h-12 gap-3 border-t border-border/55 px-3 py-2">
        <FieldContent>
          <FieldTitle>{focusDelayLabel}</FieldTitle>
          <FieldDescription>{focusOnHoverLabel}</FieldDescription>
        </FieldContent>
        <Switch aria-label={focusOnHoverLabel} checked={value.focusOnHover} onCheckedChange={(focusOnHover) => onChange({ focusOnHover })} />
        <Input className="h-8 w-28 shrink-0 tabular-nums" aria-label={focusDelayLabel} type="number" min={200} max={5_000} step={50} disabled={!value.focusOnHover} value={focusDelay} onChange={(event) => setFocusDelay(event.currentTarget.value)} onBlur={() => commitDelay("focus")} onKeyDown={(event) => { if (event.key === "Enter") commitDelay("focus") }} />
      </Field>
    </FieldGroup>
  </FieldSet>
}

function SettingSwitch({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange(checked: boolean): void }) {
  return <Field orientation="horizontal" className="min-h-11 border-t border-border/55 px-3 py-2 first:border-t-0">
    <FieldTitle>{label}</FieldTitle>
    <Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
  </Field>
}

function DelaySetting({ label, value, min, disabled, onChange, onCommit }: { label: string; value: string; min: number; disabled: boolean; onChange(value: string): void; onCommit(): void }) {
  return <Field orientation="horizontal" className="min-h-11 border-t border-border/55 px-3 py-2">
    <FieldTitle>{label}</FieldTitle>
    <Input className="h-8 w-28 shrink-0 tabular-nums" aria-label={label} type="number" min={min} max={5_000} step={50} disabled={disabled} value={value} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onCommit} onKeyDown={(event) => { if (event.key === "Enter") onCommit() }} />
  </Field>
}
