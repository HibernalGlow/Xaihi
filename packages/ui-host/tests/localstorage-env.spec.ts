/**
 * localStorage 这一层到底在谁手里——这条决定节点测试里那 180 条 `setItem` 失败的归因。
 *
 * 症状：搬来的节点测试里 zustand 的 persist 中间件（`@material` 那族也一样）在
 * `window.localStorage.setItem(...)` 上抛，而我们的 `vitest.config.ts` 写的就是
 * `environment: 'happy-dom'`（上游 `vite.config.ts:355` 逐字同一档）。
 * happy-dom 是带 Storage 的，所以真正的原因不在环境选择上，而在**这机器上的 Node**：
 * Node 自己提供了一个实验性的 `localStorage` 全局，没给 `--localstorage-file` 时
 * 它只是一个会告警的 undefined 访问器（实测 `node -e "typeof globalThis.localStorage"`
 * 在 v26.10.0 上打 `undefined` 并附一条 ExperimentalWarning）。
 * 全局位上先有了这个洞，happy-dom 那份就没机会盖上去。
 *
 * 为什么这条测试值得钉住而不是"跑的时候加个 flag 就完了"：加不加
 * `--no-experimental-webstorage` 决定 180 条断言能不能跑，而它是**运行时形状**，
 * 不是某个测试文件的毛病。把它写成断言，下次谁换 Node、换环境、或把 setupFiles 拆掉，
 * 这条会直接红，而不是让下游 180 条以"文案对不上"的形态再长出来。
 */
import { describe, expect, test } from 'vitest'

describe('测试宿主的 localStorage', () => {
  test('happy-dom 的 window.localStorage 真的可写', () => {
    expect(typeof window).toBe('object')
    expect(window.localStorage).toBeDefined()
    window.localStorage.setItem('xaihi_probe', '7f3a')
    expect(window.localStorage.getItem('xaihi_probe')).toBe('7f3a')
    window.localStorage.removeItem('xaihi_probe')
    expect(window.localStorage.getItem('xaihi_probe')).toBeNull()
  })

  test('全局位上的 localStorage 与 window 那份是同一个，不是 Node 那个实验性的洞', () => {
    // `globalThis` 在这里必须真的指到 happy-dom 的 window：
    // Node 的实验性 webstorage 会在同一位置上留一个"读就告警、值永远是 undefined"的访问器。
    expect(globalThis.localStorage).toBeDefined()
    expect(globalThis.localStorage).toBe(window.localStorage)
    globalThis.localStorage.setItem('xaihi_probe_global', '9be1')
    expect(window.localStorage.getItem('xaihi_probe_global')).toBe('9be1')
    window.localStorage.removeItem('xaihi_probe_global')
  })

  test('zustand persist 走的那条路径拿得到 store（不是只会 setItem 抛）', () => {
    // 上游的节点 store 用 `createJSONStorage(() => localStorage)` 这个形状，
    // 所以判据不是"localStorage 存在"，而是"把它当工厂返回值用一次不抛"。
    const storage: globalThis.Storage = localStorage
    expect(() => storage.setItem('xaihi_probe_store', '1')).not.toThrow()
    expect(storage.getItem('xaihi_probe_store')).toBe('1')
    storage.clear()
    expect(storage.length).toBe(0)
  })
})
