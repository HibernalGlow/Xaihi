import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import {
  Archive,
  Clock3,
  DatabaseZap,
  Download,
  Eraser,
  ExternalLink,
  FileJson,
  FileUp,
  GitPullRequestArrow,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react"
import type {
  NodeConfigCapability,
  NodeConfigExport,
  NodeConfigHistoryRepositoryStatus,
  NodeConfigVersion,
  NodeConfigVersionDetail,
} from "@xiranite/contract"
// Node configuration reaches the backend only through the node UI seam; `@/backend` is Xiranite's own shell.
import { nodeConfigApi } from "./api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createLogger } from "@/lib/logger"
import { cn } from "@/lib/utils"
import { useNodeRuntimeId } from "./NodeRuntimeContext"
import { useNodeI18n } from "./useNodeI18n"

const LazyNodeConfigHistoryPanel = lazy(() => import("./NodeConfigHistoryPanel"))
const LazyNodeConfigSourceView = lazy(() => import("./NodeConfigSourceView"))
const logger = createLogger("node.config-popover")

type NodeT = ReturnType<typeof useNodeI18n>["t"]
type BusyOperation = "backup" | "export" | "import" | "open" | "preset" | "reload" | "restore" | "save" | "sync"

export interface NodeConfigHistoryAdapter {
  list: (options?: { limit?: number }) => Promise<{ versions: NodeConfigVersion[] }>
  inspect: (revision: string) => Promise<NodeConfigVersionDetail>
  restore: (revision: string) => Promise<unknown>
}

export interface NodeConfigTransferAdapter {
  export: (format: "json" | "toml") => Promise<NodeConfigExport>
  import: (content: string, format?: "auto" | "json" | "toml") => Promise<unknown>
}

export interface NodeConfigBackupAdapter {
  status: () => Promise<NodeConfigHistoryRepositoryStatus>
  create: (label?: string) => Promise<{ version: NodeConfigVersion }>
  setRemote: (url: string | null) => Promise<NodeConfigHistoryRepositoryStatus>
  sync: (direction: "pull" | "push") => Promise<NodeConfigHistoryRepositoryStatus>
}

export interface NodeConfigCenterAdapters {
  history?: NodeConfigHistoryAdapter
  transfer?: NodeConfigTransferAdapter
  backup?: NodeConfigBackupAdapter
}

export interface NodeConfigPopoverProps {
  configPath?: string
  autoRestoreKey?: string
  defaults?: Record<string, unknown>
  fallbackDefaults?: Record<string, unknown>
  tomlSource?: string
  dirty: boolean
  triggerLabel?: string
  disabled?: boolean
  loading?: boolean
  t: NodeT
  onOpenFile?: () => Promise<void> | void
  onReload: () => Promise<void> | void
  onRestore: () => Promise<void> | void
  onSave: () => Promise<void> | void
  onClearOverride?: () => Promise<void> | void
  history?: NodeConfigHistoryAdapter
  transfer?: NodeConfigTransferAdapter
  backup?: NodeConfigBackupAdapter
  presentation?: {
    current?: ComponentType<{ config: Record<string, unknown> | undefined; tomlSource?: string }>
  }
  onOpenChange?: (open: boolean) => Promise<void> | void
  showCurrentActions?: boolean
  preset?: {
    value?: string
    options: Array<{ value: string; label: string; description?: string; editable?: boolean; values?: Record<string, unknown> }>
    onValueChange: (value: string) => Promise<void> | void
    onCreate?: (name: string) => Promise<void> | void
    onDelete?: (value: string) => Promise<void> | void
    onOverwrite?: (value: string) => Promise<void> | void
    onRename?: (value: string, name: string) => Promise<void> | void
    onExport?: () => Promise<void> | void
    onImport?: (serialized: string) => Promise<void> | void
  }
}

export interface NodeConfigButtonProps {
  nodeKey: string
  configDirty: boolean
  configFilePath?: string
  defaults?: Record<string, unknown>
  uiDefaults?: Record<string, unknown>
  disabled?: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => Promise<void> | void
  onRestoreDefault: () => Promise<void> | void
  onSaveDefault: () => Promise<void> | void
  presentation?: NodeConfigPopoverProps["presentation"]
}

/** Compatibility entry point used by every app-owned node. */
export function NodeConfigButton(props: NodeConfigButtonProps) {
  const { t } = useNodeI18n(props.nodeKey)
  const fallbackDefaults = props.defaults || props.uiDefaults
    ? { ...(props.defaults ?? {}), ...(props.uiDefaults ?? {}) }
    : undefined
  const [persistedConfig, setPersistedConfig] = useState<Record<string, unknown>>()
  const [tomlSource, setTomlSource] = useState<string>()
  const [loadingConfig, setLoadingConfig] = useState(false)
  const loadPersistedConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const [result, exported] = await Promise.all([
        nodeConfigApi.get<Record<string, unknown>>(props.nodeKey),
        nodeConfigApi.exportConfig(props.nodeKey, "toml"),
      ])
      setPersistedConfig(result.config)
      setTomlSource(exported.content)
    } finally {
      setLoadingConfig(false)
    }
  }, [props.nodeKey])
  const reload = useCallback(async () => {
    await props.onResetOverride()
    await loadPersistedConfig()
  }, [loadPersistedConfig, props.onResetOverride])
  const adapters = useMemo(() => createBackendAdapters(props.nodeKey, reload), [props.nodeKey, reload])

  return <NodeConfigPopover
    configPath={props.configFilePath}
    autoRestoreKey={props.nodeKey}
    defaults={persistedConfig}
    fallbackDefaults={fallbackDefaults}
    tomlSource={tomlSource}
    dirty={props.configDirty}
    triggerLabel={`${props.nodeKey} ${t("config.trigger", "configuration")}`}
    disabled={props.disabled}
    t={t}
    onOpenFile={props.onOpenConfigFile}
    loading={loadingConfig}
    onOpenChange={(nextOpen) => { if (nextOpen) return loadPersistedConfig() }}
    onReload={reload}
    onRestore={props.onRestoreDefault}
    onSave={async () => { await props.onSaveDefault(); await loadPersistedConfig() }}
    onClearOverride={props.onResetOverride}
    history={adapters.history}
    transfer={adapters.transfer}
    backup={adapters.backup}
    presentation={props.presentation}
  />
}

/** Standalone config-center entry for surfaces such as NeoView settings cards. */
export function NodeConfigCenterButton({ nodeKey, presentation, onConfigChange }: { nodeKey: string; presentation?: NodeConfigPopoverProps["presentation"]; onConfigChange?: () => Promise<void> | void }) {
  const { t } = useNodeI18n(nodeKey)
  const [config, setConfig] = useState<Record<string, unknown>>()
  const [tomlSource, setTomlSource] = useState<string>()
  const [path, setPath] = useState<string>()
  const [loading, setLoading] = useState(false)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [result, exported] = await Promise.all([
        nodeConfigApi.get<Record<string, unknown>>(nodeKey),
        nodeConfigApi.exportConfig(nodeKey, "toml"),
      ])
      setConfig(result.config)
      setPath(result.path)
      setTomlSource(exported.content)
      await onConfigChange?.()
    } finally {
      setLoading(false)
    }
  }, [nodeKey, onConfigChange])
  const adapters = useMemo(() => createBackendAdapters(nodeKey, reload), [nodeKey, reload])

  return <NodeConfigPopover
    configPath={path}
    defaults={config}
    tomlSource={tomlSource}
    dirty={false}
    loading={loading}
    triggerLabel={`${nodeKey} ${t("config.trigger", "Configuration center")}`}
    t={t}
    onOpenChange={(nextOpen) => { if (nextOpen) return reload() }}
    onOpenFile={nodeConfigApi.openFile}
    onReload={reload}
    onRestore={reload}
    onSave={() => undefined}
    history={adapters.history}
    transfer={adapters.transfer}
    backup={adapters.backup}
    presentation={presentation}
    showCurrentActions={false}
  />
}

export function NodeConfigPopover(props: NodeConfigPopoverProps) {
  const runtimeNodeId = useNodeRuntimeId()
  const presetId = useId()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("current")
  const [busy, setBusy] = useState<BusyOperation | null>(null)
  const [presetEditor, setPresetEditor] = useState<"create" | "rename" | null>(null)
  const [presetName, setPresetName] = useState("")
  const [presetConfirmation, setPresetConfirmation] = useState<"delete" | "overwrite" | null>(null)
  const [presetImportText, setPresetImportText] = useState("")
  const [configImportText, setConfigImportText] = useState("")
  const autoRestoreNodeId = props.autoRestoreKey ?? runtimeNodeId
  const [autoRestore, setAutoRestore] = useState(false)
  const [autoRestoreLoaded, setAutoRestoreLoaded] = useState(false)
  const [autoRestoreSaving, setAutoRestoreSaving] = useState(false)
  const autoRestoredRef = useRef(false)
  const autoRestoreNodeIdRef = useRef<string | undefined>(undefined)
  const effectiveDefaults = props.defaults && Object.keys(props.defaults).length ? props.defaults : props.fallbackDefaults
  const selectedPreset = props.preset?.options.find((option) => option.value === props.preset?.value)
  const selectedPresetEditable = selectedPreset?.editable === true
  const triggerLabel = props.triggerLabel ?? props.t("config.trigger", "Configuration center")
  const disabled = Boolean(props.disabled || props.loading || busy)
  const CurrentView = props.presentation?.current
  const showCurrentActions = props.showCurrentActions !== false

  useEffect(() => {
    if (!autoRestoreNodeId) {
      setAutoRestore(false)
      setAutoRestoreLoaded(false)
      return
    }

    let cancelled = false
    if (autoRestoreNodeIdRef.current !== autoRestoreNodeId) {
      autoRestoreNodeIdRef.current = autoRestoreNodeId
      autoRestoredRef.current = false
    }
    setAutoRestoreLoaded(false)

    async function loadAutoRestorePreference() {
      try {
        const response = await nodeConfigApi.getUi<NodeConfigUiPreferences>(autoRestoreNodeId!)
        if (cancelled) return
        const persisted = resolveAutoRestorePreference(response.config)
        const legacy = persisted === undefined
          ? readLegacyAutoRestorePreference(autoRestoreNodeId!, props.configPath)
          : undefined
        setAutoRestore(persisted ?? legacy ?? false)

        if (persisted === undefined && legacy !== undefined) {
          try {
            await nodeConfigApi.saveUi(autoRestoreNodeId!, { restoreOnStartup: legacy })
            removeLegacyAutoRestorePreferences(autoRestoreNodeId!, props.configPath)
          } catch (error) {
            logger.warn("Failed to migrate restore-on-startup preference", { nodeId: autoRestoreNodeId }, error)
          }
        }
      } catch (error) {
        if (cancelled) return
        setAutoRestore(readLegacyAutoRestorePreference(autoRestoreNodeId!, props.configPath) ?? false)
        logger.warn("Failed to load restore-on-startup preference", { nodeId: autoRestoreNodeId }, error)
      } finally {
        if (!cancelled) setAutoRestoreLoaded(true)
      }
    }

    void loadAutoRestorePreference()
    return () => {
      cancelled = true
    }
  }, [autoRestoreNodeId, props.configPath])

  useEffect(() => {
    if (!autoRestoreLoaded || autoRestoreSaving || !autoRestore || !effectiveDefaults || autoRestoredRef.current) return
    autoRestoredRef.current = true
    void props.onRestore()
  }, [autoRestore, autoRestoreLoaded, autoRestoreSaving, effectiveDefaults, props.onRestore])

  async function setAutoRestoreDefaults(enabled: boolean) {
    if (!autoRestoreNodeId || autoRestoreSaving) return
    const previous = autoRestore
    setAutoRestore(enabled)
    setAutoRestoreSaving(true)
    try {
      await nodeConfigApi.saveUi(autoRestoreNodeId, { restoreOnStartup: enabled })
      removeLegacyAutoRestorePreferences(autoRestoreNodeId, props.configPath)
    } catch (error) {
      setAutoRestore(previous)
      logger.warn("Failed to save restore-on-startup preference", { nodeId: autoRestoreNodeId }, error)
    } finally {
      setAutoRestoreSaving(false)
    }
  }

  async function perform<T>(kind: BusyOperation, action: () => Promise<T> | T): Promise<T> {
    setBusy(kind)
    try {
      return await action()
    } finally {
      setBusy(null)
    }
  }

  function beginPresetEditor(mode: "create" | "rename") {
    setPresetName(mode === "rename" ? selectedPreset?.label ?? "" : "")
    setPresetEditor(mode)
  }

  async function commitPresetEditor() {
    const name = presetName.trim()
    if (!name || !props.preset || !presetEditor) return
    if (presetEditor === "create") await perform("preset", () => props.preset?.onCreate?.(name))
    else await perform("preset", () => props.preset?.onRename?.(props.preset?.value ?? "", name))
    setPresetEditor(null)
    setPresetName("")
  }

  async function confirmPresetMutation(kind: "delete" | "overwrite") {
    if (!props.preset) return
    if (kind === "overwrite") await perform("preset", () => props.preset?.onOverwrite?.(props.preset?.value ?? ""))
    else await perform("preset", () => props.preset?.onDelete?.(props.preset?.value ?? ""))
    setPresetConfirmation(null)
  }

  async function exportConfig(format: "json" | "toml") {
    if (!props.transfer) return
    const exported = await perform("export", () => props.transfer!.export(format))
    downloadText(exported.filename, exported.content, exported.mimeType)
  }

  return (
    <ContextMenu>
      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); void props.onOpenChange?.(nextOpen) }}>
        <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <ContextMenuTrigger asChild>
              <DialogTrigger asChild>
                <Button aria-label={triggerLabel} disabled={disabled} size="icon-sm" variant={props.dirty ? "secondary" : "outline"}>
                  <DatabaseZap />
                </Button>
              </DialogTrigger>
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{triggerLabel}</TooltipContent>
        </Tooltip></TooltipProvider>
        <DialogContent className="h-[min(760px,calc(100vh-2rem))] max-w-[min(1040px,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden p-0 sm:max-w-[min(1040px,calc(100vw-2rem))]">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>{props.configPath ?? props.t("config.description", "Manage this node's settings, history, backups, and portable configuration.")}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 gap-0 px-5 pb-5">
          <div className="overflow-x-auto pb-3">
            <TabsList className="min-w-max" variant="line">
              <TabsTrigger value="current"><SlidersHorizontal />{props.t("config.tabs.current", "Current configuration")}</TabsTrigger>
              <TabsTrigger value="presets"><Settings2 />{props.t("config.tabs.presets", "Presets")}</TabsTrigger>
              <TabsTrigger value="history"><Clock3 />{props.t("config.tabs.history", "Change history")}</TabsTrigger>
              <TabsTrigger value="transfer"><FileUp />{props.t("config.tabs.transfer", "Import / export")}</TabsTrigger>
              <TabsTrigger value="backup"><Archive />{props.t("config.tabs.backup", "Backup / sync")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="current" className="min-h-0 overflow-auto">
            <div className="grid min-h-full gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section className="min-w-0 rounded-md border bg-muted/20">
                {CurrentView ? <div className="min-w-0"><div className="p-4"><CurrentView config={effectiveDefaults} tomlSource={props.tomlSource} /></div>{props.tomlSource && effectiveDefaults ? <div className="border-t"><Suspense fallback={<PanelMessage>{props.t("config.source.loading", "Loading TOML view...")}</PanelMessage>}><LazyNodeConfigSourceView config={effectiveDefaults} source={props.tomlSource} labels={sourceLabels(props.t)} /></Suspense></div> : null}</div> : props.tomlSource && effectiveDefaults ? <Suspense fallback={<PanelMessage>{props.t("config.source.loading", "Loading TOML view...")}</PanelMessage>}><LazyNodeConfigSourceView config={effectiveDefaults} source={props.tomlSource} labels={sourceLabels(props.t)} /></Suspense> : <StructuredConfigView config={effectiveDefaults} emptyLabel={props.t("config.empty", "No configuration data.")} />}
              </section>
              <aside className="flex flex-col gap-2">
                {autoRestoreNodeId ? <Field orientation="horizontal" className="items-center justify-between rounded-md border px-3 py-2"><FieldLabel className="text-xs">{props.t("config.autoRestore", "Restore on startup")}</FieldLabel><Switch checked={autoRestore} disabled={!autoRestoreLoaded || autoRestoreSaving} onCheckedChange={(enabled) => void setAutoRestoreDefaults(enabled)} /></Field> : null}
                {showCurrentActions ? <Button disabled={disabled} size="sm" onClick={() => void perform("save", props.onSave)}><Save data-icon="inline-start" />{props.t("config.save", "Save as default")}</Button> : null}
                {showCurrentActions ? <Button disabled={disabled || !effectiveDefaults} size="sm" variant="outline" onClick={() => void perform("restore", props.onRestore)}><RotateCcw data-icon="inline-start" />{props.t("config.restore", "Restore saved configuration")}</Button> : null}
                <Button disabled={disabled} size="sm" variant="outline" onClick={() => void perform("reload", props.onReload)}><RefreshCw data-icon="inline-start" />{props.t("config.reload", "Reload from TOML")}</Button>
                {showCurrentActions && props.onClearOverride ? <Button disabled={disabled} size="sm" variant="outline" onClick={() => void perform("restore", props.onClearOverride!)}><Eraser data-icon="inline-start" />{props.t("config.clear", "Clear override")}</Button> : null}
                <Separator />
                <Button disabled={disabled || !props.onOpenFile} size="sm" variant="ghost" onClick={() => void perform("open", () => props.onOpenFile?.())}><ExternalLink data-icon="inline-start" />{props.t("config.openFile", "Open TOML file")}</Button>
                {props.dirty ? <p className={cn("rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-muted-foreground")}>{props.t("config.dirty", "Current parameters differ from the saved configuration.")}</p> : null}
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="presets" className="min-h-0 overflow-auto">
            <PresetPanel
              disabled={disabled}
              preset={props.preset}
              presetId={presetId}
              selectedPreset={selectedPreset}
              selectedPresetEditable={selectedPresetEditable}
              editor={presetEditor}
              name={presetName}
              importText={presetImportText}
              t={props.t}
              onApply={(value) => void perform("preset", () => props.preset?.onValueChange(value))}
              onBeginEditor={beginPresetEditor}
              onCommitEditor={() => void commitPresetEditor()}
              onEditorChange={setPresetEditor}
              onNameChange={setPresetName}
              onImportTextChange={setPresetImportText}
              onImport={() => void perform("preset", async () => { await props.preset?.onImport?.(presetImportText); setPresetImportText("") })}
              onExport={() => void perform("preset", () => props.preset?.onExport?.())}
              onConfirm={setPresetConfirmation}
            />
          </TabsContent>

          <TabsContent value="history" className="min-h-0 overflow-hidden">
            {activeTab === "history" && props.history ? (
              <Suspense fallback={<PanelMessage>{props.t("config.history.loading", "Loading history...")}</PanelMessage>}>
                <LazyNodeConfigHistoryPanel adapter={props.history} t={props.t} />
              </Suspense>
            ) : <PanelMessage>{props.t("config.history.unavailable", "Version history is unavailable for this node.")}</PanelMessage>}
          </TabsContent>

          <TabsContent value="transfer" className="min-h-0 overflow-auto">
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-3">
                <div><h3 className="text-sm font-semibold">{props.t("config.export.title", "Export configuration")}</h3><p className="text-xs text-muted-foreground">{props.t("config.export.description", "Export only this node's section in a portable format.")}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={disabled || !props.transfer} variant="outline" onClick={() => void exportConfig("toml")}><Download />TOML</Button>
                  <Button disabled={disabled || !props.transfer} variant="outline" onClick={() => void exportConfig("json")}><FileJson />JSON</Button>
                </div>
              </section>
              <section className="space-y-3">
                <div><h3 className="text-sm font-semibold">{props.t("config.import.title", "Import configuration")}</h3><p className="text-xs text-muted-foreground">{props.t("config.import.description", "Paste TOML or JSON. Only this node's section will be updated.")}</p></div>
                <Textarea className="min-h-64 font-mono text-xs" value={configImportText} onChange={(event) => setConfigImportText(event.currentTarget.value)} placeholder="[nodes.example]" />
                <Button disabled={disabled || !props.transfer || !configImportText.trim()} onClick={() => void perform("import", async () => { await props.transfer?.import(configImportText, "auto"); setConfigImportText(""); await props.onReload() })}><Upload />{props.t("config.import.action", "Import and reload")}</Button>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="min-h-0 overflow-auto">
            {activeTab === "backup" && props.backup ? <BackupPanel adapter={props.backup} disabled={disabled} t={props.t} perform={perform} /> : <PanelMessage>{props.t("config.backup.unavailable", "Git backup is unavailable for this node.")}</PanelMessage>}
          </TabsContent>
        </Tabs>
        </DialogContent>

        <AlertDialog open={presetConfirmation !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPresetConfirmation(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{presetConfirmation === "delete" ? props.t("config.presetDeleteTitle", "Delete this preset?") : props.t("config.presetOverwriteTitle", "Overwrite this preset?")}</AlertDialogTitle>
              <AlertDialogDescription>{presetConfirmation === "delete" ? props.t("config.presetDeleteDescription", "This action cannot be undone.") : props.t("config.presetOverwriteDescription", "The preset values will be replaced by the current configuration.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={disabled}>{props.t("common:cancel", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction disabled={disabled} variant={presetConfirmation === "delete" ? "destructive" : "default"} onClick={() => { if (presetConfirmation) void confirmPresetMutation(presetConfirmation) }}>{presetConfirmation === "delete" ? props.t("config.presetDelete", "Delete preset") : props.t("config.presetOverwrite", "Overwrite preset")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Dialog>
      <ContextMenuContent aria-label={props.t("config.quickActions", "Configuration quick actions")} className="w-56">
        {showCurrentActions ? <ContextMenuItem disabled={disabled} onSelect={() => void perform("save", props.onSave)}><Save />{props.t("config.save", "Save as default")}</ContextMenuItem> : null}
        {showCurrentActions ? <ContextMenuItem disabled={disabled || !effectiveDefaults} onSelect={() => void perform("restore", props.onRestore)}><RotateCcw />{props.t("config.restore", "Restore saved configuration")}</ContextMenuItem> : null}
        {showCurrentActions && props.onClearOverride ? <ContextMenuItem disabled={disabled} onSelect={() => void perform("restore", props.onClearOverride!)}><Eraser />{props.t("config.clear", "Clear override")}</ContextMenuItem> : null}
        {showCurrentActions ? <ContextMenuSeparator /> : null}
        <ContextMenuItem disabled={disabled} onSelect={() => void perform("reload", props.onReload)}><RefreshCw />{props.t("config.reload", "Reload from TOML")}</ContextMenuItem>
        {props.onOpenFile ? <ContextMenuItem disabled={disabled} onSelect={() => void perform("open", () => props.onOpenFile?.())}><ExternalLink />{props.t("config.openFile", "Open TOML file")}</ContextMenuItem> : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface PresetPanelProps {
  disabled: boolean
  preset: NodeConfigPopoverProps["preset"]
  presetId: string
  selectedPreset?: NonNullable<NodeConfigPopoverProps["preset"]>["options"][number]
  selectedPresetEditable: boolean
  editor: "create" | "rename" | null
  name: string
  importText: string
  t: NodeT
  onApply: (value: string) => void
  onBeginEditor: (mode: "create" | "rename") => void
  onCommitEditor: () => void
  onEditorChange: (value: "create" | "rename" | null) => void
  onNameChange: (value: string) => void
  onImportTextChange: (value: string) => void
  onImport: () => void
  onExport: () => void
  onConfirm: (value: "delete" | "overwrite") => void
}

function PresetPanel(props: PresetPanelProps) {
  if (!props.preset) return <PanelMessage>{props.t("config.presets.empty", "This node does not declare presets.")}</PanelMessage>
  return <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
    <section className="space-y-3">
      <Field className="gap-1.5">
        <FieldLabel htmlFor={props.presetId}>{props.t("config.preset", "Preset")}</FieldLabel>
        <Select disabled={props.disabled} value={props.preset.value ?? ""} onValueChange={props.onApply}>
          <SelectTrigger id={props.presetId} className="w-full" size="sm"><SelectValue placeholder={props.t("config.presetPlaceholder", "Select preset")} /></SelectTrigger>
          <SelectContent><SelectGroup>{props.preset.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <FieldDescription>{props.selectedPreset?.description ?? props.t("config.presetDescription", "Apply a reusable node configuration.")}</FieldDescription>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {props.preset.onCreate ? <Button disabled={props.disabled} size="sm" variant="outline" onClick={() => props.onBeginEditor("create")}><Plus />{props.t("config.presetNew", "New")}</Button> : null}
        {props.selectedPreset ? <Button disabled={props.disabled} size="sm" variant="outline" onClick={() => props.onApply(props.selectedPreset!.value)}><RotateCcw />{props.t("config.presetApply", "Apply")}</Button> : null}
        {props.selectedPresetEditable && props.preset.onRename ? <Button disabled={props.disabled} size="sm" variant="outline" onClick={() => props.onBeginEditor("rename")}><Pencil />{props.t("config.presetRename", "Rename")}</Button> : null}
        {props.selectedPresetEditable && props.preset.onOverwrite ? <Button disabled={props.disabled} size="sm" variant="outline" onClick={() => props.onConfirm("overwrite")}><Save />{props.t("config.presetOverwrite", "Overwrite")}</Button> : null}
        {props.selectedPresetEditable && props.preset.onDelete ? <Button disabled={props.disabled} size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => props.onConfirm("delete")}><Trash2 />{props.t("config.presetDelete", "Delete")}</Button> : null}
      </div>
      {props.editor ? <div className="space-y-2 rounded-md border p-3"><FieldLabel htmlFor={`${props.presetId}-name`}>{props.t("config.presetName", "Preset name")}</FieldLabel><Input id={`${props.presetId}-name`} autoFocus value={props.name} onChange={(event) => props.onNameChange(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onCommitEditor() }} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => props.onEditorChange(null)}>{props.t("common:cancel", "Cancel")}</Button><Button disabled={!props.name.trim()} onClick={props.onCommitEditor}>{props.t("common:save", "Save")}</Button></div></div> : null}
    </section>
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{props.selectedPreset?.label ?? props.t("config.presetPreview", "Preset data")}</h3>
      <StructuredConfigView config={props.selectedPreset?.values} emptyLabel={props.t("config.empty", "No configuration data.")} />
      {(props.preset.onImport || props.preset.onExport) ? <div className="space-y-2"><Textarea className="min-h-32 font-mono text-xs" value={props.importText} onChange={(event) => props.onImportTextChange(event.currentTarget.value)} placeholder='{"presets": [...]}' /><div className="flex gap-2">{props.preset.onImport ? <Button disabled={props.disabled || !props.importText.trim()} variant="outline" onClick={props.onImport}><Upload />{props.t("config.presetImport", "Import presets")}</Button> : null}{props.preset.onExport ? <Button disabled={props.disabled} variant="outline" onClick={props.onExport}><Download />{props.t("config.presetExport", "Export presets")}</Button> : null}</div></div> : null}
    </section>
  </div>
}

function BackupPanel(props: { adapter: NodeConfigBackupAdapter; disabled: boolean; t: NodeT; perform: <T>(kind: BusyOperation, action: () => Promise<T> | T) => Promise<T> }) {
  const [status, setStatus] = useState<NodeConfigHistoryRepositoryStatus | null>(null)
  const [remoteUrl, setRemoteUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void props.adapter.status().then((next) => {
      if (!active) return
      setStatus(next)
      setRemoteUrl(next.remoteUrl ?? "")
    }, (reason) => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [props.adapter])

  async function run(action: () => Promise<NodeConfigHistoryRepositoryStatus>) {
    setError(null)
    try {
      setStatus(await props.perform("sync", action))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="space-y-3">
      <div><h3 className="text-sm font-semibold">{props.t("config.backup.title", "Local Git backup")}</h3><p className="text-xs text-muted-foreground">{props.t("config.backup.description", "Snapshots are incremental and stored outside the live TOML file.")}</p></div>
      <div className="rounded-md border bg-muted/20 p-3 font-mono text-xs break-all">{status?.path ?? props.t("config.backup.loading", "Loading repository...")}</div>
      <Button disabled={props.disabled || !status} onClick={() => void props.perform("backup", () => props.adapter.create())}><Archive />{props.t("config.backup.create", "Create backup")}</Button>
    </section>
    <section className="space-y-3">
      <div><h3 className="text-sm font-semibold">{props.t("config.sync.title", "Remote synchronization")}</h3><p className="text-xs text-muted-foreground">{props.t("config.sync.description", "Pull updates the history repository only; it never overwrites the active configuration.")}</p></div>
      <Field><FieldLabel htmlFor="config-history-remote">{props.t("config.sync.remote", "Git remote")}</FieldLabel><Input id="config-history-remote" value={remoteUrl} onChange={(event) => setRemoteUrl(event.currentTarget.value)} placeholder="https://..." /></Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={props.disabled || !status} variant="outline" onClick={() => void run(() => props.adapter.setRemote(remoteUrl.trim() || null))}><Save />{props.t("config.sync.saveRemote", "Save remote")}</Button>
        <Button disabled={props.disabled || !status?.remoteUrl} variant="outline" onClick={() => void run(() => props.adapter.sync("pull"))}><GitPullRequestArrow />{props.t("config.sync.pull", "Pull history")}</Button>
        <Button disabled={props.disabled || !status?.remoteUrl} variant="outline" onClick={() => void run(() => props.adapter.sync("push"))}><Upload />{props.t("config.sync.push", "Push history")}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  </div>
}

function StructuredConfigView({ config, emptyLabel }: { config: Record<string, unknown> | undefined; emptyLabel: string }) {
  if (!config) return <PanelMessage>{emptyLabel}</PanelMessage>
  const lines = JSON.stringify(config, null, 2).split("\n")
  return <ScrollArea className="h-full max-h-[540px]"><pre className="p-4 text-xs leading-5">{lines.map((line, index) => <span className="block" key={`${index}-${line}`}>{line.trim()}</span>)}</pre></ScrollArea>
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-48 place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>
}

export function createBackendAdapters(nodeId: string, onReload: () => Promise<void> | void) {
  return {
    history: {
      list: (options?: { limit?: number }) => nodeConfigApi.versions(nodeId, options),
      inspect: (revision: string) => nodeConfigApi.inspect(nodeId, revision),
      restore: async (revision: string) => {
        const result = await nodeConfigApi.restore(nodeId, revision)
        await onReload()
        return result
      },
    } satisfies NodeConfigHistoryAdapter,
    transfer: {
      export: (format: "json" | "toml") => nodeConfigApi.exportConfig(nodeId, format),
      import: (content: string, format?: "auto" | "json" | "toml") => nodeConfigApi.importConfig(nodeId, content, format),
    } satisfies NodeConfigTransferAdapter,
    backup: {
      status: nodeConfigApi.historyStatus,
      create: (label?: string) => nodeConfigApi.createBackup(nodeId, label),
      setRemote: nodeConfigApi.setHistoryRemote,
      sync: nodeConfigApi.syncHistory,
    } satisfies NodeConfigBackupAdapter,
  }
}

/** Builds the shared configuration-center features from an injected node host capability. */
export function createCapabilityAdapters<TConfig>(
  capability: NodeConfigCapability<TConfig> | undefined,
  onReload: () => Promise<void> | void,
): NodeConfigCenterAdapters {
  const history = capability?.getVersions && capability.inspectVersion && capability.restoreVersion
    ? {
        list: (options?: { limit?: number }) => capability.getVersions!(options),
        inspect: (revision: string) => capability.inspectVersion!(revision),
        restore: async (revision: string) => {
          const restored = await capability.restoreVersion!(revision)
          await onReload()
          return restored
        },
      } satisfies NodeConfigHistoryAdapter
    : undefined
  const transfer = capability?.exportConfig && capability.importConfig
    ? {
        export: (format: "json" | "toml") => capability.exportConfig!(format),
        import: (content: string, format?: "auto" | "json" | "toml") => capability.importConfig!(content, format),
      } satisfies NodeConfigTransferAdapter
    : undefined
  const backup = capability?.getHistoryRepository && capability.createBackup && capability.setHistoryRemote && capability.syncHistory
    ? {
        status: () => capability.getHistoryRepository!(),
        create: (label?: string) => capability.createBackup!(label),
        setRemote: (url: string | null) => capability.setHistoryRemote!(url),
        sync: (direction: "pull" | "push") => capability.syncHistory!(direction),
      } satisfies NodeConfigBackupAdapter
    : undefined
  return { history, transfer, backup }
}

interface NodeConfigUiPreferences {
  restoreOnStartup?: boolean
  restore_on_startup?: boolean
}

function resolveAutoRestorePreference(config: NodeConfigUiPreferences | undefined): boolean | undefined {
  if (typeof config?.restoreOnStartup === "boolean") return config.restoreOnStartup
  if (typeof config?.restore_on_startup === "boolean") return config.restore_on_startup
  return undefined
}

function legacyAutoRestoreStorageKeys(nodeId: string, configPath?: string): string[] {
  const keys = [`xiranite:auto-restore:${nodeId}`]
  if (configPath) keys.push(`xiranite:auto-restore:config:${configPath}`)
  return keys
}

function readLegacyAutoRestorePreference(nodeId: string, configPath?: string): boolean | undefined {
  try {
    for (const key of legacyAutoRestoreStorageKeys(nodeId, configPath)) {
      const value = window.localStorage.getItem(key)
      if (value === "1") return true
      if (value === "0") return false
    }
  } catch {
    return undefined
  }
  return undefined
}

function removeLegacyAutoRestorePreferences(nodeId: string, configPath?: string): void {
  try {
    for (const key of legacyAutoRestoreStorageKeys(nodeId, configPath)) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Restricted WebViews can disable browser storage after migration.
  }
}

function downloadText(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function sourceLabels(t: NodeT) {
  return {
    sections: t("config.source.sections", "Sections"),
    fields: t("config.source.fields", "Fields"),
    booleans: t("config.source.booleans", "Enabled switches"),
    collectionItems: t("config.source.items", "Collection items"),
    colors: t("config.source.colors", "Colors"),
    source: t("config.source.title", "TOML source"),
    copy: t("config.source.copy", "Copy"),
    copied: t("config.source.copied", "Copied"),
  }
}
