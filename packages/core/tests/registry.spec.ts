/**
 * 登记表的证伪测试。
 * @module xaihi-core/tests/registry
 */

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MANIFEST_SCHEMA, type XaihiManifest } from '@hibernalglow/xaihi-sdk'
import { buildRegistrations, buildWorkspaceDocument, computeRev, slugOf, type LocatedPackage } from '../src/registry.ts'

const fixtureRoot = fileURLToPath(new URL('./fixtures/remote-tree/', import.meta.url))
const fixturePkgPath = `${fixtureRoot}package.json`

const manifest: XaihiManifest = {
  schema: MANIFEST_SCHEMA,
  id: 'xaihi-fixture',
  ui: { remote: 'fixture', entry: './remoteEntry.js' },
  panels: [{
    id: 'xaihi.workspace.fixture',
    title: { zh: '夹具', en: 'Fixture' },
    area: 'workspace',
    remote: 'fixture',
    export: 'Panel',
  }],
}

const locateFor = (pkg: Record<string, unknown> | undefined) => (specifier: string): LocatedPackage | undefined =>
  specifier === '@fixture/xaihi-thing' && pkg !== undefined
    ? { pkgPath: fixturePkgPath, pkg }
    : undefined

describe('buildRegistrations', () => {
  it('为声明了 xaihi 的包登记产物目录与 rev', () => {
    const registrations = buildRegistrations(['@fixture/xaihi-thing'], locateFor({ xaihi: manifest }))
    expect(registrations).toHaveLength(1)
    const [registration] = registrations
    expect(registration?.entryFile).toBe('remoteEntry.js')
    expect(registration?.rev).toMatch(/^[0-9a-f]{12}$/)
    expect(registration?.problems).toBeUndefined()
  })

  it('清单坏了记为 problems，不抛错也不装作没有装', () => {
    const registrations = buildRegistrations(['@fixture/xaihi-thing'], locateFor({ xaihi: { schema: 'nope' } }))
    const [registration] = registrations
    expect(registration?.problems?.[0]).toContain('unsupported manifest schema')
  })

  it('产物缺失时 problems 说清要先构建', () => {
    const registrations = buildRegistrations(['@fixture/xaihi-thing'], locateFor({
      xaihi: { ...manifest, ui: { remote: 'fixture', entry: './dist/missing.js' } },
    }))
    expect(registrations[0]?.problems?.join(' ')).toContain('build the package before installing it')
  })

  it('聚合文档给出 remote → 带 rev 的 URL，装载器据此注册', () => {
    const registrations = buildRegistrations(['@fixture/xaihi-thing'], locateFor({ xaihi: manifest }))
    const document = buildWorkspaceDocument(registrations, { documentUrl: '', rev: 'missing' })
    expect(document.schema).toBe('xaihi.workspace/1')
    expect(document.plugins[0]?.remotes.fixture).toBe(`/xaihi/remotes/${slugOf('@fixture/xaihi-thing')}/${registrations[0]?.rev}/remoteEntry.js`)
  })

  it('UI 文档那一侧的信息原样进文档（面板靠它决定 iframe 的 src，缺了要看得见）', () => {
    const face = { documentUrl: '', rev: 'missing', problems: ['xaihi ui bundle is not configured (config core.uiBundleDir is empty)'] }
    const document = buildWorkspaceDocument([], face)
    expect(document.ui).toEqual(face)
  })
})

describe('computeRev', () => {
  it('产物目录里的文件尺寸变化会改变 rev（否则陈旧产物会被 immutable 缓存钉死）', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(`${tmpdir()}/xaihi-rev-`)
    try {
      const target = `${dir}/remoteEntry.js`
      await writeFile(target, 'a')
      const before = computeRev(dir)
      await writeFile(target, 'bbbb')
      const after = computeRev(dir)
      expect(after).not.toBe(before)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
