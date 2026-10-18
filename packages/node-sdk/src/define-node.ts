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
import { registerWithHost, type NodeRegistryHost, type NodeRunResult } from './node-registry.ts'

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

/**
 * `defineNode` 用到的宿主面。
 *
 * `NodeRegistryHost` 那两条（`inject` / `get`）是注册表那一格要的：注册表住在 xaihi-core
 * 那一份 SDK 拷贝里（`@hibernalglow/xaihi-sdk` 被内联进每个包，见 `NODE_REGISTRY_SERVICE`
 * 的注释），跨包共享只能经 cordis 的服务表；而 core 的 fiber 可能比节点晚激活，注册时读一次
 * 会永久读空，所以走 `inject` 的"等到位再跑、变了就重跑"。签名刻意写成宽松形状：node-sdk 的
 * peer 只有 dsh-tools，照 cordis 自己的 `Inject`／`Plugin.Function` 声明反而会在真 `Context`
 * 上不过赋值（旧版那条 `effect` 同一条理由）。
 */
export interface NodeToolContext extends NodeRegistryHost {
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

/**
 * 取消之后回给面板的那句话。
 *
 * 后半句不许省：被取消的那次调用是**不再等**处理器，不是**停得下**处理器。
 * 一个从不查 `signal.aborted` 的循环会照原样跑完，界面上说"已经停了"就是伪造
 * （ADR-0011 决定 4：可以退化，不许静默、不许假）。
 */
export const CANCELLED_MESSAGE = '已取消：这次调用不再等待结果。该节点若没在实现里查 signal.aborted，它的工作可能仍在继续。'

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
  /**
   * 覆盖注册表条目里的执行派发（`NodeRegistry.run` 优先走这一条）。
   *
   * 为什么在选项里而不是让节点自己 `nodeRegistry.get(id).execute = …`：注册现在可能发生在
   * core 提供服务之后（`inject`），装载当时那条条目还没进表，后置改写会静默不落地。
   */
  execute?: (input: unknown, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
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
 *
 * **两种调用者说的是两种名字**，这条缝必须都认：
 * - 模型/工具面给的是**字段 id**（`parametersFor` 就是按 `field.id` 生成参数表的）；
 * - 界面/命令面给的是**槽位名**（搬来的 `Component.tsx` 直接组内核形状：cleanf 发
 *   `{ paths: [...], preview: true }`，而清单里那两条绑定是 `pathsText→paths`）。
 *
 * 字段 id 优先；字段缺席而已给的槽位名是另一个名字时**原样采纳**那个值，不再做第二次变换。
 * 不这么写的症状是"界面上填的一切被悄悄清空"：`bindInputs` 从缺席的字段 id 绑出一个空值，
 * 调用方那句 `{ ...raw, ...bindInputs(...) }` 再用它覆盖掉界面真发过来的槽位——实测 cleanf
 * 界面发 `paths: ['/Users/glow/Downloads']` 时内核回 `No valid paths provided.`，同一份输入
 * 换成 `pathsText` 就扫出 9 项。
 *
 * @param definition - 已校验的节点定义。
 * @param args - 调用方给的参数（字段 id 形状或槽位名形状）。
 */
export function bindInputs(definition: NodeDefinition, args: Record<string, unknown>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  // `inputBindings` 在归一化类型里是必填，但校验器是把原值直接交回去的（`node.ts:405` 的
  // `value: raw as unknown as NodeDefinition`），所以清单没写这一格的节点到这里是 `undefined`。
  // 症状否则是第一次动作 500 一句 `is not iterable`，而插件装载失败时宿主只留下 "failed to import"。
  const bindings = definition.inputBindings ?? []
  for (const binding of bindings) {
    const fromField = args[binding.fieldId]
    // 字段 id 与槽位名同名时这两个分支重合，取谁都不变 ⇒ 同一名字那一批调用者的行为一字未动。
    inputs[binding.slot] = fromField === undefined && args[binding.slot] !== undefined
      ? args[binding.slot]
      : transformValue(fromField, binding.transform ?? 'identity')
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
  /**
   * 运行一个动作并返回结构化的 NodeRunResult，捕获并透传 `run.resultView` 载荷。
   */
  run(actionId: string, args?: Record<string, unknown>, onEvent?: (event: unknown) => void): Promise<NodeRunResult>
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
      const inputs = { ...raw, ...bindInputs(definition, raw) }
      const result = await handler({ args: raw, inputs, run })
      journal?.finish(run.runId)
      return result
    } catch (error) {
      journal?.fail(run.runId, error instanceof Error ? error.message : String(error))
      // 原样抛出：把失败咽成一次成功输出，症状会是"面板显示了空结果"。
      throw error
    }
  }

  /** 一次动作调用并返回结构化结果：开运行、绑输入、跑实现、捕获 resultView 并结算。 */
  const runAction = async (
    actionId: string,
    raw: Record<string, unknown> = {},
    onEvent?: (event: unknown) => void,
  ): Promise<NodeRunResult> => {
    const handler = options.handlers[actionId]
    if (handler === undefined) {
      return { success: false, message: `xaihi.node/v1: no handler for action "${actionId}"` }
    }
    const journal = resolve()
    if (journal === undefined) warnNoJournal()
    const baseRun = journal?.open({ nodeId: definition.nodeId, actionId }) ?? NULL_RUN
    let capturedResultView: unknown = undefined
    const run: OperationRun = {
      runId: baseRun.runId,
      signal: baseRun.signal,
      progress: (p) => {
        baseRun.progress(p)
        try {
          const percent = typeof p.total === 'number' && p.total > 0 ? Math.round((p.done / p.total) * 100) : p.done
          onEvent?.({ type: 'progress', progress: percent, ...p })
        } catch {}
      },
      preview: (payload) => {
        baseRun.preview(payload)
        try {
          // `preview` 的载荷形状**由节点自己决定**（`operations.ts:152` 就是 `unknown`），
          // 所以这里必须先收窄再取 `message`——直接 `p.message` / `...p` 会让本文件的
          // typecheck 在 HEAD 上就红（TS18046 / TS2698）。
          const record = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
          const message = record.message
          onEvent?.({ type: 'log', message: typeof message === 'string' ? message : String(message ?? ''), ...record })
        } catch {}
      },
      resultView: (payload) => {
        capturedResultView = payload
        baseRun.resultView(payload)
      },
      checkpoint: (p) => { baseRun.checkpoint(p) },
    }
    const inputs = { ...raw, ...bindInputs(definition, raw) }
    /*
     * 取消必须**立刻**结算，不能等处理器自己停下来。
     *
     * 为什么用 race 而不是只把 `signal` 递进去：递进去只是"这个节点可以选择理会"，
     * 而一个不查 `signal.aborted` 的循环会让面板在取消之后继续转圈——那正好是这次改动
     * 要修的病（`NodeRegistry.cancel` 之前是个无条件 return false 的桩，取消既停不下工作
     * 也读不回来）。race 之后：理会的节点干净停下，不理会的这一侧也立刻读到"已取消"，
     * 而文案照实说它可能还在跑——不伪造"已经停了"。
     */
    const pending = handler({ args: raw, inputs, run })
    // 被取消那一侧迟到的失败不再有人在等，但必须有人接：不然它变成 unhandled rejection。
    pending.catch(() => undefined)
    const cancelled = new Promise<'cancelled'>((resolve) => {
      if (baseRun.signal.aborted) resolve('cancelled')
      else baseRun.signal.addEventListener('abort', () => { resolve('cancelled') }, { once: true })
    })
    try {
      const raced = await Promise.race([pending, cancelled])
      if (raced === 'cancelled') {
        // 账本里那条 `failed（已取消）` 由 `journal.cancel` 记——按下中止键的那一侧才是它的作者。
        return {
          success: false,
          message: CANCELLED_MESSAGE,
          data: capturedResultView,
          runId: baseRun.runId,
        }
      }
      journal?.finish(baseRun.runId)
      return {
        success: true,
        message: raced,
        data: capturedResultView,
        runId: baseRun.runId,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      journal?.fail(baseRun.runId, errorMessage)
      return {
        success: false,
        message: errorMessage,
        data: capturedResultView,
        runId: baseRun.runId,
      }
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

  const handle: NodeHandle = { invoke, run: runAction }

  // 登记到**宿主那一份**注册表，打通本地 Runner 通道。
  //
  // 注销器必须挂在注入出来的那条 fiber 上：core 卸载 ⇒ 服务消失 ⇒ 这一条跟着撤，插件热更 ⇒
  // 回调重跑并重新注册。留在表里就等于"停用的节点还在跑"（`ctx.tools.register` 由 dsh-tools
  // 自己 effect 化，这一条没有兜底）。
  registerWithHost(ctx, (registry) => registry.register({
    nodeId: definition.nodeId,
    definition,
    handlers: options.handlers,
    invoke,
    run: runAction,
    // 取消按在账本上：它才知道这条 runId 此刻还在跑，也是它把 `failed（已取消）` 记进账的。
    // 没装 xaihi-core 时 `resolve()` 永远空 ⇒ 这一格回 false，界面读到的是"取消不了"，
    // 而不是一个把"没接上"洗成"已取消"的 true。
    cancelRun: (runId: string) => resolve()?.cancel(runId, `已取消：${definition.nodeId}/${runId}`) ?? false,
    inFlightRuns: () => (resolve()?.runs() ?? [])
      .filter((run) => run.nodeId === definition.nodeId && run.outcome === 'running')
      .map((run) => run.runId),
    ...(options.execute === undefined ? {} : { execute: options.execute }),
  }))

  // 注意：`invoke` 不走 `tools/pre-execute`，所以它绕过了危险闸门。
  // 非模型入口（命令、面板按钮）必须自己先问 `dangerFor`，别把危险动作接到它上面。
  return handle
}

