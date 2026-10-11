import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { STATE_SETTINGS_NS } from '@hibernalglow/xaihi-sdk/bridge'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
/** 窄补丁只比较本次写到的叶子；同一命名空间的其他字段变化可以安全重读版本。 */
export function touchedValuesUnchanged(before: unknown, after: unknown, patch: unknown): boolean {
  if (!record(patch)) return JSON.stringify(before) === JSON.stringify(after)
  return Object.entries(patch).every(([key, value]) => touchedValuesUnchanged(record(before) ? before[key] : undefined, record(after) ? after[key] : undefined, value))
}

/** 共享主题、节点偏好、节点状态共用 core 版本号；串行写入并检查各自实际修改的字段。 */
export function coordinateProductSettings(base: DocumentBridge): DocumentBridge {
  const snapshots = new Map<string, unknown>()
  let writes: Promise<unknown> = Promise.resolve()
  const remember = (key: string, value: unknown) => {
    snapshots.set(key, value)
    if (snapshots.size > 64) snapshots.delete(snapshots.keys().next().value!)
  }
  const call: DocumentBridge['call'] = async (method, ...args) => {
    if (method === 'config.getUi' && args[0] === STATE_SETTINGS_NS) {
      const view = await base.call(method, ...args) as { revision: number; value: unknown }
      remember(`config:${view.revision}`, view.value)
      return view
    }
    if (method === 'state.getData') {
      const view = await base.call(method, ...args) as { revision: number; json?: string }
      remember(`state:${args[0]}:${view.revision}`, view.json)
      return view
    }
    const config = method === 'config.save' && args[0] === STATE_SETTINGS_NS
    const state = method === 'state.patchData'
    if (!config && !state) return await base.call(method, ...args)
    const previousRevision = args[2]
    const snapshotKey = config ? `config:${previousRevision}` : `state:${args[0]}:${previousRevision}`
    const observed = snapshots.get(snapshotKey)
    const known = snapshots.has(snapshotKey)
    const task = writes.catch(() => {}).then(async () => {
      const current = await base.call(config ? 'config.getUi' : 'state.getData', args[0]) as { revision: number; value?: unknown; json?: string }
      const unchanged = config ? touchedValuesUnchanged(observed, current.value, args[1]) : observed === current.json
      if (current.revision !== previousRevision && (!known || !unchanged)) {
        throw Object.assign(new Error(`设置已在另一处修改：读取第 ${previousRevision} 版，当前第 ${current.revision} 版。请重新加载后确认再保存。`), { reason: 'SETTINGS_CONFLICT' })
      }
      return await base.call(method, args[0], args[1], current.revision)
    })
    writes = task
    return await task
  }
  const bridge = Object.create(base) as DocumentBridge
  Object.defineProperty(bridge, 'call', { value: call })
  return bridge
}
