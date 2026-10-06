/**
 * Repacku 的执行后端验收：这里测的是**新写的那一半**（`ctx.subprocess` 那条缝），
 * 不是内核——内核由 `tests/core.spec.ts` 用上游那份假 runtime 守。
 *
 * 为什么必须有这一份：`src/index.ts` 的接线要在宿主进程里才跑得起来，本批改不到实机宿主，
 * 所以"压缩这一程到底有没有经 DSH 的缝出去"必须用一台假 `SubprocessRuntime` 当场读回来，
 * 而不是只靠 `tsc` 编译过。判据是**发出去的 argv、cwd、清单文件的内容**（那是 7-Zip 的
 * list-file 语法、`-sccUTF-8` 那两条中文编码开关、`-mx=` 的夹取）与**结局的四种形状**
 * （成功 / 没装压缩程序 / 非零退出 / 源目录不是目录）。
 *
 * 假 runtime 会替"7z"把目标归档真的写出来（40 个字节），那是**夹具**在模拟子进程的副作用，
 * 不是本包在压东西——所以下面没有任何一条断言声称"一个真归档被造出来了"。
 *
 * 阳性对照分布：
 * - 每台假机器都记 `spawned`，"没装压缩程序"那条断的是 `spawned.length === 0`；
 * - `createRepackuPlannerRuntime()`（bin 那一档）两条 `compress*` 必须**抛**，抛的是那句
 *   点名 `ctx.subprocess` 的原话，而文件那一半在这档里照常能用；
 * - 源码扫描那把尺（"本包不许 import `node:child_process`"）自带一处"造出来的违规必须被抓到"。
 *
 * @module xaihi-repacku/tests/platform
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { analyzeFolderStructure } from '../src/core.ts'
import { REPACKU_EXECUTION_REFUSAL, createRepackuPlannerRuntime, createSubprocessRepackuRuntime } from '../src/platform.ts'

interface SpawnRecord {
  argv: string[]
  cwd: string
  graceMs: number
  stdin: unknown
  stdout: unknown
  stderr: unknown
  /** 7z 的 `@<listFile>` 那颗：路径 + **spawn 当时**读到的内容（临时目录随后会被 `finally` 删掉）。 */
  listPath: string
  listText: string
}

interface FakeOptions {
  /** 每条 spawn 的结局；缺省 0。 */
  exitCode?: number
  stderr?: string
  /** 可执行文件解析：`name → 路径`；命中即成功，否则像 provider 那样抛。 */
  executables?: Record<string, string>
  /** 让假"7z"把目标归档真的写出来（模拟子进程的副作用）。 */
  writeArchive?: boolean
}

/** 假"7z"该写的那份归档：`a -tzip <target> …` 里 `-tzip` 的下一颗。 */
function archiveOf (argv: string[]): string {
  return argv[argv.indexOf('-tzip') + 1] ?? ''
}

function fakeSubprocess (options: FakeOptions = {}) {
  const spawned: SpawnRecord[] = []
  let executableLookups: string[] = []
  const runtime = {
    spawn (spec: { argv: readonly string[]; cwd: string; graceMs: number; stdio: { stdin: unknown; stdout: unknown; stderr: unknown } }): SubprocessHandle {
      const argv = [...spec.argv]
      const listPath = (argv.find((part) => part.startsWith('@')) ?? '').slice(1)
      const record: SpawnRecord = {
        argv,
        cwd: spec.cwd,
        graceMs: spec.graceMs,
        stdin: spec.stdio.stdin,
        stdout: spec.stdio.stdout,
        stderr: spec.stdio.stderr,
        listPath,
        listText: '',
      }
      spawned.push(record)
      const code = options.exitCode ?? 0
      const stderrText = options.stderr ?? ''
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
          ...(stderrText === '' ? {} : { stderr: { readFrom: () => ({ text: stderrText, nextOffset: stderrText.length, lossy: false }) } }),
        },
        done: (async () => {
          // 清单必须在**这一刻**读：`run7zWithList` 的 `finally` 随后就把临时目录删了。
          if (listPath !== '') record.listText = await readFile(listPath, 'utf8')
          if (code === 0 && options.writeArchive === true) await writeFile(archiveOf(argv), 'z'.repeat(40))
          return { exitCode: code, signal: null }
        })(),
        terminate: () => undefined,
        waitForExit: async () => true,
      } as unknown as SubprocessHandle
    },
    async resolveExecutable (command: string): Promise<string> {
      executableLookups.push(command)
      const found = options.executables?.[command]
      if (found !== undefined) return found
      throw new Error(`SubprocessExecutableNotFoundError: ${command}`)
    },
    terminalEnvironment: async () => ({ platform: process.platform, shell: '/bin/sh' }),
    spawnTerminal: async () => {
      throw new Error('repacku 不占终端')
    },
  }
  return {
    runtime: runtime as never,
    spawned,
    lookups: () => executableLookups,
  }
}

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

/**
 * 夹具根目录。这里要小心一件事，而且是内核的**真行为**：`BLACKLIST_KEYWORDS`
 * （core.ts:148-162）是按整条路径的小写子串判的，`$TMPDIR` 下那种 `tmp.XXXXX` 名字
 * 会让每一层都被判成 skip（实测：`mktemp -d` 造的目录跑 `xrepacku analyze` 回
 * `Folder could not be analyzed.`）。所以夹具只保证自己那段前缀不含黑名单词，
 * 下面另有一条用例专门钉那条黑名单行为本身。
 */
async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-repacku-plat-${label}-`))
  tempRoots.push(root)
  return root
}

async function makeSourceFolder (root: string, name: string, files: Record<string, number>): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  for (const [file, bytes] of Object.entries(files)) {
    await writeFile(join(dir, file), 'a'.repeat(bytes))
  }
  return dir
}

/** 从 7z 的 argv 里把 `-mx=` 那颗挑出来。 */
function mxOf (argv: string[]): string | undefined {
  return argv.find((part) => part.startsWith('-mx='))
}

describe('repacku 的压缩后端（ctx.subprocess）', () => {
  it('整目录打包：7z 的 list-file 语法、编码开关与 cwd 都按上游那一条', async () => {
    const root = await tempRoot('whole')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 100, '002.png': 50 })
    const target = join(root, 'book.zip')
    const fake = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' }, writeArchive: true })
    const result = await createSubprocessRepackuRuntime(fake.runtime, root).compressWholeFolder(source, target, {})

    expect(result.success).toBe(true)
    expect(result.originalSize).toBe(150)
    expect(result.compressedSize).toBe(40)
    expect(result.command).toBe('7z')

    expect(fake.spawned).toHaveLength(1)
    const [spawned] = fake.spawned
    expect(spawned?.argv.slice(0, 3)).toEqual(['/usr/bin/7z', '-sccUTF-8', '-scsUTF-8'])
    for (const part of ['a', '-tzip', target, '-r', '-mmt=on', '-aou']) {
      expect(spawned?.argv, `7z 少了 ${part}`).toContain(part)
    }
    expect(mxOf(spawned?.argv)).toBe('-mx=7')
    // 上游那条 cwd：整目录打包时 cwd 是**来源的父目录**，清单里只有那一个目录名（BOM 打头）。
    expect(spawned?.cwd).toBe(root)
    expect(spawned?.listText).toBe(`${'﻿'}book\n`)
    expect(spawned?.stdin).toBe('ignore')
    expect((spawned?.stdout as { maxBytes?: number } | undefined)?.maxBytes).toBe(1024 * 1024 * 32)
    // 阳性对照：临时清单目录用完就删（`finally` 那一条）；归档落在**同级**，不是目录内部。
    expect(existsSync(dirname(spawned?.listPath ?? '/nope'))).toBe(false)
    expect(dirname(target)).toBe(root)
    expect(spawned?.graceMs).toBeGreaterThan(0)
  })

  it('散文件打包：清单是命中的原始文件名，压缩率可配并被夹在 0..9', async () => {
    const root = await tempRoot('files')
    const source = await makeSourceFolder(root, 'mixed', { '001.jpg': 10, '002.PNG': 20, 'note.txt': 5 })
    const target = join(source, 'mixed.zip')
    const fake = fakeSubprocess({ executables: { '7zz': '/usr/bin/7zz' } })
    const result = await createSubprocessRepackuRuntime(fake.runtime, root, { compressionLevel: 12 })
      .compressFiles(source, target, ['.jpg', '.png'], {})

    expect(result.success).toBe(true)
    const [spawned] = fake.spawned
    expect(spawned?.argv[0]).toBe('/usr/bin/7zz')
    // `.PNG` 的大写扩展名也算命中（`matchingDirectFiles` 比的是 lowercase 集合），
    // 但清单里写的是**原始文件名**，不是小写后的名字。
    expect(spawned?.listText).toBe(`${'﻿'}001.jpg\n002.PNG\n`)
    expect(mxOf(spawned?.argv)).toBe('-mx=9')
    // 上游那条 cwd：散文件打包时 cwd 就是来源目录，且**不带** `-r`。
    expect(spawned?.cwd).toBe(source)
    expect(spawned?.argv).not.toContain('-r')
    // 阳性对照：目标 zip 自己不算进清单（`resolve(path) === target` 那条 continue），
    // 不在扩展名集合里的 note.txt 也不算。
    expect(spawned?.listText).not.toContain('mixed.zip')
    expect(spawned?.listText).not.toContain('note.txt')
    // 阳性对照：selective 的归档落在**目录内部**（core.ts:302）。
    expect(dirname(target)).toBe(source)
  })

  it('压缩率 0 原样，非法值折回 7', async () => {
    const root = await tempRoot('level')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const zero = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' } })
    await createSubprocessRepackuRuntime(zero.runtime, root, { compressionLevel: 0 })
      .compressFiles(source, join(source, 'a.zip'), ['.jpg'], {})
    expect(mxOf(zero.spawned[0]?.argv ?? [])).toBe('-mx=0')

    // 阳性对照：`Number(undefined ?? 7)` 那条兜底（上游 `platform.ts:277-280` 同款）。
    const nan = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' } })
    await createSubprocessRepackuRuntime(nan.runtime, root, { compressionLevel: Number.NaN })
      .compressFiles(source, join(source, 'b.zip'), ['.jpg'], {})
    expect(mxOf(nan.spawned[0]?.argv ?? [])).toBe('-mx=7')
  })

  it('配好的 7-Zip 文件优先，且一次都不去 PATH 里找', async () => {
    const root = await tempRoot('configured')
    const exe = join(root, 'my7z')
    await writeFile(exe, '#!/bin/sh\nexit 0\n')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const fake = fakeSubprocess({ executables: { '7z': '/should/not/be/used' } })
    await createSubprocessRepackuRuntime(fake.runtime, root, { sevenZipPath: exe })
      .compressFiles(source, join(source, 'book.zip'), ['.jpg'], {})
    expect(fake.spawned[0]?.argv[0]).toBe(exe)
    // 阳性对照：配了就不猜。
    expect(fake.lookups()).toEqual([])
  })

  it('配的是目录：按上游那六个候选名在里面找；配错了才回退到 PATH', async () => {
    const root = await tempRoot('configdir')
    const binDir = join(root, 'bin')
    await mkdir(binDir, { recursive: true })
    const exe = join(binDir, '7za')
    await writeFile(exe, '#!/bin/sh\nexit 0\n')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const fake = fakeSubprocess({})
    await createSubprocessRepackuRuntime(fake.runtime, root, { sevenZipPath: binDir })
      .compressFiles(source, join(source, 'book.zip'), ['.jpg'], {})
    expect(fake.spawned[0]?.argv[0]).toBe(exe)
    expect(fake.lookups()).toEqual([])

    // 阳性对照：配了一个不存在的东西，就回退到 PATH 探测（六条候选名按上游顺序问完），
    // 问不到就是那句原文失败，不发 spawn。
    const missing = fakeSubprocess({})
    const result = await createSubprocessRepackuRuntime(missing.runtime, root, { sevenZipPath: join(root, 'nope'), platform: 'darwin' })
      .compressFiles(source, join(source, 'x.zip'), ['.jpg'], {})
    expect(missing.spawned).toHaveLength(0)
    expect(missing.lookups()).toEqual(['7z', '7zz', '7za', '7z.exe', '7zz.exe', '7za.exe'])
    expect(result.error).toBe('No compressor found. Install 7-Zip or use Windows PowerShell Compress-Archive.')
  })

  it('没装压缩程序：回上游那句原文，一条 spawn 都不发', async () => {
    const root = await tempRoot('nocompressor')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const fake = fakeSubprocess({})
    const result = await createSubprocessRepackuRuntime(fake.runtime, root, { platform: 'darwin' })
      .compressWholeFolder(source, join(root, 'book.zip'), {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('No compressor found. Install 7-Zip or use Windows PowerShell Compress-Archive.')
    expect(fake.spawned).toHaveLength(0)
    // 阳性对照：六个候选名都问过 PATH，而非 win32 **不**问 powershell.exe。
    expect(fake.lookups()).toEqual(['7z', '7zz', '7za', '7z.exe', '7zz.exe', '7za.exe'])

    const win = fakeSubprocess({})
    await createSubprocessRepackuRuntime(win.runtime, root, { platform: 'win32' })
      .compressWholeFolder(source, join(root, 'book.zip'), {})
    // 阳性对照：换成 win32 时 powershell.exe 是名单末尾那条兜底。
    const looked = win.lookups()
    expect(looked[looked.length - 1]).toBe('powershell.exe')
  })

  it('win32 的 PowerShell 兜底：六个 flag 与 Compress-Archive 的字面量拼法', async () => {
    const root = await tempRoot('powershell')
    const source = await makeSourceFolder(root, "it's a book", { '001.jpg': 1 })
    const target = join(root, 'book.zip')
    const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const fake = fakeSubprocess({ executables: { 'powershell.exe': ps } })
    const result = await createSubprocessRepackuRuntime(fake.runtime, root, { platform: 'win32' })
      .compressWholeFolder(source, target, {})

    expect(result.success).toBe(true)
    expect(result.command).toBe('powershell')
    const [spawned] = fake.spawned
    expect(spawned?.argv[0]).toBe(ps)
    for (const flag of ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']) {
      expect(spawned?.argv, `powershell 少了 ${flag}`).toContain(flag)
    }
    const script = spawned?.argv[(spawned?.argv.length ?? 0) - 1] ?? ''
    expect(script).toContain('$ErrorActionPreference = \'Stop\'')
    expect(script).toContain('$ProgressPreference = \'SilentlyContinue\'')
    expect(script).toContain('Compress-Archive -LiteralPath $paths')
    expect(script).toContain(`-DestinationPath '${target}' -Force`)
    // 阳性对照：路径是 PowerShell 单引号字面量，名字里那对单引号必须翻倍（`it's a book`）。
    expect(script).toContain(`$paths = @('${source.replace(/'/g, "''")}')`)
    // 阳性对照：PowerShell 那一支不写 7z 的清单文件。
    expect(spawned?.listText).toBe('')
  })

  it('非零退出：错误文本取 stderr 尾部，成功与否不许被咽掉', async () => {
    const root = await tempRoot('fail')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const fake = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' }, exitCode: 2, stderr: 'System ERROR: 磁盘已满' })
    const result = await createSubprocessRepackuRuntime(fake.runtime, root)
      .compressFiles(source, join(source, 'book.zip'), ['.jpg'], {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('System ERROR: 磁盘已满')
    expect(result.compressedSize).toBe(0)

    // 阳性对照：800 字符以上的尾部截断（上游 `shortError`），截出来还是"失败"。
    const long = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' }, exitCode: 1, stderr: 'x'.repeat(1200) })
    const longResult = await createSubprocessRepackuRuntime(long.runtime, root)
      .compressFiles(source, join(source, 'c.zip'), ['.jpg'], {})
    expect(longResult.success).toBe(false)
    expect(longResult.error?.startsWith('...')).toBe(true)
    expect(longResult.error?.length).toBe(800)
  })

  it('provider 拒绝（可执行文件中途没了）折成一次失败，不是抛给调用方', async () => {
    const root = await tempRoot('reject')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 1 })
    const runtime = createSubprocessRepackuRuntime({
      spawn: () => ({
        collected: {},
        done: Promise.reject(new Error('spawn ENOENT')),
        terminate: () => undefined,
        waitForExit: async () => true,
      }),
      resolveExecutable: async () => '/usr/bin/7z',
    } as never, root)
    const result = await runtime.compressFiles(source, join(source, 'book.zip'), ['.jpg'], {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('spawn ENOENT')
  })

  it('来源不是目录时先拒绝，连压缩程序都不去找', async () => {
    const root = await tempRoot('notadir')
    const file = join(root, 'plain.txt')
    await writeFile(file, 'x')
    const fake = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' } })
    const result = await createSubprocessRepackuRuntime(fake.runtime, root).compressWholeFolder(file, join(root, 'plain.zip'), {})
    expect(result.error).toBe(`Source is not a directory: ${file}`)
    expect(fake.spawned).toHaveLength(0)
    expect(fake.lookups()).toEqual([])
  })

  it('deleteSource：整目录删源，散文件只删命中的那些', async () => {
    const root = await tempRoot('deletesource')
    const whole = await makeSourceFolder(root, 'book', { '001.jpg': 10 })
    const mixed = await makeSourceFolder(root, 'mixed', { '001.jpg': 10, 'note.txt': 5 })
    const fake = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' }, writeArchive: true })
    const runtime = createSubprocessRepackuRuntime(fake.runtime, root)

    expect((await runtime.compressWholeFolder(whole, join(root, 'book.zip'), { deleteSource: true })).success).toBe(true)
    expect(existsSync(whole)).toBe(false)

    expect((await runtime.compressFiles(mixed, join(mixed, 'mixed.zip'), ['.jpg'], { deleteSource: true })).success).toBe(true)
    expect(await readdir(mixed)).toEqual(['mixed.zip', 'note.txt'])

    // 阳性对照：不给 deleteSource 就一条都不删。
    const keep = await makeSourceFolder(root, 'kept', { '001.jpg': 10 })
    const plain = fakeSubprocess({ executables: { '7z': '/usr/bin/7z' }, writeArchive: true })
    await createSubprocessRepackuRuntime(plain.runtime, root).compressFiles(keep, join(keep, 'kept.zip'), ['.jpg'], {})
    expect(await readdir(keep)).toEqual(['001.jpg', 'kept.zip'])
  })

  it('黑名单那条真行为：路径里含 tmp 时整棵树分析不出来', async () => {
    const root = await tempRoot('blacklist')
    const source = await makeSourceFolder(root, 'book', { '001.jpg': 10, '002.jpg': 10 })
    const tmpish = join(root, 'a-tmp-dir')
    await mkdir(tmpish, { recursive: true })
    expect(await analyzeFolderStructure(tmpish, createRepackuPlannerRuntime())).toBeNull()
    // 阳性对照：同一层换个不含黑名单词的名字就能分析出来——不是夹具坏了。
    expect((await analyzeFolderStructure(source, createRepackuPlannerRuntime()))?.name).toBe(basename(source))
  })
})

describe('repacku 的执行后端边界', () => {
  it('bin 那一档的 compress* 一律抛，抛的是那句点名 ctx.subprocess 的原话', async () => {
    const runtime = createRepackuPlannerRuntime()
    await expect(runtime.compressWholeFolder('/tmp/a', '/tmp/a.zip', {})).rejects.toThrow(REPACKU_EXECUTION_REFUSAL)
    await expect(runtime.compressFiles('/tmp/a', '/tmp/a.zip', ['.jpg'], {})).rejects.toThrow(REPACKU_EXECUTION_REFUSAL)
    expect(REPACKU_EXECUTION_REFUSAL).toContain('ctx.subprocess')
    expect(REPACKU_EXECUTION_REFUSAL).toContain('dsh-subprocess-local')
    expect(REPACKU_EXECUTION_REFUSAL).toContain('ctx.approval')
    // 阳性对照：文件那一半在这档里是**能用**的（bin 的 analyze 靠它），所以两条腿不许一起拒。
    const info = await runtime.pathInfo(tmpdir())
    expect(info.exists).toBe(true)
    expect(info.isDirectory).toBe(true)
    expect(runtime.resolve('/a//b/')).toBe(join('/a', 'b'))
  })

  it('本包的源码里不许出现 node:child_process（尺 + 阳性对照）', async () => {
    const { readFileSync } = await import('node:fs')
    const importsChildProcess = (text: string): boolean => /from ['"]node:child_process['"]/.test(text)
    for (const file of ['src/core.ts', 'src/platform.ts', 'src/index.ts', 'src/cli.ts', 'src/help.ts', 'src/cli-support.ts']) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      expect(importsChildProcess(text), `${file} 自己 spawn 了——外部程序只许经 ctx.subprocess`).toBe(false)
    }
    // 阳性对照：这把尺必须抓得到造出来的违规（上游那份就是这种写法）。
    expect(importsChildProcess('import { execFile } from "node:child_process"')).toBe(true)
  })
})
