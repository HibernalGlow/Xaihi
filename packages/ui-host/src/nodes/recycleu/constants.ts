import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { RecycleuCardState, RecycleuStatusMeta } from "./types"

export const INTERVAL_PRESETS = [5, 10, 30, 60] as const

type NodeT = ReturnType<typeof useNodeI18n>["t"]

export function statusFromState(data: RecycleuCardState, running: boolean, t: NodeT): RecycleuStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: t("status.running", "运行中"),
      detail: data.progressText || t("status.runningDescription", "正在等待下一次清理。"),
      tone: "running",
      badgeVariant: "default",
    }
  }
  if (data.phase === "cancelled") {
    return {
      label: t("status.cancelled", "已取消"),
      detail: data.progressText || t("status.cancelledDescription", "自动清理已停止。"),
      tone: "idle",
      badgeVariant: "outline",
    }
  }
  if (data.phase === "error") {
    return {
      label: t("status.failed", "失败"),
      detail: data.progressText || t("status.failedDescription", "最近一次操作失败。"),
      tone: "error",
      badgeVariant: "destructive",
    }
  }
  if (data.phase === "completed") {
    return {
      label: t("status.completed", "完成"),
      detail: data.progressText || t("status.completedDescription", "最近一次操作已完成。"),
      tone: "success",
      badgeVariant: "secondary",
    }
  }
  return {
    label: t("status.ready", "就绪"),
    detail: data.progressText || t("status.readyDescription", "等待启动清理任务。"),
    tone: "idle",
    badgeVariant: "outline",
  }
}
