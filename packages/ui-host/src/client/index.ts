/**
 * Xaihi 工作台浏览器半边。
 *
 * 依赖纪律沿用模板那一条：本半边不 value-import 任何宿主侧包，harness 客户端包
 * 只以 `import type` 出现（拉进 Context 与插槽表的声明合并，类型擦除后不产生模块
 * 请求）。React 来自浏览器模块表的 seed，是唯一实例。
 *
 * 与 DSH API 的关系：`ctx.slots.inject('main', …)` 等 `main` 被 ui-layout 声明后
 * 才注册（直接 register 到未声明槽会抛），注册的 `key` 即 `ctx.layout.selectPanel`
 * 接受的面板 id；`children` 的键就是 Xaihi 自己声明的插槽，贡献者同样必须用
 * `ctx.slots.inject`。面板组件的 props 直接用框架的 `Props*` 类型，不自己手写形状：
 * 手写会在 `exactOptionalPropertyTypes` 下与 `RenderSlotFn` 的方差打架。
 *
 * @module xaihi-ui/client
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandOutcome } from '@hibernalglow/xaihi-sdk'
import type { XaihiSlot } from './slots.ts'
import { LOCALE_NAMESPACE, en, zh, type LocaleKey, type Translate } from './locales.ts'
import { MAIN_PANEL_KEY, registerPanelEntry } from './panel-entry.tsx'
import { createRemoteLoader } from './loader/remote-modules.ts'
import { registerStyles } from './styles.ts'
import { xaihiMd3Layer } from './theme/material-you.ts'
import { WorkspaceRoot } from './workspace.tsx'

/** Xaihi 声明的插槽，`children` 与 props 类型共用这一份。 */
const CHILDREN = {
  'xaihi.toolbar': { kind: 'list', scope: 'root' },
  'xaihi.status': { kind: 'list', scope: 'root' },
  'xaihi.panel.action': { kind: 'list', scope: 'root' },
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Xaihi 工作台自身的文案。 */
    'xaihi.ui': LocaleKey
  }
}

/**
 * 本插件依赖的服务。
 *
 * `remote` 与 `remote.commands` 必须**显式声明**：实测读 `ctx.remote` 或
 * `ctx.get('remote').commands` 都抛 `cannot get property "remote.commands" without inject`，
 * DSH 侧的说法一致（`docs/api-gateway.md`：读 `ctx.remote.<namespace>` 的包要在自己的
 * inject 里同时声明 `remote` 与 `remote.<namespace>`）。命令命名空间是客户端装配
 * 现成挂着的（`dsh-api-remotes` 生成物里带 `commands/lib/typert.remote-client.js`）。
 */
export const inject = ['slots', 'locale', 'theme', 'remote', 'remote.commands']

/** 插槽框架交给面板组件的属性（框架真源，只取用到的两片）。 */
type ReceivedProps = PropsLocale<'xaihi.ui'> & PropsRenderSlots<XaihiSlot>

/** 当前界面语言；面板按它挑文案，缺省走英文。 */
function activeLocale(ctx: Context): 'zh' | 'en' {
  const snapshot = ctx.locale.getSnapshot()
  return typeof snapshot.active === 'string' && snapshot.active.startsWith('zh') ? 'zh' : 'en'
}

/** 一个对象实际能调什么：自有属性加一层原型方法名。 */
function surfaceOf(value: object): string[] {
  const names = new Set<string>(Object.keys(value))
  const proto = Object.getPrototypeOf(value) as object | null
  if (proto !== null && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) if (key !== 'constructor') names.add(key)
  }
  return [...names].sort()
}

/** 客户端装配里可能承载"当前会话/Agent 身份"的服务名，全部按存在性问一遍。 */
const IDENTITY_CANDIDATES = ['agent', 'agentId', 'session', 'sessionId', 'sessions', 'activeSession', 'scope', 'store', 'chat', 'conversation'] as const

/**
 * 身份来源只能问运行时：`commands/execute` 的第一个参数按网关约定映射成 `agentId`
 * （`docs/api-gateway.md:11`），但插件客户端能从哪个服务拿到它，文档没写。
 * 这里把候选名逐个 `ctx.get()`，把"实际给了什么"记下来。
 * @param ctx - 客户端上下文。
 * @returns 每个候选名对应的形状字符串，取不到的一律 `absent`。
 */
function probeIdentity(ctx: Context): Record<string, string> {
  const facts: Record<string, string> = {}
  for (const name of IDENTITY_CANDIDATES) {
    try {
      const value = ctx.get(name as never) as unknown
      if (value === undefined || value === null) {
        facts[name] = 'absent'
        continue
      }
      if (typeof value !== 'object') {
        facts[name] = `${typeof value}:${String(value).slice(0, 40)}`
        continue
      }
      const keys = Object.keys(value as Record<string, unknown>).slice(0, 12).join(',')
      facts[name] = `object{${keys}}`
    } catch (error) {
      facts[name] = `threw:${error instanceof Error ? error.message : String(error)}`
    }
  }
  return facts
}

/**
 * 「这条命令路由给哪个 Agent」的实测读法。
 *
 * 只记录、不猜：面板要动宿主就必须能看见"宿主到底给了我什么身份"。两条路都试过：
 * 属性读 `ctx.agent` 被代理拒成 `cannot get property "agent" without inject`（把 `agent`
 * 写进 inject 风险更大——装配里没有这个服务时整个插件都起不来），所以取用器优先，
 * 属性读只作兜底。读不到就照实写原因。
 * @param ctx - 客户端上下文。
 * @returns 身份是否存在、它实际是什么形状，以及取用的失败原因。
 */
function resolveAgent(ctx: Context): { present: boolean; value?: unknown; reason: string; shape: Record<string, unknown> } {
  const attempts: string[] = []
  let raw: unknown
  for (const name of ['agentId', 'agent', 'sessionId', 'session'] as const) {
    try {
      const value = ctx.get(name as never) as unknown
      attempts.push(`${name}=${value === undefined || value === null ? 'absent' : typeof value}`)
      if (value !== undefined && value !== null) {
        raw = value
        break
      }
    } catch (error) {
      attempts.push(`${name} threw: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (raw === undefined) {
    try {
      raw = (ctx as unknown as { agent?: unknown }).agent
      attempts.push('ctx.agent')
    } catch (error) {
      attempts.push(`ctx.agent threw: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (raw === undefined || raw === null) {
    return { present: false, reason: `no Agent identity reachable (${attempts.join('; ')})`, shape: { attempts } }
  }
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') {
    return { present: true, value: raw, reason: '', shape: { attempts, kind: typeof raw, value: String(raw) } }
  }
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  return {
    present: true,
    // 网关要的是 wire 上的 `agentId`，对象带 id 时就送 id，而不是把一个宿主对象塞进 RPC。
    value: id ?? raw,
    reason: '',
    shape: { attempts, kind: 'object', keys: Object.keys(record).slice(0, 24), id },
  }
}

/** 身份只影响 `execute` 的第一个实参；其余方法先量出形状。 */
const COMMAND_METHODS = ['list', 'execute', 'has', 'methods', 'namespace', 'invokeRemote', 'install'] as const

/**
 * 量命令代理的方法表，并只读地试一次 `list()`。
 *
 * 为什么试 `list`：它是纯读，不会改变任何状态，却能一次回答"这个装配让不让插件客户端
 * 走命令通道、要不要身份"。`execute` 不能这样试——它会真分派一条命令。
 * @param commands - `remote.commands` 代理。
 * @returns 每个方法的类型与形参个数，外加 `list` 的实测结果摘要。
 */
function probeCommandMethods(commands: Record<string, unknown>): Record<string, unknown> {
  const table: Record<string, unknown> = {}
  for (const name of COMMAND_METHODS) {
    const value = commands[name]
    table[name] = typeof value === 'function' ? `fn/arity ${(value as { length?: number }).length ?? -1}` : typeof value
  }
  const list = commands.list as ((...args: unknown[]) => unknown) | undefined
  if (typeof list === 'function') {
    try {
      const outcome = list()
      if (outcome instanceof Promise) {
        table.listCall = 'pending'
        const target = globalThis as { __XAIHI__?: Record<string, unknown> }
        void outcome.then(
          (value) => {
            const report = (target.__XAIHI__?.remote ?? {}) as Record<string, unknown>
            report.listResult = JSON.stringify(value)?.slice(0, 240) ?? 'undefined'
          },
          (error) => {
            const report = (target.__XAIHI__?.remote ?? {}) as Record<string, unknown>
            report.listResult = `rejected: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.slice(0, 240)
          },
        )
      } else {
        table.listCall = JSON.stringify(outcome).slice(0, 160)
      }
    } catch (error) {
      table.listCall = `threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.slice(0, 220)
    }
  }
  return table
}

/**
 * 量 `remote` 代理自身的调用入口。
 *
 * 关心 `invokeSelected` 的理由只有一个：如果它按"当前选中的 Agent"来分派，插件就不必
 * 自己持有身份。这只能用运行时回答，所以先记下形状，再只读地试一次 `commands/list`
 * （纯读；`execute` 不能这样试，它会真分派一条命令）。
 * @param remote - `ctx.remote` 代理。
 * @returns 各入口的类型/形参个数，外加那次只读尝试的结果。
 */
function probeRemoteInvokers(remote: Record<string, unknown>): Record<string, unknown> {
  const table: Record<string, unknown> = {}
  for (const name of ['invoke', 'invokeMethod', 'invokeSelected', 'prepareInvocation', 'openRemoteStream', 'enqueue'] as const) {
    const value = remote[name]
    table[name] = typeof value === 'function' ? `fn/arity ${(value as { length?: number }).length ?? -1}` : typeof value
  }
  const selected = remote.invokeSelected as ((...args: unknown[]) => unknown) | undefined
  if (typeof selected === 'function') {
    try {
      const outcome = selected('commands', 'list', [])
      if (outcome instanceof Promise) {
        table.selectedList = 'pending'
        const target = globalThis as { __XAIHI__?: Record<string, unknown> }
        void outcome.then(
          (value) => {
            const report = (target.__XAIHI__?.remote ?? {}) as Record<string, unknown>
            report.selectedListResult = JSON.stringify(value)?.slice(0, 240) ?? 'undefined'
          },
          (error) => {
            const report = (target.__XAIHI__?.remote ?? {}) as Record<string, unknown>
            report.selectedListResult = `rejected: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.slice(0, 240)
          },
        )
      } else {
        table.selectedList = JSON.stringify(outcome).slice(0, 200)
      }
    } catch (error) {
      table.selectedList = `threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.slice(0, 240)
    }
  }
  return table
}

/**
 * 把客户端命令通道的**真实形状**记进 observatory。
 *
 * 存在的理由：`remote` 提供哪些命名空间、方法要几个参数，都是装配决定的，文档与类型
 * 说的是上游选择的结果。"这台宿主到底让不让面板用命令通道"只能问运行时。
 * @param ctx - 客户端上下文。
 */
function recordRemoteShape(ctx: Context): void {
  const target = globalThis as { __XAIHI__?: Record<string, unknown> }
  let report: Record<string, unknown> = { present: false }
  try {
    const remote = (ctx as unknown as { remote?: Record<string, unknown> }).remote
    const commands = remote?.commands as Record<string, unknown> | undefined
    report = commands === undefined || commands === null
      ? { present: false, reason: 'remote.commands did not resolve' }
      : {
        present: true,
        namespaces: remote === undefined ? [] : surfaceOf(remote),
        commands: surfaceOf(commands),
        methods: probeCommandMethods(commands),
        hostFacts: JSON.stringify(remote?.hostFacts ?? null),
        // 装配实际挂了哪些 Remote 命名空间（不是代理自身的属性名）。
        mounted: Object.keys((remote as { namespaces?: Record<string, unknown> })?.namespaces ?? {}),
        invokers: remote === undefined ? {} : probeRemoteInvokers(remote),
        agent: resolveAgent(ctx).shape,
        identity: probeIdentity(ctx),
      }
  } catch (error) {
    report = { present: false, reason: error instanceof Error ? error.message : String(error) }
  }
  target.__XAIHI__ = { ...(target.__XAIHI__ ?? {}), remote: report }
}

/** 客户端装配挂上的命令代理。 */
type CommandsProxy = {
  /** 实测契约：routed agent + 命令行 + 提交附件，外加可选 AbortSignal。 */
  execute?: (agent: unknown, line: string, submittedAttachments: unknown[], signal?: AbortSignal) => unknown
}

/** 一次命令调用的上界：宿主不返回时必须变成看得见的失败。 */
const COMMAND_TIMEOUT_MS = 8000

/**
 * 把 DSH 的命令通道包成面板能用的 `runCommand`。
 *
 * 走命令而不是自建 RPC：命令是宿主认可的"不经过模型就执行"的入口，危险动作由节点自己在
 * 命令侧拒绝；Xaihi 再造一条传输就是绕开宿主的分派语义。
 *
 * 契约是量出来的，不是猜的：`execute(line)` 被客户端拒成"expected 3 business argument(s)
 * plus an optional AbortSignal"；第一个参数是"这条命令路由给哪个 Agent"。本机实测
 * （`docs/stages/step-4.md §12/§18`）：身份拿不到时如实失败；身份拿到时宿主会**不返回**，
 * 于是面板的所有按钮被 `busy` 卡死。所以这里给调用加了上界并透传真 `AbortSignal`——
 * 超时是可见失败，不是静默降级。身份来源定了之后要改的只有 `agent` 这一个实参。
 * @param ctx - 客户端上下文。
 */
function makeRunCommand(ctx: Context): (line: string) => Promise<CommandOutcome> {
  const remote = (ctx as unknown as { remote?: Record<string, unknown> }).remote
  const commands = remote?.commands as CommandsProxy | undefined
  return async (line: string): Promise<CommandOutcome> => {
    if (commands === undefined || typeof commands.execute !== 'function') {
      return { ok: false, reason: 'remote.commands.execute is unavailable in this host assembly' }
    }
    const identity = resolveAgent(ctx)
    if (!identity.present) {
      return { ok: false, reason: `${identity.reason} (see docs/stages/step-4.md §12)` }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, COMMAND_TIMEOUT_MS)
    try {
      const call = Promise.resolve(commands.execute(identity.value, line, [], controller.signal))
      // 上限一到就报，而不是让 await 永远悬着：悬着的症状是"整排按钮变灰"。
      const bound = new Promise<never>((_resolve, reject) => {
        setTimeout(() => { reject(new Error(`commands/execute did not settle within ${String(COMMAND_TIMEOUT_MS)}ms`)) }, COMMAND_TIMEOUT_MS + 250)
      })
      return readCommandResult(await Promise.race([call, bound]))
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 把远程返回值收成文本；业务侧 `kind:'error'` 与网关侧 `ok:false` 都算失败。 */
export function readCommandResult(result: unknown): CommandOutcome {
  if (typeof result === 'string') return { ok: true, text: result }
  if (typeof result === 'object' && result !== null) {
    const record = result as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text : JSON.stringify(record, null, 2)
    if (record.kind === 'error' || record.ok === false) return { ok: false, reason: text }
    return { ok: true, text }
  }
  return { ok: true, text: String(result) }
}

export function apply(ctx: Context): void {
  recordRemoteShape(ctx)
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'xaihi-ui: dictionaries')
  ctx.effect(() => registerStyles(), 'xaihi-ui: styles')
  // Material You 只叠一层别名；明暗模式与切换归 ctx.theme，本包不造第二套引擎。
  ctx.effect(() => ctx.theme.overrideTokens('xaihi.md3', xaihiMd3Layer()), 'xaihi-ui: material you layer')

  // 侧栏那一行由 ui-sidebar 持有：显示标题、响应点击、调用 selectPanel 都是它的事，
  // 本插件只贡献标记与行标题，所以这里既不碰路由也不碰布局。
  registerPanelEntry(ctx, ctx.locale.bind(LOCALE_NAMESPACE) as Translate)

  const runCommand = makeRunCommand(ctx)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: MAIN_PANEL_KEY,
    locale: LOCALE_NAMESPACE,
    children: CHILDREN,
  }, (props: ReceivedProps) => WorkspaceRoot({
    t: props.t as Translate,
    locale: activeLocale(ctx),
    renderSlot: (key) => props.renderSlot(key, {}),
    runCommand,
  })))
}

/** 装载器构造入口，导出以便测试直接拿到远程模块后端。 */
export { createRemoteLoader }
