/**
 * realm 管道验证用的入口：起 realm + 挂一块**明写自己不是界面**的板，并在握手之后
 * 把九组 `host` 面真的跑一次往返（`host-probe.ts`）。
 *
 * 为什么要有它：整棵搬运树还建不出来（现读 `rspack build -c rspack.document.mjs` rc=1、
 * 4 条 Module not found 在搬运那刀的文件上），而「这份文档里装的是哪一份 React、
 * 桥能不能跨文档往返、`host` 面问到的是不是对面的东西」不该等树搬完才第一次被验证。
 * 这块板不是工作台，页面上也这么写。
 *
 * 板上的 host 往返不是装饰：它是路线 (A) 目前**唯一会被真装进产物**的消费点——
 * 生产入口 `main.tsx` 被搬运那刀重写成只挂 `<App />`，不再启动桥（撞车与后果记在
 * `docs/adr/0011-*.md` 的路线 (A) 那一行）。那条 lane 落定之后，同一个 `runHostRoundTrip`
 * 的调用点应当挪到工作台装载 `host` 的地方，这块板继续只证管道。
 *
 * @module xaihi-ui/document/realm-entry
 */

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { startRealm } from './realm.ts'
import { describeHostSurface } from './boot-notice.ts'
import { runHostRoundTrip, type HostRoundTrip } from './host-probe.ts'
import { createDocumentHost, createPersistedState } from '../client/document-host.ts'

const realm = startRealm()

if (realm === null) {
  document.getElementById('xaihi-ui-root')?.replaceChildren(
    Object.assign(document.createElement('pre'), {
      textContent: 'Xaihi 文档缺少启动信息（window.__XAIHI_UI__ 未定义）——这份 main.js 应由 /xaihi/ui/<rev>/index.html 装载。',
    }),
  )
  document.title = 'Xaihi — 装载失败'
} else {
  const container = document.getElementById('xaihi-ui-root')
  if (container === null) {
    document.title = 'Xaihi — 装载失败'
  } else {
    const isTopLevel = window.parent === window
    const notice = describeHostSurface({ isTopLevel, scope: globalThis, node: realm.boot.node ?? '' })
    /**
     * 往返那一次写用**这块板自己的键**，不用 URL 上那个节点键。
     * 理由是一条实机读数：`realm.ts` 在握手之后自己会跑一次 state 持久探测，写的就是同一个
     * `nodeState[节点键]` 格；两处一起写时后写的那一发撞上乐观并发围栏，板上落成
     * `写侧=threw · settings namespace "xaihi-core" changed since it was read (expected revision 0, now 1)`
     * 而 `读侧=ok` ⇒ `crossed=false`。那是围栏在正常工作，但把它当"路线不通"报出来就是判据自己的假红，
     * 所以这一格改成各写各的键（动词、命名空间、落点都与之前同一个，只是不再抢同一格）。
     */
    const roundTripNode = 'xaihi-roundtrip'
    /**
     * 这块板自己的组件清单：板上一个组件都没挂，所以空数组是**真话**，
     * 不是工作台那份 store 的替身（真那份住在 `store/`，由装载 `host` 的那一层给）。
     */
    const probeWorkspace = {
      listComponents: () => [],
      updateComponent: () => {},
    }

    /** 握手一落地就跑一次往返；等不到握手就一直停在 `pending`，那是可见状态而不是空白。 */
    function useHostRoundTrip (): HostRoundTrip | null {
      const [readout, setReadout] = useState<HostRoundTrip | null>(null)
      useEffect(() => {
        let cancelled = false
        const timer = setInterval(() => {
          if (realm === null || realm.bridge.ready() === null) return
          clearInterval(timer)
          const state = createPersistedState({ bridge: realm.bridge, node: roundTripNode })
          void state.hydrate()
            .then(() => runHostRoundTrip({
              host: createDocumentHost({ bridge: realm.bridge, state, workspace: probeWorkspace }),
              bridge: realm.bridge,
              state,
              node: roundTripNode,
              marker: `probe-${String(Date.now())}`,
            }))
            .then((value) => { if (!cancelled) setReadout(value) })
            .catch(() => { /* 往返自己已经把失败折进读数；走到 catch 说明是桥外面炸了，留在控制台 */ })
        }, 150)
        return () => { cancelled = true; clearInterval(timer) }
      }, [])
      return readout
    }

    function ProbeBoard (): React.JSX.Element {
      const readout = useHostRoundTrip()
      const uiText = readout === null
        ? '还没跑'
        : 'error' in readout.ui
          ? `拒：${readout.ui.error}${readout.ui.detail === '' ? '' : ` · ${readout.ui.detail}`}`
          : `对面那格 ns=${readout.ui.ns} revision=${String(readout.ui.revision)}`
      const stateText = readout === null
        ? '还没跑'
        : `crossed=${String(readout.state.crossed)} 写侧=${readout.state.syncError ?? 'ok'} 读侧=${readout.state.readError ?? 'ok'}`
      return (
        <div data-xaihi-realm-probe="true" style={{ padding: 16, font: '13px/1.6 ui-monospace,monospace' }}>
          <strong>Xaihi 文档 realm 探针（不是工作台）</strong>
          <br />
          {`rev=${realm.boot.rev} · node=${realm.boot.node ?? ''}`}
          <br />
          界面内容等搬运树建出来之后由装载 `host` 的那一层挂载；这块板只证管道。
          {/* 决定 4：退化要读得回来。这块板本来就明写自己不是界面，但它落在哪个宿主里、
              有没有独立窗动词、host 面问得到什么，使用者不该开控制台才能知道。 */}
          <div data-xaihi-window-capability={notice.windowStatus}>
            {notice.lines.join(' ')}
          </div>
          <div
            data-xaihi-host-roundtrip={readout === null ? 'pending' : readout.state.crossed ? 'crossed' : 'not-crossed'}
            data-xaihi-host-capabilities={readout === null ? '' : readout.capabilities.join(',')}
            style={{ marginTop: 8 }}
          >
            <strong>host 面（{readout === null ? '等握手' : `合同 ${readout.version ?? '未知'}`}）</strong>
            <br />
            {`能力：${readout === null ? '—' : readout.capabilities.join(', ') || '（无）'}`}
            <br />
            {`config.getUi → ${uiText}`}
            <br />
            {`state 往返 → ${stateText}`}
            <br />
            {`没给：${readout === null ? '—' : readout.refused.filter((row) => !readout.documentFulfilled.includes(row.capability)).map((row) => `${row.capability}=${row.reason}`).join(' ｜ ') || '（都给了）'}`}
            <br />
            {/* 这几组协商里不给，但动作在文档自己这一侧就成立——分开念，免得一条红被读成缺勤。 */}
            {`文档自己兑现（不过桥）：${readout === null || readout.documentFulfilled.length === 0 ? '—' : readout.documentFulfilled.join(', ')}`}
          </div>
        </div>
      )
    }

    // 必须真走 createRoot：这条探针要证的是"React 19 能在我们自己的文档里挂载"，
    // 用 appendChild 拼 DOM 正好把要证的东西绕过去（第一版就是这样，产物里没有 react-dom）。
    createRoot(container).render(<ProbeBoard />)
  }
}
