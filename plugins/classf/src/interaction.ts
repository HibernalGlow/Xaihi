import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import { DEFAULT_CLASSF_BLACKLIST_KEYWORDS } from "./blacklist.ts"
import type { ClassfAction, ClassfInput, ClassfResult } from "./core.ts"

export type ClassfInteractionValues = InteractionValues & {
  action: ClassfAction; pathsText: string; crashuSourcesText: string; targetDir: string; transferMode: string; classifyMode: string; placementMode: string; existingPolicy: string; workItemMode: string; blacklistKeywordsText: string; dryRun: boolean
  alreadyEnabled: boolean; waitEnabled: boolean; delEnabled: boolean
  sameaGroupEnabled: boolean; sameaGroupAlreadyEnabled: boolean; sameaGroupWaitEnabled: boolean; sameaGroupDelEnabled: boolean; sameaGroupMinOccurrences: number
}

export function createClassfInteractionSchema(defaults: Partial<ClassfInteractionValues> = {}, language: "zh" | "en" = "zh"): TerminalInteractionSchema<ClassfInput, ClassfResult> {
  const zh = language === "zh"
  const text = (zhText: string, enText: string) => zh ? zhText : enText
  const initialValues: ClassfInteractionValues = { action: "plan", pathsText: "", crashuSourcesText: "", targetDir: "", transferMode: "move", classifyMode: "auto", placementMode: "local", existingPolicy: "merge", workItemMode: "files", blacklistKeywordsText: DEFAULT_CLASSF_BLACKLIST_KEYWORDS.join("\n"), dryRun: true, alreadyEnabled: true, waitEnabled: true, delEnabled: true, sameaGroupEnabled: false, sameaGroupAlreadyEnabled: false, sameaGroupWaitEnabled: false, sameaGroupDelEnabled: false, sameaGroupMinOccurrences: 1, ...defaults }
  return {
    id: "classf", title: "ClassF", description: text("编排 SameA、CrashU 和 MigrateF 分类管道。", "Orchestrate the SameA, CrashU, and MigrateF classification pipeline."), initialValues,
    fields: [
      { id: "action", label: text("操作", "Action"), kind: "select", role: "action", options: [{ value: "plan", label: text("预演", "Plan") }, { value: "classify", label: text("执行", "Classify") }] },
      { id: "pathsText", label: text("SameA 压缩包根目录", "SameA archive roots"), kind: "path-list", lines: 4, placeholder: text("每行一个压缩包根目录", "One archive root per line") },
      { id: "crashuSourcesText", label: text("CrashU 匹配源目录", "CrashU source directories"), kind: "path-list", lines: 3, placeholder: text("每行一个匹配源目录", "One matching source directory per line") },
      { id: "placementMode", label: text("放置位置", "Placement"), kind: "select", options: [{ value: "local", label: text("文件所在目录", "Beside each file") }, { value: "root", label: text("给定根目录（保留相对路径）", "Target root (preserve paths)") }] },
      { id: "targetDir", label: text("分流目标根目录", "Classification target root"), kind: "text" },
      { id: "transferMode", label: text("迁移方式", "Transfer mode"), kind: "select", options: [{ value: "move", label: text("移动", "Move") }, { value: "copy", label: text("复制", "Copy") }] },
      { id: "alreadyEnabled", label: text("启用 already 队列", "Enable already queue"), kind: "boolean" },
      { id: "waitEnabled", label: text("启用 wait 队列", "Enable wait queue"), kind: "boolean" },
      { id: "delEnabled", label: text("启用 del 队列", "Enable del queue"), kind: "boolean" },
      { id: "existingPolicy", label: text("现有项目策略", "Existing policy"), kind: "select", options: [{ value: "merge", label: text("合并", "Merge") }, { value: "skip", label: text("跳过", "Skip") }] },
      { id: "workItemMode", label: text("作品类型", "Work item type"), kind: "select", options: [{ value: "files", label: text("压缩包文件", "Archive files") }, { value: "folders", label: text("已解压文件夹", "Extracted folders") }, { value: "mixed", label: text("压缩包 + 文件夹", "Archives + folders") }] },
      { id: "blacklistKeywordsText", label: text("黑名单作者", "Blacklisted authors"), kind: "multiline", lines: 5 },
      { id: "dryRun", label: text("预演", "Dry run"), kind: "boolean" },
      { id: "sameaGroupAlreadyEnabled", label: text("already 队列画师分组", "Group already artists"), kind: "boolean" },
      { id: "sameaGroupWaitEnabled", label: text("wait 队列画师分组", "Group wait artists"), kind: "boolean" },
      { id: "sameaGroupDelEnabled", label: text("del 队列画师分组", "Group del artists"), kind: "boolean" },
      { id: "sameaGroupMinOccurrences", label: text("画师最少文件数", "Minimum files per artist group"), kind: "number", min: 1, max: 100, step: 1 },
    ],
    toInput: (values) => ({ action: String(values.action ?? "plan") as ClassfAction, paths: split(values.pathsText), crashuSourcePaths: split(values.crashuSourcesText), targetDir: String(values.targetDir ?? "").trim() || undefined, transferMode: String(values.transferMode ?? "move") as ClassfInput["transferMode"], classifyMode: String(values.classifyMode ?? "auto") as ClassfInput["classifyMode"], alreadyEnabled: values.alreadyEnabled !== false, waitEnabled: values.waitEnabled !== false, delEnabled: values.delEnabled !== false, placementMode: String(values.placementMode ?? "local") as ClassfInput["placementMode"], existingPolicy: String(values.existingPolicy ?? "merge") as ClassfInput["existingPolicy"], workItemMode: String(values.workItemMode ?? "files") as ClassfInput["workItemMode"], blacklistKeywords: split(values.blacklistKeywordsText), dryRun: values.dryRun !== false, sameaGroupEnabled: values.sameaGroupEnabled === true, sameaGroupAlreadyEnabled: values.sameaGroupAlreadyEnabled === true, sameaGroupWaitEnabled: values.sameaGroupWaitEnabled === true, sameaGroupDelEnabled: values.sameaGroupDelEnabled === true, sameaGroupMinOccurrences: Number(values.sameaGroupMinOccurrences ?? 1) }),
    validate: (values) => values.placementMode === "root" && !String(values.targetDir ?? "").trim() ? text("根目录分流必须填写目标根目录。", "Target root is required for root placement.") : null,
    preview: (input) => [text("默认从剪贴板读取 SameA 根目录。", "SameA roots are read from the clipboard by default."), input.placementMode === "root" ? text("根目录分流：完整保留来源相对路径。", "Root placement preserves complete source-relative paths.") : text("就地分流：每个文件进入当前目录下的 already 或 wait。", "Local placement uses already or wait beside each file."), `Transfer: ${input.transferMode ?? "move"}`, input.dryRun !== false ? text("预演：不写入文件。", "Dry run: no files will change.") : text("真实执行：MigrateF 会按已确认计划移动或复制文件。", "Live: MigrateF applies the reviewed file transfers.")],
    isDangerous: (input) => input.action === "classify" && input.dryRun === false,
    dangerPrompt: () => ({ title: text("确认执行 ClassF 管道", "Confirm ClassF pipeline"), body: text("MigrateF 将按已确认计划对文件系统执行真实操作。", "MigrateF will apply the reviewed filesystem transfer plan."), confirmLabel: text("确认执行", "Run pipeline") }),
    result: (result) => ({ success: result.success, message: result.message, lines: result.data?.errors ?? [], table: { columns: [{ id: "sourceName", label: text("来源", "Source"), width: 28 }, { id: "targetRelative", label: text("目标", "Target"), width: 36 }, { id: "status", label: text("状态", "Status"), width: 14 }], rows: (result.data?.items ?? []).map((item) => ({ sourceName: item.sourceName, targetRelative: item.targetRelative, status: item.status })), emptyMessage: result.message } }),
  }
}
function split(value: unknown): string[] { return String(value ?? "").split(/[\r\n;,]+/).map((item) => item.trim()).filter(Boolean) }
