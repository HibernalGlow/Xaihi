import { afterAll, describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNodeKisakiRuntime } from '../src/platform.js'
import { createLocalSubprocessRuntime } from '../src/local-subprocess.js'
import { resolveEngineHostEntry, startKisakiEngineHost, type KisakiEngineClient } from '../src/engine-gateway.js'

/*
 * 这一份是**真往返**判据：引擎跑在子进程里，测的是帧协议 + 真 `.node` + 真 Rust 内核。
 *
 * 入口取装机形态那份 `lib/engine-host.js`（不拿 `src/*.ts` 起子进程：Node 的类型剥离
 * 解不了 `./native/index.js` 那类"给打包器看的"说明符，症状是子进程一进门就报模块找不到，
 * 而那份红会被念成"引擎坏了"）。`lib/` 是产物目录，没建过就**跳过并打印原因**——
 * 与 `tests/kernel.integration.spec.ts` 对 findz 可执行文件的处理同一条纪律。
 */
const hostEntry = resolveEngineHostEntry(new URL('../lib/index.js', import.meta.url).href)
const gate = hostEntry === null ? describe.skip : describe
if (hostEntry === null) {
  process.stderr.write('kisaki engine e2e: 跳过——没有 lib/engine-host.js，先跑 pnpm --filter @hibernalglow/xaihi-kisaki build\n')
}

let engineHost: KisakiEngineClient | undefined
const engineProvider = async (): Promise<KisakiEngineClient> => {
  if (engineHost === undefined) {
    engineHost = await startKisakiEngineHost(createLocalSubprocessRuntime(), { entryPath: hostEntry as string, cwd: process.cwd() })
  }
  return engineHost
}
afterAll(() => { engineHost?.dispose(); engineHost = undefined })
import { runKisaki } from '../src/core.js'
import { runProgram } from '../src/cli.js'
import type { CliHost } from '../src/cli-support.js'

gate('Kisaki Rust Core (Node-API) End-to-End Test（引擎在子进程里）', () => {
  it('1. loads native binding and reports Czkawka 12.0.0 info', async () => {
    const host = await engineProvider()
    const info = host.greeting.info
    expect(host.greeting.binding).toContain('.node')
    expect(info.apiVersion).toBe(5)
    expect(info.sourceVersion).toBe('12.0.0')
    expect(info.capabilities).toContain('scan.duplicate')
    expect(info.capabilities).toContain('scan.basic')
    expect(info.capabilities).toContain('scan.media')
  })

  it('2. scans duplicate files with real Rust engine', async () => {
    const rawRoot = await mkdtemp(join(tmpdir(), 'kisaki-test-dedup-'))
    const root = realpathSync(rawRoot)
    try {
      const fileA = join(root, 'fileA.txt')
      const fileB = join(root, 'fileB.txt')
      const fileC = join(root, 'fileC.txt')

      // A 和 B 内容相同且大于最小哈希大小
      const duplicateContent = 'duplicate-file-content-payload-'.repeat(50)
      await writeFile(fileA, duplicateContent, 'utf8')
      await writeFile(fileB, duplicateContent, 'utf8')
      await writeFile(fileC, 'unique-file-content-different-payload', 'utf8')

      const runtime = await createNodeKisakiRuntime({ engine: engineProvider })
      const result = await runKisaki(
        {
          action: 'scan',
          tool: 'duplicate-files',
          includedDirectories: [root],
          recursive: true,
          useCache: false,
        },
        runtime,
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.tool).toBe('duplicate-files')
      expect(result.data?.groupCount).toBe(1)
      expect(result.data?.fileCount).toBe(2)

      const group = result.data?.groups[0]
      expect(group).toBeDefined()
      expect(group?.entries.length).toBe(2)
      const paths = group?.entries.map((e) => e.path).sort()
      expect(paths).toEqual([fileA, fileB].sort())
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('3. scans empty files with real Rust engine', async () => {
    const rawRoot = await mkdtemp(join(tmpdir(), 'kisaki-test-empty-'))
    const root = realpathSync(rawRoot)
    try {
      const emptyFile = join(root, 'empty.txt')
      const nonEmptyFile = join(root, 'not-empty.txt')

      await writeFile(emptyFile, '', 'utf8')
      await writeFile(nonEmptyFile, 'content', 'utf8')

      const runtime = await createNodeKisakiRuntime({ engine: engineProvider })
      const result = await runKisaki(
        {
          action: 'scan',
          tool: 'empty-files',
          includedDirectories: [root],
          recursive: true,
          useCache: false,
        },
        runtime,
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.tool).toBe('empty-files')
      expect(result.data?.fileCount).toBe(1)
      expect(result.data?.entries[0]?.path).toBe(emptyFile)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('4. executes CLI duplicate scan with --json output', async () => {
    const rawRoot = await mkdtemp(join(tmpdir(), 'kisaki-cli-test-'))
    const root = realpathSync(rawRoot)
    try {
      const file1 = join(root, '1.txt')
      const file2 = join(root, '2.txt')
      const payload = 'cli-duplicate-payload-string-'.repeat(20)
      await writeFile(file1, payload, 'utf8')
      await writeFile(file2, payload, 'utf8')

      const outChunks: string[] = []
      const errChunks: string[] = []
      const host: CliHost = {
        cwd: process.cwd(),
        env: process.env,
        stdin: process.stdin,
        stdout: {
          write: (chunk: string) => {
            outChunks.push(chunk)
            return true
          },
        },
        stderr: {
          write: (chunk: string) => {
            errChunks.push(chunk)
            return true
          },
        },
      }

      await runProgram(['scan', 'duplicate-files', root, '--no-cache', '--json'], host)

      expect(process.exitCode ?? 0).toBe(0)
      const output = outChunks.join('')
      const json = JSON.parse(output)
      expect(json.success).toBe(true)
      expect(json.data.groupCount).toBe(1)
      expect(json.data.fileCount).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
