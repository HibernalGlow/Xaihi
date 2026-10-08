/**
 * 进程边界：把 `findz-host` 这个独立可执行文件接到 `core.ts` 的 gateway 缝上。
 *
 * 这是 ADR-0004 决定 1 的落地处 —— **out-of-process，不走 FFI**。所以这里不做
 * 任何"把 native 拉进宿主进程"的事，只做三件：
 *
 *  1. 用 `ctx.subprocess` 起 `findz-host`，三根流都要显式处置（`'pipe'` 的三根
 *     原样交给我们：`SubprocessHandle.stdin/stdout/stderr`）。这条缝的 spec 是
 *     "fully specified, applies no defaults"，所以 cwd / graceMs 也都得给。
 *  2. 一行一个 JSON 信封地说话（NDJSON）。内核按请求顺序同步回话，所以待决表是
 *     一条 FIFO：不引入请求 id 匹配以外的复杂度。
 *  3. 握手只认版本：`abiVersion` / `requestVersions` / 能力集三项，与基线的
 *     `assertCompatibleFindzApiInfo` 同一套判据。不认识的版本**拒绝装载**，
 *     而不是降级跑一半方法。
 *
 * 为什么不是 koffi / bun:ffi：`-buildmode=c-shared` 的 Go 库 panic 在 cgo 边界
 * 不可恢复，陪葬的是使用者的宿主与整条会话（ADR-0004 决定 1 的原话）。
 *
 * @module xaihi-findz/gateway
 */

import type { Readable } from 'node:stream'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import {
  FINDZ_ABI_VERSION,
  FINDZ_REQUEST_VERSION,
  FINDZ_REQUIRED_CAPABILITIES,
  type FindzApiInfo,
  type FindzResponse,
} from './contract.ts'
import type { FindzWorkerGateway, FindzWorkerMethod } from './worker-protocol.ts'

/** 起一个 findz 内核宿主。 */
export interface FindzHostOptions {
  /** `findz-host` 的绝对路径（`ctx.subprocess` 允许绝对可执行路径）。 */
  binaryPath: string
  /** 子进程工作目录。内核只按绝对路径干活，这里只为满足"每条都要显式"的要求。 */
  cwd: string
  /** 终止的宽限期，交给 provider 的终止流程；同时也是握手等待的上界。 */
  graceMs?: number
}

/** 一个活着的内核宿主。 */
export interface FindzHost extends FindzWorkerGateway {
  /** 握手读回来的内核自述。 */
  readonly apiInfo: FindzApiInfo
  readonly binaryPath: string
  /** 请求终止（树级）。幂等。 */
  dispose(): void
}

const DEFAULT_GRACE_MS = 5_000
const STDERR_TAIL_BYTES = 4 * 1024

/**
 * stdout 读完但进程还没给死讯时的哨兵消息。
 *
 * 它必须是一个能被 `===` 认出来的常量，而不是每次新建的 Error：调用方要用它区分
 * "对端不再说话"（等死讯）和"协议真的坏了"（立刻结算）。
 */
const STDOUT_CLOSED = 'findz-host closed its stdout'

/**
 * 逐行读取一个 `Readable`。stdout 上是 NDJSON，一行一个信封；
 * 一次读一行而不是"读完再切"，因为响应之间没有 EOF 可等。
 */
function createLineReader(stream: Readable) {
  let buffer = ''
  const lines: string[] = []
  const waiters: Array<{ resolve(line: string): void; reject(error: Error): void }> = []
  let ended: Error | undefined

  const pump = (): void => {
    while (waiters.length > 0 && lines.length > 0) {
      const waiter = waiters.shift()
      waiter?.resolve(lines.shift() as string)
    }
    if (ended !== undefined) {
      while (waiters.length > 0) waiters.shift()?.reject(ended)
    }
  }

  const push = (text: string): void => {
    buffer += text
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      lines.push(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
  }

  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    push(chunk)
    pump()
  })
  stream.on('error', (error: Error) => {
    // 先交出已经完整到达的行，再报错：丢掉它们会让最后一帧变成"协议错位"。
    if (buffer !== '') {
      lines.push(buffer)
      buffer = ''
    }
    ended = error
    pump()
  })
  stream.on('end', () => {
    if (buffer !== '') {
      lines.push(buffer)
      buffer = ''
    }
    ended ??= new Error(STDOUT_CLOSED)
    pump()
  })

  return {
    read(): Promise<string> {
      if (lines.length > 0) return Promise.resolve(lines.shift() as string)
      if (ended !== undefined) return Promise.reject(ended)
      return new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }))
    },
  }
}

/**
 * 校验内核自述与我们对它的假设一致。
 *
 * 与基线的 `packages/findz-native/src/index.ts` 的 `assertCompatibleFindzApiInfo`
 * 同一套三项判据（ABI、请求版本、能力集），逐条抄过来而不是只看 ABI：
 * ABI 相同但少一个能力时，症状是"某个动作永远 unsupported_method"。
 *
 * @throws ABI 或请求版本不认识，或能力集缺项。
 */
export function assertCompatibleFindzApiInfo(apiInfo: FindzApiInfo): void {
  if (apiInfo.abiVersion !== FINDZ_ABI_VERSION) {
    throw new Error(`findz: core reports ABI version ${String(apiInfo.abiVersion)}, expected ${String(FINDZ_ABI_VERSION)}`)
  }
  if (!apiInfo.requestVersions.includes(FINDZ_REQUEST_VERSION)) {
    throw new Error(`findz: core does not support request version ${String(FINDZ_REQUEST_VERSION)}`)
  }
  const capabilities = new Set(apiInfo.capabilities)
  const missing = FINDZ_REQUIRED_CAPABILITIES.filter((capability) => !capabilities.has(capability))
  if (missing.length > 0) {
    throw new Error(`findz: core is missing required capabilities: ${missing.join(', ')}`)
  }
}

/**
 * 起一个内核宿主并完成握手。
 * @param runtime - DSH 的 `ctx.subprocess`。
 * @param options - 二进制路径、工作目录与宽限期。
 * @returns 已握手的宿主；`call` 就是 `core.ts` 要的那条 gateway 缝。
 * @throws 起不来、握手信封不是 ok、或版本 / 能力集不兼容。
 */
export async function startFindzHost(runtime: SubprocessRuntime, options: FindzHostOptions): Promise<FindzHost> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  const handle: SubprocessHandle = runtime.spawn({
    argv: [options.binaryPath],
    cwd: options.cwd,
    graceMs,
    stdio: {
      // 三根流都自己拿：stdin 要持续写请求，stdout 要按行收响应，stderr 只留尾部做诊断。
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  })
  const stdin = handle.stdin
  const stdout = handle.stdout
  const stderr = handle.stderr
  if (stdin === undefined || stdout === undefined || stderr === undefined) {
    handle.terminate()
    throw new Error('findz: ctx.subprocess did not provide piped stdio for the core host')
  }

  let stderrTail = ''
  stderr.setEncoding('utf8')
  stderr.on('data', (chunk: string) => {
    // 内核的 `diagnose` 把 panic / 启动失败的原因写在 stderr（`host.go`）。这条尾巴是
    // 唯一能说明"它为什么没了"的东西，所以它必须出现在**每一条**死讯里。
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES)
  })

  const reader = createLineReader(stdout)
  const pending: Array<{ settle(response: FindzResponse<unknown>): void }> = []
  let dead: Error | undefined
  let writeFailure: string | undefined
  let fallback: NodeJS.Timeout | undefined

  /**
   * 唯一的死讯出口。
   *
   * 只认第一条，并且把已知细节拼上：退出码由 `handle.done` 给，内核自己的诊断在
   * `stderrTail` 里，写不进去是"对端没了"的另一种说法。这三样拼起来才是使用者能
   * 据以行动的一句话；只报"stdout 关了"等于什么都没说。
   */
  const settleDeath = (reason: string): void => {
    if (dead !== undefined) return
    if (fallback !== undefined) {
      clearTimeout(fallback)
      fallback = undefined
    }
    const details = [
      writeFailure === undefined ? '' : `write failed: ${writeFailure}`,
      stderrTail.trim() === '' ? '' : `stderr: ${stderrTail.trim()}`,
    ].filter((detail) => detail !== '')
    dead = new Error(details.length === 0 ? reason : `${reason} — ${details.join(' — ')}`)
    while (pending.length > 0) {
      pending.shift()?.settle({ ok: false, error: { code: 'host_gone', message: dead.message, retryable: true } })
    }
  }

  /** 有界兜底：进程迟迟不给死讯时用手上已知的原因收口，不无限挂住调用方。 */
  const armFallback = (reason: string): void => {
    if (fallback !== undefined) return
    fallback = setTimeout(() => settleDeath(reason), graceMs)
    fallback.unref()
  }

  // 泵：一次读一行，按 FIFO 交给等待者。内核的 `handle` 是同步的（长任务走
  // 内部任务，不写帧），所以响应的顺序就是请求的顺序，不需要 id 匹配表。
  void (async () => {
    for (;;) {
      let line: string
      try {
        line = await reader.read()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message === STDOUT_CLOSED) {
          // stdout 关了不等于进程死了，也可能只是它不再是对端。**死讯留给
          // `handle.done`**：只有那条路带得上退出码，而且只有它保证 stderr 已经收完
          // （`close` 在所有 stdio 关掉之后才发）。曾经这里是直接 failAll，症状是
          // 内核 panic 时使用者看到"closed its stdout"，而真正的原因被吞掉了。
          armFallback(message)
          return
        }
        settleDeath(message)
        return
      }
      const trimmed = line.trim()
      if (trimmed === '') continue
      let frame: FindzResponse<unknown>
      try {
        frame = JSON.parse(trimmed) as FindzResponse<unknown>
      } catch {
        settleDeath(`findz-host wrote a non-JSON frame: ${trimmed.slice(0, 200)}`)
        return
      }
      const next = pending.shift()
      if (next === undefined) {
        // 没有等待者的帧 = 协议错位（上一帧被谁吞了）。说出来，不要静默丢弃。
        settleDeath('findz-host wrote a frame with no pending request')
        return
      }
      next.settle(frame)
    }
  })()

  handle.done.then(
    (outcome) => settleDeath(`findz-host exited (code ${String(outcome.exitCode)})`),
    (error: unknown) => settleDeath(`findz-host failed to start: ${String(error instanceof Error ? error.message : error)}`),
  )

  // 握手：第一行必须是 `findz_api_info` 语义的 ok 信封。
  const greeting = await new Promise<FindzResponse<unknown>>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`findz-host did not greet within ${String(graceMs)} ms`)) }, graceMs)
    timer.unref?.()
    pending.push({
      settle(response) {
        clearTimeout(timer)
        resolve(response)
      },
    })
  })
  if (!greeting.ok) {
    handle.terminate()
    throw new Error(`findz: core host refused the handshake: ${greeting.error.code}: ${greeting.error.message}`)
  }
  const apiInfo = greeting.result as FindzApiInfo
  try {
    assertCompatibleFindzApiInfo(apiInfo)
  } catch (error) {
    handle.terminate()
    throw error
  }

  let sequence = 0
  return {
    apiInfo,
    binaryPath: options.binaryPath,
    call<T>(method: FindzWorkerMethod, params: unknown): Promise<T> {
      if (dead !== undefined) return Promise.reject(dead)
      /*
       * `api.info` 不进帧 —— 它在真内核里根本不是一个方法。
       *
       * 基线的分工是这样的：`nodes/findz/src/findz-worker.ts` 里 `case "api.info"`
       * 走的是 `nativeClient.getApiInfo()`，而那个走的是 FFI 的**自由符号**
       * `findz_api_info`（`packages/findz-native`），不是 `findz_call`。所以在
       * Xiranite 里它绕过了方法表，永远不会撞上 `unsupported_method`。
       *
       * 换成 ADR-0004 决定 2 的帧协议以后，那个自由符号就是**第一帧问候**
       * （`host.go` 的 `success("", currentAPIInfo())`），名字也不在
       * `service.go` 的方法表里。所以这一条必须由本层答，把问候原样交回去。
       * 漏掉它，`api_info` 动作会一脸无辜地报 `unsupported_method: api.info`。
       */
      if (method === 'api.info') return Promise.resolve(apiInfo as T)
      sequence += 1
      const requestId = `xaihi-findz-${String(sequence)}`
      // 变异方法在内核里按 requestId 做幂等回执，所以每次调用都必须是一个新 id。
      const frame = JSON.stringify({ requestVersion: FINDZ_REQUEST_VERSION, requestId, method, params })
      return new Promise<T>((resolve, reject) => {
        pending.push({
          settle(response) {
            if (response.ok) resolve(response.result as T)
            // 与基线的 FFI 客户端同一形状：`code: message`。
            else reject(new Error(`${response.error.code}: ${response.error.message}`))
          },
        })
        stdin.write(`${frame}\n`, (error) => {
          // 成功时这个参数是 `null` 或 `undefined`（Node 8.3 起才带上错误），两种都要认。
          if (error === null || error === undefined) return
          // 写不进去通常只是"对端已经没了"的另一种说法，**不**拿它当失败原因结算：
          // 那会和使用 `handle.done` 给出的死讯赛跑，谁先到谁定文案，测试和用户都会
          // 看到两种随机结果。这里只记下细节，由死讯统一拼上去；进程要是还活着，
          // 兜底计时器会给一个明确的失败。
          writeFailure ??= error.message
          armFallback(`cannot write to findz-host: ${error.message}`)
        })
      })
    },
    dispose() {
      settleDeath('findz: core host was disposed')
      handle.terminate()
    },
  }
}
