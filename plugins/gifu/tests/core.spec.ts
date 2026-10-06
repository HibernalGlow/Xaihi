/**
 * gifu 内核的保真度用例：**期望值手抄自基线那份 `packages/nodes/gifu/src/core.test.ts`
 * （tag `noxide`，181 行、11 条用例），一条不加、一条不减**，改的只有两处——
 * import 说明符（`./core.js` → `../src/core.ts`）与本文件头。
 * 夹具那份 `runtime()`（上游 `:19-44`）逐字搬，包括它用 `win32` 那套路径函数这一点：
 * 内核的输出路径算术在 `win32` 下才有那几条确定的期望串。
 *
 * 上游那 11 条钉住的形状（挑几条说明为什么不许"顺手改"）：
 * - `namePrefix` 的默认值是字面 `"[#dyna]"`（`:52`），不是空串；
 * - `buildOutputPath` 在 `separate` 模式下期望 `"D:\\[#dyna]manga\\vol01\\a.webp"`（`:102`）
 *   ——根目录的父目录参与命名，少一层就变成另一个产物；
 * - `buildGifuDatabase` 的默认路径是 `"D:\\in\\.xiranite\\gifu-runs.jsonl"`（`:113`），
 *   那个目录名逐字保留（读的是旧工具写过的同一份位置）；
 * - `dryRun` 为真时**一次都不许**调 `convertArchive`（`:121-127` 那条 `not.toHaveBeenCalled()`），
 *   这条就是"预演不碰机器"的全部含义；
 * - 一份归档编码失败不许带走另一份（`:154-164`：`convertedCount: 1, failedCount: 1`）。
 *
 * 另外在这里钉住上游自带的那一份默认值，**与清单/SDK 那两份的关系**写在
 * `tests/definition.spec.ts`（缺口 G8 那一格是"省略 ⇒ false"，不是内核的默认）：
 * 内核 `defaultGifuInput.dryRun` = **true**（`core.ts:215`），清单里 `dryRun` 字段的
 * 声明式默认也是 **true** ⇒ 这两份一致；两者都在下面第 1 条用例里被读回来。
 *
 * @module xaihi-gifu/tests/core
 */

import { win32 } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  buildGifuCommand,
  buildGifuDatabase,
  buildOutputPath,
  defaultGifuInput,
  effectiveGifuFormat,
  isGifuArchive,
  normalizeGifuInput,
  parseGifuTomlConfig,
  parsePathList,
  resolveMaxWorkers,
  runGifu,
  type GifuConversionOutcome,
  type GifuRuntime,
} from '../src/core.ts'

/**
 * 上游 `core.test.ts:19-44` 那份 `runtime()` 夹具，逐字搬（含 `win32` 那套路径函数）。
 * 位置从 describe 内挪到模块作用域，是为了让下面第二个 describe 用**同一份**夹具，
 * 不在本文件里出现第二份假运行时。
 */
function runtime(overrides: Partial<GifuRuntime> = {}): GifuRuntime {
  return {
    readText: async () => '',
    appendRecord: async () => {},
    pathInfo: async (path) => ({ path, exists: true, isFile: isGifuArchive(path), isDirectory: !isGifuArchive(path) }),
    listDir: async (path) => [{ name: 'a.zip', path: win32.join(path, 'a.zip'), isFile: true, isDirectory: false }],
    listArchiveImages: async () => [
      { path: '001.png', extension: '.png' },
      { path: '002.png', extension: '.png' },
      { path: '003.png', extension: '.png' },
    ],
    convertArchive: async (task) => ({
      status: 'converted',
      outputPath: task.outputPath,
      decodedFrames: task.images.length,
      skippedFrames: 0,
      encoder: 'ffmpeg-test',
    }),
    join: win32.join,
    dirname: win32.dirname,
    basename: win32.basename,
    extname: win32.extname,
    relative: win32.relative,
    ...overrides,
  }
}

describe('gifu native core', () => {
  test('normalizes native defaults without runtime adapter fields', () => {
    const input = normalizeGifuInput({ path: 'D:/a.zip', format: 'wbp' })
    expect(input).toMatchObject({
      action: 'plan',
      format: 'webp',
      namePrefix: '[#dyna]',
      nameTemplate: '{prefix}{stem}',
      dryRun: true,
      extractSingle: true,
    })
    for (const removedKey of [['module', 'Name'], ['source', 'Root'], ['py', 'thon']].map((parts) => parts.join(''))) {
      expect(input).not.toHaveProperty(removedKey)
    }
    expect(effectiveGifuFormat('auto')).toBe('webp')
  })

  test('parses path lists and all supported archive suffixes', () => {
    expect(parsePathList('"D:/a.zip"\n# skip\nD:/b.cbz; D:/c.tar.xz')).toEqual(['D:/a.zip', 'D:/b.cbz', 'D:/c.tar.xz'])
    expect(isGifuArchive('demo.tar.gz')).toBe(true)
    expect(isGifuArchive('demo.txt')).toBe(false)
  })

  test('parses legacy sectioned TOML and snake-case options', () => {
    const parsed = parseGifuTomlConfig(`
      [output]
      format = "gif"
      duration_ms = 90
      out_mode = "separate"
      quality = 72
      extract_single = false
      [video]
      webm_crf = 40
      mp4_preset = "p5"
      [naming]
      prefix = "[anim]"
      [performance]
      max_workers = 3
    `)
    expect(parsed).toMatchObject({
      format: 'gif',
      durationMs: 90,
      outMode: 'separate',
      quality: 72,
      extractSingle: false,
      webmCrf: 40,
      mp4Preset: 'p5',
      namePrefix: '[anim]',
      maxWorkers: 3,
    })
  })

  test('plans same and separate output trees', () => {
    const same = normalizeGifuInput({ path: 'D:/manga/vol01/chapter.tar.gz', format: 'gif' })
    expect(buildOutputPath('D:\\manga\\vol01\\chapter.tar.gz', same, runtime())).toBe('D:\\manga\\vol01\\[#dyna]chapter.tar.gif')

    const separate = normalizeGifuInput({ paths: ['D:/manga/vol01/a.cbz', 'D:/manga/vol02/b.cbz'], outMode: 'separate' })
    expect(buildOutputPath('D:\\manga\\vol01\\a.cbz', separate, runtime(), 'D:\\manga')).toBe('D:\\[#dyna]manga\\vol01\\a.webp')
    expect(buildOutputPath('D:\\manga\\vol02\\b.cbz', separate, runtime(), 'D:\\manga')).toBe('D:\\[#dyna]manga\\vol02\\b.webp')
  })

  test('builds a native preview command and JSONL path', () => {
    const input = normalizeGifuInput({ path: 'D:/in/a.zip', format: 'webp' })
    const command = buildGifuCommand(input)
    expect(command.command).toBe('gifu-native')
    expect(command.args).toContain('--format')
    expect(command.args).not.toContain('-m')
    expect(buildGifuDatabase(input, [{ archivePath: 'D:\\in\\a.zip', outputPath: 'D:\\in\\a.webp', imageCount: 3, status: 'ready' }], runtime())).toEqual({
      path: 'D:\\in\\.xiranite\\gifu-runs.jsonl',
      enabled: false,
      mode: 'jsonl',
      defaultPath: true,
    })
  })

  test('dry-run inspects archive entries without invoking conversion', async () => {
    const convertArchive = vi.fn<GifuRuntime['convertArchive']>()
    const result = await runGifu({ action: 'make', path: 'D:/in/a.zip', dryRun: true }, runtime({ convertArchive }))
    expect(result.success).toBe(true)
    expect(result.data?.readyCount).toBe(1)
    expect(result.data?.convertedCount).toBe(0)
    expect(convertArchive).not.toHaveBeenCalled()
  })

  test('converts ready archives and reports native outcomes', async () => {
    const result = await runGifu({ action: 'make', path: 'D:/in/a.zip', dryRun: false }, runtime())
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ convertedCount: 1, extractedCount: 0, failedCount: 0 })
    expect(result.data?.archives[0]).toMatchObject({ status: 'converted', encoder: 'ffmpeg-test', decodedFrames: 3 })
  })

  test('extracts single-image archives through the same runtime boundary', async () => {
    const outcome: GifuConversionOutcome = {
      status: 'extracted',
      outputPath: 'D:\\in\\[#dyna]a.png',
      decodedFrames: 1,
      skippedFrames: 0,
      encoder: '7z-copy',
    }
    const convertArchive = vi.fn(async () => outcome)
    const result = await runGifu({ action: 'make', path: 'D:/in/a.zip', dryRun: false }, runtime({
      listArchiveImages: async () => [{ path: 'cover.png', extension: '.png' }],
      convertArchive,
    }))
    expect(result.success).toBe(true)
    expect(result.data?.extractedCount).toBe(1)
    expect(result.data?.archives[0]?.outputPath).toBe(outcome.outputPath)
  })

  test('preserves successful results when another archive fails', async () => {
    const result = await runGifu({ action: 'make', paths: ['D:/in/a.zip', 'D:/in/b.zip'], dryRun: false, maxWorkers: 2 }, runtime({
      convertArchive: async (task) => {
        if (task.archivePath.endsWith('b.zip')) throw new Error('encoder unavailable')
        return { status: 'converted', outputPath: task.outputPath, decodedFrames: 3, skippedFrames: 0, encoder: 'ffmpeg-test' }
      },
    }))
    expect(result.success).toBe(false)
    expect(result.data).toMatchObject({ convertedCount: 1, failedCount: 1 })
    expect(result.data?.errors[0]).toContain('encoder unavailable')
  })

  test('records a native plan when JSONL recording is enabled', async () => {
    const records: unknown[] = []
    const result = await runGifu({ action: 'plan', path: 'D:/in/a.zip', recordRun: true }, runtime({
      appendRecord: async (_path, record) => { records.push(record) },
    }))
    expect(result.success).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ toolId: 'gifu', engine: 'native-ts', action: 'plan', archiveCount: 1 })
  })

  test('bounds automatic and explicit archive concurrency', () => {
    expect(resolveMaxWorkers(0, 20)).toBe(4)
    expect(resolveMaxWorkers(8, 3)).toBe(3)
    expect(resolveMaxWorkers(1, 3)).toBe(1)
  })
})

describe('gifu 内核自己那一份默认值（与清单那一份各钉一条，不在此统一）', () => {
  test('defaultGifuInput 的 28 个键一个不多一个不少，且 dryRun/extractSingle/recursive 三个默认都是 true', () => {
    expect(Object.keys(defaultGifuInput).sort()).toEqual([
      'action', 'configPath', 'configText', 'databasePath', 'dryRun', 'durationMs', 'extractSingle', 'ffmpegThreads',
      'format', 'listFile', 'listText', 'loop', 'maxWorkers', 'mp4Cq', 'mp4Preset', 'namePrefix', 'nameTemplate',
      'outDir', 'outMode', 'overwrite', 'path', 'paths', 'quality', 'recordRun', 'recursive', 'webmCpuUsed',
      'webmCrf', 'webpMethod',
    ])
    expect(defaultGifuInput.dryRun).toBe(true)
    expect(defaultGifuInput.extractSingle).toBe(true)
    expect(defaultGifuInput.recursive).toBe(true)
    expect(defaultGifuInput.overwrite).toBe(false)
    expect(defaultGifuInput.recordRun).toBe(false)
    // 阳性对照：`normalizeGifuInput({})` 与那份表不是"再调一次被测函数"得到的——
    // 少了任何一个键，上面那条 sort() 立刻红。
    expect(normalizeGifuInput({})).toEqual(defaultGifuInput)
  })

  test('省略所有参数时内核仍然只出计划：dryRun 的缺省来自 :215 而不是清单', () => {
    expect(normalizeGifuInput({ path: 'D:/in/a.zip' }).dryRun).toBe(true)
    // 阳性对照：显式关掉才换行为，证明这一格不是"永远 true"的假断言。
    expect(normalizeGifuInput({ path: 'D:/in/a.zip', dryRun: false }).dryRun).toBe(false)
  })

  test('`wbp` 是 `webp` 的别名，`auto` 落到 `webp`（内核 :219 与 :628-630 两处）', () => {
    expect(normalizeGifuInput({ format: 'wbp' }).format).toBe('webp')
    expect(effectiveGifuFormat('wbp')).toBe('webp')
    expect(effectiveGifuFormat('auto')).toBe('webp')
    expect(effectiveGifuFormat('gif')).toBe('gif')
  })

  test('缺路径那句话说的是内核自己的话，接线层不替它改词', async () => {
    const result = await runGifu({ action: 'plan' }, runtime())
    expect(result.success).toBe(false)
    expect(result.message).toBe('At least one archive, directory, or list entry is required.')
  })

  test('校验器那 10 条边界逐条对上游（durationMs/quality/webpMethod/webmCrf/webmCpuUsed/mp4Preset/mp4Cq/maxWorkers）', async () => {
    const cases: Array<[Parameters<typeof normalizeGifuInput>[0], string]> = [
      [{ path: 'D:/in/a.zip', durationMs: 0 }, 'durationMs must be greater than zero.'],
      [{ path: 'D:/in/a.zip', loop: -1 }, 'loop must be greater than or equal to zero.'],
      [{ path: 'D:/in/a.zip', quality: 0 }, 'quality must be between 1 and 100.'],
      [{ path: 'D:/in/a.zip', webpMethod: 7 }, 'webpMethod must be between 0 and 6.'],
      [{ path: 'D:/in/a.zip', ffmpegThreads: -1 }, 'ffmpegThreads must be greater than or equal to zero.'],
      [{ path: 'D:/in/a.zip', webmCrf: 64 }, 'webmCrf must be between 0 and 63.'],
      [{ path: 'D:/in/a.zip', webmCpuUsed: 9 }, 'webmCpuUsed must be between 0 and 8.'],
      [{ path: 'D:/in/a.zip', mp4Preset: 'p8' }, 'mp4Preset must be p1 through p7.'],
      [{ path: 'D:/in/a.zip', mp4Cq: 64 }, 'mp4Cq must be between 0 and 63.'],
      [{ path: 'D:/in/a.zip', maxWorkers: -1 }, 'maxWorkers must be greater than or equal to zero.'],
    ]
    for (const [input, message] of cases) {
      const result = await runGifu(input, runtime())
      expect(result.success, `${JSON.stringify(input)} 本该被拒`).toBe(false)
      expect(result.message).toBe(message)
    }
    // 阳性对照：合法边界值必须放行（p7 / 63 / 8 / 6 都在区间内）。
    expect((await runGifu({ action: 'plan', path: 'D:/in/a.zip', mp4Preset: 'p7', mp4Cq: 63, webmCpuUsed: 8, webpMethod: 6 }, runtime())).success).toBe(true)
  })
})
