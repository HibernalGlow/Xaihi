import { useEffect, useState } from "react"
import { RefreshCcw, RotateCcw, Save, ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS,
  type NodeMemoryProtectionPolicySettingsDTO,
  type NodeMemoryProtectionSettingsDTO,
} from "@xiranite/shared"

import {
  getNodeMemoryProtection,
  setNodeMemoryProtection,
  type NodeMemoryProtectionState,
} from "@/backend/localBackendControl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SettingsStepCard } from "./primitives"

type PolicyField = keyof NodeMemoryProtectionPolicySettingsDTO

const POLICY_FIELDS: ReadonlyArray<{
  key: PolicyField
  labelKey: string
  descriptionKey: string
  unitKey: string
  min: number
  max: number
  step: number
}> = [
  {
    key: "maxRssGrowthMiB",
    labelKey: "settings:memoryProtection.fields.rss.label",
    descriptionKey: "settings:memoryProtection.fields.rss.description",
    unitKey: "settings:memoryProtection.units.mib",
    min: 1,
    max: 65_536,
    step: 128,
  },
  {
    key: "maxHeapGrowthMiB",
    labelKey: "settings:memoryProtection.fields.heap.label",
    descriptionKey: "settings:memoryProtection.fields.heap.description",
    unitKey: "settings:memoryProtection.units.mib",
    min: 1,
    max: 32_768,
    step: 128,
  },
  {
    key: "maxRetainedEvents",
    labelKey: "settings:memoryProtection.fields.events.label",
    descriptionKey: "settings:memoryProtection.fields.events.description",
    unitKey: "settings:memoryProtection.units.events",
    min: 1,
    max: 10_000,
    step: 16,
  },
  {
    key: "sampleIntervalMs",
    labelKey: "settings:memoryProtection.fields.interval.label",
    descriptionKey: "settings:memoryProtection.fields.interval.description",
    unitKey: "settings:memoryProtection.units.ms",
    min: 25,
    max: 60_000,
    step: 25,
  },
] as const

export interface NodeMemoryProtectionSettingsProps {
  available: boolean
  loadSettings?: () => Promise<NodeMemoryProtectionState>
  saveSettings?: (settings: NodeMemoryProtectionSettingsDTO) => Promise<NodeMemoryProtectionState>
}

export function NodeMemoryProtectionSettings({
  available,
  loadSettings = getNodeMemoryProtection,
  saveSettings = setNodeMemoryProtection,
}: NodeMemoryProtectionSettingsProps) {
  const { t } = useTranslation()
  const [applied, setApplied] = useState<NodeMemoryProtectionSettingsDTO>(() => cloneDefaultSettings())
  const [draft, setDraft] = useState<NodeMemoryProtectionSettingsDTO>(() => cloneDefaultSettings())
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (!available) {
      setSupported(false)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadSettings()
      .then((state) => {
        if (cancelled) return
        setSupported(state.supported)
        if (!state.supported || !state.settings) {
          setError(t("settings:memoryProtection.unsupported"))
          return
        }
        const next = cloneSettings(state.settings)
        setApplied(next)
        setDraft(cloneSettings(next))
        setSaved(false)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [available, loadSettings, reloadVersion, t])

  const valid = settingsAreValid(draft)
  const dirty = !settingsEqual(applied, draft)
  const controlsDisabled = !available || !supported || loading || saving

  function updatePolicy(key: PolicyField, value: number) {
    setDraft((current) => ({
      ...current,
      defaultPolicy: { ...current.defaultPolicy, [key]: value },
    }))
    setSaved(false)
  }

  function restoreDefaults() {
    setDraft({
      defaultPolicy: { ...DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS.defaultPolicy },
      nodePolicies: {},
    })
    setSaved(false)
    setError(null)
  }

  async function applySettings() {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const state = await saveSettings(cloneSettings(draft))
      setSupported(state.supported)
      if (!state.supported || !state.settings) throw new Error(t("settings:memoryProtection.unsupported"))
      const next = cloneSettings(state.settings)
      setApplied(next)
      setDraft(cloneSettings(next))
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsStepCard
      id="memory-protection"
      title={t("settings:memoryProtection.title")}
      description={t("settings:memoryProtection.description")}
      icon={ShieldCheck}
      delay={0.04}
      actions={saved ? <Badge variant="outline">{t("settings:memoryProtection.applied")}</Badge> : undefined}
    >
      <div className="space-y-4">
        {!available ? (
          <StatusMessage tone="muted">{t("settings:memoryProtection.unavailable")}</StatusMessage>
        ) : null}
        {loading ? <StatusMessage tone="muted">{t("settings:memoryProtection.loading")}</StatusMessage> : null}
        {error ? (
          <div className="flex items-start justify-between gap-3 border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] text-destructive">
            <p className="min-w-0 break-words leading-relaxed">{error}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("settings:memoryProtection.retry")}
              onClick={() => setReloadVersion((version) => version + 1)}
            >
              <RefreshCcw />
            </Button>
          </div>
        ) : null}

        <PolicyEditor
          scope="default"
          policy={draft.defaultPolicy}
          disabled={controlsDisabled}
          onChange={updatePolicy}
        />

        {!valid ? <p className="text-[11px] text-destructive">{t("settings:memoryProtection.invalid")}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {dirty ? t("settings:memoryProtection.unsaved") : t("settings:memoryProtection.liveHint")}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="outline" disabled={controlsDisabled} onClick={restoreDefaults}>
              <RotateCcw />
              {t("settings:memoryProtection.restore")}
            </Button>
            <Button type="button" size="sm" disabled={controlsDisabled || !valid || !dirty} onClick={() => void applySettings()}>
              <Save />
              {saving ? t("settings:memoryProtection.saving") : t("settings:memoryProtection.apply")}
            </Button>
          </div>
        </div>
      </div>
    </SettingsStepCard>
  )
}

function PolicyEditor({
  scope,
  policy,
  disabled,
  onChange,
}: {
  scope: "default"
  policy: NodeMemoryProtectionPolicySettingsDTO
  disabled: boolean
  onChange: (key: PolicyField, value: number) => void
}) {
  const { t } = useTranslation()
  const scopeLabel = t(`settings:memoryProtection.scopes.${scope}.title`)
  return (
    <section className="border-t border-border/50 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{scopeLabel}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t(`settings:memoryProtection.scopes.${scope}.description`)}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 @md/settings:grid-cols-2">
        {POLICY_FIELDS.map((field) => {
          const value = policy[field.key]
          const fieldValid = Number.isInteger(value) && value >= field.min && value <= field.max
          return (
            <label key={field.key} className="grid min-w-0 gap-1.5">
              <span className="text-xs font-medium text-foreground">{t(field.labelKey)}</span>
              <div className="relative">
                <Input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value}
                  disabled={disabled}
                  aria-invalid={!fieldValid}
                  aria-label={`${scopeLabel} · ${t(field.labelKey)}`}
                  className="pr-16 font-mono tabular-nums"
                  onChange={(event) => onChange(field.key, Number(event.currentTarget.value))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-mono text-muted-foreground">
                  {t(field.unitKey)}
                </span>
              </div>
              <span className={cn("text-[10px] leading-relaxed text-muted-foreground", !fieldValid && "text-destructive")}>
                {t(field.descriptionKey, { min: field.min, max: field.max })}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

function StatusMessage({ children, tone }: { children: string; tone: "muted" }) {
  return <p className={cn("border border-border/50 bg-muted/15 px-3 py-2 text-[11px] leading-relaxed", tone === "muted" && "text-muted-foreground")}>{children}</p>
}

function settingsAreValid(settings: NodeMemoryProtectionSettingsDTO): boolean {
  // Overrides can still arrive from the persisted app section even though no card edits them,
  // so every policy present is validated, not just the default.
  const policies = [settings.defaultPolicy, ...Object.values(settings.nodePolicies)]
  return policies.every((policy) => policy !== undefined && POLICY_FIELDS.every((field) => {
    const value = policy[field.key]
    return Number.isInteger(value) && value >= field.min && value <= field.max
  }))
}

function settingsEqual(left: NodeMemoryProtectionSettingsDTO, right: NodeMemoryProtectionSettingsDTO): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function cloneDefaultSettings(): NodeMemoryProtectionSettingsDTO {
  return cloneSettings(DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS)
}

function cloneSettings(settings: NodeMemoryProtectionSettingsDTO): NodeMemoryProtectionSettingsDTO {
  return {
    defaultPolicy: { ...settings.defaultPolicy },
    nodePolicies: Object.fromEntries(Object.entries(settings.nodePolicies).map(([nodeId, policy]) => [nodeId, { ...policy }])),
  }
}
