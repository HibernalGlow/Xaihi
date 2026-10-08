/**
 * gateway 的门禁：用一个**真进程 + 真管道**的假宿主把进程边界钉住。
 *
 * 假宿主是 `tests/fixtures/fake-host.mjs`：它不实现任何 findz 语义，只负责让各种
 * 失败面真的发生（版本不认识、能力集缺项、不握手、非 JSON 帧、握手后立刻退出、
 * 带着 stderr 诊断崩掉、每个请求都拒绝）。真内核的实机对齐在
 * `native/findz-go/probe/probe-host.py`，那一步要 Go 工具链，不该也不能进 `pnpm test`。
 *
 * 每一条判据都配了阳性对照：`ok` 模式下同样的一次调用必须成功，
 * 否则"它拒绝了"可能只是因为它从来没成功过。
 */

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startFindzHost } from '../src/gateway.ts'
import { localSubprocess } from './fixtures/local-subprocess.ts'

const FAKE_HOST = fileURLToPath(new URL('./fixtures/fake-host.mjs', import.meta.url))
const CWD = fileURLToPath(new URL('.', import.meta.url))

/**
 * 用真进程 + 真管道的替身 provider 起假宿主。
 * @param mode - 假宿主的模式名，见 `fixtures/fake-host.mjs`。
 * @param graceMs - 终止宽限期，同时也是握手等待的上界。
 */
const startWithMode = (mode: string, graceMs = 5_000) =>
  startFindzHost(localSubprocess([process.execPath, FAKE_HOST, mode], CWD), { binaryPath: process.execPath, cwd: CWD, graceMs })

describe('startFindzHost 的握手', () => {
  it('读回内核自述，并且正常的调用会拿到结果（阳性对照）', async () => {
    const host = await startWithMode('ok')
    expect(host.apiInfo.coreVersion).toBe('fake-0.0.0')
    expect(host.apiInfo.abiVersion).toBe(1)
    await expect(host.call('query.archives', { libraryId: 'a' })).resolves.toMatchObject({ echo: 'query.archives' })
    host.dispose()
  })

  it('ABI 不认识就拒绝装载，而不是降级', async () => {
    await expect(startWithMode('badabi')).rejects.toThrow(/ABI version 2/)
  })

  it('请求版本不认识就拒绝装载', async () => {
    await expect(startWithMode('oldreq')).rejects.toThrow(/does not support request version 1/)
  })

  it('能力集缺项就拒绝装载（只查 ABI 会漏掉这一类）', async () => {
    await expect(startWithMode('missingcap')).rejects.toThrow(/missing required capabilities: query\.archives/)
  })
})

describe('startFindzHost 的协议与失败面', () => {
  it('第一行不是 JSON 时如实报协议错位', async () => {
    await expect(startWithMode('junk')).rejects.toThrow(/non-JSON frame/)
  })

  it('不握手就在宽限期内失败，而不是挂死', async () => {
    await expect(startWithMode('silent', 300)).rejects.toThrow(/did not greet within 300 ms/)
  })

  it('握手后进程消失：待决调用被拒绝，不是永远挂着', async () => {
    const host = await startWithMode('exit')
    // 必须用一个真会写帧的方法：`api.info` 由本层从问候回答，碰不到死掉的对端。
    await expect(host.call('query.archives', {})).rejects.toThrow(/^host_gone: findz-host exited \(code 3\)/)
  })

  it('进程带着 stderr 诊断死掉时，那句话会出现在调用方看到的失败里', async () => {
    // 这是内核 panic 的形状（`host.go` 的 `diagnose` → stderr → 非 0 退出）。stdout 上
    // 什么都没有，所以只报"stdout 关了"等于把唯一有用的信息吞掉。
    const host = await startWithMode('crash')
    await expect(host.call('query.archives', {})).rejects.toThrow(
      /^host_gone: findz-host exited \(code 4\) — stderr: fake core: index database is locked$/,
    )
  })

  it('内核回结构化错误时，调用按 code: message 拒绝', async () => {
    const host = await startWithMode('fail')
    await expect(host.call('query.archives', {})).rejects.toThrow(/^fake_refusal: refused query\.archives$/)
    host.dispose()
  })

  it('每次调用都是一个新 requestId（内核按 id 做幂等回执）', async () => {
    const host = await startWithMode('ok')
    const first = (await host.call<{ requestId: string }>('export.rows', {}))
    const second = (await host.call<{ requestId: string }>('export.rows', {}))
    const third = (await host.call<{ requestId: string }>('export.rows', {}))
    expect([first.requestId, second.requestId, third.requestId]).toEqual(['xaihi-findz-1', 'xaihi-findz-2', 'xaihi-findz-3'])
    host.dispose()
  })

  it('api.info 由握手帧回答，不写成请求帧（它在真内核里不是一个方法）', async () => {
    // 用 `fail` 模式：**每个**请求帧都会被内核拒。这一条还能过，就证明它压根没进帧。
    const host = await startWithMode('fail')
    await expect(host.call('api.info', {})).resolves.toMatchObject({ coreVersion: 'fake-0.0.0' })

    // 阳性对照：其他方法在同一个宿主上确实会被拒 —— 否则上面那条只是"什么都没测到"。
    await expect(host.call('query.archives', {})).rejects.toThrow(/unsupported|fake_refusal/)

    // 也不占用序号：它后面那次真调用仍然从 1 开始。
    const echo = await startWithMode('ok')
    await echo.call('api.info', {})
    await echo.call('api.info', {})
    await expect(echo.call('library.open', {})).resolves.toMatchObject({ requestId: 'xaihi-findz-1' })
    echo.dispose()
    host.dispose()
  })

  it('并发调用按请求顺序结算，不会串线', async () => {
    const host = await startWithMode('ok')
    const results = await Promise.all([
      host.call<{ echo: string; requestId: string }>('library.open', {}),
      host.call<{ echo: string; requestId: string }>('scan.start', {}),
      host.call<{ echo: string; requestId: string }>('query.members', {}),
    ])
    expect(results.map((row) => row.echo)).toEqual(['library.open', 'scan.start', 'query.members'])
    expect(results.map((row) => row.requestId)).toEqual(['xaihi-findz-1', 'xaihi-findz-2', 'xaihi-findz-3'])
    host.dispose()
  })

  it('dispose 之后不再接受调用', async () => {
    const host = await startWithMode('ok')
    await host.call('api.info', {})
    host.dispose()
    await expect(host.call('api.info', {})).rejects.toThrow(/was disposed/)
  })
})
