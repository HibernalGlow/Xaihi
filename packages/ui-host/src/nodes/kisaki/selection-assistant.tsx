import { useEffect, useRef, useState } from "react"
import type { DragEvent } from "react"
import type { KisakiSelectionApplyMode, KisakiSelectionAssistantConfig, KisakiSelectionMatchCondition, KisakiSelectionResult, KisakiSelectionSortCriterion, KisakiSelectionSortField, KisakiSelectionStats, KisakiSelectionTextColumn } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import { createDefaultKisakiSelectionAssistantConfig, parseKisakiSelectionAssistantConfig, serializeKisakiSelectionAssistantConfig } from "@hibernalglow/xaihi-kisaki/selection-assistant"
import { Check, ChevronDown, ChevronUp, GripVertical, Plus, Redo2, RotateCcw, Save, Sparkles, ToggleLeft, Trash2, Undo2, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

type RuleKind = "group" | "text" | "directory"
type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

export interface KisakiSelectionAssistantProps {
  open: boolean
  config: KisakiSelectionAssistantConfig
  stats: KisakiSelectionStats
  canUndo: boolean
  canRedo: boolean
  onOpenChange: (open: boolean) => void
  onConfigChange: (config: KisakiSelectionAssistantConfig) => void
  onApply: (kind: RuleKind) => KisakiSelectionResult
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onInvert: () => void
  onSelectAll: () => void
}

export function KisakiSelectionAssistant(props: KisakiSelectionAssistantProps) {
  "use no memo"
  const { t, language } = useNodeI18n("kisaki")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<RuleKind>("group")
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; kind: "status" | "alert" } | null>(null)
  const [transferText, setTransferText] = useState("")

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const surface = triggerRef.current?.closest('[data-testid="czkawka-surface"]')
      if (!props.open && surface && !surface.contains(document.activeElement)) return
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z" && !event.shiftKey && !typing) { event.preventDefault(); props.onUndo(); return }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLocaleLowerCase() === "y" || event.shiftKey && event.key.toLocaleLowerCase() === "z") && !typing) { event.preventDefault(); props.onRedo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !typing) { event.preventDefault(); apply(tab); return }
      if ((event.ctrlKey || event.metaKey) && event.key === "Backspace" && !typing) { event.preventDefault(); props.onClear() }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [props.open, props.onClear, props.onRedo, props.onUndo, tab])

  function patch<K extends keyof KisakiSelectionAssistantConfig>(key: K, value: KisakiSelectionAssistantConfig[K]) { props.onConfigChange({ ...props.config, [key]: value }) }
  function apply(kind: RuleKind) {
    const result = props.onApply(kind)
    setMessage(result.error
      ? { text: result.errorCode === "directory-required" ? t("selectionAssistant.directory.required", language === "zh" ? "请至少指定一个目录。" : result.error) : result.error, kind: "alert" }
      : { text: t("selectionAssistant.matched", "已匹配 {{matched}} 项，改变 {{affected}} 项。", { matched: result.matchedPaths.length, affected: result.affectedCount }), kind: "status" })
  }
  function reorderCriterion(from: number, to: number) { if (to < 0 || to >= props.config.group.sortCriteria.length || from === to) return; const next = [...props.config.group.sortCriteria]; const [item] = next.splice(from, 1); next.splice(to, 0, item!); patch("group", { ...props.config.group, sortCriteria: next }) }
  function updateCriterion(index: number, value: Partial<KisakiSelectionSortCriterion>) { patch("group", { ...props.config.group, sortCriteria: props.config.group.sortCriteria.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item) }) }
  function dropCriterion(event: DragEvent, index: number) { event.preventDefault(); if (dragIndex !== null) reorderCriterion(dragIndex, index); setDragIndex(null) }
  function importConfig() {
    try {
      props.onConfigChange(parseKisakiSelectionAssistantConfig(transferText))
      setMessage({ text: t("selectionAssistant.importSuccess", "配置导入成功。"), kind: "status" })
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), kind: "alert" })
    }
  }

  return <Popover open={props.open} onOpenChange={props.onOpenChange}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} size="sm" variant="outline"><Sparkles />{t("selectionAssistant.trigger", "选择助手")}<Badge variant="secondary">{props.stats.selectedCount}</Badge></Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(96vw,640px)] p-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <div className="text-sm font-semibold">{t("selectionAssistant.title", "智能选择助手")}</div>
          <div className="text-[11px] text-muted-foreground">{t("selectionAssistant.summary", "{{count}} 项 · {{size}} · 可回收 {{reclaimable}}", { count: props.stats.selectedCount, size: formatBytes(props.stats.selectedBytes), reclaimable: formatBytes(props.stats.reclaimableBytes) })}</div>
        </div>
        <div className="flex gap-1">
          <Button aria-label={t("selectionAssistant.undo", "撤销选择")} disabled={!props.canUndo} size="icon-sm" variant="ghost" onClick={props.onUndo}><Undo2 /></Button>
          <Button aria-label={t("selectionAssistant.redo", "重做选择")} disabled={!props.canRedo} size="icon-sm" variant="ghost" onClick={props.onRedo}><Redo2 /></Button>
        </div>
      </div>
      <ScrollArea className="h-[min(72vh,680px)]">
        <div className="grid gap-3 p-3">
          <section className="grid gap-2 rounded-md border p-2">
            <div className="text-xs font-semibold">{t("selectionAssistant.applyMode.title", "应用模式")}</div>
            <Select value={props.config.applyMode} onValueChange={(applyMode) => patch("applyMode", applyMode as KisakiSelectionApplyMode)}>
              <SelectTrigger aria-label={t("selectionAssistant.applyMode.label", "选择应用模式")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {APPLY_MODES.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.applyMode.options.${value}`, APPLY_MODE_FALLBACKS[value])}</SelectItem>)}
              </SelectContent>
            </Select>
          </section>
          <Tabs value={tab} onValueChange={(value) => setTab(value as RuleKind)}>
            <TabsList className="grid grid-cols-3">
              {RULE_KINDS.map((value) => <TabsTrigger key={value} value={value}>{t(`selectionAssistant.tabs.${value}`, RULE_KIND_FALLBACKS[value])}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="group" className="grid gap-3">
              <GroupRuleEditor config={props.config} dragIndex={dragIndex} setDragIndex={setDragIndex} patch={patch} updateCriterion={updateCriterion} reorderCriterion={reorderCriterion} dropCriterion={dropCriterion} t={t} />
              <Button onClick={() => apply("group")}><Check />{t("selectionAssistant.apply.group", "应用组规则")}</Button>
            </TabsContent>
            <TabsContent value="text" className="grid gap-3">
              <TextRuleEditor config={props.config} patch={patch} t={t} />
              <Button disabled={!props.config.text.pattern} onClick={() => apply("text")}><Check />{t("selectionAssistant.apply.text", "应用文本规则")}</Button>
            </TabsContent>
            <TabsContent value="directory" className="grid gap-3">
              <DirectoryRuleEditor config={props.config} patch={patch} t={t} />
              <Button onClick={() => apply("directory")}><Check />{t("selectionAssistant.apply.directory", "应用目录规则")}</Button>
            </TabsContent>
          </Tabs>
          <section className="grid gap-2 rounded-md border p-2">
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" onClick={props.onSelectAll}><Check />{t("selectionAssistant.actions.selectAll", "全选可见项")}</Button>
              <Button size="sm" variant="outline" onClick={props.onInvert}><ToggleLeft />{t("selectionAssistant.actions.invert", "反选可见项")}</Button>
              <Button size="sm" variant="outline" onClick={props.onClear}><RotateCcw />{t("selectionAssistant.actions.clear", "清空选择")}</Button>
            </div>
            <div className="flex gap-2">
              <Button size="xs" variant="ghost" onClick={() => setTransferText(serializeKisakiSelectionAssistantConfig(props.config))}><Save />{t("selectionAssistant.actions.export", "导出配置")}</Button>
              <Button size="xs" variant="ghost" onClick={importConfig}><Upload />{t("selectionAssistant.actions.import", "导入配置")}</Button>
              <Button size="xs" variant="ghost" onClick={() => props.onConfigChange(createDefaultKisakiSelectionAssistantConfig())}>{t("selectionAssistant.actions.reset", "重置规则")}</Button>
            </div>
            {transferText ? <Textarea aria-label={t("selectionAssistant.transferJson", "选择助手配置 JSON")} className="min-h-24 font-mono text-[10px]" value={transferText} onChange={(event) => setTransferText(event.currentTarget.value)} /> : null}
          </section>
          {message ? <div role={message.kind} className="rounded-md border px-2 py-1.5 text-xs">{message.text}</div> : null}
          <div className="text-[10px] text-muted-foreground">{t("selectionAssistant.shortcuts", "快捷键：Ctrl/Cmd+Enter 应用当前规则 · Ctrl/Cmd+Z 撤销 · Ctrl/Cmd+Y 重做 · Ctrl/Cmd+Backspace 清空")}</div>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
}

function GroupRuleEditor({ config, dragIndex, setDragIndex, patch, updateCriterion, reorderCriterion, dropCriterion, t }: { config: KisakiSelectionAssistantConfig; dragIndex: number | null; setDragIndex: (index: number | null) => void; patch: <K extends keyof KisakiSelectionAssistantConfig>(key: K, value: KisakiSelectionAssistantConfig[K]) => void; updateCriterion: (index: number, value: Partial<KisakiSelectionSortCriterion>) => void; reorderCriterion: (from: number, to: number) => void; dropCriterion: (event: DragEvent, index: number) => void; t: Translate }) {
  function addCriterion() { const index = config.group.sortCriteria.length; patch("group", { ...config.group, sortCriteria: [...config.group.sortCriteria, { id: `criterion-${Date.now()}-${index}`, field: "fileSize", direction: "desc", preferEmpty: false, enabled: true, filterCondition: "none", filterValue: "" }] }) }
  return <>
    <Select value={config.group.mode} onValueChange={(mode) => patch("group", { ...config.group, mode: mode as typeof config.group.mode })}>
      <SelectTrigger aria-label={t("selectionAssistant.group.modeLabel", "组选择模式")}><SelectValue /></SelectTrigger>
      <SelectContent>{GROUP_MODES.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.group.modes.${value}`, GROUP_MODE_FALLBACKS[value])}</SelectItem>)}</SelectContent>
    </Select>
    <div className="grid gap-2">{config.group.sortCriteria.map((criterion, index) => <div key={criterion.id} draggable onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropCriterion(event, index)} data-dragging={dragIndex === index || undefined} className="grid gap-2 rounded-md border p-2 data-[dragging=true]:opacity-50">
      <div className="flex items-center gap-1">
        <GripVertical className="size-4 cursor-grab text-muted-foreground" />
        <Switch aria-label={t("selectionAssistant.group.enableCriterion", "启用排序条件 {{index}}", { index: index + 1 })} checked={criterion.enabled} size="sm" onCheckedChange={(enabled) => updateCriterion(index, { enabled })} />
        <Select value={criterion.field} onValueChange={(field) => updateCriterion(index, { field: field as KisakiSelectionSortField })}>
          <SelectTrigger aria-label={t("selectionAssistant.group.sortField", "排序字段 {{index}}", { index: index + 1 })} className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>{SORT_FIELDS.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.group.fields.${value}`, SORT_FIELD_FALLBACKS[value])}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={criterion.direction} onValueChange={(direction) => updateCriterion(index, { direction: direction as "asc" | "desc" })}>
          <SelectTrigger aria-label={t("selectionAssistant.group.sortDirection", "排序方向 {{index}}", { index: index + 1 })} className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="asc">{t("selectionAssistant.group.directions.asc", "升序")}</SelectItem><SelectItem value="desc">{t("selectionAssistant.group.directions.desc", "降序")}</SelectItem></SelectContent>
        </Select>
        <Button aria-label={t("selectionAssistant.group.moveUp", "上移排序条件 {{index}}", { index: index + 1 })} disabled={index === 0} size="icon-sm" variant="ghost" onClick={() => reorderCriterion(index, index - 1)}><ChevronUp /></Button>
        <Button aria-label={t("selectionAssistant.group.moveDown", "下移排序条件 {{index}}", { index: index + 1 })} disabled={index === config.group.sortCriteria.length - 1} size="icon-sm" variant="ghost" onClick={() => reorderCriterion(index, index + 1)}><ChevronDown /></Button>
        <Button aria-label={t("selectionAssistant.group.delete", "删除排序条件 {{index}}", { index: index + 1 })} size="icon-sm" variant="ghost" onClick={() => patch("group", { ...config.group, sortCriteria: config.group.sortCriteria.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
      </div>
      <div className="grid grid-cols-[130px_1fr_auto] gap-2">
        <Select value={criterion.filterCondition} onValueChange={(filterCondition) => updateCriterion(index, { filterCondition: filterCondition as KisakiSelectionMatchCondition })}>
          <SelectTrigger aria-label={t("selectionAssistant.group.filterCondition", "排序过滤条件 {{index}}", { index: index + 1 })}><SelectValue /></SelectTrigger>
          <SelectContent>{MATCH_CONDITIONS.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.conditions.${value}`, MATCH_CONDITION_FALLBACKS[value])}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label={t("selectionAssistant.group.filterValue", "排序过滤值 {{index}}", { index: index + 1 })} disabled={criterion.filterCondition === "none"} value={criterion.filterValue} onChange={(event) => updateCriterion(index, { filterValue: event.currentTarget.value })} />
        <label className="flex items-center gap-1 text-xs"><Switch aria-label={t("selectionAssistant.group.preferEmptyIndexed", "空值优先 {{index}}", { index: index + 1 })} checked={criterion.preferEmpty} size="sm" onCheckedChange={(preferEmpty) => updateCriterion(index, { preferEmpty })} />{t("selectionAssistant.group.preferEmpty", "空值优先")}</label>
      </div>
    </div>)}</div>
    <Button size="sm" variant="outline" onClick={addCriterion}><Plus />{t("selectionAssistant.group.addCriterion", "添加排序条件")}</Button>
  </>
}

function TextRuleEditor({ config, patch, t }: EditorProps) { return <>
  <Select value={config.text.column} onValueChange={(column) => patch("text", { ...config.text, column: column as KisakiSelectionTextColumn })}>
    <SelectTrigger aria-label={t("selectionAssistant.text.field", "文本规则字段")}><SelectValue /></SelectTrigger>
    <SelectContent>{TEXT_COLUMNS.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.text.columns.${value}`, TEXT_COLUMN_FALLBACKS[value])}</SelectItem>)}</SelectContent>
  </Select>
  <Select value={config.text.condition} onValueChange={(condition) => patch("text", { ...config.text, condition: condition as typeof config.text.condition })}>
    <SelectTrigger aria-label={t("selectionAssistant.text.condition", "文本匹配条件")}><SelectValue /></SelectTrigger>
    <SelectContent>{MATCH_CONDITIONS.filter((value) => value !== "none").map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.conditions.${value}`, MATCH_CONDITION_FALLBACKS[value])}</SelectItem>)}</SelectContent>
  </Select>
  <Input aria-label={t("selectionAssistant.text.pattern", "文本规则模式")} value={config.text.pattern} onChange={(event) => patch("text", { ...config.text, pattern: event.currentTarget.value })} />
  <div className="grid grid-cols-3 gap-2">
    <Toggle label={t("selectionAssistant.text.regex", "正则表达式")} value={config.text.useRegex} onChange={(useRegex) => patch("text", { ...config.text, useRegex })} />
    <Toggle label={t("selectionAssistant.text.caseSensitive", "区分大小写")} value={config.text.caseSensitive} onChange={(caseSensitive) => patch("text", { ...config.text, caseSensitive })} />
    <Toggle label={t("selectionAssistant.text.wholeColumn", "整列匹配")} value={config.text.matchWholeColumn} onChange={(matchWholeColumn) => patch("text", { ...config.text, matchWholeColumn })} />
  </div>
</> }
function DirectoryRuleEditor({ config, patch, t }: EditorProps) { return <>
  <Select value={config.directory.mode} onValueChange={(mode) => patch("directory", { ...config.directory, mode: mode as typeof config.directory.mode })}>
    <SelectTrigger aria-label={t("selectionAssistant.directory.mode", "目录规则模式")}><SelectValue /></SelectTrigger>
    <SelectContent>{DIRECTORY_MODES.map((value) => <SelectItem key={value} value={value}>{t(`selectionAssistant.directory.modes.${value}`, DIRECTORY_MODE_FALLBACKS[value])}</SelectItem>)}</SelectContent>
  </Select>
  <Textarea aria-label={t("selectionAssistant.directory.directories", "选择规则目录")} className="min-h-24 font-mono text-xs" placeholder={t("selectionAssistant.directory.placeholder", "每行一个目录")} value={config.directory.directories.join("\n")} onChange={(event) => patch("directory", { ...config.directory, directories: lines(event.currentTarget.value) })} />
  <div className="text-[10px] text-muted-foreground">{t("selectionAssistant.directory.protected", "参考目录中的参考项始终受保护，不会进入可操作选择。")}</div>
</> }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-xs"><span>{label}</span><Switch aria-label={label} checked={value} size="sm" onCheckedChange={onChange} /></label> }
type EditorProps = { config: KisakiSelectionAssistantConfig; patch: <K extends keyof KisakiSelectionAssistantConfig>(key: K, value: KisakiSelectionAssistantConfig[K]) => void; t: Translate }
const APPLY_MODES: KisakiSelectionApplyMode[] = ["replace", "add", "remove", "intersect"]
const APPLY_MODE_FALLBACKS: Record<KisakiSelectionApplyMode, string> = { replace: "替换选择", add: "添加到选择", remove: "从选择移除", intersect: "与当前选择取交集" }
const RULE_KINDS: RuleKind[] = ["group", "text", "directory"]
const RULE_KIND_FALLBACKS: Record<RuleKind, string> = { group: "组规则", text: "文本规则", directory: "目录规则" }
const GROUP_MODES = ["all-except-one", "select-one", "all-except-one-per-folder", "all-except-one-matching-set"] as const
const GROUP_MODE_FALLBACKS: Record<(typeof GROUP_MODES)[number], string> = { "all-except-one": "每组除一个外全选", "select-one": "每组只选一个", "all-except-one-per-folder": "每目录除一个外全选", "all-except-one-matching-set": "除一个匹配集外全选" }
const SORT_FIELDS: KisakiSelectionSortField[] = ["folderPath", "fileName", "fileSize", "creationDate", "modifiedDate", "resolution", "disk", "fileType", "hash", "hardLinks"]
const SORT_FIELD_FALLBACKS: Record<KisakiSelectionSortField, string> = { folderPath: "文件夹", fileName: "文件名", fileSize: "大小", creationDate: "创建时间", modifiedDate: "修改时间", resolution: "分辨率", disk: "磁盘", fileType: "扩展名", hash: "哈希", hardLinks: "硬链接" }
const MATCH_CONDITIONS: KisakiSelectionMatchCondition[] = ["none", "contains", "not-contains", "starts-with", "ends-with", "equals"]
const MATCH_CONDITION_FALLBACKS: Record<KisakiSelectionMatchCondition, string> = { none: "无过滤", contains: "包含", "not-contains": "不包含", "starts-with": "开头是", "ends-with": "结尾是", equals: "等于" }
const TEXT_COLUMNS: KisakiSelectionTextColumn[] = ["fullPath", "fileName", "folderPath"]
const TEXT_COLUMN_FALLBACKS: Record<KisakiSelectionTextColumn, string> = { fullPath: "完整路径", fileName: "文件名", folderPath: "文件夹路径" }
const DIRECTORY_MODES = ["keep-one-per-directory", "select-all-in-directory", "exclude-directory"] as const
const DIRECTORY_MODE_FALLBACKS: Record<(typeof DIRECTORY_MODES)[number], string> = { "keep-one-per-directory": "每目录保留一个", "select-all-in-directory": "选择目录内全部", "exclude-directory": "排除目录中的选择" }
function lines(value: string): string[] { return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))] }
function formatBytes(bytes: number): string { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB", "TB"]; let value = bytes / 1024, unit = units[0]!; for (let index = 1; index < units.length && value >= 1024; index += 1) { value /= 1024; unit = units[index]! } return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}` }
