/**
 * cleanf 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/cleanf/src/cli.ts` 里 `createProgram`（`:116-150`）、`cleanfArgs`（`:152-160`）、
 * `inputFromArgs`（`:162-174`）、`writeCleanfSummary`（`:433-469`）那几支）。
 *
 * 期望值全部手抄，不由被测函数现算：`Preview completed, found N item(s).`、
 * `• Backup files: 1 个`、`待删除文件预览：`、`Recycle-bin restore is unavailable; Cleanf refused
 * to run without undo support.`（基线 `platform.ts:133` 的原话），40 行那个上限（`:40`），
 * 以及路径失败那两句话的**归属**：不存在的目录是 `lstat` 抛的 ENOENT（基线 `platform.ts:91`），
 * `Path is not a directory:`（`:92-93`）只在"存在但不是目录"那格说得出。
 * **夹具是真机临时目录**（迁移技能那条"夹具必须来自真机"），不是手写 items。
 *
 * 三条真源在别处，这里只核对得上：
 * - 动作名单来自 `package.json#xaihi.node.actions`（`clean` / `undo`），而子命令名是上游的
 *   `preview` / `run`（第 5 处偏离：`undo` 在上游 bin 里没有子命令，撤销只在 guided 里出现）；
 * - "真清理被拒"来自 `src/platform.ts` 缺省提供方那一刀（G10），不是终端面另写的拒绝；
 * - 退出码 2 与那句 `No interactive terminal detected.` 来自 `src/cli-support.ts`。
 *
 * 阳性对照：
 * 1. `run` 被拒之后**夹具里的文件一条都没少**（这是"没有半删、没有静默成功"的唯一可读证据）；
 * 2. `preview` 与 `run --preview` 两条都出计划、`run` 那条抛 `ENOTSUP`，三条互为对照；
 * 3. 未接的三条腿不许先报参数错；
 * 4. `--help` 认的是子命令表那一行（只 `toContain('guided')` 会假绿）。
 *
 * @module xaihi-cleanf/tests/cli
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import type { CleanfResult } from '../src/core.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
  process.exitCode = 0
})

function createHost (options: { tty?: boolean; stdinText?: string } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: createStdin(options),
    stdout: {
      isTTY: options.tty === true,
      columns: 120,
      write (chunk: string) {
        stdout += chunk
        return true
      },
    },
    stderr: {
      isTTY: false,
      columns: 120,
      write (chunk: string) {
        stderr += chunk
        return true
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}

/** 假 stdin：给了 stdinText 才是可异步迭代的管道，否则留给"非管道"那条判据。 */
function createStdin (options: { tty?: boolean; stdinText?: string }): CliHost['stdin'] {
  if (options.tty === true) return { isTTY: true } as unknown as CliHost['stdin']
  if (options.stdinText === undefined) return { isTTY: false } as unknown as CliHost['stdin']
  const chunks = options.stdinText.split(/(?<=\n)/)
  return {
    isTTY: false,
    [Symbol.asyncIterator] () {
      let index = 0
      return {
        async next () {
          if (index >= chunks.length) return { done: true as const, value: undefined }
          return { done: false as const, value: Buffer.from(chunks[index++] ?? '', 'utf8') }
        },
      }
    },
  } as unknown as CliHost['stdin']
}

/**
 * 动作名单的唯一真源（`package.json#xaihi.node.actions`）。形状不对就直接抛，
 * 不是返回一串 `undefined` 继续往下走。
 */
function declaredActions (): string[] {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    xaihi?: { node?: { actions?: Array<{ id?: unknown }> } }
  }
  const actions = manifest.xaihi?.node?.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('package.json#xaihi.node.actions 缺失或为空：这条尺没有真源可比')
  }
  return actions.map((entry, index) => {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`第 ${index} 条动作没有 id（真源形状漂了，不是断言该迁就的东西）`)
    }
    return entry.id
  })
}

/** 真机夹具：一个 `.bak`、一个空目录、一个要留下的文件、一个只被 log_files 命中的 `.log`。 */
async function createTree (label: string): Promise<{ root: string; bak: string; empty: string; keep: string; log: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-cleanf-cli-${label}-`))
  tempDirs.push(root)
  const empty = join(root, 'empty_dir')
  await mkdir(empty)
  const bak = join(root, 'a.bak')
  const keep = join(root, 'keep.txt')
  const log = join(root, 'run.log')
  await writeFile(bak, 'x', 'utf8')
  await writeFile(keep, 'x', 'utf8')
  await writeFile(log, 'x', 'utf8')
  return { root, bak, empty, keep, log }
}

/** `--help` 的子命令表那一行：两个空格 + 名字 + 空白（只 toContain 会假绿）。 */
const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')

describe('cleanf 终端面', () => {
  it('--help 列出上游的两条腿与三条未接腿，并把清单里的动作名也摆在面上', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    for (const leg of ['preview', 'run']) {
      expect(row(leg).test(help), `--help 的子命令表里没有 ${leg}`).toBe(true)
    }
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')
    // 阳性对照：这把尺必须查不到没有的东西（`undo` 在上游 bin 里没有子命令，第 5 处偏离）。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(declaredActions()).toEqual(['clean', 'undo'])
    expect(row('clean').test(help)).toBe(false)

    const flagHost = createHost()
    await runProgram(['preview', '--help'], flagHost)
    for (const flag of ['--paths <value>', '--presets <value>', '--exclude <value>', '--preview', '--json']) {
      expect(flagHost.stdoutText(), `preview --help 里没有 ${flag}`).toContain(flag)
    }
  })

  it('非 TTY 且无参数时拒绝，并给出 cleanf 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('cleanf')
  })

  it('preview 是真跑的：只读枚举出计划，一个文件都不动', async () => {
    const tree = await createTree('preview')
    const host = createHost()
    await runProgram(['preview', '--paths', tree.root, '--presets', 'empty_folders,backup_files', '--json'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const result = JSON.parse(host.stdoutText()) as CleanfResult
    expect(result.success).toBe(true)
    expect(result.message).toBe('Preview completed, found 2 item(s).')
    // `run.log` 只在 **log_files** 那条预设里（默认是关的，`core.ts:139-149`），
    // 这次没传它 ⇒ 出现即说明预设名单漂了。
    expect([...(result.data?.previewFiles ?? [])].sort()).toEqual([tree.bak, tree.empty].sort())
    expect(result.data?.removedDetails['log_files'] ?? 0).toBe(0)
    expect(result.data?.removedDetails).toEqual({ backup_files: 1, empty_folders: 1 })
    // 阳性对照：预演之后三条都还在。
    expect(existsSync(tree.bak)).toBe(true)
    expect(existsSync(tree.empty)).toBe(true)
    expect(existsSync(tree.log)).toBe(true)
  })

  it('非 JSON 的预演出清理总结面板与每预设一行（上游 writeCleanfSummary 那三段）', async () => {
    const tree = await createTree('plain')
    const host = createHost()
    await runProgram(['preview', '--paths', tree.root, '--presets', 'backup_files'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const out = host.stdoutText()
    expect(out).toContain('Preview completed, found 1 item(s).')
    expect(out).toContain('清理总结')
    expect(out).toContain('预览完成，找到 1 个待删除项目。')
    expect(out).toContain('• Backup files: 1 个')
    expect(out).toContain('待删除文件预览：')
    expect(out).toContain(tree.bak)
    expect(out).not.toContain(tree.keep)
    // 第 4 处偏离：上游那两行图标/统计来自它自己把每条都标成 file 的 parsePreviewTargets，
    // 缝里拿不到真类型 ⇒ 这里不印。断言的是"不出现假统计"。
    expect(out).not.toContain('统计:')
    expect(existsSync(tree.bak)).toBe(true)
  })

  it('run 不带 --preview：落到基线那一刀，ENOTSUP 上 stderr、退出码 1，文件一条都没少', async () => {
    const tree = await createTree('live')
    const host = createHost()
    await runProgram(['run', '--paths', tree.root, '--presets', 'backup_files', '--json'], host)

    expect(process.exitCode, '被拒的那次不许给成功码').toBe(1)
    expect(host.stderrText()).toContain('Recycle-bin restore is unavailable; Cleanf refused to run without undo support.')
    // 抛出的是异常，所以 stdout 上没有 JSON——与上游在同一条失败路上的形状一致（文件头第 1 条）。
    expect(host.stdoutText()).toBe('')
    // 这一条是本节点今天最重要的一条判据：拒绝发生在动手之前。
    expect(existsSync(tree.bak)).toBe(true)
    expect(existsSync(tree.keep)).toBe(true)
  })

  it('run 带 --preview 就退回计划那条路（成对的正控）', async () => {
    const tree = await createTree('run-preview')
    const host = createHost()
    await runProgram(['run', '--paths', tree.root, '--presets', 'backup_files', '--preview', '--json'], host)
    expect(process.exitCode ?? 0).toBe(0)
    const result = JSON.parse(host.stdoutText()) as CleanfResult
    expect(result.message).toBe('Preview completed, found 1 item(s).')
    expect(existsSync(tree.bak)).toBe(true)
  })

  it('--paths - 读 stdin 并用分号拼回内核的解析器（上游 :128、:137）', async () => {
    const a = await createTree('stdin-a')
    const b = await createTree('stdin-b')
    const host = createHost({ stdinText: `${a.root}\n${b.root}\n` })
    await runProgram(['preview', '--paths', '-', '--presets', 'backup_files', '--json'], host)
    expect(process.exitCode ?? 0).toBe(0)
    const result = JSON.parse(host.stdoutText()) as CleanfResult
    expect(result.data?.totalRemoved).toBe(2)
    expect(result.data?.previewFiles).toContain(a.bak)
    expect(result.data?.previewFiles).toContain(b.bak)
  })

  it('排除关键词把整条路径保下来（isExcluded 是子串判据）', async () => {
    const tree = await createTree('exclude')
    const host = createHost()
    await runProgram(['preview', '--paths', tree.root, '--presets', 'backup_files', '--exclude', 'a.bak', '--json'], host)
    const result = JSON.parse(host.stdoutText()) as CleanfResult
    expect(result.data?.previewFiles).toEqual([])
    expect(result.message).toBe('Preview completed, found 0 item(s).')
  })

  it('路径不存在时是基线 lstat 那句 ENOENT，不是空计划', async () => {
    // 期望值手抄自基线 `platform.ts:89-94`：`scanPath` **先** `await lstat(root)`（`:91`）、
    // **再**判 `stat.isDirectory()`（`:92-93`）。路径根本不存在时 `lstat` 自己就把 ENOENT 抛出来，
    // 那句 `Path is not a directory:` 永远走不到 ⇒ 这里断的是 Node 的那句，不是 platform 的那句。
    // 抛出后：`core.ts:281` 不接（基线同款）⇒ 一路交给 `runPipeProgram` 的 catch
    // （`src/cli-support.ts:363-364`，对齐上游 `cli.ts:507-511`）⇒ stderr + 退出码 1。
    const host = createHost()
    await runProgram(['preview', '--paths', join(tmpdir(), 'xaihi-cleanf-missing-dir'), '--json'], host)
    expect(process.exitCode).toBe(1)
    expect(host.stderrText()).toContain('ENOENT')
    expect(host.stderrText()).toContain('xaihi-cleanf-missing-dir')
    // 阳性对照一：这句话**不该**出现——它只在"存在但不是目录"那格说得出（见下一条）。
    expect(host.stderrText()).not.toContain('Path is not a directory:')
    // 阳性对照二：不许退化成空计划——一条 JSON 都不许落到 stdout（`found 0 item(s).` 就是静默成功）。
    expect(host.stdoutText()).toBe('')
  })

  it('路径存在但不是目录时才是基线 platform 那句 `Path is not a directory:`', async () => {
    // 同一把尺的另一格：基线 `platform.ts:92-93` 那句原文（`Path is not a directory: ${resolve(path)}`），
    // 这里给它一个**真的存在**的文件（`createTree` 里的 `a.bak`），ENOENT 那条路抢不到在前面。
    const tree = await createTree('not-a-dir')
    const host = createHost()
    await runProgram(['preview', '--paths', tree.bak, '--json'], host)
    expect(process.exitCode, '指向文件的那次不许给成功码').toBe(1)
    process.exitCode = 0
    expect(host.stderrText()).toContain(`Path is not a directory: ${tree.bak}`)
    expect(host.stderrText()).not.toContain('ENOENT')
    expect(host.stdoutText()).toBe('')
    expect(existsSync(tree.bak)).toBe(true)
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['preview', '--paths', '/tmp', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('交互腿 ui 与 gd/guided 正常进入（退出码 0），且**先于**任何参数校验', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 执行成功`).toBe(0)
      process.exitCode = 0
    }
  })
})
