/**
 * 外壳的来源判据。
 *
 * 这一刀的要求是"用搬运来的 DOM 与类名，但数据源是我们自己的"。两半都要有尺：
 * 类名用没用到（外观是不是搬来的）、以及**有没有偷偷把 Xiranite 的状态机或第二套
 * 主题引擎起起来**（那是这条改动的红线）。
 *
 * 阳性对照：把 `@/store/workspaceStore` 或 `presetThemeRootClass` 写回外壳，第二条判据
 * 必须变红；把外壳的类名换成手写 CSS 类，第一条必须变红。
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

describe('工作台外壳的来源', () => {
  it('用的是搬运来的类名词汇（不是另起一套手写样式表）', () => {
    for (const token of ['bg-background', 'text-foreground', 'text-muted-foreground', 'bg-secondary', 'border-border', 'tracking-widest']) {
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
