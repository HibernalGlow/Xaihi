/**
 * `BitvRuntime` 的落地实现（`src/platform.ts`）的验收：外部程序那一格**只走 DSH 的
 * `ctx.subprocess`**，文件那一格与基线同一套 `node:fs` 算法。
 *
 * 三条尺各自的位置：
 * - 缝的形状（`argv` 逐字、`stdio` 三根都显式、`graceMs` 显式、退出码那格的映射）→ 用一个
 *   记账的假 `BitvSubprocessSeam` 现读，期望值手抄自基线 `platform.ts:48-58` 与 `:265-285`。
 * - 文件那一格（独占写、编号候选、递归枚举、不覆盖的 move）→ 用 `mkdtemp` 下的真目录跑，
 *   断的是盘上的文件名，不是返回值。
 * - 终端半边够不到缝 ⇒ `createBitvPlanRuntime()` 的两格**当场抛那句拒答**，而且抛的就是
 *   `src/cli.ts` 印出去的那一份（`tests/cli.spec.ts` 比的是同一个符号）。
 *
 * 假缝上 `resolveExecutable` 与 `spawn` 是两个**独立**的开关：把"查不到探针"与"探针起来了但
 * 失败了"混成一个开关，就会有一条用例其实一直在测另一条腿（本批第一版就这么错过一次）。
 *
 * @module xaihi-bitv/tests/platform
 */

import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runBitv } from '../src/core.ts'
import {
  BITV_PROCESS_SEAM_REFUSAL,
  createBitvPlanRuntime,
  createNodeBitvRuntime,
  findFfprobe,
  type BitvSubprocessHandle,
  type BitvSubprocessSeam,
  type BitvSubprocessSpawnSpec,
} from '../src/platform.ts'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'xaihi-bitv-'))
  tempDirs.push(dir)
  return dir
}

interface FakeSubprocess {
  seam: BitvSubprocessSeam
  resolveCalls: string[]
  spawnCalls: BitvSubprocessSpawnSpec[]
  /** 查找回合那一腿：真 ⇒ `resolveExecutable` 抛（等价于 `which` 非零）。 */
  lookupFails: boolean
  /** 退出码那一格：`null` = 被信号杀掉；`'reject'` = spawn 本身起不来。 */
  outcome: { exitCode: number | null } | 'reject'
  stdout: string
  stderr: string
}

/**
 * 记账用的假缝：结构与 `@deepseek-ai/dsh-subprocess` 的 `SubprocessRuntime` 子集镜像一致
 * （`src/platform.ts` 的文件头写了这份镜像的出处与还债条件）。
 */
function fakeSubprocess(probe: unknown): FakeSubprocess {
  const fake: FakeSubprocess = {
    seam: undefined as unknown as BitvSubprocessSeam,
    resolveCalls: [],
    spawnCalls: [],
    lookupFails: false,
    outcome: { exitCode: 0 },
    stdout: JSON.stringify(probe),
    stderr: '',
  }
  fake.seam = {
    async resolveExecutable(command) {
      fake.resolveCalls.push(command)
      if (fake.lookupFails) throw new Error(`fake: ${command} not found`)
      return `/usr/bin/${command}`
    },
    spawn(spec) {
      fake.spawnCalls.push(spec)
      return {
        collected: {
          stdout: { readFrom: () => ({ text: fake.stdout }) },
          stderr: { readFrom: () => ({ text: fake.stderr }) },
        },
        done: fake.outcome === 'reject'
          ? Promise.reject(new Error('fake: spawn failed'))
          : Promise.resolve(fake.outcome),
      } as unknown as BitvSubprocessHandle
    },
  }
  return fake
}

const PROBE = {
  format: { duration: "100" },
  streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1" }],
}

describe('bitv 的外部程序那一格 ⇒ ctx.subprocess', () => {
  it('findFfprobe 的顺序照基线：BITV_FFPROBE_PATH 命中就不起缝的查找回合', async () => {
    const root = await tempRoot()
    const real = join(root, 'ffprobe')
    await writeFile(real, 'not-a-real-binary', 'utf8')
    const fake = fakeSubprocess(PROBE)

    const found = await findFfprobe(fake.seam, root, { BITV_FFPROBE_PATH: 'ffprobe' })
    expect(found).toBe(resolve(root, 'ffprobe'))
    // 阳性对照：环境变量那条腿真的拦住了后面那一跳——查找回合一次都没被叫。
    expect(fake.resolveCalls).toEqual([])
  })

  it('环境变量没给 ⇒ 走 resolveExecutable("ffprobe")；它抛就回 null（那句失败由内核说）', async () => {
    const fake = fakeSubprocess(PROBE)
    expect(await findFfprobe(fake.seam, '/srv', {})).toBe('/usr/bin/ffprobe')
    expect(fake.resolveCalls).toEqual(['ffprobe'])

    const missing = fakeSubprocess(PROBE)
    missing.lookupFails = true
    expect(await findFfprobe(missing.seam, '/srv', {})).toBeNull()

    // 阳性对照：缝查不到 ⇒ 内核那句 "ffprobe was not found on this system." 出面，
    // 而不是这里另写一条失败。
    const runtime = createNodeBitvRuntime(missing.seam, { cwd: '/srv', env: {} })
    const result = await runBitv({ action: "status" }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('ffprobe was not found on this system.')
  })

  it('BITV_FFPROBE_PATH 指着一个不存在的文件 ⇒ 不许当真，落回 PATH 查找', async () => {
    const root = await tempRoot()
    const fake = fakeSubprocess(PROBE)
    expect(await findFfprobe(fake.seam, root, { BITV_FFPROBE_PATH: 'no/such/ffprobe' })).toBe('/usr/bin/ffprobe')
    expect(fake.resolveCalls).toEqual(['ffprobe'])
  })

  it('runFfprobeJson 的 argv 逐字对基线，stdio 三根与 graceMs 都显式给', async () => {
    const root = await tempRoot()
    await mkdir(join(root, 'nested'))
    const clip = join(root, 'nested', 'demo.mp4')
    await writeFile(clip, 'bytes', 'utf8')
    const fake = fakeSubprocess(PROBE)
    const runtime = createNodeBitvRuntime(fake.seam, { cwd: root, env: {} })

    expect(await runtime.runFfprobeJson('/usr/bin/ffprobe', 'nested/demo.mp4')).toEqual(PROBE)
    const spec = fake.spawnCalls[0]!
    expect(spec.argv).toEqual([
      '/usr/bin/ffprobe',
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      clip,
    ])
    expect(spec.cwd).toBe(root)
    expect(spec.graceMs).toBe(5000)
    expect(spec.stdio).toEqual({
      stdin: 'ignore',
      stdout: { maxBytes: 1024 * 1024 * 32 },
      stderr: { maxBytes: 1024 * 1024 * 32 },
    })
    expect(spec.argv[1]).toBe('-v')
  })

  it('非零退出：消息取 stderr，其次 stdout，最后那句 "ffprobe failed"（基线 shortProcessError）', async () => {
    const root = await tempRoot()
    await writeFile(join(root, 'a.mp4'), 'bytes', 'utf8')

    const noisy = fakeSubprocess(PROBE)
    noisy.outcome = { exitCode: 1 }
    noisy.stdout = ''
    noisy.stderr = 'Invalid data found when processing input'
    await expect(createNodeBitvRuntime(noisy.seam, { cwd: root, env: {} })
      .runFfprobeJson('/usr/bin/ffprobe', 'a.mp4')).rejects.toThrow('Invalid data found when processing input')

    // 阳性对照：两条流都空 ⇒ 落回那句兜底文本。
    const quiet = fakeSubprocess(PROBE)
    quiet.outcome = { exitCode: 2 }
    quiet.stdout = ''
    quiet.stderr = ''
    await expect(createNodeBitvRuntime(quiet.seam, { cwd: root, env: {} })
      .runFfprobeJson('/usr/bin/ffprobe', 'a.mp4')).rejects.toThrow('ffprobe failed')
  })

  it('被信号杀掉（exitCode: null）⇒ 与上游同一判：非零，报失败', async () => {
    const root = await tempRoot()
    await writeFile(join(root, 'a.mp4'), 'bytes', 'utf8')
    const fake = fakeSubprocess(PROBE)
    fake.outcome = { exitCode: null }
    fake.stderr = 'killed'
    await expect(createNodeBitvRuntime(fake.seam, { cwd: root, env: {} })
      .runFfprobeJson('/usr/bin/ffprobe', 'a.mp4')).rejects.toThrow('killed')
  })

  it('stdout 不是 JSON ⇒ 那句 "ffprobe returned invalid JSON: …" 原样保住', async () => {
    const root = await tempRoot()
    await writeFile(join(root, 'a.mp4'), 'bytes', 'utf8')
    const fake = fakeSubprocess(PROBE)
    fake.stdout = 'not json at all'
    await expect(createNodeBitvRuntime(fake.seam, { cwd: root, env: {} })
      .runFfprobeJson('/usr/bin/ffprobe', 'a.mp4')).rejects.toThrow(/^ffprobe returned invalid JSON: /)
  })

  it('探针起来了但 spawn 起不来 ⇒ 错误原样上抛，由内核收成一条 per-file 错误', async () => {
    const root = await tempRoot()
    await writeFile(join(root, 'a.mp4'), 'bytes', 'utf8')
    const fake = fakeSubprocess(PROBE)
    fake.outcome = 'reject'
    const runtime = createNodeBitvRuntime(fake.seam, { cwd: root, env: {} })

    const result = await runBitv({ action: "analyze", paths: [root] }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errors.join(' ')).toContain('fake: spawn failed')
    // 阳性对照：查找回合是**成功**的那条腿（`ffprobePath` 有值），失败的是这一次 spawn 本身。
    expect(result.data?.ffprobePath).toBe('/usr/bin/ffprobe')
    expect(fake.resolveCalls).toEqual(['ffprobe'])
  })
})

describe('bitv 的文件那一格（与基线同一套 node:fs 算法）', () => {
  it('递归枚举：子目录进、非视频跳过、不存在的路径出一条错误而不是整条失败', async () => {
    const root = await tempRoot()
    await writeFile(join(root, 'a.mp4'), 'x', 'utf8')
    await writeFile(join(root, 'notes.txt'), 'x', 'utf8')
    await mkdir(join(root, 'deep'))
    await writeFile(join(root, 'deep', 'b.mkv'), 'x', 'utf8')
    const runtime = createNodeBitvRuntime(fakeSubprocess(PROBE).seam, { cwd: root, env: {} })

    const deep = await runtime.discoverVideos([root], true)
    expect(deep.files.map((file) => file.relativePath)).toEqual(['a.mp4', 'deep/b.mkv'])
    expect(deep.errors).toEqual([])

    const shallow = await runtime.discoverVideos([root], false)
    expect(shallow.files.map((file) => file.relativePath)).toEqual(['a.mp4'])

    const missing = await runtime.discoverVideos([join(root, 'nope')], true)
    expect(missing.files).toEqual([])
    expect(missing.errors).toHaveLength(1)
    expect(missing.errors[0]).toContain('nope')
  })

  it('writeJson 绝不覆盖：第二次落到 `analysis (1).json`（盘上回读）', async () => {
    const root = await tempRoot()
    const reports = join(root, 'reports')
    const desired = join(reports, 'analysis.json')
    const runtime = createNodeBitvRuntime(fakeSubprocess(PROBE).seam, { cwd: root, env: {} })

    expect(await runtime.writeJson(desired, { schemaVersion: 1 })).toBe(desired)
    expect(await runtime.writeJson(desired, { schemaVersion: 1 })).toBe(join(reports, 'analysis (1).json'))
    expect((await readdir(reports)).sort()).toEqual(['analysis (1).json', 'analysis.json'])
  })

  it('transferFile(copy) 不覆盖，move 用硬链接 + unlink，落点同样带编号', async () => {
    const root = await tempRoot()
    const source = join(root, 'clip.mp4')
    await writeFile(source, 'payload', 'utf8')
    const runtime = createNodeBitvRuntime(fakeSubprocess(PROBE).seam, { cwd: root, env: {} })
    const desired = join(root, 'sorted', '5Mbps', 'clip.mp4')

    expect(await runtime.transferFile(source, desired, 'copy')).toBe(desired)
    expect(await runtime.transferFile(source, desired, 'copy')).toBe(join(root, 'sorted', '5Mbps', 'clip (1).mp4'))
    expect(await runtime.transferFile(source, desired, 'move')).toBe(join(root, 'sorted', '5Mbps', 'clip (2).mp4'))
    // 阳性对照：move 真的把源文件拿走了（硬链接 + unlink 那条路），copy 两次都没有。
    expect(existsSync(source)).toBe(false)
    expect(existsSync(desired)).toBe(true)
  })

  it('resolveAvailablePath 只回读一个空位，不动盘', async () => {
    const root = await tempRoot()
    const desired = join(root, 'out.json')
    await writeFile(desired, '{}', 'utf8')
    const runtime = createNodeBitvRuntime(fakeSubprocess(PROBE).seam, { cwd: root, env: {} })
    expect(await runtime.resolveAvailablePath(desired)).toBe(join(root, 'out (1).json'))
    expect(await readdir(root)).toEqual(['out.json'])
  })

  it('statFile 指着一个目录 ⇒ 那句 "Path is not a file."', async () => {
    const root = await tempRoot()
    const runtime = createNodeBitvRuntime(fakeSubprocess(PROBE).seam, { cwd: root, env: {} })
    await expect(runtime.statFile(root)).rejects.toThrow('Path is not a file.')
  })
})

describe('bitv 走完整条宿主腿（假缝 + 真目录）', () => {
  it('analyze 用真实文件大小算码率，并按内核的档位表分档', async () => {
    const root = await tempRoot()
    // 4_000_000 字节 / 100 秒 ⇒ 320_000 bps ⇒ 0.32 Mbps ⇒ 步长 5 的第一档 "5Mbps"。
    await writeFile(join(root, 'demo.mp4'), Buffer.alloc(4_000_000, 7))
    const fake = fakeSubprocess(PROBE)
    const runtime = createNodeBitvRuntime(fake.seam, { cwd: root, env: {} })

    const result = await runBitv({ action: "analyze", paths: [root] }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.videos[0]?.bitrateMbps).toBe(0.32)
    expect(result.data?.videos[0]?.bitrateLevel).toBe("5Mbps")
    expect(result.data?.stats.totalSizeBytes).toBe(4_000_000)
    expect(fake.spawnCalls).toHaveLength(1)
  })
})

describe('bitv 的终端半边拿不到那条缝', () => {
  it('createBitvPlanRuntime 的两格抛的就是 cli 印出去的那一句（一份真源）', async () => {
    const runtime = createBitvPlanRuntime({ cwd: '/srv', env: {} })
    // 这一条尤其重要：`findFfprobe` 里面本来有一条 `catch ⇒ null`，把拒绝塞进缝里就会被它咽掉，
    // 症状是内核那句"这台机器没有 ffprobe"，而真相是"这条缝在宿主进程之外"。
    await expect(runtime.findFfprobe()).rejects.toThrow(BITV_PROCESS_SEAM_REFUSAL)
    await expect(runtime.runFfprobeJson('ffprobe', '/srv/a.mp4')).rejects.toThrow(BITV_PROCESS_SEAM_REFUSAL)
    // 阳性对照：这句话必须点名到服务名并给出宿主侧的替代入口，只说"不支持"使用者无从判断缺的是哪条腿。
    expect(BITV_PROCESS_SEAM_REFUSAL).toContain('ctx.subprocess')
    expect(BITV_PROCESS_SEAM_REFUSAL).toContain('DSH')
    expect(BITV_PROCESS_SEAM_REFUSAL).toContain('bitv_status')
    // 文件那几格留着：预演路径万一只读文件，用的还是同一份内核，不是终端面另写的假内核。
    expect(await runtime.resolveAvailablePath('/srv/nope.json')).toBe('/srv/nope.json')
  })
})
