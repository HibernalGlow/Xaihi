/**
 * 引擎帧协议这一层的判据：用一份**能照着发帧**的假 provider，把父侧每一条会出事的路都走一遍。
 *
 * 为什么不用真子进程：真往返那条在 `tests/engine.spec.ts`（真 `.node` + 真 Rust）。
 * 这一份管的是**协议本身**——那些"对端行为不对"的形状（非 JSON、错 id、不问候、只写 stderr）
 * 恰恰是真内核永远不会替我们演的那些。
 *
 * 三条阳性对照各破一条判据（"关掉防御就变红"）：
 * ① 死讯里不带 stderr ⇒ 那条"必须把内核诊断拼上"就永远是绿的；
 * ② 应答不带 id 也能被 FIFO 吞下 ⇒ 协议错位看不见；
 * ③ 进度帧被当成某次请求的应答 ⇒ 下一条调用的结果变成上一条的进度。
 */
import { describe, expect, it, vi } from 'vitest'
import { Readable, Writable } from 'node:stream'

import { startKisakiEngineHost, type KisakiSubprocessHandle, type KisakiSubprocessRuntime } from '../src/engine-gateway.js'

interface Script {
  /** 子进程写来的每一帧（父侧 stdin 收到的）。 */
  written: string[]
  /** 由测里主动写进 stdout 的行。 */
  push(line: string): void
  pushStderr(chunk: string): void
  pushError(error: Error): void
  close(): void
  exit(code: number): void
  terminateCalls: number
  handle: KisakiSubprocessHandle
}

function makeScript (): Script {
  const stdout = new Readable({ read () {} })
  const stderr = new Readable({ read () {} })
  const written: string[] = []
  const stdin = new Writable({
    write (chunk: string | Uint8Array, _enc, cb) {
      written.push(chunk.toString())
      cb()
    },
  })
  let resolveDone: (value: { exitCode: number | null }) => void = () => undefined
  const done = new Promise<{ exitCode: number | null }>((resolve) => { resolveDone = resolve })
  const script: Script = {
    written,
    push (line) { stdout.push(line) },
    pushStderr (chunk) { stderr.push(chunk) },
    pushError (error) { stdout.destroy(error) },
    close () { stdout.push(null) },
    exit (code) { resolveDone({ exitCode: code }) },
    terminateCalls: 0,
    handle: {
      stdin,
      stdout,
      stderr,
      done,
      terminate () { script.terminateCalls += 1; resolveDone({ exitCode: 7 }) },
    },
  }
  return script
}

function runtimeFor (script: Script): KisakiSubprocessRuntime {
  return { spawn: () => script.handle }
}

const GREETING = JSON.stringify({
  id: 'hello',
  ok: true,
  result: {
    info: { apiVersion: 5, sourceVersion: '12.0.0', capabilities: ['scan.duplicate', 'scan.basic', 'scan.media', 'scan.exif-remover', 'scan.video-optimizer', 'scan.progress.v2', 'scan.cancel'] },
    binding: '/tmp/xaihi-kisaki.darwin-arm64.node',
    pid: 4242,
  },
})

// 存在性检查是真的（不存在的入口必须当场拒绝，见后面那条 `entry-missing`），
// 所以这里给一个确实存在的路径：假 provider 从不执行它，只走协议。
const ENTRY = new URL(import.meta.url).pathname

async function started (script: Script, graceMs = 500) {
  const host = startKisakiEngineHost(runtimeFor(script), { entryPath: ENTRY, cwd: '/tmp', graceMs })
  // 问候在下一个微任务里读，先把那一帧推进去再 await 这一条 promise。
  script.push(`${GREETING}\n`)
  return await host
}

describe('kisaki engine gateway', () => {
  it('greets and reads the binding out of the handshake', async () => {
    const script = makeScript()
    const client = await started(script)
    expect(client.greeting.binding).toBe('/tmp/xaihi-kisaki.darwin-arm64.node')
    expect(client.status()).toMatchObject({ transport: 'subprocess', state: 'running', binding: '/tmp/xaihi-kisaki.darwin-arm64.node' })
    client.dispose()
  })

  it('refuses before the runtime is even asked (no subprocess provider)', async () => {
    await expect(startKisakiEngineHost(undefined, { entryPath: ENTRY, cwd: '/tmp' })).rejects.toThrow(/no-subprocess/u)
  })

  it('refuses when the entry is not there (and says where it looked)', async () => {
    const script = makeScript()
    await expect(startKisakiEngineHost(runtimeFor(script), { entryPath: '/definitely/not/here.js', cwd: '/tmp' })).rejects.toThrow(/entry-missing/u)
  })

  it("turns a refusal greeting into the engine's own error code and terminates", async () => {
    const script = makeScript()
    const host = startKisakiEngineHost(runtimeFor(script), { entryPath: ENTRY, cwd: '/tmp', graceMs: 500 })
    script.push(`${JSON.stringify({ id: 'hello', ok: false, error: { code: 'abi-mismatch', message: '引擎 Node-API v3 低于要求的 v5', retryable: false } })}\n`)
    await expect(host).rejects.toThrow(/abi-mismatch/u)
    expect(script.terminateCalls).toBeGreaterThan(0)
  })

  it('writes one request frame per call and resolves by id (not by FIFO order)', async () => {
    const script = makeScript()
    const client = await started(script)
    const first = client.call('scan.basic', { tool: 'empty-files' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    const frame = JSON.parse(script.written[0] as string) as { id: string, method: string, params: Record<string, unknown> }
    expect(frame.method).toBe('scan.basic')
    script.push(`${JSON.stringify({ id: frame.id, ok: true, result: { entries: [] } })}\n`)
    await expect(first).resolves.toEqual({ entries: [] })
    client.dispose()
  })

  it('routes progress frames to that scan only, and never as a response', async () => {
    const script = makeScript()
    const client = await started(script)
    const seen: unknown[] = []
    const scan = client.call('scan.duplicate', { includedDirectories: ['/tmp'] }, { scanId: 'scan-A', onProgress: (p) => { seen.push(p) } })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    script.push(`${JSON.stringify({ event: 'progress', scanId: 'scan-A', progress: { stage: 'hashing', stageIndex: 1, stageCount: 2, entriesChecked: 3, entriesTotal: 10, bytesChecked: 1, bytesTotal: 2 } })}\n`)
    await vi.waitFor(() => expect(seen.length).toBe(1))
    const frame = JSON.parse(script.written[0] as string) as { id: string }
    script.push(`${JSON.stringify({ id: frame.id, ok: true, result: { groups: [] } })}\n`)
    await expect(scan).resolves.toEqual({ groups: [] })
    client.dispose()
  })

  it('sends a cancel frame with the scan id', async () => {
    const script = makeScript()
    const client = await started(script)
    const cancel = client.cancel('scan-Z')
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    expect(JSON.parse(script.written[0] as string)).toMatchObject({ method: 'cancel', params: { scanId: 'scan-Z' } })
    const frame = JSON.parse(script.written[0] as string) as { id: string }
    script.push(`${JSON.stringify({ id: frame.id, ok: true, result: true })}\n`)
    await expect(cancel).resolves.toBe(true)
    client.dispose()
  })

  it('folds the exit code and the kernel stderr tail into one death message', async () => {
    const script = makeScript()
    const client = await started(script)
    const scan = client.call('scan.basic', { tool: 'empty-files' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    script.pushStderr('thread scanning panicked at bad-names.rs:13')
    script.exit(101)
    const message = await scan.then(() => 'resolved').catch((error: Error) => error.message)
    expect(message).toContain('exited (code 101)')
    expect(message).toContain('panicked at bad-names.rs')
    expect(message).toContain('stderr:')
  })

  it('dies loudly on a non-JSON line instead of hanging the caller', async () => {
    const script = makeScript()
    const client = await started(script)
    const scan = client.call('scan.basic', { tool: 'empty-files' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    script.push('this is not a frame\n')
    await expect(scan).rejects.toThrow(/non-JSON frame/u)
  })

  it('dies when the host answers an id nobody asked for (protocol drift)', async () => {
    const script = makeScript()
    const client = await started(script)
    const scan = client.call('scan.basic', { tool: 'empty-files' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    script.push(`${JSON.stringify({ id: 'xaihi-kisaki-99', ok: true, result: {} })}\n`)
    await expect(scan).rejects.toThrow(/unknown request id/u)
  })

  it('rejects pending calls with host_gone after dispose (no silent never-resolving promise)', async () => {
    const script = makeScript()
    const client = await started(script)
    const scan = client.call('scan.media', { tool: 'similar-images' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    client.dispose()
    await expect(scan).rejects.toThrow(/disposed|host_gone/u)
    expect(script.terminateCalls).toBeGreaterThan(0)
    expect(client.status().state).toBe('dead')
  })

  it('does not hang forever when stdout closes without an exit (bounded fallback)', async () => {
    const script = makeScript()
    const client = await started(script, 60)
    const scan = client.call('scan.basic', { tool: 'empty-files' })
    await vi.waitFor(() => expect(script.written.length).toBe(1))
    script.close()
    // 兜底到点自己收口：死讯有名字，调用方不是永远等待。
    await expect(scan).rejects.toThrow(/stdout closed/u)
  })
})
