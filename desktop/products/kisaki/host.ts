import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { STATE_SETTINGS_NS } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost, type LocalState } from '@/client/document-host'
import { toNodeHostApi } from '@/client/node-host-bridge'
import { createBridgeNodeUiConfigCarrier } from '@/backend/nodeUiConfig'
import { createDesktopLocalFiles } from '../../standalone/local-files'

/** Kisaki 配置是节点 UI 偏好；写到 core.nodeUi，不能把它当 core 的顶层字段写。 */
export function createKisakiHost(bridge: DocumentBridge, state: LocalState, onFailure: (message: string) => void) {
  const documentHost = createDocumentHost({ bridge, state })
  const base = toNodeHostApi(documentHost)
  const carrier = createBridgeNodeUiConfigCarrier(bridge)
  const node = 'kisaki'
  let queue: Promise<unknown> = Promise.resolve()
  const read = async <T = unknown>() => ({ config: await carrier.read(node) as T | undefined })
  const save = (patch: unknown) => {
    const write = queue.catch(() => {}).then(async () => {
      const view = await bridge.call('config.getUi', STATE_SETTINGS_NS) as { value?: { nodeUi?: Record<string, string> }; revision: number }
      const text = view.value?.nodeUi?.[node]
      const current = text ? JSON.parse(text) : {}
      await bridge.call('config.save', STATE_SETTINGS_NS, {
        nodeUi: { [node]: JSON.stringify({ ...current, ...(patch as object) }) },
      }, view.revision)
    })
    queue = write
    return write.catch(error => { onFailure(String(error)); throw error })
  }
  // 保留桥的延迟 getters，避免在握手前展开 host.env / workspace。
  const host = Object.create(base) as typeof base & { getNodeUiConfig: typeof read; saveNodeUiConfig: typeof save }
  Object.defineProperty(host, 'config', { value: { get: read, save, getUi: read, saveUi: save, openFile: base.openConfigFile } })
  Object.defineProperty(host, 'localFiles', { value: {
    getUrl: documentHost.localFiles.getUrl,
    ...createDesktopLocalFiles(window as Parameters<typeof createDesktopLocalFiles>[0], document),
  } })
  host.getNodeConfig = read
  host.getNodeUiConfig = read
  host.saveNodeConfig = save
  host.saveNodeUiConfig = save
  return host
}

/** 节点偏好与外观共用串行、带版本号的窄补丁；自动恢复开关不会清掉 appearance。 */
export function createProductNodeUiStore(host: ReturnType<typeof createKisakiHost>) {
  return {
    read: async (_node: string) => (await host.getNodeUiConfig()).config,
    write: async (_node: string, patch: unknown) => { await host.saveNodeUiConfig(patch) },
  }
}
