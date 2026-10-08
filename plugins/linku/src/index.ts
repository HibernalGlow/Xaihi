/**
 * linku 的宿主半边：把移植过来的内核接成一个 Xaihi 节点。
 *
 * 三件事各自归位：
 * - **决定**做什么在 `core.ts`（逐字移植的纯内核，含 `restore` 那三层回滚）；
 * - **碰机器**在 `platform.ts`（ADR-0003 决定 1：内核继续用 `node:fs`，不换成 `ctx.fs`）；
 * - **批准**在清单里：`danger.actionIn` 把 `create` / `move_link` / `recover` / `restore`
 *   标成危险，`defineNode` 把它变成 `tools/pre-execute` 的 `ask`，审批 UI 与审计全在宿主。
 *
 * 定义只有一份真源：`package.json#xaihi.node`（词表照
 * `<Xiranite>/node-definitions/linku.json`）。
 *
 * 两条必须说清楚的接线决定：
 * 1. **链接记录的位置来自 `Config.recordsPath`**（默认空串）。上游那份记录住在
 *    `xiranite.config.toml` 的 `[nodes.linku]` 段里，这条通路按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md` 整块不接；而记录本身是**域数据**
 *    且要与旧 `linku.toml` 互操作（`import` 动作就是吃它的），按 ADR-0003 决定 2/3 的同一判据
 *    落成"使用者在 `Config` 里给的文件"。没给时 `readConfig` / `writeConfig` 在碰任何文件之前
 *    抛 `RECORDS_PATH_GAP`（`platform.ts`），响亮拒绝、不静默落别处。
 *    `info` 动作不碰记录文件，所以没配也能跑——这与上游一致。
 * 2. **`import` 动作没有宿主侧的工具**：它在上游的 `xaihi.node/v1` 清单里就**不是**一个动作
 *    （`node-definitions/linku.json` 的 `actions` 只有 info / create / move_link / list /
 *    recover / restore，尽管内核与终端面都有 import）。清单是词表真源，这里不替它补一条
 *    上游没声明的动作；`import` 仍然只能从 `linku import --path …` 那条腿走（`src/cli.ts`），
 *    与上游一致。这条落差是**上游清单自己的缺口**，记在这里而不是偷偷修掉。
 *
 * 上游的 `interaction.ts`（153 行）**不随本包发布**：它引
 * `@xiranite/cli-runtime/interaction` 与 `TerminalLanguage`，本仓没有那两个包也不许引
 * `@xiranite/*`。它那份 `isDangerous`（`interaction.ts:109-113`）与 `dangerPrompt`
 * 就是清单里 `danger.actionIn` 那四条与提示文案的出处，逐条对得上；
 * 终端引导流在 `src/cli.ts` 里作为未接的腿响亮拒绝。
 *
 * @module xaihi-linku
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runLinku, type LinkuAction, type LinkuInput } from './core.ts'
import { assertRecordsConfigured, createNodeLinkuRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-linku'

export const inject = ['tools']

export interface Config {
  /**
   * 链接记录文件的路径。**默认空串 = 不动手**：任何要读写记录的动作在碰文件之前抛
   * `RECORDS_PATH_GAP`（ADR-0013 + ADR-0003 决定 2；与 `dissolvef` 的 `historyPath`
   * 是同一条纪律）。单次调用仍可用定义里的 `configPath` 字段覆盖，次序照上游
   * `path || resolvedConfigPath`。
   */
  recordsPath: Volatile<string>
  /**
   * 下面两条是上游终端面从 `[nodes.linku]` 读的默认路径
   * （`packages/nodes/linku/src/cli.ts:46-49` 的 `default_path` / `default_target`）：
   * 动作没给 `path` / `target` 时代替它。同一些值在 Xaihi 是 `Config`，不再有一份 toml。
   */
  defaultPath: Volatile<string>
  defaultTarget: Volatile<string>
}

export const Config = Schema.object({
  recordsPath: Schema.string().default('').volatile(),
  defaultPath: Schema.string().default('').volatile(),
  defaultTarget: Schema.string().default('').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/**
 * 表单值 → 内核输入。
 *
 * `action` 由处理器身份给（一个动作一个工具）。`path` / `target` 的兜底次序照上游
 * `inputFromArgs`（`:255-261`）的 `args.path ?? defaults.defaultPath`：**只有"字段没给"**
 * 才用配置，给了空串就交回内核自己那句校验（`core.ts:146` 等），
 * 外面不许抢先做参数校验——那是"sleept 刚修掉的那类误导"。
 * `configPath` 原样透传：与运行时默认路径的合并发生在 `platform.ts` 里（上游同一条 `||`）。
 */
function inputFrom(action: LinkuAction, inputs: Record<string, unknown>, config: Config): LinkuInput {
  return {
    action,
    path: (inputs.path ?? config.defaultPath.get()) as string,
    target: (inputs.target ?? config.defaultTarget.get()) as string,
    configPath: (inputs.configPath ?? '') as string,
  }
}

/**
 * 内核事件 → 运行账本。**单位**：linku 内核的 `progress` 是百分数（40 / 75，
 * 只在 `move_link` 那条腿上吐），直接当 `done / total=100` 用，
 * 不许照抄 dissolvef 那句 `* 100`（那份内核给的是 0..1）。
 */
function forward(runtimeEvent: { type: string; progress?: number; message: string }, run: OperationRun): void {
  if (runtimeEvent.type === 'progress') {
    run.progress({ done: Math.round(runtimeEvent.progress ?? 0), total: 100 })
  }
  if (runtimeEvent.message !== '') run.preview({ message: runtimeEvent.message })
}

/**
 * 每个动作共用的一条腿：跑内核、把事件接进账本、把 `LinkuData` 原样发给 `result_view`
 * （`pathInfo` / `links` / 六个计数都是内核自己算好的，这里不重新发明口径，
 * 也不做上游没有的截断）。失败一律抛出：把失败咽成一次成功输出，
 * 症状会是"面板显示了空结果"。
 */
async function call (action: LinkuAction, inputs: Record<string, unknown>, config: Config, run: OperationRun): Promise<string> {
  const recordsPath = config.recordsPath.get()
  // 闸门在**调用内核之前**：`create` 是"建链 → 记账"，只靠 platform 里那条拒绝的话
  // 软链已经建出来了（见 `platform.ts` 的 `assertRecordsConfigured` 注释）。
  assertRecordsConfigured(action, typeof inputs.configPath === 'string' ? inputs.configPath : '', recordsPath)
  const result = await runLinku(inputFrom(action, inputs, config), createNodeLinkuRuntime(recordsPath), (event) => forward(event, run))
  run.resultView({ ...result.data, success: result.success, message: result.message })
  if (!result.success) throw new Error(`linku: ${result.message}`)
  return result.message
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async info({ inputs, run }) {
        return call('info', inputs, config, run)
      },
      async create({ inputs, run }) {
        return call('create', inputs, config, run)
      },
      async move_link({ inputs, run }) {
        return call('move_link', inputs, config, run)
      },
      async list({ inputs, run }) {
        return call('list', inputs, config, run)
      },
      async recover({ inputs, run }) {
        return call('recover', inputs, config, run)
      },
      async restore({ inputs, run }) {
        return call('restore', inputs, config, run)
      },
      // `import` 故意不接：它不在这份清单的 `actions` 里（见文件头第 2 条）。
    },
  })
}
