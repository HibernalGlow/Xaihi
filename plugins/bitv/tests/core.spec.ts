/**
 * bitv 内核的保真度用例：**期望值逐条手抄自基线 `noxide` 的
 * `packages/nodes/bitv/src/core.test.ts`（173 行）**，没有一个数字是被测函数现算出来的。
 * 夹具 `createRuntime` 也是那份的复制品（默认探针给 `duration: "100"` +
 * `sizeBytes: 12_500_000` ⇒ 1Mbps ⇒ `"5Mbps"`，改一处就要改全部）。
 *
 * 三条上游自带的分歧**两头都钉住、不统一**：
 * - 内核 `dryRun` 的判据是 `input.dryRun !== false`（`core.ts:225`）⇒ **省略 = 预演**；
 *   而宿主面拿到的 `inputs.dryRun` 在模型省略时是 `false`（`bindInputs` 的 `asBoolean` 折法，
 *   缺口 G8，`packages/node-sdk/src/define-node.ts:144-145`）⇒ 同一个"没给"在两侧读成两样。
 *   宿主那一侧的钉法在 `tests/definition.spec.ts`，这里只钉内核这一侧。
 * - 定义里 `bitrateStepMbps` 的界面默认是 5、`maxLevels` 是 10（`node-definitions/bitv.json`），
 *   与内核 `BITV_DEFAULTS` 同源同值；这一条**不是**分歧，钉它是为了防止有人把清单那侧改掉。
 * - 旧报告（Python schema）里的 `bitrate_level: "10MB"` 会被**丢弃重算**成 `"10Mbps"`
 *   （`core.ts:431-434`），而 `bitrateBps` 为 0 时保留原标签——两种情形不是同一条代码路径。
 *
 * @module xaihi-bitv/tests/core
 */

import { describe, expect, it, test, vi } from 'vitest'
import {
  BITV_DEFAULTS,
  bitrateLevelFor,
  createBitrateLevels,
  isBitvVideoPath,
  normalizeBitvReport,
  parseBitvPaths,
  parseFfprobeVideo,
  runBitv,
  type BitvInput,
  type BitvRuntime,
  type BitvTransferMode,
} from '../src/core.ts'

describe('native BitV core', () => {
  test("calculates bitrate from ffprobe duration and file stat instead of trusting probe bitrate", () => {
    const levels = createBitrateLevels(5, 2)
    const video = parseFfprobeVideo(
      "D:/videos/demo.mp4",
      "nested/demo.mp4",
      { sizeBytes: 12_500_000 },
      {
        format: { duration: "100", bit_rate: "999999999" },
        streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30000/1001" }],
      },
      levels,
    )

    expect(video.bitrateBps).toBe(1_000_000)
    expect(video.bitrateMbps).toBe(1)
    expect(video.bitrateLevel).toBe("5Mbps")
    expect(video.fps).toBeCloseTo(29.97, 2)
    expect(video.resolution).toBe("1920x1080")
  })

  test("creates deterministic bitrate bands with an overflow band", () => {
    const levels = createBitrateLevels(2.5, 3)

    expect(levels.map((level) => level.label)).toEqual(["2.5Mbps", "5Mbps", "7.5Mbps", "over-7.5Mbps"])
    expect(bitrateLevelFor(7_500_001, levels)).toBe("over-7.5Mbps")
  })

  test("analyzes discovered files and writes a collision-safe native report through the runtime", async () => {
    const writeJson = vi.fn(async (_desiredPath: string, _value: unknown) => "D:/reports/analysis (1).json")
    const events: string[] = []
    const runtime = createRuntime({ writeJson })

    const result = await runBitv({
      action: "analyze",
      paths: ["D:/videos"],
      recursive: true,
      outputPath: "D:/reports/analysis.json",
    }, runtime, (event) => events.push(event.message))

    expect(result.success).toBe(true)
    expect(result.data?.videos).toHaveLength(1)
    expect(result.data?.stats.totalVideos).toBe(1)
    expect(result.data?.reportPath).toBe("D:/reports/analysis (1).json")
    expect(writeJson).toHaveBeenCalledTimes(1)
    expect(writeJson.mock.calls[0]?.[1]).toMatchObject({ schemaVersion: 1, requestedPaths: ["D:/videos"] })
    expect(events.at(-1)).toBe("Video analysis completed.")
  })

  test("classify defaults to dry-run and never invokes the transfer executor", async () => {
    const transferFile = vi.fn(async () => "D:/sorted/5Mbps/demo.mp4")
    const resolveAvailablePath = vi.fn(async () => "D:/sorted/5Mbps/demo (1).mp4")
    const runtime = createRuntime({ transferFile, resolveAvailablePath })

    const result = await runBitv({
      action: "classify",
      paths: ["D:/videos"],
      targetPath: "D:/sorted",
      transferMode: "move",
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.dryRun).toBe(true)
    expect(result.data?.operations[0]).toMatchObject({
      mode: "move",
      dryRun: true,
      targetPath: "D:/sorted/5Mbps/demo (1).mp4",
    })
    expect(resolveAvailablePath).toHaveBeenCalledWith("D:/sorted/5Mbps/nested/demo.mp4")
    expect(transferFile).not.toHaveBeenCalled()
  })

  test("live classification delegates collision-safe transfer and records the returned destination", async () => {
    const transferFile = vi.fn(async () => "D:/sorted/5Mbps/nested/demo (2).mp4")
    const runtime = createRuntime({ transferFile })

    const result = await runBitv({
      action: "classify",
      paths: ["D:/videos"],
      targetPath: "D:/sorted",
      transferMode: "copy",
      dryRun: false,
    }, runtime)

    expect(result.success).toBe(true)
    expect(transferFile).toHaveBeenCalledWith(
      "D:/videos/nested/demo.mp4",
      "D:/sorted/5Mbps/nested/demo.mp4",
      "copy",
    )
    expect(result.data?.operations[0]?.targetPath).toBe("D:/sorted/5Mbps/nested/demo (2).mp4")
  })

  test("normalizes legacy Python reports and previews report classification", async () => {
    const legacy = {
      folder_path: "D:/videos",
      timestamp: "2025-08-19T12:00:00",
      videos: [{
        path: "D:/videos/old.mp4",
        info: {
          filename: "old.mp4",
          bitrate_mbps: 8,
          width: 1280,
          height: 720,
          fps: 24,
          size_mb: 10,
        },
        bitrate_level: "10MB",
      }],
    }
    const normalized = normalizeBitvReport(legacy)
    expect(normalized.requestedPaths).toEqual(["D:/videos"])
    expect(normalized.videos[0]?.bitrateBps).toBe(8_000_000)

    const runtime = createRuntime({ readJson: async () => legacy })
    const result = await runBitv({
      action: "report",
      reportPath: "D:/reports/legacy.json",
      targetPath: "D:/sorted",
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.videos[0]?.bitrateLevel).toBe("10Mbps")
    expect(result.data?.operations[0]).toMatchObject({ dryRun: true, targetPath: "D:/sorted/10Mbps/old.mp4" })
  })

  test("reports a missing ffprobe before analysis", async () => {
    const runtime = createRuntime({ findFfprobe: async () => null })

    const result = await runBitv({ action: "analyze", paths: ["D:/videos"] }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toContain("ffprobe was not found")
    expect(runtime.discoverVideos).not.toHaveBeenCalled()
  })
})

describe('bitv 内核里几条没人会在 UI 上按的判据', () => {
  it('省略 dryRun ⇒ 预演（内核那一侧的读法；宿主侧的读法在 tests/definition.spec.ts）', async () => {
    const transferFile = vi.fn(async () => "D:/sorted/5Mbps/nested/demo.mp4")
    const resolveAvailablePath = vi.fn(async () => "D:/sorted/5Mbps/nested/demo.mp4")
    const runtime = createRuntime({ transferFile, resolveAvailablePath })

    const omitted = await runBitv({ action: "classify", paths: ["D:/videos"], targetPath: "D:/sorted" }, runtime)
    expect(omitted.data?.dryRun).toBe(true)
    expect(transferFile).not.toHaveBeenCalled()

    // 阳性对照：只有显式 false 才换一条路——把内核那句 `!== false` 改成 `?? true` 就红了。
    const explicit = await runBitv(
      { action: "classify", paths: ["D:/videos"], targetPath: "D:/sorted", dryRun: false },
      runtime,
    )
    expect(explicit.data?.dryRun).toBe(false)
    expect(transferFile).toHaveBeenCalledTimes(1)
  })

  it('空串 transferMode 会被内核当成一个模式值（这条就是接线层要白名单的原因）', async () => {
    const transferFile = vi.fn(async (_source: string, _desired: string, _mode: BitvTransferMode) => "D:/sorted/5Mbps/nested/demo.mp4")
    const runtime = createRuntime({ transferFile })

    // 空串是从**绑定层**那条门进来的（清单的 `trim` 把"没给"折成 ""），所以这里也按那扇门喂：
    // 不写 `as never` 骗过类型系统，而是让值走一次 JSON，类型面就是内核声明的那份。
    const hostile = JSON.parse(JSON.stringify({
      action: "classify",
      paths: ["D:/videos"],
      targetPath: "D:/sorted",
      transferMode: "",
      dryRun: false,
    })) as BitvInput

    await runBitv(hostile, runtime)

    // `input.transferMode ?? BITV_DEFAULTS.transferMode`（core.ts:317）：`""` 不是 nullish，
    // 于是 `mode === "copy"` 判假 ⇒ 走的是 **move** 那条 link+unlink。内核没错，错的是喂它的人。
    expect(transferFile.mock.calls[0]?.[2]).toBe("")
    expect(BITV_DEFAULTS.transferMode).toBe("copy")
  })

  it('档位表用 formatThreshold：整数不带小数点，非整数最多三位', () => {
    expect(createBitrateLevels(5, 1)[0]?.label).toBe("5Mbps")
    expect(createBitrateLevels(0.1, 1)[0]?.label).toBe("0.1Mbps")
    expect(createBitrateLevels(1 / 3, 1)[0]?.label).toBe("0.333Mbps")
  })

  it('`.ts` / `.mts` / `.m2ts` 算视频，`.txt` 不算；扩展名比的是最后一个点之后', () => {
    expect(isBitvVideoPath("D:/v/movie.ts")).toBe(true)
    expect(isBitvVideoPath("D:/v/movie.MTS")).toBe(true)
    expect(isBitvVideoPath("D:/v/movie.m2ts")).toBe(true)
    expect(isBitvVideoPath("D:/v/notes.txt")).toBe(false)
    // 阳性对照：没有点的文件名不许被 `lastIndexOf(".")` 的 -1 骗过去。
    expect(isBitvVideoPath("D:/v/mkv")).toBe(false)
  })

  it('parseBitvPaths 按换行切、剥首尾引号、去重且保序', () => {
    expect(parseBitvPaths(["D:/a\r\n'D:/b'", "D:/a", ' "D:/c" '])).toEqual(["D:/a", "D:/b", "D:/c"])
    expect(parseBitvPaths(undefined)).toEqual([])
  })

  it('旧报告里 bitrateBps 为 0 时保留原标签（与"重算档位"不是同一条分支）', async () => {
    const legacy = { videos: [{ path: "D:/v/zero.mp4", bitrate: 0, duration: 10, size: 100, bitrate_level: "legacy-label" }] }
    const normalized = normalizeBitvReport(legacy)
    expect(normalized.videos[0]?.bitrateBps).toBe(0)
    expect(normalized.videos[0]?.bitrateLevel).toBe("legacy-label")

    const runtime = createRuntime({ readJson: async () => legacy })
    const result = await runBitv({ action: "report", reportPath: "D:/r.json", targetPath: "D:/sorted" }, runtime)
    expect(result.data?.videos[0]?.bitrateLevel).toBe("legacy-label")
    expect(result.data?.operations[0]?.targetPath).toBe("D:/sorted/legacy-label/zero.mp4")
  })

  it('ffprobe 找到但一条视频都没有 ⇒ 报 "No supported video files were found."', async () => {
    const runtime = createRuntime({ discoverVideos: async () => ({ files: [], errors: [] }) })
    const result = await runBitv({ action: "analyze", paths: ["D:/videos"] }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe("No supported video files were found.")
    expect(result.data?.errors).toEqual(["No supported video files were found."])
  })

  it('码率设置非法时先拒再动手（步长为 0 与档位数 1001）', async () => {
    const runtime = createRuntime()
    const step = await runBitv({ action: "analyze", paths: ["D:/videos"], bitrateStepMbps: 0 }, runtime)
    expect(step.success).toBe(false)
    expect(step.message).toBe("Bitrate step must be greater than zero.")

    const levels = await runBitv({ action: "analyze", paths: ["D:/videos"], maxLevels: 1001 }, runtime)
    expect(levels.message).toBe("Bitrate levels must be an integer between 1 and 1000.")
    // 阳性对照：内核连扫描都没开始（`core.ts:240-244` 在 `discoverVideos` 之前）。
    expect(runtime.discoverVideos).not.toHaveBeenCalled()
  })
})

/** 基线 `core.test.ts:144-173` 那份夹具，逐字搬（默认值一改就要全部重对）。 */
function createRuntime(overrides: Partial<BitvRuntime> = {}): BitvRuntime {
  return {
    findFfprobe: vi.fn(async () => "C:/ffmpeg/bin/ffprobe.exe"),
    discoverVideos: vi.fn(async () => ({
      files: [{
        path: "D:/videos/nested/demo.mp4",
        basePath: "D:/videos",
        relativePath: "nested/demo.mp4",
      }],
      errors: [],
    })),
    statFile: vi.fn(async () => ({ sizeBytes: 12_500_000 })),
    runFfprobeJson: vi.fn(async () => ({
      format: { duration: "100" },
      streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1" }],
    })),
    readJson: vi.fn(async () => ({})),
    writeJson: vi.fn(async (path) => path),
    resolveAvailablePath: vi.fn(async (path) => path),
    transferFile: vi.fn(async (_source, path) => path),
    now: () => new Date("2026-07-11T00:00:00.000Z"),
    dirname: (path) => path.replace(/[\\/][^\\/]+$/, ""),
    ...overrides,
  } as BitvRuntime
}
