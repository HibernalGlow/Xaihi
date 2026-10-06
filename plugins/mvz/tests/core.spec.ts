/**
 * mvz 内核的保真度用例：**期望值逐条手抄**自基线
 * `<Xiranite>/packages/nodes/mvz/src/core.test.ts`（115 行、7 条用例、那份 `createMemoryRuntime`
 * 假运行时也照抄），不是从被测函数现算的。改名只有一处：上游的 `test()` 换成 `it()`，
 * 与同批 `plugins/nameu/tests/core.spec.ts` 一致。
 *
 * 上游那 7 条钉的东西（行号指上游那份 test 文件）：
 * - `:6` 紧凑行与 `2024-01-02 03:04:05 1.5K …` 那种长行都能解析，非条目行回 `null`；
 * - `:16` 按归档分组；
 * - `:22` **预演不需要 7-Zip**（假运行时的 `find7z` 压根不会被调）；
 * - `:37` delete 真的把 `["7z-real","d",archive,…]` 交给 runtime；
 * - `:48` move 的预演是 `extract` + `delete` 两条预览，结果行里带 `&&`；
 * - `:62` move 执行时 **`argv[0]` 不重复**（两条命令各一次，参数里不再夹命令名）；
 * - `:79` rename 的成对 `old -> next`。
 *
 * 在这个基础上补三条本仓才有的判据：
 * 1. **`dryRun` 默认值分歧的"内核那一侧"**（清单那一侧钉在 `tests/definition.spec.ts`）：
 *    `core.ts:112` 是 `input.dryRun ? "7z" : await runtime.find7z()` ⇒ **省略即执行**。
 *    上游的 7 条用例没有一条把这条钉住（它只钉了"给了 dryRun 就不问 7z"），这里补一条，
 *    两份默认值各钉各的，不许统一（`plugins/rawfilter` 的 `dryRun` 是同一个先例）。
 * 2. **exit code 1 也算成功**（`core.ts:176`、`:220`）：delete 与 move 的宽判。
 * 3. **`MvzRuntime` 那 8 个方法是唯一的出机器口**：假运行时之外没有第二条路，
 *    `src/platform.ts` 的 `createMvzPlanRuntime()` 里那两个 throw 因此是**可测的**
 *    （下面 `终端半边的运行时` 那一组），不是注释里的空头保证。
 *
 * @module xaihi-mvz/tests/core
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { MvzCommandResult, MvzRuntime } from '../src/core.ts'
import { groupByArchive, parseMvzEntries, parseMvzLine, runMvz } from '../src/core.ts'
import { MVZ_PROCESS_SEAM_REFUSAL, createMvzPlanRuntime, createNodeMvzRuntime } from '../src/platform.ts'
import type { MvzSubprocessSeam, MvzSubprocessSpawnSpec } from '../src/platform.ts'

afterEach(() => {
  process.exitCode = 0
})

describe('mvz core', () => {
  it('parses compact and long findz lines', () => {
    expect(parseMvzLine('C:/packs/book.zip//page/001.jpg')).toEqual({
      archivePath: 'C:/packs/book.zip',
      internalPath: 'page/001.jpg',
      rawLine: 'C:/packs/book.zip//page/001.jpg',
    })
    expect(parseMvzLine('2024-01-02 03:04:05 1.5K C:/packs/book.zip//page/002.jpg')?.internalPath).toBe('page/002.jpg')
    expect(parseMvzLine('not an archive entry')).toBeNull()
  })

  it('groups entries by archive', () => {
    const groups = groupByArchive(parseMvzEntries('a.zip//one.txt\na.zip//two.txt\nb.zip//one.txt'))
    expect(groups.size).toBe(2)
    expect(groups.get('a.zip')?.map((entry) => entry.internalPath)).toEqual(['one.txt', 'two.txt'])
  })

  it('previews extract without requiring 7-Zip', async () => {
    const result = await runMvz({
      action: 'extract',
      fileText: 'C:/packs/book.zip//page/001.jpg\nC:/packs/book.zip//page/002.jpg',
      near: true,
      autoDir: true,
      dryRun: true,
    }, createMemoryRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.totalArchives).toBe(1)
    expect(result.data?.preview[0]?.command).toContain('7z x C:/packs/book.zip')
    expect(result.data?.preview[0]?.output).toBe('C:/packs/book')
  })

  it('executes delete with injected runtime', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true })
    const result = await runMvz({
      action: 'delete',
      fileText: 'C:/packs/book.zip//page/001.jpg',
    }, runtime)

    expect(result.success).toBe(true)
    expect(runtime.commands[0]).toEqual(['7z-real', 'd', 'C:/packs/book.zip', 'page/001.jpg'])
  })

  it('previews move as extract then delete', async () => {
    const result = await runMvz({
      action: 'move',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      output: 'D:/out',
      near: false,
      autoDir: false,
      dryRun: true,
    }, createMemoryRuntime())

    expect(result.data?.preview.map((item) => item.action)).toEqual(['extract', 'delete'])
    expect(result.data?.results[0]?.command).toContain('&&')
  })

  it('executes move without duplicating the 7-Zip command in args', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true })
    const result = await runMvz({
      action: 'move',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      output: 'D:/out',
      near: false,
      autoDir: false,
    }, runtime)

    expect(result.success).toBe(true)
    expect(runtime.commands).toEqual([
      ['7z-real', 'x', 'C:/packs/book.zip', '-oD:/out', '-y', 'page/001.jpg'],
      ['7z-real', 'd', 'C:/packs/book.zip', 'page/001.jpg'],
    ])
  })

  it('previews regex rename pairs', async () => {
    const result = await runMvz({
      action: 'rename',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      pattern: '^page/',
      replacement: 'images/',
      dryRun: true,
    }, createMemoryRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.preview[0]?.renames).toEqual([{ old: 'page/001.jpg', next: 'images/001.jpg' }])
  })
})

describe('mvz core 的缺省那一格（本仓补的判据）', () => {
  it('省略 dryRun ⇒ 内核执行：真去问 find7z 并真起命令（清单默认 true 钉在 definition.spec）', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true })
    const result = await runMvz({
      action: 'delete',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      // dryRun 一条都不给：`core.ts:112` 的 `input.dryRun ? "7z" : await runtime.find7z()`
      // 走的是后一半 ⇒ 这一步"应当"问一次 7z 并起一次进程。
    }, runtime)

    expect(result.success).toBe(true)
    expect(runtime.askedFor7z).toBe(1)
    expect(runtime.commands).toEqual([['7z-real', 'd', 'C:/packs/book.zip', 'page/001.jpg']])
  })

  it('给了 dryRun: true ⇒ 一次都不问 find7z、一次命令都不起（阳性对照）', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true })
    await runMvz({
      action: 'delete',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      dryRun: true,
    }, runtime)

    expect(runtime.askedFor7z).toBe(0)
    expect(runtime.commands).toEqual([])
  })

  it('delete 与 move 把 exit code 1 也算成功（core.ts:176、:220 那条宽判）', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true }, () => ({ code: 1, stdout: '', stderr: 'cannot find some of the files' }))
    const result = await runMvz({ action: 'delete', fileText: 'C:/packs/book.zip//page/001.jpg' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.failedCount).toBe(0)
    expect(result.data?.results[0]?.message).toContain('delete 1 file(s)')

    // 阳性对照：同一条路上 code 2 必须算失败，否则"宽判"这个词就没有反面。
    const failing = createMemoryRuntime({ 'C:/packs/book.zip': true }, () => ({ code: 2, stdout: '', stderr: 'boom' }))
    const bad = await runMvz({ action: 'delete', fileText: 'C:/packs/book.zip//page/001.jpg' }, failing)
    expect(bad.success).toBe(false)
    expect(bad.data?.failedCount).toBe(1)
    expect(bad.data?.results[0]?.message).toContain('boom')
  })

  it('rename 只认 exit code 0（与 delete/move 那条宽判不同一条）', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true }, () => ({ code: 1, stdout: '', stderr: 'partial' }))
    const result = await runMvz({
      action: 'rename',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      pattern: 'page/',
      replacement: 'images/',
    }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.results[0]?.message).toContain('Rename failed')
  })

  it('一条条目都没有时是内核那句话，不是接线层编的（core.ts:110）', async () => {
    const result = await runMvz({ action: 'extract', fileText: 'no archive separator here' }, createMemoryRuntime())
    expect(result.success).toBe(false)
    expect(result.message).toBe('No archive entries found.')
  })

  it('找不到 7-Zip 时是内核那句话（core.ts:113）', async () => {
    const runtime = createMemoryRuntime({ 'C:/packs/book.zip': true })
    runtime.find7z = async () => null
    const result = await runMvz({ action: 'delete', fileText: 'C:/packs/book.zip//page/001.jpg' }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('7-Zip executable was not found. Install 7-Zip or add 7z to PATH.')
  })
})

describe('终端半边的运行时（bin 那一面没有 ctx.subprocess）', () => {
  it('find7z / runCommand 都抛同一句拒答，理由点名 ctx.subprocess', async () => {
    const runtime = createMvzPlanRuntime()
    await expect(runtime.find7z()).rejects.toThrow(MVZ_PROCESS_SEAM_REFUSAL)
    expect(() => runtime.runCommand('7z', ['d', 'a.zip', 'x'])).toThrow(/ctx\.subprocess/)
  })

  it('内核的预演那条路一个进程都不起：把 throw 版运行时交给 runMvz 也照样出计划', async () => {
    const result = await runMvz({
      action: 'extract',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      near: true,
      autoDir: true,
      dryRun: true,
    }, createMvzPlanRuntime())

    expect(result.success).toBe(true)
    expect(result.data?.preview[0]?.command).toContain('7z x C:/packs/book.zip')
  })

  it('非预演交给这个运行时就是炸，不是静默成功（阳性对照）', async () => {
    await expect(runMvz({
      action: 'delete',
      fileText: 'C:/packs/book.zip//page/001.jpg',
      dryRun: false,
    }, createMvzPlanRuntime())).rejects.toThrow(MVZ_PROCESS_SEAM_REFUSAL)
  })
})

describe('宿主半边的运行时（ctx.subprocess 的形状）', () => {
  it('find7z 按上游的候选顺序问，第一个命中就返回；全空才 null', async () => {
    const seam = new FakeSubprocess({ '7za': '/usr/local/bin/7za' })
    const runtime = createNodeMvzRuntime(seam, '/work')
    expect(await runtime.find7z()).toBe('/usr/local/bin/7za')
    expect(seam.lookedUp).toEqual(['7z', '7z.exe', '7za'])

    const none = new FakeSubprocess({})
    expect(await createNodeMvzRuntime(none, '/work').find7z()).toBe(null)
    // 六个 PATH 名都问过，顺序就是基线那份 SEVEN_ZIP_NAMES
    expect(none.lookedUp).toEqual(['7z', '7z.exe', '7za', '7za.exe', '7zz', '7zz.exe'])
  })

  it('runCommand 把 argv 整条交给缝，退出码与两段输出都回来', async () => {
    const seam = new FakeSubprocess({ '7z': '/bin/7z' }, { exitCode: 0, stdout: 'ok', stderr: '' })
    const runtime = createNodeMvzRuntime(seam, '/work')
    const result = await runtime.runCommand('/bin/7z', ['d', 'a.zip', 'page/001.jpg'])

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(seam.spawned[0]?.argv).toEqual(['/bin/7z', 'd', 'a.zip', 'page/001.jpg'])
    expect(seam.spawned[0]?.cwd).toBe('/work')
    // 这条缝不给默认值：三根流都得显式处置（stdin 忽略、两根出收集上限）。
    expect(seam.spawned[0]?.stdio).toEqual({
      stdin: 'ignore',
      stdout: { maxBytes: 16 * 1024 * 1024 },
      stderr: { maxBytes: 16 * 1024 * 1024 },
    })
  })

  it('被信号杀掉（exitCode=null）折成 0：这是上游 platform.ts:76 的怪，钉住不改', async () => {
    const seam = new FakeSubprocess({ '7z': '/bin/7z' }, { exitCode: null, stdout: '', stderr: '' })
    const result = await createNodeMvzRuntime(seam, '/work').runCommand('/bin/7z', ['x', 'a.zip'])
    expect(result.code).toBe(0)
  })

  it('spawn 直接失败也回 code 0 + message 进 stderr：同一条上游折法（platform.ts:77-81）', async () => {
    const seam = new FakeSubprocess({ '7z': '/bin/7z' }, { rejectWith: new Error('spawn /bin/7z ENOENT') })
    const result = await createNodeMvzRuntime(seam, '/work').runCommand('/bin/7z', ['x', 'a.zip'])
    expect(result.code).toBe(0)
    expect(result.stderr).toContain('ENOENT')
  })
})

/**
 * 基线 `core.test.ts:93-115` 那份假运行时，逐字搬（`commands` 那条记账数组也在原样保留），
 * 只多两处本仓判据要用的观察点：`askedFor7z` 计数与可注入的 `onCommand` 结果。
 */
function createMemoryRuntime (
  existing: Record<string, boolean> = {},
  onCommand?: (command: string, args: string[]) => MvzCommandResult,
) {
  const runtime: MvzRuntime & { commands: string[][]; askedFor7z: number } = {
    commands: [],
    askedFor7z: 0,
    find7z: async () => {
      runtime.askedFor7z += 1
      return '7z-real'
    },
    async runCommand (command: string, args: string[]): Promise<MvzCommandResult> {
      runtime.commands.push([command, ...args])
      return onCommand?.(command, args) ?? { code: 0, stdout: '', stderr: '', durationMs: 5 }
    },
    exists: async (path) => Boolean(existing[path]),
    ensureDir: async (path) => {
      existing[path] = true
    },
    dirname: (path) => path.replace(/[\\/][^\\/]*$/, '') || '.',
    basename: (path) => path.split(/[\\/]/).pop() ?? path,
    extname: (path) => {
      const name = path.split(/[\\/]/).pop() ?? path
      const index = name.lastIndexOf('.')
      return index >= 0 ? name.slice(index) : ''
    },
    join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace('C:/', 'C:/'),
  }
  return runtime
}

/**
 * `ctx.subprocess` 的假件：只实现本包用到的两个方法。
 * @param found - 裸名 → 解析出来的绝对路径；不在表里的按"找不到"抛。
 * @param outcome - 一次 spawn 的结果；`rejectWith` 用来模拟 spawn 直接失败。
 */
class FakeSubprocess implements MvzSubprocessSeam {
  readonly lookedUp: string[] = []
  readonly spawned: MvzSubprocessSpawnSpec[] = []

  constructor (
    private readonly found: Record<string, string> = {},
    private readonly outcome: {
      exitCode?: number | null
      stdout?: string
      stderr?: string
      rejectWith?: Error
    } = {},
  ) {}

  async resolveExecutable (command: string): Promise<string> {
    this.lookedUp.push(command)
    const hit = this.found[command]
    if (hit === undefined) throw new Error(`executable not found: ${command}`)
    return hit
  }

  spawn (spec: MvzSubprocessSpawnSpec) {
    this.spawned.push(spec)
    if (this.outcome.rejectWith !== undefined) {
      return {
        collected: {},
        done: Promise.reject(this.outcome.rejectWith),
      }
    }
    const stdout = this.outcome.stdout ?? ''
    const stderr = this.outcome.stderr ?? ''
    return {
      collected: {
        stdout: { readFrom: () => ({ text: stdout }) },
        stderr: { readFrom: () => ({ text: stderr }) },
      },
      done: Promise.resolve({ exitCode: this.outcome.exitCode === undefined ? 0 : this.outcome.exitCode }),
    }
  }
}
