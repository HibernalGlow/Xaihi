import type { InteractionField, InteractionValue, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction";
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type { TrenameAction, TrenameInput, TrenameResult } from "./core.ts";

export type TrenameInteractionValues = InteractionValues & {
  action: TrenameAction;
  paths: string;
  jsonContent: string;
  basePath: string;
  includeHidden: boolean;
  includeRoot: boolean;
  mode: "normal" | "leak";
  maxLines: number;
  compact: boolean;
  dryRun: boolean;
  batchId: string;
  undoPath: string;
};

export const defaultTrenameInteractionValues: TrenameInteractionValues = {
  action: "scan", paths: "", jsonContent: "", basePath: "", includeHidden: false,
  includeRoot: true, mode: "normal", maxLines: 1000, compact: true, dryRun: true,
  batchId: "", undoPath: "",
};

export function createTrenameInteractionSchema(
  defaults: Partial<TrenameInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<TrenameInput, TrenameResult> {
  const zh = language === "zh";
  const initialValues: TrenameInteractionValues = { ...defaultTrenameInteractionValues };
  for (const [key, value] of Object.entries(defaults)) if (value !== undefined) initialValues[key] = value;
  const actionIs = (...actions: TrenameAction[]) => (values: Readonly<InteractionValues>) => actions.includes(asAction(values.action));
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "工作流" : "Workflow", kind: "select", role: "action", options: [
      ["scan", zh ? "扫描" : "Scan"], ["import", zh ? "导入" : "Import"],
      ["validate", zh ? "校验" : "Validate"], ["rename", zh ? "重命名" : "Rename"],
      ["undo", zh ? "撤销" : "Undo"], ["history", zh ? "历史" : "History"],
    ].map(([value, label]) => ({ value, label })) },
    { id: "paths", label: zh ? "扫描目录" : "Folders", description: zh ? "每行一个目录，也支持粘贴多行" : "One folder per line", kind: "path-list", lines: 4, visibleWhen: actionIs("scan") },
    { id: "jsonContent", label: "Rename JSON", description: zh ? "可直接编辑扫描或翻译后的 JSON" : "Edit scanned or translated JSON", kind: "multiline", lines: 8, visibleWhen: actionIs("import", "validate", "rename") },
    { id: "basePath", label: zh ? "基准目录" : "Base path", kind: "text", visibleWhen: actionIs("validate", "rename") },
    { id: "includeHidden", label: zh ? "包含隐藏项" : "Include hidden", kind: "boolean", visibleWhen: actionIs("scan") },
    { id: "includeRoot", label: zh ? "包含根目录" : "Include root", kind: "boolean", visibleWhen: actionIs("scan") },
    { id: "mode", label: zh ? "扫描规则" : "Scan rule", kind: "select", options: [
      { value: "normal", label: zh ? "常规" : "Normal" }, { value: "leak", label: zh ? "泄漏前缀清理" : "Leak prefix" },
    ], visibleWhen: actionIs("scan") },
    { id: "maxLines", label: zh ? "分段行数" : "Lines per segment", kind: "number", min: 0, step: 100, visibleWhen: actionIs("scan"), validate: nonNegativeInteger(zh) },
    { id: "compact", label: zh ? "紧凑 JSON" : "Compact JSON", kind: "boolean", visibleWhen: actionIs("scan") },
    { id: "dryRun", label: zh ? "仅预演" : "Dry run", description: zh ? "关闭后会真实移动文件" : "Turning this off moves files", kind: "boolean", visibleWhen: actionIs("rename") },
    { id: "batchId", label: zh ? "批次 ID（留空撤销最近）" : "Batch ID", kind: "text", visibleWhen: actionIs("undo") },
    { id: "undoPath", label: zh ? "撤销记录" : "Undo store", kind: "text", visibleWhen: actionIs("undo", "history", "rename") },
  ];
  return {
    id: "trename", title: "Trename", description: zh ? "扫描、审阅并安全执行批量重命名" : "Scan, review and safely apply batch renames",
    initialValues, fields,
    view: { sections: [
      { id: "source", title: zh ? "来源" : "Source", fieldIds: ["action", "paths", "jsonContent", "basePath"] },
      { id: "options", title: zh ? "选项与安全" : "Options & safety", fieldIds: ["includeHidden", "includeRoot", "mode", "maxLines", "compact", "dryRun", "batchId", "undoPath"] },
    ], dashboard: { title: zh ? "重命名计划" : "Rename plan", display(values) { const input = trenameInputFromInteractionValues(values); return { primary: String(input.action), secondary: input.basePath || (zh ? "等待输入" : "Waiting for input"), metrics: [{ label: zh ? "安全模式" : "Safety", value: input.dryRun !== false ? (zh ? "预演" : "Preview") : (zh ? "真实执行" : "Live") }] }; } } },
    toInput: trenameInputFromInteractionValues,
    validate(values, input) {
      if (input.action === "scan" && splitLines(String(values.paths ?? "")).length === 0) return zh ? "至少输入一个扫描目录。" : "Enter at least one folder.";
      if (["import", "validate", "rename"].includes(input.action ?? "") && !input.jsonContent?.trim()) return zh ? "需要 Rename JSON。" : "Rename JSON is required.";
      return null;
    },
    preview(input) {
      const lines = [`${zh ? "操作" : "Action"}: ${input.action}`];
      if (input.paths) lines.push(`${zh ? "目录" : "Folders"}: ${Array.isArray(input.paths) ? input.paths.length : 1}`);
      if (input.basePath) lines.push(`${zh ? "基准" : "Base"}: ${input.basePath}`);
      if (input.action === "rename") lines.push(input.dryRun !== false ? (zh ? "安全预演，不移动文件" : "Preview only") : (zh ? "真实执行：将移动文件" : "Live file moves"));
      return lines;
    },
    isDangerous: (input) => input.action === "rename" && input.dryRun === false,
    dangerPrompt: () => ({ title: zh ? "确认真实重命名" : "Confirm live rename", body: zh ? "文件将被移动。请先检查路径差异与冲突列表。" : "Files will be moved. Review all diffs and conflicts first.", confirmLabel: zh ? "确认移动文件" : "Move files" }),
    result(result) {
      const data = result.data;
      return { success: result.success, message: result.message, lines: data ? [
        `${zh ? "总计" : "Total"}: ${data.totalItems}`,
        `${zh ? "可执行" : "Ready"}: ${data.operations.length}`,
        `${zh ? "冲突" : "Conflicts"}: ${data.conflicts.length}`,
      ] : [] };
    },
  };
}

export function trenameInputFromInteractionValues(values: Readonly<InteractionValues>): TrenameInput {
  return {
    action: asAction(values.action), paths: splitLines(String(values.paths ?? "")),
    jsonContent: String(values.jsonContent ?? ""), basePath: clean(values.basePath),
    includeHidden: values.includeHidden === true, includeRoot: values.includeRoot !== false,
    mode: values.mode === "leak" ? "leak" : "normal", maxLines: Number(values.maxLines ?? 1000),
    compact: values.compact !== false, dryRun: values.dryRun !== false,
    batchId: clean(values.batchId), undoPath: clean(values.undoPath),
  };
}

function asAction(value: InteractionValue | undefined): TrenameAction {
  return value === "import" || value === "validate" || value === "rename" || value === "undo" || value === "history" ? value : "scan";
}
function splitLines(value: string) { return value.split(/[\r\n;,]+/).map((item) => item.trim()).filter(Boolean); }
function clean(value: InteractionValue | undefined) { const text = String(value ?? "").trim(); return text || undefined; }
function nonNegativeInteger(zh: boolean) { return (value: InteractionValue) => Number.isInteger(Number(value)) && Number(value) >= 0 ? null : zh ? "请输入非负整数。" : "Enter a non-negative integer."; }
