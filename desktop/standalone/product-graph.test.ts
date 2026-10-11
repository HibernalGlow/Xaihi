import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { assertKisakiGraph } from './product-graph.mjs'
const graph = JSON.parse(readFileSync(new URL('../.products/kisaki/ui/kisaki/module-graph.json', import.meta.url), 'utf8')) as string[]
it('实编译产物只带 Kisaki 和共享组件，不带工作台 chrome', () => {
  expect(() => assertKisakiGraph(graph)).not.toThrow()
})
it('图检查能抓住混入的其他节点和上下栏（阳性对照）', () => {
  for (const path of ['packages/ui-host/src/nodes/findz/Component.tsx', 'packages/ui-host/src/components/workspace/TopBar.tsx', 'packages/ui-host/src/components/workspace/BottomBar.tsx', 'packages/ui-host/src/components/workspace/AlphabetNodeRail.tsx']) expect(() => assertKisakiGraph([...graph, path])).toThrow('混入')
  expect(() => assertKisakiGraph([])).toThrow('缺少')
})
