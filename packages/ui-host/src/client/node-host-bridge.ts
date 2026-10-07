/**
 * 把桥那半边的**分组面**折成节点组件真正读的那份**扁表面**（`@xiranite/contract` 的 `NodeHostApi`）。
 *
 * 为什么要有这一层：路线 (A) 的服务路由答的是九组能力面（`host.state` / `host.config` / …），
 * 而搬来的节点组件里到处是 `host.getData(compId)`、`host.patchData(compId, patch)`、
 * `host.config?.get?.()`、`host.downloadText?.(…)` 这些**带 compId 的扁名**——
 * 那是上游留给未迁移节点的兼容层（`packages/contract/src/index.ts:507-540`，每个都标了 `@deprecated`）。
 * `packages/ui-host/src/components/modules/hostApi.ts:320-345` 已经在做同样的折叠，
 * 但它折叠的是**本进程那套**（Xiranite 的 configRpcClient 与 store），也就是 ADR-0013 说不接的那条通路。
 * 这一层折叠的是桥，于是节点界面读同一份扁表面，而值落在 DSH 的设置面上——
 * 换的只是折叠的**来源**，搬来的组件一行不改（ADR-0006 的"动词是移植与接线"）。
 *
 * 三条写死的立场：
 * - **不新造能力**。桥没给的组（`env`、`localFiles`、`runner` 今天都在 refused 里）不编实现：
 *   它们仍按握手结果抛 `refused`，界面上读得回那句原因（ADR-0011 决定 4）。
 * - **`compId` 在这里是丢弃的**。桥那半边的状态按节点分格（`state.getData(node)`），
 *   上游那份扁名带的 `compId` 是"这一格卡"的身份，与节点不是同一层；
 *   照 `hostApi.ts:333-334` 同样的做法接掉，不在这里发明第二套键。
 * - **分组那九片按 getter 转，绝不展开**。`XaihiNodeHost.env` 是"没握手/没快照就抛 `refused`"的
 *   取值器（`document-host.ts:151-155`），`contract.version` 同样是取时才走 `requireReady`：
 *   一旦写成 `{ ...host }`，折叠这一步就会在**装配时**把退化引爆——症状是界面整块不出现，
 *   而不是某一句读不到（2026-10-07 在真浏览器里就是这么红的：协商板一切正常，`#xaihi-ui-root` 空的）。
 *
 * @module xaihi-ui/node-host-bridge
 */

import type { HostComponentRef, NodeHostApi } from '@xiranite/contract'
import type { XaihiNodeHost } from './document-host.ts'

/**
 * 折叠一份桥背书的 host 面。
 * @param host - `createDocumentHost(...)` 出来的那份分组面。
 * @returns 节点组件直接能用的那份扁表面；分组那几片读到才求值。
 */
export function toNodeHostApi(host: XaihiNodeHost): NodeHostApi {
  return {
    get contract() { return host.contract },
    get state() { return host.state },
    get workspace() { return host.workspace },
    get env() { return host.env },
    get runner() { return host.runner },
    get clipboard() { return host.clipboard },
    get downloads() { return host.downloads },
    get localFiles() { return host.localFiles },
    get config() { return host.config },

    // 下面是上游那份兼容扁名，逐条对着 `hostApi.ts:333-344` 的映射折，不另发明键。
    getData: <T,>(_compId: string): T | undefined => host.state.getData() as T | undefined,
    patchData: (_compId: string, patch: Record<string, unknown>): void => {
      host.state.patchData(patch)
    },
    listComponents: () => host.workspace.listComponents() as HostComponentRef[],
    updateComponent: (compId: string, patch: Partial<HostComponentRef>): void => {
      host.workspace.updateComponent(compId, patch)
    },
    actions: { run: (nodeId, input) => host.runner.run(nodeId, input), cancelCurrent: () => host.runner.cancelCurrent() },
    downloadText: (filename: string, content: string): void => {
      host.downloads.text(filename, content)
    },
    getNodeConfig: async () => await host.config.get(),
    saveNodeConfig: async (config: unknown) => {
      await host.config.save(config)
    },
    getNodeUiConfig: async () => await host.config.getUi(),
    saveNodeUiConfig: async (config: unknown) => {
      await host.config.saveUi(config)
    },
    openConfigFile: () => host.config.openFile(),
  }
}
