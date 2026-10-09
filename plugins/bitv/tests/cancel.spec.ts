/**
 * bitv 真的响应取消：扫描/分析/搬文件这三段长循环都认账本那条 `signal`。
 *
 * 为什么这条判据非要有：框架那侧（`packages/node-sdk`）已经把取消接成真了——按下中止键会
 * abort 信号、账本记一笔、面板立刻读到"已取消"。但**节点自己不查信号**的话，工作照旧跑完，
 * 而"分析"之后紧接着的是"真的搬文件"：一个不理中断的实现在取消之后仍会把盘上的文件搬走。
 * 所以这里查的是三件事：中断在循环之间生效、没做完就不搬、不取消时行为不变。
 * @module xaihi-bitv/tests/cancel
 */

import { describe, expect, it } from 'vitest'
import { runBitv, type BitvRuntime } from '../src/core.ts'

const CANCELLED = 'bitv cancelled'

/**
 * 五个待分析的视频；三个阶段（发现 / 探针 / 搬文件）全部记账。
 * @param options.abortAfterProbes - 第几个探针之后按下中止键（0 = 不按）。用来模拟"使用者看着进度点取消"。
 */
function fixture(options: { controller?: AbortController, abortAfterProbes?: number } = {}): {
  runtime: BitvRuntime
  probeCalls: string[]
  transfers: string[]
  fileCount: number
} {
  const probeCalls: string[] = []
  const transfers: string[] = []
  const files = [1, 2, 3, 4, 5].map((index) => ({
    path: `/videos/clip-${String(index)}.mp4`,
    basePath: '/videos',
    relativePath: `clip-${String(index)}.mp4`,
  }))
  const runtime: BitvRuntime = {
    findFfprobe: async () => '/usr/local/bin/ffprobe',
    discoverVideos: async (_paths, _recursive, signal) => {
      if (signal?.aborted) throw new Error(`${CANCELLED}: 扫描在路径之间停下`)
      return { files, errors: [] }
    },
    statFile: async () => ({ sizeBytes: 12_500_000 }),
    runFfprobeJson: async (_ffprobe, path) => {
      probeCalls.push(path)
      if (options.abortAfterProbes !== undefined && probeCalls.length === options.abortAfterProbes) options.controller?.abort()
      return {
        format: { duration: '100', bit_rate: '999999999' },
        streams: [{ codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '25/1' }],
      }
    },
    readJson: async () => ({}),
    writeJson: async (desired) => desired,
    resolveAvailablePath: async (desired) => desired,
    transferFile: async (source, desired) => { transfers.push(source); return desired },
    now: () => new Date(0),
    dirname: () => '/videos',
  }
  return { runtime, probeCalls, transfers, fileCount: files.length }
}

describe('bitv 响应取消', () => {
  it('① 开跑前就中止：一个文件都不探，抛的是取消那条', async () => {
    const f = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(runBitv({ action: 'analyze', paths: ['/videos'] }, f.runtime, () => {}, controller.signal))
      .rejects.toThrow(CANCELLED)
    expect(f.probeCalls).toEqual([])
  })

  it('② 中途中止：分析在第 2 个探针之后停下，剩下的不探', async () => {
    const controller = new AbortController()
    const f = fixture({ controller, abortAfterProbes: 2 })
    await expect(runBitv({ action: 'analyze', paths: ['/videos'] }, f.runtime, () => {}, controller.signal))
      .rejects.toThrow(CANCELLED)
    expect(f.probeCalls).toHaveLength(2)
    expect(f.probeCalls.length).toBeLessThan(f.fileCount)
  })

  it('③ 取消之后不许动盘：非预演的分类一个文件都没搬', async () => {
    const f = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(runBitv(
      { action: 'classify', paths: ['/videos'], targetPath: '/sorted', dryRun: false },
      f.runtime,
      () => {},
      controller.signal,
    )).rejects.toThrow(CANCELLED)
    expect(f.transfers).toEqual([])
  })

  it('④ 阳性对照：不给信号时一切照旧（这道闸不是默认红）', async () => {
    const f = fixture()
    const result = await runBitv({ action: 'analyze', paths: ['/videos'] }, f.runtime)
    expect(result.success).toBe(true)
    expect(f.probeCalls).toHaveLength(5)
  })

  it('⑤ 阳性对照：给了没被 abort 的信号也照常跑完（区别只在"按没按下中止键"）', async () => {
    const f = fixture()
    const result = await runBitv({ action: 'analyze', paths: ['/videos'] }, f.runtime, () => {}, new AbortController().signal)
    expect(result.success).toBe(true)
    expect(f.probeCalls).toHaveLength(5)
  })
})
