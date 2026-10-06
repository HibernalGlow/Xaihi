// Inspector for the selected workflow step: module choice plus a JSON config
// snapshot. Invalid JSON stays local with a hint and is never committed, so
// saved workflows always hold parseable configuration objects.
import { useEffect, useMemo, useRef, useState } from "react"
import type { MarkuWorkflowStep } from "@xiranite/node-marku/core"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { findModuleMeta } from "./constants"
import { ModulePicker } from "./controls"

interface WorkflowInspectorProps {
  running: boolean
  step: MarkuWorkflowStep | undefined
  stepIndex: number
  onConfigChange: (stepId: string, config: Record<string, unknown>) => void
  onModuleChange: (stepId: string, module: string) => void
}

export function WorkflowInspector(props: WorkflowInspectorProps) {
  if (!props.step) {
    return (
      <div data-testid="marku-workflow-inspector" className="rounded-lg border border-dashed bg-background/60 p-3 text-center text-xs text-muted-foreground">
        选择一个步骤后可编辑模块与配置。
      </div>
    )
  }

  const step = props.step
  const meta = findModuleMeta(step.module)
  return (
    <div data-testid="marku-workflow-inspector" className="grid gap-2 rounded-lg border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">步骤 {props.stepIndex + 1} · {meta.label}</div>
      </div>
      <ModulePicker compact disabled={props.running} module={meta.id} onModuleChange={(module) => props.onModuleChange(step.id, module)} />
      <StepConfigField
        ariaLabel="marku workflow step config"
        config={step.config}
        disabled={props.running}
        inputId="marku-workflow-step-config"
        seedKey={step.id}
        onConfigChange={(config) => props.onConfigChange(step.id, config)}
      />
      <p className="text-xs text-muted-foreground">{meta.description}</p>
    </div>
  )
}

/**
 * Shared JSON config editor for a workflow step: used by the sidebar inspector
 * and by the on-node popover. Invalid JSON stays local and is never committed;
 * the editor re-seeds only when a different step (seedKey) is targeted.
 */
export function StepConfigField(props: {
  ariaLabel: string
  config: Record<string, unknown> | undefined
  disabled: boolean
  inputId: string
  seedKey: string
  onConfigChange: (config: Record<string, unknown>) => void
}) {
  const serializedConfig = stringifyConfig(props.config)
  const [configText, setConfigText] = useState(() => serializedConfig)
  const seedKeyRef = useRef(props.seedKey)

  useEffect(() => {
    setConfigText((current) => {
      if (seedKeyRef.current !== props.seedKey) return serializedConfig
      const currentConfig = parseConfigText(current)
      if (!currentConfig) return current
      return configSignature(currentConfig) === configSignature(props.config) ? current : serializedConfig
    })
    seedKeyRef.current = props.seedKey
  }, [props.seedKey, serializedConfig, props.config])

  const parsed = useMemo(() => parseConfigText(configText), [configText])

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.inputId} className="text-xs">步骤配置 JSON</Label>
      <Textarea
        id={props.inputId}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        className="h-20 min-h-0 resize-none font-mono text-xs"
        placeholder='{"mode":"h2l","bullet":"- "}'
        value={configText}
        onChange={(event) => {
          const value = event.currentTarget.value
          setConfigText(value)
          const next = parseConfigText(value)
          if (next) props.onConfigChange(next)
        }}
      />
      {!parsed && (
        <p className="text-xs text-destructive">JSON 无效，修正后才会保存到步骤。</p>
      )}
    </div>
  )
}

function stringifyConfig(config: Record<string, unknown> | undefined): string {
  if (!config || !Object.keys(config).length) return ""
  return JSON.stringify(config)
}

function configSignature(config: Record<string, unknown> | undefined): string {
  return JSON.stringify(config ?? {})
}

/** Empty text means an empty config; anything else must parse to a plain object. */
function parseConfigText(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}
