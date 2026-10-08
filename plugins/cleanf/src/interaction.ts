import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { CleanfAction, CleanfInput, CleanfPreset, CleanfPresetCombination, CleanfPresetId, CleanfResult } from "./core.ts"
import { CLEANING_PRESETS, getDefaultPresets, PRESET_COMBINATIONS } from "./presets.ts"

/**
 * Cleanf's preset vocabulary, re-published through the node's interaction contract.
 *
 * The faces read the preset names, the enabled marks and the preset combinations here instead of
 * value-importing `./core.js`: a value import would put a second execution host in the face process
 * (ADR-0074 §5), while both lists still have exactly one definition — `presets.ts`'s `CLEANING_PRESETS` and
 * `PRESET_COMBINATIONS`, which `core.ts` forwards and the host's own plan reads through that same edge. The
 * guided picker, the guide's intro catalog and the summary panel all draw their labels from here, so none of
 * them can drift from the catalog the host cleans by. Same shape as marku's `MARKU_MODULE_VOCABULARY`.
 */
export const CLEANF_PRESET_VOCABULARY: readonly CleanfPreset[] = Object.values(CLEANING_PRESETS)
export const CLEANF_PRESET_COMBINATIONS: readonly CleanfPresetCombination[] = PRESET_COMBINATIONS

/** The combination a guided picker answer resolves to, or `undefined` when the id is not in the vocabulary. */
export function cleanfPresetCombination(id: string): CleanfPresetCombination | undefined {
  return PRESET_COMBINATIONS.find((combination) => combination.id === id)
}

export type CleanfInteractionValues = InteractionValues & { action: CleanfAction; pathsText: string; presetsText: string; exclude: string; preview: boolean }

export function createCleanfInteractionSchema(defaults: Partial<CleanfInteractionValues> = {}, language: "zh" | "en" = "zh"): TerminalInteractionSchema<CleanfInput, CleanfResult> {
  const zh = language === "zh", text = (a: string, b: string) => zh ? a : b
  const initialValues: CleanfInteractionValues = { action: "clean", pathsText: "", presetsText: getDefaultPresets().join("\n"), exclude: "", preview: true, ...defaults }
  return {
    id: "cleanf", title: "CleanF", description: text("预览并清理空目录、备份、临时与垃圾文件。", "Preview and clean empty folders, backups, temp and trash files."), initialValues,
    fields: [
      { id: "action", label: text("操作", "Action"), kind: "select", role: "action", options: [{ value: "clean", label: text("清理", "Clean") }, { value: "undo", label: text("撤销上次清理", "Undo last cleanup") }], visibleWhen: () => false },
      { id: "pathsText", label: text("清理路径", "Cleanup paths"), kind: "path-list", lines: 5, placeholder: text("每行一个文件夹", "One folder per line") },
      { id: "presetsText", label: text("清理预设", "Cleanup presets"), kind: "multiline", lines: 2, placeholder: text("每行或逗号分隔一个预设", "One preset per line or comma") },
      { id: "exclude", label: text("排除关键词", "Exclude keywords"), kind: "text" },
      { id: "preview", label: text("仅预览", "Preview only"), kind: "boolean" },
    ],
    toInput: (values) => ({ action: values.action as CleanfAction, paths: String(values.pathsText ?? "").split(/[\r\n;,]+/).map((v) => v.trim()).filter(Boolean), presets: String(values.presetsText ?? "").split(/[\r\n,]+/).map((v) => v.trim()).filter(Boolean) as CleanfPresetId[], exclude: String(values.exclude ?? "").trim() || undefined, preview: values.preview !== false }),
    validate: (_values, input) => input.action === "undo" || input.paths?.length ? null : text("至少输入一个清理路径。", "Enter at least one cleanup path."),
    preview: (input) => input.action === "undo" ? [text("撤销：恢复上一次 Cleanf 清理。", "Undo: restore the latest Cleanf cleanup.")] : [`${text("路径", "Paths")}: ${input.paths?.length ?? 0}`, `${text("预设", "Presets")}: ${(input.presets ?? []).join(", ") || "—"}`, input.preview !== false ? text("预览：不会删除文件。", "Preview: no files will be removed.") : text("真实执行：匹配项将移入系统回收站，可撤销恢复。", "Live: matching items will be moved to the recycle bin and can be restored.")],
    isDangerous: (input) => input.action !== "undo" && input.preview === false,
    dangerPrompt: () => ({ title: text("确认清理", "Confirm cleanup"), body: text("匹配到的文件和目录将移入系统回收站，之后可撤销恢复。", "Matching files and folders will be moved to the recycle bin and can be restored afterward."), confirmLabel: text("移入回收站", "Move to recycle bin") }),
    result: (result) => ({ success: result.success, message: result.message, lines: result.data?.previewFiles ?? [], table: { columns: [{ id: "path", label: text("匹配路径", "Matched path"), width: 72 }], rows: (result.data?.previewFiles ?? []).map((path) => ({ path })), emptyMessage: result.message } }),
  }
}
