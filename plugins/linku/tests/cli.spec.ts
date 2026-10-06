/**
 * linku 终端面的验收：断的是**上游那份 CLI 的形状**（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/linku/src/cli.ts` 的 `createProgram` / `runAction` / `writeLinkuSummary`
 * + 上游 `core.test.ts` 的常量）。
 *
 * 期望值全部手抄，不来自被测函数：`Path is required.`、`Path info loaded.`、
 * `Symlink created: <link> -> <source>`、`Moved and linked: …`、`Found N link record(s).`、
 * `Imported N link record(s) from <path>; skipped M invalid record(s).`、
 * `Recovery completed: 1 recovered, 0 failed.`、`Restored <target> to <link> and removed its link record.`
 * 以及非 JSON 那批中文标签（路径 / 类型 / 软链接 / 目录 / 文件 / 缺失）。
 *
 * 阳性对照：
 * 1. `create` 带 `--configPath` 与不带成对：不带时在碰文件之前就被 `RECORDS_PATH_GAP` 拒
 *    （"没配就不许动手"这条必须是红的可验的，而不是注释）。
 * 2. `import` 默认只导活记录，加 `--includeInvalid` 才两条都进（上游 `core.ts` 那条判据）。
 * 3. 未接腿那条：既是拒绝形状的正控，也是 sleept 刚修过的 bug 的尺
 *    （未接的动作不许先报 `Missing required argument`）。
 * 4. 还原那一条钉的是"link 位置上真的是目录本体而不是软链"，
 *    只断 message 会放过"文件其实没搬回来"。
 *
 * @module xaihi-linku/tests/cli
 */

import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliHost } from '../src/cli-support.ts'
import { program, runProgram, UNWIRED_INTERACTIVE_LEGS } from '../src/cli.ts'
import type { LinkuResult } from '../src/core.ts'
import { dumpLinkRecords } from '../src/core.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('linku CLI', () => {
  it('非 TTY 且无参数时拒绝，并给出 xlinku ui 的提示', async () => {
    const host = createHost()

    await runProgram([], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('No interactive terminal detected')
    expect(host.stderrText()).toContain('xlinku ui')
  })

  it('--help 列出七个脚本化子命令与三条未接腿', async () => {
    const host = createHost()

    await runProgram(['--help'], host)

    expect(process.exitCode).toBe(0)
    const help = host.stdoutText()
    expect(help).toContain('Usage xlinku')
    for (const verb of ['info', 'create', 'move', 'list', 'import', 'restore', 'recover', 'ui', 'gd', 'guided']) {
      expect(help).toContain(verb)
    }
    expect(help).toContain('未接')
  })

  it('info --json 给出内核的 pathInfo（真目录：kind dir + fileCount）', async () => {
    const fixture = await createSource('info-json')
    const host = createHost()

    await runProgram(['info', '--path', fixture.source, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as LinkuResult
    expect(result.message).toBe('Path info loaded.')
    expect(result.data?.pathInfo?.path).toBe(fixture.source)
    expect(result.data?.pathInfo?.kind).toBe('dir')
    expect(result.data?.pathInfo?.isSymlink).toBe(false)
    expect(result.data?.pathInfo?.fileCount).toBe(1)
  })

  it('非 JSON 时打上游那批中文标签', async () => {
    const fixture = await createSource('info-plain')
    const host = createHost()

    await runProgram(['info', '--path', fixture.source], host)

    const out = host.stdoutText()
    expect(out).toContain(`路径: ${fixture.source}`)
    expect(out).toContain('存在: 是')
    expect(out).toContain('类型: 目录')
    expect(out).toContain('软链接: 否')
    expect(out).toContain('文件数: 1')
  })

  it('info 没给路径时由内核说话（退出码 1），不是参数校验抢先（阳性对照）', async () => {
    const host = createHost()

    await runProgram(['info', '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stdoutText()).toContain('Path is required.')
    expect(host.stderrText()).not.toContain('Missing required argument')
  })

  it('create 带 --configPath 才真建链；记录落在文件里', async () => {
    const fixture = await createSource('create')
    const host = createHost()

    await runProgram(['create', '--path', fixture.source, '--target', fixture.link, '--configPath', fixture.records, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as LinkuResult
    expect(result.message).toBe(`Symlink created: ${fixture.link} -> ${fixture.source}`)
    expect(result.data?.created).toBe(true)
    expect((await lstat(fixture.link)).isSymbolicLink()).toBe(true)
    expect(await readFile(fixture.records, 'utf8')).toContain(`target = "${fixture.source}"`)

    // 阳性对照：源目录本体一个字节都没动（create 不搬东西，那是 move 的活）。
    expect(existsSync(join(fixture.source, 'a.txt'))).toBe(true)
  })

  it('create 不带 --configPath 且宿主没配记录文件 ⇒ 碰文件之前就拒（RECORDS_PATH_GAP 的可见退化）', async () => {
    const fixture = await createSource('create-unconfigured')
    const host = createHost()

    await runProgram(['create', '--path', fixture.source, '--target', fixture.link, '--json'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(1)
    expect(host.stderrText()).toContain('Config.recordsPath')
    // 阳性对照：拒绝发生在动手之前——软链没被建出来。
    expect(existsSync(fixture.link)).toBe(false)
  })

  it('move 是 move_link 那条动作：源被搬走，原位置换成软链', async () => {
    const fixture = await createSource('move')
    const moved = join(fixture.root, 'archive', 'source')
    const host = createHost()

    await runProgram(['move', '--path', fixture.source, '--target', moved, '--configPath', fixture.records, '--json'], host)

    expect(process.exitCode).toBe(0)
    const result = JSON.parse(host.stdoutText()) as LinkuResult
    expect(result.message).toBe(`Moved and linked: ${fixture.source} -> ${moved}`)
    expect(existsSync(join(moved, 'a.txt'))).toBe(true)
    expect((await lstat(fixture.source)).isSymbolicLink()).toBe(true)
  })

  it('move 的两次进度在非 JSON 那一边读得回来（内核吐 40 / 75 两条句子）', async () => {
    const fixture = await createSource('move-progress')
    const moved = join(fixture.root, 'archive', 'source')
    const host = createHost()

    await runProgram(['move', '--path', fixture.source, '--target', moved, '--configPath', fixture.records], host)

    expect(process.exitCode).toBe(0)
    expect(host.stdoutText()).toContain(`Moving ${fixture.source}`)
    expect(host.stdoutText()).toContain('Creating symlink')
    expect(host.stdoutText()).toContain(`Moved and linked: ${fixture.source} -> ${moved}`)
  })

  it('list → import（默认只导活的）→ 加 --includeInvalid 才两条都进 → recover → restore', async () => {
    const root = await tempRoot('records')
    const records = join(root, 'linku.toml')
    const liveTarget = join(root, 'live-target')
    const liveLink = join(root, 'live-link')
    await mkdir(liveTarget)
    await writeFile(join(liveTarget, 'a.txt'), 'ab', 'utf8')
    await symlink(liveTarget, liveLink, 'dir')

    const legacy = join(root, 'legacy.toml')
    await writeFile(legacy, dumpLinkRecords([
      { link: liveLink, target: liveTarget, type: 'directory', createdAt: '1' },
      { link: join(root, 'gone-link'), target: join(root, 'gone-target'), type: 'directory', createdAt: '2' },
    ]), 'utf8')

    const importHost = createHost()
    await runProgram(['import', '--path', legacy, '--configPath', records, '--json'], importHost)
    const imported = JSON.parse(importHost.stdoutText()) as LinkuResult
    expect(imported.message).toBe(`Imported 1 link record(s) from ${legacy}; skipped 1 invalid record(s).`)
    expect(imported.data?.importedCount).toBe(1)
    expect(imported.data?.skippedCount).toBe(1)

    const listHost = createHost()
    await runProgram(['list', '--configPath', records, '--json'], listHost)
    expect((JSON.parse(listHost.stdoutText()) as LinkuResult).message).toBe('Found 1 link record(s).')

    // 阳性对照：显式要保留失效记录时两条都进。
    const allRoot = await tempRoot('records-all')
    const allRecords = join(allRoot, 'linku.toml')
    const allHost = createHost()
    await runProgram(['import', '--path', legacy, '--configPath', allRecords, '--includeInvalid', '--json'], allHost)
    const all = JSON.parse(allHost.stdoutText()) as LinkuResult
    expect(all.data?.importedCount).toBe(2)
    expect(all.data?.skippedCount).toBe(0)

    // 把活链删掉 ⇒ recover 该把它建回来。
    await rm(liveLink)
    const recoverHost = createHost()
    await runProgram(['recover', '--configPath', records, '--json'], recoverHost)
    const recovered = JSON.parse(recoverHost.stdoutText()) as LinkuResult
    expect(recovered.message).toBe('Recovery completed: 1 recovered, 0 failed.')
    expect((await lstat(liveLink)).isSymbolicLink()).toBe(true)

    const restoreHost = createHost()
    await runProgram(['restore', '--path', liveLink, '--configPath', records, '--json'], restoreHost)
    const restored = JSON.parse(restoreHost.stdoutText()) as LinkuResult
    expect(restored.message).toBe(`Restored ${liveTarget} to ${liveLink} and removed its link record.`)
    expect(restored.data?.restoredCount).toBe(1)
    // 阳性对照：还原后 liveLink 位置上是目录本体，liveTarget 路径已空。
    expect((await lstat(liveLink)).isSymbolicLink()).toBe(false)
    expect(existsSync(join(liveLink, 'a.txt'))).toBe(true)
    expect(existsSync(liveTarget)).toBe(false)
  })

  it('未知 flag 判为用法错（退出码 2）', async () => {
    const host = createHost()

    await runProgram(['info', '--nope', 'x'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('Unknown option: --nope')
  })

  it('未接的三条腿响亮拒绝并点名缺的东西，且不许先做参数校验（sleept 那个 bug 的尺）', async () => {
    const host = createHost({ tty: true })

    await runProgram(['guided'], host)

    const exitCode = process.exitCode
    process.exitCode = 0
    expect(exitCode).toBe(2)
    expect(host.stderrText()).toContain('未接')
    expect(host.stderrText()).toContain('@clack')
    expect(host.stderrText()).toContain('OpenTUI')
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

/** 一个源目录（里面一个文件）+ 两个约定路径名，够 create / move 两条腿用。 */
async function createSource (label: string): Promise<{ root: string; source: string; link: string; records: string }> {
  const root = await tempRoot(label)
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'a.txt'), 'ab', 'utf8')
  return { root, source, link: join(root, 'link'), records: join(root, 'linku.toml') }
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-linku-cli-${label}-`))
  tempRoots.push(root)
  return root
}

function createHost (options: { tty?: boolean } = {}): CliHost & { stdoutText: () => string; stderrText: () => string } {
  let stdout = ''
  let stderr = ''
  return {
    cwd: process.cwd(),
    env: { ...process.env, XAIHI_CLI_COLUMNS: '120', NO_COLOR: '1' },
    stdin: { isTTY: options.tty === true } as CliHost['stdin'],
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
