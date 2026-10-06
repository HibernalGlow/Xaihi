/**
 * sleept 的界面连接点。**与上游不同处（有意，且这条边就是全部区别）**：
 * 上游从 `@xiranite/node-sleept/definition` 取值，本仓从注册表嵌进来的
 * `package.json#xaihi.node` 取（`scripts/gen-node-registry.mjs`）。
 * ADR-0007 决定 4 要的是"连接点是纯数据叶子、面里不许有第二个执行宿主"——
 * 上游用叶子子路径满足它，本仓的纯数据叶子天生就是那份清单，
 * 于是连"引错 barrel 把 core 拉进 chunk"这类事故在形状上就不可能。
 * `core` 一律不带：界面跑动作只走 `/operations`（`host.actions?.run`）。
 */

import { Component } from './Component'
import { NODE_MANIFESTS, type AppNodeEntry } from '@/components/modules/packageModules.generated'

export default {
  def: NODE_MANIFESTS.sleept,
  Component,
} satisfies AppNodeEntry
