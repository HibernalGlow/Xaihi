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
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandOutcome } from '@hibernalglow/xaihi-sdk'
import type { XaihiSlot } from './slots.ts'
import { LOCALE_NAMESPACE, en, zh, type LocaleKey, type Translate } from './locales.ts'
import { MAIN_PANEL_KEY, registerPanelEntry } from './panel-entry.tsx'
import { createRemoteLoader } from './loader/remote-modules.ts'
import { registerStyles } from './styles.ts'
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
export const inject = ['slots', 'locale', 'remote', 'remote.commands']

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
        hostFacts: JSON.stringify(remote?.hostFacts ?? null),
      }
  } catch (error) {
    report = { present: false, reason: error instanceof Error ? error.message : String(error) }
  }
  target.__XAIHI__ = { ...(target.__XAIHI__ ?? {}), remote: report }
}

/** 客户端装配挂上的命令代理。 */
type CommandsProxy = {
  /** 实测契约：routed agent + 命令行 + 提交附件，外加可选 AbortSignal。 */
  execute?: (agent: unknown, line: string, submittedAttachments: unknown[]) => unknown
}

/**
 * 把 DSH 的命令通道包成面板能用的 `runCommand`。
 *
 * 走命令而不是自建 RPC：命令是宿主认可的"不经过模型就执行"的入口，危险动作由节点自己在
 * 命令侧拒绝；Xaihi 再造一条传输就是绕开宿主的分派语义。
 *
 * 契约是量出来的，不是猜的：`execute(line)` 被客户端拒成"expected 3 business argument(s)
 * plus an optional AbortSignal"；补齐三参后请求打到网关，回 `gateway/arguments-invalid`，
 * 因为第一个参数必须是"这条命令路由给哪个 Agent"，而插件客户端在 0.2.0-rc.2 里拿不到
 * 当前 Agent 身份（`remote.hostFacts` 只有 `{isLoopback:true}`）。所以这里**如实失败**，
 * 面板显示的是宿主说的那句话。身份来源定了之后要改的只有 `agent` 这一个实参。
 * @param ctx - 客户端上下文。
 */
function makeRunCommand(ctx: Context): (line: string) => Promise<CommandOutcome> {
  const remote = (ctx as unknown as { remote?: Record<string, unknown> }).remote
  const commands = remote?.commands as CommandsProxy | undefined
  return async (line: string): Promise<CommandOutcome> => {
    if (commands === undefined || typeof commands.execute !== 'function') {
      return { ok: false, reason: 'remote.commands.execute is unavailable in this host assembly' }
    }
    const agent = (ctx as unknown as { agent?: unknown }).agent ?? remote?.agent
    if (agent === undefined) {
      return {
        ok: false,
        reason: 'cannot name the routed Agent: a plugin client has no current-agent handle in 0.2.0-rc.2, '
          + 'and the gateway rejects commands/execute without it (see docs/stages/step-4.md §12)',
      }
    }
    try {
      return readCommandResult(await commands.execute(agent, line, []))
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
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
