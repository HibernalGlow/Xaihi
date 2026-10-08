/**
 * Kisaki 引擎的宿主进程这一侧：起子进程、走帧、把死讯说成人话。
 *
 * 形状**照抄本仓已跑通的那条通路**（`plugins/findz/src/gateway.ts:155-336`），不另发明协议：
 * `ctx.subprocess` 起、三根 stdio 自己拿、stderr 只留尾部做诊断、退出码与 stderr 拼成唯一死讯、
 * 有界兜底防止无限挂住调用方。与 findz 的**唯一**实质差别在这里：
 * findz 的内核是同步的（一次一问一答，FIFO 就够），而引擎的扫描是长任务且要推进度，
 * 所以父侧按 `id` 匹配应答、按 `scanId` 派发 `event` 帧——进度不属于任何一次应答，
 * 拿 FIFO 交它会把它当成某个请求的答，症状是"下一条调用的结果变成了上一条的进度"。
 *
 * 三条拒绝都带名字，且都能从 `status()` 读回（ADR-0011 决定 4）：
 * - `no-subprocess`：这次装配没有 `ctx.subprocess`（宿主没装那条 provider）。
 * - `entry-missing`：找不到 `engine-host` 入口（说了找过哪两处）。
 * - 子进程自己的错误码原样转：`binding-missing` / `binding-load-failed` / `abi-mismatch` / `capability-missing`。
 * 引擎不可用时**不回落成宿主进程内装载**——那条边界是 ADR-0015 决定 2 判死的，回落等于把风险搬回去。
 *
 * @module xaihi-kisaki/engine-gateway
 */
import type { Readable, Writable } from 'node:stream'
import process from 'node:process'
import { existsSync } from 'node:fs'

/**
 * 这一层只声明**用得到的那几样**，结构上成立即可（DSH 的 `ctx.subprocess` 与
 * `local-subprocess.ts` 那份本地适配器都满足它）。不在这里 value/type-import
 * `@deepseek-ai/dsh-subprocess`：本包的 `package.json` 没有那条依赖边，而它正在别的 lane 手里改
 * ——为一层接缝去动别人的文件，比多写八行类型危险。
 * 形状出处（现读，不是猜）：`@deepseek-ai/dsh-subprocess@0.2.0-rc.2` 的 `README.zh.md:41`
 * 与 `plugins/findz/src/gateway.ts:157-171` 那条真用过的调用。
 */
export interface KisakiSubprocessHandle {
  readonly stdin?: Writable
  readonly stdout?: Readable
  readonly stderr?: Readable
  /** 直接命令的退出事实；spawn 失败时 reject。 */
  readonly done: Promise<{ exitCode: number | null, signal?: string | null }>
  /** 终止受管范围。幂等。 */
  terminate(): void
}

export interface KisakiSubprocessRuntime {
  spawn(spec: { argv: readonly string[], cwd: string, graceMs?: number, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' } }): KisakiSubprocessHandle
}
import type { KisakiEngineCallOptions, KisakiEngineFace, KisakiEngineInfo, KisakiEngineMethod, KisakiEngineStatus } from '@hibernalglow/xaihi-sdk'

const DEFAULT_GRACE_MS = 15_000
const STDERR_TAIL_BYTES = 4000
const STDOUT_CLOSED = 'findz-style: stdout closed'

/** 子进程问候那一帧的载荷。 */
export interface KisakiEngineGreeting {
  info: KisakiEngineInfo
  binding: string
  pid: number
}

export interface KisakiEngineHostOptions {
  /** `engine-host` 入口的绝对路径（`node` 脚本本体）。 */
  entryPath: string
  cwd: string
  graceMs?: number
  /** 覆盖 Node 可执行文件（测试给假的入口时用得上）。 */
  execPath?: string
}

/** 起了并握过手的引擎宿主。 */
export interface KisakiEngineClient extends KisakiEngineFace {
  readonly greeting: KisakiEngineGreeting
  /** 请求终止（树级，交给 provider 的 graceMs）。幂等。 */
  dispose(): void
}

interface Pending {
  settle(frame: WireFrame): void
}

type WireFrame =
  | { id: string, ok: true, result: unknown }
  | { id: string, ok: false, error: { code: string, message: string, retryable: boolean } }

type EventFrame = { event: 'progress', scanId: string, progress: unknown }

const isEvent = (frame: { id?: unknown, event?: unknown, scanId?: unknown }): frame is EventFrame => typeof frame.event === 'string'

/**
 * 按行读一条流（照 findz 那份：`end`/`error` 都要把留在缓冲里的最后一行交出去）。
 */
function createLineReader (stream: Readable) {
  const lines: string[] = []
  const waiters: Array<{ resolve(value: string): void, reject(error: Error): void }> = []
  let buffer = ''
  let ended: Error | undefined
  const pump = (): void => {
    while (lines.length > 0 && waiters.length > 0) {
      waiters.shift()?.resolve(lines.shift() as string)
    }
    if (ended !== undefined) {
      while (waiters.length > 0) waiters.shift()?.reject(ended)
    }
  }
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      lines.push(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
    pump()
  })
  stream.on('error', (error: Error) => {
    if (buffer !== '') { lines.push(buffer); buffer = '' }
    ended = error
    pump()
  })
  stream.on('end', () => {
    if (buffer !== '') { lines.push(buffer); buffer = '' }
    ended ??= new Error(STDOUT_CLOSED)
    pump()
  })
  return {
    read (): Promise<string> {
      if (lines.length > 0) return Promise.resolve(lines.shift() as string)
      if (ended !== undefined) return Promise.reject(ended)
      return new Promise<string>((resolve, reject) => { waiters.push({ resolve, reject }) })
    },
  }
}

/**
 * 找引擎子进程的入口：先产物（`lib/engine-host.js`），再源码（`src/engine-host.ts`，跑测时用）。
 * 两处都找过再说话，且把找过的路径写进拒绝文案——"没找到"必须能读出**在哪找过**。
 * @param fromUrl - 调用方的 `import.meta.url`。
 * @returns 绝对路径，或 null。
 */
/** 入口找不到时那句话里"找过哪里"的部分：与候选表同源，改表就不会说错话。 */
export const ENGINE_ENTRY_SEARCHED = '同目录的 engine-host.js 与同包 lib/engine-host.js（源码态要先建过产物）'

export function resolveEngineHostEntry (fromUrl: string): string | null {
  const here = fromUrl.replace(/^file:\/\//, '')
  const base = here.slice(0, here.lastIndexOf('/'))
  /*
   * 只认**真能被 `node` 起来**的那两份：
   * 1. 同目录的 `engine-host.js`（装机形态：`lib/` 里）；
   * 2. 同包的 `lib/engine-host.js`（源码态：`src/cli.ts` 这类调用点映射过去）。
   *
   * 故意**不**回退到 `src/engine-host.ts`：那份里的 `./native/index.js` 是给打包器看的说明符，
   * `node` 直跑会在子进程一进门就报模块找不到，而那条红念起来像"引擎坏了"。
   * 宁可在这里说清"没建产物"，也不起一个必死的子进程。
   */
  const candidates = [`${base}/engine-host.js`, `${base}/../lib/engine-host.js`]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return null
}
/**
 * 起引擎宿主并完成握手。
 * @param runtime - `ctx.subprocess`；缺席时传 undefined，本函数按名字拒绝。
 * @param options - 入口、工作目录、宽限期。
 */
export async function startKisakiEngineHost (
  runtime: KisakiSubprocessRuntime | undefined,
  options: KisakiEngineHostOptions,
): Promise<KisakiEngineClient> {
  if (runtime === undefined) {
    throw new Error('refused no-subprocess: 这次装配没有 ctx.subprocess（引擎不能退回宿主进程内装载，见 ADR-0015 决定 2）')
  }
  if (!existsSync(options.entryPath)) {
    throw new Error(`refused entry-missing: 找不到引擎入口 ${options.entryPath}（找过：${ENGINE_ENTRY_SEARCHED}）`)
  }

  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  const handle: KisakiSubprocessHandle = runtime.spawn({
    argv: [options.execPath ?? process.execPath, options.entryPath],
    cwd: options.cwd,
    graceMs,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  })
  const stdin = handle.stdin
  const stdout = handle.stdout
  const stderr = handle.stderr
  if (stdin === undefined || stdout === undefined || stderr === undefined) {
    handle.terminate()
    throw new Error('refused no-piped-stdio: ctx.subprocess 没给这三根管道，帧协议无从谈起')
  }

  let stderrTail = ''
  stderr.on('data', (chunk: string) => {
    // 引擎自己为什么没了，只有 stderr 说得出（装载失败、panic、动态库找不到）。
    // 它必须出现在**每一条**死讯里，否则使用者读到的是"没声了"。
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES)
  })

  const reader = createLineReader(stdout)
  const pending = new Map<string, Pending>()
  const progress = new Map<string, (value: unknown) => void>()
  let dead: Error | undefined
  let state: KisakiEngineStatus['state'] = 'starting'
  let writeFailure: string | undefined
  let fallback: NodeJS.Timeout | undefined
  let sequence = 0

  const settleDeath = (reason: string): void => {
    if (dead !== undefined) return
    if (fallback !== undefined) { clearTimeout(fallback); fallback = undefined }
    const details = [
      writeFailure === undefined ? '' : `write failed: ${writeFailure}`,
      stderrTail.trim() === '' ? '' : `stderr: ${stderrTail.trim()}`,
    ].filter((detail) => detail !== '')
    dead = new Error(details.length === 0 ? reason : `${reason} — ${details.join(' — ')}`)
    state = 'dead'
    for (const waiter of pending.values()) waiter.settle({ id: '', ok: false, error: { code: 'host_gone', message: dead.message, retryable: true } })
    pending.clear()
  }

  const armFallback = (reason: string): void => {
    if (fallback !== undefined) return
    fallback = setTimeout(() => settleDeath(reason), graceMs)
    fallback.unref()
  }

  void (async () => {
    for (;;) {
      let line: string
      try {
        line = await reader.read()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // stdout 关了不等于进程死了：死讯留给 handle.done（那条带退出码，
        // 而且 close 在所有 stdio 关掉之后才发，stderr 这时才收得完）。
        if (message === STDOUT_CLOSED) { armFallback(message); return }
        settleDeath(message)
        return
      }
      const trimmed = line.trim()
      if (trimmed === '') continue
      let frame: { id?: unknown, event?: unknown, scanId?: unknown }
      try {
        frame = JSON.parse(trimmed)
      } catch {
        settleDeath(`engine-host wrote a non-JSON frame: ${trimmed.slice(0, 200)}`)
        return
      }
      if (isEvent(frame as { event?: unknown })) {
        const sink = progress.get(frame.scanId as string)
        if (sink !== undefined) sink((frame as EventFrame).progress)
        continue // 没人订阅的进度帧丢掉不算错：它不是应答，没有"该谁收"的债
      }
      const id = (frame as { id: string }).id
      const waiter = pending.get(id)
      if (waiter === undefined) {
        settleDeath(`engine-host answered an unknown request id: ${String(id)}`)
        return
      }
      pending.delete(id)
      waiter.settle(frame as WireFrame)
    }
  })()

  handle.done.then(
    (outcome) => settleDeath(`engine-host exited (code ${String(outcome.exitCode)})`),
    (error: unknown) => settleDeath(`engine-host failed to start: ${String(error instanceof Error ? error.message : error)}`),
  )

  const request = <T>(method: KisakiEngineMethod | 'cancel', params: unknown, scanId?: string, onProgress?: (value: unknown) => void): Promise<T> => {
    if (dead !== undefined) return Promise.reject(dead)
    if (scanId !== undefined && onProgress !== undefined) progress.set(scanId, onProgress as (value: unknown) => void)
    const id = `xaihi-kisaki-${String(++sequence)}`
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        settle (frame) {
          if (scanId !== undefined) progress.delete(scanId)
          if (frame.ok) resolve(frame.result as T)
          else reject(Object.assign(new Error(`${frame.error.code}: ${frame.error.message}`), { code: frame.error.code, retryable: frame.error.retryable }))
        },
      })
      const payload = scanId === undefined ? params : { ...(params as object), scanId }
      stdin.write(`${JSON.stringify({ id, method, params: payload })}\n`, (error?: Error | null) => {
        if (error === null || error === undefined) return
        // 与 findz 同一处理：写不进去通常只是"对端已经没了"的另一种说法，
        // 只记细节、不抢先定死讯，免得两种随机文案互相抢。
        writeFailure ??= error.message
        armFallback(`cannot write to engine-host: ${error.message}`)
      })
    })
  }

  // 握手：第一帧必须是问候。装载不了时子进程回错误帧后以 3 退出——两种都要有名字。
  const greetingTimer = setTimeout(() => {
    settleDeath(`engine-host did not greet within ${String(graceMs)} ms`)
  }, graceMs)
  greetingTimer.unref?.()
  const greeting = await new Promise<KisakiEngineGreeting>((resolve, reject) => {
    pending.set('hello', {
      settle (frame) {
        clearTimeout(greetingTimer)
        if (frame.ok) resolve(frame.result as KisakiEngineGreeting)
        else reject(Object.assign(new Error(`${frame.error.code}: ${frame.error.message}`), { code: frame.error.code }))
      },
    })
  }).catch((error: unknown) => {
    handle.terminate()
    state = 'refused'
    throw error
  })

  state = 'running'

  return {
    greeting,
    info: async () => await request<KisakiEngineInfo>('info', {}),
    call<T = unknown, P = unknown>(method: KisakiEngineMethod, params: unknown, options?: KisakiEngineCallOptions<P>) {
      return request<T>(method, params, options?.scanId, options?.onProgress as ((value: unknown) => void) | undefined)
    },
    cancel: async (scanId: string) => await request<boolean>('cancel', { scanId }),
    status: () => ({
      transport: 'subprocess',
      state,
      entry: options.entryPath,
      binding: greeting.binding,
      ...(dead === undefined ? {} : { reason: dead.message }),
    } satisfies KisakiEngineStatus),
    dispose () {
      settleDeath('kisaki: engine host was disposed')
      handle.terminate()
    },
  }
}

/** 引擎不可用时给界面/账本的那句话：带原因，也带"该装哪一件"。 */
export function describeEngineRefusal (error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `引擎不可用：${message}`
}
