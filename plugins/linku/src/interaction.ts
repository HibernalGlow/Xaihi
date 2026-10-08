import type {
  InteractionField,
  InteractionValues,
  TerminalInteractionSchema,
} from "@hibernalglow/xaihi-cli-runtime/interaction";
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type { LinkuAction, LinkuInput, LinkuResult } from "./core.ts";
export type LinkuInteractionValues = InteractionValues & {
  action: LinkuAction;
  path: string;
  target: string;
  configPath: string;
};
export function createLinkuInteractionSchema(
  d: Partial<LinkuInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<LinkuInput, LinkuResult> {
  const zh = language === "zh",
    initialValues = {
      action: "info",
      path: "",
      target: "",
      configPath: "",
      ...clean(d),
    } as LinkuInteractionValues,
    fields: InteractionField[] = [
      {
        id: "action",
        label: zh ? "命令" : "Command",
        kind: "select",
        role: "action",
        options: [
          { value: "info", label: zh ? "◉ 信息" : "◉ Info" },
          { value: "create", label: zh ? "⊕ 创建" : "⊕ Create" },
          { value: "move_link", label: zh ? "⇄ 移动回链" : "⇄ Move & link" },
          { value: "list", label: zh ? "▤ 列表" : "▤ List" },
          { value: "recover", label: zh ? "↻ 恢复" : "↻ Recover" },
          { value: "restore", label: zh ? "⟲ 还原" : "⟲ Restore" },
        ],
      },
      {
        id: "path",
        label: zh ? "源路径 / 原链接" : "Source path / original link",
        kind: "text",
        visibleWhen: (v) => v.action !== "list" && v.action !== "recover",
      },
      {
        id: "target",
        label: zh ? "目标路径" : "Target path",
        kind: "text",
        visibleWhen: (v) => v.action === "create" || v.action === "move_link",
      },
      {
        id: "configPath",
        label: zh ? "链接记录配置" : "Link records config",
        kind: "text",
      },
    ];
  return {
    id: "linku",
    title: "LinkU",
    description: zh
      ? "符号链接创建、迁移、拓扑与恢复"
      : "Symlink creation, topology, and recovery",
    initialValues,
    fields,
    view: {
      sections: [
        {
          id: "links",
          title: zh ? "链接拓扑" : "Link topology",
          fieldIds: fields.map((x) => x.id),
        },
      ],
      dashboard: {
        title: "LinkU",
        display: (v) => ({
          primary: String(v.path || v.configPath || "LinkU"),
          secondary: String(v.target || v.action),
          metrics: [],
        }),
      },
    },
    toInput: (v) => ({
      action: v.action as LinkuAction,
      path: String(v.path ?? ""),
      target: String(v.target ?? ""),
      configPath: String(v.configPath ?? ""),
    }),
    validate: (_v, i) =>
      (i.action === "info" || i.action === "restore") && !i.path?.trim()
        ? zh
          ? i.action === "restore"
            ? "请输入已记录的原链接路径。"
            : "请输入路径。"
          : i.action === "restore"
            ? "Enter the recorded original link path."
            : "Enter a path."
        : (i.action === "create" || i.action === "move_link") &&
            (!i.path?.trim() || !i.target?.trim())
          ? zh
            ? "请输入源路径和目标路径。"
            : "Enter source and target paths."
          : null,
    preview: (i) => [
      i.path || i.configPath || "LinkU",
      i.target ? `→ ${i.target}` : String(i.action),
    ],
    isDangerous: (i) =>
      i.action === "create" ||
      i.action === "move_link" ||
      i.action === "recover" ||
      i.action === "restore",
    dangerPrompt: (i) => ({
      title:
        i.action === "restore"
          ? zh
            ? "确认还原链接"
            : "Confirm link restoration"
          : i.action === "recover"
          ? zh
            ? "确认恢复链接"
            : "Confirm link recovery"
          : zh
            ? "确认文件系统链接操作"
            : "Confirm filesystem link operation",
      body:
        i.action === "restore"
          ? zh
            ? "将先校验当前链接和目标，再把目标移回原路径并删除记录。"
            : "The live link and target are verified before moving the target back and removing its record."
          : zh
            ? "此操作会创建链接，移动回链还会移动原路径。"
            : "This creates symlinks; move-link also moves the source path.",
      confirmLabel: zh ? "确认执行" : "Execute",
    }),
    result: (r) => ({
      success: r.success,
      message: r.message,
      lines: r.data
        ? [
            `Records: ${r.data.links.length}`,
            `Created: ${r.data.created}`,
            `Recovered: ${r.data.recoveredCount}`,
            `Restored: ${r.data.restoredCount}`,
            `Failed: ${r.data.failedCount}`,
          ]
        : [],
    }),
  };
}
const clean = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
