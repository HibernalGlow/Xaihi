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
 * 2. `state` 与 `workspace` 是**文档本地**的，不过桥：上游那两套 store 本来就在 UI 侧，
 *    把它们过桥等于把同一份状态放两个 realm，而 hooks 绑定具体那一份 React（ADR-0009 实测）。
 * 3. `contract.name` 是 `xaihi.node-host`，不是上游那个名字。品牌这条尺（ADR-0010）
 *    要求会随代码活下去的标识都换成本仓自称；这一条是"改名与消费者同批"的那类，
 *    所以任何按名字匹配的老数据都不该指望这里。
 *
 * @module xaihi-ui/document-host
 */

import type { NodeCapabilityId } from '@hibernalglow/xaihi-sdk'
import { BridgeError, type DocumentBridge } from '@hibernalglow/xaihi-sdk'

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
  /**
   * 这份界面属于哪个节点，用来把外壳那侧"整个设置文档"缩到本节点那一段。
   * 空串 = 工作台自己（它读写的不是某个节点的配置）。
   */
  node: string
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
 * 组一个 `host`。
 * @param deps - 桥与两个文档本地面。
 * @returns 与上游九组同形的对象；每条跨界方法在握手完成前调用会得到 `not-ready`。
 */
export function createDocumentHost(deps: DocumentHostDeps): XaihiNodeHost {
  const { bridge, node } = deps
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
      // expectedRevision 是 DSH 侧的乐观并发数（ADR-0013：写要带它，冲突要能读回），
      // 所以这里比上游多一个**可选**尾参——不破坏按上游形状写的调用点。
      get: () => call('config.get', node),
      save: (config, expectedRevision?: number) => call('config.save', node, config, expectedRevision),
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
      getUi: () => call('config.getUi', node),
      saveUi: (config, expectedRevision?: number) => call('config.saveUi', node, config, expectedRevision),
      openFile: async () => {
        await call('config.openFile')
      },
    },
  }
}
