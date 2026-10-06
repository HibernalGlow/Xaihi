/**
 * logx 终端面的验收：断的是**上游那份 CLI 的形状**，不是"我以为它做什么"。
 *
 * 期望值来源（不许由被测函数现算）：
 * - 子命令名、flag 名与"哪几条不带 `--json` 也出 JSON" ⇒
 *   `<Xiranite>` tag `noxide` 的 `packages/nodes/logx/src/cli.ts:32-51`；
 * - 五个动作与字段 id ⇒ `node-definitions/logx.json`（本仓落在 `package.json#xaihi.node`）；
 * - 缺省值 `limit=500` / `order=desc` / `minimumSeverity=trace` ⇒ 上游 `core.ts:69-83`。
 *
 * 上游没有 `logx/src/cli.test.ts`（实测该目录只有 `core.test.ts`），所以这一份的形状
 * 判据来自同批已迁节点：`plugins/linedup/tests/cli.spec.ts` 与 `plugins/sleept/tests/cli.spec.ts`
 * 的同名用例（非 TTY 那句、`--help` 的 `Usage <bin>` 前缀、未知 flag 的退出码 2）。
 *
 * **本面最重要的一条**是第 4 条：动作未接时必须先拒绝、先点名缺的缝，
 * 不许把症状写成"你参数没给对"——那条 bug 刚在 sleept 的 `at` 上被改掉
 * （判据见 `plugins/sleept/src/cli.ts:174-178`），这里的正控就是给它准备的。
 *
 * @module xaihi-logx/tests/cli
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { runProgram } from '../src/cli.ts'

afterEach(() => {
  process.exitCode = 0
})

/**
 * 成功路径不主动设退出码，所以这里既可能是 `undefined`（本条是第一例）也可能是 `0`
 * （前一条把它设过又被 afterEach 归零）。断"不是任何非零"比断某个具体值诚实，
 * 也不依赖用例顺序——`plugins/linedup/tests/cli.spec.ts` 那份是靠顺序才绿的。
 */
function expectSuccessExit (): void {
  expect(process.exitCode === undefined || process.exitCode === 0).toBe(true)
}

describe('logx CLI', () => {
  it('--help 列出五个动作', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expectSuccessExit()
    const help = host.stdoutText()
    expect(help).toContain('Usage xlogx <subcommand>')
    for (const action of ['query', 'sessions', 'stats', 'errors', 'doctor']) {
      expect(help).toContain(action)
    }
  })

  it('query --help 列出 flag（kebab 与 camel 两种拼法都认，见 cli-support 的 camelCase）', async () => {
    const host = createHost()

    await runProgram(['query', '--help'], host)

    expectSuccessExit()
    const help = host.stdoutText()
    expect(help).toContain('Usage xlogx query')
    for (const flag of ['--level', '--scope', '--event', '--session', '--search', '--since', '--until', '--limit', '--order', '--json']) {
      expect(help).toContain(flag)
    }
  })

  it('非 TTY 且无参数时拒绝，并给出 xlogx ui 的提示', async () => {
    const host = createHost({ stdinTTY: false, stdoutTTY: false })

    await runProgram([], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xlogx')
    expect(host.stderrText()).toContain('xlogx ui')
  })

  it('query 未接：退出码 2、executed:false，理由点名 ctx.fs', async () => {
    const host = createHost()

    await runProgram(['query', '--level', 'warn', '--json'], host)

    expect(process.exitCode).toBe(2)
    const payload = JSON.parse(host.stdoutText()) as {
      action: string
      executed: boolean
      query: { minimumSeverity: string }
    }
    expect(payload.action).toBe('query')
    expect(payload.executed).toBe(false)
    // 计划本身是内核算的，不是这里另写一份：上游 `core.ts:69-83` 的缺省就是这些值。
    expect(payload.query.minimumSeverity).toBe('warn')
    expect(host.stderrText()).toContain('ctx.fs')
    expect(host.stderrText()).toContain('Config.logDir')
  })

  it('参数不对也照样先拒绝（阳性对照：去掉未接分支这条就会红）', async () => {
    const host = createHost()

    await runProgram(['query', '--level', 'bogus', '--order', 'sideways', '--limit', 'abc'], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('ctx.fs')
    // 症状不许变成"我参数没给对"：这三句都是参数校验口吻，出现在 stderr 就是回归。
    expect(host.stderrText()).not.toContain('Invalid --level')
    expect(host.stderrText()).not.toContain('Unknown option')
    expect(host.stderrText()).not.toContain('requires a value')
  })

  it('stats / doctor 不带 --json 也出 JSON（上游 cli.ts:47 那条缺省）', async () => {
    for (const action of ['stats', 'doctor']) {
      const host = createHost()

      await runProgram([action], host)

      expect(process.exitCode).toBe(2)
      expect(() => JSON.parse(host.stdoutText())).not.toThrow()
      expect(JSON.parse(host.stdoutText()).executed).toBe(false)
    }
  })

  it('ui 与 guided 都不随本包发布，退出码 2 并说明原因', async () => {
    // 期望值是手抄的两句上游事实，不是现算：
    // 1. 拒绝里叫的是**规范模式名**——上游把 `guided` 收成 `gd` 的旧拼法
    //    （`<noxide>/packages/cli-runtime/src/interaction.ts:150-160`，同文件那份
    //    `index.test.ts` 钉的就是 `resolveCliInvocation(["guided"], tty) === "gd"`）；
    // 2. bin+模式一起用反引号包住是上游那句 `requireInteractiveMode` 的写法
    //    （同文件 `:162-164` 那条 `` `mode` mode requires an interactive terminal ``），
    //    而这一句住在 8 份逐字节共享的 `src/cli-support.ts` 里（尺：`scripts/check-vendored.mjs`），
    //    不是本包能单独改的文案。
    // 阳性对照：`guided` 那条要是丢了别名映射，就会掉进 pipe 面报 `Unknown command: guided`，
    // 这里等到的就不是 `xlogx gd` 未接，这条立刻红。
    const legs = [
      { argv: 'ui', mode: 'ui' },
      { argv: 'gd', mode: 'gd' },
      { argv: 'guided', mode: 'gd' },
    ] as const

    for (const leg of legs) {
      const host = createHost()

      await runProgram([leg.argv], host)

      expect(process.exitCode, `${leg.argv} 未接却报了成功码`).toBe(2)
      expect(host.stdoutText(), `${leg.argv} 的拒绝不许混进 stdout`).toBe('')
      expect(host.stderrText(), `${leg.argv} 的拒绝里没点名这条腿`).toContain(`\`xlogx ${leg.mode}\` 未接`)
      expect(host.stderrText(), `${leg.argv} 的拒绝里没交代缺的是哪条腿`).toContain('OpenTUI')
    }
  })

  it('未知 flag 判为用法错（退出码 2），与"未接"是两种症状', async () => {
    const host = createHost()

    await runProgram(['query', '--nope', 'x'], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('未知子命令也判用法错（不是静默走缺省 query）', async () => {
    const host = createHost()

    await runProgram(['nonsense'], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown command: nonsense')
  })
})

function createHost (options: { stdinTTY?: boolean; stdoutTTY?: boolean } = {}): CliHost & {
  stdoutText: () => string
  stderrText: () => string
} {
  let stdout = ''
  let stderr = ''
  const stdinTTY = options.stdinTTY ?? true
  const stdoutTTY = options.stdoutTTY ?? false
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    // 默认 stdin 是 TTY：这样"缺参数"不会被管道输入兜底掩盖（与 linedup 的夹具同一判据）。
    stdin: { isTTY: stdinTTY } as CliHost['stdin'],
    stdout: { isTTY: stdoutTTY, columns: 120, write (chunk: string) { stdout += chunk; return true } },
    stderr: { isTTY: false, columns: 120, write (chunk: string) { stderr += chunk; return true } },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}
