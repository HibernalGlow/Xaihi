import type {
  InteractionField,
  InteractionValues,
  TerminalInteractionSchema,
} from "@hibernalglow/xaihi-cli-runtime/interaction";
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type {
  MigratefAction,
  MigratefInput,
  MigratefMode,
  MigratefResult,
} from "./core.ts";
export type MigratefInteractionValues = InteractionValues & {
  action: MigratefAction;
  mode: MigratefMode;
  sourcePaths: string;
  targetPath: string;
  maxWorkers: number;
  batchId: string;
  historyLimit: number;
  historyPath: string;
  dryRun: boolean;
};
export function createMigratefInteractionSchema(
  d: Partial<MigratefInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<MigratefInput, MigratefResult> {
  const zh = language === "zh",
    base: MigratefInteractionValues = {
      action: "plan",
      mode: "preserve",
      sourcePaths: "",
      targetPath: "",
      maxWorkers: 16,
      batchId: "",
      historyLimit: 10,
      historyPath: "",
      dryRun: true,
    },
    initialValues = {
      ...base,
      ...Object.fromEntries(
        Object.entries(d).filter(([, v]) => v !== undefined),
      ),
    } as MigratefInteractionValues;
  const fields: InteractionField[] = [
    {
      id: "action",
      label: zh ? "操作" : "Action",
      kind: "select",
      role: "action",
      options: [
        { value: "plan", label: zh ? "⌁ 迁移计划" : "⌁ Plan" },
        { value: "move", label: zh ? "→ 移动" : "→ Move" },
        { value: "copy", label: zh ? "⧉ 复制" : "⧉ Copy" },
        { value: "history", label: zh ? "◷ 历史" : "◷ History" },
        { value: "undo", label: zh ? "↶ 撤销" : "↶ Undo" },
      ],
    },
    {
      id: "mode",
      label: zh ? "目录模式" : "Layout mode",
      kind: "select",
      options: [
        { value: "preserve", label: zh ? "▦ 保留结构" : "▦ Preserve" },
        { value: "flat", label: zh ? "═ 扁平化" : "═ Flat" },
        { value: "direct", label: zh ? "→ 直接迁移" : "→ Direct" },
      ],
      visibleWhen: (v) => !["history", "undo"].includes(String(v.action)),
    },
    {
      id: "sourcePaths",
      label: zh ? "来源路径" : "Source paths",
      kind: "text",
      visibleWhen: (v) => !["history", "undo"].includes(String(v.action)),
    },
    {
      id: "targetPath",
      label: zh ? "目标目录" : "Target path",
      kind: "text",
      visibleWhen: (v) => !["history", "undo"].includes(String(v.action)),
    },
    {
      id: "maxWorkers",
      label: zh ? "并发数" : "Workers",
      kind: "number",
      min: 1,
      max: 64,
      step: 1,
      visibleWhen: (v) => !["history", "undo"].includes(String(v.action)),
    },
    {
      id: "batchId",
      label: zh ? "批次 ID" : "Batch ID",
      kind: "text",
      visibleWhen: (v) => v.action === "undo",
    },
    {
      id: "historyLimit",
      label: zh ? "历史条数" : "History limit",
      kind: "number",
      min: 1,
      max: 100,
      step: 1,
      visibleWhen: (v) => v.action === "history",
    },
    {
      id: "historyPath",
      label: zh ? "历史文件" : "History file",
      kind: "text",
      visibleWhen: (v) => v.action === "history" || v.action === "undo",
    },
    {
      id: "dryRun",
      label: zh ? "仅预演" : "Dry run",
      kind: "boolean",
      visibleWhen: (v) => !["history"].includes(String(v.action)),
    },
  ];
  return {
    id: "migratef",
    title: "MigrateF",
    description: zh
      ? "文件迁移、差异计划与撤销工作台"
      : "File migration, diff plan, and undo workbench",
    initialValues,
    fields,
    view: {
      sections: [
        {
          id: "migration",
          title: zh ? "迁移配置" : "Migration",
          fieldIds: fields.map((x) => x.id),
        },
      ],
      dashboard: {
        title: "MigrateF",
        display: (v) => ({
          primary: String(v.targetPath || v.batchId),
          secondary: String(v.action),
          metrics: [],
        }),
      },
    },
    toInput: (v) => ({
      action: v.action as MigratefAction,
      mode: v.mode as MigratefMode,
      sourcePaths: split(v.sourcePaths),
      targetPath: String(v.targetPath ?? ""),
      maxWorkers: Number(v.maxWorkers ?? 16),
      batchId: String(v.batchId ?? ""),
      historyLimit: Number(v.historyLimit ?? 10),
      historyPath: String(v.historyPath ?? ""),
      dryRun: v.dryRun !== false,
    }),
    validate(_v, i) {
      if (i.action === "history" || i.action === "undo") return null;
      if (!i.sourcePaths?.length)
        return zh
          ? "请输入至少一个来源路径。"
          : "Enter at least one source path.";
      return i.targetPath?.trim()
        ? null
        : zh
          ? "请输入目标目录。"
          : "Enter a target directory.";
    },
    preview: (i) => [
      `${zh ? "操作" : "Action"}: ${i.action}`,
      `${zh ? "模式" : "Mode"}: ${i.mode}`,
      i.targetPath || i.batchId || "",
    ],
    isDangerous: (i) =>
      ((i.action === "move" || i.action === "copy") && i.dryRun === false) ||
      i.action === "undo",
    dangerPrompt: (i) => ({
      title:
        i.action === "undo"
          ? zh
            ? "确认撤销批次"
            : "Confirm undo"
          : zh
            ? "确认真实迁移"
            : "Confirm live migration",
      body:
        i.action === "undo"
          ? zh
            ? "将反向执行历史批次操作。"
            : "History operations will be reversed."
          : zh
            ? "文件系统将被真实修改。"
            : "The filesystem will be modified.",
      confirmLabel: zh ? "确认执行" : "Execute",
    }),
    result: (r) => ({
      success: r.success,
      message: r.message,
      lines: r.data
        ? [
            `Total: ${r.data.totalCount}`,
            `Migrated: ${r.data.migratedCount}`,
            `Skipped: ${r.data.skippedCount}`,
            `Errors: ${r.data.errorCount}`,
          ]
        : [],
    }),
  };
}
function split(v: unknown) {
  return String(v ?? "")
    .split(/[;\r\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
