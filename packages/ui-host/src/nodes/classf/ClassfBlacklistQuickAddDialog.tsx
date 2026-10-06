import { useEffect, useState } from "react"
import { DEFAULT_CLASSF_BLACKLIST_KEYWORDS, extractSameaArtistKeywords, mergeClassfBlacklistKeywords, splitSameaArtistAndCircleKeywords, stripOuterKeywordBrackets } from "@xiranite/node-classf/blacklist"
import { Brackets, Copy, ShieldAlert, Split, WandSparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { externalNode } from "@/nodes/shared/externalNodeGateway"

interface ClassfNodeConfig {
  blacklistKeywords?: string[]
  blacklist_keywords?: string[]
}

const classf = externalNode<ClassfNodeConfig>("classf")

export default function ClassfBlacklistQuickAddDialog(props: { sourceName: string; copySourceName?: (name: string) => Promise<void>; onClose: () => void; onSaved: (result: { addedCount: number; totalCount: number }) => void }) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const keywords = splitLines(draft)

  useEffect(() => {
    setDraft(extractSameaArtistKeywords([props.sourceName]).join("\n"))
    setError(undefined)
  }, [props.sourceName])

  async function save() {
    if (!keywords.length || saving) return
    setSaving(true)
    setError(undefined)
    try {
      const { config } = await classf.config.get()
      const existing = configuredKeywords(config)
      const next = mergeClassfBlacklistKeywords(existing, keywords)
      if (next.length !== existing.length) await classf.config.patch({ blacklistKeywords: next })
      props.onSaved({ addedCount: next.length - existing.length, totalCount: next.length })
      props.onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function copySourceName() {
    if (!props.copySourceName) return
    setError(undefined)
    try {
      await props.copySourceName(props.sourceName)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return <TooltipProvider>
    <Dialog open onOpenChange={(open) => { if (!open && !saving) props.onClose() }}>
      <DialogContent className="flex max-h-[min(82vh,560px)] w-[min(94vw,560px)] flex-col gap-3 p-4 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4 text-destructive" />加入 ClassF 黑名单</DialogTitle>
          <div className="flex min-w-0 items-start gap-1">
            <DialogDescription className="max-h-20 min-w-0 flex-1 overflow-y-auto break-all font-mono text-xs" title={props.sourceName}>{props.sourceName}</DialogDescription>
            <EditorIconButton disabled={!props.copySourceName || saving} icon={Copy} label="复制文件名" onClick={() => void copySourceName()} />
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-1.5">
          <div className="flex items-center justify-end gap-1">
            <EditorIconButton disabled={!keywords.length || saving} icon={WandSparkles} label="提取 SameA 标签" onClick={() => setDraft(extractSameaArtistKeywords(keywords).join("\n"))} />
            <EditorIconButton disabled={!keywords.length || saving} icon={Brackets} label="去除最外层括号" onClick={() => setDraft(keywords.map(stripOuterKeywordBrackets).filter(Boolean).join("\n"))} />
            <EditorIconButton disabled={!keywords.length || saving} icon={Split} label="拆分社团与作者" onClick={() => setDraft(splitSameaArtistAndCircleKeywords(keywords).join("\n"))} />
          </div>
          <Textarea aria-label="classf blacklist quick add" className="h-[min(42vh,280px)] min-h-28 resize-y font-mono text-xs" disabled={saving} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation() }} />
          {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button disabled={saving} size="sm" variant="outline" onClick={props.onClose}>取消</Button>
          <Button disabled={saving || !keywords.length} size="sm" onClick={() => void save()}>{saving ? "保存中" : "保存到 ClassF 黑名单"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </TooltipProvider>
}

function EditorIconButton(props: { disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  const Icon = props.icon
  return <Tooltip><TooltipTrigger asChild><Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant="outline" onClick={props.onClick}><Icon /></Button></TooltipTrigger><TooltipContent>{props.label}</TooltipContent></Tooltip>
}

function configuredKeywords(config: ClassfNodeConfig | undefined): string[] {
  const configured = config?.blacklistKeywords ?? config?.blacklist_keywords
  return Array.isArray(configured) ? configured : DEFAULT_CLASSF_BLACKLIST_KEYWORDS
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
