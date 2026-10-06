/**
 * 终端渲染器到底跑不跑得起来：**问运行时，不要换个运行时**。
 *
 * 上游这一头原来叫 `bun-runtime.ts`，做的事是"发现自己在 Node 里就 `spawn` 一个裸 `bun`
 * 把自己重_exec_ 一遍"。两个理由必须废掉它：
 *
 * 1. **它是个隐式的动作。** 一次 `xaihi ui` 会在使用者没要求的情况下起第二个进程，
 *    用的还是 PATH 上一个谁都可能没装的可执行文件（`bun.exe`/`bun`）。
 *    找不到时的报错是 `Unable to start Bun for OpenTUI: …`，
 *    而"为什么需要一个我没装的运行时"这件事没人说。
 * 2. **前提本身已经不成立（实测 2026-10-06）。** `@opentui/core@0.4.5` 的 `exports` 里
 *    同时有 `"bun": "./index.bun.js"` 与 `"node"/"import": "./index.node.js"`，
 *    平台包 `@opentui/core-darwin-arm64` 除了 `index.bun.js` 还有给 Node 用的 `index.js`
 *    （它导出的就是 `libopentui.dylib` 的路径）。
 *    在 Node 26.10 上直接 `await import("@opentui/core")` 实测拿到 **257 个导出**、
 *    rc=0，只带一条 `ExperimentalWarning: FFI is an experimental feature`。
 *    ⇒ OpenTUI 在 Node 上能起来，重定向到 bun 是在解决一个不存在的问题，
 *      代价是把"三面同一个 npm 包，`npm i -g` 就装好"（ADR-0006 分发形状）变成"还得装 bun"。
 *
 * 因此这里只做一件事：**探测**，并且把结果如实交出去。
 * 探测是"加载一次渲染器"，不是"开始渲染"——没有副作用、不改终端状态。
 * 探测不过就是可读的退化（ADR-0011 决定 4 的降级铁律），绝不偷偷换个运行时再跑。
 */

/** 探测一次的成本是加载一个 dylib，缓存住；但失败也缓存，所以给一次重试口。 */
export type TerminalRuntimeName = 'bun' | 'node'

export interface TerminalRuntimeCapability {
  /** 当前进程能不能直接把 OpenTUI 起来。 */
  ok: boolean
  runtime: TerminalRuntimeName
  /** `process.versions.node` 或 `process.versions.bun`，报的是真版本号，不是"应该没问题"。 */
  version: string
  /** 加载到的渲染器导出数——>0 就是"真的 import 成功了"，不是"路径存在"。 */
  exports?: number
  /** 失败时给人看的那一句；成功时是"我是根据什么判的"。 */
  detail: string
}

type Versions = Record<string, string | undefined>

function runtimeName(): TerminalRuntimeName {
  return (process.versions as Versions).bun !== undefined ? 'bun' : 'node'
}

function runtimeVersion(): string {
  const versions = process.versions as Versions
  return (runtimeName() === 'bun' ? versions.bun : versions.node) ?? 'unknown'
}

let cached: TerminalRuntimeCapability | null = null

/**
 * @param refresh - 传 true 重新探一次（例如使用者刚装了东西之后）。
 */
export async function probeTerminalRuntime(refresh = false): Promise<TerminalRuntimeCapability> {
  if (cached !== null && !refresh) return cached
  const runtime = runtimeName()
  const version = runtimeVersion()
  try {
    const core = await import('@opentui/core')
    const exports = Object.keys(core).length
    cached = {
      ok: exports > 0,
      runtime,
      version,
      exports,
      detail: exports > 0
        ? `@opentui/core 在 ${runtime} ${version} 上加载成功（${exports} 个导出）`
        : `@opentui/core 在 ${runtime} ${version} 上加载后一个导出都没有`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cached = {
      ok: false,
      runtime,
      version,
      detail: `${runtime} ${version} 起不了 OpenTUI：${message}`,
    }
  }
  return cached
}

/**
 * 探测失败时给使用者看的那句话。写在这里而不是散在各调用点，
 * 是为了让"退化"在所有终端面上读起来是同一个口径。
 */
export function terminalRuntimeHint(capability: TerminalRuntimeCapability): string {
  if (capability.ok) return ''
  return [
    capability.detail,
    '',
    '终端 UI 这一面已经退化：交互面用引导式问答（gd），管道面（pipe）不受影响。',
    `当前运行时是 ${capability.runtime} ${capability.version}。`,
    'OpenTUI 需要能加载原生库的运行时；Node 侧的 FFI 在部分版本上仍是实验特性。',
    '要看得见的细节就带上 --verbose 重跑这一条命令。',
  ].join('\n')
}
