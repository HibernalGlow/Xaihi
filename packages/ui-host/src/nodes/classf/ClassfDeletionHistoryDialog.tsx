import { useMemo, useState } from "react"
import { analyzeClassfDeletionHistory } from "@xiranite/node-classf/deletion-history"
import { FileUp, History, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface ClassfDeletionHistoryImport {
  path: string
  csv: string
}

export default function ClassfDeletionHistoryDialog(props: {
  minimumOccurrences: number
  onAddCandidates: (keywords: string[]) => void
  onClose: () => void
  onImport?: () => Promise<ClassfDeletionHistoryImport | undefined>
  onMinimumOccurrencesChange: (value: number) => void
  t: Translate
}) {
  const [imported, setImported] = useState<ClassfDeletionHistoryImport>()
  const [error, setError] = useState<string>()
  const [importing, setImporting] = useState(false)
  const result = useMemo(() => {
    if (!imported) return {}
    try {
      return { analysis: analyzeClassfDeletionHistory(imported.csv, props.minimumOccurrences) }
    } catch (cause) {
      return { parseError: cause instanceof Error ? cause.message : String(cause) }
    }
  }, [imported, props.minimumOccurrences])
  const candidates = result.analysis?.candidates ?? []

  async function importCsv() {
    if (!props.onImport || importing) return
    setImporting(true)
    setError(undefined)
    try {
      const next = await props.onImport()
      if (next) setImported(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(false)
    }
  }

  function setMinimumOccurrences(value: string) {
    const parsed = Math.floor(Number(value))
    props.onMinimumOccurrencesChange(Number.isFinite(parsed) ? Math.max(1, Math.min(999, parsed)) : 1)
  }

  function addCandidates() {
    if (!candidates.length) return
    props.onAddCandidates(candidates.map(({ keyword }) => keyword))
    props.onClose()
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !importing) props.onClose() }}>
    <DialogContent className="flex max-h-[min(84vh,680px)] w-[min(94vw,620px)] flex-col gap-3 p-4 sm:max-w-[620px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base"><History className="size-4" />{props.t("blacklist.deletionHistoryTitle", "删除历史分析")}</DialogTitle>
        <DialogDescription>{props.t("blacklist.deletionHistoryDescription", "只统计已回收或永久删除记录；候选必须达到设定次数。")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-end gap-2">
        <Button disabled={!props.onImport || importing} size="sm" variant="outline" onClick={() => void importCsv()}><FileUp />{importing ? props.t("blacklist.importingDeletionHistory", "正在导入") : props.t("blacklist.importDeletionHistory", "导入删除历史")}</Button>
        <div className="grid gap-1">
          <Label className="text-xs" htmlFor="classf-history-minimum">{props.t("blacklist.minimumDeletions", "最少删除次数")}</Label>
          <Input id="classf-history-minimum" aria-label="classf deletion history minimum" className="h-8 w-24 text-xs" min={1} max={999} type="number" value={props.minimumOccurrences} onChange={(event) => setMinimumOccurrences(event.currentTarget.value)} />
        </div>
      </div>
      {imported ? <div className="grid gap-1 rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
        <div className="max-h-12 overflow-y-auto break-all font-mono text-muted-foreground" title={imported.path}>{imported.path}</div>
        {result.analysis ? <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{props.t("blacklist.importedDeletionRecords", "已导入 {{count}} 条记录", { count: result.analysis.importedRecords })}</Badge>
          <Badge variant="outline">{props.t("blacklist.successfulDeletions", "成功删除 {{count}}", { count: result.analysis.successfulDeletions })}</Badge>
          <Badge variant="outline">{props.t("blacklist.artistDeletions", "匹配作者 {{count}}", { count: result.analysis.artistDeletionCount })}</Badge>
        </div> : null}
      </div> : null}
      {error || result.parseError ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error ?? result.parseError}</div> : null}
      {result.analysis ? <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2.5 py-1.5 text-xs font-medium"><span>{props.t("blacklist.candidateCount", "{{count}} 个候选", { count: candidates.length })}</span><Badge variant="outline">{props.minimumOccurrences}+</Badge></div>
        {candidates.length ? <div className="max-h-60 overflow-y-auto p-1.5">
          {candidates.map((candidate) => <div key={candidate.keyword} className="flex min-w-0 items-start gap-2 border-b px-1.5 py-1.5 text-xs last:border-0"><span className="min-w-0 flex-1 break-all font-mono">{candidate.keyword}</span><Badge className="shrink-0" variant="outline">{candidate.occurrences}</Badge></div>)}
        </div> : <div className="px-2.5 py-8 text-center text-xs text-muted-foreground">{props.t("blacklist.noCandidates", "没有达到当前次数的作者候选。")}</div>}
      </div> : null}
      <DialogFooter>
        <Button disabled={importing} size="sm" variant="outline" onClick={props.onClose}>{props.t("common.cancel", "取消")}</Button>
        <Button disabled={!candidates.length || importing} size="sm" onClick={addCandidates}><Plus />{props.t("blacklist.addCandidates", "加入 {{count}} 个候选", { count: candidates.length })}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string
