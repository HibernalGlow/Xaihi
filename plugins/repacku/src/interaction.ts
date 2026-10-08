import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { RepackuAction, RepackuInput, RepackuResult } from "./core.ts"

export type RepackuInteractionValues = InteractionValues & {
  action: RepackuAction
  pathsText: string
  types: string
  minCount: number
  outputPath: string
  configPath: string
  galleryMarker: string
  deleteAfter: boolean
  dryRun: boolean
}

export function createRepackuInteractionSchema(
  defaults: Partial<RepackuInteractionValues> = {},
  language: "zh" | "en" = "zh",
): TerminalInteractionSchema<RepackuInput, RepackuResult> {
  const zh = language === "zh"
  const initialValues: RepackuInteractionValues = {
    action: "full",
    pathsText: "",
    types: "image",
    minCount: 2,
    outputPath: "",
    configPath: "",
    galleryMarker: ". 画集",
    deleteAfter: false,
    dryRun: true,
    ...defaults,
  }
  const text = (zhValue: string, enValue: string) => (zh ? zhValue : enValue)

  return {
    id: "repacku",
    title: "RepackU",
    description: text("分析目录树并生成安全的重打包计划。", "Analyze folder trees and create safe repacking plans."),
    initialValues,
    fields: [
      {
        id: "action",
        label: text("工作流", "Workflow"),
        kind: "select",
        role: "action",
        options: [
          { value: "analyze", label: text("分析", "Analyze") },
          { value: "compress", label: text("压缩", "Compress") },
          { value: "full", label: text("完整流程", "Full flow") },
          { value: "single-pack", label: text("单层打包", "Single pack") },
          { value: "gallery-pack", label: text("画集打包", "Gallery pack") },
        ],
      },
      { id: "pathsText", label: text("文件夹路径", "Folder paths"), kind: "path-list", lines: 5, placeholder: text("每行一个路径", "One folder per line") },
      { id: "types", label: text("目标类型", "Target types"), kind: "text", placeholder: "image,document" },
      { id: "minCount", label: text("最少文件数", "Minimum files"), kind: "number", min: 1, max: 9999, step: 1 },
      { id: "outputPath", label: text("配置输出", "Config output"), kind: "text" },
      { id: "configPath", label: text("配置路径", "Config path"), kind: "text" },
      { id: "galleryMarker", label: text("画集标记", "Gallery marker"), kind: "text" },
      { id: "deleteAfter", label: text("成功后删除源文件", "Delete sources after success"), kind: "boolean" },
      { id: "dryRun", label: text("预演", "Dry-run"), kind: "boolean" },
    ],
    toInput: (values) => ({
      action: String(values.action ?? "full") as RepackuAction,
      paths: String(values.pathsText ?? "").split(/[\r\n;,]+/).map((value) => value.trim()).filter(Boolean),
      configPath: String(values.configPath ?? "").trim() || undefined,
      types: String(values.types ?? "").trim() || undefined,
      outputPath: String(values.outputPath ?? "").trim() || undefined,
      deleteAfter: values.deleteAfter === true,
      dryRun: values.dryRun !== false,
      minCount: Number(values.minCount) || 2,
      galleryMarker: String(values.galleryMarker ?? "").trim() || undefined,
    }),
    validate: (_values, input) => input.action === "compress"
      ? input.configPath || input.paths?.length
        ? null
        : text("压缩需要配置路径或文件夹路径。", "Compress needs a config or folder path.")
      : input.paths?.length
        ? null
        : text("至少输入一个文件夹路径。", "Enter at least one folder path."),
    preview: (input) => [
      `${text("工作流", "Workflow")}: ${input.action ?? "full"}`,
      `${text("路径", "Paths")}: ${input.paths?.length ?? 0}`,
      input.dryRun !== false
        ? text("预演：不会写入归档。", "Dry-run: no archives will be written.")
        : text("真实执行：将写入归档。", "Live: archives will be written."),
    ],
    isDangerous: (input) => input.dryRun === false || input.deleteAfter === true,
    dangerPrompt: (input) => ({
      title: text("确认重打包", "Confirm repacking"),
      body: input.deleteAfter
        ? text("此操作会在成功后删除源文件。", "Sources will be deleted after successful compression.")
        : text("此操作会写入归档文件。", "Archives will be written to disk."),
      confirmLabel: text("确认执行", "Run now"),
    }),
    result: (result) => ({
      success: result.success,
      message: result.message,
      lines: result.data?.errors ?? [],
      table: {
        columns: [
          { id: "sourcePath", label: text("来源", "Source"), width: 42 },
          { id: "targetPath", label: text("归档", "Archive"), width: 42 },
          { id: "status", label: text("状态", "Status"), width: 12 },
        ],
        rows: (result.data?.operations ?? []).map((operation) => ({
          sourcePath: operation.sourcePath,
          targetPath: operation.targetPath,
          status: operation.status,
        })),
        emptyMessage: result.message,
      },
    }),
  }
}
