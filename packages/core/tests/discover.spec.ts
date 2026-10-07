/**
 * 发现流程的集成测试：走真的 createRequire + 真的 node_modules 布局。
 *
 * 存在的理由是一条真踩过的坑：把 `require()` 当 `require.resolve()` 用时，注入假
 * locator 的单测察觉不到，症状却是"工作台显示没有节点"这种假信号。
 *
 * 夹具在临时目录里现造，不提交进仓：`node_modules/` 被 .gitignore 排除，任何提交进来
 * 的 node_modules 布局都会在干净检出里凭空消失（这条测试就死过一次）。
 *
 * @module xaihi-core/tests/discover
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collect, discover, isSubpathSpecifier, type DiscoverContext } from '../src/index.ts'

interface EntryLike { options: { id: string; name: string; disabled?: boolean } }

let profileRoot = ''
let tempDir = ''

const demoManifest = {
  schema: 'xaihi.manifest/1',
  id: 'xaihi-demo',
  title: { zh: '夹具节点', en: 'Fixture node' },
  ui: { remote: 'demo', entry: './remoteEntry.js' },
  panels: [{
    id: 'xaihi.workspace.demo',
    title: { zh: '夹具面板', en: 'Demo panel' },
    area: 'workspace',
    remote: 'demo',
    export: 'Panel',
  }],
}

beforeAll(async () => {
  const created = await mkdtemp(`${tmpdir()}/xaihi-profile-`)
  // macOS 的 tmpdir 是符号链接路径，不先 realpath 断言路径比较会在 /private/var 上失配。
  tempDir = await realpath(created)
  profileRoot = `${tempDir}/`
  const demo = `${tempDir}/node_modules/@fixture/xaihi-demo`
  await mkdir(demo, { recursive: true })
  await mkdir(`${tempDir}/node_modules/@fixture/plain-dep`, { recursive: true })
  await writeFile(`${demo}/remoteEntry.js`, 'export const container = 1\n')
  await writeFile(`${demo}/package.json`, JSON.stringify({
    name: '@fixture/xaihi-demo',
    version: '0.0.0',
    type: 'module',
    main: 'remoteEntry.js',
    xaihi: demoManifest,
  }, null, 2))
  await writeFile(`${tempDir}/node_modules/@fixture/plain-dep/package.json`, '{"name":"@fixture/plain-dep","version":"0.0.0"}\n')
})

afterAll(async () => {
  if (tempDir !== '') await rm(tempDir, { recursive: true, force: true })
})

/** 构造只带 loader、baseUrl 与 `get` 的最小宿主上下文。 */
function fakeContext(rows: EntryLike[], provided: Record<string, unknown> = {}): DiscoverContext {
  return {
    baseUrl: profileRoot,
    loader: {
      entries: () => rows[Symbol.iterator](),
    },
    get: (name: string) => provided[name],
  } as unknown as DiscoverContext
}

const row = (name: string, disabled = false): EntryLike => ({ options: { id: name.split('/').pop() ?? name, name, disabled } })

describe('discover', () => {
  it('从 profile 的 node_modules 定位到 xaihi 包并给出产物目录与 rev', () => {
    const result = discover(fakeContext([row('@fixture/xaihi-demo'), row('@fixture/plain-dep')]))
    const demo = result.located.find((entry) => entry.specifier === '@fixture/xaihi-demo')
    expect(demo?.hasXaihi).toBe(true)
    expect(demo?.pkgPath).toBe(`${profileRoot}node_modules/@fixture/xaihi-demo/package.json`)
    expect(result.registrations).toHaveLength(1)
    const [registration] = result.registrations
    expect(registration?.entryFile).toBe('remoteEntry.js')
    expect(registration?.rev).toMatch(/^[0-9a-f]{12}$/)
  })

  it('定位不到的候选带着原因出现，不静默消失', () => {
    const result = discover(fakeContext([row('@fixture/does-not-exist')]))
    const missing = result.located[0]
    expect(missing?.hasXaihi).toBe(false)
    expect(missing?.error).toContain('Cannot find module')
  })

  it('disabled 行不参与扫描，但仍原样报出', () => {
    const result = discover(fakeContext([row('@fixture/xaihi-demo', true)]))
    expect(result.candidates).toEqual([])
    expect(result.rows.map((entry) => entry.name)).toContain('@fixture/xaihi-demo')
  })

  it('子路径行单独归类，不当成"定位失败"报病', () => {
    const result = discover(fakeContext([row('@deepseek-ai/dsh-web-app/startup'), row('@fixture/xaihi-demo')]))
    expect(result.subpaths).toEqual(['@deepseek-ai/dsh-web-app/startup'])
    expect(result.candidates).toEqual(['@fixture/xaihi-demo'])
    expect(result.located.filter((entry) => entry.error !== undefined)).toEqual([])
  })

  it('isSubpathSpecifier 只把真正的子路径算作子路径', () => {
    expect(isSubpathSpecifier('@fixture/xaihi-demo')).toBe(false)
    expect(isSubpathSpecifier('@fixture/xaihi-demo/sub')).toBe(true)
    expect(isSubpathSpecifier('plain-package')).toBe(false)
    expect(isSubpathSpecifier('plain-package/sub')).toBe(true)
  })

  it('可选服务的可用性被读出来，缺席不伪装成可用', () => {
    const rows = [row('@fixture/xaihi-demo')]
    expect(discover(fakeContext(rows)).services).toEqual({
      storageDomain: false,
      approval: false,
      commands: false,
      // `/xaihi/host` 要用它答 config/state；没挂载时必须被读成 false 而不是"能用"。
      settings: false,
      xaihiOperations: false,
    })
    const withStorage = discover(fakeContext(rows, { storageDomain: { open: () => {} } }))
    expect(withStorage.services.storageDomain).toBe(true)
    expect(withStorage.services.approval).toBe(false)
    const withSettings = discover(fakeContext(rows, { settings: { describe: () => [] } }))
    expect(withSettings.services.settings).toBe(true)
    expect(withSettings.services.storageDomain).toBe(false)
  })

  it('collect 是 discover 的登记表投影', () => {
    expect(collect(fakeContext([row('@fixture/xaihi-demo')]))).toHaveLength(1)
  })
})
