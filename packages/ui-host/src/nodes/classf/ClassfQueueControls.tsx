import { Clock3, FolderCheck, FolderTree, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ClassfCardState } from "./types"

type ClassfQueueStage = "already" | "wait" | "del"
type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const QUEUES = [
  { stage: "already" as const, icon: FolderCheck },
  { stage: "wait" as const, icon: Clock3 },
  { stage: "del" as const, icon: Trash2 },
]

export function ClassfQueueControls(props: { data: ClassfCardState; disabled?: boolean; t: Translate; onPatch: (patch: Partial<ClassfCardState>) => void }) {
  const groupingEnabled = QUEUES.some(({ stage }) => isGroupingEnabled(props.data, stage) && isQueueEnabled(props.data, stage))
  return <div aria-label={props.t("queues.title", "分类队列")} className="grid gap-1.5">
    <div className="grid grid-cols-2 gap-1.5">
      {QUEUES.flatMap(({ stage, icon: Icon }) => {
        const enabled = isQueueEnabled(props.data, stage)
        const grouped = isGroupingEnabled(props.data, stage)
        const label = props.t(`queues.${stage}`, stage)
        return [
          <QueueSwitch key={`${stage}-enabled`} checked={enabled} disabled={props.disabled} icon={Icon} label={props.t("queues.enable", "启用 {{stage}}", { stage: label })} onCheckedChange={(checked) => props.onPatch({ [enabledField(stage)]: checked })} />,
          <QueueSwitch key={`${stage}-group`} checked={grouped} disabled={props.disabled || !enabled} icon={FolderTree} label={props.t("queues.group", "{{stage}} 画师分组", { stage: label })} onCheckedChange={(checked) => props.onPatch({ [groupingField(stage)]: checked })} />,
        ]
      })}
    </div>
    {groupingEnabled ? <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5">
      <Label htmlFor="classf-samea-group-min" className="text-xs text-muted-foreground">{props.t("fields.sameaGroupMin", "画师最少文件数")}</Label>
      <Input id="classf-samea-group-min" aria-label="classf samea group minimum" type="number" min={1} max={100} className="h-7 w-20 text-xs" disabled={props.disabled} value={props.data.sameaGroupMinOccurrences ?? 1} onChange={(event) => props.onPatch({ sameaGroupMinOccurrences: Math.max(1, Number(event.currentTarget.value) || 1) })} />
    </div> : null}
  </div>
}

function QueueSwitch(props: { checked: boolean; disabled?: boolean; icon: LucideIcon; label: string; onCheckedChange: (checked: boolean) => void }) {
  const Icon = props.icon
  return <label className="flex min-w-0 items-center justify-between gap-1.5 rounded-md border bg-card px-2 py-1.5">
    <span className="flex min-w-0 items-center gap-1.5"><Icon className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-xs font-medium">{props.label}</span></span>
    <Switch checked={props.checked} disabled={props.disabled} size="sm" onCheckedChange={props.onCheckedChange} />
  </label>
}

function enabledField(stage: ClassfQueueStage): "alreadyEnabled" | "waitEnabled" | "delEnabled" { return `${stage}Enabled` as "alreadyEnabled" | "waitEnabled" | "delEnabled" }
function groupingField(stage: ClassfQueueStage): "sameaGroupAlreadyEnabled" | "sameaGroupWaitEnabled" | "sameaGroupDelEnabled" { return `sameaGroup${stage[0]!.toUpperCase()}${stage.slice(1)}Enabled` as "sameaGroupAlreadyEnabled" | "sameaGroupWaitEnabled" | "sameaGroupDelEnabled" }

function isQueueEnabled(data: ClassfCardState, stage: ClassfQueueStage): boolean {
  const enabled = data[enabledField(stage)]
  if (enabled !== undefined) return enabled
  if (data.classifyMode === "only") return stage !== "wait"
  if (data.classifyMode === "del") return stage === "del"
  return true
}

function isGroupingEnabled(data: ClassfCardState, stage: ClassfQueueStage): boolean {
  const enabled = data[groupingField(stage)]
  if (enabled !== undefined) return enabled
  return stage !== "del" && (data.sameaGroupEnabled ?? false)
}
