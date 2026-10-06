/**
 * 进程内自增计数器，用于生成组件实例与泳道的局部 id。
 *
 * 注意：这些 id 仅用于前端去重与 DOM key，最终持久化到后端时由 SQLite 主键决定。
 * 计数器在模块加载时归零，刷新页面后会重置——但不影响业务，因为组件 id 还
 * 带有时间戳后缀（comp-${counter}-${now}），跨刷新仍然唯一。
 */
let instanceCounter = 0
let laneCounter = 0

/** 返回下一个组件实例计数（单调递增）。 */
export function nextComponentCounter(): number {
  instanceCounter += 1
  return instanceCounter
}

/** 返回下一个泳道 id（lane-${counter}-${now}）。 */
export function nextLaneId(now: number): string {
  laneCounter += 1
  return `lane-${laneCounter}-${now}`
}
