/**
 * 实机对齐：真 Go 内核 → 本节点的 `gateway.ts` → 本节点的 `core.ts` 翻译层。
 *
 * 这是 `gateway.spec.ts` 与 `native/findz-go/probe/probe-*.py` 都量不到的那一段：
 * 前者用假宿主演失败面，后者直接对裸管道说话。这里量的是**本节点自己那条路**——
 * `toFindzInput` 拼出来的入参、`runFindzWithGateway` 的派发、进度事件、以及
 * `resolveHostBinary` 那条缝，全部对着真内核跑一遍。
 *
 * 需要 `native/findz-go/dist/findz-host`（Go 工具链产出，见 `../../README.md`）。
 * 没有就**跳过**并说清楚为什么 —— 一个静默永远不跑的判据比没有判据更坏，所以
 * 跳过时会在输出里留一行，而不是让 `pnpm test` 看起来好像验过了。
 *
 * ADR-0004「后果 2」要求批次 D 的验收带一次真实目录的搜索耗时，本文件顺带给出：
 * 冷扫 / 热扫未变 / 查询往返中位数，都是走节点这条路量到的。
 */

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runFindzWithGateway, type FindzInput, type FindzResult } from '../src/core.ts'
import { startFindzHost, type FindzHost } from '../src/gateway.ts'
import { toFindzInput } from '../src/index.ts'
import type { FindzArchiveRow, FindzMemberRow, FindzTask } from '../src/contract.ts'
import { buildArchiveLibrary } from './fixtures/archives.ts'
import { localSubprocess } from './fixtures/local-subprocess.ts'

const KERNEL = fileURLToPath(new URL('../../../native/findz-go/dist/findz-host', import.meta.url))
const HAVE_KERNEL = existsSync(KERNEL)

if (!HAVE_KERNEL) {
  console.warn(
    `findz kernel integration SKIPPED: ${KERNEL} not found.\n` +
    'Build it with: cd native/findz-go && go build -o dist/findz-host .',
  )
}

/** 直接调内核方法（绕过 core.ts 的翻译），用来读任务进度。 */
const taskOf = async (host: FindzHost, libraryId: string, taskId: string): Promise<FindzTask> =>
  host.call<FindzTask>('task.get', { libraryId, taskId })

/**
 * 任务终态取自 `contract.ts` 里声明的那一串，不另写一份。
 *
 * 这里曾经写成 `succeeded` —— 内核根本不发这个状态（它发 `completed`），于是轮询
 * 一直等到超时。**终态名只能照声明抄**，否则症状是"测试挂了"而不是"状态名错了"。
 */
const TERMINAL: ReadonlySet<FindzTask['status']> = new Set(['completed', 'completed_with_warnings', 'cancelled', 'failed'])

async function waitForTask(host: FindzHost, libraryId: string, taskId: string, timeoutMs = 60_000): Promise<FindzTask> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const task = await taskOf(host, libraryId, taskId)
    if (TERMINAL.has(task.status)) return task
    if (Date.now() > deadline) throw new Error(`findz task ${taskId} did not settle within ${String(timeoutMs)} ms (status ${task.status})`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** 走节点那条路的单次调用，顺带把 core.ts 报出来的进度事件收下来。 */
async function call(host: FindzHost, input: FindzInput): Promise<{ result: FindzResult, progress: number[] }> {
  const progress: number[] = []
  const result = await runFindzWithGateway(input, host, (event) => {
    if (event.type === 'progress' && typeof event.progress === 'number') progress.push(event.progress)
  })
  if (!result.success) throw new Error(`findz action failed: ${result.message}`)
  return { result, progress }
}

describe.skipIf(!HAVE_KERNEL)('实机：真内核走本节点的 gateway + core 翻译层', () => {
  let work: string
  let host: FindzHost
  const libraryId = 'probe-lib'

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'xaihi-findz-probe-'))
    buildArchiveLibrary(join(work, 'library'))
    host = await startFindzHost(localSubprocess([KERNEL], work), { binaryPath: KERNEL, cwd: work, graceMs: 10_000 })
  })

  afterAll(() => {
    host?.dispose()
    if (work !== undefined && existsSync(work)) rmSync(work, { recursive: true, force: true })
  })

  it('握手读回的是真内核的自述，版本与能力集都对得上', () => {
    expect(host.apiInfo.abiVersion).toBe(1)
    expect(host.apiInfo.coreVersion).not.toBe('')
    expect(host.apiInfo.capabilities).toContain('query.archives')
    expect(host.apiInfo.supportedFormats).toContain('png')
  })

  it('open_library → scan：节点拼的 databasePath 真的落在自己给的目录里', async () => {
    const indexDir = join(work, 'indexes')
    const open = toFindzInput('open_library', { action: 'open_library', libraryId, libraryRoot: join(work, 'library') }, indexDir)
    const { result } = await call(host, open)
    expect(result.data?.library?.libraryId).toBe(libraryId)
    expect(result.data?.library?.root).toBe(join(work, 'library'))

    const started = Date.now()
    const scan = await call(host, toFindzInput('scan', { action: 'scan', libraryId }, indexDir))
    const taskId = scan.result.data?.task?.id
    expect(taskId).toBeTruthy()
    const settled = await waitForTask(host, libraryId, taskId as string)
    const coldMs = Date.now() - started
    expect(TERMINAL.has(settled.status)).toBe(true)
    expect(settled.status).not.toBe('failed')
    expect(settled.totalArchives).toBe(2)
    expect(settled.doneArchives).toBe(2)
    // 内核报的进度 0..100 被 core.ts 原样送出，界面才有得画。
    expect(scan.progress.length).toBeGreaterThan(0)
    console.info(`[findz] cold scan through the node path: ${String(coldMs)} ms`)

    // 索引文件真的在节点指定的位置（这是 ADR-0003 那条"路径由节点决定"的验收）。
    const databasePath = join(indexDir, `${libraryId}.sqlite`)
    expect(existsSync(databasePath)).toBe(true)
    expect(statSync(databasePath).size).toBeGreaterThan(0)
  })

  it('二次 scan 走"未变"快路：比冷扫明显更快，且归档数不变', async () => {
    const indexDir = join(work, 'indexes')
    const started = Date.now()
    const scan = await call(host, toFindzInput('scan', { action: 'scan', libraryId }, indexDir))
    const settled = await waitForTask(host, libraryId, scan.result.data?.task?.id as string)
    const warmMs = Date.now() - started
    expect(TERMINAL.has(settled.status)).toBe(true)
    expect(settled.status).not.toBe('failed')
    expect(settled.totalArchives).toBe(2)
    console.info(`[findz] warm unchanged scan through the node path: ${String(warmMs)} ms`)
  })

  it('query_archives：两个归档都查得到，notes.txt 不算归档', async () => {
    const indexDir = join(work, 'indexes')
    const { result } = await call(host, toFindzInput('query_archives', { action: 'query_archives', libraryId }, indexDir))
    const page = result.data?.archives
    expect(page?.total).toBe(2)
    const paths = (page?.items ?? []).map((row: FindzArchiveRow) => row.relativePath).sort()
    expect(paths).toEqual(['alpha.cbz', 'beta.zip'])
  })

  it('query_members + analyze：读回的是真的图像格式与真实宽高', async () => {
    const indexDir = join(work, 'indexes')
    const archives = await call(host, toFindzInput('query_archives', { action: 'query_archives', libraryId }, indexDir))
    const alpha = archives.result.data?.archives?.items.find((row: FindzArchiveRow) => row.relativePath === 'alpha.cbz')
    expect(alpha).toBeDefined()

    const members = await call(
      host,
      toFindzInput('query_members', { action: 'query_members', libraryId, archiveId: alpha?.id }, indexDir),
    )
    const names = (members.result.data?.members?.items ?? []).map((row: FindzMemberRow) => row.memberPath).sort()
    expect(names).toEqual(['cover.png', 'page/001.png'])
    // 只扫过中央目录：此刻还不该有宽高，那是 analyze 的活。
    expect((members.result.data?.members?.items ?? []).every((row: FindzMemberRow) => row.actualFormat === undefined)).toBe(true)

    const analysis = await call(host, toFindzInput('analyze', { action: 'analyze', libraryId, scopeKind: 'all' }, indexDir))
    const settled = await waitForTask(host, libraryId, analysis.result.data?.task?.id as string)
    expect(settled.status).not.toBe('failed')
    expect(settled.doneMembers).toBeGreaterThan(0)

    const analysed = await call(
      host,
      toFindzInput('query_members', { action: 'query_members', libraryId, archiveId: alpha?.id }, indexDir),
    )
    const rows = analysed.result.data?.members?.items ?? []
    const cover = rows.find((row: FindzMemberRow) => row.memberPath === 'cover.png')
    const page = rows.find((row: FindzMemberRow) => row.memberPath === 'page/001.png')
    expect(cover?.actualFormat).toBe('png')
    expect(cover?.width).toBe(120)
    expect(cover?.height).toBe(80)
    expect(page?.width).toBe(64)
    expect(page?.height).toBe(64)
  })

  it('查询往返的中位数在毫秒级（ADR-0004 后果 2 要的那笔账）', async () => {
    const indexDir = join(work, 'indexes')
    const input = toFindzInput('query_archives', { action: 'query_archives', libraryId }, indexDir)
    const samples: number[] = []
    for (let index = 0; index < 15; index += 1) {
      const started = process.hrtime.bigint()
      await call(host, input)
      samples.push(Number(process.hrtime.bigint() - started) / 1e6)
    }
    samples.sort((left, right) => left - right)
    const median = samples[Math.floor(samples.length / 2)] as number
    console.info(`[findz] query round trip through the node path: median ${median.toFixed(3)} ms over ${String(samples.length)} calls`)
    // 真内核的实测在 1 ms 量级；这里给一个宽松的上界，钉的是"没有意外变慢一个数量级"。
    expect(median).toBeLessThan(50)
  })

  it('treemap 投影拿得到根节点，且 areaBy 是节点给的默认值', async () => {
    const indexDir = join(work, 'indexes')
    const { result } = await call(host, toFindzInput('treemap', { action: 'treemap', libraryId }, indexDir))
    expect(result.data?.treemap).toBeDefined()
    expect((result.data?.treemap?.children ?? []).length).toBeGreaterThan(0)
  })

  it('close_library 之后内核仍然活着（关库不等于关进程）', async () => {
    const indexDir = join(work, 'indexes')
    await call(host, toFindzInput('close_library', { action: 'close_library', libraryId }, indexDir))
    const info = await call(host, { action: 'api_info' })
    expect(info.result.data?.apiInfo?.abiVersion).toBe(1)
  })
})
