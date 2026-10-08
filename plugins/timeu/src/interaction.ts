import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { TimeuAction, TimeuInput, TimeuResult } from "./core.ts"

export type TimeuInteractionValues = InteractionValues & { action: TimeuAction; listText: string; recordPath: string; recursive: boolean; includeDirectories: boolean; dryRun: boolean }
export function createTimeuInteractionSchema(defaults: Partial<TimeuInteractionValues> = {}, language: TerminalLanguage = "zh"): TerminalInteractionSchema<TimeuInput, TimeuResult> {
  const zh = language === "zh"; const initialValues: TimeuInteractionValues = { action: "scan", listText: "", recordPath: "", recursive: true, includeDirectories: false, dryRun: true, ...defaults }
  return { id: "timeu", title: "TimeU", description: zh ? "备份、检查或恢复文件时间戳。" : "Back up, inspect, or restore file timestamps.", initialValues,
    fields: [
      { id: "action", label: zh ? "操作" : "Action", kind: "select", options: [{ value: "scan", label: zh ? "检查" : "Scan" }, { value: "backup", label: zh ? "备份时间戳" : "Back up" }, { value: "restore", label: zh ? "恢复时间戳" : "Restore" }] },
      { id: "listText", label: zh ? "路径队列" : "Path queue", placeholder: zh ? "每行一个文件或目录" : "One file or directory per line", kind: "path-list", lines: 7, validate: (value) => String(value).trim() ? null : zh ? "至少输入一个路径。" : "Enter at least one path." },
      { id: "recordPath", label: zh ? "时间记录文件" : "Timestamp record file", placeholder: "timeu-timestamps.json", kind: "text" },
      { id: "recursive", label: zh ? "递归目录" : "Recurse directories", kind: "boolean" },
      { id: "includeDirectories", label: zh ? "包含目录自身" : "Include directories", kind: "boolean" },
      { id: "dryRun", label: zh ? "预演模式" : "Dry-run", kind: "boolean", visibleWhen: (values) => values.action !== "scan" },
    ],
    toInput: (values) => ({ action: values.action as TimeuAction, listText: String(values.listText ?? ""), recordPath: String(values.recordPath ?? "").trim() || undefined, recursive: values.recursive !== false, includeDirectories: values.includeDirectories === true, dryRun: values.dryRun !== false }),
    validate: (_values, input) => input.listText?.trim() ? null : zh ? "至少输入一个路径。" : "Enter at least one path.",
    preview: (input) => [`${zh ? "操作" : "Action"}: ${input.action}`, `${zh ? "路径" : "Paths"}: ${String(input.listText).split(/\r?\n/).filter(Boolean).length}`, input.recordPath ? `${zh ? "记录" : "Record"}: ${input.recordPath}` : "", input.action !== "scan" ? (input.dryRun ? (zh ? "预演：不写入文件或修改时间。" : "Dry-run: no files will be changed.") : (zh ? "真实执行：会写入记录或修改 atime/mtime。" : "Live run: records or atime/mtime will change.")) : ""].filter(Boolean),
    isDangerous: (input) => input.action !== "scan" && !input.dryRun,
    result: (result) => ({ success: result.success, message: result.message, lines: result.data?.plan.slice(0, 12).map((item) => `${item.status === "success" ? "✓" : item.status === "error" ? "!" : item.status === "skipped" ? "–" : "·"} ${item.path}`) ?? [], table: result.data ? { columns: [{ id: "path", label: zh ? "路径" : "Path", width: 44 }, { id: "operation", label: zh ? "操作" : "Action", width: 10 }, { id: "status", label: zh ? "状态" : "Status", width: 10 }], rows: result.data.plan.map((item) => ({ path: item.path, operation: item.operation, status: item.status })) } : undefined }),
  }
}
