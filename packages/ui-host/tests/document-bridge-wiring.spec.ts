/**
 * 生产装配点的**来源判据**：这一份工作台文档与宿主之间只走桥。
 *
 * 为什么这一条不能只靠行为判据：漏接线与"接上了但对面答不了"在界面上长得一样
 * （都是一条读得回的 `reason`），而前者会在将来某次改动里**静默**地把调用打回
 * Xiranite 的 `/api` —— 那份后端在本仓根本不存在，于是症状是"一屏空工作台"，
 * 离原因（某一行 import）很远。所以这里直接量源码里的几条边。
 *
 * 三条各自钉一件事：
 * 1. 入口起桥并把桥递进树里（`main.tsx`），且**不**再往 window 上塞 REST 兜底；
 * 2. 一份文档只起**一条**桥：设置面装配点收 realm，不再自己 `startRealm()`；
 * 3. 节点 host 面、工作区快照、**工作台自身的设置**三条通路不再 import REST 客户端。
 *
 * 阳性对照：把 `@/backend/configRpcClient` 写回 `hostApi.ts`（或把
 * `__XIRANITE_BACKEND__` 写回入口），对应的那条必须变红 —— 否则这是一把假尺。
 *
 * @module xaihi-ui/tests/document-bridge-wiring
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 剥掉注释再扫：尺要量的是代码，不是"注释里提没提到"（同 `check-brand` 的口径）。 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const read = (...parts: string[]): string =>
  stripComments(readFileSync(join(process.cwd(), ...parts), 'utf8'))

/** 找出源码里对这几个 REST 客户端的引用（值导入或类型导入都算接线）。 */
const REST_MODULES = [
  '@/backend/configRpcClient',
  '@/backend/nodeRpcClient',
  '@/backend/workspaceRpcClient',
  '@/backend/client',
]

function findRestModuleRefs (source: string): string[] {
  return REST_MODULES.filter((specifier) => source.includes(`"${specifier}"`) || source.includes(`'${specifier}'`))
}

describe('生产工作台文档：通信只走桥', () => {
  const MAIN = read('src', 'document', 'main.tsx')
  const SETTINGS_FACE = read('src', 'document', 'settings-face.ts')
  const HOST_API = read('src', 'components', 'modules', 'hostApi.ts')
  const WORKSPACE_CONTEXT = read('src', 'store', 'workspaceContext.tsx')

  it('入口起桥、把桥递给整棵树，并且不再设 REST 兜底', () => {
    expect(MAIN, '入口该起 realm（那一步按容器选 postMessage / host-http 两条载体）').toContain('startRealm(')
    expect(MAIN, '入口该把桥交给 Provider').toContain('<DocumentBridgeProvider')
    expect(MAIN, 'Provider 的 bridge 来自刚起的那条 realm').toContain('realm?.bridge ?? null')
    // 这一条是"不再使用 rest 架构通信"那句口径在源码里的落点。
    expect(MAIN, '入口不该再往 window 上塞 REST 后端地址').not.toContain('__XIRANITE_BACKEND__')
    expect(MAIN, '入口不该再写 /api 这个前缀').not.toContain("'/api'")
  })

  it('一份文档只起一条桥：设置面装配点收 realm，不再自己 startRealm()', () => {
    expect(SETTINGS_FACE, '设置面该从参数拿 realm').toContain('realm: Realm | null')
    expect(SETTINGS_FACE, '设置面不该自己起第二条桥（会多一次握手、多一格宿主会话）').not.toContain('startRealm(')
  })

  it('节点 host 面不再 import REST 客户端（config / runner / localFiles 的真源换成桥）', () => {
    expect(findRestModuleRefs(HOST_API)).toEqual([])
    expect(HOST_API, 'host 面该从桥的上下文取桥').toContain('useDocumentBridge')
    expect(HOST_API, '节点 host 面该由桥那份分组面折出来').toContain('toNodeHostApi')
  })

  it('工作区快照不再 import REST 客户端，改走桥的 state.*', () => {
    /*
     * 只钉 `workspaceRpcClient` 那一条边，不把 `@/backend/localBackendConfig` 一起算禁词：
     * 那个模块里还留着 `BackendConnectionBoundary` 要用的一次性键计算，而那个组件
     * 是别人的一条独立判据（`workspaceBackendLifecycle.test.tsx`），删它等于顺手删别人的账。
     * 这里要钉的是**快照的读写通路**有没有换掉 —— 那件事有下面两句正面的读数作证。
     */
    expect(WORKSPACE_CONTEXT).not.toContain('workspaceRpcClient')
    expect(WORKSPACE_CONTEXT, '快照该从桥读').toContain('state.getData')
    expect(WORKSPACE_CONTEXT, '快照该往桥写').toContain('state.patchData')
  })

  it('阳性对照：把 REST 客户端塞回源码必须被抓到', () => {
    const sample = "import { getNodeConfigFromBackend } from \"@/backend/configRpcClient\"\n"
    expect(findRestModuleRefs(sample)).toEqual(['@/backend/configRpcClient'])
  })

  it('工作台自身的设置（ui / themes / bgImage）不再 import REST 客户端，改走桥', () => {
    const appConfig = read('src', 'components', 'workspace', 'AppConfigSync.tsx')
    expect(findRestModuleRefs(appConfig)).toEqual([])
    expect(appConfig, '三段该由桥那一份载体读写').toContain('createBridgeAppConfigCarrier')
    // 门也要一起换：门留在 `useLocalBackendStatus()` 上的话，载体即使接好了也永远判不通过
    // （那份"本地后端"在本仓不存在），症状与改之前一模一样——设置改了刷新就没了。
    expect(appConfig, '门该是"桥接通了没有"').toContain('useBridgeReady')
    expect(appConfig, '门不该再看那份本仓不存在的本地后端').not.toContain('useLocalBackendStatus')
  })

  it('阳性对照：注释里提到 REST 客户端不算接线', () => {
    const sample = "/** 过去这里 import 的是 \"@/backend/nodeRpcClient\" */\nexport const a = 1\n"
    expect(findRestModuleRefs(stripComments(sample))).toEqual([])
  })

  it('工作台 chrome 的状态源与持久化不再 import REST（设置两段 / 仪表盘 / 监视器 / 窗口尺寸）', () => {
    // 状态源：这三块过去各挂一份 2s 轮询的 REST 健康检查（`useLocalBackendStatus`），
    // 连接状态的真源换成桥握手（`useHostConnection`，无轮询）。
    for (const name of ['components/views/settings/RuntimeSection.tsx', 'components/views/settings/DataSection.tsx', 'components/views/UsageDashboard.tsx'] as const) {
      const source = read('src', ...name.split('/'))
      expect(source, `${name} 不该再读 REST 健康检查`).not.toContain('useLocalBackendStatus')
      expect(source, `${name} 该读桥握手`).toContain('useHostConnection')
    }
    // 监视器：取消/暂停/继续是 runner 组的事，而 runner 没有提供者 —— 桩要如实拒绝，不是 REST。
    const monitor = read('src', 'components', 'views', 'NodeOperationMonitor.tsx')
    expect(monitor, '监视器的控制函数该来自本地桩').toContain('@/backend/nodeOperationControl')
    expect(findRestModuleRefs(monitor), '监视器不该再 import REST 客户端').toEqual([])
    // 窗口尺寸：这份文档自己的 UI 偏好，落 localStorage，不落（已作废的）REST。
    // 这里只钉 `workspaceRpcClient`（REST 那条）而不钉 `@/backend/client`：后者是桌面壳的
    // 原生窗口通道（Tauri invoke），浮窗本身仍由壳开，不属于"已作废的 REST 后端"。
    for (const name of ['components/workspace/WorkspaceWindowFrameSync.tsx', 'hooks/useWindowControls.ts'] as const) {
      const source = read('src', ...name.split('/'))
      expect(source, `${name} 不该再走 REST 的窗口尺寸读写`).not.toContain('@/backend/workspaceRpcClient')
      expect(source, `${name} 该走文档侧的尺寸仓`).toContain('componentWindowSizeStore')
    }
    // 运行时自述：`__XIRANITE_BACKEND__` 的字面串随 REST 一起裁掉（产物体积里能对上账）。
    const runtimeInfo = read('src', 'backend', 'runtimeConnectionInfo.ts')
    expect(runtimeInfo, '运行时自述不该再认那个已作废的注入全局').not.toContain('__XIRANITE_BACKEND__')
  })
})
