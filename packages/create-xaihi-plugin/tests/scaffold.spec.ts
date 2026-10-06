/**
 * 脚手架产物的自洽性测试：模板里的三处 id 必须互相咬合，否则症状会是"装了但面板/工具都不出现"。
 * @module create-xaihi-plugin/tests/scaffold
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { assertName, filesOf, parseArgs, scaffold } from '../src/index.ts'

const input = { name: 'demo-node', nodeId: 'demonode', titleZh: '演示', titleEn: 'Demo', sdkVersion: 'workspace:*' }

describe('scaffold', () => {
  it('拒绝非 kebab-case 名字', () => {
    expect(() => assertName('Demo_Node')).toThrow('kebab-case')
    expect(() => assertName('demo-node')).not.toThrow()
  })

  it('manifest id、patch 行 id、工具前缀三处互相咬合', () => {
    const files = filesOf(input)
    const pkg = JSON.parse(files['package.json'] as string) as {
      name: string
      xaihi: { id: string; ui: { remote: string }; panels: Array<{ remote: string; export: string }> }
      dsh: { bundle: { patch: string } }
    }
    const patch = files['cordis.patch.yml'] as string
    expect(pkg.name).toBe('@hibernalglow/xaihi-demo-node')
    expect(patch).toContain(`id: ${pkg.xaihi.id}`)
    expect(patch).toContain(`name: '${pkg.name}'`)
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.xaihi.panels[0]?.remote).toBe(pkg.xaihi.ui.remote)
    expect(pkg.xaihi.panels[0]?.export).toBe('Panel')
    expect(files['frontend/Panel.tsx']).toContain('export const Probe')
    // remote 名要与 rspack 的容器名一致，否则清单里的 remote 解析不到容器。
    expect(files['rspack.config.mjs']).toContain(`name: '${pkg.xaihi.ui.remote}'`)
  })

  it('落到目录里就是可读的一包，且拒绝覆盖已有包', async () => {
    const dir = await mkdtemp(`${tmpdir()}/xaihi-scaffold-`)
    try {
      const written = scaffold(input, dir)
      expect(written).toContain('src/index.ts')
      // 接线件必须齐全：缺任何一个，症状都是"装了但要么没工具要么没面板"
      for (const required of ['package.json', 'cordis.patch.yml', 'tsdown.config.ts', 'rspack.config.mjs', 'frontend/Panel.tsx', 'frontend/container-entry.ts', 'tests/core.spec.ts']) {
        expect(written).toContain(required)
      }
      const entry = await readFile(`${dir}/src/index.ts`, 'utf8')
      expect(entry).toContain("export const name = '@hibernalglow/xaihi-demo-node'")
      // 定义只有一份真源：生成的代码从自己的 package.json 读，不再复制一份常量
      expect(entry).toContain('pkg.xaihi?.node')
      expect(entry).not.toContain('const DEFINITION')
      // 生成的节点必须自带账本接法：写成注册时读一次会让"core 后激活"的会话永久没有运行记录。
      expect(entry).toContain('journal: () => ctx.get(OPERATIONS_SERVICE)')
      expect(() => scaffold(input, dir)).toThrow('already has a package.json')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('每个生成物都是能解析的 TS/TSX（语法级门禁）', async () => {
    const ts = await import('typescript')
    const files = filesOf(input)
    const sources = Object.entries(files).filter(([path]) => /\.tsx?$/.test(path))
    expect(sources.length).toBeGreaterThan(4)
    for (const [path, content] of sources) {
      const emitted = ts.transpileModule(content, {
        reportDiagnostics: true,
        fileName: path,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      })
      const messages = (emitted.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
      expect(messages, `${path}: ${messages.join(' | ')}`).toEqual([])
    }
    // 阳性对照：同一条尺必须看得见坏语法，否则上面那段是空断言。
    const broken = ts.transpileModule('export const Panel = () => <div>{<', {
      reportDiagnostics: true,
      fileName: 'broken.tsx',
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    })
    expect((broken.diagnostics ?? []).length).toBeGreaterThan(0)
  })

  it('CLI 参数：--sdk-version 换成发布期版本', () => {
    const parsed = parseArgs(['demo-node', '--node-id', 'demonode', '--sdk-version', '0.1.0-alpha.1', '--dir', '/tmp/x'])
    expect(parsed.sdkVersion).toBe('0.1.0-alpha.1')
    expect(parsed.targetDir).toBe('/tmp/x')
    expect(parsed.nodeId).toBe('demonode')
  })

})
