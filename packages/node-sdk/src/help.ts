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

/** 推导的输入：清单里 `xaihi.node` 那一块。 */
export interface TerminalHelpSource {
  nodeId?: unknown
  title?: unknown
  description?: unknown
  actions?: unknown
  /**
   * 清单里 `xaihi.node.help` 那一块（`whenToUse` + `workflows`）。
   *
   * 为什么必须读它：本函数原先只拿 nodeId/title/description/actions **合成**两块通用页
   * （`Workspace UI` / `CLI`），于是搬进来的那张使用面表没有任何终端读者——
   * 内容对不对都不影响 `--help` 长什么样。加了这一路之后，清单里写了就用自己的，
   * 没写才回退到合成那两块（现存 3 份没有 workflows 的包与既有测试因此行为不变）。
   */
  help?: unknown
}

/** 一行使用面：单语串或 `{zh,en}` 都收，按请求的语言摊平。 */
function helpLine(value: unknown, language: 'zh' | 'en'): string | undefined {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object') {
    const entry = value as { zh?: unknown, en?: unknown }
    const picked = entry[language]
    if (typeof picked === 'string' && picked !== '') return picked
    const other = entry[language === 'zh' ? 'en' : 'zh']
    if (typeof other === 'string' && other !== '') return other
  }
  return undefined
}

/** 清单写了 `help.whenToUse` 就用它；没写返回 undefined，让调用方回退到描述。 */
function whenToUseFromHelp(help: unknown, language: 'zh' | 'en'): readonly string[] | undefined {
  if (help === null || typeof help !== 'object') return undefined
  const raw = (help as { whenToUse?: unknown }).whenToUse
  if (Array.isArray(raw)) {
    const lines = raw.map((line) => helpLine(line, language)).filter((line): line is string => line !== undefined)
    return lines.length > 0 ? lines : undefined
  }
  const single = helpLine(raw, language)
  return single === undefined ? undefined : [single]
}

/** 清单里那形（块数组或按面分组的扁平表）→ 终端用的块数组。返回空数组表示"清单没写，该合成"。 */
function workflowsFromHelp(help: unknown, language: 'zh' | 'en'): TerminalHelpWorkflow[] {
  if (help === null || typeof help !== 'object') return []
  const workflows = (help as { workflows?: unknown }).workflows
  const blocks: Record<string, unknown>[] = []
  if (Array.isArray(workflows)) blocks.push(...workflows as Record<string, unknown>[])
  else if (workflows !== null && typeof workflows === 'object') {
    // 扁平那一形没有 title/summary 的容身处，摊成一块：标题用面名，行按面归类。
    const grouped = workflows as Record<string, unknown>
    const surfaceKeys = Object.keys(grouped).filter((key) => Array.isArray(grouped[key]))
    if (surfaceKeys.length > 0) {
      const block: Record<string, unknown> = {}
      for (const key of surfaceKeys) block[key] = grouped[key]
      blocks.push(block)
    }
  }
  const out: TerminalHelpWorkflow[] = []
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue
    const surface = (key: 'ui' | 'cli' | 'tips'): readonly string[] | undefined => {
      const raw = (block as Record<string, unknown>)[key]
      // 两种形状都摊得开：行数组；或上游 `node-definitions/*.json` 用的 `{zh:[],en:[]}` 双语并列
      // （挑请求语言那一份，那份空就取另一份，两边都没有才算这一面没内容）。
      let list: unknown[]
      if (Array.isArray(raw)) list = raw
      else if (raw !== null && typeof raw === 'object') {
        const pair = raw as { zh?: unknown, en?: unknown }
        const preferred = language === 'zh' ? pair.zh : pair.en
        const fallback = language === 'zh' ? pair.en : pair.zh
        const preferredList = Array.isArray(preferred) ? preferred : []
        list = preferredList.length > 0 ? preferredList : (Array.isArray(fallback) ? fallback : [])
      } else return undefined
      const lines = list.map((entryLine) => helpLine(entryLine, language)).filter((entryLine): entryLine is string => entryLine !== undefined)
      return lines.length > 0 ? lines : undefined
    }
    const entry: TerminalHelpWorkflow = {
      title: helpLine((block as Record<string, unknown>).title, language) ?? 'Usage',
    }
    const summary = helpLine((block as Record<string, unknown>).summary, language)
    if (summary !== undefined) entry.summary = summary
    const ui = surface('ui')
    const cli = surface('cli')
    const tips = surface('tips')
    if (ui !== undefined) entry.ui = ui
    if (cli !== undefined) entry.cli = cli
    if (tips !== undefined) entry.tips = tips
    if (ui === undefined && cli === undefined && tips === undefined) continue
    out.push(entry)
  }
  return out
}

/** 每条节点各自的终端面名字；不给就按 `x<nodeId>` 推。 */
export interface TerminalHelpOptions {
  /** 终端面的语言；不给就是 `en`（沿用加这一步之前的输出形状，既有测试与包不受影响）。 */
  language?: 'zh' | 'en'
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
  const language = options.language ?? 'en'
  const portedWorkflows = workflowsFromHelp(source.help, language)

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
    whenToUse: whenToUseFromHelp(source.help, language) ?? [description.en],
    workflows: portedWorkflows.length > 0 ? portedWorkflows : [
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
