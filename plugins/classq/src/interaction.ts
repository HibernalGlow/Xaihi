import type { InteractionField, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { ClassqAction, ClassqExistingPolicy, ClassqInput, ClassqResult, ClassqTransferMode } from "./core.ts"

export type ClassqInteractionValues = InteractionValues & { action: ClassqAction; paths: string; keyword: string; waitKeyword: string; transferMode: ClassqTransferMode; existingPolicy: ClassqExistingPolicy; dryRun: boolean }
export const defaultClassqInteractionValues: ClassqInteractionValues = { action: "plan", paths: "", keyword: "already", waitKeyword: "wait", transferMode: "move", existingPolicy: "merge", dryRun: true }

export function createClassqInteractionSchema(defaults: Partial<ClassqInteractionValues> = {}, language: TerminalLanguage = "zh"): TerminalInteractionSchema<ClassqInput, ClassqResult> {
  const zh = language === "zh", initialValues: ClassqInteractionValues = { ...defaultClassqInteractionValues }
  for (const [key, value] of Object.entries(defaults)) if (value !== undefined) initialValues[key] = value
  const classify = (values: Readonly<InteractionValues>) => values.action === "classify"
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "工作流" : "Workflow", kind: "select", role: "action", options: [{ value: "plan", label: zh ? "⌕ 扫描计划" : "Plan" }, { value: "classify", label: zh ? "↳ 分类执行" : "Classify" }] },
    { id: "paths", label: zh ? "输入根目录" : "Root directories", description: zh ? "每行一个，递归发现关键词目录。" : "One root per line.", kind: "path-list", lines: 6 },
    { id: "keyword", label: zh ? "关键词目录" : "Keyword folder", kind: "text" },
    { id: "waitKeyword", label: zh ? "等待目录" : "Wait folder", kind: "text" },
    { id: "transferMode", label: zh ? "传输方式" : "Transfer", kind: "select", visibleWhen: classify, options: [{ value: "move", label: zh ? "移动" : "Move" }, { value: "copy", label: zh ? "复制" : "Copy" }] },
    { id: "existingPolicy", label: zh ? "目标冲突" : "Existing target", kind: "select", visibleWhen: classify, options: [{ value: "merge", label: zh ? "报告冲突" : "Report conflict" }, { value: "skip", label: zh ? "跳过" : "Skip" }] },
    { id: "dryRun", label: zh ? "仅预演" : "Dry run", kind: "boolean", visibleWhen: classify },
  ]
  return { id: "classq", title: "ClassQ", description: zh ? "关键词目录递归分类与 wait 路由工作台" : "Keyword-folder wait routing workbench", initialValues, fields,
    view: { sections: [{ id: "routing", title: zh ? "路由规则" : "Routing", fieldIds: fields.map((field) => field.id) }], dashboard: { title: zh ? "分类路由" : "Routing", display(values) { const input = classqInputFromInteractionValues(values); return { primary: input.action === "classify" ? (zh ? "分类执行" : "Classify") : (zh ? "扫描计划" : "Plan"), secondary: `${input.keyword} → ${input.waitKeyword}`, metrics: [{ label: zh ? "安全" : "Safety", value: input.dryRun !== false ? (zh ? "预演" : "Preview") : (zh ? "真实执行" : "Live") }] } } } },
    toInput: classqInputFromInteractionValues,
    validate(_values, input) { return input.paths?.length ? null : zh ? "至少输入一个根目录。" : "Enter at least one root directory." },
    preview(input) { return [`${zh ? "规则" : "Rule"}: ${input.keyword ?? "already"} → ${input.waitKeyword ?? "wait"}`, `${zh ? "根目录" : "Roots"}: ${input.paths?.length ?? 0}`, input.dryRun !== false ? (zh ? "安全预演" : "Preview") : (zh ? "真实移动/复制" : "Live transfer")] },
    isDangerous: (input) => input.action === "classify" && input.dryRun === false,
    dangerPrompt: () => ({ title: zh ? "确认真实分类" : "Confirm live classify", body: zh ? "将移动或复制所有就绪项；冲突项会保留为报告。" : "Ready items will be transferred; conflicts remain reported.", confirmLabel: zh ? "确认分类" : "Classify" }),
    result(result) { const data = result.data; return { success: result.success, message: result.message, lines: data ? [`${zh ? "关键词命中" : "Keywords"}: ${data.keywordCount}`, `${zh ? "就绪" : "Ready"}: ${data.readyCount}`, `${zh ? "冲突" : "Conflicts"}: ${data.conflictCount}`] : [] } },
  }
}
export function classqInputFromInteractionValues(values: Readonly<InteractionValues>): ClassqInput { return { action: values.action === "classify" ? "classify" : "plan", paths: String(values.paths ?? "").split(/[\r\n,;]+/).map((value) => value.trim()).filter(Boolean), keyword: String(values.keyword ?? "").trim() || "already", waitKeyword: String(values.waitKeyword ?? "").trim() || "wait", transferMode: values.transferMode === "copy" ? "copy" : "move", existingPolicy: values.existingPolicy === "skip" ? "skip" : "merge", dryRun: values.dryRun !== false } }
