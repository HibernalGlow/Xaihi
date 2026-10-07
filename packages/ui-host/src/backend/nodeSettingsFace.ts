/**
 * 节点**配置**（`xaihi-<node>` 命名空间）的桥版载体。
 *
 * 与 `nodeUiConfig.ts`（界面偏好那格）是同一套机制的两头：那一份落 `xaihi-core.nodeUi`，
 * 这一份直达节点自己的设置命名空间。读走 `config.getUi`（回 `{ ns, value, revision? }`），
 * 写走 `config.save` 窄补丁（`settings.update` 递归合并，别人的字段不动）。
 * 握手授权不在这里查：`bridge.call` 自己拒（`not-ready` / `capability-refused`），
 * 把那条原因换成自造的一句会把"外壳没给"说成"我们这边不行"。
 *
 * @module xaihi-ui/backend/node-settings-face
 */

import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import type { NodeSettingsFace } from '@/nodes/shared/NodeSettingsFaceContext'

export function createBridgeNodeSettingsFace(bridge: DocumentBridge): NodeSettingsFace {
  return {
    async read(ns) {
      const view = await bridge.call('config.getUi', ns) as { ns?: unknown; value?: unknown; revision?: unknown }
      return {
        ...(view.value === undefined ? {} : { value: view.value }),
        ...(typeof view.revision === 'number' ? { revision: view.revision } : {}),
      }
    },
    async write(ns, patch, expectedRevision) {
      await bridge.call('config.save', ns, patch, expectedRevision)
    },
  }
}
