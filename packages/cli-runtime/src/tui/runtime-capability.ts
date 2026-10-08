/**
 * 终端渲染器到底跑不跑得起来：**探测底座，不换运行时，不 spawn 任何东西。**
 *
 * 背景与最终判定（2026-10-07 两次实测后定案）：
 *
 * - OpenTUI 的渲染后端是 Zig 编译出来的原生库（`libopentui.dylib` 等），
 *   无论 bun 还是 Node 都要经 FFI `dlopen` 它。bun 走 `bun:ffi`，
 *   Node 走 **`node:ffi`（实验特性）**——Node 26 才有这个内置模块；
 *   `@opentui/core` 的 Node 后端报错串自己就写着
 *   `node:ffi ptr() only supports ArrayBuffer …`。
 * - 实测（本机 darwin/arm64）：**Node 26.10 上 `createCliRenderer` 不带任何旗子直接成功**
 *   （renderer OK，137 个属性）；**Node 22 没有 `node:ffi`**——`import('node:ffi')`
 *   报 `ERR_UNKNOWN_BUILTIN_MODULE`，`import('@opentui/core')` 照样拿到 257 个导出，
 *   但 `createCliRenderer` 必炸 `OpenTUI native FFI is not available for this runtime yet`。
 *   ⇒ "import 成功"当判据是错的，判据必须是 **`node:ffi` 在不在**。
 * - 本仓曾按上游搬过一条"Node 渲染失败就 spawn bun 重跑"的接力腿，
 *   又按使用者决定**拆除**（2026-10-07）：不引入 bun、不隐式换运行时。
 *   上游 `bun-runtime.ts` 的活儿在这里就是**探测 + 可读降级**（ADR-0011 决定 4）。
 *   探测是"查一次 `node:ffi` + import 一次"，无副作用、不改终端状态。
 */

import { accessSync, constants } from 'node:fs'

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

/** FFI 底座在不在：bun 恒有 `bun:ffi`；Node 看 `node:ffi`（Node ≥ 26 的实验内置模块）。 */
async function probeFfiSubstrate(): Promise<{ ok: true } | { ok: false; detail: string }> {
  if ((process.versions as Versions).bun !== undefined) return { ok: true }
  // 经变量 import：`node:ffi` 是 Node 26 的实验内置模块，@types/node@24 没有它的声明，
  // 静态字面量 import 过不了 tsc；而且"运行时探一次"本来就是这里的本意。
  const nodeFfi = 'node:ffi'
  try {
    await import(nodeFfi)
    return { ok: true }
  } catch {
    return {
      ok: false,
      detail: '当前 Node 没有 node:ffi 内置模块（Node 26 起才有，实验特性）——'
        + 'OpenTUI 的原生库（Zig 后端）必须经它 dlopen。换 Node ≥ 26 重跑即可，本命令不要求 bun。',
    }
  }
}

/**
 * @param refresh - 传 true 重新探一次（例如使用者刚装了东西之后）。
 */
export async function probeTerminalRuntime(refresh = false): Promise<TerminalRuntimeCapability> {
  if (cached !== null && !refresh) return cached
  const runtime = runtimeName()
  const version = runtimeVersion()
  const ffi = await probeFfiSubstrate()
  if (!ffi.ok) {
    cached = { ok: false, runtime, version, detail: `${runtime} ${version} 起不了 OpenTUI：${ffi.detail}` }
    return cached
  }
  try {
    const core = await import('@opentui/core')
    const exports = Object.keys(core).length
    cached = {
      ok: exports > 0,
      runtime,
      version,
      exports,
      detail: exports > 0
        ? `@opentui/core 在 ${runtime} ${version} 上加载成功（${exports} 个导出，FFI 底座 ${runtime === 'bun' ? 'bun:ffi' : 'node:ffi'} 就位）`
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
    'OpenTUI 需要经 FFI 加载 Zig 原生后端：bun 用 bun:ffi，Node 用 node:ffi（Node ≥ 26，实验特性）。',
    '要看得见的细节就带上 --verbose 重跑这一条命令。',
  ].join('\n')
}

/** 保留给探测之外的调用点做文件可执行性检查（本模块内部不再做进程查找）。 */
export function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}
