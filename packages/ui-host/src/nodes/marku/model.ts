// Pure card model helpers shared by the Normal and Workflow views. Keep this
// module free of React so the logic stays testable without a renderer.
import type { MarkuAction, MarkuInput } from "@xiranite/node-marku/core"
import type { MarkuCardState, MarkuPhase, MarkuStatusMeta } from "./types"

export function buildInput(action: MarkuAction, data: MarkuCardState): MarkuInput {
  const hasText = Boolean(data.inputText?.trim())
  return {
    action,
    module: data.module ?? "markt",
    paths: hasText ? [] : splitPaths(data.pathText),
    inputText: hasText ? data.inputText : "",
    stepConfig: parseConfig(data.configText),
    recursive: data.recursive ?? false,
    dryRun: data.dryRun ?? true,
    enableUndo: data.enableUndo ?? true,
    historyPath: data.historyPath,
    undoId: data.result?.undoId,
    workflow: action === "workflow" ? data.workflowDraft ?? undefined : undefined,
  }
}

export function statusFromState(data: MarkuCardState, running: boolean): MarkuStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "Marku 正在处理当前任务。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || (data.result?.errors.length ?? 0) > 0) {
    return {
      label: "失败",
      description: data.progressText || data.result?.errors[0] || "上次任务失败，请查看错误和日志。",
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: "完成",
      description: data.progressText || "上次任务已完成。",
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  return {
    label: "就绪",
    description: "粘贴 Markdown 文本或路径后运行模块。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

export function phaseFromState(data: MarkuCardState, running: boolean): MarkuPhase {
  if (running) return "running"
  return data.phase ?? "idle"
}

export function actionLabel(action: MarkuAction): string {
  if (action === "run") return "处理"
  if (action === "text") return "文本处理"
  if (action === "undo") return "撤销"
  if (action === "workflow") return "工作流执行"
  return "读取历史"
}

export function splitPaths(text?: string): string[] {
  if (!text) return []
  const matches = [...text.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)]
  return [...new Set(matches.map((match) => (match[1] ?? match[2] ?? match[3] ?? "").trim()).filter(Boolean))]
}

export function parseConfig(text?: string): Record<string, unknown> {
  if (!text?.trim()) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
