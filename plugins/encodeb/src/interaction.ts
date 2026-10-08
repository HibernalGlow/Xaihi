import type { InteractionField, InteractionValues, TerminalInteractionSchema } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { EncodebAction, EncodebInput, EncodebResult, EncodebStrategy } from "./core.ts"
import { ENCODEB_PRESETS } from "./presets.ts"

export type EncodebInteractionValues = InteractionValues & {
  action: EncodebAction
  paths: string
  preset: string
  srcEncoding: string
  dstEncoding: string
  strategy: EncodebStrategy
  limit: number
}

export const defaultEncodebInteractionValues: EncodebInteractionValues = {
  action: "preview",
  paths: "",
  preset: "auto",
  srcEncoding: "auto",
  dstEncoding: "auto",
  strategy: "replace",
  limit: 200,
}

export function createEncodebInteractionSchema(
  defaults: Partial<EncodebInteractionValues> = {},
  language: TerminalLanguage = "zh",
): TerminalInteractionSchema<EncodebInput, EncodebResult> {
  const zh = language === "zh"
  const initialValues: EncodebInteractionValues = { ...defaultEncodebInteractionValues }
  for (const [key, value] of Object.entries(defaults)) if (value !== undefined) initialValues[key] = value
  const recover = (values: Readonly<InteractionValues>) => values.action === "recover"
  const fields: InteractionField[] = [
    { id: "action", label: zh ? "修复任务" : "Recovery task", kind: "select", role: "action", options: [{ value: "find", label: zh ? "⌕ 查找乱码" : "Find" }, { value: "preview", label: zh ? "◉ 预览修复" : "Preview" }, { value: "recover", label: zh ? "↻ 执行修复" : "Recover" }] },
    { id: "paths", label: zh ? "输入路径" : "Input paths", kind: "path-list", lines: 6 },
    { id: "preset", label: zh ? "修复预设" : "Repair preset", kind: "select", options: [
      { value: "auto", label: zh ? "Auto · 自动判断（推荐）" : "Auto detect (recommended)" },
      { value: "cn", label: "CN · ╓╨╬─ → 中文" },
      { value: "jp", label: "JP · âeâXâg → テスト" },
      { value: "kr", label: "KR · ╟╤▒█ → 한글" },
      { value: "jp_from_cn", label: "JP · 僥僗僩 → テスト" },
      { value: "jp_iso2022_from_cn", label: "JP · CP936 → ISO-2022-JP" },
      { value: "latin1_utf8", label: "Mojibake · ã‚» → セ" },
      { value: "hash_u", label: "#U30BB → セ" },
      { value: "middle_dot", label: "魔法・少女 → 魔法·少女" },
      { value: "custom", label: zh ? "自定义" : "Custom" },
    ] },
    { id: "srcEncoding", label: zh ? "源编码" : "Source encoding", kind: "text" },
    { id: "dstEncoding", label: zh ? "目标编码" : "Target encoding", kind: "text" },
    { id: "strategy", label: zh ? "修复策略" : "Strategy", kind: "select", visibleWhen: recover, options: [{ value: "replace", label: zh ? "原地替换" : "Replace" }, { value: "copy", label: zh ? "复制修复副本" : "Copy" }] },
    { id: "limit", label: zh ? "候选上限" : "Candidate limit", kind: "number", min: 1, max: 2000, step: 1 },
  ]

  return {
    id: "encodeb",
    title: "EncodeB",
    description: zh ? "文件名乱码检测、编码推断与安全修复工作台" : "Filename mojibake detection and recovery",
    initialValues,
    fields,
    view: {
      sections: [{ id: "repair", title: zh ? "编码修复" : "Encoding repair", fieldIds: fields.map((field) => field.id) }],
      dashboard: {
        title: zh ? "修复映射" : "Recovery mapping",
        display(values) {
          const input = encodebInputFromInteractionValues(values)
          return { primary: input.action ?? "preview", secondary: `${input.srcEncoding} → ${input.dstEncoding}`, metrics: [{ label: zh ? "安全" : "Safety", value: input.action === "recover" ? (zh ? "需要确认" : "Confirm") : (zh ? "只读" : "Read only") }] }
        },
      },
    },
    toInput: encodebInputFromInteractionValues,
    validate(_values, input) { return input.paths?.length ? null : zh ? "至少输入一个路径。" : "Enter at least one path." },
    preview(input) { return [`${input.srcEncoding} → ${input.dstEncoding}`, `${zh ? "路径" : "Paths"}: ${input.paths?.length ?? 0}`, input.action === "recover" ? (zh ? "将改动文件名" : "Will rename files") : (zh ? "只读预览" : "Read-only preview")] },
    isDangerous: (input) => input.action === "recover",
    dangerPrompt: () => ({ title: zh ? "确认文件名修复" : "Confirm filename recovery", body: zh ? "将按当前编码和策略改动真实文件路径。" : "Real file paths will be changed.", confirmLabel: zh ? "确认修复" : "Recover" }),
    result(result) {
      const data = result.data
      return { success: result.success, message: result.message, lines: data ? [`${zh ? "映射" : "Mappings"}: ${data.mappings.length}`, `${zh ? "匹配" : "Matches"}: ${data.matches.length}`, `${zh ? "已处理" : "Processed"}: ${data.processed}`] : [] }
    },
  }
}

export function encodebInputFromInteractionValues(values: Readonly<InteractionValues>): EncodebInput {
  const presetId = String(values.preset ?? "auto")
  const preset = ENCODEB_PRESETS[presetId as keyof typeof ENCODEB_PRESETS] ?? ENCODEB_PRESETS.cn
  const custom = presetId === "custom"
  return {
    action: values.action === "find" || values.action === "recover" ? values.action : "preview",
    paths: String(values.paths ?? "").split(/[\r\n]+/).map((value) => value.trim()).filter(Boolean),
    srcEncoding: custom ? String(values.srcEncoding ?? "cp437") : preset.srcEncoding,
    dstEncoding: custom ? String(values.dstEncoding ?? "cp936") : preset.dstEncoding,
    transform: custom ? "recode" : preset.transform,
    strategy: values.strategy === "copy" ? "copy" : "replace",
    limit: Number(values.limit ?? 200),
  }
}
