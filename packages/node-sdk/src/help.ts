/**
 * 节点的**终端帮助载荷**由清单推导，不另抄一份。
 *
 * 为什么不做成手写文件：上游每个节点都有一份 `packages/nodes/<id>/src/help.ts`
 * （`<Xiranite>` tag `noxide`，实测 sleept 120 行 / linedup 186 行 / dissolvef 120 行），
 * 内容是把手边的标题、描述与命令再誊一遍英文样板。它抄错过一次就再没人发现——
 * 实测上游 sleept 那份现在还在说 "System timer for countdown, scheduled time, network,
 * and CPU triggers"，而本仓的 sleept 是**电源节点**（真源 `package.json#xaihi.node`）；
 * 命令名也还写着旧壳的 `xiranite sleept`，本仓的 bin 是 `xsleept`、无模型入口是 `/sleept`。
 * 所以这里只做一个推导器：输入是节点自己的清单，输出是终端面要的载荷。
 *
 * 载荷的形状对齐 `@xiranite/contract` 的 `NodeHelp` 一族
 * （`packages/contract/src/index.ts`），字段名与可选性逐条对齐，
 * 因为消费方 `packages/cli/src/index.ts` 的 `interface NodeHelpModule { help?: NodeHelp }`
 * 就是按那份读的。**但本仓不引那个包**：它是 `@xiranite/*` + `workspace:*`，
 * 一写进依赖全仓 pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释）。
 *
 * 名字为什么带 `Terminal` 前缀：`node-sdk/src/node.ts` 里已经有一个 `NodeHelp`，
 * 那是清单里 `xaihi.node.help` 那一块（`whenToUse` + 按使用面分组的 `workflows`），
 * 与这里"打印给人看的那一屏"是两件事。实测撞过一次：同名让 dts 打结，
 * 结果两个类型都从 barrel 的导出名单里消失了（TS4023 + MISSING_EXPORT）。
 * 漂没漂由 `tests/help.spec.ts` 对着上游源码做差集负责。
 */

/** 与 contract 的 `NodeHelpExample` 同形。 */
export interface TerminalHelpExample {
  label?: string
  command: string
  description?: string
}

/** 与 contract 的 `NodeHelpCommand` 同形。 */
export interface TerminalHelpCommand {
  title: string
  command?: string
  description?: string
  examples: readonly TerminalHelpExample[]
}

/** 与 contract 的 `NodeHelpWorkflow` 同形。 */
export interface TerminalHelpWorkflow {
  title: string
  summary?: string
  ui?: readonly string[]
  cli?: readonly string[]
  tips?: readonly string[]
}

/** 与 contract 的 `NodeHelp` 同形（本推导器用得到的字段）。 */
export interface TerminalNodeHelp {
  title: string
  short: string
  description?: string
  whenToUse?: readonly string[]
  workflows: readonly TerminalHelpWorkflow[]
  commands: readonly TerminalHelpCommand[]
}

/** 推导的输入：清单里 `xaihi.node` 那一块，只用到这几个字段。 */
export interface TerminalHelpSource {
  nodeId?: unknown
  title?: unknown
  description?: unknown
  actions?: unknown
}

/** 每条节点各自的终端面名字；不给就按 `x<nodeId>` 推。 */
export interface TerminalHelpOptions {
  bin?: string
  /** 宿主侧无模型入口的名字（`ctx.commands`），例如 `/sleept`。 */
  command?: string
}

interface Localized {
  zh: string
  en: string
}

const localized = (value: unknown, what: string): Localized => {
  if (typeof value !== 'object' || value === null) throw new Error(`nodeHelp: ${what} 必须是 {zh,en}`)
  const entry = value as Partial<Localized>
  if (typeof entry.zh !== 'string' || typeof entry.en !== 'string') {
    throw new Error(`nodeHelp: ${what} 缺 zh 或 en（中英两份都要有，缺一份界面上就是裸 key）`)
  }
  return { zh: entry.zh, en: entry.en }
}

/**
 * @param source - `package.json#xaihi.node` 的原样内容。
 * @param options - bin 与命令名；缺省时按 nodeId 推。
 * @throws 清单形状不对就抛。帮助页是使用者搞清"这个节点能干什么"的地方，宁可炸也不要半份。
 */
export function nodeHelpFromManifest(
  source: TerminalHelpSource,
  options: TerminalHelpOptions = {},
): TerminalNodeHelp {
  if (typeof source.nodeId !== 'string' || source.nodeId.length === 0) {
    throw new Error('nodeHelp: 清单里没有 nodeId')
  }
  const nodeId = source.nodeId
  const title = localized(source.title, `${nodeId}.title`)
  const description = localized(source.description, `${nodeId}.description`)
  if (!Array.isArray(source.actions) || source.actions.length === 0) {
    throw new Error(`nodeHelp: ${nodeId} 一个动作都没有，帮助页无从推导`)
  }

  const bin = options.bin ?? `x${nodeId}`
  const hostCommand = options.command ?? `/${nodeId}`

  const actions = source.actions.map((raw, index) => {
    const action = raw as { id?: unknown; label?: unknown; description?: unknown }
    if (typeof action.id !== 'string' || action.id.length === 0) {
      throw new Error(`nodeHelp: ${nodeId} 第 ${index} 条动作没有 id`)
    }
    // `description` 在契约里就是可选的（`NodeAction.description?`），缺了不许炸整页帮助：
    // 实测 linedup 唯一的动作 `filter` 就没写描述，硬要它等于把"文案没填"升级成"这个节点不能用"。
    // 但**写了却只写一种语言**必须抛——那会在界面上留一个裸 key。
    return {
      id: action.id,
      label: localized(action.label, `${nodeId}.${action.id}.label`),
      description: action.description === undefined ? null : localized(action.description, `${nodeId}.${action.id}.description`),
    }
  })

  return {
    title: title.en,
    short: description.en,
    description: description.en,
    whenToUse: [description.en],
    workflows: [
      { title: 'Workspace UI', summary: title.en, ui: [description.en] },
      {
        title: 'CLI',
        summary: `${bin} <action>`,
        cli: [
          `Run \`${bin} --help\` for this node's exact flags and subcommands.`,
          `Actions come from \`package.json#xaihi.node.actions\`: ${actions.map((action) => action.id).join(', ')}.`,
        ],
      },
    ],
    commands: [
      {
        title: 'Node CLI',
        command: bin,
        description: description.en,
        examples: [
          { label: 'Flags', command: `${bin} --help`, description: 'Show subcommands and options.' },
          ...actions.map((action) => ({
            label: action.label.en,
            command: `${bin} ${action.id}`,
            ...(action.description === null ? {} : { description: action.description.en }),
          })),
        ],
      },
      {
        title: 'Host command (no model)',
        command: hostCommand,
        description: 'Same actions, dispatched inside DSH via ctx.commands.',
        examples: [{
          label: 'Raw input',
          command: `${hostCommand} ${actions[0]?.id ?? ''}`.trim(),
          ...(actions[0]?.description === null || actions[0] === undefined
            ? {}
            : { description: actions[0]!.description!.en }),
        }],
      },
    ],
  }
}
