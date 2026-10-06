/**
 * recycleu 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/recycleu/src/cli.test.ts` 逐条抄过来），期望值不由被测函数现算。
 *
 * 抄过来的三条：
 * - `status --json` 出 `{success:true, data:{timerStatus:'idle'}}` 且**不碰回收站**、不带 ANSI
 *   （上游 `cli.test.ts:80-88`；那句 `expect(emptyRecycleBin).not.toHaveBeenCalled()`
 *   在这里由 `src/cli.ts` 的 `readOnlyRuntime()` 守：真去碰就抛，抛就会被 catch 成退出码 1）；
 * - 无参数且非 TTY 时退出码 2 + `No interactive terminal detected.`（上游 `cli.test.ts:25-31`）；
 * - `RECYCLEU_CYCLES_HELP` 含 `use 0 for unlimited`（上游 `cli.test.ts:98-100`）。
 *
 * 换掉的一条：上游 `clean --drive C --json` 是"经注入的 runtime 真执行"（`cli.test.ts:90-96`），
 * 本包这条腿未接（执行要 DSH 的 `ctx.subprocess` + 批准缝），所以同一个调用现在必须是
 * 退出码 2 + 点名缺的缝。**未接的动作不做参数校验**（sleept 的 `at` 刚踩过，判据见
 * `plugins/sleept/src/cli.ts:174-178`），所以第 4 条正控同时盯着"别把拒绝写成参数错"。
 *
 * 另一条改形的：上游 `cli.test.ts:14-23` 拿 `explicitInteractionModes`（`["ui","gd","guided"]`）
 * 逐条在非 TTY 下拒绝，断的是那句通用文案；本包三条腿**无论 TTY 与否**都不随包发布，
 * 而消息里叫的是规范模式名（`guided` 归一成 `gd`），见那条用例上的注释。
 *
 * @module xaihi-recycleu/tests/cli
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { RECYCLEU_CYCLES_HELP, runProgram } from '../src/cli.ts'

const ESC = String.fromCharCode(27)

afterEach(() => {
  process.exitCode = 0
})

/**
 * 成功路径不主动设退出码，所以这里既可能是 `undefined`（本条是第一例）也可能是 `0`
 * （前一条把它设过又被 afterEach 归零）。断"不是任何非零"比断某个具体值诚实，也不看用例顺序。
 */
function expectSuccessExit (): void {
  expect(process.exitCode === undefined || process.exitCode === 0).toBe(true)
}

describe('recycleu CLI', () => {
  it('status 出 ANSI-free 的 JSON，而且不碰回收站', async () => {
    const host = createHost()

    await runProgram(['status', '--json'], host)

    expectSuccessExit()
    expect(host.stdoutText()).not.toContain(ESC)
    expect(JSON.parse(host.stdoutText())).toMatchObject({ success: true, data: { timerStatus: 'idle', cleanCount: 0 } })
    // 上游同一条用例的 `not.toHaveBeenCalled()`：碰了就会抛，抛会被 catch 成退出码 1。
    expect(host.stderrText()).toBe('')
  })

  it('无参数且非 TTY：退出码 2 并给出 xrecycleu ui 的提示', async () => {
    const host = createHost({ stdinTTY: false, stdoutTTY: false })

    await runProgram([], host)

    expect(process.exitCode).toBe(2)
    expect(host.stdoutText()).toBe('')
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xrecycleu ui')
  })

  it('clean 未接：退出码 2、executed:false，理由点名 ctx.subprocess 与批准', async () => {
    const host = createHost()

    await runProgram(['clean', '--drive', 'C', '--json'], host)

    expect(process.exitCode).toBe(2)
    const payload = JSON.parse(host.stdoutText()) as {
      action: string
      executed: boolean
      planned: string[][]
      refused: string
    }
    expect(payload.action).toBe('clean_now')
    expect(payload.executed).toBe(false)
    // 计划就是上游那条 PowerShell 命令，**argv 逐元素照抄** `<noxide>/packages/nodes/recycleu/src/platform.ts:74-80`：
    // `-Command` 的值是整条带 `$ProgressPreference` 前缀的串（`platform.ts:73`），
    // `Clear-RecycleBin …` 从来不是一个独立的 argv 元素——所以上一条 `toContainEqual` 按上游形状根本不可能成立。
    // 四个 flag 各自都在尺里：少了 `-NoProfile` 使用者的 PowerShell profile 就会掺进这次执行，
    // 盘符没被 `normalizeDriveLetter` 收干净（`c:` 原样进串）也立刻红。
    expect(payload.planned[0]).toEqual([
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "$ProgressPreference = 'SilentlyContinue'; Clear-RecycleBin -DriveLetter C -Force -ErrorAction Stop",
    ])
    expect(host.stderrText()).toContain('ctx.subprocess')
    expect(host.stderrText()).toContain('approval')

    // 同一份 argv 的另一半判据在上游 `platform.ts:64`：`c:` 要收成 `-DriveLetter C`
    // （大写、冒号不带）。这里期望值仍是手抄的原文，不是拿上一条的输出比出来的。
    const lower = createHost()
    await runProgram(['clean', '--drive', 'c:', '--json'], lower)
    expect(JSON.parse(lower.stdoutText()).planned[0]).toEqual([
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "$ProgressPreference = 'SilentlyContinue'; Clear-RecycleBin -DriveLetter C -Force -ErrorAction Stop",
    ])
    expect(process.exitCode).toBe(2)
  })

  it('盘符不合法也照样先拒绝（阳性对照：去掉未接分支这条就会红）', async () => {
    const host = createHost()

    await runProgram(['start', '--drive', 'C;Remove-Item', '--interval', '2', '--cycles', '0', '--json'], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('ctx.subprocess')
    // 这三句都是参数校验口吻，出现在 stderr 就是把"没接"盖成了"你参数没给对"。
    expect(host.stderrText()).not.toContain('Unknown option')
    expect(host.stderrText()).not.toContain('must be an integer')
    expect(host.stderrText()).not.toContain('requires a value')
    const payload = JSON.parse(host.stdoutText()) as { planned: string[][]; notes: string[] }
    expect(payload.planned).toEqual([])
    // `--cycles 0` 还多缺一头的取消缝，那句要一起说（`src/exec.ts` 的 CANCELLATION_GAP）。
    expect(payload.notes.join(' ')).toContain('取消')
  })

  it('--cycles 0 那句话的措辞与上游同源（RECYCLEU_CYCLES_HELP）', () => {
    expect(RECYCLEU_CYCLES_HELP).toContain('use 0 for unlimited')
  })

  it('ui / gd / guided 三条交互腿都不随本包发布，退出码 2', async () => {
    // 期望值是手抄的两句上游事实（上游 `cli.test.ts:14-23` 用 `explicitInteractionModes =
    // ["ui","gd","guided"]` 逐条拒，但它只断那句通用文案，因为消息里叫的是**规范模式名**）：
    // 1. `guided` 是 `gd` 的旧拼法，上游 `resolveCliInvocation` 直接把它归一成 `gd`
    //    （`<noxide>/packages/cli-runtime/src/interaction.ts:150-160`，它自己的用例
    //    `index.test.ts` 钉的就是 `resolveCliInvocation(["guided"], tty) === "gd"`）；
    // 2. bin+模式用反引号包住是上游那句 `requireInteractiveMode` 的写法（同文件 `:162-164`），
    //    这一句住在 8 份逐字节共享的 `src/cli-support.ts` 里（尺：`scripts/check-vendored.mjs`），
    //    不是本包能单独改的文案。
    // 阳性对照：`guided` 那条要是丢了别名映射，就会掉进 pipe 面报 `Unknown command: guided`，
    // 这里等到的就不是 `xrecycleu gd` 未接，这条立刻红。
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
      expect(host.stderrText(), `${leg.argv} 的拒绝里没点名这条腿`).toContain(`\`xrecycleu ${leg.mode}\` 未接`)
      expect(host.stderrText(), `${leg.argv} 的拒绝里没交代缺的是哪条腿`).toContain('ctx.subprocess')
    }
  })

  it('--help 列出三个动作与 flag（root 帮助只列子命令，与 linedup 同一条判据）', async () => {
    const root = createHost()
    await runProgram(['--help'], root)
    expectSuccessExit()
    expect(root.stdoutText()).toContain('Usage xrecycleu <subcommand>')
    for (const action of ['status', 'clean', 'start']) {
      expect(root.stdoutText()).toContain(action)
    }

    const sub = createHost()
    await runProgram(['start', '--help'], sub)
    expectSuccessExit()
    expect(sub.stdoutText()).toContain('Usage xrecycleu start')
    expect(sub.stdoutText()).toContain('--drive')
    expect(sub.stdoutText()).toContain('--interval')
    expect(sub.stdoutText()).toContain('--cycles')
    expect(sub.stdoutText()).toContain('use 0 for unlimited')
  })

  it('未知子命令判为用法错（退出码 2），不静默走 status', async () => {
    const host = createHost()

    await runProgram(['empty-now'], host)

    expect(process.exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown command: empty-now')
  })
})

function createHost (options: { stdinTTY?: boolean; stdoutTTY?: boolean } = {}): CliHost & {
  stdoutText: () => string
  stderrText: () => string
} {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    // 默认 stdin 是 TTY：这样"缺参数"不会被管道输入兜底掩盖（与 linedup 的夹具同一判据）。
    stdin: { isTTY: options.stdinTTY ?? true } as CliHost['stdin'],
    stdout: { isTTY: options.stdoutTTY ?? false, columns: 120, write (chunk: string) { stdout += chunk; return true } },
    stderr: { isTTY: false, columns: 120, write (chunk: string) { stderr += chunk; return true } },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}
