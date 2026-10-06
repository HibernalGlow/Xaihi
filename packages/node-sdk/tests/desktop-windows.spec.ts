import { describe, expect, it } from 'vitest'
import { openNodeWindow, readXaihiWindowCapability, type XaihiWindowOpenOptions } from '../src/desktop-windows.ts'

/** 只有自家壳才有的动词；官方桌面端与 dsh web 各有一种"没有它"的样子，必须分得开。 */
function scopeWith (shape: unknown): unknown {
  return shape
}

describe('Xaihi 桌面壳开窗能力的探测', () => {
  it('自家壳给出可用的 opener，并把 node 原样递过去', async () => {
    const seen: string[] = []
    const scope = scopeWith({
      dshDesktop: {
        xaihiWindow: {
          open: async (node: string) => {
            seen.push(node)
            return { windowId: 7, alreadyOpen: false }
          },
        },
      },
    })
    const capability = readXaihiWindowCapability(scope)
    expect(capability.supported).toBe(true)
    if (capability.supported) expect(await capability.opener('xaihi-linedup')).toEqual({ windowId: 7, alreadyOpen: false })
    expect(seen).toEqual(['xaihi-linedup'])
  })

  it('有壳但没有那条动词 ⇒ stock-shell，不与"根本没注入"混成一个词', () => {
    // 阳性对照：把两格判成同一个原因，这条就会红。
    const stock = readXaihiWindowCapability(scopeWith({ dshDesktop: { protocolVersion: 1 } }))
    const none = readXaihiWindowCapability(scopeWith({}))
    expect(stock.supported).toBe(false)
    expect(none.supported).toBe(false)
    if (!stock.supported && !none.supported) {
      expect(stock.reason).toBe('stock-shell')
      expect(none.reason).toBe('no-shell-surface')
      expect(stock.reason).not.toBe(none.reason)
    }
  })

  it('形状对但动词不是函数 ⇒ not-a-function（半接的壳不能算接上）', () => {
    const capability = readXaihiWindowCapability(scopeWith({ dshDesktop: { xaihiWindow: { open: 'nope' } } }))
    expect(capability).toEqual({ supported: false, reason: 'not-a-function' })
  })

  it('作用域不是对象也不抛，只报不支持', () => {
    for (const value of [undefined, null, 'string', 42]) {
      expect(readXaihiWindowCapability(value)).toEqual({ supported: false, reason: 'no-shell-surface' })
    }
  })
})

describe('openNodeWindow 的本地闸门与透传', () => {
  it('非法 node 一律不碰 IPC（不许把脏值送到壳那边去报错）', async () => {
    let calls = 0
    const scope = scopeWith({
      dshDesktop: { xaihiWindow: { open: async () => { calls += 1; return { windowId: 1, alreadyOpen: false } } } },
    })
    for (const bad of ['', 'find z', 'Xaihi', '-lead', 'a'.repeat(65), 'a/../b', '节点']) {
      expect(await openNodeWindow(scope, bad)).toEqual({ ok: false, reason: 'invalid-node-id' })
    }
    expect(calls).toBe(0)
  })

  it('alreadyOpen 原样上报：聚焦既有窗不能被说成"新开了一个"', async () => {
    const scope = scopeWith({
      dshDesktop: { xaihiWindow: { open: async () => ({ windowId: 9, alreadyOpen: true }) } },
    })
    expect(await openNodeWindow(scope, 'xaihi-sleept')).toEqual({ ok: true, opening: { windowId: 9, alreadyOpen: true } })
  })

  it('IPC 抛回来的原文透传，不改写成"未知错误"', async () => {
    const scope = scopeWith({
      dshDesktop: {
        xaihiWindow: {
          open: async () => { throw new Error('only the Xaihi UI document may open a window') },
        },
      },
    })
    const result = await openNodeWindow(scope, 'xaihi-hello')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ipc-failed: only the Xaihi UI document may open a window')
    }
  })

  it('不支持的壳上根本不会调用到 IPC', async () => {
    const scope = scopeWith({ dshDesktop: { protocolVersion: 1 } })
    expect(await openNodeWindow(scope, 'xaihi-hello')).toEqual({ ok: false, reason: 'stock-shell' })
  })

  // 0007 的转达分支 + 0009 的 input 形状：路径与尺寸都由调用方给，本地先按形状收住。
  it('input 逐字透传给壳，缺省时第二个参数是 undefined', async () => {
    const seen: Array<[string, unknown]> = []
    const scope = scopeWith({
      dshDesktop: {
        xaihiWindow: {
          open: async (node: string, options?: unknown) => {
            seen.push([node, options])
            return { windowId: 4, alreadyOpen: false }
          },
        },
      },
    })
    const path = '/xaihi/ui/0123456789ab/index.html'
    expect(await openNodeWindow(scope, 'xaihi-sleept', { documentPath: path, width: 900, height: 700 }))
      .toEqual({ ok: true, opening: { windowId: 4, alreadyOpen: false } })
    await openNodeWindow(scope, 'xaihi-linedup')
    // 逐字：三个键一个都不能在包装层被丢掉（丢参数那次是自家测试抓到的）
    expect(seen).toEqual([['xaihi-sleept', { documentPath: path, width: 900, height: 700 }], ['xaihi-linedup', undefined]])
  })

  it('坏路径在本地就拒，不喂给 IPC', async () => {
    let calls = 0
    const scope = scopeWith({
      dshDesktop: { xaihiWindow: { open: async () => { calls += 1; return { windowId: 1, alreadyOpen: false } } } },
    })
    for (const bad of ['', '/xaihi/ui/../index.html', '/xaihi/ui/ZZZZ/index.html', 'https://example.com/x',
      '/xaihi/ui/0123456789ab/index.html?node=x', '/xaihi/ui/0123456789a/index.html', '/other/index.html']) {
      expect(await openNodeWindow(scope, 'xaihi-hello', { documentPath: bad })).toEqual({ ok: false, reason: 'invalid-document-path' })
    }
    expect(calls).toBe(0)
  })

  // 尺寸的**数值范围**留给壳判（那台机器的最小/最大窗尺寸只有壳知道），这里只收形状：
  // 必须是成对的整数 —— 半套尺寸最容易被写成"另一个用壳的缺省值"，那是静默的错。
  it('尺寸形状不合在本地就拒，成对整数才透传', async () => {
    const seen: unknown[] = []
    const scope = scopeWith({
      dshDesktop: { xaihiWindow: { open: async (_node: string, options?: unknown) => { seen.push(options); return { windowId: 2, alreadyOpen: false } } } },
    })
    // 这一格**故意**喂运行时可能出现的坏形状（半套、字符串、NaN），所以类型上先按 unknown 收；
    // 用类型系统"证明"它们不存在就等于不测。
    const badSizes: unknown[] = [{ width: 900 }, { height: 700 }, { width: 900.5, height: 700 },
      { width: '900', height: 700 }, { width: 900, height: Number.NaN }]
    for (const bad of badSizes) {
      expect(await openNodeWindow(scope, 'xaihi-hello', bad as XaihiWindowOpenOptions))
        .toEqual({ ok: false, reason: 'invalid-window-size' })
    }
    expect(seen.length).toBe(0)
    await openNodeWindow(scope, 'xaihi-hello', { width: 900, height: 700 })
    expect(seen).toEqual([{ width: 900, height: 700 }])
  })
})
