/**
 * 示例节点的自洽性测试：清单、容器名、工具名与文案必须互相咬合。
 *
 * 存在的理由：这个包是"节点长什么样"的参照物之一，专门证两件事——自带的一行能被 loader
 * 装载、工具名稳定。它**故意不是** SDK 形状（`xaihi.node/v1` + `defineNode`）：那份由
 * `plugins/linedup` 与脚手架生成物承担，这样"最裸的 cordis 插件"与"按契约写的节点"两种
 * 形状各有一个活的样本。它缺 `locale/zh.json` 的症状是中文界面里这条元信息整段是英文
 * （已经补上，并被下面的用例钉住）。
 * @module hello/tests/manifest
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface XaihiBlock {
  schema: string
  id: string
  ui: { remote: string; entry: string }
  panels: Array<{ id: string; remote: string; export: string }>
}

const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/** `package.json#xaihi` **就是**清单本体（不是套一层的 `manifest` 键）。 */
function xaihiBlock (): XaihiBlock {
  const pkg = JSON.parse(read('../package.json')) as { xaihi?: XaihiBlock }
  if (pkg.xaihi === undefined) throw new Error('package.json#xaihi is missing')
  return pkg.xaihi
}

describe('hello manifest', () => {
  it('清单 schema、面板的 remote 与 ui.remote 三者一致', () => {
    const block = xaihiBlock()
    expect(block.schema).toBe('xaihi.manifest/1')
    expect(block.id).toBe('xaihi-hello')
    expect(block.panels).toHaveLength(1)
    expect(block.panels[0]?.remote).toBe(block.ui.remote)
    expect(block.panels[0]?.export).toBe('Panel')
  })

  it('rspack 容器名等于清单里的 remote 名，并把 ./Panel 指到真文件', () => {
    const config = read('../rspack.config.mjs')
    // 断言按片段而非整行：exposes 在这个文件里是多行写的。
    expect(config).toContain(`name: '${xaihiBlock().ui.remote}'`)
    expect(config).toContain("'./Panel'")
    expect(config).toContain('./frontend/Panel.tsx')
  })

  it('工具名稳定（Gate 2.4 的证据指的就是这个名字）', () => {
    expect(read('../src/index.ts')).toContain("name: 'xaihi_hello_ping'")
  })

  it('两份语言的 meta 文案都存在', () => {
    for (const locale of ['zh', 'en']) {
      const doc = JSON.parse(read(`../locale/${locale}.json`)) as { meta?: { title?: string; description?: string } }
      expect(doc.meta?.title, locale).toBeTruthy()
      expect(doc.meta?.description, locale).toBeTruthy()
    }
  })
})
