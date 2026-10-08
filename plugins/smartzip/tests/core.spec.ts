/**
 * smartzip 内核的验收：**期望值逐条手抄**自基线 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/smartzip/src/core.test.ts`（14 条，含那条 `test.each` 的五个码页）
 * 与 `platform.test.ts`（3 条 ZIP 字节层），加两条落地缝的钉子。
 * 期望值不许由被测函数现算（AGENTS.md「判据要配阳性对照」）。
 *
 * 抄过来的东西一条没减：`••••` 那两条脱敏、`.xiranite/smartzip-runs.jsonl` 那三处字面路径、
 * `-mcp=<码页>` 的五个码页、`runSmartzip === runSmartZip` 那条别名、以及
 * "status / inspect_codepage 永远不碰 7-Zip"那两条。**只改了两处说明符**
 * （`./core.js` → `../src/core.ts`，`{ readText, appendRecord, find7z, execute }` 那份
 * 假 runtime 原样，因为内核只认那 6 个方法）。
 *
 * 本文件另外钉住三处"会被顺手改掉就再也读不回来"的形状：
 * 1. **`dryRun` 的内核默认是 false**（`core.ts:233`），而清单里那条字段的声明默认是 **true**
 *    ——两份都是真源，不许统一（缺口 G8 的成因；另一侧钉在 `tests/definition.spec.ts`）。
 * 2. **缺 `ctx.subprocess` 时说的那句是"够不到那条缝"，不是"7-Zip 没装"**
 *    （`src/platform.ts`）。阳性对照：喂一条假的 `runCommand` 之后，同一次调用改口说
 *    "7-Zip was not found…"——证明那句拒绝读的是缝，不是一句写死的成功词。
 * 3. **回收站那条拒绝不许退化成 `rm`**：抛过之后夹具里的文件必须**还在**。
 *
 * @module xaihi-smartzip/tests/core
 */

import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  actionMode,
  buildSmartZipCommand,
  buildSmartZipDatabase,
  buildSmartZipRunRecord,
  isArchivePath,
  normalizeSmartZipInput,
  parseSmartZipIni,
  runSmartZip,
  runSmartzip,
  type SmartZipRuntime,
} from '../src/core.ts'
import { NO_SUBPROCESS_MESSAGE, NO_TRASH_MESSAGE, createNodeSmartZipRuntime, detectZipFilenameEncoding, recyclePath } from '../src/platform.ts'

/** 上游 `core.test.ts` 那四份假 runtime 的公共底：内核只认这 6 个方法。 */
function stubRuntime (overrides: Partial<SmartZipRuntime> = {}): SmartZipRuntime {
  return {
    readText: async () => '',
    appendRecord: async () => {},
    find7z: async () => null,
    execute: async () => [],
    ...overrides,
  }
}

describe('smartzip core（逐条抄自上游 core.test.ts）', () => {
  it('parses ini sections', () => {
    const config = parseSmartZipIni('[set]\nzipDir=D:/7zip\npartSkip=1\nnesting=1\n[password]\n1=abc\n[ext]\n1=zip\n2=rar\n[renameName]\n1=sample<--->clean\n[menu]\ncontextMenu=0\n')
    expect(config.sevenZipDir).toBe('D:/7zip')
    expect(config.passwords).toEqual(['abc'])
    expect(config.contextMenu).toBe(false)
    expect(config.skipMultipart).toBe(true)
    expect(config.nestedExtraction).toBe(true)
    expect(config.renameNames).toEqual([{ match: 'sample', replacement: 'clean' }])
  })

  it('maps actions to SmartZip modes', () => {
    expect(actionMode('extract')).toBe('x')
    expect(actionMode('extract_codepage')).toBe('xc')
    expect(isArchivePath('a.cbz')).toBe(true)
  })

  it('builds native 7-Zip commands without SmartZip or AHK', () => {
    const command = buildSmartZipCommand({
      action: 'archive',
      paths: ['D:/a'],
      path: '',
      iniPath: '',
      iniText: '',
      passwords: [],
      codePage: 0,
      databasePath: '',
      recordRun: false,
      dryRun: false,
    }, '7z.exe')
    expect(command).toMatchObject({ command: '7z.exe', args: ['a', 'D:/a.zip', 'D:/a', '-y', '-sccUTF-8'] })
  })

  it('builds default JSONL database path', () => {
    const database = buildSmartZipDatabase(normalizeSmartZipInput({ path: 'D:/archives/a.zip' }))
    expect(database).toEqual({
      path: 'D:/archives/.xiranite/smartzip-runs.jsonl',
      enabled: false,
      mode: 'jsonl',
      defaultPath: true,
    })
  })

  it('summarizes run records', () => {
    const input = normalizeSmartZipInput({ action: 'extract', path: 'D:/archives/a.zip', dryRun: true })
    const config = parseSmartZipIni('[password]\n1=abc\n[ext]\n1=zip\n')
    const command = buildSmartZipCommand(input, '7z.exe')
    const record = buildSmartZipRunRecord('extract', input, config, input.paths, command)
    expect(record).toMatchObject({
      toolId: 'smartzip',
      action: 'extract',
      dryRun: true,
      archiveCount: 1,
      success: true,
    })
    expect(JSON.stringify(record)).not.toContain('abc')
  })

  it('runs dry-run without executable', async () => {
    const result = await runSmartZip({ action: 'status', path: 'a.zip' }, stubRuntime())
    expect(result.success).toBe(true)
    expect(result.data?.archiveCount).toBe(1)
    expect(result.data?.database?.path).toBe('.xiranite/smartzip-runs.jsonl')
  })

  it('records status when enabled', async () => {
    const records: Array<{ path: string; record: unknown }> = []
    const result = await runSmartZip({ action: 'status', path: 'D:/archives/a.zip', recordRun: true }, stubRuntime({
      appendRecord: async (path, record) => {
        records.push({ path, record })
      },
    }))
    expect(result.success).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]?.path).toBe('D:/archives/.xiranite/smartzip-runs.jsonl')
    expect(records[0]?.record).toMatchObject({ toolId: 'smartzip', action: 'status', archiveCount: 1 })
  })

  it('exports generated runner alias', () => {
    expect(runSmartzip).toBe(runSmartZip)
  })

  it('redacts configured passwords from node results', async () => {
    const result = await runSmartZip({ action: 'status', iniText: '[password]\n1=secret-value' }, stubRuntime())
    expect(result.data?.config.passwords).toEqual(['••••'])
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('merges managed passwords with INI passwords and keeps both redacted', async () => {
    const result = await runSmartZip({ action: 'status', passwords: ['managed-secret'], iniText: '[password]\n1=ini-secret' }, stubRuntime())
    expect(result.data?.config.passwords).toEqual(['••••', '••••'])
    expect(JSON.stringify(result)).not.toMatch(/managed-secret|ini-secret/)
  })

  it('returns filename encoding previews without requiring 7-Zip', async () => {
    const result = await runSmartZip({ action: 'inspect_codepage', path: 'D:/legacy.zip' }, stubRuntime({
      inspectCodePages: async (paths) => paths.map((sourcePath) => ({
        sourcePath,
        recommendedCodePage: 932,
        confidence: 'high' as const,
        unicodeMetadata: false,
        message: 'Shift_JIS recommended.',
        candidates: [{ codePage: 932, label: 'Shift_JIS / CP932', score: 40, preview: ['テスト.txt'] }],
      })),
    }))
    expect(result.success).toBe(true)
    expect(result.data?.encodingInspections?.[0]?.candidates[0]?.preview).toEqual(['テスト.txt'])
  })

  it.each([936, 950, 932, 949, 65001])('passes filename code page CP%s to 7-Zip', (codePage) => {
    const command = buildSmartZipCommand(normalizeSmartZipInput({ action: 'extract_codepage', path: 'D:/多言語.zip', codePage }), '7z.exe')
    expect(command.args).toContain(`-mcp=${codePage}`)
  })

  it('delegates the source-compatible workflow to the TypeScript platform', async () => {
    const requests: Array<{ paths: string[]; cli: string }> = []
    const result = await runSmartZip({ action: 'extract', paths: ['D:/a.zip', 'D:/b.7z'], dryRun: false }, stubRuntime({
      find7z: async () => ({ cli: 'C:/Program Files/7-Zip/7z.exe', fileManager: 'C:/Program Files/7-Zip/7zFM.exe' }),
      execute: async (request) => {
        requests.push({ paths: request.paths, cli: request.tools.cli })
        return request.paths.map((sourcePath) => ({ action: 'extract' as const, sourcePath, outputPath: sourcePath.replace(/\.[^.]+$/, ''), status: 'completed' as const, message: 'Extracted.', commandResult: { code: 0, stdout: 'ok', stderr: '' } }))
      },
    }))
    expect(result.success).toBe(true)
    expect(requests).toEqual([{ paths: ['D:/a.zip', 'D:/b.7z'], cli: 'C:/Program Files/7-Zip/7z.exe' }])
    expect(result.data?.operations).toHaveLength(2)
  })

  it('uses resolved first volumes in directory dry-run plans', async () => {
    const result = await runSmartZip({ action: 'extract', path: 'D:/volumes', dryRun: true }, stubRuntime({
      resolveInputPaths: async () => ['D:/volumes/a.7z.001', 'D:/volumes/b.7z.001'],
    }))
    expect(result.success).toBe(true)
    expect(result.data?.operations?.map((operation) => operation.sourcePath)).toEqual([
      'D:/volumes/a.7z.001',
      'D:/volumes/b.7z.001',
    ])
  })
})

describe('smartzip 内核的两处默认值分歧（缺口 G8 的内核那一侧）', () => {
  it('内核的 dryRun 默认是 false：没表过态就是"要执行"', () => {
    expect(normalizeSmartZipInput({ action: 'archive' }).dryRun).toBe(false)
    // 阳性对照：清单那一侧声明的默认是 true（`tests/definition.spec.ts` 钉它），
    // 把内核这条改成 true 会让上面这条红，而两份真源一旦统一就再也读不出分歧在哪。
    expect(normalizeSmartZipInput({ action: 'archive', dryRun: true }).dryRun).toBe(true)
  })

  it('recordRun 的默认是 Boolean(databasePath)，它是库路径的推论而不是第三个开关', () => {
    expect(normalizeSmartZipInput({ action: 'status' }).recordRun).toBe(false)
    expect(normalizeSmartZipInput({ action: 'status', databasePath: 'D:/runs.jsonl' }).recordRun).toBe(true)
    // 显式 false 必须赢过库路径：`??` 不是 `||`。
    expect(normalizeSmartZipInput({ action: 'status', databasePath: 'D:/runs.jsonl', recordRun: false }).recordRun).toBe(false)
  })
})

describe('smartzip 的 ZIP 字节层（逐条抄自上游 platform.test.ts）', () => {
  it('trusts explicit ZIP UTF-8 filename metadata', () => {
    const name = new TextEncoder().encode('日本語/测试.txt')
    const result = detectZipFilenameEncoding(zipWithCentralName(name, 0x0800), 'unicode.zip')
    expect(result).toMatchObject({ recommendedCodePage: 65001, confidence: 'certain', unicodeMetadata: true })
    expect(result.candidates[0]?.preview).toEqual(['日本語/测试.txt'])
  })

  it('recommends Shift_JIS when the filename preview contains kana', () => {
    const shiftJisName = Uint8Array.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x2e, 0x74, 0x78, 0x74]) // テスト.txt
    const result = detectZipFilenameEncoding(zipWithCentralName(shiftJisName), 'legacy.zip')
    expect(result.recommendedCodePage).toBe(932)
    expect(result.candidates.find((candidate) => candidate.codePage === 932)?.preview).toEqual(['テスト.txt'])
    expect(['high', 'medium', 'low']).toContain(result.confidence)
  })

  it('does not force a codepage for ASCII-only filenames', () => {
    const result = detectZipFilenameEncoding(zipWithCentralName(new TextEncoder().encode('folder/readme.txt')), 'ascii.zip')
    expect(result.recommendedCodePage).toBeUndefined()
    expect(result.candidates).toEqual([])
    expect(result.confidence).toBe('certain')
  })
})

describe('smartzip 落地缝的两条可见拒绝（G1/G6 与 G-no-os-trash）', () => {
  const dirs: string[] = []

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
  })

  it('status 在独立 bin 里真的跑得通：缝是 node:fs，不需要 ctx.subprocess', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-fs-'))
    dirs.push(root)
    const iniPath = join(root, 'SmartZip.ini')
    await writeFile(iniPath, '[set]\nzipDir=D:/7zip\n[password]\n1=from-ini\n', 'utf8')
    const result = await runSmartZip({ action: 'status', iniPath }, createNodeSmartZipRuntime())
    expect(result.success).toBe(true)
    expect(result.data?.config.sevenZipDir).toBe('D:/7zip')
    // 阳性对照：读得到 INI 里那条密码（脱敏成 `••••` 是内核 `data()` 的事），
    // 说明这句成功来自一次真的 `readFile`，不是空默认表。
    expect(result.data?.config.passwords).toEqual(['••••'])
    expect(JSON.stringify(result)).not.toContain('from-ini')
  })

  it('archive 的 --dryRun 在 bin 里出计划，而且一个文件都不造', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-plan-'))
    dirs.push(root)
    const source = join(root, 'holiday')
    await writeFile(join(root, 'a.bin'), 'a', 'utf8')
    const result = await runSmartZip({ action: 'archive', paths: [source], dryRun: true }, createNodeSmartZipRuntime())
    expect(result.success).toBe(true)
    expect(result.message).toContain('TypeScript-planned operation(s)')
    // 计划行由内核的 `buildSmartZipCommand` 出（占位名 `7z`，因为 dryRun 跳过 find7z）。
    expect(result.data?.command).toMatchObject({ command: '7z', args: ['a', `${source}.zip`, source, '-y', '-sccUTF-8'] })
    expect(await readdir(root)).toEqual(['a.bin'])
  })

  it('缺 ctx.subprocess 时那句是"够不到那条缝"，不是"7-Zip 没装"', async () => {
    const result = await runSmartZip({ action: 'extract', paths: ['D:/a.zip'] }, createNodeSmartZipRuntime())
    expect(result.success).toBe(false)
    expect(result.message).toBe(NO_SUBPROCESS_MESSAGE)
    expect(result.data?.errors).toEqual([NO_SUBPROCESS_MESSAGE])
  })

  it('阳性对照：喂一条 runCommand 之后同一句改口成"7-Zip was not found"，拒绝不是写死的', async () => {
    const result = await runSmartZip({ action: 'extract', paths: ['D:/a.zip'] }, createNodeSmartZipRuntime({
      runCommand: async () => ({ code: 1, stdout: '', stderr: 'not found' }),
    }))
    expect(result.success).toBe(false)
    expect(result.message).not.toBe(NO_SUBPROCESS_MESSAGE)
    expect(result.message).toContain('7-Zip was not found')
    expect(result.message).toContain('SmartZip.exe and AutoHotkey are never required.')
  })

  it('回收站那条拒绝不许退化成 rm：抛过之后文件必须还在', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-trash-'))
    dirs.push(root)
    const victim = join(root, 'precious.zip')
    await writeFile(victim, 'do not delete me', 'utf8')
    await expect(recyclePath(victim)).rejects.toThrow(NO_TRASH_MESSAGE)
    expect(await readdir(root)).toEqual(['precious.zip'])
    // 阳性对照：这条尺看得见"真删了"——同一目录用 rm 删掉之后它必须红。
    const { rm } = await import('node:fs/promises')
    await rm(victim)
    expect(await readdir(root)).toEqual([])
  })
})

/** 上游 `platform.test.ts:56-66` 那份夹具：一条中央目录项 + EOCD，逐字节一致。 */
function zipWithCentralName (name: Uint8Array, flags = 0): Uint8Array {
  const central = Buffer.alloc(46 + name.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(flags, 8)
  central.writeUInt16LE(name.length, 28)
  Buffer.from(name).copy(central, 46)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(0, 16)
  return Buffer.concat([central, eocd])
}
