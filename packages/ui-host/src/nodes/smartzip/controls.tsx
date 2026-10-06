import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { Archive, ArrowDown, ArrowUp, Clipboard, DatabaseZap, Eye, EyeOff, Info, KeyRound, Plus, Settings2, Trash2 } from "lucide-react"
import type { SmartZipAction } from "@xiranite/node-smartzip/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { PathInput, PathTextarea } from "@/components/ui/path-input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { ACTIONS, actionI18nKey } from "./constants"
import type { SmartZipCardState, SmartZipStatusMeta } from "./types"

export function ActionIconButton(props: {
  active?: boolean
  destructive?: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={props.label}
          disabled={props.disabled}
          size="icon-sm"
          variant={props.destructive ? "destructive" : props.active ? "secondary" : "outline"}
          onClick={props.onClick}
        >
          <Icon />
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

export function ActionPicker(props: {
  action: SmartZipAction
  disabled?: boolean
  triggerClassName?: string
  onActionChange: (action: SmartZipAction) => void
}) {
  const { t } = useNodeI18n("smartzip")
  return (
    <ToggleGroup
      aria-label="smartzip action"
      className={cn("grid w-full grid-cols-3", props.triggerClassName)}
      disabled={props.disabled}
      size="sm"
      type="single"
      value={props.action}
      variant="outline"
      onValueChange={(value) => {
        if (value) props.onActionChange(value as SmartZipAction)
      }}
    >
      {ACTIONS.map((item) => (
        <ToggleGroupItem key={item.value} aria-label={t(`actions.${actionI18nKey(item.value)}.label`, item.label)} className="min-w-0" value={item.value}>
          <item.icon data-icon="inline-start" />
          <span className="truncate">{t(`actions.${actionI18nKey(item.value)}.shortLabel`, item.shortLabel)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function PathsInput(props: {
  compact?: boolean
  data: SmartZipCardState
  disabled?: boolean
  onPaste: () => void
  onPatch: (patch: Partial<SmartZipCardState>) => void
}) {
  const { t } = useNodeI18n("smartzip")
  const archivesOrDirs = t("fields.archivesOrDirs", "归档或目录")
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      {!props.compact && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="smartzip-paths" className="flex items-center gap-1.5">
            <Archive className="size-3.5 text-muted-foreground" />
            {archivesOrDirs}
          </Label>
          <InfoHint label={archivesOrDirs} description={t("hints.pathsDescription", "每行一条路径，支持 .zip .7z .rar .tar 等。")} />
        </div>
      )}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        {props.compact ? (
          <PathInput
            id="smartzip-paths"
            aria-label={`smartzip ${archivesOrDirs}`}
            disabled={props.disabled}
            className="font-mono text-xs"
            placeholder={"D:/archives/a.zip"}
            value={props.data.pathsText ?? ""}
            dropMode="append"
            onValueChange={(pathsText) => props.onPatch({ pathsText })}
          />
        ) : (
          <PathTextarea
            id="smartzip-paths"
            aria-label={`smartzip ${archivesOrDirs}`}
            disabled={props.disabled}
            className="min-h-[80px] resize-y font-mono text-xs"
            placeholder={"D:/archives/a.zip\nD:/archives/b.cbz"}
            value={props.data.pathsText ?? ""}
            onValueChange={(pathsText) => props.onPatch({ pathsText })}
          />
        )}
        <ActionIconButton disabled={props.disabled} icon={Clipboard} label={t("actions.pastePaths", "粘贴路径")} onClick={props.onPaste} />
      </div>
    </div>
  )
}

export function PathFields(props: {
  data: SmartZipCardState
  disabled?: boolean
  onPatch: (patch: Partial<SmartZipCardState>) => void
}) {
  const { t } = useNodeI18n("smartzip")
  return (
    <div className="grid gap-2 @3xl/smartzip:grid-cols-2">
      <PathInput
        aria-label="smartzip ini path"
        disabled={props.disabled}
        placeholder={t("placeholders.iniPath", "SmartZip.ini 配置文件")}
        value={props.data.iniPath ?? ""}
        extensions={[".ini"]}
        onValueChange={(iniPath) => props.onPatch({ iniPath })}
      />
      <PathInput
        aria-label="smartzip run log JSONL"
        disabled={props.disabled}
        className="@3xl/smartzip:col-span-2"
        placeholder={t("placeholders.databasePath", ".xiranite/smartzip-runs.jsonl")}
        value={props.data.databasePath ?? ""}
        extensions={[".jsonl"]}
        onValueChange={(databasePath) => props.onPatch({ databasePath })}
      />
    </div>
  )
}

export function RuntimeOptions(props: {
  data: SmartZipCardState
  disabled?: boolean
  onPatch: (patch: Partial<SmartZipCardState>) => void
}) {
  const { t } = useNodeI18n("smartzip")
  return (
    <div className="grid gap-2 @3xl/smartzip:grid-cols-2">
      <div className="grid gap-1.5 rounded-md border bg-background/60 p-2 @3xl/smartzip:col-span-2">
        <Label htmlFor="smartzip-code-page">{t("fields.codePage", "旧 ZIP 文件名编码")}</Label>
        <Select disabled={props.disabled} value={String(props.data.codePage ?? 0)} onValueChange={(value) => props.onPatch({ codePage: Number(value) })}>
          <SelectTrigger id="smartzip-code-page" aria-label="smartzip archive filename code page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">自动检测 · 先预检再选择</SelectItem>
            <SelectItem value="936">简体中文 · GBK / CP936</SelectItem>
            <SelectItem value="950">繁體中文 · Big5 / CP950</SelectItem>
            <SelectItem value="932">日本語 · Shift_JIS / CP932</SelectItem>
            <SelectItem value="949">한국어 · EUC-KR / CP949</SelectItem>
            <SelectItem value="65001">Unicode · UTF-8</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("hints.codePage", "自动模式会预检原始文件名字节并推荐代码页；也可以根据候选预览手动覆盖。")}</p>
      </div>
      <PasswordManager {...props} />
      <SwitchRow
        checked={props.data.dryRun ?? true}
        disabled={props.disabled}
        icon={Eye}
        label={t("switches.dryRun", "预演")}
        description={t("switches.dryRunDesc", "只生成 TypeScript 工作流计划，不修改归档或文件。")}
        onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
      />
      <SwitchRow
        checked={props.data.recordRun ?? false}
        disabled={props.disabled}
        icon={DatabaseZap}
        label={t("switches.recordRun", "记录运行")}
        description={t("switches.recordRunDesc", "把每次运行的命令和结果写入 JSONL。")}
        onCheckedChange={(recordRun) => props.onPatch({ recordRun })}
      />
    </div>
  )
}

export function PasswordManager(props: {
  data: SmartZipCardState
  disabled?: boolean
  onPatch: (patch: Partial<SmartZipCardState>) => void
}) {
  const { t } = useNodeI18n("smartzip")
  const [revealed, setRevealed] = useState(false)
  const passwords = props.data.passwords ?? []
  const update = (index: number, value: string) => {
    const next = [...passwords]
    next[index] = value
    props.onPatch({ passwords: next })
  }
  const remove = (index: number) => props.onPatch({ passwords: passwords.filter((_value, itemIndex) => itemIndex !== index) })
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= passwords.length) return
    const next = [...passwords]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    props.onPatch({ passwords: next })
  }
  return (
    <div className="grid gap-2 rounded-md border bg-background/60 p-2 @3xl/smartzip:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5"><KeyRound className="size-3.5 text-muted-foreground" />{t("passwords.title", "密码列表")}</Label>
        <div className="flex items-center gap-1">
          <Button aria-label={revealed ? t("passwords.hide", "隐藏密码") : t("passwords.show", "显示密码")} disabled={!passwords.length} size="icon-sm" type="button" variant="ghost" onClick={() => setRevealed((value) => !value)}>
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
          <Button aria-label={t("passwords.add", "添加密码")} disabled={props.disabled} size="icon-sm" type="button" variant="outline" onClick={() => props.onPatch({ passwords: [...passwords, ""] })}>
            <Plus />
          </Button>
        </div>
      </div>
      {passwords.length ? passwords.map((password, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5">
          <Input
            aria-label={t("passwords.item", "归档密码 {{index}}", { index: index + 1 })}
            autoComplete="off"
            disabled={props.disabled}
            type={revealed ? "text" : "password"}
            value={password}
            onChange={(event) => update(index, event.currentTarget.value)}
          />
          <Button aria-label={t("passwords.moveUp", "上移密码 {{index}}", { index: index + 1 })} disabled={props.disabled || index === 0} size="icon-sm" type="button" variant="ghost" onClick={() => move(index, -1)}>
            <ArrowUp />
          </Button>
          <Button aria-label={t("passwords.moveDown", "下移密码 {{index}}", { index: index + 1 })} disabled={props.disabled || index === passwords.length - 1} size="icon-sm" type="button" variant="ghost" onClick={() => move(index, 1)}>
            <ArrowDown />
          </Button>
          <Button aria-label={t("passwords.remove", "删除密码 {{index}}", { index: index + 1 })} disabled={props.disabled} size="icon-sm" type="button" variant="ghost" onClick={() => remove(index)}>
            <Trash2 />
          </Button>
        </div>
      )) : <p className="text-xs text-muted-foreground">{t("passwords.empty", "暂无额外密码；仍会读取 SmartZip.ini 的 [password]。")}</p>}
      <p className="text-[11px] text-muted-foreground">{t("passwords.hint", "按顺序尝试。新增、修改、删除和排序会自动保存；密码不会写入日志或结果。")}</p>
    </div>
  )
}

export function OptionsPopover(props: {
  data: SmartZipCardState
  disabled?: boolean
  onPatch: (patch: Partial<SmartZipCardState>) => void
}) {
  const { t } = useNodeI18n("smartzip")
  const optionsLabel = t("options.title", "运行选项")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={`smartzip ${optionsLabel}`} disabled={props.disabled} size="icon-sm" variant="outline">
              <Settings2 />
              <span className="sr-only">{optionsLabel}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{optionsLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,460px)]">
        <div className="mb-3">
          <div className="text-sm font-semibold">{optionsLabel}</div>
          <p className="text-xs text-muted-foreground">{t("options.description", "SmartZip INI、文件名代码页和运行开关集中在这里；7-Zip 自动检测。")}</p>
        </div>
        <div className="grid gap-3">
          <PathFields {...props} />
          <RuntimeOptions {...props} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ConfigDefaultsPopover(props: {
  configDirty: boolean
  configFilePath?: string
  defaults?: Partial<SmartZipCardState>
  disabled?: boolean
  onOpenConfigFile?: () => Promise<void> | void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  const { t } = useNodeI18n("smartzip")
  const defaultsLabel = t("defaults.title", "默认配置")
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={`smartzip ${defaultsLabel}`} disabled={props.disabled} size="icon-sm" variant={props.configDirty ? "secondary" : "outline"}>
              <DatabaseZap />
              <span className="sr-only">{defaultsLabel}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{defaultsLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">{defaultsLabel}</div>
          <p className="text-xs text-muted-foreground">{t("defaults.description", "保存 SmartZip INI、文件名代码页和运行记录设置。")}</p>
        </div>
        <div className="grid gap-2">
          <Button disabled={props.disabled} size="sm" onClick={props.onSaveDefault}>{t("defaults.save", "保存为默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onRestoreDefault}>{t("defaults.restore", "恢复默认")}</Button>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onResetOverride}>{t("defaults.clear", "清除覆盖")}</Button>
          <Separator />
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!props.configFilePath} size="sm" variant="ghost">{t("defaults.view", "查看配置")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t("defaults.previewTitle", "SmartZip 配置")}</DialogTitle>
                <DialogDescription>{t("defaults.previewDescription", "当前 nodes.smartzip 默认值和配置文件位置。")}</DialogDescription>
              </DialogHeader>
              <ConfigPreview config={props.defaults} path={props.configFilePath} />
            </DialogContent>
          </Dialog>
          <Button disabled={!props.onOpenConfigFile} size="sm" variant="ghost" onClick={() => void props.onOpenConfigFile?.()}>{t("defaults.openFile", "打开文件")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StatusStrip(props: {
  compact?: boolean
  progress: number
  status: SmartZipStatusMeta
  text?: string
}) {
  return (
    <div className={cn("rounded-md border bg-background/70 p-2", props.compact && "p-1.5")}>
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="truncate text-xs font-medium">{props.text || props.status.description}</div>
      </div>
      <Progress value={props.progress} className={cn("h-1.5", props.status.tone === "error" && "bg-destructive/20")} />
    </div>
  )
}

export function SwitchRow(props: {
  checked: boolean
  description?: string
  disabled?: boolean
  icon?: LucideIcon
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  const Icon = props.icon
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-background/60 p-2">
      <label className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-xs font-medium">{props.label}</span>
        </span>
        <Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
      </label>
      {props.description && <InfoHint label={props.label} description={props.description} />}
    </div>
  )
}

function ConfigPreview(props: {
  config?: Partial<SmartZipCardState>
  path?: string
}) {
  const { t } = useNodeI18n("smartzip")
  const content = props.config === undefined
    ? t("defaults.noConfig", "# nodes.smartzip 暂无默认配置\n")
    : JSON.stringify(props.config, null, 2)
  return (
    <div className="grid gap-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{t("defaults.configFile", "配置文件")}</div>
        <div className="mt-1 break-all font-mono text-xs">{props.path ?? t("defaults.notConnected", "未连接本地配置服务")}</div>
      </div>
      <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5">
        {content}
      </pre>
    </div>
  )
}

function InfoHint({ description, label }: { description: string; label: string }) {
  const { t } = useNodeI18n("smartzip")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={t("labels.hintSuffix", "{{label}}说明", { label })}
          className="inline-grid size-5 shrink-0 cursor-help place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          role="img"
          tabIndex={0}
        >
          <Info className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  )
}
