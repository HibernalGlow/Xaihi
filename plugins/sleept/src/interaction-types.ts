/**
 * 迁移期垫片：`<Xiranite>` tag `noxide` 的 `packages/cli-runtime/src/interaction.ts` 里，
 * 被本包 `src/interaction.ts` 用到的那几个**纯类型**。
 *
 * 声明逐条抄自基线（`interaction.ts:7-102` 的顺序与注释原样保留），只剥掉本包用不到的邻居
 * （`CliHost`、`resolveCliInvocation`、渲染器解析那一族）——与 `src/contract.ts`、
 * `plugins/marku/src/interaction-types.ts` 同一个口径：本包不许依赖 `@xiranite/*`
 * （`docs/adr/0002-self-contained-plugin-packages.md`、`scripts/check-installable.mjs`），
 * 而 `src/interaction.ts` 那份是从基线**逐字**搬来的，改它的类型说明符是唯一改动。
 *
 * 这里**没有任何运行期代码**：全部 `export interface` / `export type`，编译后即消失，
 * 所以它不会给本包引入一条上游没有的行为。引导流（OpenTUI / @clack）那条腿本身仍是
 * 未接面，见 `src/cli.ts` 文件头与 `docs/service-mapping.md` 的缺口台账。
 * `TerminalLanguage` 与翻译工厂不在这一份里，在 `./cli-i18n.ts`（基线也是两个模块）。
 *
 * @module xaihi-sleept/interaction-types
 */

export type InteractionValue = string | number | boolean
export type InteractionValues = Record<string, InteractionValue>
export type InteractionFieldKind = 'text' | 'multiline' | 'path-list' | 'number' | 'select' | 'boolean'

export interface InteractionOption<Value extends InteractionValue = InteractionValue> {
  value: Value
  label: string
  hint?: string
  disabled?: boolean
}

export interface InteractionField {
  id: string
  label: string
  description?: string
  kind: InteractionFieldKind
  /** Renderer-neutral hint for a primary workflow/action selector. */
  role?: 'action'
  options?: readonly InteractionOption[]
  placeholder?: string
  /** Preferred editor height for multiline and path-list fields. */
  lines?: number
  min?: number
  max?: number
  step?: number
  visibleWhen?: (values: Readonly<InteractionValues>) => boolean
  validate?: (value: InteractionValue, values: Readonly<InteractionValues>) => string | null
}

export interface TerminalViewSection {
  id: string
  title: string
  description?: string
  fieldIds: readonly string[]
}

export interface TerminalViewMetric {
  label: string
  value: string
}

export interface TerminalViewDisplay {
  primary: string
  secondary?: string
  metrics?: readonly TerminalViewMetric[]
  table?: TerminalViewTable
}

export interface TerminalViewTableColumn {
  id: string
  label: string
  width?: number
}

export interface TerminalViewTable {
  columns: readonly TerminalViewTableColumn[]
  rows: readonly Readonly<Record<string, string>>[]
  emptyMessage?: string
}

/**
 * Renderer-neutral content grouping owned by the independently distributed
 * node. It intentionally contains no positions, widths, widgets, or input API.
 */
export interface TerminalInteractionView {
  sections: readonly TerminalViewSection[]
  dashboard: {
    title: string
    description?: string
    display: (values: Readonly<InteractionValues>) => TerminalViewDisplay
  }
}

export interface TerminalInteractionSchema<Input, Result> {
  id: string
  title: string
  description: string
  initialValues: InteractionValues
  fields: readonly InteractionField[]
  view?: TerminalInteractionView
  toInput: (values: Readonly<InteractionValues>) => Input
  validate?: (values: Readonly<InteractionValues>, input: Input) => string | null
  preview: (input: Input) => readonly string[]
  isDangerous: (input: Input) => boolean
  dangerPrompt?: (input: Input) => {
    title: string
    body: string
    confirmLabel: string
  }
  result: (result: Result) => {
    success: boolean
    message: string
    lines?: readonly string[]
    table?: TerminalViewTable
  }
}
