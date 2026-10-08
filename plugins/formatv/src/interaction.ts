import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { FormatvAction, FormatvInput, FormatvResult } from "./core.ts"

export type FormatvInteractionValues = InteractionValues & { action: FormatvAction; pathsText: string; recursive: boolean; prefixName: string; dryRun: boolean; reportPath: string }

export function createFormatvInteractionSchema(defaults: Partial<FormatvInteractionValues> = {}, language: "zh" | "en" = "zh"): TerminalInteractionSchema<FormatvInput, FormatvResult> {
  const zh = language === "zh", text = (a: string, b: string) => zh ? a : b
  const initialValues: FormatvInteractionValues = { action: "scan", pathsText: "", recursive: false, prefixName: "hb", dryRun: true, reportPath: "", ...defaults }
  return {
    id: "formatv", title: "FormatV", description: text("扫描视频后缀、规划重命名并检查重复文件。", "Scan video suffixes, plan renames and check duplicates."), initialValues,
    fields: [
      { id: "action", label: text("操作", "Action"), kind: "select", role: "action", options: [{ value: "scan", label: text("扫描", "Scan") }, { value: "add_nov", label: text("添加 .nov", "Add .nov") }, { value: "remove_nov", label: text("移除 .nov", "Remove .nov") }, { value: "check_duplicates", label: text("检查重复", "Duplicates") }] },
      { id: "pathsText", label: text("视频路径", "Video paths"), kind: "path-list", lines: 5, placeholder: text("每行一个文件夹或文件", "One folder or file per line") },
      { id: "recursive", label: text("递归扫描", "Recursive scan"), kind: "boolean" },
      { id: "prefixName", label: text("前缀名称", "Prefix name"), kind: "text" },
      { id: "reportPath", label: text("重复报告路径", "Duplicate report path"), kind: "text" },
      { id: "dryRun", label: text("预演", "Dry-run"), kind: "boolean" },
    ],
    toInput: (values) => ({ action: String(values.action ?? "scan") as FormatvAction, paths: String(values.pathsText ?? "").split(/[\r\n;,]+/).map((v) => v.trim()).filter(Boolean), recursive: values.recursive === true, prefixName: String(values.prefixName ?? "hb").trim() || "hb", reportPath: String(values.reportPath ?? "").trim() || undefined, dryRun: values.dryRun !== false }),
    validate: (_values, input) => input.paths?.length ? null : text("至少输入一个视频路径。", "Enter at least one video path."),
    preview: (input) => [`${text("操作", "Action")}: ${input.action ?? "scan"}`, `${text("路径", "Paths")}: ${input.paths?.length ?? 0}`, `${text("前缀", "Prefix")}: ${input.prefixName ?? "hb"}`, input.dryRun !== false ? text("预演：不会修改文件。", "Dry-run: no files will be changed.") : text("真实执行：将修改文件。", "Live: files may be renamed.")],
    isDangerous: (input) => ["add_nov", "remove_nov"].includes(input.action ?? "") && input.dryRun === false,
    dangerPrompt: (input) => ({ title: text("确认重命名", "Confirm rename"), body: text(`将执行${input.action === "add_nov" ? "添加" : "移除"} .nov 后缀。`, `Files will be renamed to ${input.action === "add_nov" ? "add" : "remove"} the .nov suffix.`), confirmLabel: text("确认执行", "Run now") }),
    result: (result) => ({ success: result.success, message: result.message, lines: result.data?.errors ?? [], table: { columns: [{ id: "sourcePath", label: text("来源", "Source"), width: 40 }, { id: "targetPath", label: text("目标", "Target"), width: 40 }, { id: "status", label: text("状态", "Status"), width: 12 }], rows: (result.data?.operations ?? []).map((item) => ({ sourcePath: item.sourcePath, targetPath: item.targetPath, status: item.status })), emptyMessage: result.message } }),
  }
}
