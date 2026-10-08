/**
 * 实机：真 7-Zip 走本节点自己的那条路（`core.ts` → `src/exec.ts` 的缝 → `src/platform.ts` 的字节层）。
 *
 * 这是 `tests/core.spec.ts` 与 `tests/definition.spec.ts` 都量不到的那一段：前者喂的是假
 * runtime（`stubRuntime`），后者的 `fakeSubprocess` 永远以 `exitCode` 收口，于是 `find7z` 的
 * `which` 一定查不到东西。那两份钉的是**分类与接线**，这里钉的是**真解压**——
 * 嵌套层、分卷首卷、密码失败那三条只有对着真 7z 才分得清 `t` 与 `x` 的先后、`-v` 的续卷筛除、
 * `-mhe=on` 的清单读法。
 *
 * 期望值**逐条手抄**自基线 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/smartzip/src/platform.integration.test.ts`（夹具：三层加密嵌套 +
 * 220 000 字节随机分卷 + 错密码），不由被测函数现算。入参那三串 `iniText`、断言的正则
 * （`/could not be unlocked.*1 configured password/i`、`/sample\.7z\.001$/`）、
 * 密码不许出现在序列化结果里那两条，都是照那份文件抄的。
 *
 * **唯一一处与基线的判据不同**（第 1 条）：基线期望嵌套解完之后整次 `success: true`，
 * 因为上游那一步会调 `recyclePath()` 把中间层交给 `@xiranite/file-operations` 的 trash 提供方；
 * 本仓没有那条缝（`src/platform.ts` 文件头的缺口 **G-no-os-trash**，偏离点 3），它**抛**
 * `NO_TRASH_MESSAGE`。所以这里钉的是那条**已写明的退化**：文件确实解出来了（基线那两条内容断言
 * 原样留着）、密码照旧脱敏（基线那条也留着）、运行账里是那句拒绝，而且**源包一个都没被永久删掉**。
 * 这不是把断言放宽——是把"提供方缺席"这件事写成读得回来的判据（AGENTS.md「降级铁律」：
 * 可以退化，不许静默）。基线那 3 条里能搬的 2 条（分卷、错密码）一条没改。
 *
 * 没有 7-Zip 的机器上这一档**响亮地跳过**（下面那行 `console.warn`），判据与
 * `plugins/findz/tests/kernel.integration.spec.ts` 同一格：静默永不跑的尺比没有尺更坏。
 *
 * @module xaihi-smartzip/tests/platform.integration
 */

import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runSmartZip } from '../src/core.ts'
import { createSmartZipRunCommand } from '../src/exec.ts'
import { NO_TRASH_MESSAGE, createNodeSmartZipRuntime } from '../src/platform.ts'
import { localSubprocess } from './fixtures/local-subprocess.ts'

/** 生产半边是 `ctx.subprocess`；这里是测试半边的对应物（形状见 `src/exec.ts:49`）。 */
const runCommand = createSmartZipRunCommand(localSubprocess(), { cwd: process.cwd() })
const runtime = createNodeSmartZipRuntime({ runCommand })

/** 基线 `platform.integration.test.ts:21` 那句 `runtime.find7z()`，本仓多个 context 参数。 */
const tools = await runtime.find7z()

if (tools === null) {
  console.warn(
    'smartzip platform integration SKIPPED: no 7-Zip found on PATH (looked up as 7z / 7za / 7zz via `which`).\n'
    + 'Install it (brew install sevenzip) to run this leg; the other three specs do not need it.',
  )
}

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })))
})

describe.skipIf(tools === null)('smartzip 实机：真 7-Zip 走本节点的 exec + platform 那条路', () => {
  // 基线 `:19-58`「extracts encrypted archives nested behind extensionless binary names」。
  it('三层加密嵌套（中间层改名成没有扩展名的 .bin）真的被解出来，密码不落进结果', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-nested-'))
    cleanupPaths.push(root)
    const payload = join(root, '深层_日本語.txt')
    const innerZip = join(root, 'inner.zip')
    const strangeData = join(root, 'not-an-archive.data')
    const middleZip = join(root, 'middle.zip')
    const middleBinary = join(root, 'opaque-layer.bin')
    const wrapper = join(root, 'ordinary-folder')
    const outerZip = join(root, 'outer.zip')

    await writeFile(payload, '中文 / 日本語 / English', 'utf8')
    await run7z(['a', innerZip, payload, '-pnest-pass', '-mem=AES256', '-y', '-sccUTF-8'])
    await rename(innerZip, strangeData)
    await run7z(['a', middleZip, strangeData, '-pnest-pass', '-mem=AES256', '-y', '-sccUTF-8'])
    await rm(strangeData)
    await rename(middleZip, middleBinary)
    await mkdir(wrapper)
    await rename(middleBinary, join(wrapper, basename(middleBinary)))
    await run7z(['a', outerZip, wrapper, '-y', '-sccUTF-8'])
    await rm(wrapper, { recursive: true })
    await rm(payload)

    const result = await runSmartZip({
      action: 'extract',
      path: outerZip,
      iniText: '[set]\nnesting=1\nnestingMuilt=1\npartSkip=1\n[password]\n1=nest-pass',
      dryRun: false,
    }, runtime)

    // 基线 `:54`：脱敏那条原样留着。
    expect(JSON.stringify(result)).not.toContain('nest-pass')
    // 缺口 G-no-os-trash：清理那一步读得回来，而且**不咽成成功**。
    expect(result.success).toBe(false)
    expect(result.message).toContain(NO_TRASH_MESSAGE)
    expect(result.data?.errors?.[0]).toContain(NO_TRASH_MESSAGE)
    // 基线 `:55-57`：最深处那条载荷确实被解出来了，内容一字不差。
    const extracted = await findFile(root, '深层_日本語.txt')
    expect(extracted).toBeTruthy()
    expect(await readFile(extracted!, 'utf8')).toBe('中文 / 日本語 / English')
    // 阳性对照（这一条钉的是"抛过之后不许变成 rm"）：三层源包一个都没被永久删掉。
    // 把 recyclePath 的拒绝换成 `rm` 的话，下面三条会一起红。
    expect(await pathExists(root, 'outer.zip')).toBe(true)
    expect(await findFile(root, 'opaque-layer.bin')).toBeTruthy()
    expect(await findFile(root, 'not-an-archive.data')).toBeTruthy()
  }, 30_000)

  // 基线 `:60-91`「scans a directory and extracts only the first encrypted 7z volume」。
  it('扫目录时只取加密 7z 的**首卷**，续卷与 .par2 都不碰', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-volumes-'))
    cleanupPaths.push(root)
    const payload = join(root, '分卷_日本語.bin')
    const archive = join(root, 'sample.7z')
    const expected = randomBytes(220_000)
    await writeFile(payload, expected)
    await run7z(['a', archive, payload, '-v64k', '-pvolume-pass', '-mhe=on', '-y', '-sccUTF-8'])
    await rm(payload)
    await writeFile(`${archive}.001.par2`, 'PAR2 fixture must be ignored', 'utf8')

    const volumes = (await readdir(root)).filter((name) => /^sample\.7z\.\d+$/.test(name))
    expect(volumes.length).toBeGreaterThan(1)
    const result = await runSmartZip({
      action: 'extract',
      path: root,
      iniText: '[set]\npartSkip=1\n[password]\n1=volume-pass',
      dryRun: false,
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.operations).toHaveLength(1)
    expect(result.data?.operations?.[0]?.sourcePath).toMatch(/sample\.7z\.001$/)
    expect(JSON.stringify(result)).not.toContain('volume-pass')
    const extracted = await findFile(root, '分卷_日本語.bin')
    expect(extracted).toBeTruthy()
    expect(await readFile(extracted!)).toEqual(expected)
  }, 30_000)

  // 基线 `:93-110`「reports a configured-password failure without exposing the password」。
  it('密码不对时那句要报"试了几个"，而且两个密码都不许读回来', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xaihi-smartzip-password-error-'))
    cleanupPaths.push(root)
    const payload = join(root, 'payload.txt')
    const archive = join(root, 'locked.7z')
    await writeFile(payload, 'locked', 'utf8')
    await run7z(['a', archive, payload, '-pcorrect-secret', '-mhe=on', '-y', '-sccUTF-8'])

    const result = await runSmartZip({ action: 'extract', path: archive, passwords: ['wrong-secret'], dryRun: false }, runtime)

    expect(result.success).toBe(false)
    expect(result.data?.errors?.[0]).toMatch(/could not be unlocked.*1 configured password/i)
    expect(JSON.stringify(result)).not.toMatch(/correct-secret|wrong-secret/)
  }, 30_000)
})

/**
 * 夹具的建包步骤走**同一条缝**（`ctx.subprocess` 的测试对应物），不再引第二套起进程的写法，
 * 所以这一段顺带把 `src/exec.ts` 的退出码映射也验了一遍：任何一步非 0 就抛，夹具不会带着
 * 半个包往下跑。
 * @param args - 7z 的参数（不含程序名）。
 */
async function run7z (args: string[]): Promise<void> {
  const result = await runCommand((tools?.cli ?? '7z'), args)
  if (result.code !== 0) throw new Error(`fixture 7z ${args.join(' ')} exited ${String(result.code)}: ${result.stderr}`)
}

/** 基线 `:117-127` 那份递归找文件，逐行照抄（`path` 用 posix 分隔符拼，测试两侧都是绝对路径）。 */
async function findFile (root: string, name: string): Promise<string | undefined> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory()) {
      const nested = await findFile(path, name)
      if (nested) return nested
    }
  }
  return undefined
}

async function pathExists (dir: string, name: string): Promise<boolean> {
  return (await readdir(dir)).includes(name)
}
