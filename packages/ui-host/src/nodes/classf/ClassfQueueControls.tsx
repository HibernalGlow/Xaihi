import { Clock3, FolderCheck, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { ClassfCardState } from "./types"

type ClassfQueueStage = "already" | "wait" | "del"
type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const QUEUES = [
  { stage: "already" as const, icon: FolderCheck, dot: "bg-[var(--md3e-primary,var(--primary))]" },
  { stage: "wait" as const, icon: Clock3, dot: "bg-[var(--md3e-secondary,var(--secondary))]" },
  { stage: "del" as const, icon: Trash2, dot: "bg-destructive" },
]

export function ClassfQueueControls(props: { data: ClassfCardState; disabled?: boolean; t: Translate; onPatch: (patch: Partial<ClassfCardState>) => void }) {
  const groupingEnabled = QUEUES.some(({ stage }) => isGroupingEnabled(props.data, stage) && isQueueEnabled(props.data, stage))
  return <div aria-label={props.t("queues.title", "分类队列")} className="flex flex-col gap-2">
    <div className="flex flex-col">
      {QUEUES.map(({ stage, icon: Icon, dot }, index) => {
        const enabled = isQueueEnabled(props.data, stage)
        const grouped = isGroupingEnabled(props.data, stage)
        const label = props.t(`queues.${stage}`, stage)
        return (
          <div
            key={stage}
            className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 py-2", index === 0 ? "pt-0" : "border-t border-[var(--md3e-surface-lowest,var(--border))]", index === QUEUES.length - 1 && "pb-0")}
          >
            <span className="flex min-w-[92px] flex-1 items-center gap-2">
              <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
            </span>
            <SmallSwitch
              checked={enabled}
              disabled={props.disabled === true}
              label={props.t("queues.enable", "启用 {{stage}}", { stage: label })}
              text="启用"
              onCheckedChange={(checked) => props.onPatch({ [enabledField(stage)]: checked })}
            />
            <SmallSwitch
              checked={grouped}
              disabled={props.disabled === true || !enabled}
              label={props.t("queues.group", "{{stage}} 画师分组", { stage: label })}
              text="分组"
              onCheckedChange={(checked) => props.onPatch({ [groupingField(stage)]: checked })}
            />
          </div>
        )
      })}
    </div>
    {groupingEnabled ? <div className="flex min-w-0 items-center justify-between gap-2 rounded-[12px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2.5 py-1.5">
      <Label htmlFor="classf-samea-group-min" className="truncate text-[11px] font-medium text-muted-foreground">{props.t("fields.sameaGroupMin", "画师最少文件数")}</Label>
      <Input id="classf-samea-group-min" aria-label="classf samea group minimum" type="number" min={1} max={100} className="h-7 w-16 rounded-[8px] border-0 bg-[var(--md3e-surface-high,var(--card))] text-xs" disabled={props.disabled} value={props.data.sameaGroupMinOccurrences ?? 2} onChange={(event) => props.onPatch({ sameaGroupMinOccurrences: Math.max(1, Number(event.currentTarget.value) || 1) })} />
    </div> : null}
  </div>
}

function SmallSwitch(props: { checked: boolean; disabled?: boolean; label: string; text: string; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{props.text}</span>
      <Switch
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        size="sm"
        onCheckedChange={props.onCheckedChange}
      />
    </label>
  )
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
  return stage !== "del" && (data.sameaGroupEnabled ?? true)
}
