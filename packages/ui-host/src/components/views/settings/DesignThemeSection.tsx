/**
 * 高级主题（设计语言）设置面板。
 *
 * 这一页只负责「配置 + 如实披露」，不做任何颜色计算：
 * 所有 token 由 `src/lib/design-theme` 解析并写到 `:root`，本页再把 DOM 上的
 * 回读属性显示出来。这样「界面选了」和「画面上真的换了」是两件事，都能被看见。
 */
import { useEffect, useMemo, useState } from "react"
import { Layers } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { readSystemAccentColor } from "@/lib/design-theme/domColor"
import {
  DESIGN_APPLIED_ATTR,
  DESIGN_REV_ATTR,
  DESIGN_SEED_ATTR,
  DESIGN_SEED_FALLBACK_ATTR,
  DESIGN_SEED_SOURCE_ATTR,
  MD3_CONTRAST_LEVELS,
  WULING_CORNER_STEPS,
  MD3_SCHEME_VARIANTS,
  MD3_SHAPE_SCALE_STEPS,
  MONDRIAN_ACCENTS,
  MONDRIAN_LINE_WEIGHT_VALUES,
  SWISS_RULE_WEIGHT_VALUES,
  DESIGN_DIMENSIONS,
  type DesignDimension,
  type DesignThemeConfig,
  type Md3ContrastLevel,
  type Md3SchemeVariant,
  type Md3SeedSource,
  type MondrianAccentPlane,
  type MondrianLineWeight,
  type SwissRuleWeight,
} from "@/lib/design-theme/contract"
import { STIJL_ACCENT_ATTR, STIJL_LINE_ATTR, STIJL_TOKEN_COUNT_ATTR } from "@/lib/design-theme/mondrian/resolve"
import {
  SWISS_LABEL_ATTR,
  SWISS_RULE_ATTR,
  SWISS_TOKEN_COUNT_ATTR,
} from "@/lib/design-theme/swiss/spec"
import {
  LONESTAR_CUT_ATTR,
  LONESTAR_FIGURE_ATTR,
  LONESTAR_LABEL_ATTR,
  LONESTAR_SEED_ATTR,
  LONESTAR_SEED_FALLBACK_ATTR,
  LONESTAR_SEED_SOURCE_ATTR,
  LONESTAR_TOKEN_COUNT_ATTR,
} from "@/lib/design-theme/lonestar/spec"
import { WULING_TOKEN_COUNT_ATTR } from "@/lib/design-theme/wuling/spec"
import { DESIGN_THEME_ENTRIES } from "@/lib/design-theme/registry"
import {
  WULING_CORNER_ATTR,
  WULING_LABEL_ATTR,
  WULING_SEED_ATTR,
  WULING_SEED_FALLBACK_ATTR,
  WULING_SEED_SOURCE_ATTR,
} from "@/lib/design-theme/wuling/spec"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { ComponentSkinPreview, RuntimeRow, SettingsStepCard } from "./primitives"

/**
 * M3 基线色板的 tone-40 角色色，取自
 * `node_modules/@material/web/tokens/versions/v0_192/_md-ref-palette.scss`
 * （primary40=#6750a4、secondary40=#625b71、tertiary40=#7d5260、neutral40=#605d64、error40=#b3261e）。
 * 不是随手挑的六个紫色。
 */
const BASELINE_SEEDS: readonly string[] = ["#6750a4", "#625b71", "#7d5260", "#605d64", "#b3261e", "#006a60"]

/**
 * contrastLevel 不能直接当 i18n key 用：`contrasts.0.5` 会被 i18next 当成两级嵌套路径查。
 * 所以走一个显式 slug 表。
 */
const CONTRAST_SLUG: Record<Md3ContrastLevel, string> = {
  [-1]: "reduced",
  0: "standard",
  0.5: "medium",
  1: "high",
}

const READBACK_ATTRS = [
  DESIGN_SEED_ATTR,
  DESIGN_SEED_SOURCE_ATTR,
  DESIGN_SEED_FALLBACK_ATTR,
  DESIGN_APPLIED_ATTR,
  DESIGN_REV_ATTR,
  STIJL_ACCENT_ATTR,
  STIJL_LINE_ATTR,
  STIJL_TOKEN_COUNT_ATTR,
  WULING_SEED_ATTR,
  WULING_SEED_SOURCE_ATTR,
  WULING_SEED_FALLBACK_ATTR,
  WULING_CORNER_ATTR,
  WULING_LABEL_ATTR,
  WULING_TOKEN_COUNT_ATTR,
  SWISS_RULE_ATTR,
  SWISS_LABEL_ATTR,
  SWISS_TOKEN_COUNT_ATTR,
  LONESTAR_CUT_ATTR,
  LONESTAR_LABEL_ATTR,
  LONESTAR_FIGURE_ATTR,
  LONESTAR_SEED_ATTR,
  LONESTAR_SEED_SOURCE_ATTR,
  LONESTAR_SEED_FALLBACK_ATTR,
  LONESTAR_TOKEN_COUNT_ATTR,
]

interface DomReadback {
  seed: string | null
  source: string | null
  fallback: boolean
  appliedVars: string | null
  rev: string | null
  stijlAccent: string | null
  stijlLine: string | null
  stijlTokens: string | null
  wulingSeed: string | null
  wulingSource: string | null
  wulingFallback: boolean
  wulingCorner: string | null
  wulingLabels: string | null
  wulingTokens: string | null
  swissRule: string | null
  swissLabels: string | null
  swissTokens: string | null
  lsCut: string | null
  lsLabels: string | null
  lsFigures: string | null
  lsSeed: string | null
  lsSource: string | null
  lsFallback: boolean
  lsTokens: string | null
}

function readAttributes(): DomReadback {
  const root = document.documentElement
  return {
    seed: root.getAttribute(DESIGN_SEED_ATTR),
    source: root.getAttribute(DESIGN_SEED_SOURCE_ATTR),
    fallback: root.getAttribute(DESIGN_SEED_FALLBACK_ATTR) === "true",
    appliedVars: root.getAttribute(DESIGN_APPLIED_ATTR),
    rev: root.getAttribute(DESIGN_REV_ATTR),
    stijlAccent: root.getAttribute(STIJL_ACCENT_ATTR),
    stijlLine: root.getAttribute(STIJL_LINE_ATTR),
    stijlTokens: root.getAttribute(STIJL_TOKEN_COUNT_ATTR),
    wulingSeed: root.getAttribute(WULING_SEED_ATTR),
    wulingSource: root.getAttribute(WULING_SEED_SOURCE_ATTR),
    wulingFallback: root.getAttribute(WULING_SEED_FALLBACK_ATTR) === "true",
    wulingCorner: root.getAttribute(WULING_CORNER_ATTR),
    wulingLabels: root.getAttribute(WULING_LABEL_ATTR),
    wulingTokens: root.getAttribute(WULING_TOKEN_COUNT_ATTR),
    swissRule: root.getAttribute(SWISS_RULE_ATTR),
    swissLabels: root.getAttribute(SWISS_LABEL_ATTR),
    swissTokens: root.getAttribute(SWISS_TOKEN_COUNT_ATTR),
    lsCut: root.getAttribute(LONESTAR_CUT_ATTR),
    lsLabels: root.getAttribute(LONESTAR_LABEL_ATTR),
    lsFigures: root.getAttribute(LONESTAR_FIGURE_ATTR),
    lsSeed: root.getAttribute(LONESTAR_SEED_ATTR),
    lsSource: root.getAttribute(LONESTAR_SEED_SOURCE_ATTR),
    lsFallback: root.getAttribute(LONESTAR_SEED_FALLBACK_ATTR) === "true",
    lsTokens: root.getAttribute(LONESTAR_TOKEN_COUNT_ATTR),
  }
}

/** 回读路径：DOM 才是事实源，所以这只眼睛盯着真正写下去的那几个属性。 */
function useDesignReadback(): DomReadback {
  const [readback, setReadback] = useState<DomReadback>(readAttributes)
  useEffect(() => {
    const observer = new MutationObserver(() => setReadback(readAttributes()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: READBACK_ATTRS })
    setReadback(readAttributes())
    return () => observer.disconnect()
  }, [])
  return readback
}

export function DesignThemeSection() {
  const { t } = useTranslation()
  const actions = useWorkspaceActions()
  const config = useWorkspaceShallowSelector((state) => state.designTheme)
  const readback = useDesignReadback()
  const entry = DESIGN_THEME_ENTRIES.find((item) => item.id === config.id) ?? DESIGN_THEME_ENTRIES[0]
  const isMd3 = config.id === "md3"
  const isMondrian = config.id === "mondrian"
  const isWuling = config.id === "wuling"
  const isSwiss = config.id === "swiss"
  const isLoneStar = config.id === "lonestar"
  // 「接管」= 这条配方真的会写 :root。维度开关与回读行对 md3/风格派/武陵都成立，
  // 所以它们从各自的分支里提出来共用，不再各写一份。
  const takesOver = isMd3 || isMondrian || isWuling || isSwiss || isLoneStar

  const systemAccent = useMemo(() => readSystemAccentColor(), [config.md3.seed, config.md3.seedSource])
  const accentUsable = systemAccent !== null

  const patchMd3 = (patch: Partial<DesignThemeConfig["md3"]>) =>
    actions.setDesignTheme({ ...config, md3: { ...config.md3, ...patch } })

  const patchMondrian = (patch: Partial<DesignThemeConfig["mondrian"]>) =>
    actions.setDesignTheme({ ...config, mondrian: { ...config.mondrian, ...patch } })

  const patchWuling = (patch: Partial<DesignThemeConfig["wuling"]>) =>
    actions.setDesignTheme({ ...config, wuling: { ...config.wuling, ...patch } })

  const patchSwiss = (patch: Partial<DesignThemeConfig["swiss"]>) =>
    actions.setDesignTheme({ ...config, swiss: { ...config.swiss, ...patch } })

  const patchLoneStar = (patch: Partial<DesignThemeConfig["lonestar"]>) =>
    actions.setDesignTheme({ ...config, lonestar: { ...config.lonestar, ...patch } })


  const toggleDimension = (dimension: DesignDimension) =>
    actions.setDesignTheme({
      ...config,
      dimensions: { ...config.dimensions, [dimension]: !config.dimensions[dimension] },
    })

  return (
    <SettingsStepCard
      id="design-language"
      title={t("settings:designTheme.label")}
      description={t("settings:designTheme.description")}
      icon={Layers}
      delay={0.04}
      actions={(
        <Badge variant="outline" className="rounded-sm font-mono text-[9px] text-muted-foreground">
          {takesOver ? `${isMd3 ? "MD3" : isWuling ? "WULING" : "STIJL"} · ${readback.appliedVars ?? "0"} var` : t("settings:designTheme.nativeBadge")}
        </Badge>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.pickTheme")}</span>
          <Select
            value={config.id}
            onValueChange={(value) => actions.setDesignTheme({ ...config, id: value as DesignThemeConfig["id"] })}
          >
            <SelectTrigger aria-label={t("settings:designTheme.pickTheme")} className="w-full bg-background/60 font-mono text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DESIGN_THEME_ENTRIES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="min-w-0 truncate">{t(option.labelKey)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">{t(entry.descriptionKey)}</p>
        </div>

        {isMd3 ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.variant")}</span>
              <Select
                value={config.md3.variant}
                onValueChange={(value) => patchMd3({ variant: value as Md3SchemeVariant })}
              >
                <SelectTrigger aria-label={t("settings:designTheme.variant")} className="w-full bg-background/60 font-mono text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectGroup>
                    {MD3_SCHEME_VARIANTS.map((variant) => (
                      <SelectItem key={variant} value={variant}>
                        <span className="min-w-0 truncate">{t(`settings:designTheme.variants.${variant}`)}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.seedSource")}</span>
              <ToggleGroup
                type="single"
                value={config.md3.seedSource}
                onValueChange={(value) => value && patchMd3({ seedSource: value as Md3SeedSource })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-3 gap-1.5"
              >
                <ToggleGroupItem value="manual" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.manual")}
                </ToggleGroupItem>
                <ToggleGroupItem value="activeTheme" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.activeTheme")}
                </ToggleGroupItem>
                <ToggleGroupItem value="systemAccent" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.systemAccent")}
                </ToggleGroupItem>
              </ToggleGroup>
              {config.md3.seedSource === "systemAccent" && !accentUsable ? (
                <p className="text-[10px] leading-relaxed text-destructive">
                  {t("settings:designTheme.seedUnavailable")}
                </p>
              ) : null}
              {readback.fallback ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.seedFallback", { seed: readback.seed ?? config.md3.seed })}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.seed")}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t("settings:designTheme.seed")}
                  value={config.md3.seed}
                  onChange={(event) => patchMd3({ seed: event.target.value.toLowerCase(), seedSource: "manual" })}
                  className="size-8 shrink-0 cursor-pointer rounded-sm border border-border/60 bg-transparent p-0.5"
                />
                <Input
                  aria-label={t("settings:designTheme.seedHex")}
                  value={config.md3.seed}
                  onChange={(event) => {
                    const next = event.target.value.trim().toLowerCase()
                    if (/^#[0-9a-f]{6}$/.test(next)) patchMd3({ seed: next, seedSource: "manual" })
                  }}
                  className="h-8 w-28 font-mono text-xs"
                />
                <div className="flex shrink-0 gap-1">
                  {BASELINE_SEEDS.map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      title={seed}
                      aria-label={seed}
                      onClick={() => patchMd3({ seed, seedSource: "manual" })}
                      className="size-5 rounded-sm border border-border/60"
                      style={{ background: seed }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.contrast")}</span>
              <ToggleGroup
                type="single"
                value={String(config.md3.contrastLevel)}
                onValueChange={(value) => value && patchMd3({ contrastLevel: Number(value) as Md3ContrastLevel })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-4 gap-1.5"
              >
                {MD3_CONTRAST_LEVELS.map((level) => (
                  <ToggleGroupItem key={level} value={String(level)} className="min-w-0 px-1 text-[11px]">
                    {t(`settings:designTheme.contrasts.${CONTRAST_SLUG[level]}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[10px] leading-relaxed text-muted-foreground/80">{t("settings:designTheme.contrastHint")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.shapeScale")}</span>
                <span className="font-mono text-[11px] text-foreground">{config.md3.shapeScale.toFixed(2)}×</span>
              </div>
              <Slider
                aria-label={t("settings:designTheme.shapeScale")}
                value={[config.md3.shapeScale]}
                min={MD3_SHAPE_SCALE_STEPS[0]}
                max={MD3_SHAPE_SCALE_STEPS[MD3_SHAPE_SCALE_STEPS.length - 1]}
                step={0.25}
                onValueChange={([next]) => patchMd3({ shapeScale: next })}
              />
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{t("settings:designTheme.elevationShadows")}</span>
                <span className="block text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.elevationShadowsDesc")}
                </span>
              </span>
              <Switch
                checked={config.md3.elevationShadows}
                onCheckedChange={(checked) => patchMd3({ elevationShadows: checked })}
              />
            </label>
          </>
        ) : null}

        {isMondrian ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.mondrianAccent")}</span>
              <ToggleGroup
                type="single"
                value={config.mondrian.accent}
                onValueChange={(value) => value && patchMondrian({ accent: value as MondrianAccentPlane })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-3 gap-1.5"
              >
                {MONDRIAN_ACCENTS.map((accent) => (
                  <ToggleGroupItem key={accent} value={accent} className="min-w-0 px-1.5 text-[11px]">
                    {t(`settings:designTheme.accents.${accent}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.mondrianLine")}</span>
              <ToggleGroup
                type="single"
                value={String(config.mondrian.lineWeight)}
                onValueChange={(value) => value && patchMondrian({ lineWeight: Number(value) as MondrianLineWeight })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-3 gap-1.5"
              >
                {MONDRIAN_LINE_WEIGHT_VALUES.map((weight) => (
                  <ToggleGroupItem key={weight} value={String(weight)} className="min-w-0 px-1 text-[11px]">
                    {t(`settings:designTheme.lines.${weight}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {/* 线宽/间距/字号是本仓的 UI 转译，面板上就得把这件事说出来，不然用户会以为有规范值。 */}
              <p className="text-[10px] leading-relaxed text-muted-foreground/80">{t("settings:designTheme.provenanceNote")}</p>
            </div>
          </>
        ) : null}

        {isWuling ? (
          <>
            {/* 用户第 4 点：设计语言自己也能取色，并且与「颜色预设」平级——
                这一档选 manual 时不必再去上面那个主题预设下拉里挑配色。 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.seedSource")}</span>
              <ToggleGroup
                type="single"
                value={config.wuling.seedSource}
                onValueChange={(value) => value && patchWuling({ seedSource: value as DesignThemeConfig["wuling"]["seedSource"] })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-2 gap-1.5"
              >
                <ToggleGroupItem value="manual" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.manual")}
                </ToggleGroupItem>
                <ToggleGroupItem value="activeTheme" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.activeTheme")}
                </ToggleGroupItem>
              </ToggleGroup>
              {readback.wulingFallback ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.seedFallback", { seed: readback.wulingSeed ?? config.wuling.seed })}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("settings:designTheme.seed")}
                value={config.wuling.seed}
                onChange={(event) => patchWuling({ seed: event.target.value.toLowerCase(), seedSource: "manual" })}
                className="size-8 shrink-0 cursor-pointer rounded-sm border border-border/60 bg-transparent p-0.5"
              />
              <Input
                aria-label={t("settings:designTheme.seedHex")}
                value={config.wuling.seed}
                onChange={(event) => {
                  const next = event.target.value.trim().toLowerCase()
                  if (/^#[0-9a-f]{6}$/.test(next)) patchWuling({ seed: next, seedSource: "manual" })
                }}
                className="h-8 w-28 font-mono text-xs"
              />
              <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground/80">
                {t("settings:designTheme.provenanceNote")}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.cornerScale")}</span>
                <span className="font-mono text-[11px] text-foreground">{config.wuling.cornerScale.toFixed(2)}×</span>
              </div>
              <Slider
                aria-label={t("settings:designTheme.cornerScale")}
                value={[config.wuling.cornerScale]}
                min={WULING_CORNER_STEPS[0]}
                max={WULING_CORNER_STEPS[WULING_CORNER_STEPS.length - 1]}
                step={0.25}
                onValueChange={([next]) => patchWuling({ cornerScale: next })}
              />
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{t("settings:designTheme.ledgerLabels")}</span>
                <span className="block text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.ledgerLabelsDesc")}
                </span>
              </span>
              <Switch
                checked={config.wuling.ledgerLabels}
                onCheckedChange={(checked) => patchWuling({ ledgerLabels: checked })}
              />
            </label>
          </>
        ) : null}

        {isSwiss ? (
          <>
            {/* Swiss 只有一条可选项轴：结构线的宽度档。三档各有各的成文出处（SBB 1px 发丝线、
                组合参考的 border-2 / border-4），所以它是「选哪条规则」而不是「随便乘个数」。 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.swissRule")}</span>
              <ToggleGroup
                type="single"
                value={String(config.swiss.ruleWeight)}
                onValueChange={(value) => value && patchSwiss({ ruleWeight: Number(value) as SwissRuleWeight })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-3 gap-1.5"
              >
                {SWISS_RULE_WEIGHT_VALUES.map((weight) => (
                  <ToggleGroupItem key={weight} value={String(weight)} className="min-w-0 px-1.5 text-[11px]">
                    {t(`settings:designTheme.rules.${weight}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{t("settings:designTheme.upperLabels")}</span>
                <span className="block text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.upperLabelsDesc")}
                </span>
              </span>
              <Switch
                checked={config.swiss.uppercaseLabels}
                onCheckedChange={(checked) => patchSwiss({ uppercaseLabels: checked })}
              />
            </label>

            {/* 没有取色控件不是漏做，而是这条配方的律：只有一个红，而它是功能信号色。
                面板上不许出现一个按下去什么都不变的色块。 */}
            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              {t("settings:designTheme.noSeedNote")}
            </p>
            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              {t("settings:designTheme.swissProvenanceNote")}
            </p>
          </>
        ) : null}

        {isLoneStar ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.seedSource")}</span>
              <ToggleGroup
                type="single"
                value={config.lonestar.seedSource}
                onValueChange={(value) => value && patchLoneStar({ seedSource: value as DesignThemeConfig["lonestar"]["seedSource"] })}
                variant="outline"
                size="sm"
                spacing={2}
                className="grid w-full grid-cols-2 gap-1.5"
              >
                <ToggleGroupItem value="manual" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.manual")}
                </ToggleGroupItem>
                <ToggleGroupItem value="activeTheme" className="min-w-0 px-1.5 text-[11px]">
                  {t("settings:designTheme.sources.activeTheme")}
                </ToggleGroupItem>
              </ToggleGroup>
              {/* 跟随当前配色主题时读不到主色 = 如实回落，面板必须说出来，不许拿一个像样的色装点。 */}
              {readback.lsFallback ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.seedFallback", { seed: readback.lsSeed ?? config.lonestar.seed })}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("settings:designTheme.seed")}
                value={config.lonestar.seed}
                onChange={(event) => patchLoneStar({ seed: event.target.value.toLowerCase(), seedSource: "manual" })}
                className="size-8 shrink-0 cursor-pointer rounded-sm border border-border/60 bg-transparent p-0.5"
              />
              <Input
                aria-label={t("settings:designTheme.seedHex")}
                value={config.lonestar.seed}
                onChange={(event) => {
                  const next = event.target.value.trim().toLowerCase()
                  if (/^#[0-9a-f]{6}$/.test(next)) patchLoneStar({ seed: next, seedSource: "manual" })
                }}
                className="h-8 w-28 font-mono text-xs"
              />
              <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground/80">
                {t("settings:designTheme.lonestarProvenanceNote")}
              </span>
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{t("settings:designTheme.monoFigures")}</span>
                <span className="block text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.monoFiguresDesc")}
                </span>
              </span>
              <Switch
                checked={config.lonestar.monoFigures}
                onCheckedChange={(checked) => patchLoneStar({ monoFigures: checked })}
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{t("settings:designTheme.upperLabels")}</span>
                <span className="block text-[10px] leading-relaxed text-muted-foreground">
                  {t("settings:designTheme.upperLabelsDesc")}
                </span>
              </span>
              <Switch
                checked={config.lonestar.uppercaseLabels}
                onCheckedChange={(checked) => patchLoneStar({ uppercaseLabels: checked })}
              />
            </label>

            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              {t("settings:designTheme.cutNote")}
            </p>
          </>
        ) : null}

        {takesOver ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings:designTheme.dimensions")}</span>
              <div className="grid gap-1.5">
                {DESIGN_DIMENSIONS.map((dimension) => (
                  <label key={dimension} className="flex items-center justify-between gap-3 rounded-sm border border-border/40 bg-muted/10 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-foreground">
                        {t(`settings:designTheme.dims.${dimension}.label`)}
                      </span>
                      <span className="block text-[10px] leading-relaxed text-muted-foreground/80">
                        {t(`settings:designTheme.dims.${dimension}.description`)}
                      </span>
                    </span>
                    <Switch
                      aria-label={t(`settings:designTheme.dims.${dimension}.label`)}
                      checked={config.dimensions[dimension]}
                      onCheckedChange={() => toggleDimension(dimension)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {isMd3 ? (
                <>
                  <RuntimeRow label="SEED" value={readback.seed ?? config.md3.seed} />
                  <RuntimeRow label="SOURCE" value={readback.source ?? "—"} />
                </>
              ) : isWuling ? (
                <>
                  <RuntimeRow label="SEED" value={readback.wulingSeed ?? config.wuling.seed} />
                  <RuntimeRow label="SOURCE" value={readback.wulingSource ?? "—"} />
                  <RuntimeRow label="CORNER" value={readback.wulingCorner ?? "—"} />
                  <RuntimeRow label="LABELS" value={readback.wulingLabels ?? "—"} />
                </>
              ) : isSwiss ? (
                <>
                  <RuntimeRow label="RULE" value={readback.swissRule ?? "—"} />
                  <RuntimeRow label="LABELS" value={readback.swissLabels ?? "—"} />
                </>
              ) : isLoneStar ? (
                <>
                  <RuntimeRow label="SEED" value={readback.lsSeed ?? config.lonestar.seed} />
                  <RuntimeRow label="SOURCE" value={readback.lsSource ?? "—"} />
                  <RuntimeRow label="CUT" value={readback.lsCut ?? "—"} />
                  <RuntimeRow label="FIGURES" value={readback.lsFigures ?? "—"} />
                  <RuntimeRow label="LABELS" value={readback.lsLabels ?? "—"} />
                </>
              ) : (
                <>
                  {/* 风格派没有 seed：这两行读的是 DOM 上的实际选项，不是 store 里的期望值。 */}
                  <RuntimeRow label="ACCENT" value={readback.stijlAccent ?? "—"} />
                  <RuntimeRow label="LINE" value={readback.stijlLine ?? "—"} />
                </>
              )}
              {/* TOKENS = 这条配方真往 :root 写了几条自己的变量（DOM 现读，不是手抄词汇表长度）。 */}
              <RuntimeRow
                label="TOKENS"
                value={(isWuling ? readback.wulingTokens : isSwiss ? readback.swissTokens : isLoneStar ? readback.lsTokens : readback.stijlTokens) ?? "—"}
              />
              <RuntimeRow label="VARS" value={`${readback.appliedVars ?? "0"} · rev ${readback.rev ?? "0"}`} />
            </div>

            <ComponentSkinPreview label={isMd3 ? "MD3" : isWuling ? "WULING" : isSwiss ? "SWISS" : isLoneStar ? "LONESTAR" : "STIJL"} caption={t("settings:designTheme.previewCaption")}>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">{t("settings:designTheme.previewButton")}</Button>
                {/* M3 的 tonal button 在本组件库里对应的就是 secondary 变体（secondary-container/on-secondary-container）。 */}
                <Button size="sm" variant="secondary">{t("settings:designTheme.previewTonal")}</Button>
                <Button size="sm" variant="outline">{t("settings:designTheme.previewOutline")}</Button>
                <Badge variant="secondary">{t("settings:designTheme.previewBadge")}</Badge>
              </div>
              <Progress value={62} className="mt-2" />
            </ComponentSkinPreview>
          </>
        ) : null}
      </div>
    </SettingsStepCard>
  )
}
