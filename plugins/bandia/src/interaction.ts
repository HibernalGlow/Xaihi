import type { InteractionField, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { BandiaAction, BandiaArchiveFormat, BandiaExtractMode, BandiaInput, BandiaOverwriteMode, BandiaResult } from "./core.ts"

export type BandiaInteractionValues = InteractionValues & { action: BandiaAction; paths: string; mappingText: string; outputDir: string; outputPrefix: string; extractMode: BandiaExtractMode; overwriteMode: BandiaOverwriteMode; parallel: boolean; workers: number; compressFormat: BandiaArchiveFormat; deleteSource: boolean; deleteAfter: boolean; useTrash: boolean; efuOutputPath: string; openInEverything: boolean; dryRun: boolean }
export const defaultBandiaInteractionValues: BandiaInteractionValues = { action: "extract", paths: "", mappingText: "", outputDir: "", outputPrefix: "[extract] ", extractMode: "auto", overwriteMode: "overwrite", parallel: false, workers: 2, compressFormat: "zip", deleteSource: false, deleteAfter: false, useTrash: true, efuOutputPath: "", openInEverything: false, dryRun: true }
export function createBandiaInteractionSchema(defaults: Partial<BandiaInteractionValues> = {}, language: TerminalLanguage = "zh"): TerminalInteractionSchema<BandiaInput, BandiaResult> {
  const zh = language === "zh", initialValues: BandiaInteractionValues = { ...defaultBandiaInteractionValues }; for (const [key, value] of Object.entries(defaults)) if (value !== undefined) initialValues[key] = value
  const is = (...actions: BandiaAction[]) => (values: Readonly<InteractionValues>) => actions.includes(values.action as BandiaAction)
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "归档任务" : "Archive task", kind: "select", role: "action", options: [{ value: "extract", label: zh ? "⇩ 解压" : "Extract" }, { value: "compress", label: zh ? "▣ 压缩" : "Compress" }, { value: "repack", label: zh ? "↻ 重打包" : "Repack" }, { value: "export_efu", label: zh ? "⇧ EFU" : "Export EFU" }] },
    { id: "paths", label: zh ? "输入路径" : "Input paths", kind: "path-list", lines: 6, visibleWhen: is("extract", "compress", "export_efu") },
    { id: "mappingText", label: zh ? "归档映射" : "Archive mappings", description: zh ? "JSON、=>、制表符或 | 分隔均可。" : "JSON or delimited mappings.", kind: "multiline", lines: 6, visibleWhen: is("repack", "export_efu") },
    { id: "outputDir", label: zh ? "输出目录" : "Output directory", kind: "text", visibleWhen: is("compress") },
    { id: "outputPrefix", label: zh ? "解压前缀" : "Extract prefix", kind: "text", visibleWhen: is("extract") },
    { id: "extractMode", label: zh ? "解压方式" : "Extract mode", kind: "select", visibleWhen: is("extract"), options: [{ value: "auto", label: zh ? "自动" : "Auto" }, { value: "normal", label: zh ? "指定目录" : "Named directory" }] },
    { id: "overwriteMode", label: zh ? "同名目标" : "Overwrite", kind: "select", visibleWhen: is("extract"), options: [{ value: "overwrite", label: zh ? "覆盖" : "Overwrite" }, { value: "skip", label: zh ? "跳过" : "Skip" }, { value: "rename", label: zh ? "自动改名" : "Rename" }] },
    { id: "compressFormat", label: zh ? "压缩格式" : "Archive format", kind: "select", visibleWhen: is("compress", "repack"), options: [{ value: "zip", label: "ZIP" }, { value: "7z", label: "7z" }] },
    { id: "parallel", label: zh ? "并行" : "Parallel", kind: "boolean", visibleWhen: is("extract", "compress", "repack") },
    { id: "workers", label: zh ? "并发数" : "Workers", kind: "number", min: 1, max: 8, step: 1, visibleWhen: (values) => Boolean(values.parallel) },
    { id: "deleteAfter", label: zh ? "解压后删除归档" : "Delete archive", kind: "boolean", visibleWhen: is("extract") },
    { id: "deleteSource", label: zh ? "压缩后删除源" : "Delete source", kind: "boolean", visibleWhen: is("compress", "repack") },
    { id: "efuOutputPath", label: zh ? "EFU 输出文件" : "EFU output", kind: "text", visibleWhen: is("export_efu") },
    { id: "openInEverything", label: zh ? "在 Everything 打开" : "Open in Everything", kind: "boolean", visibleWhen: is("export_efu") },
    { id: "dryRun", label: zh ? "仅预演" : "Dry run", kind: "boolean" },
  ]
  return { id: "bandia", title: "Bandia", description: zh ? "Bandizip 批量归档管线与路径映射工作台" : "Bandizip archive pipeline and mapping workbench", initialValues, fields,
    view: { sections: [{ id: "input", title: zh ? "输入与映射" : "Input & mapping", fieldIds: fields.map((field) => field.id) }], dashboard: { title: zh ? "归档管线" : "Archive pipeline", display(values) { const input = bandiaInputFromInteractionValues(values); return { primary: String(input.action), secondary: input.dryRun !== false ? (zh ? "安全预演" : "Preview") : (zh ? "真实执行" : "Live"), metrics: [{ label: zh ? "项目" : "Items", value: String(input.paths?.length ?? 0) }] } } } },
    toInput: bandiaInputFromInteractionValues,
    validate(_values, input) { return input.action === "repack" ? (input.mappingText?.trim() ? null : zh ? "重打包需要路径映射。" : "Repack requires mappings.") : input.action === "export_efu" ? (input.paths?.length || input.mappingText?.trim() ? null : zh ? "需要路径或映射。" : "Provide paths or mappings.") : input.paths?.length ? null : zh ? "至少输入一个路径。" : "Enter at least one path." },
    preview(input) { return [`${zh ? "任务" : "Task"}: ${input.action}`, `${zh ? "路径" : "Paths"}: ${input.paths?.length ?? 0}`, input.dryRun !== false ? (zh ? "安全预演" : "Preview") : (zh ? "真实归档操作" : "Live archive operation")] },
    isDangerous: (input) => input.dryRun === false && (input.deleteAfter === true || input.deleteSource === true || input.action === "extract" || input.action === "compress" || input.action === "repack"),
    dangerPrompt: () => ({ title: zh ? "确认真实归档操作" : "Confirm live archive operation", body: zh ? "归档、解压或删除源文件会真实写入文件系统。" : "Archive operations will write to the filesystem.", confirmLabel: zh ? "确认执行" : "Execute" }),
    result(result) { const data = result.data; return { success: result.success, message: result.message, lines: data ? [`${zh ? "成功" : "Succeeded"}: ${data.extractedCount + data.compressedCount + data.exportedCount}`, `${zh ? "失败" : "Failed"}: ${data.failedCount}`, `${zh ? "映射" : "Mappings"}: ${data.pathMappings.length}`] : [] } },
  }
}
export function bandiaInputFromInteractionValues(values: Readonly<InteractionValues>): BandiaInput { const action = ["extract", "compress", "repack", "export_efu"].includes(String(values.action)) ? values.action as BandiaAction : "extract"; return { action, paths: String(values.paths ?? "").split(/[\r\n;]+/).map((v) => v.trim()).filter(Boolean), mappingText: String(values.mappingText ?? ""), outputDir: text(values.outputDir), outputPrefix: text(values.outputPrefix), extractMode: values.extractMode === "normal" ? "normal" : "auto", overwriteMode: values.overwriteMode === "skip" || values.overwriteMode === "rename" ? values.overwriteMode : "overwrite", parallel: values.parallel === true, workers: Number(values.workers ?? 2), compressFormat: values.compressFormat === "7z" ? "7z" : "zip", deleteAfter: values.deleteAfter === true, deleteSource: values.deleteSource === true, efuOutputPath: text(values.efuOutputPath), openInEverything: values.openInEverything === true, dryRun: values.dryRun !== false } }
function text(value: unknown) { const result = String(value ?? "").trim(); return result || undefined }
