/**
 * Repacku 终端面的验收：断的是**契约**，不是"我以为它做什么"。
 *
 * 三条真源：动作名单来自 `package.json#xaihi.node.actions`（节点能力的唯一真源）；
 * "bin 里不真压缩"来自 `src/platform.ts` 的 `REPACKU_EXECUTION_REFUSAL`（缺的服务是
 * `ctx.subprocess`，Provider `dsh-subprocess-local`）；退出码 2 与那句
 * `No interactive terminal detected.` 来自 `src/cli-support.ts` 的 `runNodeCliFace`。
 * 期望值全部手抄，不由被测函数现算（`Summary` 那三行的标签抄自上游 `cli.ts:521-525`）。
 *
 * 阳性对照分布在四条用例里：
 * 1. `--help` 的子命令表按"两个空格 + 名字 + 空白"那一行的形状认，并且断言它**查不到**
 *    一条不存在的子命令（只 `toContain` 会假绿：`gd` 的描述里就写着 "guided"）；
 * 2. `declaredActions()` 在清单空或形状漂时直接抛，而不是返回一串 `undefined` 让循环假绿；
 * 3. 真跑 `analyze` 那条**读盘回看**：config JSON 必须真的落在临时目录里，而目录里
 *    一个 `.zip` 都不许有（把闸门拆掉、让 bin 自己 spawn 7z，这条立刻红）；
 * 4. 拒绝那条断的是**服务名**：`ctx.subprocess` / `dsh-subprocess-local` 两个词都得到，
 *    只说"不支持"不算过关。
 *
 * @module xaihi-repacku/tests/cli
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { UNWIRED_INTERACTIVE_LEGS, runProgram } from '../src/cli.ts'
import { REPACKU_EXECUTION_REFUSAL } from '../src/platform.ts'

/** 每个用例自己清一次退出码，否则一条用例的 `process.exitCode` 会脏到下一条。 */
afterEach(() => {
  process.exitCode = 0
})

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

function createHost (): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: true } as CliHost['stdin'],
    stdout: {
      isTTY: false,
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

/**
 * 动作名单的唯一真源。形状不对就直接抛，不是返回一串 `undefined` 继续往下走：
 * 否则"至少 1 条"的下界照样成立，循环里却全员拿着 `undefined` 去比，这条尺就成了假的。
 */
function declaredActions (): string[] {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
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

/** 建一棵真目录：`book/` 两张图（会被判成 entire），`archive/` 里躺着一份 zip（selective）。 */
async function sampleTree (): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'xaihi-repacku-test-'))
  tempRoots.push(root)
  await mkdir(join(root, 'book'), { recursive: true })
  await mkdir(join(root, 'archive'), { recursive: true })
  await writeFile(join(root, 'book', '001.jpg'), 'a'.repeat(120))
  await writeFile(join(root, 'book', '002.png'), 'a'.repeat(120))
  await writeFile(join(root, 'archive', 'source.zip'), 'a'.repeat(60))
  await writeFile(join(root, 'archive', '001.jpg'), 'a'.repeat(60))
  await writeFile(join(root, 'archive', '002.jpg'), 'a'.repeat(60))
  return root
}

/**
 * 这次运行**新写出来**的归档条数：夹具自己摆着的那一颗 `archive/source.zip` 要减掉，
 * 它正是内核判 selective 的理由，不是产物。这条闸门的全部意义就在这个数上。
 */
async function zipCount (dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true })
  return entries
    .map((name) => String(name))
    .filter((name) => name.endsWith('.zip') && name !== 'archive/source.zip' && name !== 'archive\\source.zip').length
}

describe('repacku 终端面', () => {
  it('--help 把清单里的动作与三条未接的腿一起列出来（少一条就是静默消失）', async () => {
    const host = createHost()
    await runProgram(['--help'], host)
    expect(process.exitCode ?? 0).toBe(0)

    const help = host.stdoutText()
    const actions = declaredActions()
    expect(actions.length, 'package.json#xaihi.node.actions 空了，下面的循环是假绿').toBeGreaterThan(0)

    // 只 `toContain(名字)` 会假绿：`gd` 那条腿的描述里就写着 "guided"，把子命令整条删掉
    // 也照样查不出来。所以按 Subcommands 表格那一行的形状认（两个空格 + 名字 + 空白）。
    const row = (name: string): RegExp => new RegExp(`^  ${name} +`, 'm')
    for (const action of actions) {
      expect(row(action).test(help), `--help 的子命令表里没有动作 ${action}（清单与终端面漂了）`).toBe(true)
    }
    // 未接的三条腿**留在面板上并标明未接**，不是删掉了事。
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      expect(row(leg).test(help), `--help 的子命令表里没有未接的交互腿 ${leg}`).toBe(true)
    }
    expect(help).toContain('未接')

    // 阳性对照：这把尺必须查不到没有的东西。
    expect(row('totally-not-a-subcommand').test(help)).toBe(false)
    expect(help).not.toContain('totally-not-a-subcommand')
  })

  it('子命令 --help 的 flag 名逐字对齐上游 commonArgs()', async () => {
    const host = createHost()
    await runProgram(['analyze', '--help'], host)
    const help = host.stdoutText()
    // 上游 `cli.ts:272-290` 那份 `commonArgs()` 的 15 条，一条都不能少：
    // 少一条就是"帮助页与真 flag 两头对不上"的另一面。
    for (const flag of [
      '--path <value>', '--paths <value>', '--config <value>', '--configPath <value>',
      '--types <value>', '--output <value>', '--outputPath <value>', '--clipboard',
      '--deleteAfter', '--dryRun', '--gallery', '--single', '--minCount <value>',
      '--galleryMarker <value>', '--json',
    ]) {
      expect(help, `analyze --help 的 Options 里少了 ${flag}`).toContain(flag)
    }
    // 阳性对照：上游没有、本包也不该有的一条。
    expect(help).not.toContain('--force')
  })

  it('非 TTY 且无参数时拒绝，并给出 xrepacku --help 的提示', async () => {
    const host = createHost()
    await runProgram([], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xrepacku')
  })

  it('需要压缩程序的动作一律拒绝：executed=false，理由点名缺的那条服务', async () => {
    const executableActions = declaredActions().filter((action) => action !== 'analyze')
    expect(executableActions.length).toBe(4)
    for (const action of executableActions) {
      const host = createHost()
      await runProgram([action, '--path', '/tmp/whatever', '--json'], host)
      expect(process.exitCode, `${action} 没执行却给了成功码`).toBe(2)
      const report = JSON.parse(host.stdoutText()) as { action: string; executed: boolean; refused: string }
      expect(report.action).toBe(action)
      expect(report.executed, 'bin 里绝不许把"没缝"演成"跑完了"').toBe(false)
      // 拒绝必须点名到服务与 Provider：只说"不支持"，使用者无从判断是内核没搬还是宿主没起。
      expect(report.refused).toContain('ctx.subprocess')
      expect(report.refused, '还要点名 provider，否则不知道缺的是哪一侧').toContain('dsh-subprocess-local')
      expect(report.refused).toContain('ctx.approval')
      // 同一条句子在 `--json` 与 stderr 之间不许分叉，所以比的是同一份常量。
      expect(report.refused).toBe(REPACKU_EXECUTION_REFUSAL)
      process.exitCode = 0
    }

    // 阳性对照：stderr 那一支用的是同一句话（不带 --json 时读得到同样的拒绝）。
    const host = createHost()
    await runProgram(['full', '--path', '/tmp/whatever'], host)
    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain(REPACKU_EXECUTION_REFUSAL.slice(0, 40))
    expect(host.stderrText()).toContain('ctx.subprocess')
  })

  it('analyze 真跑：config JSON 落盘，一个 .zip 都不许多出来', async () => {
    const root = await sampleTree()
    const host = createHost()
    await runProgram(['analyze', '--path', root, '--types', 'image', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, 'analyze 不碰压缩程序，这一条该真跑').toBe(0)

    const result = JSON.parse(host.stdoutText()) as { success: boolean; message: string; data?: { configPath: string; totalFolders: number; plannedCount: number } }
    expect(result.success).toBe(true)
    expect(result.message).toBe(`Analysis complete: ${result.data?.totalFolders} folder(s).`)
    expect(result.data?.configPath).toBe(join(root, `${root.split('/').pop()}_config.json`))
    // 回读磁盘：产物真的在那儿，而且没顺手生成归档。
    expect(existsSync(result.data?.configPath ?? '')).toBe(true)
    expect(await zipCount(root)).toBe(0)
    expect(await readdir(root)).toEqual(['archive', 'book', `${root.split('/').pop()}_config.json`])

    // 阳性对照：`--outputPath` 那格改的是同一件事的**位置**，不是"要不要写"。
    const elsewhere = createHost()
    const target = join(root, 'given_config.json')
    await runProgram(['analyze', '--path', root, '--types', 'image', '--outputPath', target, '--json'], elsewhere)
    expect(process.exitCode ?? 0).toBe(0)
    expect(existsSync(target)).toBe(true)
    process.exitCode = 0
  })

  it('任何动作配 --dryRun 都只出计划：planned 有条目，盘上零归档', async () => {
    const root = await sampleTree()
    const host = createHost()
    await runProgram(['full', '--path', root, '--types', 'image', '--dryRun', '--json'], host)
    expect(process.exitCode ?? 0).toBe(0)
    const result = JSON.parse(host.stdoutText()) as { success: boolean; data?: { plannedCount: number; compressedCount: number; operations: Array<{ status: string }> } }
    expect(result.success).toBe(true)
    expect(result.data?.plannedCount).toBe(2)
    expect(result.data?.compressedCount).toBe(0)
    expect(result.data?.operations.every((item) => item.status === 'planned')).toBe(true)
    // 阳性对照：计划写了出去（config JSON 是分析产物），归档一条都没有。
    expect(await zipCount(root)).toBe(0)
    expect(existsSync(join(root, `${root.split('/').pop()}_config.json`))).toBe(true)
  })

  it('缺路径时回内核自己那句话，不替它编一个默认目录', async () => {
    const host = createHost()
    await runProgram(['full', '--dryRun', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode, '失败必须红，不能给成功码').toBe(1)
    const result = JSON.parse(host.stdoutText()) as { success: boolean; message: string }
    expect(result.success).toBe(false)
    // 这句话是 `core.ts:343` 的原文；接线层不许把它换成"用法提示"。
    expect(result.message).toBe('Path is required.')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()
    await runProgram(['analyze', '--path', '/tmp/x', '--nope', 'b'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('--clipboard 未接：读剪贴板也是外部程序，拒绝里点名那条缝，不静默忽略', async () => {
    const host = createHost()
    await runProgram(['analyze', '--clipboard'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('ctx.subprocess')
    // 阳性对照：给了 `--path` 就不碰剪贴板那条腿，同一 flag 不构成拒绝。
    const ok = createHost()
    await runProgram(['analyze', '--clipboard', '--path', '/tmp/x', '--json'], ok)
    expect(process.exitCode ?? 0).not.toBe(2)
    process.exitCode = 0
  })

  it('三条未接的腿响亮拒绝（退出码 2，且不做任何参数校验）', async () => {
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const host = createHost()
      await runProgram([leg], host)
      expect(process.exitCode, `${leg} 未接却报了成功码`).toBe(2)
      expect(host.stderrText(), `${leg} 的拒绝里没说"未接"`).toContain('未接')
      // 未接的功能先报"缺参"会把"这条腿没搬"说成"你参数没给对"。
      expect(host.stderrText()).not.toContain('Missing required argument')
      process.exitCode = 0
    }
  })

  it('compress 下面的 --gallery / --single 两条兼容别名各发一条动作', async () => {
    const host = createHost()
    await runProgram(['compress', '--path', '/tmp/whatever', '--gallery', '--json'], host)
    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    const report = JSON.parse(host.stdoutText()) as { action: string }
    expect(report.action).toBe('gallery-pack')

    // 阳性对照：`--single` 换一条；两条都不给才是 `compress` 自己。
    const single = createHost()
    await runProgram(['compress', '--path', '/tmp/whatever', '--single', '--json'], single)
    expect((JSON.parse(single.stdoutText()) as { action: string }).action).toBe('single-pack')
    process.exitCode = 0
    const plain = createHost()
    await runProgram(['compress', '--path', '/tmp/whatever', '--json'], plain)
    expect((JSON.parse(plain.stdoutText()) as { action: string }).action).toBe('compress')
    process.exitCode = 0
  })
})
