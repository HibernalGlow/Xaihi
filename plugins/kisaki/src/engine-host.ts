/**
 * Kisaki 引擎的**子进程入口**（ADR-0015 决定 2：边界是子进程，不是把 Node-API 装进宿主进程）。
 *
 * 为什么要有这一份：`.node` 一装载就带 napi 的 async runtime 与 rayon 线程池，
 * panic/abort 是**进程级**的——装在宿主进程里，死的是一次会话的全部（决定 2 的故障半径理由，
 * findz 的 Go 内核按同一条判过，见 `docs/adr/0004` 决定 1）。这一份把那份风险关在子进程里，
 * 内核逻辑与装载器**一行都没改**：它 import 的还是 `./native/index.ts` 那一套。
 *
 * 帧协议（stdio，一行一个 JSON，两侧共用同一份表，见 `engine-gateway.ts` 与
 * `@hibernalglow/xaihi-sdk` 的 `KisakiEngineMethod`）：
 * - 起手第一行必为问候：`{id:"hello", ok:true, result:{info, binding, pid}}`；
 *   装载不了也照这个信封回错（`ok:false`），错误码 `binding-missing` / `binding-load-failed` / `abi-mismatch`。
 * - 请求：`{id, method, params}`；应答：`{id, ok:true, result}` 或 `{id, ok:false, error:{code,message,retryable}}`。
 * - 事件：`{event:"progress", scanId, progress}`——进度不属于任何一次请求的应答，
 *   所以它带 `event` 而不是 `id`，父侧按 `scanId` 派发。
 *
 * 一条纪律：**stdout 只走帧**。装载器/依赖里任何 `console.log` 都会把协议打成乱码，
 * 而症状是父侧报"非 JSON 帧"而不是"谁写的"。所以这里把三根 console 一律改道 stderr，
 * 诊断留在 stderr 让父侧拼进死讯（与 findz 的 `diagnose` 同一分工）。
 *
 * @module xaihi-kisaki/engine-host
 */
import process from 'node:process'

import {
  cancelCzkawkaScan,
  createExifCandidate,
  createVideoOptimizerCandidate,
  getCzkawkaInfo,
  loadKisakiBinding,
  scanBasicFiles,
  scanDuplicateFiles,
  scanExifFiles,
  scanMediaFiles,
  scanVideoOptimizer,
  trashPath,
} from './native/index.js'
import { resolveKisakiBindingPath } from './native/native-asset.js'
import type { KisakiEngineInfo, KisakiEngineMethod } from '@hibernalglow/xaihi-sdk'

/** 引擎的 Node-API 版本闸门：低于这一份的一律拒，症状要在握手时就说得出来。 */
const MINIMUM_API_VERSION = 5
/** 少了任何一条都不能算"这份引擎可用"——少一条的代价是某个工具永远 unsupported_method。 */
const REQUIRED_CAPABILITIES = [
  'scan.duplicate',
  'scan.basic',
  'scan.media',
  'scan.exif-remover',
  'scan.video-optimizer',
  'scan.progress.v2',
  'scan.cancel',
] as const

const writeFrame = (frame: unknown): void => {
  process.stdout.write(`${JSON.stringify(frame)}\n`)
}

// stdout 是协议通道，console 那三根一律改道 stderr（见文件头那条纪律）。
const say = (stream: 'out' | 'err', ...args: unknown[]): void => {
  process[stream === 'out' ? 'stdout' : 'stderr'].write(`${args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')}\n`)
}
console.log = (...args: unknown[]) => say('err', ...args)
console.info = console.log
console.warn = console.log

/** 取消登记：父侧发 `cancel`，这里把标志立起来给装载器的 `shouldCancel` 读。 */
const cancelling = new Set<string>()

interface ErrorFrame { code: string, message: string, retryable: boolean }

const fail = (code: string, message: string, retryable = false): ErrorFrame => ({ code, message, retryable })

function engineInfo (): KisakiEngineInfo {
  const info = getCzkawkaInfo()
  return { apiVersion: info.apiVersion, sourceVersion: info.sourceVersion, capabilities: [...info.capabilities] }
}

/**
 * 装载 + 版本/能力闸门。任何一步不成都照问候信封回错，父侧因此永远有一条读得回的死讯，
 * 而不是"子进程起来了却不说话"。
 */
function greet(): { ok: true, result: unknown } | { ok: false, error: ErrorFrame } {
  let bindingPath: string
  try {
    bindingPath = resolveKisakiBindingPath()
  } catch (error) {
    return { ok: false, error: fail('binding-missing', String(error instanceof Error ? error.message : error), false) }
  }
  let info: KisakiEngineInfo
  try {
    loadKisakiBinding()
    info = engineInfo()
  } catch (error) {
    return { ok: false, error: fail('binding-load-failed', `${String(error instanceof Error ? error.message : error)}（${bindingPath}）`, false) }
  }
  if (info.apiVersion < MINIMUM_API_VERSION) {
    return { ok: false, error: fail('abi-mismatch', `引擎 Node-API v${String(info.apiVersion)} 低于要求的 v${String(MINIMUM_API_VERSION)}`, false) }
  }
  const available = new Set(info.capabilities)
  const missing = REQUIRED_CAPABILITIES.filter((capability) => !available.has(capability))
  if (missing.length > 0) {
    return { ok: false, error: fail('capability-missing', `引擎缺这些能力：${missing.join(', ')}`, false) }
  }
  return { ok: true, result: { info, binding: bindingPath, pid: process.pid } }
}

const dispatch = async (method: KisakiEngineMethod | 'cancel', params: Record<string, unknown>): Promise<unknown> => {
  if (method === 'cancel') {
    const scanId = String(params.scanId ?? '')
    if (scanId === '') throw new Error('cancel 需要 params.scanId')
    cancelling.add(scanId)
    return cancelCzkawkaScan(scanId)
  }
  // 每一次扫描都带上 scanId，装载器那一层的 100ms 轮询据此把进度推成事件帧。
  const scanId = typeof params.scanId === 'string' ? params.scanId : undefined
  const controls = scanId === undefined ? undefined : {
    onProgress: (progress: unknown) => { writeFrame({ event: 'progress', scanId, progress }) },
    shouldCancel: () => cancelling.has(scanId),
  }
  switch (method) {
    case 'info': return engineInfo()
    case 'scan.duplicate': return await scanDuplicateFiles(params as never, controls)
    case 'scan.basic': return await scanBasicFiles(params as never, controls)
    case 'scan.media': return await scanMediaFiles(params as never, controls)
    case 'scan.exif': return await scanExifFiles(params as never, controls)
    case 'scan.video-optimizer': return await scanVideoOptimizer(params as never, controls)
    case 'candidate.exif': return await createExifCandidate(params as never)
    case 'candidate.video-optimizer': return await createVideoOptimizerCandidate(params as never)
    case 'operation.trash': return await trashPath(String(params.path ?? ''))
    default: throw Object.assign(new Error(`unknown_method: ${String(method)}`), { code: 'unknown_method' })
  }
}

async function main (): Promise<void> {
  const greeting = greet()
  writeFrame({ id: 'hello', ...greeting })
  if (greeting.ok === false) {
    // 装载不了就没有可服务的东西；不退出成 0，父侧按退出码 + 那一帧的错误码一起报。
    process.exit(3)
  }

  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line !== '') void handle(line)
      index = buffer.indexOf('\n')
    }
  })
  process.stdin.on('end', () => { process.exit(0) })
}

async function handle (line: string): Promise<void> {
  let frame: { id?: unknown, method?: unknown, params?: unknown }
  try {
    frame = JSON.parse(line)
  } catch {
    writeFrame({ id: null, ok: false, error: fail('bad-frame', `不是 JSON：${line.slice(0, 120)}`, false) })
    return
  }
  const id = typeof frame.id === 'string' ? frame.id : null
  try {
    const result = await dispatch((frame.method ?? 'info') as KisakiEngineMethod, (frame.params ?? {}) as Record<string, unknown>)
    writeFrame({ id, ok: true, result })
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'scan_failed'
    writeFrame({ id, ok: false, error: fail(code, String(error instanceof Error ? error.message : error), code === 'scan_failed') })
  }
}

void main().catch((error: unknown) => {
  say('err', `kisaki engine host crashed: ${String(error instanceof Error ? error.stack ?? error : error)}`)
  process.exit(4)
})
