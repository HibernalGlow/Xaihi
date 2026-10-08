import { useEffect, useRef, useState } from "react"
import type { NodeLocalFilesCapability } from "@xiranite/contract"
import { addKisakiPaths, addKisakiPathsWithReferences, isValidKisakiExcludedItem, isValidKisakiExtensionToken, parseKisakiExtensionTokens, parseKisakiList, reconcileKisakiReferences, removeKisakiPaths, serializeKisakiExtensionTokens, serializeKisakiPaths, setAllKisakiReferences, toggleKisakiReference } from "@hibernalglow/xaihi-kisaki/source-inputs"
import { CheckCheck, FilePlus2, FolderMinus, FolderPlus, Plus, RotateCcw, Star, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { PathTextarea } from "@/components/ui/path-input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

interface DirectoryEditorProps {
  kind: "included" | "excluded"
  label: string
  pickFiles?: NodeLocalFilesCapability["pickFiles"]
  pickDirectory?: NodeLocalFilesCapability["pickDirectory"]
  pickDirectories?: NodeLocalFilesCapability["pickDirectories"]
  referenceKeywords?: string
  referenceValue?: string
  value?: string
  onChange: (value: string) => void
  onReferenceChange?: (value: string) => void
}

export function KisakiDirectoryEditor({ kind, label, pickFiles, pickDirectory, pickDirectories, referenceKeywords = "", referenceValue = "", value = "", onChange, onReferenceChange }: DirectoryEditorProps) {
  const { t } = useNodeI18n("kisaki")
  const [manual, setManual] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const manualRef = useRef<HTMLTextAreaElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const paths = parseKisakiList(value)
  const references = reconcileKisakiReferences(paths, referenceValue)
  const selectedSet = new Set(selected.filter((path) => paths.includes(path)))
  const allReferences = paths.length > 0 && references.length === paths.length

  useEffect(() => {
    if (manualOpen) manualRef.current?.focus()
  }, [manualOpen])

  function commit(next: string[]) {
    onChange(serializeKisakiPaths(next))
    if (onReferenceChange) onReferenceChange(serializeKisakiPaths(reconcileKisakiReferences(next, references)))
  }

  function add(raw: unknown) {
    if (onReferenceChange) {
      const next = addKisakiPathsWithReferences(paths, references, raw, referenceKeywords)
      onChange(serializeKisakiPaths(next.paths))
      onReferenceChange(serializeKisakiPaths(next.references))
    } else commit(addKisakiPaths(paths, raw))
    setManual("")
    setManualOpen(false)
  }

  async function browseDirectories() {
    const selected = pickDirectories ? await pickDirectories() : [await pickDirectory?.()].filter((path): path is string => Boolean(path))
    if (selected.length) add(selected)
  }

  async function browseFiles() {
    const selected = await pickFiles?.({ title: t("sources.pickFiles", "选择要扫描的文件") })
    if (selected?.length) add(selected)
  }

  function remove(removed: Iterable<string>) {
    const rejected = [...removed]
    commit(removeKisakiPaths(paths, rejected))
    setSelected((current) => current.filter((path) => !rejected.includes(path)))
  }

  return <section aria-label={label} data-kind={kind} className="grid gap-2 rounded-md border bg-background/40 p-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-medium"><span>{label}</span><Badge variant="outline">{paths.length}</Badge></div><div className="flex items-center gap-1">
      {onReferenceChange ? <Button aria-label={allReferences ? t("sources.cancelAllReferences", "取消全部参考目录") : t("sources.setAllReferences", "全部设为参考目录")} size="icon-sm" variant={allReferences ? "secondary" : "ghost"} onClick={() => onReferenceChange(serializeKisakiPaths(setAllKisakiReferences(paths, !allReferences)))}><CheckCheck /></Button> : null}
      <Button aria-label={t("sources.browseAdd", "浏览添加{{label}}", { label })} disabled={!pickDirectories && !pickDirectory} size="icon-sm" variant="outline" onClick={() => void browseDirectories()}><FolderPlus /></Button>
      {kind === "included" ? <Button aria-label={t("sources.browseAddFiles", "添加文件到{{label}}", { label })} disabled={!pickFiles} size="icon-sm" variant="outline" onClick={() => void browseFiles()}><FilePlus2 /></Button> : null}
      <Button aria-label={t("sources.openManualAdd", "手动添加{{label}}", { label })} size="icon-sm" variant={manualOpen ? "secondary" : "outline"} onClick={() => setManualOpen((open) => !open)}><Plus /></Button>
      <Button aria-label={t("sources.removeSelected", "移除选中的{{label}}", { label })} disabled={!selectedSet.size} size="icon-sm" variant="outline" onClick={() => remove(selectedSet)}><Trash2 /></Button>
      <Button aria-label={t("sources.clear", "清空{{label}}", { label })} disabled={!paths.length} size="icon-sm" variant="ghost" onClick={() => remove(paths)}><FolderMinus /></Button>
    </div></div>
    <div className="grid max-h-40 gap-1 overflow-auto">{paths.length ? paths.map((path) => <div key={path} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
      <Checkbox aria-label={t("sources.selectDirectory", "选择目录 {{path}}", { path })} checked={selectedSet.has(path)} onCheckedChange={(checked) => setSelected((current) => checked ? [...new Set([...current, path])] : current.filter((item) => item !== path))} />
      <span className="min-w-0 flex-1 truncate font-mono" title={path}>{path}</span>
      {onReferenceChange ? <Button aria-label={t(references.includes(path) ? "sources.cancelReference" : "sources.setReference", references.includes(path) ? "取消参考 {{path}}" : "设为参考 {{path}}", { path })} size="icon-sm" variant="ghost" onClick={() => onReferenceChange(serializeKisakiPaths(toggleKisakiReference(paths, references, path)))}><Star className={cn(references.includes(path) && "fill-amber-400 text-amber-500")} /></Button> : null}
      <Button aria-label={t("sources.removeDirectory", "移除目录 {{path}}", { path })} size="icon-sm" variant="ghost" onClick={() => remove([path])}><X /></Button>
    </div>) : <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">{t("sources.empty", "尚未添加目录")}</div>}</div>
    {manualOpen ? <div className="flex items-end gap-1"><PathTextarea ref={manualRef} aria-label={t("sources.pasteMany", "批量粘贴{{label}}", { label })} autoResize={{ minHeight: 36, maxHeight: 96 }} className="font-mono text-xs" placeholder={t("sources.pasteHint", "可粘贴多行、逗号或分号分隔路径\n也可拖放目录")} value={manual} onValueChange={setManual} /><Button aria-label={t("sources.addPasted", "添加粘贴的{{label}}", { label })} disabled={!parseKisakiList(manual).length} size="icon-sm" onClick={() => add(manual)}><Plus /></Button><Button aria-label={t("sources.cancelManualAdd", "取消手动添加{{label}}", { label })} size="icon-sm" variant="ghost" onClick={() => { setManual(""); setManualOpen(false) }}><X /></Button></div> : null}
  </section>
}

interface TokenEditorProps {
  kind: "extensions" | "rules"
  label: string
  placeholder?: string
  value?: string
  onChange: (value: string) => void
}

export function KisakiTokenEditor({ kind, label, placeholder, value = "", onChange }: TokenEditorProps) {
  const { t } = useNodeI18n("kisaki")
  const tokens = kind === "extensions" ? parseKisakiExtensionTokens(value) : parseKisakiList(value)
  function remove(token: string) {
    const next = tokens.filter((item) => item !== token)
    onChange(kind === "extensions" ? serializeKisakiExtensionTokens(next) : serializeKisakiPaths(next))
  }
  return <section aria-label={label} className="grid gap-1.5">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{label}</span><div className="flex items-center gap-1">{kind === "rules" ? <Button aria-label={t("sources.addTrashPreset", "添加 $TRASH 排除预设")} disabled={tokens.includes("$TRASH")} size="icon-sm" variant="outline" onClick={() => onChange(serializeKisakiPaths(addKisakiPaths(tokens, "$TRASH", false)))}><Trash2 /></Button> : null}<Button aria-label={t("sources.reset", "重置{{label}}", { label })} disabled={!tokens.length} size="icon-sm" variant="ghost" onClick={() => onChange("")}><RotateCcw /></Button></div></div>
    <Textarea aria-label={t("sources.input", "{{label}}输入", { label })} className="min-h-16 resize-y font-mono text-xs" placeholder={placeholder} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    {tokens.length ? <div className="flex flex-wrap gap-1">{tokens.map((token) => { const invalid = kind === "extensions" ? !isValidKisakiExtensionToken(token) : !isValidKisakiExcludedItem(token); return <Badge key={token} variant={invalid ? "destructive" : "secondary"} className="gap-1 font-mono" title={invalid ? kind === "rules" ? t("sources.invalidRule", "Kisaki 排除规则必须包含 *，或使用 DEFAULT/$TRASH") : t("sources.invalidExtension", "扩展名不能包含点号或空格") : undefined}><span>{token}</span><button type="button" aria-label={t("sources.removeToken", "移除 {{token}}", { token })} onClick={() => remove(token)}><X className="size-3" /></button></Badge> })}</div> : null}
  </section>
}
