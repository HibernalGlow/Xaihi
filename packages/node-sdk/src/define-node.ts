/**
 * `defineNode` —— 把一份 `xaihi.node/v1` 定义接到 DSH 的工具与危险闸门上。
 *
 * 边界：本模块只产出 `ask` / `deny` 判定；审批渠道、审计与提示 UI 全部是 DSH 的
 * （`tools/pre-execute` 返回 `ask` 后由 `ctx.get('approval')` 那条缝解析，没有
 * ApprovalService 时按 DSH 规则降级为拒绝）。Xaihi 不重造审批系统。
 *
 * 参数表按动作生成：可见性条件与危险闸门共用 `conditions.ts` 那一个求值器，否则
 * 模型看到的参数和界面看到的字段会分叉。
 *
 * 每次调用都开一条运行（`started` / `finished` / `failed` 自动补），动作实现经
 * `call.run` 上报 `progress` / `preview` / `result_view`。没有 xaihi-core 时
 * `journal` 缺省，进度上报是无操作而不是失败——节点必须能脱离工作台单独装。
 *
 * @module xaihi-sdk/define-node
 */

import { defineTool, type ParameterPropertySpec, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { validateNodeDefinition, type NodeDefinition, type NodeField, type NodeTransform } from './node.ts'
import { matchCondition } from './conditions.ts'
import { NULL_RUN, type OperationJournal, type OperationRun } from './operations.ts'

/**
 * 工具参数表。直接用 dsh-tools 的类型而不是长得像的本地副本：它的参数面带
 * `[key: symbol]: never` 的索引签名，本地 Record 既过不了赋值，也会在对方扩面时
 * 悄悄分叉。
 */
export type ParameterSpec = ParameterSchemaSpec

/** pre-execute 的判定，形状对齐 @deepseek-ai/dsh-tools 的 `PreToolDecision`。 */
export type PreDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'cancel' }
  | { kind: 'ask'; reason?: string; displayReason?: { en: string } & Record<string, string> }

/** 被拦到的那一次调用的身份子集。 */
export interface ExecInfo {
  name: string
  arguments: unknown
}

/** `defineNode` 用到的宿主面。 */
export interface NodeToolContext {
  tools: { register(definition: unknown): unknown }
  on(event: 'tools/pre-execute', listener: (exec: ExecInfo, next: () => Promise<PreDecision>) => Promise<PreDecision>): unknown
}

/** 一次动作调用的入参：原始参数 + 按 inputBindings 绑好的执行输入 + 本次运行的上报句柄。 */
export interface NodeCall {
  args: Record<string, unknown>
  inputs: Record<string, unknown>
  run: OperationRun
}

/** 一个动作的实现。 */
export type NodeActionHandler = (call: NodeCall) => Promise<string>

/** 动作 id → 实现。 */
export type NodeHandlers = Record<string, NodeActionHandler>

/** 账本的给出方式：实例，或每次调用现取的取用器。 */
export type JournalSource = OperationJournal | (() => OperationJournal | undefined)

/** 注册选项。 */
export interface DefineNodeOptions {
  /** `package.json#xaihi.node` 的原始值，内部先校验再接线。 */
  definition: unknown
  handlers: NodeHandlers
  /** `danger.type === 'pluginExport'` 时由节点导出的判定函数。 */
  dangerCheck?: (args: Record<string, unknown>) => boolean
  /**
   * xaihi-core 提供的运行账本；缺失时进度上报退化为无操作。
   *
   * 插件与 core 的 fiber 谁先激活不由插件决定，所以在注册时读一次会永久读空。
   * 传取用器（`() => ctx.get(OPERATIONS_SERVICE)`）才是对的接法。
   */
  journal?: JournalSource
}

function fieldProperty(field: NodeField): ParameterPropertySpec {
  const description = `${field.label.en} / ${field.label.zh}`
  // 上游的 `GuardedRule`：规则本体在 `rule.rule` 里。带 `when` 的条件规则**不算**必填——
  // 只在条件成立时才检查的规则，不能把参数永久标成 required（那会让模型看到一份比界面更严的参数表）。
  const required = (field.rules ?? []).some((entry) =>
    entry.when === undefined && (entry.rule.type === 'required' || entry.rule.type === 'nonBlank'))
  switch (field.kind) {
    case 'text':
    case 'multiline':
      return required ? { type: 'string', description, required: true } : { type: 'string', description }
    case 'path-list':
      return required
        ? { type: 'array', items: { type: 'string' }, description, required: true }
        : { type: 'array', items: { type: 'string' }, description }
    case 'number':
      return required ? { type: 'number', description, required: true } : { type: 'number', description }
    case 'boolean':
      return required ? { type: 'boolean', description, required: true } : { type: 'boolean', description }
    case 'select': {
      const values = (field.options ?? []).map((option) => option.value)
      return required ? { type: 'string', description, enum: values, required: true } : { type: 'string', description, enum: values }
    }
  }
}

/**
 * 生成某个动作的参数表。
 * @param definition - 已校验的节点定义。
 * @param actionId - 当前动作；动作选择器本身不进参数表。
 * @returns 该动作可见的字段参数表。
 */
export function parametersFor(definition: NodeDefinition, actionId: string): ParameterSpec {
  const selector = definition.fields.find((field) => field.isActionSelector === true)
  const args: Record<string, unknown> = selector === undefined ? {} : { [selector.id]: actionId }
  const spec: ParameterSpec = {}
  for (const field of definition.fields) {
    if (field.isActionSelector === true) continue
    if (!matchCondition(field.visible, args, actionId)) continue
    spec[field.id] = fieldProperty(field)
  }
  return spec
}

/** 应用一种绑定变换。 */
export function transformValue(value: unknown, transform: NodeTransform): unknown {
  // "没给"与"给了空串"必须是两件事：`asText` 把两者都折成 ''，于是省略一个可选字段
  // 与显式清空它是同一个值。这一折在下面两条 transform 里是有后果的：
  // `trim` 把省略折成 ''，`asBoolean` 把省略折成 false ——
  // 而本文件 `fieldSchemaFor` 的注释写着"缺省 ⇒ 不占位（undefined 传下去，内核与 settings 兜底）"，
  // 那些兜底分支因此永远走不到（bitv 少给 transferMode 会走 move 那条 link+unlink；
  // rawfilter 少给 trashOnly 会让使用者的 settings 键形同装饰）。
  // 所以 transform 先问"这个绑定今天到底给了没有"，没给就原样把 undefined 传下去。
  const absent = value === undefined || value === null
  const asText = (input: unknown): string => typeof input === 'string' ? input : input === undefined || input === null ? '' : String(input)
  switch (transform) {
    case 'identity':
      return value
    case 'trim':
      return absent ? undefined : asText(value).trim()
    case 'trimOrOmit': {
      const trimmed = asText(value).trim()
      return trimmed === '' ? undefined : trimmed
    }
    case 'lines':
      return asText(value).split('\n').map((line) => line.trim()).filter((line) => line !== '')
    case 'delimited':
      return asText(value).split(',').map((part) => part.trim()).filter((part) => part !== '')
    case 'asInteger': {
      const parsed = Number.parseInt(asText(value), 10)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    case 'asBoolean':
      return absent ? undefined : value === true || asText(value).toLowerCase() === 'true' || asText(value) === '1'
  }
  return value
}

/**
 * 按 `inputBindings` 把字段值绑成执行输入。
 * @param definition - 已校验的节点定义。
 * @param args - 模型给的参数。
 */
export function bindInputs(definition: NodeDefinition, args: Record<string, unknown>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  for (const binding of definition.inputBindings) {
    inputs[binding.slot] = transformValue(args[binding.fieldId], binding.transform ?? 'identity')
  }
  return inputs
}

/**
 * 这次调用是否危险。
 * @param definition - 节点定义。
 * @param dangerCheck - `pluginExport` 型闸门的判定函数。
 * @param actionId - 本次动作。
 * @param args - 本次参数。
 * @returns 危险时给出双语原因文案。
 */
export function dangerFor(
  definition: NodeDefinition,
  dangerCheck: DefineNodeOptions['dangerCheck'],
  actionId: string,
  args: Record<string, unknown>,
): { en: string; zh: string } | undefined {
  const danger = definition.danger
  if (danger === undefined || danger.type === 'none') return undefined
  const reason = {
    en: `Node "${definition.nodeId}" · action "${actionId}" is gated as dangerous (${danger.type}).`,
    zh: `节点「${definition.nodeId}」的动作「${actionId}」被 ${danger.type} 判为危险操作。`,
  }
  const selector = definition.fields.find((field) => field.isActionSelector === true)
  switch (danger.type) {
    case 'actionIn': {
      const current = String(danger.actionField === undefined ? actionId : args[danger.actionField] ?? args[selector?.id ?? ''] ?? actionId)
      return (danger.dangerous ?? []).includes(current) ? reason : undefined
    }
    case 'fieldFlag':
      return args[danger.fieldId ?? ''] === true ? reason : undefined
    case 'all':
      return matchCondition({ type: 'all', predicates: danger.predicates }, args, actionId) ? reason : undefined
    case 'any':
      return matchCondition({ type: 'any', predicates: danger.predicates }, args, actionId) ? reason : undefined
    case 'pluginExport':
      if (dangerCheck === undefined) {
        throw new Error(`xaihi.node/v1: danger.type "pluginExport" needs defineNode({ dangerCheck }) for export "${danger.exportName ?? '?'}"`)
      }
      return dangerCheck(args) ? reason : undefined
  }
  return undefined
}

/** 工具名：`<nodeId>_<actionId>`。 */
export function toolName(definition: NodeDefinition, actionId: string): string {
  return `${definition.nodeId}_${actionId}`
}

/** `defineNode` 的返回：一套动作的调用入口。 */
export interface NodeHandle {
  /**
   * 按 `inputBindings` 绑好输入并跑一个动作，运行账目与工具路径同一套记账。
   * 命令、面板按钮这类非模型入口都走它，不要自己再开一条运行。
   * @param actionId - 节点定义里的动作 id。
   * @param args - 字段值（表单形状，不是执行槽位）。
   */
  invoke(actionId: string, args?: Record<string, unknown>): Promise<string>
}

/**
 * 注册一个节点：每个动作一个工具，外加一条把危险动作转成 `ask` 的 pre-execute 监听。
 * @param ctx - 宿主上下文（需要 `tools`）。
 * @param options - 定义、实现与可选的危险判定。
 * @returns 动作的调用入口（供命令 / UI 复用同一条路径）。
 * @throws 定义不合法时抛出全部校验问题；缺动作实现或 `pluginExport` 缺判定函数时抛配置错误。
 */
export function defineNode(ctx: NodeToolContext, options: DefineNodeOptions): NodeHandle {
  const validation = validateNodeDefinition(options.definition)
  if (!validation.ok) throw new Error(`xaihi.node/v1 invalid: ${validation.errors.join('; ')}`)
  const definition = validation.value
  const source = options.journal
  const resolve = (): OperationJournal | undefined =>
    typeof source === 'function' ? source() : source
  let warnedNoJournal = false
  const warnNoJournal = (): void => {
    if (warnedNoJournal || definition.reportsProgress !== true) return
    warnedNoJournal = true
    // 声明要报进度却没有账本，是一件必须说出来的事：否则症状是"进度条永远不动"，
    // 而没人会去查是不是宿主没装 xaihi-core。
    console.warn(`xaihi.node/v1: node "${definition.nodeId}" sets reportsProgress but no journal resolved; progress will be dropped`)
  }
  if (definition.danger !== undefined && definition.danger.type === 'pluginExport' && options.dangerCheck === undefined) {
    // 早失败：等第一次真调用才报，症状会是"这个节点偶尔能跑"。
    throw new Error(`xaihi.node/v1: node "${definition.nodeId}" declares danger.type "pluginExport" but defineNode got no dangerCheck`)
  }

  /** 一次动作调用：开运行、绑输入、跑实现、结算。工具与命令共用这一份记账。 */
  const invoke = async (actionId: string, raw: Record<string, unknown> = {}): Promise<string> => {
    const handler = options.handlers[actionId]
    if (handler === undefined) throw new Error(`xaihi.node/v1: no handler for action "${actionId}"`)
    const journal = resolve()
    if (journal === undefined) warnNoJournal()
    const run = journal?.open({ nodeId: definition.nodeId, actionId }) ?? NULL_RUN
    try {
      const result = await handler({ args: raw, inputs: bindInputs(definition, raw), run })
      journal?.finish(run.runId)
      return result
    } catch (error) {
      journal?.fail(run.runId, error instanceof Error ? error.message : String(error))
      // 原样抛出：把失败咽成一次成功输出，症状会是"面板显示了空结果"。
      throw error
    }
  }

  for (const action of definition.actions) {
    if (options.handlers[action.id] === undefined) throw new Error(`xaihi.node/v1: no handler for action "${action.id}"`)
    ctx.tools.register(defineTool({
      name: toolName(definition, action.id),
      description: `${definition.title.en} · ${action.label.en} — ${action.description?.en ?? definition.description.en}`,
      parameters: parametersFor(definition, action.id),
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: (args) => invoke(action.id, (args ?? {}) as Record<string, unknown>),
    }))
  }

  if (definition.danger !== undefined && definition.danger.type !== 'none') {
    const names = new Set(definition.actions.map((action) => toolName(definition, action.id)))
    ctx.on('tools/pre-execute', async (exec, next) => {
      if (!names.has(exec.name)) return next()
      const actionId = exec.name.slice(exec.name.lastIndexOf('_') + 1)
      const reason = dangerFor(definition, options.dangerCheck, actionId, (exec.arguments ?? {}) as Record<string, unknown>)
      if (reason === undefined) return next()
      return { kind: 'ask', reason: reason.en, displayReason: { en: reason.en, zh: reason.zh } }
    })
  }

  // 注意：`invoke` 不走 `tools/pre-execute`，所以它绕过了危险闸门。
  // 非模型入口（命令、面板按钮）必须自己先问 `dangerFor`，别把危险动作接到它上面。
  return { invoke }
}
