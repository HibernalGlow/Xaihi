import type { InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { SmartZipAction, SmartZipInput, SmartZipResult } from "./core.ts"

export type SmartZipInteractionValues = InteractionValues & {
  action: SmartZipAction
  pathsText: string
  iniPath: string
  passwordsText: string
  codePage: string
  databasePath: string
  recordRun: boolean
  dryRun: boolean
}

export function createSmartZipInteractionSchema(
  defaults: Partial<SmartZipInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<SmartZipInput, SmartZipResult> {
  const zh = language === "zh"
  const initialValues: SmartZipInteractionValues = {
    action: "status",
    pathsText: "",
    iniPath: "",
    passwordsText: "",
    codePage: "0",
    databasePath: "",
    recordRun: false,
    dryRun: true,
    ...defaults,
  }
  return {
    id: "smartzip",
    title: "SmartZip",
    description: zh ? "归档提取、压缩、打开与配置工作流。" : "Archive extract, compress, open and configuration workflow.",
    initialValues,
    fields: [
      { id: "action", label: zh ? "归档动作" : "Archive action", kind: "select", options: [
        { value: "status", label: zh ? "状态" : "Status" },
        { value: "inspect_codepage", label: zh ? "预检文件名编码" : "Inspect filename encoding" },
        { value: "extract", label: zh ? "智能提取" : "Smart extract" },
        { value: "extract_codepage", label: zh ? "编码提取" : "Codepage extract" },
        { value: "open", label: zh ? "打开" : "Open" },
        { value: "archive", label: zh ? "压缩" : "Archive" },
      ] },
      { id: "pathsText", label: zh ? "归档路径" : "Archive paths", kind: "path-list", lines: 6, visibleWhen: (values) => values.action !== "status" },
      { id: "codePage", label: zh ? "旧 ZIP 文件名编码" : "Legacy ZIP filename encoding", kind: "select", visibleWhen: (values) => values.action === "extract_codepage", options: [
        { value: "0", label: zh ? "自动检测" : "Auto detect" },
        { value: "936", label: "GBK / CP936" },
        { value: "950", label: "Big5 / CP950" },
        { value: "932", label: "Shift_JIS / CP932" },
        { value: "949", label: "EUC-KR / CP949" },
        { value: "65001", label: "UTF-8" },
      ] },
      { id: "iniPath", label: "SmartZip.ini", kind: "text" },
      { id: "databasePath", label: zh ? "运行记录" : "Run database", kind: "text", visibleWhen: (values) => values.recordRun === true },
      { id: "recordRun", label: zh ? "记录运行" : "Record run", kind: "boolean" },
      { id: "dryRun", label: zh ? "预演" : "Dry-run", kind: "boolean", visibleWhen: (values) => values.action !== "status" && values.action !== "inspect_codepage" },
    ],
    toInput: (values) => ({
      action: values.action as SmartZipAction,
      paths: String(values.pathsText ?? "").split(/\r?\n/).map((path) => path.trim()).filter(Boolean),
      codePage: Number(values.codePage) || undefined,
      passwords: String(values.passwordsText ?? "").split(/\r?\n/).map((password) => password.trim()).filter(Boolean),
      iniPath: String(values.iniPath ?? "") || undefined,
      databasePath: String(values.databasePath ?? "") || undefined,
      recordRun: values.recordRun === true,
      dryRun: values.dryRun !== false,
    }),
    validate: (_values, input) => input.action !== "status" && !input.paths?.length ? (zh ? "至少输入一个归档路径。" : "Enter at least one archive path.") : null,
    preview: (input) => [
      `${zh ? "动作" : "Action"}: ${input.action}`,
      `${zh ? "路径" : "Paths"}: ${input.paths?.length ?? 0}`,
      input.action === "extract_codepage"
        ? `${zh ? "文件名代码页" : "Filename code page"}: ${input.codePage ? `CP${input.codePage}` : (zh ? "自动" : "Auto")}`
        : (zh ? "文件名编码：可先预检候选预览" : "Filename encoding: inspect candidate previews first"),
      input.dryRun ? (zh ? "预演：只生成 TypeScript 工作流计划。" : "Dry-run: plan the TypeScript workflow only.") : (zh ? "真实执行：TS 工作流调用自动检测的 7-Zip。" : "Live: the TS workflow uses automatically detected 7-Zip."),
    ],
    isDangerous: (input) => input.action !== "status" && input.action !== "inspect_codepage" && input.dryRun === false,
    result: (result) => ({
      success: result.success,
      message: result.message,
      lines: result.data?.errors ?? [],
      table: {
        columns: [{ id: "path", label: zh ? "路径" : "Path", width: 44 }],
        rows: (result.data?.selectedPaths ?? []).map((path) => ({ path })),
        emptyMessage: result.message,
      },
    }),
  }
}
