import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, ExternalLink, RotateCcw, Save, Settings2, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { Webview2Config } from "@xiranite/api/client"
import {
  getWebview2ConfigFromBackend,
  openConfigFileWithBackend,
  saveWebview2ConfigToBackend,
} from "@/backend/configRpcClient"
import {
  DEFAULT_WEBVIEW2_CONFIG,
  normalizeWebview2Config,
  WEBVIEW2_FLAG_CATALOG,
  type Webview2FlagDefinition,
} from "@/config/webview2"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { getRuntime } from "@/backend/client"

type FlagGroup = keyof Webview2Config

function configsEqual(left: Webview2Config, right: Webview2Config): boolean {
  return left.features.join("\n") === right.features.join("\n")
    && left.switches.join("\n") === right.switches.join("\n")
}

function cloneConfig(config: Webview2Config): Webview2Config {
  return { features: [...config.features], switches: [...config.switches] }
}

export function Webview2ExperimentsPanel({ available }: { available: boolean }) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Webview2Config>(() => cloneConfig(DEFAULT_WEBVIEW2_CONFIG))
  const [persistedConfig, setPersistedConfig] = useState<Webview2Config | null>(null)
  const [configPath, setConfigPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [openingDevTools, setOpeningDevTools] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!available) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void getWebview2ConfigFromBackend()
      .then((result) => {
        if (cancelled) return
        const next = normalizeWebview2Config(result.config)
        setConfig(cloneConfig(next))
        setPersistedConfig(result.config ? cloneConfig(next) : null)
        setConfigPath(result.path)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [available])

  // DevTools availability is not probed by adapter name any more: `openDevTools` goes through the runtime
  // interface and a host without the command answers with `supported: false` plus its own reason, which this
  // panel already renders. The retired Wails adapter used to be the whole gate.

  const dirty = persistedConfig === null || !configsEqual(config, persistedConfig)

  function setFlag(group: FlagGroup, id: string, checked: boolean) {
    const catalog = WEBVIEW2_FLAG_CATALOG[group]
    setConfig((current) => {
      const selected = new Set(current[group])
      if (checked) selected.add(id)
      else selected.delete(id)
      return { ...current, [group]: catalog.filter((flag) => selected.has(flag.id)).map((flag) => flag.id) }
    })
    setSaved(false)
    setError(null)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await saveWebview2ConfigToBackend(normalizeWebview2Config(config))
      const next = normalizeWebview2Config(result.config)
      setConfig(cloneConfig(next))
      setPersistedConfig(cloneConfig(next))
      setConfigPath(result.path)
      setSaved(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  async function openConfig() {
    setOpening(true)
    setError(null)
    try {
      setConfigPath(await openConfigFileWithBackend())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpening(false)
    }
  }

  async function openDevTools() {
    setOpeningDevTools(true)
    setError(null)
    try {
      const result = await (await getRuntime()).windows.openDevTools()
      if (!result.success) throw new Error(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningDevTools(false)
    }
  }

  function renderFlags(group: FlagGroup, flags: Webview2FlagDefinition[]) {
    return (
      <FieldSet>
        <FieldLegend variant="label" className="font-mono text-xs tracking-widest text-muted-foreground">
          {t(`settings:webview2.${group}`)}
        </FieldLegend>
        <FieldGroup data-slot="checkbox-group" className="gap-2">
          {flags.map((flag) => {
            const checked = config[group].includes(flag.id)
            return (
              <Field key={flag.id} orientation="horizontal" className="items-start rounded-sm border border-border/40 bg-muted/15 p-3">
                <Checkbox
                  id={`webview2-${flag.key}`}
                  checked={checked}
                  disabled={!available || loading || saving}
                  onCheckedChange={(value) => setFlag(group, flag.id, value === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor={`webview2-${flag.key}`} className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    {t(`settings:webview2.flags.${flag.key}.label`)}
                    <Badge variant={flag.tier === "experimental" ? "destructive" : "outline"} className="px-1.5 py-0 font-mono text-[9px]">
                      {t(`settings:webview2.tier.${flag.tier}`)}
                    </Badge>
                  </FieldLabel>
                  <FieldDescription className="text-[11px] leading-relaxed">
                    {t(`settings:webview2.flags.${flag.key}.description`)}
                  </FieldDescription>
                  <code className="w-fit rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{flag.id}</code>
                </FieldContent>
              </Field>
            )
          })}
        </FieldGroup>
      </FieldSet>
    )
  }

  return (
    <Card className="gap-4 rounded-sm py-4 shadow-none">
      <CardHeader className="gap-1 px-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border/50 bg-muted/35">
            <Settings2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">{t("settings:webview2.title")}</CardTitle>
            <CardDescription className="mt-1 text-[11px] leading-relaxed">{t("settings:webview2.description")}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4">
        {!available && (
          <Alert>
            <AlertCircle />
            <AlertTitle>{t("settings:webview2.unavailableTitle")}</AlertTitle>
            <AlertDescription>{t("settings:webview2.unavailable")}</AlertDescription>
          </Alert>
        )}
        <Alert>
          <AlertCircle />
          <AlertTitle>{t("settings:webview2.restartTitle")}</AlertTitle>
          <AlertDescription>{t("settings:webview2.restartDescription")}</AlertDescription>
        </Alert>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{t("settings:webview2.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>{t("settings:webview2.saved")}</AlertTitle>
            <AlertDescription>{t("settings:webview2.savedDescription")}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {renderFlags("features", WEBVIEW2_FLAG_CATALOG.features)}
          {renderFlags("switches", WEBVIEW2_FLAG_CATALOG.switches)}
        </div>

        {configPath && (
          <p className="truncate text-[10px] font-mono text-muted-foreground" title={configPath}>{configPath}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 border-t px-4">
        <Button size="sm" disabled={!available || loading || saving || !dirty} onClick={save}>
          <Save className="h-3.5 w-3.5" />
          {saving ? t("settings:webview2.saving") : t("settings:webview2.save")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!available || loading || saving}
          onClick={() => {
            setConfig(cloneConfig(DEFAULT_WEBVIEW2_CONFIG))
            setSaved(false)
            setError(null)
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("settings:webview2.reset")}
        </Button>
        <Button variant="outline" size="sm" disabled={!available || opening} onClick={openConfig}>
          <ExternalLink className="h-3.5 w-3.5" />
          {opening ? t("settings:webview2.openingConfig") : t("settings:webview2.openConfig")}
        </Button>
        <Button variant="outline" size="sm" disabled={!available || openingDevTools} onClick={openDevTools}>
          <Wrench className="h-3.5 w-3.5" />
          {openingDevTools ? t("settings:webview2.openingDevTools") : t("settings:webview2.openDevTools")}
        </Button>
      </CardFooter>
    </Card>
  )
}
