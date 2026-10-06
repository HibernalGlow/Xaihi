/**
 * Marku 的**交互面 schema**，从 `<Xiranite>` tag `noxide` 基线
 * `.scratch/xiranite-noxide/packages/nodes/marku/src/interaction.ts`（**4 行**，基线那份
 * 是压成 4 行的紧凑写法）逐字搬来，连挤在一起的排版都没"顺手展开"。
 * 改动只有第 1 行那两个**纯类型** import 的说明符：`@xiranite/cli-runtime/interaction` 与
 * `@xiranite/cli-runtime/i18n` 换成本包的 `./interaction-types.ts` 垫片（与
 * `src/contract.ts` 同一个理由：ADR-0002，本包不许依赖 `@xiranite/*`）。
 * 运行期依赖只有 `./core.js`（`MARKU_MODULES` 与几个类型），所以这一份**现在就能编译**。
 *
 * 它在本包的处境要说清楚：`createMarkuInteractionSchema` 唯一的消费者是基线 CLI 的
 * 引导流（`runInteractionCli` + `runGuidedInteraction`，OpenTUI / @clack），那两条腿在本包是
 * **响亮拒绝的未接面**（见 `src/cli.ts` 文件头与 `docs/service-mapping.md` G1/G2/G5）。
 * 搬它而不删它有两个理由：① 它是 `package.json#xaihi.node` 那份词表的**逐字出处**之一
 * （字段标签、`visibleWhen` 的每个条件、`dangerPrompt` 三句话、结果行数上限），
 * 词表对不上时这里是可比对的另一半；② 它把上游对"什么算危险"的判据写在明面上
 * （`isDangerous: action === "undo" || (action === "run" && dryRun === false)`），
 * `package.json#xaihi.node.danger` 就是把这一条翻成 `xaihi.node/v1` 的 `all` 谓词，
 * 翻得对不对由 `tests/definition.spec.ts` 那条对照负责。
 *
 * 挤行的语义钉子（展开成一份"更好读"的副本就会丢）：
 * - `action` 的四个选项标签 `≡ 文本处理` / `▤ 文件批处理` / `◷ 历史` / `↶ 撤销` 是
 *   `node-definitions/marku.json` 里 `actions[].label` 的那四条，逐字一致。
 * - `module` 的可见条件是 `action === "text" || action === "run"`，`stepConfig` 同一条；
 *   `paths` 只在 `run`、`historyPath` 在 `history|undo`、`undoId` 只在 `undo`。
 * - `initialValues` 是 `{action:"text", module:"markt", dryRun:true, enableUndo:true, …}`，
 *   部分值 `undefined` 的键被过滤掉后才覆盖（不是 `{...base, ...d}` 的裸合并）。
 * - `toInput` 把 `paths` 按 `[;\r\n]+` 切、把 `stepConfig` 按 JSON 解（解不出来就当 `{}`），
 *   `recursive === true`、`dryRun !== false`、`enableUndo !== false` 三个判据方向不一样。
 * - `validate` 对 `history` / `undo` **不校验**（直接 null），`text` 要文本、`run` 要路径。
 * - `result` 那三行是 `Processed:` / `Changed:` / `Errors:`，没有 workflow 那一腿的读数。
 *
 * @module xaihi-marku/interaction
 */
import type{InteractionField,InteractionValues,TerminalInteractionSchema}from"./interaction-types.ts";import type{TerminalLanguage}from"./interaction-types.ts";import{MARKU_MODULES,type MarkuAction,type MarkuInput,type MarkuModuleId,type MarkuResult}from"./core.js"