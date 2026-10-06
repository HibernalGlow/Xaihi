/**
 * 外壳的来源判据。
 *
 * 规则的边界（2026-10-07 使用者拍板，见 docs/stages/step-4.md §27）：
 * "不搬 Xiranite 的 store 与主题引擎"这条**只约束 DSH↔Xaihi 那一刀**，
 * 不是整仓禁令。ADR-0009 之后工作台本体跑在 Xaihi 自己的文档里，那一面按现状
 * 会起搬运来的 `WorkspaceProvider`（`src/App.tsx:55`）——那是另一笔账，
 * 由本文件末尾的"文档侧台账"钉住，不许被这条禁词判据假装看不见。
 *
 * 所以这里量两半：类名/组件是不是搬来的（外观出处），以及 **DSH 那一面**有没有
 * 偷偷起第二套栈（红线）。
 *
 * 阳性对照：把 `@/store/workspaceStore` 或 `presetThemeRootClass` 写回 DSH 那一面，
 * 禁词判据必须变红；把外壳的类名换成手写 CSS 类，第一条必须变红；
 * 文档侧哪天不再起 provider，最后那条台账必须变红。
 *
 * @module xaihi-ui/tests/workspace-shell
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 不用 new URL(import.meta.url)：这条 vitest 通道里那个 URL 不是 file: scheme，
// 会在收集阶段就抛 "The URL must be of scheme file"（实测）。pnpm --filter 保证 cwd 是本包根。
/** 剥掉注释再扫：尺要量的是代码，不是"注释里提没提到"（同 `check-brand` 的口径）。 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SHELL = stripComments(readFileSync(join(process.cwd(), 'src', 'client', 'workspace.tsx'), 'utf8'))
const read = (...parts: string[]): string =>
  stripComments(readFileSync(join(process.cwd(), ...parts), 'utf8'))

describe('工作台外壳的来源', () => {
  it('用的是搬运来的组件，不是自己写一遍同形控件', () => {
    // 组件级复用比 class 字符串强：`bg-secondary` 这类值现在住在搬运来的
    // `button-variants.ts` 里，外壳只负责挑 variant/size。
    for (const token of ['<Button', '<Separator', 'NodeChromeActionButton']) {
      expect(SHELL, `外壳该用搬运组件 ${token}`).toContain(token)
    }
  })

  it('用的是搬运来的类名词汇（不是另起一套手写样式表）', () => {
    for (const token of ['bg-background', 'text-foreground', 'text-muted-foreground', 'border-border', 'tracking-widest', 'font-mono']) {
      expect(SHELL, `外壳里找不到搬运来的 utility class ${token}`).toContain(token)
    }
    // 节点标题条的结构是从 NodeSurfaceChrome 的折叠态搬来的。
    expect(SHELL).toContain('xaihi-node-chrome-bar')
    expect(SHELL).toContain('xaihi-node-chrome-dot')
  })

  it('不起 Xiranite 的状态机，也不挂第二套主题引擎', () => {
    for (const banned of ['@/store', 'useWorkspaceShallowSelector', 'presetThemeRootClass', 'workspaceContext', 'WorkspaceProvider']) {
      expect(SHELL, `外壳不该出现 ${banned}：数据源与主题都只归 DSH 那一侧`).not.toContain(banned)
    }
  })

  it('颜色只经别名层拿，不在外壳里写死色值', () => {
    // 允许 `--ws-accent-glow` 这类**引用**，不允许十六进制/oklch 常量。
    expect(SHELL).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(SHELL).not.toContain('oklch(')
  })

  it('装载状态读得回来，失败时给重新加载的出口', () => {
    expect(SHELL).toContain('stateLabel')
    expect(SHELL).toContain('panel.reload')
    expect(SHELL).toContain('NodeChromeActionButton')
  })
})

/**
 * 文档侧的现状台账（ADR-0009）。
 *
 * 上面那条禁词判据量的是 **DSH 面板里的那一面**：那里确实不许起 Xiranite 的 store 与主题引擎。
 * 但 ADR-0009 把工作台本体挪进了 Xaihi 自己的文档，而那一面渲染的是搬运来的 `App`，
 * `App.tsx:55` 就是会起 `WorkspaceProvider`。所以"整仓没有 provider"这句话现在是假的，
 * 尺不能假装它成立 —— 这里把实况钉成台账：
 * 哪天文档侧不再起 provider（换成我们自己的数据源），这条会红，
 * 那时才把上面那条禁词判据扩到覆盖 `src/document/**`。
 */
describe('文档侧（ADR-0009）的现状台账', () => {
  const MAIN = read('src', 'document', 'main.tsx')
  const APP = read('src', 'App.tsx')

  it('文档入口渲染的是搬运来的 App 根', () => {
    expect(MAIN).toContain('App')
    expect(APP).toContain('<WorkspaceProvider>')
  })

  it('DSH 面板那一面仍然没有把 provider 带进来', () => {
    for (const banned of ['WorkspaceProvider', 'presetThemeRootClass', 'useWorkspaceShallowSelector']) {
      expect(MAIN, `文档侧台账之外，DSH 那一面（workspace.tsx）不该出现 ${banned}`).not.toContain(banned)
      expect(SHELL, `DSH 那一面不该出现 ${banned}`).not.toContain(banned)
    }
  })
})
