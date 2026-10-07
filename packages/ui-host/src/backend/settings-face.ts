/**
 * 设置面的装配 helper（后端那一半）。
 *
 * 分成两半的理由是**这一半能单独被测**：判据要喂一条假桥进去验"握手→host.config→那一格"
 * 这条线接没接对，而那不该要求先起 realm（`startRealm()` 会读 `window.__XAIHI_UI__`、
 * 往页面上挂协商框、真的发握手）。`mountSettingsFace()` 那一半留在 `src/document/`。
 * 顺带量过一条归属：这条判据加进 own 编译面后，`tsc -p tsconfig.json` 的读数没变
 * （1318 条在加与不加两种情况下逐字相同），所以它没有把谁的账拖进我的尺里。
 *
 * @module xaihi-ui/backend/settings-face
 */

import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost, createPersistedState } from '../client/document-host.ts'
import { configFaceFromDocumentConfig, setNodeMemoryProtectionFace } from './localBackendControl.ts'

/**
 * 如果握手已经落地就装配设置面。
 * @param bridge - 文档侧的桥会话。
 * @param node - 这份文档对应的节点名（只给持久状态那一半用，`config` 那半不读它）。
 * @returns 装上了没有（没握手或握手没带命名空间时是 false）。
 */
export function attachSettingsFace(bridge: DocumentBridge, node: string): boolean {
  const ready = bridge.ready()
  if (ready === null) return false
  if (typeof ready.settingsNs !== 'string' || ready.settingsNs === '') return false
  const host = createDocumentHost({
    bridge,
    state: createPersistedState({ bridge, node }),
    // 这一格不碰工作台几何；空壳是"这里没挂界面状态"的实话，不是那份 store 的替身。
    workspace: { listComponents: () => [], updateComponent: () => {} },
  })
  setNodeMemoryProtectionFace(configFaceFromDocumentConfig(host.config))
  return true
}
