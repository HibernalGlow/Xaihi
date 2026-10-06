/**
 * bandia 的 `BandiaRuntime` 里**外部程序那一半**的落地实现：`findBandizip` / `runCommand`
 * / `openEverything`，全部走 DSH 的 `ctx.subprocess`。
 *
 * 为什么是 `ctx.subprocess` 而不是 `node:child_process`：
 * `docs/service-mapping.md`「子进程 / 命令执行 ⇒ **不搬**基础件」那一行的判据是
 * `subprocess.md` 的 `ctx.subprocess`，原话是"节点要外部程序就走 `ctx.subprocess`，
 * 权限与审批由 DSH 缝负责（`sleept` 是第一个用户）"。上游 `platform.ts:1` 那份
 * `execFile` / `spawn` 因此在 Xaihi 没有对应物——把它搬进来就是给 DSH 已经提供的能力
 * 再造一条腿。落地形状与 `plugins/sleept/src/exec.ts`、`plugins/recycleu/src/exec.ts`
 * 同源（`spawn(spec)` → `handle.done` → `handle.collected.*.readFrom(0).text`）。
 *
 * `SubprocessSeam` 是本包**自己声明的结构类型**，不是 DSH 那份 Service Definition 的副本：
 * 真源是 `@deepseek-ai/dsh-subprocess@0.2.0-rc.2` 的 `SubprocessRuntime` /
 * `SubprocessSpawnSpec` / `SubprocessHandle` / `SubprocessOutcome`
 * （现读 `plugins/recycleu/node_modules/@deepseek-ai/dsh-subprocess/lib/types/index.d.ts:102`
 * 与同包 `types.d.ts:69-147`）。这里只写本包调用的那几个字段，取用方式是
 * `ctx.get('subprocess')`（`crashu` 对 `OPERATIONS_SERVICE` 同一写法）。
 * **依赖请求**：把 `@deepseek-ai/dsh-subprocess` 加进本包 devDependencies/peerDependencies
 * 之后，这个结构类型应当删掉、直接 `import type { SubprocessRuntime }`——加依赖要跑
 * `pnpm install`，本任务不许碰锁文件，所以留在这里并点名。
 *
 * 与上游那份的两处行为落差，都在 seam 这一侧、不在 `core.ts`：
 * 1. **找不到可执行文件**：上游 `execFile` 把 `ENOENT` 折成 `{code: 0}`（`platform.ts:133`
 *    那句三元只在 `error.code` 是数字时取它），于是"bz 没装"在 `runCommand` 上读起来像成功；
 *    `ctx.subprocess` 的 `done` 对 spawn 失败是**拒绝**（`index.d.ts:56-57`）。这里把它折成
 *    `{code: 1, stderr: <原因>}`：内核 `shortError()`（`core.ts:537`）优先读 stderr，
 *    所以那句原因会原样进 `results[].error`，界面上读得回来。改成 0 才是伪造。
 * 2. **`durationMs`**：上游在 `runCommand` 里自己掐表（`platform.ts:130`、`:138`），
 *    这里同样自己掐表——`SubprocessOutcome` 只有 `exitCode` 与 `signal`，没有耗时。
 *
 * `openEverything` 是**发射后不管**：上游 `spawn(...).unref()`（`platform.ts:153`）。这里同样
 * 不等 `done`，但必须挂一个 `catch`，否则一条没人接的拒绝会变成 unhandled rejection；
 * 非 win32 直接返回，与上游 `:145` 同一句早退。
 *
 * `BANDIZIP_PATH` 那条环境变量**不读**：按 `docs/adr/0013-config-goes-through-dsh-settings.md`，
 * 使用者给的位置走 `Config.bandizipPath`（`src/index.ts` 声明，使用点 `.get()`），
 * 留空 = 不覆盖，与上游"没设这个环境变量"那一条分支同形。
 * `LOCALAPPDATA` / `PROGRAMFILES` 这类**平台位置**变量照上游继续读
 * （`platform.ts:82`、`:146-149`）：它们不是使用者配置，是操作系统目录约定。
 *
 * @module xaihi-bandia/exec
 */

import type { BandiaCommandResult } from "./core.ts"

/** `ctx.subprocess` 里本包用到的那一小块（真源见文件头点名的 `dsh-subprocess`）。 */
export interface SubprocessSeam {
  spawn (spec: {
    argv: readonly string[]
    cwd: string
    graceMs: number
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
  }): {
    readonly done: Promise<{ exitCode: number | null }>
    readonly collected: {
      readonly stdout?: { readFrom (fromByte: number): { text: string } }
      readonly stderr?: { readFrom (fromByte: number): { text: string } }
    }
  }
}

/** 上游 `platform.ts:10` 那份候选可执行文件名，顺序原样。 */
const BZ_EXECUTABLE_NAMES = ['bz.exe', 'bandizip', 'Bandizip', 'BZ.exe']

/**
 * 上游 `platform.ts:79-83` 那三个安装根。前两条是字面量约定，第三条要 `LOCALAPPDATA`
 * （平台位置，不是使用者配置，见文件头）。
 */
const BANDIZIP_INSTALL_ROOTS = (env: NodeJS.ProcessEnv, join: (...parts: string[]) => string): string[] => [
  'C:\\Program Files\\Bandizip',
  'C:\\Program Files (x86)\\Bandizip',
  join(env.LOCALAPPDATA ?? '', 'Programs', 'Bandizip'),
]

/** 上游 `platform.ts:146-149` 找 Everything.exe 的三个候选。 */
const EVERYTHING_CANDIDATES = (env: NodeJS.ProcessEnv, join: (...parts: string[]) => string): string[] => [
  join(env.PROGRAMFILES ?? '', 'Everything', 'Everything.exe'),
  join(env['PROGRAMFILES(X86)'] ?? '', 'Everything', 'Everything.exe'),
  join(env.LOCALAPPDATA ?? '', 'Everything', 'Everything.exe'),
]

/** 上游 `runCommand` 的 `maxBuffer: 1024 * 1024 * 16`（`platform.ts:132`），`bz l` 的清单要靠它。 */
const OUTPUT_BYTES = 16 * 1024 * 1024

/** `ctx.subprocess` 的终止宽限与收尾排空窗口；与 `plugins/recycleu/src/exec.ts:63` 同一档。 */
const GRACE_MS = 5_000

/** 外部程序那一半的缝。 */
export interface BandiaExecRuntime {
  findBandizip: () => Promise<string | null>
  runCommand: (command: string, args: string[], options?: { cwd?: string }) => Promise<BandiaCommandResult>
  openEverything: (efuPath: string) => Promise<void>
}
/**
 * @param subprocess - DSH 的 `ctx.subprocess`（取用方式见 `src/index.ts`）。
 * @param options.cwd - 子进程工作目录；`ctx.subprocess` 的 spec 要求显式给，不猜。
 * @param options.bandizipPath - `Config.bandizipPath` 的**现取**闭包（使用点读，改配置不必重启）。
 * @param options.platform - 平台判定，测试用；缺省取真实平台。
 * @param options.env - 平台位置变量来源，测试用；缺省 `process.env`。
 */
export function createBandiaExecRuntime (
  subprocess: SubprocessSeam,
  options: {
    cwd: string
    bandizipPath: () => string
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    /** 文件探测由 `src/platform.ts` 那一半提供，避免这里再引一次 `node:fs`。 */
    isFile: (path: string) => Promise<boolean>
    join: (...parts: string[]) => string
    resolve: (path: string) => string
  },
): BandiaExecRuntime {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const { isFile, join, resolve } = options

  /** 上游 `findOnPath`（`platform.ts:157-162`）：`where.exe` / `which` 都走同一条 runCommand。 */
  const findOnPath = async (command: string): Promise<string | null> => {
    const locator = platform === 'win32' ? 'where.exe' : 'which'
    const result = await runCommand(locator, [command])
    if (result.code !== 0) return null
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
  }

  const firstExistingFile = async (paths: string[]): Promise<string | null> => {
    for (const path of paths) {
      if (path !== '' && await isFile(path)) return path
    }
    return null
  }

  /** 上游 `platform.ts:64-91` 的三段顺序，一条都不许换：显式路径 → PATH → 安装根。 */
  const findBandizip = async (): Promise<string | null> => {
    const configured = options.bandizipPath()
    if (configured !== '') {
      if (await isFile(configured)) return configured
      for (const name of BZ_EXECUTABLE_NAMES) {
        const candidate = join(configured, name)
        if (await isFile(candidate)) return candidate
      }
    }

    for (const name of BZ_EXECUTABLE_NAMES) {
      const fromPath = await findOnPath(name)
      if (fromPath !== null) return fromPath
    }

    for (const root of BANDIZIP_INSTALL_ROOTS(env, join)) {
      if (root.trim() === '') continue
      for (const name of BZ_EXECUTABLE_NAMES) {
        const candidate = join(root, name)
        if (await isFile(candidate)) return candidate
      }
    }
    return null
  }

  const runCommand = async (command: string, args: string[], runOptions?: { cwd?: string }): Promise<BandiaCommandResult> => {
    const started = Date.now()
    try {
      const handle = subprocess.spawn({
        // `argv[0]` 是程序本体；`ctx.subprocess` 明文"Never shell-interpreted here"
        // （`types.d.ts:70`），与上游 `execFile` 同一纪律。
        argv: [command, ...args],
        cwd: runOptions?.cwd ?? options.cwd,
        graceMs: GRACE_MS,
        stdio: { stdin: 'ignore', stdout: { maxBytes: OUTPUT_BYTES }, stderr: { maxBytes: OUTPUT_BYTES } },
      })
      const outcome = await handle.done
      return {
        // `exitCode` 在被信号杀死时是 `null`；上游那份也拿不到信号原因，折成 1 并给出可读的 stderr。
        code: outcome.exitCode ?? 1,
        stdout: handle.collected.stdout?.readFrom(0).text ?? '',
        stderr: handle.collected.stderr?.readFrom(0).text ?? (outcome.exitCode === null ? `${command} was terminated by a signal` : ''),
        durationMs: Date.now() - started,
      }
    } catch (error) {
      return {
        code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      }
    }
  }

  const openEverything = async (efuPath: string): Promise<void> => {
    if (platform !== 'win32') return
    const everything = await firstExistingFile(EVERYTHING_CANDIDATES(env, join))
    if (everything === null) return
    try {
      const handle = subprocess.spawn({
        argv: [everything, '-filelist', resolve(efuPath)],
        cwd: options.cwd,
        graceMs: GRACE_MS,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 0 }, stderr: { maxBytes: 0 } },
      })
      // 发射后不管，但拒绝必须有人接：否则 GUI 启动失败会变成一次 unhandled rejection。
      handle.done.catch(() => {})
    } catch {
      // Everything 没装/起不来在上游是同一段里没有 try 的（`platform.ts:153` 直接 spawn）。
      // 这里吞掉的是"打开外部 GUI 这一条跟进动作"，EFU 文件本身已经写完了；
      // 空 catch 必须点名吞的是什么：spawn 同步抛出的场景是 argv[0] 解析失败。
    }
  }

  return { findBandizip, runCommand, openEverything }
}
