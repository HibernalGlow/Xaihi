/**
 * 清单契约的证伪测试：每一条都必须在防御被去掉时变红。
 * @module xaihi-sdk/tests/manifest
 */

import { describe, expect, it } from 'vitest'
import { MANIFEST_SCHEMA, validateManifest } from '../src/manifest.ts'

const panel = {
  id: 'xaihi.workspace.hello',
  title: { zh: '示例', en: 'Example' },
  area: 'workspace',
  remote: 'hello',
  export: 'Panel',
}

const ui = { remote: 'hello', entry: './dist/remoteEntry.js' }

describe('validateManifest', () => {
  it('接受一份最小可用清单', () => {
    const result = validateManifest({ schema: MANIFEST_SCHEMA, id: 'xaihi-hello', ui, panels: [panel] })
    expect(result.ok).toBe(true)
  })

  it('拒绝不认识的 schema 版本而不是降级继续', () => {
    const result = validateManifest({ schema: 'xaihi.manifest/2', id: 'x', ui, panels: [panel] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('unsupported manifest schema')
  })

  it('拒绝引用未声明 remote 的贡献点', () => {
    const result = validateManifest({
      schema: MANIFEST_SCHEMA,
      id: 'x',
      ui,
      panels: [{ ...panel, remote: 'typo-remote' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('undeclared remote "typo-remote"')
  })

  it('拒绝带 UI 贡献却没有 ui 声明的清单', () => {
    const result = validateManifest({ schema: MANIFEST_SCHEMA, id: 'x', panels: [panel] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('no ui bundle')
  })

  it('拒绝绝对路径或含 .. 的 ui.entry（宿主据此开文件路由）', () => {
    for (const entry of ['/etc/passwd', '../../escape/remoteEntry.js']) {
      const result = validateManifest({ schema: MANIFEST_SCHEMA, id: 'x', ui: { remote: 'hello', entry }, panels: [panel] })
      expect(result.ok, entry).toBe(false)
      if (!result.ok) expect(result.errors.join(' ')).toContain('package-relative')
    }
  })

  it('要求双语标题，缺一门语言就是清单错误', () => {
    const result = validateManifest({
      schema: MANIFEST_SCHEMA,
      id: 'x',
      ui,
      panels: [{ ...panel, title: { zh: '只有中文' } }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('both zh and en')
  })
})
