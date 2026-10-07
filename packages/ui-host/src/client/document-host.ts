/**
 * 文档那一侧的 `host`：把跨桥的调用包成上游 `NodeHostApi` 的形状。
 *
 * 为什么要有这一层而不是让节点 UI 直接调桥：搬过来的节点组件写的是
 * `host.config.get()` / `host.runner.run()` / `host.state.getData()`（上游
 * `NodeHostCapabilities` 那九组，`packages/contract/src/index.ts:431-444`）。
 * 只要这一层给得出同样的形状，节点 UI 一行都不用改；改的只有"每条调用现在会失败了"。
 *
 * 三条与上游不同的地方，逐条说明（其余一律照上游形状，不自造第二个契约）：
 * 1. **每条跨界的方法都可能抛** `BridgeError`。上游同 realm 时这些方法不会失败，
 *    所以那边的组件里普遍没有 catch——这不是组件的错，是移植带来的新失败面。
 *    界面要显示退化（ADR-0011 决定 4），靠的就是这些抛出可读回的 `reason`。
 * 2. `workspace` 是**文档本地**的，不过桥：上游那套工作台几何本来就在 UI 侧，把它过桥等于
 *    把同一份状态放两个 realm，而 hooks 绑定具体那一份 React（ADR-0009 实测）。
 *    `state` 这一组被拆成两半：**同步的那一份永远在文档里**（`getData()` 直接返回值、
 *    `patchData()` 立即生效，所以搬来的组件一行不用改），过桥的只有它的**持久快照**——
 *    启动时 `hydrate()` 预取一次，之后每次写往后刷（见 `createPersistedState`）。
 *    落点是外壳那侧 `xaihi-core` 的一个 volatile 字段（实测 DSH 的 remote 设置面只认
 *    schema 里声明过的 volatile 路径，任意 JSON 一律被拒）。
 * 3. `contract.name` 是 `xaihi.node-host`，不是上游那个名字。品牌这条尺（ADR-0010）
 *    要求会随代码活下去的标识都换成本仓自称；这一条是"改名与消费者同批"的那类，
 *    所以任何按名字匹配的老数据都不该指望这里。
 *
 * @module xaihi-ui/document-host
 */

import type { NodeCapabilityId } from '@hibernalglow/xaihi-sdk/bridge'
import { BridgeError, type DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'

/** 文档本地的组件状态面（上游 `NodeStateCapability` 的三个成员）。 */
export interface LocalState<TData extends object = Record<string, unknown>> {
  getData: () => TData | undefined
  patchData: (patch: Partial<TData>) => void
  replaceData?: (next: TData) => void
}

/** 文档本地的工作台面（上游 `NodeWorkspaceCapability` 的两个成员）。 */
export interface LocalWorkspace {
  listComponents: () => readonly Record<string, unknown>[]
  updateComponent: (compId: string, patch: Record<string, unknown>) => void
}

export interface DocumentHostDeps {
  bridge: DocumentBridge
  state: LocalState
  workspace: LocalWorkspace
}

/** 上游 `NodeHostApi` 的本仓对应形状（九组，方法名逐字对齐）。 */
export interface XaihiNodeHost {
  contract: {
    name: 'xaihi.node-host'
    version: string
    supportedCapabilities: readonly NodeCapabilityId[]
    hasCapability: (capability: NodeCapabilityId) => boolean
  }
  state: LocalState
  workspace: LocalWorkspace
  env: { theme: 'light' | 'dark'; platform: string }
  runner: {
    run: (nodeId: string, input?: unknown) => Promise<{ runId: string }>
    getInfo: (nodeId: string) => Promise<unknown>
    cancelCurrent: () => Promise<boolean>
  }
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<void>
    readFiles: () => Promise<unknown>
    writeFiles: (paths: readonly string[], effect?: 'copy' | 'move') => Promise<void>
    clearFiles: () => Promise<boolean>
    readImage: () => Promise<unknown>
    writeImage: (image: { base64: string; mimeType: string }) => Promise<void>
  }
  downloads: { text: (filename: string, content: string) => void }
  localFiles: {
    getUrl: (path: string) => string
    openPath: (path: string) => Promise<void>
    revealPath: (path: string) => Promise<void>
    pickFiles: (options?: unknown) => Promise<string[]>
    pickDirectory: () => Promise<string | undefined>
    pickDirectories: () => Promise<string[]>
    list: (path: string, options?: unknown) => Promise<readonly unknown[]>
  }
  config: {
    get: () => Promise<unknown>
    save: (config: unknown, expectedRevision?: number) => Promise<unknown>
    getPresets: () => Promise<unknown>
    createPreset: (input: unknown) => Promise<unknown>
    updatePreset: (presetId: string, input: unknown) => Promise<unknown>
    deletePreset: (presetId: string) => Promise<unknown>
    getVersions: (options?: unknown) => Promise<unknown>
    inspectVersion: (revision: string) => Promise<unknown>
    restoreVersion: (revision: string) => Promise<unknown>
    exportConfig: (format?: string) => Promise<unknown>
    importConfig: (content: string, format?: string) => Promise<unknown>
    createBackup: (label?: string) => Promise<unknown>
    getHistoryRepository: () => Promise<unknown>
    setHistoryRemote: (url: string | null) => Promise<unknown>
    syncHistory: (direction: 'pull' | 'push') => Promise<unknown>
    getUi: () => Promise<unknown>
    saveUi: (config: unknown, expectedRevision?: number) => Promise<unknown>
    openFile: () => Promise<void>
  }
}

/** 取握手结果；没有就抛，而不是先画一屏再纠正。 */
const requireReady = (bridge: DocumentBridge) => {
  const ready = bridge.ready()
  if (ready === null) throw new BridgeError('not-ready', '还没拿到宿主握手应答')
  return ready
}

/**
 * 取设置命名空间；没带就抛一条点名原因的错。
 *
 * 这里**不做任何兜底**（不拿节点短名顶替、也不退回 `xaihi-core`）：兜底会把"这一格其实没接线"
 * 变成一条看起来合法的写入，而那正是 2026-10-06 量出来的那个错形状 —— DSH 只认 loader 行的 id。
 * @param ns - 装配侧带进来的命名空间。
 * @returns 可用的命名空间。
 */
function requireSettingsNs(ns: string | undefined): string {
  if (typeof ns !== 'string' || ns === '') {
    throw new BridgeError('no-provider', '这份界面没带设置命名空间（config.get/save 与 getUi/saveUi 需要 DSH loader 行的 id，如 xaihi-sleept；拿节点短名会被当场拒掉，所以这里不猜）')
  }
  return ns
}

/**
 * 这几组**由文档自己兑现**，不过桥，也不需要对面授予。
 *
 * 列出来不是为了绕过协商，而是因为 2026-10-07 在真顶层窗里量到过一层面与行为不一致：
 * 协商回 `refused=[… downloads …]`，而 `host.downloads.text('x.txt','hi')` **调用成功**
 * （文档里就有 DOM 与 Blob，这动作从来不经过对面）。界面上把这种组念成"宿主没给"，
 * 使用者就会去追一条根本不存在的能力缺口——而真正该说的是"这一格本地就能做，桥不管"。
 * `localFiles.getUrl` 是同一类（把本地路径变成同源 `/xaihi/files/...` 的资源 URL）。
 */
export const DOCUMENT_FULFILLED_GROUPS = ['downloads'] as const

/** 这一组是不是"文档自己做的那一类"（不做桥上往返，也不该被算成宿主缺勤）。 */
export function isDocumentFulfilled (capability: string): boolean {
  return (DOCUMENT_FULFILLED_GROUPS as readonly string[]).includes(capability)
}

/**
 * 组一个 `host`。
 * @param deps - 桥与两个文档本地面。
 * @returns 与上游九组同形的对象；每条跨界方法在握手完成前调用会得到 `not-ready`。
 */
export function createDocumentHost(deps: DocumentHostDeps): XaihiNodeHost {
  const { bridge } = deps
  const granted = (): readonly NodeCapabilityId[] => requireReady(bridge).granted
  const call = (method: Parameters<DocumentBridge['call']>[0], ...args: readonly unknown[]): Promise<unknown> => bridge.call(method, ...args)

  return {
    contract: {
      name: 'xaihi.node-host',
      get version() {
        return requireReady(bridge).contractVersion
      },
      get supportedCapabilities() {
        return granted()
      },
      hasCapability: (capability) => granted().includes(capability),
    },
    state: deps.state,
    workspace: deps.workspace,
    get env() {
      const env = requireReady(bridge).env
      if (env === undefined) throw new BridgeError('refused', '宿主没随握手带环境快照（暗/亮与平台未知）')
      return env
    },
    runner: {
      run: (nodeId, input) => call('runner.run', nodeId, input) as Promise<{ runId: string }>,
      getInfo: (nodeId) => call('runner.getInfo', nodeId),
      cancelCurrent: () => call('runner.cancelCurrent') as Promise<boolean>,
    },
    clipboard: {
      readText: () => call('clipboard.readText') as Promise<string>,
      writeText: async (text) => {
        await call('clipboard.writeText', text)
      },
      readFiles: () => call('clipboard.readFiles'),
      writeFiles: async (paths, effect) => {
        await call('clipboard.writeFiles', paths, effect === undefined ? {} : { effect })
      },
      clearFiles: () => call('clipboard.clearFiles') as Promise<boolean>,
      readImage: () => call('clipboard.readImage'),
      writeImage: async (image) => {
        await call('clipboard.writeImage', image)
      },
    },
    downloads: {
      // 上游这个成员是同步的（自己造一个 Blob 并触发下载），因此**不过桥**：
      // 文档里就有 DOM，过桥只会把一条本来不动作的事变成一次往返。
      text: (filename, content) => {
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
        URL.revokeObjectURL(url)
      },
    },
    localFiles: {
      // 同 downloads：把一个本地路径变成文档里可用的资源 URL 是文档侧的事（本仓的 `/xaihi/**` 同源路由）。
      getUrl: (path) => `/xaihi/files/${encodeURIComponent(path)}`,
      openPath: async (path) => {
        await call('localFiles.openPath', path)
      },
      revealPath: async (path) => {
        await call('localFiles.revealPath', path)
      },
      pickFiles: (options) => call('localFiles.pickFiles', options ?? {}) as Promise<string[]>,
      pickDirectory: () => call('localFiles.pickDirectory') as Promise<string | undefined>,
      pickDirectories: () => call('localFiles.pickDirectories') as Promise<string[]>,
      list: (path, options) => call('localFiles.list', path, options ?? {}) as Promise<readonly unknown[]>,
    },
    config: {
      // 上游的 save(config) 只有一个参数：同 realm 时"这是哪个节点的配置"由宿主自己知道。
      // 过桥之后这件事必须显式带上，否则外壳收到的是一份没有归属的 patch。
      // 带的**必须是 loader 行的 id**而不是节点短名：2026-10-06 在真设置面上量过，
      // `config.save('sleept', …)` 与 `('core', …)` 都被 DSH 拒成 `No configurable plugin entry`，
      // 只有 `('xaihi-core', …)` 成立（DSH 自己的写法是 `ctx.fiber.entry?.options.id`）。
      // expectedRevision 是 DSH 侧的乐观并发数（ADR-0013：写要带它，冲突要能读回），
      // 所以这里比上游多一个**可选**尾参——不破坏按上游形状写的调用点。
      get: async () => call('config.get', requireSettingsNs(requireReady(bridge).settingsNs)),
      save: async (config, expectedRevision?: number) => call('config.save', requireSettingsNs(requireReady(bridge).settingsNs), config, expectedRevision),
      getPresets: () => call('config.getPresets'),
      createPreset: (input) => call('config.createPreset', input),
      updatePreset: (presetId, input) => call('config.updatePreset', presetId, input),
      deletePreset: (presetId) => call('config.deletePreset', presetId),
      getVersions: (options) => call('config.getVersions', options ?? {}),
      inspectVersion: (revision) => call('config.inspectVersion', revision),
      restoreVersion: (revision) => call('config.restoreVersion', revision),
      exportConfig: (format) => call('config.exportConfig', format ?? 'json'),
      importConfig: (content, format) => call('config.importConfig', content, format ?? 'auto'),
      createBackup: (label) => call('config.createBackup', label ?? ''),
      getHistoryRepository: () => call('config.getHistoryRepository'),
      setHistoryRemote: (url) => call('config.setHistoryRemote', url),
      syncHistory: (direction) => call('config.syncHistory', direction),
      getUi: async () => call('config.getUi', requireSettingsNs(requireReady(bridge).settingsNs)),
      saveUi: async (config, expectedRevision?: number) => call('config.saveUi', requireSettingsNs(requireReady(bridge).settingsNs), config, expectedRevision),
      openFile: async () => {
        await call('config.openFile')
      },
    },
  }
}

/** 持久化后的状态面：同步那三条照上游，另外三条是这一层自己的记账口子。 */
export interface PersistedState<TData extends object = Record<string, unknown>> extends LocalState<TData> {
  /**
   * 从外壳预取本节点的快照。必须在挂载 `createRoot(...)` **之前** await 完，
   * 因为同步的 `getData()` 没有"值晚点到"这一说——晚到的那份读不到。
   * @returns 有没有取到内容（没有节点 id、或外壳那格还没存过东西时是 false）。
   */
  hydrate: () => Promise<boolean>
  /** 把攒下的写推出去（卸载前与测试用）；不 flush 时写会在下一次同步调用后被排干。 */
  flush: () => Promise<void>
  /** 最近一次往后刷的失败原因（成功时是 null）。同步 API 抛不了异步错，所以失败只能这样读回来。 */
  syncError: () => string | null
}

/**
 * 建一个"同步在文档、持久在壳"的节点状态面。
 *
 * 为什么写要往后刷而不是每条都 await：上游的 `patchData()` 是同步返回的，
 * 搬来的组件里到处都是 `host.state.patchData({ x: 1 })`，把它改成异步等于改遍所有调用点。
 * 于是这里同步改本地、把序列化后的整份 JSON 排进一条 Promise 链，冲突与失败走 `syncError()`。
 * @param deps - 桥与这份界面属于哪个节点。
 * @returns 给 `createDocumentHost({ state })` 的那一面。
 */
export function createPersistedState<TData extends object = Record<string, unknown>>(deps: {
  bridge: DocumentBridge
  node: string
}): PersistedState<TData> {
  const { bridge, node } = deps
  let data: TData | undefined
  let revision: number | undefined
  /** 本地比外壳新：只有它为真时往后刷，避免把刚写出去的那份再写一遍。 */
  let dirty = false
  let lastError: string | null = null
  let chain: Promise<void> = Promise.resolve()

  const describeFailure = (error: unknown): string => {
    const err = error as { reason?: unknown; detail?: unknown }
    const reason = typeof err?.reason === 'string' ? err.reason : 'failed'
    const detail = typeof err?.detail === 'string' ? err.detail : ''
    return detail === '' ? reason : `${reason} · ${detail}`
  }

  const push = async (): Promise<void> => {
    if (node === '') {
      lastError = '这份界面没有节点 id（工作台自己），节点状态没处可写'
      return
    }
    if (!dirty || data === undefined) return
    dirty = false
    try {
      const value = await bridge.call('state.patchData', node, JSON.stringify(data), revision) as { revision?: unknown }
      if (typeof value?.revision === 'number') revision = value.revision
      lastError = null
    } catch (error) {
      lastError = describeFailure(error)
      // 冲突后只补一次"重读版本号"，本地那份不动：下一写因此带着外壳现在的 revision 出去，
      // 而不是反复撞同一堵墙（无界重试在别的仓里撞到过一章 136 次）。
      try {
        const again = await bridge.call('state.getData', node) as { revision?: unknown }
        if (typeof again?.revision === 'number') revision = again.revision
      } catch {
        // 连版本号都读不到：原因已经留在 syncError() 里，不再往里加噪声。
      }
    }
  }

  const schedule = (): void => {
    dirty = true
    chain = chain.then(push)
  }

  return {
    getData: () => data,
    patchData: (patch) => {
      data = { ...(data ?? {}), ...(patch as Partial<TData>) } as TData
      schedule()
    },
    replaceData: (next) => {
      data = next
      schedule()
    },
    hydrate: async () => {
      if (node === '') return false
      const value = await bridge.call('state.getData', node) as { json?: string; revision?: number }
      if (typeof value?.revision === 'number') revision = value.revision
      if (typeof value?.json !== 'string') return false
      data = JSON.parse(value.json) as TData
      dirty = false
      return true
    },
    flush: () => chain.then(push),
    syncError: () => lastError,
  }
}
