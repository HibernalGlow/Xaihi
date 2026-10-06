import { useEffect, useMemo, useState } from "react"
import { Check, Clipboard, Hash, ListTree, Palette, ToggleLeft } from "lucide-react"
import { createHighlighterCore } from "@shikijs/core"
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import "./NodeConfigSourceView.css"

const highlighterPromise = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [import("@shikijs/langs/toml")],
  themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
})

export interface NodeConfigSourceLabels {
  sections: string
  fields: string
  booleans: string
  collectionItems: string
  colors: string
  source: string
  copy: string
  copied: string
}

export default function NodeConfigSourceView({ config, source, labels }: { config: Record<string, unknown>; source: string; labels: NodeConfigSourceLabels }) {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<string>()
  const summary = useMemo(() => summarizeConfig(config), [config])

  useEffect(() => {
    let active = true
    void highlighterPromise.then((highlighter) => highlighter.codeToHtml(source, {
      lang: "toml",
      themes: { light: "github-light", dark: "github-dark" },
    })).then((html) => { if (active) setHighlighted(html) })
    return () => { active = false }
  }, [source])

  async function copySource() {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return <div className="min-w-0">
    <div className="grid grid-cols-2 border-b bg-muted/25 sm:grid-cols-4">
      <Metric icon={ListTree} value={summary.sections} label={labels.sections} />
      <Metric icon={Hash} value={summary.fields} label={labels.fields} />
      <Metric icon={ToggleLeft} value={`${summary.enabled}/${summary.booleans}`} label={labels.booleans} />
      <Metric icon={ListTree} value={summary.collectionItems} label={labels.collectionItems} />
    </div>
    {summary.colors.length ? <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><Palette className="size-4 text-muted-foreground" /><span className="mr-1 text-xs text-muted-foreground">{labels.colors}</span>{summary.colors.map((color) => <span className="inline-flex items-center gap-1 font-mono text-[10px]" key={color}><span className="size-4 border" style={{ backgroundColor: color }} />{color}</span>)}</div> : null}
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
      <h3 className="text-xs font-semibold">{labels.source}</h3>
      <Button size="sm" variant="ghost" onClick={() => void copySource()}>{copied ? <Check /> : <Clipboard />}{copied ? labels.copied : labels.copy}</Button>
    </div>
    <ScrollArea
      className="h-[min(30rem,calc(100dvh-12rem))] min-h-48 w-full overscroll-contain bg-background"
      data-input-interactive="true"
      data-node-config-source-scroll="true"
    >
      {highlighted ? <div className="node-config-toml text-xs leading-5" dangerouslySetInnerHTML={{ __html: highlighted }} /> : <pre className="overflow-x-auto p-4 text-xs leading-5"><code>{source}</code></pre>}
    </ScrollArea>
  </div>
}

function Metric({ icon: Icon, value, label }: { icon: typeof Hash; value: number | string; label: string }) {
  return <div className="flex min-w-0 items-center gap-2 border-r px-3 py-3 last:border-r-0"><Icon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="font-semibold tabular-nums">{value}</div><div className="truncate text-[10px] text-muted-foreground">{label}</div></div></div>
}

export function summarizeConfig(config: Record<string, unknown>) {
  const effective = isRecord(config.config) ? config.config : config
  const state = { fields: 0, booleans: 0, enabled: 0, collectionItems: 0, colors: new Set<string>(), visited: 0 }
  visit(effective, state)
  return { sections: Object.keys(effective).length, fields: state.fields, booleans: state.booleans, enabled: state.enabled, collectionItems: state.collectionItems, colors: [...state.colors].slice(0, 12) }
}

function visit(value: unknown, state: { fields: number; booleans: number; enabled: number; collectionItems: number; colors: Set<string>; visited: number }) {
  if (state.visited++ > 10_000) return
  if (Array.isArray(value)) {
    state.fields += value.length || 1
    state.collectionItems += value.length
    for (const item of value) visit(item, state)
    return
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) visit(child, state)
    return
  }
  state.fields += 1
  if (typeof value === "boolean") {
    state.booleans += 1
    if (value) state.enabled += 1
  }
  if (typeof value === "string" && /^(?:#[\da-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))$/i.test(value)) state.colors.add(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
