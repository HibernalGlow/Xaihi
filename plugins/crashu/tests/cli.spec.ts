/**
 * crashu 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/crashu/src/cli.ts`）与上游 `core.test.ts` 的常量。
 *
 * 期望值全部手抄，不来自被测函数：`At least one source directory is required.`、
 * `Scan completed: 1 similar folder(s).`、`Plan generated: 1 move(s).`、
 * `Crashu completed: 1 matched, 1 moved, 0 error(s).`、reason 里的
 * `missing_destination` / `target_exists`、`folder_pairs.json` 这个默认文件名、
 * 非 JSON 那两段的标题 `相似文件夹：` / `移动计划：`、以及 40 行上限（上游 `cli.ts:300`）
 * ——两边都写在文件里。阈值那条对照用的 0.93 是手推的：`circle project` 对
 * `circle project cn` 的字符二元组相似度是 2·12/(12+14) = 24/26 ≈ 0.9231，抬到 0.93 就不该命中。
 *
 * 阳性对照：
 * 1. `plan` 与 `move --dry-run` 一对、`move` 一条：预演不许动目录（真搬了这两条就红）。
 * 2. `--threshold` 与 `--similarityThreshold` 是同义的（上游 `:250` 的 `??`），
 *    只接一条的话另一条会静默落回内核默认 0.6。
 * 3. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 *
 * stdin 队列那两条（`--source -` / `--sourcePaths -`）在这里没法喂真管道，
 * 判据留在 `src/cli.ts` 的 `resolveStdinQueues`（照上游 `:189` 的形状），标为未证。
 *
 * @module xaihi-crashu/tests/cli
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { CrashuResult } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('crashu CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xcrashu ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xcrashu ui')
  })

  it('--help 列出三个动作、execute 别名与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xcrashu')
    for (const verb of ['scan', 'plan', 'move', 'execute', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('scan --help 给出上游的 13 个 flag 名', async () => {
    const host = createHost()

    await runProgram(['scan', '--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xcrashu scan')
    for (const flag of ['--source <value>', '--sourcePaths <value>', '--targetPath <value>', '--targetNames <value>',
      '--destinationPath <value>', '--threshold <value>', '--similarityThreshold <value>', '--moveDirection <value>',
      '--conflictPolicy <value>', '--pairsFileName <value>', '--autoMove', '--dryRun', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('plan 只读：匹配一条、一个目录都不搬（阳性对照）', async () => {
    const fixture = await createFixture('plan')
    const host = createHost()

    await runProgram(['plan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as CrashuResult
    expect(result.success).toBe(true)
    expect(result.data?.similarFound).toBe(1)
    expect(result.data?.movedCount).toBe(0)
    // 手抄上游 `core.ts:150` 的 scan/plan 消息模板（plan 走第二个分支）。
    expect(result.message).toBe('Plan generated: 1 move(s).')
    expect(result.data?.plan[0]?.destinationPath).toBe(join(fixture.dest, 'Circle Project CN', 'Circle Project'))
    expect(existsSync(fixture.project)).toBe(true)
    expect(existsSync(join(fixture.dest, 'Circle Project CN', 'Circle Project'))).toBe(false)
  })

  it('move 默认真搬（上游内核 dryRun ?? false），--dry-run 才不动', async () => {
    const live = createHost()
    const fixture = await createFixture('move-live')
    await runProgram(['move', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--json'], live)

    expect(live.stdoutText()).not.toBe('')
    const result = JSON.parse(live.stdoutText()) as CrashuResult
    expect(result.data?.movedCount).toBe(1)
    expect(result.message).toBe('Crashu completed: 1 matched, 1 moved, 0 error(s).')
    expect(existsSync(fixture.project)).toBe(false)
    expect(existsSync(join(fixture.dest, 'Circle Project CN', 'Circle Project'))).toBe(true)
    // 配对文件落在目的地（`core.ts:344` 的 join(destinationPath, pairsFileName)）。
    expect(existsSync(join(fixture.dest, 'folder_pairs.json'))).toBe(true)

    // 阳性对照：同一份夹具加 `--dry-run` 就必须一个目录都不动。
    const idle = createHost()
    const dry = await createFixture('move-dry')
    await runProgram(['move', '--sourcePaths', dry.src, '--targetPath', dry.targets, '--destinationPath', dry.dest, '--dry-run', '--json'], idle)
    const planned = JSON.parse(idle.stdoutText()) as CrashuResult
    expect(planned.data?.movedCount).toBe(0)
    expect(existsSync(dry.project)).toBe(true)
    expect(existsSync(join(dry.dest, 'Circle Project CN', 'Circle Project'))).toBe(false)
  })

  it('execute 是 move 的别名（上游 cli.ts:208-215）', async () => {
    const host = createHost()
    const fixture = await createFixture('execute-alias')

    await runProgram(['execute', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--json'], host)

    const result = JSON.parse(host.stdoutText()) as CrashuResult
    expect(result.data?.movedCount).toBe(1)
    expect(existsSync(join(fixture.dest, 'Circle Project CN', 'Circle Project'))).toBe(true)
  })

  it('非 JSON 时打结论 + Summary 面板 + 两段列表（上游同款形状）', async () => {
    const host = createHost()
    const fixture = await createFixture('plain')

    await runProgram(['plan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest], host)

    expect(process.exitCode).toBe(0)
    const out = host.stdoutText()
    expect(out).toContain('Plan generated: 1 move(s).')
    expect(out).toContain('Summary')
    expect(out).toContain('matched: 1')
    expect(out).toContain('相似文件夹：')
    expect(out).toContain('移动计划：')
    expect(out).toContain('planned')
  })

  it('--similarityThreshold 0.93 时一条都不中，--threshold 是同义别名（手推的 24/26）', async () => {
    const strict = createHost()
    const fixture = await createFixture('threshold')
    await runProgram(['scan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--similarityThreshold', '0.93', '--json'], strict)
    expect((JSON.parse(strict.stdoutText()) as CrashuResult).data?.similarFound).toBe(0)

    // 阳性对照：同一个数写进别名 `--threshold`（上游 `:250` 是 `similarityThreshold ?? threshold`）。
    const alias = createHost()
    await runProgram(['scan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--threshold', '0.93', '--json'], alias)
    expect((JSON.parse(alias.stdoutText()) as CrashuResult).data?.similarFound).toBe(0)

    // 对照：默认 0.6（内核那份，不是定义里的 0.65）时同样的夹具必须命中一条。
    const loose = createHost()
    await runProgram(['scan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--json'], loose)
    expect((JSON.parse(loose.stdoutText()) as CrashuResult).data?.similarFound).toBe(1)
  })

  it('--conflictPolicy rename 给目的地加 (2)，默认 skip 判 target_exists', async () => {
    const fixture = await createFixture('conflict')
    // 预先占掉 `/dest/Circle Project CN/Circle Project`。
    await mkdir(join(fixture.dest, 'Circle Project CN', 'Circle Project'), { recursive: true })

    const skipped = createHost()
    await runProgram(['plan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--json'], skipped)
    const skipResult = JSON.parse(skipped.stdoutText()) as CrashuResult
    expect(skipResult.data?.plan[0]).toMatchObject({ status: 'skipped', reason: 'target_exists' })

    // 阳性对照：换成 rename 就必须落在 ` (2)`（后缀从 2 起，上游 `core.ts:372-378`）。
    const renamed = createHost()
    await runProgram(['plan', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--conflictPolicy', 'rename', '--json'], renamed)
    const renameResult = JSON.parse(renamed.stdoutText()) as CrashuResult
    expect(renameResult.data?.plan[0]?.destinationPath).toBe(join(fixture.dest, 'Circle Project CN', 'Circle Project (2)'))
  })

  it('--pairsFileName 改掉配对文件名', async () => {
    const host = createHost()
    const fixture = await createFixture('pairs-name')

    await runProgram(['move', '--sourcePaths', fixture.src, '--targetPath', fixture.targets, '--destinationPath', fixture.dest, '--pairsFileName', 'pairs.json', '--json'], host)

    expect((JSON.parse(host.stdoutText()) as CrashuResult).data?.pairsFile).toBe(join(fixture.dest, 'pairs.json'))
    expect(existsSync(join(fixture.dest, 'pairs.json'))).toBe(true)
  })

  it('没给来源目录时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['scan', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('At least one source directory is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('来源目录不存在时说的是另一句话（两条闸门不共用文案）', async () => {
    const host = createHost()

    await runProgram(['scan', '--sourcePaths', join(tmpdir(), 'xaihi-crashu-does-not-exist'), '--targetNames', 'x', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('No valid source directories found.')
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['scan', '--nope', 'x'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('未接的交互腿响亮拒绝并点名缺的东西，且不许先做参数校验（sleept 那个 bug 的尺）', async () => {
    const host = createHost({ tty: true })

    await runProgram(['gd'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('@clack')
    expect(host.stderrText()).toContain('OpenTUI')
    // 面级拒绝必须给一条能走的脚本化路子（`runNodeCliFace` 在派发到子命令之前就拦住了，
    // 所以用户看到的是这条，而不是 `runUnwiredFace` 里那条点名到上游文件的说明）。
    expect(host.stderrText()).toContain('xcrashu scan')
    expect(host.stderrText()).not.toContain('Missing required argument')

    // 结构尺：三条未接腿一个参数都不许标 required。
    // 阳性对照：给 `ui` 加一条 `required: true`，这条立刻红。
    expect(UNWIRED_INTERACTIVE_LEGS).toEqual(['ui', 'gd', 'guided'])
    const subs = program.subCommands ?? {}
    for (const leg of UNWIRED_INTERACTIVE_LEGS) {
      const specs = Object.values(subs[leg]?.args ?? {})
      expect(specs.every((spec) => spec.required !== true)).toBe(true)
    }
  })
})

/**
 * 夹具形状手搭（照上游 `core.test.ts` 那对名字的目录版）：
 * `src/Circle Project`、`targets/Circle Project CN`、`dest`（空）。
 */
async function createFixture(label: string): Promise<{ root: string; src: string; targets: string; dest: string; project: string }> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-crashu-cli-${label}-`))
  tempRoots.push(root)
  const src = join(root, 'src')
  const targets = join(root, 'targets')
  const dest = join(root, 'dest')
  const project = join(src, 'Circle Project')
  await mkdir(project, { recursive: true })
  await mkdir(join(targets, 'Circle Project CN'), { recursive: true })
  await mkdir(dest, { recursive: true })
  await writeFile(join(project, 'inner.txt'), 'inner', 'utf8')
  return { root, src, targets, dest, project }
}

function createHost(options: { tty?: boolean } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: options.tty === true } as CliHost['stdin'],
    stdout: {
      isTTY: options.tty === true,
      columns: 120,
      write(chunk: string) {
        stdout += chunk
        return true
      },
    },
    stderr: {
      isTTY: false,
      columns: 120,
      write(chunk: string) {
        stderr += chunk
        return true
      },
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}
