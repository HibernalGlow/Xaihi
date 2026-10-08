import { lazy, Suspense, useState } from "react"
import { extractSameaArtistKeywords, mergeClassfBlacklistKeywords, splitSameaArtistAndCircleKeywords, stripOuterKeywordBrackets } from "@xiranite/node-classf/blacklist"
import { Brackets, FileUp, ShieldAlert, Split, WandSparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ClassfCardState } from "./types"
import { DEFAULT_BLACKLIST_KEYWORDS } from "./constants"
import type { ClassfDeletionHistoryImport } from "./ClassfDeletionHistoryDialog"

const ClassfDeletionHistoryDialog = lazy(() => import("./ClassfDeletionHistoryDialog"))

export function BlacklistKeywordsEditor(props: { data: ClassfCardState; disabled?: boolean; t: Translate; onImportDeletionHistory?: () => Promise<ClassfDeletionHistoryImport | undefined>; onPatch: (patch: Partial<ClassfCardState>) => void }) {
  const keywords = props.data.blacklistKeywords ?? DEFAULT_BLACKLIST_KEYWORDS
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const title = props.t("fields.blacklistKeywords", "黑名单作者")
  const replaceKeywords = (next: string[]) => setDraft(next.join("\n"))
  const draftKeywords = splitLines(draft)

  function setEditorOpen(nextOpen: boolean) {
    if (nextOpen) setDraft(keywords.join("\n"))
    setOpen(nextOpen)
  }

  function save() {
    props.onPatch({ blacklistKeywords: draftKeywords })
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setEditorOpen}>
      <DialogTrigger asChild>
        <Button aria-label={title} className="w-full justify-between" disabled={props.disabled} size="sm" variant="outline">
          <span className="flex min-w-0 items-center gap-1.5"><ShieldAlert className="size-4 text-destructive" /><span className="truncate text-xs">{title}</span></span>
          <Badge variant="outline">{keywords.length}</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(82vh,620px)] w-[min(94vw,620px)] flex-col gap-3 p-4 sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4 text-destructive" />{title}<Badge variant="outline">{keywords.length}</Badge></DialogTitle>
          <DialogDescription className="sr-only">{props.t("blacklist.editorDescription", "编辑用于将 SameA 作者路由到 del 的黑名单关键词。")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-1.5">
          <div className="flex items-center justify-end gap-1">
            <EditorIconButton disabled={props.disabled || !props.onImportDeletionHistory} icon={FileUp} label={props.t("blacklist.importDeletionHistory", "导入删除历史")} onClick={() => setHistoryOpen(true)} />
            <EditorIconButton disabled={props.disabled || !draftKeywords.length} icon={WandSparkles} label={props.t("blacklist.extractSamea", "提取 SameA 标签")} onClick={() => replaceKeywords(extractSameaArtistKeywords(draftKeywords))} />
            <EditorIconButton disabled={props.disabled || !draftKeywords.length} icon={Brackets} label={props.t("blacklist.stripOuterBrackets", "去除最外层括号")} onClick={() => replaceKeywords(draftKeywords.map(stripOuterKeywordBrackets).filter(Boolean))} />
            <EditorIconButton disabled={props.disabled || !draftKeywords.length} icon={Split} label={props.t("blacklist.splitArtistCircle", "拆分社团与作者")} onClick={() => replaceKeywords(splitSameaArtistAndCircleKeywords(draftKeywords))} />
          </div>
          <Textarea aria-label="classf blacklist keywords" className="h-[min(48vh,360px)] min-h-28 resize-y font-mono text-xs" disabled={props.disabled} placeholder={props.t("placeholders.blacklistKeywords", "每行一个 SameA 作者标签，例如 [画师] 或 [社团 (画师)]")} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation() }} />
        </div>
        <DialogFooter>
          <DialogClose asChild><Button size="sm" variant="outline">{props.t("common.cancel", "取消")}</Button></DialogClose>
          <Button disabled={props.disabled} size="sm" onClick={save}>{props.t("common.done", "完成")}</Button>
        </DialogFooter>
      </DialogContent>
      {historyOpen ? <Suspense fallback={null}><ClassfDeletionHistoryDialog
        minimumOccurrences={props.data.blacklistHistoryMinDeletions ?? 3}
        t={props.t}
        onAddCandidates={(candidates) => replaceKeywords(mergeClassfBlacklistKeywords(draftKeywords, candidates))}
        onClose={() => setHistoryOpen(false)}
        onImport={props.onImportDeletionHistory}
        onMinimumOccurrencesChange={(blacklistHistoryMinDeletions) => props.onPatch({ blacklistHistoryMinDeletions })}
      /></Suspense> : null}
    </Dialog>
  )
}

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

function EditorIconButton(props: { disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  const Icon = props.icon
  return <Tooltip><TooltipTrigger asChild><Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant="outline" onClick={props.onClick}><Icon /></Button></TooltipTrigger><TooltipContent>{props.label}</TooltipContent></Tooltip>
}

function splitLines(value: unknown): string[] {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
