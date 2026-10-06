/**
 * `platform.ts` 那一层的验收：它把基线那份 `packages/nodes/gifu/src/platform.ts`（418 行）
 * 的"起外部程序"那一格换成了 DSH 的 `ctx.subprocess`，所以这里断的都是**换完之后仍然要说的那些话**。
 *
 * 三条尺各自的出处：
 * 1. `parse7zImageEntries` 的用例逐字手抄自基线 `platform.test.ts:5-26`（保留 7-Zip 的顺序、
 *    只留支持的图片扩展名、`Folder = +` 与 `Attributes = D` 都算目录、`.JXL` 的大写扩展名
 *    折成小写）——这条不测缝，测的是那份解析没被我"顺手改坏"。
 * 2. 缝的形状：`listArchiveImages` 先 `resolveExecutable('7z')` 再 `spawn(['7z','l','-slt','-ba',…])`，
 *    一次都不许出现本进程的 `child_process`。上游那份是用 `which` / `where.exe` **起进程去找**
 *    （基线 `:332-342`），所以"少起一条定位进程"是这条替换的净收益，要有断言撑着。
 * 3. 退出码那一格：基线是 `typeof error.code === "number" ? error.code : error ? 1 : 0`
 *    （`:357-361`）⇒ "被信号杀掉"（缝这里 `exitCode === null`）与"provider 直接失败"都折成 **1**，
 *    不是 0。这一格与 `plugins/mvz` 那条"上游折成 0"的怪**不同**，两份各钉自己的上游，不许统一。
 *
 * 没在这里覆盖的：基线 `platform.integration.test.ts`（真 7z + 真 ffmpeg 跑五种格式）不搬——
 * 那条要的是宿主进程里真的 `ctx.subprocess`，测试替身跑它等于测我自己的假件；
 * 本轮的证据等级是 compile-verified + fake-seam，真媒体编码留给接进宿主后的实机验证。
 *
 * @module xaihi-gifu/tests/platform
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { GifuConversionTask } from '../src/core.ts'
import {
  GIFU_PROCESS_SEAM_REFUSAL,
  __gifuPlatformTest,
  createGifuUnwiredRuntime,
  createNodeGifuRuntime,
  parse7zImageEntries,
  type GifuSubprocessHandle,
  type GifuSubprocessSeam,
  type GifuSubprocessSpawnSpec,
} from '../src/platform.ts'

/** 基线 `platform.test.ts:6-21` 那份夹具，逐字。 */
const SEVEN_ZIP_SLT = `Path = pages/002.png
Size = 12
Folder = -

Path = notes/readme.txt
Size = 4
Folder = -

Path = pages
Folder = +
Attributes = D

Path = pages/001.JXL
Size = 20
Folder = -
`

interface FakeOptions {
  resolve?: (command: string) => Promise<string>
  run?: (spec: GifuSubprocessSpawnSpec) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>
}

/** 记录每一次 `resolveExecutable` 与 `spawn` 的缝替身。 */
function fakeSeam(options: FakeOptions = {}) {
  const resolveAttempts: string[] = []
  const spawnSpecs: GifuSubprocessSpawnSpec[] = []
  const terminated: number[] = []
  const seam: GifuSubprocessSeam = {
    async resolveExecutable(command) {
      resolveAttempts.push(command)
      if (options.resolve) return await options.resolve(command)
      if (command === '7z') return '/usr/bin/7z'
      if (command === 'ffmpeg') return '/usr/bin/ffmpeg'
      if (command === 'ffprobe') return '/usr/bin/ffprobe'
      throw new Error(`not found: ${command}`)
    },
    spawn(spec) {
      spawnSpecs.push(spec)
      const texts = { stdout: '', stderr: '' }
      const index = spawnSpecs.length - 1
      const handle: GifuSubprocessHandle = {
        collected: {
          stdout: { readFrom: () => ({ text: texts.stdout }) },
          stderr: { readFrom: () => ({ text: texts.stderr }) },
        },
        done: (options.run ? options.run(spec) : Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })).then((outcome) => {
          texts.stdout = outcome.stdout
          texts.stderr = outcome.stderr
          return { exitCode: outcome.exitCode }
        }),
        terminate() {
          terminated.push(index)
        },
      }
      return handle
    },
  }
  return { seam, resolveAttempts, spawnSpecs, terminated }
}

function conversionTask(overrides: Partial<GifuConversionTask> = {}): GifuConversionTask {
  return {
    archivePath: '/tmp/in/a.zip',
    outputPath: '/tmp/in/[#dyna]a.webp',
    images: [{ path: '001.png', extension: '.png' }],
    format: 'webp',
    durationMs: 120,
    loop: 0,
    quality: 85,
    webpMethod: 2,
    ffmpegThreads: 0,
    webmCrf: 34,
    webmCpuUsed: 6,
    mp4Preset: 'p3',
    mp4Cq: 32,
    extractSingle: true,
    overwrite: false,
    ...overrides,
  }
}

describe('gifu platform helpers', () => {
  test('keeps 7-Zip archive order while filtering supported image entries', () => {
    const output = SEVEN_ZIP_SLT
    expect(parse7zImageEntries(output)).toEqual([
      { path: 'pages/002.png', extension: '.png', size: 12 },
      { path: 'pages/001.JXL', extension: '.jxl', size: 20 },
    ])
  })

  test('阳性对照：把 `Folder = +` 那条当成图片的那类改写会红', () => {
    // 夹具里 `pages` 是目录（`Folder = +` + `Attributes = D`），必须不进结果。
    expect(parse7zImageEntries('Path = pages\nFolder = +\nAttributes = D\n\n')).toEqual([])
    // 同一段去掉那两行就应当是两张：尺看得见 `Folder` 这一判据。
    expect(parse7zImageEntries('Path = pages/001.png\n\nPath = pages/002.png\n\n').map((entry) => entry.path))
      .toEqual(['pages/001.png', 'pages/002.png'])
  })
})

describe('gifu 的外部程序那一格只经 ctx.subprocess', () => {
  test('listArchiveImages：先解析裸名，再一次 `7z l -slt -ba`，六条候选之外的东西不起进程去找', async () => {
    const { seam, resolveAttempts, spawnSpecs } = fakeSeam({
      run: async () => ({ exitCode: 0, stdout: SEVEN_ZIP_SLT, stderr: '' }),
    })
    const runtime = createNodeGifuRuntime(seam, '/tmp')
    const images = await runtime.listArchiveImages('/tmp/in/a.zip')
    expect(images.map((entry) => entry.path)).toEqual(['pages/002.png', 'pages/001.JXL'])
    expect(resolveAttempts).toEqual(['7z'])
    expect(spawnSpecs).toHaveLength(1)
    expect(spawnSpecs[0]?.argv).toEqual(['/usr/bin/7z', 'l', '-slt', '-ba', '/tmp/in/a.zip'])
    expect(spawnSpecs[0]?.cwd).toBe('/tmp')
    // stdio 三根都得显式给（那条缝不给默认值），收集上限对齐基线那次的 64 MiB。
    expect(spawnSpecs[0]?.stdio).toEqual({ stdin: 'ignore', stdout: { maxBytes: 64 * 1024 * 1024 }, stderr: { maxBytes: 64 * 1024 * 1024 } })
    expect(spawnSpecs[0]?.graceMs).toBeGreaterThan(0)
  })

  test('7-Zip 非零退出时说的是缝交回来的那段话（不在这儿另写一句失败）', async () => {
    const { seam } = fakeSeam({ run: async () => ({ exitCode: 2, stdout: '', stderr: 'Data Error : unsupported compression' }) })
    const runtime = createNodeGifuRuntime(seam, '/tmp')
    await expect(runtime.listArchiveImages('/tmp/in/a.zip')).rejects.toThrow('Data Error : unsupported compression')
  })

  test('阳性对照：找不到 7-Zip 时报的是基线那句原文，候选名单跑满六条', async () => {
    const { seam, resolveAttempts } = fakeSeam({ resolve: async (command) => { throw new Error(`not found: ${command}`) } })
    const runtime = createNodeGifuRuntime(seam, '/tmp')
    await expect(runtime.listArchiveImages('/tmp/in/a.zip')).rejects.toThrow('7-Zip was not found. Install 7-Zip or add 7z to PATH.')
    // 基线 `:16` 那份名单一条不减、顺序不改。
    expect(resolveAttempts).toEqual(['7z', '7zz', '7za', '7z.exe', '7zz.exe', '7za.exe'])
  })

  test('退出码那一格：null（信号杀掉）折成 1，provider 直接失败也折成 1', async () => {
    // 基线那句拼法是 `result.stderr || result.stdout || \`7-Zip exited with code ${code}\``
    // （`core.ts:40` 与 `platform.ts:40`），所以话优先、兜底句最后。
    const signalled = fakeSeam({ run: async () => ({ exitCode: null, stdout: 'partial', stderr: '' }) })
    const runtime = createNodeGifuRuntime(signalled.seam, '/tmp')
    // 被信号杀掉 ⇒ 退出码 1 ⇒ 这一条归档判成失败，不许被咽成成功。
    await expect(runtime.listArchiveImages('/tmp/in/a.zip')).rejects.toThrow('partial')

    const silent = fakeSeam({ run: async () => ({ exitCode: null, stdout: '', stderr: '' }) })
    await expect(createNodeGifuRuntime(silent.seam, '/tmp').listArchiveImages('/tmp/in/a.zip'))
      .rejects.toThrow('7-Zip exited with code 1.')

    const rejected = fakeSeam({ resolve: async () => '/usr/bin/7z' })
    rejected.seam.spawn = () => {
      throw new Error('provider refused to spawn')
    }
    const second = createNodeGifuRuntime(rejected.seam, '/tmp')
    await expect(second.listArchiveImages('/tmp/in/a.zip')).rejects.toThrow('provider refused to spawn')
  })

  test('cancel() 把还活着的句柄交给缝的 terminate，之后 convertArchive 当场拒绝', async () => {
    const { seam, spawnSpecs, terminated } = fakeSeam({ run: () => new Promise(() => { /* 不落地：模拟一条还在跑的 ffmpeg */ }) })
    const runtime = createNodeGifuRuntime(seam, '/tmp')
    expect(runtime.isCancelled?.()).toBe(false)
    // 起一条不结束的 7-Zip，等它被登记进 children，再取消：
    // 这一格要断的是"取消真的把 terminate 交出去"，而不是只翻一个布尔。
    void runtime.listArchiveImages('/tmp/in/a.zip')
    for (let attempt = 0; attempt < 50 && spawnSpecs.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(spawnSpecs, '夹具没让 spawn 落进来，这条断言就成了假的').toHaveLength(1)
    runtime.cancel?.()
    // 基线是 `child.kill()` 逐个杀（`:54-57`）；这边是 `handle.terminate()`（types.d.ts:174），
    // 管的是整棵被托管的进程范围。
    expect(terminated).toEqual([0])
    expect(runtime.isCancelled?.()).toBe(true)
    await expect(runtime.convertArchive(conversionTask())).rejects.toThrow('Conversion cancelled.')
    // 缺口 G3：`NodeCall` 不往下传取消信号 ⇒ 宿主动作路径今天没人调用 `cancel()`。
    // 搬它不是为了接一条假信号，而是 `GifuRuntime` 声明了这一格（`core.ts:151`）就得给得出真行为。
  })

  test('convertArchive 找三条工具全部走缝：`which` / `where.exe` 一次都不起，缺 ffmpeg 说的是基线那句话', async () => {
    const { seam, resolveAttempts } = fakeSeam({
      resolve: async (command) => {
        if (command === '7z') return '/usr/bin/7z'
        throw new Error(`not found: ${command}`)
      },
    })
    const runtime = createNodeGifuRuntime(seam, '/tmp')
    await expect(runtime.convertArchive(conversionTask())).rejects.toThrow('ffmpeg was not found. Install ffmpeg or add it to PATH.')
    // 基线是"起一条 `which`/`where.exe` 去问"（`:332-342`）；这三条名单都必须走缝的
    // `resolveExecutable`，一次定位进程都不许多起。
    expect(resolveAttempts).toContain('ffmpeg')
    expect(resolveAttempts).toContain('ffmpeg.exe')
    expect(resolveAttempts).toContain('ffprobe')
    expect(resolveAttempts.some((entry) => entry === 'which' || entry === 'where.exe'), '不许再用定位进程找工具').toBe(false)
  })

  test('终端半边那条运行时，两个外部程序方法抛的就是同一句拒绝', async () => {
    const runtime = createGifuUnwiredRuntime()
    await expect(runtime.listArchiveImages('/tmp/a.zip')).rejects.toThrow(GIFU_PROCESS_SEAM_REFUSAL)
    await expect(runtime.convertArchive(conversionTask())).rejects.toThrow(GIFU_PROCESS_SEAM_REFUSAL)
  })

  test('`safeExtractedPath` 挡住归档条目里的目录穿越（基线 `:367-372` 那份守卫）', () => {
    // 那份守卫用的是**本平台**的 `resolve` / `relative` / `sep`（基线 `:6` 那份 import 就是
    // `node:path`，不是 `win32`），所以这里也按本平台的拼法给期望值：`C:\…` 那一类只在
    // Windows 上才是"绝对路径"，在 POSIX 上它就是一个普通文件名，不许拿它当越界证据。
    const root = resolve('/tmp/xaihi-gifu-work/archive')
    const inside = __gifuPlatformTest.safeExtractedPath(root, 'pages/001.png')
    expect(inside).not.toBeNull()
    expect(inside!.startsWith(root + sep)).toBe(true)
    expect(__gifuPlatformTest.safeExtractedPath(root, '../evil.png')).toBeNull()
    expect(__gifuPlatformTest.safeExtractedPath(root, '..\\..\\evil.png')).toBeNull()
    expect(__gifuPlatformTest.safeExtractedPath(root, '/etc/passwd')).toBeNull()
  })

  test('尺：内核、接线层与落地层的**代码**里都不许出现 `node:child_process`（外部程序只有一条路）', () => {
    // 判读的是剥掉注释之后的源码。这几份文件的**注释里**必须能写出"上游那一格是
    // `node:child_process.execFile`""基线用 `which` 起进程去找"这种话（搬运的账本），
    // 一把把出处说明也禁掉的尺就是假尺——与 `scripts/check-brand.mjs` 先剥注释同一个道理。
    const codeOf = (source: string): string => source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .join('\n')
    const read = (name: string): string => codeOf(readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8'))
    for (const name of ['core.ts', 'index.ts', 'platform.ts', 'cli.ts']) {
      const source = read(name)
      expect(source, `${name} 的代码里不许 import node:child_process`).not.toContain('node:child_process')
      expect(source, `${name} 的代码里不许直接起进程`).not.toMatch(/\bexecFile\(|\bexecSync\(|\bspawnSync\(|\bchild_process\b/)
    }
    // 阳性对照：这条尺必须看得见违规——栽一条真的 `execFile` 进去它就红（下面那条用同一把
    // 正则量一份栽出来的源码）；同时缝的动词要真的出现在 platform.ts 里，否则
    // "外部程序只经 ctx.subprocess"只是文件头里的一句话。
    const planted = "import { execFile } from 'node:child_process'\nconst run = await execFile('7z', ['l'])\n"
    expect(codeOf(planted)).toMatch(/\bexecFile\(|\bexecSync\(|\bspawnSync\(|\bchild_process\b/)
    const platform = read('platform.ts')
    expect(platform).toMatch(/subprocess\.spawn\(/)
    expect(platform).toMatch(/subprocess\.resolveExecutable\(/)
    expect(read('index.ts')).toContain("inject = ['tools', 'subprocess']")
  })
})
