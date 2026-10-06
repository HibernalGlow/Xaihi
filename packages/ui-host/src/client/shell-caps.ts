/**
 * 把 DSH 客户端那侧真给得出的东西，折成桥的外壳能力面。
 *
 * 为什么单独一个文件：`bridge-shell` 收的是**注入的面**（它不该认识 ctx），
 * 而"哪条动词对应 DSH 的哪个远程方法"这件事必须有个唯一记录处，
 * 否则下一次有人加一条能力就会顺手写一个能调但什么都不做的实现。
 *
 * 出处（都读自本机的 0.2.0-rc.2 装机产物，不是猜的）：
 * - `ctx.remote.settings` 的成员与返回：`@deepseek-ai/dsh-api-settings-controller`
 *   的 `lib/typert.remote-client.d.ts:18-23` —— `describe` / `mutate` / `openSettingsDocument`
 *   / `replace` / `update`，命名空间键 `settings`；每个都返回 `RemoteResult<T>`。
 * - `RemoteResult<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }`
 *   （`@deepseek-ai/dsh-typert-protocol` 的 `lib/types/index.d.ts`）。
 *   ⇒ 不拆这个信封就等于把一条失败当成功交给文档，所以拆它这件事本身要有测试。
 * - 主题偏好：`@deepseek-ai/dsh-client-ui-theme` 的 `Config.preference` 是
 *   `'light' | 'dark' | 'system'` 的 Volatile —— 那是**偏好**不是已定值，
 *   `system` 要靠文档所在环境的 `matchMedia` 才落得成上游 `env.theme` 要的两种值。
 *
 * 一条明确的"没给"：`runner` 组不接。面板那侧拿不到 `agentId`
 * 是 0.2.0-rc.2 的实测缺口（`docs/upstream-proposals.md` 的 P1），
 * 所以桥的握手会把它报成带原因的退化，而不是给一个调了什么都不发生的 run。
 *
 * @module xaihi-ui/shell-caps
 */

import type { BridgeEnv, NodeCapabilityId, SettingsPathOp, ShellCapabilities } from '@hibernalglow/xaihi-sdk/bridge'

/** 装配侧要的那份远程面的形状（导出给 index.ts 断言用）。 */
export type RemoteSettingsFace = RemoteLike

/** 只用到 `RemoteResult` 的两支，形状自己声明以免把整个 typert 类型拉进来。 */
type RemoteLike = { describe(): Promise<unknown>, update(ns: string, patch: Record<string, unknown>, revision: number | undefined): Promise<unknown>, mutate?(ns: string, ops: readonly SettingsPathOp[], revision: number | undefined): Promise<unknown>, openSettingsDocument?(signal?: AbortSignal): Promise<unknown> }

/** 拆 `RemoteResult`：失败必须抛出带 reason 的错误，让桥原样转给文档，而不是静默返回 undefined。 */
async function unwrap<T>(call: Promise<unknown>): Promise<T> {
  const result = (await call) as { ok?: boolean, value?: T, error?: { code?: unknown, message?: unknown, reason?: unknown } }
  if (result && result.ok === true) return result.value as T
  const failure = result?.error
  const reason = typeof failure === 'object' && failure !== null
    ? String(failure.code ?? failure.reason ?? 'remote-failure')
    : 'remote-failure'
  const detail = typeof failure === 'object' && failure !== null ? String(failure.message ?? '') : ''
  throw Object.assign(new Error(`${reason}${detail ? `: ${detail}` : ''}`), { reason, detail })
}

export interface ShellCapsInput {
  /** `ctx.remote.settings`；读不到时整个设置面不给（⇒ 文档读到 refused）。 */
  settings?: RemoteLike
  /** 主题偏好，来自 `ctx.theme.config.preference`（volatile 的当前值）。 */
  preference?: 'light' | 'dark' | 'system'
  /** 解析 `system` 偏好用；一般传 `window.matchMedia`。 */
  prefersDark?: (query: string) => { matches: boolean }
  /** 组 `env.platform` 用；传 `navigator.userAgent`。 */
  userAgent?: string
  /** 覆盖某组没给时的文案，让界面上的退化原因是人话。 */
  reasons?: Partial<Record<NodeCapabilityId, string>>
}

/**
 * 解出环境快照。
 * @param input - 见 `ShellCapsInput` 的 theme 相关三项。
 * @returns 上下游要的那两格；偏好读不到时返回 undefined（宁缺勿造）。
 */
export function resolveEnv(input: ShellCapsInput): BridgeEnv | undefined {
  const { preference, prefersDark, userAgent } = input
  if (preference === undefined) return undefined
  let theme: 'light' | 'dark'
  if (preference === 'system') {
    if (typeof prefersDark !== 'function') return undefined
    theme = prefersDark('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    theme = preference
  }
  // platform 不硬写 "web"：桌面壳的 UA 里有 Electron，认出来就报 electron，认不出才回落。
  // 2026-10-06 在 3399 那台宿主上实读到的正是这条的**边界**：我用的那个内嵌浏览器本身是
  // Electron 壳，于是 `env.platform` 回的是 `electron`，而 DSH 那侧是 Node 起 web 服务。
  // 所以这一格说的是"**正在显示这份 UI 的运行时**"（上游 `NodeEnvCapability.platform` 也是这个口径：
  // 'web' | 'electron' | 'node'），不是"宿主服务器跑在哪"。节点界面按它决定 ⌘/Ctrl 这类提示时
  // 要的正是前者；要问后者的话别读这一格。
  const platform = typeof userAgent === 'string' && userAgent.includes('Electron') ? 'electron' : 'web'
  return { theme, platform }
}

/**
 * 组出桥的外壳能力面。
 * @param input - 注入的远程面与偏好读数。
 * @returns 交给 `createShellBridge` / `DocumentFrame` 的 caps。
 */
export function shellCapsFrom(input: ShellCapsInput): ShellCapabilities {
  const env = resolveEnv(input)
  const reasons: Partial<Record<NodeCapabilityId, string>> = {
    runner: '宿主侧面板拿不到 agentId（上游提案 P1），运行面没接',
    ...input.reasons,
  }
  if (input.settings === undefined) {
    return {
      ...(env ? { env } : {}),
      reasons: {
        ...reasons,
        config: '远程设置面没读到（ctx.remote.settings 不在）',
        // 状态的持久那一份也在这条面上，所以面不在时两组都要各说各的原因，
        // 而不是让文档那边只读到一句笼统的"没提供"。
        state: '远程设置面没读到，节点状态今天没有落点（上游提案 P7 的第 3 条）',
        ...input.reasons,
      },
    }
  }
  const remote = input.settings
  return {
    settings: {
      describe: () => unwrap<unknown>(remote.describe()),
      update: async (ns, patch, revision) => unwrap<unknown>(remote.update(ns, patch as Record<string, unknown>, revision)),
      // 路径级那条是节点状态的首选写法：各节点各写自己那一段，不会互相盖。
      ...(remote.mutate === undefined ? {} : {
        mutate: async (ns, ops, revision) => unwrap<unknown>(remote.mutate?.(ns, ops, revision) ?? Promise.resolve(undefined)),
      }),
      ...(remote.openSettingsDocument === undefined ? {} : {
        openDocument: (signal) => unwrap<unknown>(remote.openSettingsDocument?.(signal) ?? Promise.resolve(undefined)),
      }),
    },
    ...(env ? { env } : {}),
    reasons,
  }
}
