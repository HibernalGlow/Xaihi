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
import type { XaihiConfigFace, XaihiNodeHost } from './document-host.ts'

/**
 * 折叠一份桥背书的 host 面。
 * @param host - `createDocumentHost(...)` 出来的那份分组面。
 * @returns 节点组件直接能用的那份扁表面；分组那几片读到才求值。
 */
/**
 * 折叠层的产出：上游 `NodeHostApi` **减去今天给不出的那三处形状**，减掉的部分按本仓的真实形状声明。
 *
 * 这三处不是疏忽，逐条有出处（`docs/adr/0011` 2026-10-07 那两行），也不许在这一层用 `as` 抹平：
 * - `contract.name`：上游那份是字面量 `xiranite.node-host`，而本仓会随代码活下去的自称是 Xaihi（ADR-0010）。
 *   现读整棵搬来的树里没有一条**组件**读这个名字（只有 `src/plugins/frontendHost.ts:168` 把它转发出去，
 *   以及两条测试按它比），所以这一处的差异今天不影响行为；接缝上若要一份字面意义上的 `NodeHostApi`，
 *   那是装配侧的显式决定（改契约那份字面量，或就地 cast），不在这层偷偷做。
 * - `config` 与扁名 `getNodeConfig` / `getNodeUiConfig`：上游回 `{ config, path }`，
 *   而路线 (A) 的对面只回 `{ ns, value, revision }` —— DSH 的标准面没有"配置文件路径"这一说
 *   （ADR-0013 正是把它拿掉的那条），编一个 toml 路径就是伪造宿主没说过的数据。
 *
 * 其余成员（`state`/`workspace`/`env`/`runner`/`clipboard`/`downloads`/`localFiles` 与那些扁名）
 * 逐字沿用上游那几份接口，本仓不另描一遍字段表。
 */
export type XaihiNodeHostApi = Omit<NodeHostApi, 'contract' | 'config' | 'getNodeConfig' | 'getNodeUiConfig'> & {
  contract: XaihiNodeHost['contract']
  config: XaihiConfigFace
  getNodeConfig?: <T = unknown>() => Promise<{ config: T | undefined }>
  getNodeUiConfig?: <T = unknown>() => Promise<{ config: T | undefined }>
}

/** 读对面那一格的值（`config.getUi` 的应答形状：`{ ns, value, revision }`）。 */
async function namespaceValue (host: XaihiNodeHost): Promise<unknown> {
  const view = await host.config.getUi() as { value?: unknown } | undefined
  return view?.value
}

export function toNodeHostApi(host: XaihiNodeHost): XaihiNodeHostApi {
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
    listComponents: () => host.workspace.listComponents(),
    updateComponent: (compId: string, patch: Partial<HostComponentRef>): void => {
      host.workspace.updateComponent(compId, patch)
    },
    actions: { run: (nodeId, input) => host.runner.run(nodeId, input), cancelCurrent: () => host.runner.cancelCurrent() },
    downloadText: (filename: string, content: string): void => {
      host.downloads.text(filename, content)
    },
    // 上游的扁名回的是"**这个节点**的配置"，而本仓的 `config.get` 那条动词映射到 DSH 的 `describe()`——
    // 那是**所有**插件的行（活体读数：`{"namespaces":[…]}`，2026-10-06 在同一条桥上量过整份文档能撑爆 256 KiB 上界）。
    // 所以这里走 `getUi`：它按装配带进来的 loader 行 id 只回那一格。`path` 不填——对面从没说过一个路径，
    // 编一个就是伪造宿主没给的数据（ADR-0013）；上游那两处 `setConfigFilePath(response.path)` 因此读不到东西，
    // 那一格等一个真定位符（见 ADR-0011 2026-10-07 那两行）。
    getNodeConfig: async <T = unknown>() => ({ config: await namespaceValue(host) as T | undefined }),
    saveNodeConfig: async (config: unknown) => {
      await host.config.save(config)
    },
    getNodeUiConfig: async <T = unknown>() => ({ config: await namespaceValue(host) as T | undefined }),
    saveNodeUiConfig: async (config: unknown) => {
      await host.config.saveUi(config)
    },
    openConfigFile: () => host.config.openFile(),
  }
}
