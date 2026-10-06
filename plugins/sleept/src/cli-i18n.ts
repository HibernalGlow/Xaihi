/**
 * 迁移期垫片：`<Xiranite>` tag `noxide` 的 `packages/cli-runtime/src/i18n.ts` 里，
 * 被本包 `src/i18n.ts` 用到的那两个类型与那条工厂的**签名**。
 *
 * - `TerminalLanguage` 逐字抄自基线 `i18n.ts:3`。
 * - `I18nInterpolationValues` 逐字抄自基线 `i18n.ts:96`。
 * - `createI18nTranslator<Key>` 的签名（三个参数、返回 `(key, values) => string`）抄自
 *   基线 `i18n.ts:118-129`，所以 `src/i18n.ts` 那一行调用与 `Translator = ReturnType<…>`
 *   （`src/interaction.ts:265`）都不用改形状。
 *
 * **函数体没有搬过来，本仓也没有"顺手写一个能用的"**，理由是量出来的：上游那 12 行做的是
 * `createCliI18n(language, …)` + `instance.getFixedT(language, namespace)`，而 `createCliI18n`
 * 的第一行是 `import { createInstance } from "i18next"`（`i18n.ts:1`）。`i18next` 不是本包的依赖
 * （实测 `ls plugins/sleept/node_modules` 无 `i18next`；`rg -l i18next plugins/<id>/package.json` 命中 0，
 * 只有 `packages/ui-host/node_modules/i18next` 那一份属于工作台），而 ADR-0002 又不许装进 profile 的包
 * 引仓内包 ⇒ 这一格在本仓就是缺的，手写一份内插值器等于"重建已经提供的能力"，更等于给保真尺造假数据。
 *
 * 于是这一条是**响亮拒绝的未接面**（与 `src/cli.ts` 的 `UNWIRED_TIMER_ACTIONS` 同一口径：
 * 静默消失比响亮拒绝更糟）。它唯一的消费者是 `createSleeptInteractionSchema`
 * （`src/interaction.ts:56-60`，引导流那三个子命令 `ui` / `gd` / `guided` 才会走到），
 * 而那条腿在本仓本来就未接。被浏览器面 value-import 的那几条**不经过**这里：
 * `sleeptInputFromInteractionValues` 与 `countdownSeconds` / `formatDuration` 都是零 i18n 的纯函数，
 * 所以工作台面板与内核用例不受影响。
 *
 * @module xaihi-sleept/cli-i18n
 */

export type TerminalLanguage = 'en' | 'zh'

export type I18nInterpolationValues = Record<string, string | number | boolean>

/**
 * 基线里这里是 i18next 的固定命名空间翻译器；本包没带 `i18next`，所以一律拒绝而不是编一个返回值。
 * @param _language - 目标语言（`en` / `zh`）。
 * @param _namespace - 命名空间，本包传的是 `"sleept"`。
 * @param _resources - 两个语言各一份的字典，本包传的是 `sleeptLocaleResources`。
 * @returns `(key, values?) => string` 的翻译器。基线那一行写的是默认参数
 *   `values: I18nInterpolationValues = {}`（`i18n.ts:128`），在调用位上就是可省，
 *   所以类型位要写成 `values?`，否则 `src/interaction.ts` 里那二十几条 `t("key")` 全炸。
 * @throws 每次都抛：缺的是 `i18next` 这条依赖，不是参数。
 */
export function createI18nTranslator<Key extends string>(
  _language: TerminalLanguage,
  _namespace: string,
  _resources: Record<TerminalLanguage, Record<Key, string>>,
): (key: Key, values?: I18nInterpolationValues) => string {
  throw new Error(
    'sleept: createI18nTranslator 未接 —— 它是 packages/cli-runtime/src/i18n.ts:118-129 的 i18next 工厂，'
    + '而 i18next 不是本包的依赖（ADR-0002 也不许装进 profile 的包引仓内包）。'
    + '消费者只有 createSleeptInteractionSchema（引导流 ui/gd/guided，本仓同为未接面）；'
    + '内核与浏览器面板用的纯函数不经过这里。台账见 docs/stages/sleept-core-close.md。',
  )
}
