import type { InteractionField, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { SameaAction, SameaInput, SameaResult } from "./core.ts"

export type SameaInteractionValues = InteractionValues & {
  action: SameaAction
  pathsText: string
  ignorePathBlacklist: boolean
  minOccurrences: number
  centralize: boolean
  dryRun: boolean
  artistBlacklist: string
  pathBlacklist: string
  regexBlacklist: string
  archiveExtensions: string
}

export function createSameaInteractionSchema(defaults: Partial<SameaInteractionValues> = {}, language: TerminalLanguage = "zh"): TerminalInteractionSchema<SameaInput, SameaResult> {
  const zh = language === "zh"
  const initialValues = {
    action: "plan", pathsText: "", ignorePathBlacklist: false, minOccurrences: 1,
    centralize: false, dryRun: true,
    artistBlacklist: "pixiv\ntwitter\nvarious\nanthology\nunknown\ntrash\nartbook",
    pathBlacklist: "[00画师分类]\ntrash\ntemp", regexBlacklist: "",
    archiveExtensions: ".zip\n.rar\n.7z", ...clean(defaults),
  } as SameaInteractionValues
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "命令" : "Command", kind: "select", role: "action", options: [{ value: "plan", label: zh ? "⌕ 规划" : "⌕ Plan" }, { value: "classify", label: zh ? "▶ 分类" : "▶ Classify" }] },
    { id: "pathsText", label: zh ? "归档根目录" : "Archive roots", kind: "path-list", lines: 4 },
    { id: "ignorePathBlacklist", label: zh ? "忽略路径黑名单" : "Ignore path blacklist", kind: "boolean" },
    { id: "minOccurrences", label: zh ? "最少出现次数" : "Minimum occurrences", kind: "number", min: 1, max: 100, step: 1 },
    { id: "centralize", label: zh ? "集中输出" : "Centralize output", kind: "boolean" },
    { id: "dryRun", label: zh ? "预演模式" : "Dry run", kind: "boolean" },
    { id: "artistBlacklist", label: zh ? "画师黑名单" : "Artist blacklist", kind: "multiline", lines: 5 },
    { id: "pathBlacklist", label: zh ? "路径黑名单" : "Path blacklist", kind: "multiline", lines: 5 },
    { id: "regexBlacklist", label: zh ? "正则黑名单" : "Regex blacklist", kind: "multiline", lines: 5 },
    { id: "archiveExtensions", label: zh ? "归档扩展名" : "Archive extensions", kind: "multiline", lines: 4 },
  ]
  return {
    id: "samea", title: "SameA", description: zh ? "从归档名提取画师并安全分类" : "Extract artists from archive names and classify safely",
    initialValues, fields,
    view: { sections: [{ id: "source", title: zh ? "来源与规则" : "Sources and rules", fieldIds: fields.map((field) => field.id) }], dashboard: { title: "SameA", display: (values) => ({ primary: lines(values.pathsText)[0] ?? "SameA", secondary: String(values.action), metrics: [] }) } },
    toInput: (values) => ({ action: values.action as SameaAction, paths: lines(values.pathsText), ignorePathBlacklist: values.ignorePathBlacklist === true, minOccurrences: Number(values.minOccurrences ?? 1), centralize: values.centralize === true, dryRun: values.dryRun !== false, artistBlacklist: lines(values.artistBlacklist), pathBlacklist: lines(values.pathBlacklist), regexBlacklist: lines(values.regexBlacklist), archiveExtensions: lines(values.archiveExtensions) }),
    validate: (_values, input) => input.paths?.length ? null : zh ? "请至少输入一个归档根目录。" : "Enter at least one archive root.",
    preview: (input) => [`${input.paths?.length ?? 0} ${zh ? "个归档根目录" : "archive root(s)"}`, `${input.action} · min ${input.minOccurrences}`],
    isDangerous: (input) => input.action === "classify" && input.dryRun === false,
    dangerPrompt: () => ({ title: zh ? "确认实时分类" : "Confirm live classification", body: zh ? "SameA 将移动就绪的归档文件。" : "SameA will move ready archives.", confirmLabel: zh ? "确认移动" : "Move archives" }),
    result: (result) => ({ success: result.success, message: result.message, lines: result.data ? [`Scanned: ${result.data.scannedCount}`, `Ready: ${result.data.readyCount}`, `Moved: ${result.data.movedCount}`, `Errors: ${result.data.errorCount}`] : [] }),
  }
}

const lines = (value: unknown) => String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
const clean = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
