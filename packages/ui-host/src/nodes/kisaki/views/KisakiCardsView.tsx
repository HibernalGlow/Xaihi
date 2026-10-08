import { useState } from "react"
import { AlertTriangle, ArchiveX, Eraser, FileText, MoveRight, RotateCcw, Save, Search, Trash2, WandSparkles, X } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { KisakiActivityLogView } from "../activity-log"
import { KisakiAnalysisView } from "../analysis-panel"
import { KisakiSelectionAssistant } from "../selection-assistant"
import { KisakiDirectoryEditor } from "../source-inputs"
import { createBadNameRenamePlan } from "@hibernalglow/xaihi-kisaki/bad-names"
import { createExifCleanupPlan } from "@hibernalglow/xaihi-kisaki/exif"
import { createVideoOptimizationPlan } from "@hibernalglow/xaihi-kisaki/video-optimizer"
import { AlgorithmFields } from "./KisakiPanelsView"
import type { KisakiCardId } from "@hibernalglow/xaihi-kisaki/card-layout"
import { buildKisakiGroupOrganizePlan } from "@hibernalglow/xaihi-kisaki/operations"
import { deleteKisakiScanPreset, exportKisakiScanPresets, importKisakiScanPresets, kisakiScanPresetFromValues, kisakiScanPresetToValues } from "@hibernalglow/xaihi-kisaki/scan-presets"
import { errorMessage, getKisakiToolMeta, type KisakiView } from "./model"
import type { KisakiCardState } from "../types"

function KisakiCardContent({ id, props }: { id: KisakiCardId; props: KisakiView }) {
  if (id === "source-settings") return <SourceSettingsCard {...props} />
  if (id === "preview") return <PreviewSettingsCard {...props} />
  if (id === "analysis") return <KisakiAnalysisView groups={props.filterResult.groups} selectedPaths={props.selectedPaths} tool={props.tool} hashSize={Number(props.data.similarImagesHashSize ?? 16)} />
  if (id === "logs") return <KisakiActivityLogView entries={props.activityLog} onClear={props.clearActivityLog} onCopyText={props.copyText} />
  if (id === "selection") return <SelectionCard {...props} />
  return <OperationsCard {...props} />
}

function SourceSettingsCard(props: KisakiView) {
  const activeTab = props.data.sourceSettingsTab === "algorithm" ? "algorithm" : "paths"
  return (
    <Tabs value={activeTab} className="min-w-0" onValueChange={(sourceSettingsTab) => props.patch({ sourceSettingsTab: sourceSettingsTab as KisakiCardState["sourceSettingsTab"] })}>
      <TabsList layout="fill" variant="line" className="sticky top-0 z-10 mb-3 min-w-0 overflow-hidden bg-card">
        <TabsTrigger value="paths" className="min-w-0 px-1.5">{props.t("sources.tabs.paths", "路径")}</TabsTrigger>
        <TabsTrigger value="algorithm" className="min-w-0 px-1.5">{props.t("sources.tabs.algorithm", "算法")}</TabsTrigger>
      </TabsList>
      <TabsContent value="paths" className="mt-0 grid gap-3">
        <ScanPresetManager {...props} />
        <KisakiDirectoryEditor kind="included" label={props.t("sources.included", "包含目录")} value={props.data.includedDirectoriesText} referenceValue={props.data.includedDirectoriesReferencedText} referenceKeywords={props.data.referencePathKeywords ?? "#compare"} pickFiles={props.pickFiles} pickDirectory={props.pickDirectory} pickDirectories={props.pickDirectories} onChange={(includedDirectoriesText) => props.patch({ includedDirectoriesText })} onReferenceChange={(includedDirectoriesReferencedText) => props.patch({ includedDirectoriesReferencedText })} />
      </TabsContent>
      <TabsContent value="algorithm" className="mt-0 grid gap-3">
        <AlgorithmFields {...props} />
      </TabsContent>
    </Tabs>
  )
}

function ScanPresetManager(props: KisakiView) {
  const presets = props.data.scanPresets ?? []
  const active = presets.find((preset) => preset.id === props.data.activeScanPresetId)
  const [name, setName] = useState(active?.name ?? "")
  const [transferText, setTransferText] = useState("")
  const [error, setError] = useState("")
  function apply(id: string) {
    const preset = presets.find((item) => item.id === id)
    if (!preset) return
    setName(preset.name)
    setError("")
    props.patch({
      ...(kisakiScanPresetToValues(preset) as Partial<KisakiCardState>),
      activeScanPresetId: preset.id
    })
  }
  function save(overwrite: boolean) {
    try {
      const saved = kisakiScanPresetFromValues(name, props.data as Record<string, unknown>, { presets, id: overwrite ? active?.id : undefined })
      setName(saved.preset.name)
      setError("")
      props.patch({
        scanPresets: saved.presets,
        activeScanPresetId: saved.preset.id
      })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  function remove() {
    if (!active) return
    props.patch({
      scanPresets: deleteKisakiScanPreset(presets, active.id),
      activeScanPresetId: undefined
    })
    setName("")
    setError("")
  }
  function importPresets() {
    try {
      const imported = importKisakiScanPresets(transferText, presets)
      props.patch({ scanPresets: imported })
      setError("")
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <details className="rounded-md border bg-muted/20 p-2">
      <summary className="cursor-pointer text-xs font-medium">{props.t("presets.title", "扫描配置预设")} · {presets.length}</summary>
      <div className="mt-2 grid gap-2">
        {presets.length ? (
          <Field label={props.t("presets.active", "活动预设")}>
            <Select value={active?.id ?? ""} onValueChange={apply}>
              <SelectTrigger aria-label="active scan preset">
                <SelectValue placeholder={props.t("presets.choose", "选择预设")} />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name} · {getKisakiToolMeta(preset.tool, props.t).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label={props.t("presets.name", "预设名称")}>
          <Input aria-label="scan preset name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-1">
          <Button size="xs" variant="outline" onClick={() => save(false)}>
            {props.t("presets.create", "新建")}
          </Button>
          <Button disabled={!active} size="xs" variant="outline" onClick={() => save(true)}>
            {props.t("presets.overwrite", "覆盖")}
          </Button>
          <Button disabled={!active} size="xs" variant="ghost" onClick={remove}>
            {props.t("presets.delete", "删除")}
          </Button>
        </div>
        <Field label={props.t("presets.transfer", "导入 / 导出 JSON")}>
          <Textarea aria-label="scan preset transfer" className="min-h-24 font-mono text-[10px]" value={transferText} onChange={(event) => setTransferText(event.currentTarget.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-1">
          <Button
            disabled={!presets.length}
            size="xs"
            variant="outline"
            onClick={() => {
              setTransferText(exportKisakiScanPresets(presets))
              setError("")
            }}
          >
            {props.t("presets.export", "导出")}
          </Button>
          <Button disabled={!transferText.trim()} size="xs" variant="outline" onClick={importPresets}>
            {props.t("presets.importMerge", "导入合并")}
          </Button>
        </div>
        {error ? (
          <div role="alert" className="text-xs text-destructive">
            {error}
          </div>
        ) : null}
        <div className="text-[10px] text-muted-foreground">{props.t("presets.persistHint", "活动预设及已应用字段随节点状态持久化，重新打开时自动恢复。")}</div>
      </div>
    </details>
  )
}

function PreviewSettingsCard(props: KisakiView) {
  const supportsThumbnailToggle = props.tool === "duplicate-files" || props.tool === "similar-images" || props.tool === "similar-videos"
  return (
    <div className="grid gap-2 text-xs">
      {supportsThumbnailToggle ? <SwitchLine label={props.t("preview.thumbnails", "显示结果缩略图")} checked={props.thumbnailEnabled} onChange={props.setThumbnailEnabled} /> : null}
      <SwitchLine label={props.t("preview.fixed", "固定媒体预览")} checked={props.previewPanelEnabled} onChange={props.setPreviewPanelEnabled} />
      <div className="text-muted-foreground">
        {props.t("preview.currentTool", "当前工具：{{tool}}", { tool: getKisakiToolMeta(props.tool, props.t).label })}
        {props.t("preview.hint", "。启用后图片、视频和音频在结果侧栏中打开。")}
      </div>
    </div>
  )
}

function SelectionCard(props: KisakiView) {
  return (
    <div className="grid gap-3">
      <div className="text-xs text-muted-foreground">
        {props.t("selection.selectedPrefix", "已选择")} <strong className="text-foreground">{props.selectedPaths.length}</strong> {props.t("selection.pathSuffix", "个路径。")}
      </div>
      <SelectionAssistantControl {...props} />
      <Field label={props.t("selection.smart", "智能选择")}>
        <div className="grid grid-cols-2 gap-1">
          <Button size="xs" variant="outline" onClick={() => props.applySmartSelection("all-except-first")}>
            {props.t("selection.allButFirst", "每组除首个")}
          </Button>
          <Button size="xs" variant="outline" onClick={() => props.applySmartSelection("all-except-newest")}>
            {props.t("selection.keepNewest", "保留最新")}
          </Button>
          <Button size="xs" variant="outline" onClick={() => props.applySmartSelection("all-except-biggest")}>
            {props.t("selection.keepLargest", "保留最大")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => props.patch({ operation: null })}>
            <X />
            {props.t("selection.clear", "清除操作")}
          </Button>
        </div>
      </Field>
    </div>
  )
}

function OperationsCard(props: KisakiView) {
  const liveDeleteDescription = props.data.deleteMode === "permanent" ? props.t("operations.deletePermanentDescription", "将永久删除 {{count}} 个路径，此操作不可撤销。", { count: props.selectedPaths.length }) : props.t("operations.deleteTrashDescription", "将把 {{count}} 个路径移入系统回收站。", { count: props.selectedPaths.length })
  const organizePlan = buildKisakiGroupOrganizePlan(props.filterResult.groups, props.selectedPaths, {
    subfolderTemplate: props.data.organizeSubfolderTemplate,
    skipSingleFileFolders: props.data.organizeSkipSingleFileFolders
  })
  const simiuSetsEnabled = props.tool === "similar-images" && props.data.similarImagesMode === "simiu-sets"
  const simiuOperations = props.result?.simiuSets?.operations ?? []
  const simiuUndoLogPath = props.data.operation?.simiuSets?.undoLogPaths?.at(-1)
  const visibleEntries = props.filterResult.groups.flatMap((group) => group.entries)
  const exportEntries = props.data.exportScope === "all" ? (props.result?.entries ?? []) : props.data.exportScope === "visible" ? visibleEntries : (props.result?.entries ?? []).filter((entry) => props.selectedPaths.includes(entry.path))
  const renameItems = (props.result?.entries ?? [])
    .filter((entry) => props.selectedPaths.includes(entry.path) && entry.properExtension)
    .map((entry) => ({
      path: entry.path,
      properExtension: entry.properExtension!
    }))
  const badNameRenameItems = props.tool === "bad-names"
    ? createBadNameRenamePlan(props.result?.entries ?? [], props.selectedPaths)
    : []
  const exifItems = props.tool === "exif-remover"
    ? createExifCleanupPlan(props.result?.entries ?? [], props.selectedPaths)
    : []
  const videoOptimizerItems = props.tool === "video-optimizer"
    ? createVideoOptimizationPlan(props.result?.entries ?? [], props.selectedPaths, props.data.videoOptimizerMode ?? "transcode")
    : []
  const canCreateExifCandidate = props.nativeCapabilities.has("operation.exif.candidate")
  const canCreateVideoOptimizerCandidate = props.nativeCapabilities.has("operation.video-optimizer.candidate")
  const videoOptimizerMode = props.data.videoOptimizerMode ?? "transcode"
  return (
    <div className="grid gap-3">
      <div className="text-xs text-muted-foreground">{props.t("operations.dryRunHint", "删除、移动和改名默认只生成可检查的逐项计划。")}</div>
      <SwitchLine label={props.t("operations.dryRun", "仅预演操作")} checked={props.data.dryRun ?? true} onChange={(dryRun) => props.patch({ dryRun })} />
      <Field label={props.t("operations.deleteMode", "删除方式")}>
        <Select
          value={props.data.deleteMode ?? "trash"}
          onValueChange={(deleteMode) =>
            props.patch({
              deleteMode: deleteMode as KisakiCardState["deleteMode"]
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trash">{props.t("operations.trash", "移入回收站")}</SelectItem>
            <SelectItem value="permanent">{props.t("operations.permanent", "永久删除")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={props.t("operations.destination", "移动或复制到")}>
        <div className="flex gap-1">
          <Input value={props.data.destinationDirectory ?? ""} placeholder="D:/Review" onChange={(event) => props.patch({ destinationDirectory: event.currentTarget.value })} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button aria-label="move selected" disabled={!props.selectedPaths.length || !props.data.destinationDirectory || props.running} size="icon-sm" variant="outline">
                <MoveRight />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planMoveTitle", "生成移动/复制计划？") : props.t("operations.executeMoveTitle", "执行移动/复制？")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {props.t("operations.target", "目标：{{path}}。", { path: props.data.destinationDirectory })}{(props.data.dryRun ?? true) ? props.t("operations.noChanges", "当前不会修改文件。") : props.t("operations.liveMoveDescription", "将真实{{action}} {{count}} 项。", { action: props.data.copyMode ? props.t("operations.copyVerb", "复制") : props.t("operations.moveVerb", "移动"), count: props.selectedPaths.length })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void props.executeOperation("move")}>{props.t("operations.confirmMove", "确认移动")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Field>
      <SwitchLine label={props.t("operations.copyInstead", "复制而非移动")} checked={props.data.copyMode ?? false} onChange={(copyMode) => props.patch({ copyMode })} />
      <SwitchLine label={props.t("operations.preserveStructure", "保留原目录结构")} checked={props.data.preserveStructure ?? false} onChange={(preserveStructure) => props.patch({ preserveStructure })} />
      <Field label={props.t("operations.conflict", "目标冲突")}>
        <Select
          value={props.data.conflictPolicy ?? "skip"}
          onValueChange={(conflictPolicy) =>
            props.patch({
              conflictPolicy: conflictPolicy as KisakiCardState["conflictPolicy"]
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">{props.t("operations.skip", "跳过")}</SelectItem>
            <SelectItem value="overwrite">{props.t("operations.overwrite", "覆盖")}</SelectItem>
            <SelectItem value="rename">{props.t("operations.autoRename", "自动改名")}</SelectItem>
            <SelectItem value="error">{props.t("operations.reportError", "报告错误")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {simiuSetsEnabled ? (
        <div className="grid gap-2 rounded-md border p-2">
          <div className="text-xs text-muted-foreground">按每个来源目录分别整理相似图片；扫描只生成预览，应用时写入可撤销的 JSON 记录。</div>
          <Field label="集合操作">
            <Select value={props.data.simiuSetsOperationMode ?? "move"} onValueChange={(simiuSetsOperationMode) => props.patch({ simiuSetsOperationMode: simiuSetsOperationMode as KisakiCardState["simiuSetsOperationMode"] })}>
              <SelectTrigger aria-label="simiu set operation mode"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="move">移动</SelectItem><SelectItem value="copy">复制</SelectItem><SelectItem value="link">硬链接</SelectItem></SelectContent>
            </Select>
          </Field>
          <SwitchLine label="撤销时清理空集合目录" checked={props.data.simiuSetsCleanEmptyDirectories ?? true} onChange={(simiuSetsCleanEmptyDirectories) => props.patch({ simiuSetsCleanEmptyDirectories })} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!simiuOperations.length || props.running} size="sm" variant="outline"><ArchiveX />整理 Simiu 集合（{simiuOperations.length}）</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{(props.data.dryRun ?? true) ? "生成 Simiu 集合操作计划？" : "应用 Simiu 集合操作？"}</AlertDialogTitle>
                <AlertDialogDescription>将在每个来源目录创建集合子目录；移动、复制和硬链接都将保留逐项操作记录。</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
                {simiuOperations.slice(0, 12).map((item) => <div key={item.sourcePath} className="grid"><span className="truncate font-mono">{item.sourcePath}</span><span className="truncate font-mono text-muted-foreground">→ {item.targetPath}</span></div>)}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void props.executeOperation("simiu-apply", { selectedPaths: simiuOperations.map((item) => item.sourcePath), simiuSetsOperations: simiuOperations, simiuSetsOperationMode: props.data.simiuSetsOperationMode ?? "move" })}>确认</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {simiuUndoLogPath ? <AlertDialog>
            <AlertDialogTrigger asChild><Button disabled={props.running} size="sm" variant="ghost"><RotateCcw />撤销最近的 Simiu 操作</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>撤销 Simiu 集合操作？</AlertDialogTitle><AlertDialogDescription>{simiuUndoLogPath}</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void props.executeOperation("simiu-undo", { selectedPaths: [simiuUndoLogPath], simiuSetsUndoLogPath: simiuUndoLogPath, simiuSetsCleanEmptyDirectories: props.data.simiuSetsCleanEmptyDirectories ?? true, dryRun: false })}>确认撤销</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog> : null}
        </div>
      ) : props.tool === "similar-images" ? (
        <div className="grid gap-2 rounded-md border p-2">
          <Field label={props.t("operations.organizeTemplate", "相似组子目录模板")}>
            <Input
              value={props.data.organizeSubfolderTemplate ?? "variants_{groupId}"}
              onChange={(event) =>
                props.patch({
                  organizeSubfolderTemplate: event.currentTarget.value
                })
              }
            />
          </Field>
          <SwitchLine label={props.t("operations.skipSingleFolder", "跳过仅一个文件的来源目录")} checked={props.data.organizeSkipSingleFileFolders ?? true} onChange={(organizeSkipSingleFileFolders) => props.patch({ organizeSkipSingleFileFolders })} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!organizePlan.items.length || props.running} size="sm" variant="outline">
                <ArchiveX />
                {props.t("operations.organizeGroups", "整理相似组（{{count}}）", { count: organizePlan.items.length })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planOrganizeTitle", "生成相似组整理计划？") : props.t("operations.executeOrganizeTitle", "执行相似组整理？")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {props.t("operations.organizeDescription", "将 {{groups}} 组、{{items}} 项整理到 {{folders}} 个子目录。", { groups: organizePlan.selectedGroupCount, items: organizePlan.items.length, folders: organizePlan.targetFolderCount })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
                {organizePlan.items.slice(0, 12).map((item) => (
                  <div key={item.path} className="grid">
                    <span className="truncate font-mono">{item.path}</span>
                    <span className="truncate font-mono text-muted-foreground">→ {item.destination}</span>
                  </div>
                ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void props.executeOperation("move", {
                      selectedPaths: organizePlan.items.map((item) => item.path),
                      destinationItems: organizePlan.items
                    })
                  }
                >
                  {props.t("operations.confirmOrganize", "确认整理")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
      {props.tool === "bad-extensions" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!renameItems.length || props.running} size="sm" variant="outline">
              {props.t("operations.fixExtensions", "修正扩展名（{{count}}）", { count: renameItems.length })}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planRenameTitle", "生成扩展名修正计划？") : props.t("operations.executeRenameTitle", "执行扩展名修正？")}</AlertDialogTitle>
              <AlertDialogDescription>{props.t("operations.renameDescription", "将按扫描结果修正 {{count}} 项。执行后如需撤销，请根据操作详情中的源/目标路径反向改名。", { count: renameItems.length })}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
              {renameItems.slice(0, 12).map((item) => (
                <div key={item.path} className="font-mono">
                  {item.path} → .{item.properExtension}
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void props.executeOperation("rename", {
                    renameItems,
                    selectedPaths: renameItems.map((item) => item.path)
                  })
                }
              >
                {props.t("operations.confirmRename", "确认改名")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {props.tool === "bad-names" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!badNameRenameItems.length || props.running} size="sm" variant="outline">
              <FileText />
              {props.t("operations.fixBadNames", "修正文件名（{{count}}）", { count: badNameRenameItems.length })}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planBadNamesTitle", "生成文件名修正计划？") : props.t("operations.executeBadNamesTitle", "修正文件名？")}</AlertDialogTitle>
              <AlertDialogDescription>{props.t("operations.badNamesDescription", "将按扫描建议重命名 {{count}} 项。执行后请根据操作详情中的源和目标路径反向改名以撤销。", { count: badNameRenameItems.length })}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
              {badNameRenameItems.slice(0, 12).map((item) => (
                <div key={item.path} className="font-mono">
                  {item.path} → {item.targetName}
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void props.executeOperation("rename", {
                    renameItems: badNameRenameItems,
                    selectedPaths: badNameRenameItems.map((item) => item.path)
                  })
                }
              >
                {props.t("operations.confirmBadNames", "确认改名")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {props.tool === "exif-remover" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!exifItems.length || !canCreateExifCandidate || props.running} size="sm" variant="outline" title={canCreateExifCandidate ? undefined : props.t("operations.exifCandidateUnavailable", "当前原生绑定无法安全创建 EXIF 清理候选文件。")}>
              <Eraser />
              {props.t("operations.cleanExif", "清理 EXIF（{{count}}）", { count: exifItems.length })}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planExifTitle", "生成 EXIF 清理计划？") : props.t("operations.executeExifTitle", "清理 EXIF 元数据？")}</AlertDialogTitle>
              <AlertDialogDescription>{(props.data.dryRun ?? true) ? props.t("operations.exifDryRunDescription", "将预览 {{count}} 项的元数据清理；不会修改文件。", { count: exifItems.length }) : props.t("operations.exifLiveDescription", "每个源文件会先移入系统回收站，再用已清理的临时候选文件替换。替换失败时，候选文件会保留，原文件可从回收站恢复。", { count: exifItems.length })}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
              {exifItems.slice(0, 12).map((item) => (
                <div key={item.path} className="grid">
                  <span className="truncate font-mono">{item.path}</span>
                  <span className="truncate text-muted-foreground">{props.t("operations.exifTagCount", "移除 {{count}} 个 EXIF 标签", { count: item.tags.length })}</span>
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void props.executeOperation("clean-exif", {
                    exifItems,
                    selectedPaths: exifItems.map((item) => item.path)
                  })
                }
              >
                {props.t("operations.confirmExif", "确认清理 EXIF")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {props.tool === "video-optimizer" ? (
        <div className="grid gap-2 rounded-md border p-2">
          <Field label={props.t("operations.videoTargetCodec", "目标编码")}>
            <Select value={props.data.videoOptimizerTargetCodec ?? "h265"} onValueChange={(videoOptimizerTargetCodec) => props.patch({ videoOptimizerTargetCodec: videoOptimizerTargetCodec as KisakiCardState["videoOptimizerTargetCodec"] })}>
              <SelectTrigger aria-label={props.t("operations.videoTargetCodec", "Target codec")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="h264">H.264</SelectItem>
                <SelectItem value="h265">H.265 / HEVC</SelectItem>
                <SelectItem value="av1">AV1</SelectItem>
                <SelectItem value="vp9">VP9</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={props.t("operations.videoQuality", "编码质量")}>
            <Input aria-label={props.t("operations.videoQuality", "Encoding quality")} type="number" min={0} max={51} value={props.data.videoOptimizerQuality ?? "23"} onChange={(event) => props.patch({ videoOptimizerQuality: event.currentTarget.value })} />
          </Field>
          <SwitchLine label={props.t("operations.videoFailIfNotSmaller", "结果不更小时保留源文件")} checked={props.data.videoOptimizerFailIfNotSmaller ?? true} onChange={(videoOptimizerFailIfNotSmaller) => props.patch({ videoOptimizerFailIfNotSmaller })} />
          {videoOptimizerMode === "crop" ? <SwitchLine label={props.t("operations.videoCropTranscode", "裁剪时重新编码")} checked={props.data.videoOptimizerCropTranscode ?? false} onChange={(videoOptimizerCropTranscode) => props.patch({ videoOptimizerCropTranscode })} /> : null}
          {videoOptimizerMode === "transcode" ? <>
            <Field label={props.t("operations.videoNoiseReduction", "降噪")}>
              <Select value={props.data.videoOptimizerNoiseReduction ?? "none"} onValueChange={(videoOptimizerNoiseReduction) => props.patch({ videoOptimizerNoiseReduction: videoOptimizerNoiseReduction as KisakiCardState["videoOptimizerNoiseReduction"] })}>
                <SelectTrigger aria-label={props.t("operations.videoNoiseReduction", "Noise reduction")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{props.t("operations.videoNoiseReductionNone", "无")}</SelectItem>
                  <SelectItem value="hqdn3d">{props.t("operations.videoNoiseReductionHqdn3d", "HQDN3D")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {props.data.videoOptimizerNoiseReduction === "hqdn3d" ? <Field label={props.t("operations.videoNoiseReductionStrength", "降噪强度")}><Input aria-label={props.t("operations.videoNoiseReductionStrength", "Noise reduction strength")} type="number" min={1} max={10} value={props.data.videoOptimizerNoiseReductionStrength ?? "5"} onChange={(event) => props.patch({ videoOptimizerNoiseReductionStrength: event.currentTarget.value })} /></Field> : null}
            <SwitchLine label={props.t("operations.videoLimitSize", "限制最大分辨率")} checked={props.data.videoOptimizerLimitVideoSize ?? false} onChange={(videoOptimizerLimitVideoSize) => props.patch({ videoOptimizerLimitVideoSize })} />
            {(props.data.videoOptimizerLimitVideoSize ?? false) ? <div className="grid grid-cols-2 gap-2"><Field label={props.t("operations.videoMaximumWidth", "最大宽度")}><Input aria-label={props.t("operations.videoMaximumWidth", "Maximum width")} type="number" min={1} max={16384} value={props.data.videoOptimizerMaximumWidth ?? "1920"} onChange={(event) => props.patch({ videoOptimizerMaximumWidth: event.currentTarget.value })} /></Field><Field label={props.t("operations.videoMaximumHeight", "最大高度")}><Input aria-label={props.t("operations.videoMaximumHeight", "Maximum height")} type="number" min={1} max={16384} value={props.data.videoOptimizerMaximumHeight ?? "1080"} onChange={(event) => props.patch({ videoOptimizerMaximumHeight: event.currentTarget.value })} /></Field></div> : null}
          </> : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!videoOptimizerItems.length || !canCreateVideoOptimizerCandidate || props.running} size="sm" variant="outline" title={canCreateVideoOptimizerCandidate ? undefined : props.t("operations.videoCandidateUnavailable", "当前原生绑定无法安全创建视频优化候选文件。")}>
                <WandSparkles />
                {props.t("operations.optimizeVideos", "优化视频（{{count}}）", { count: videoOptimizerItems.length })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planVideoOptimizeTitle", "生成视频优化计划？") : props.t("operations.executeVideoOptimizeTitle", "优化视频？")}</AlertDialogTitle>
                <AlertDialogDescription>{(props.data.dryRun ?? true) ? props.t("operations.videoOptimizeDryRunDescription", "将预览 {{count}} 项视频优化；不会修改文件。", { count: videoOptimizerItems.length }) : props.t("operations.videoOptimizeLiveDescription", "每个源文件会先移入系统回收站，再用临时候选文件替换。替换失败时，候选文件会保留，原文件可从回收站恢复。")}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 text-xs">
                {videoOptimizerItems.slice(0, 12).map((item) => <div key={item.path} className="grid"><span className="truncate font-mono">{item.path}</span><span className="truncate text-muted-foreground">{item.cropRect ? `${item.codec} -> crop ${item.cropRect.left},${item.cropRect.top},${item.cropRect.right},${item.cropRect.bottom}` : `${item.codec} -> ${props.data.videoOptimizerTargetCodec ?? "h265"}`}</span></div>)}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void props.executeOperation("optimize-video", { videoOptimizerItems, selectedPaths: videoOptimizerItems.map((item) => item.path) })}>{props.t("operations.confirmVideoOptimize", "确认优化")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
      <Field label={props.t("operations.exportResults", "导出结果")}>
        <div className="grid gap-1">
          <Select
            value={props.data.exportScope ?? "selected"}
            onValueChange={(exportScope) =>
              props.patch({
                exportScope: exportScope as KisakiCardState["exportScope"]
              })
            }
          >
            <SelectTrigger aria-label="export scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selected">{props.t("operations.scopeSelected", "选择项")}</SelectItem>
              <SelectItem value="visible">{props.t("operations.scopeVisible", "当前视图")}</SelectItem>
              <SelectItem value="all">{props.t("operations.scopeAll", "全部结果")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Input value={props.data.outputPath ?? ""} placeholder="D:/result.json" onChange={(event) => props.patch({ outputPath: event.currentTarget.value })} />
            <Button
              aria-label="save selected"
              disabled={!exportEntries.length || !props.data.outputPath || props.running}
              size="icon-sm"
              variant="outline"
              onClick={() =>
                void props.executeOperation("save", {
                  exportEntries,
                  selectedPaths: exportEntries.map((entry) => entry.path),
                  exportScope: props.data.exportScope ?? "selected"
                })
              }
            >
              <Save />
            </Button>
          </div>
        </div>
      </Field>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={!props.selectedPaths.length || props.running} variant="destructive">
            <Trash2 />
            {props.t("operations.deleteSelected", "删除已选")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{(props.data.dryRun ?? true) ? props.t("operations.planDeleteTitle", "生成删除计划？") : props.data.deleteMode === "permanent" ? props.t("operations.deletePermanentTitle", "永久删除已选文件？") : props.t("operations.deleteTrashTitle", "将已选文件移入回收站？")}</AlertDialogTitle>
            <AlertDialogDescription>{(props.data.dryRun ?? true) ? props.t("operations.dryRunDescription", "当前是预演模式，不会修改文件。") : liveDeleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{props.t("common.cancel", "取消")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void props.executeOperation("delete")}>
              {props.t("operations.confirmDelete", "确认删除")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {props.data.operation ? <OperationResultDetails data={props.data.operation} t={props.t} /> : null}
    </div>
  )
}

function OperationResultDetails({ data, t }: { data: import("@hibernalglow/xaihi-kisaki/core").KisakiData; t: KisakiView["t"] }) {
  return (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t("operations.lastDetails", "上次操作详情")}</span>
        <span className="text-muted-foreground">
          {t("operations.resultSummary", "{{affected}} 成功或计划 / {{errors}} 错误", { affected: data.affectedCount, errors: data.errorCount })}
        </span>
      </div>
      <div className="grid max-h-48 gap-1 overflow-auto">
        {data.entries.map((entry) => (
          <div key={entry.id} className="grid gap-0.5 rounded border bg-background/70 p-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono">{entry.path}</span>
              <Badge variant={entry.status === "error" ? "destructive" : entry.status === "skipped" ? "secondary" : "outline"}>{entry.status ?? "unknown"}</Badge>
            </div>
            {entry.secondaryPath ? <div className="truncate font-mono text-muted-foreground">→ {entry.secondaryPath}</div> : null}
            {entry.error ? <div className="text-destructive">{entry.error}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function SelectionAssistantControl(props: KisakiView) {
  return <KisakiSelectionAssistant open={props.selectionAssistantOpen} config={props.selectionConfig} stats={props.selectionStats} canUndo={props.selectionHistory.past.length > 0} canRedo={props.selectionHistory.future.length > 0} onOpenChange={props.setSelectionAssistantOpen} onConfigChange={props.setSelectionConfig} onApply={props.applySelectionRule} onUndo={props.undoSelection} onRedo={props.redoSelection} onClear={() => props.setSelectedPaths([])} onInvert={props.invertSelection} onSelectAll={props.selectAllVisible} />
}

function StatusBar(props: KisakiView) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md border bg-muted/20 px-2 py-1">
      <Progress className="h-1.5 flex-1" value={props.data.progress ?? 0} />
      <span className="max-w-[55%] truncate text-[11px] text-muted-foreground">{props.data.progressText || props.t("progress.ready", "Kisaki 已就绪。")}</span>
      {props.data.phase === "error" ? <AlertTriangle className="size-3.5 text-destructive" /> : null}
    </div>
  )
}
function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-sm font-semibold", accent && "text-primary")}>{value}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </label>
  )
}
function SwitchLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1.5 text-xs">
      <span>{label}</span>
      <Switch aria-label={label} checked={checked} size="sm" onCheckedChange={onChange} />
    </label>
  )
}
function SectionHeader({ icon, title, action }: { icon: typeof Search; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center border-b px-2 py-1">
      <div className="min-w-0 flex-1">
        <SectionTitle icon={icon} title={title} />
      </div>
      {action}
    </div>
  )
}
function SectionTitle({ icon: Icon, title }: { icon: typeof Search; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
      <Icon className="size-3.5 text-primary" />
      {title}
    </div>
  )
}

export {
  KisakiCardContent,
  Field,
  Metric,
  SectionHeader,
  StatusBar,
  SwitchLine,
}
