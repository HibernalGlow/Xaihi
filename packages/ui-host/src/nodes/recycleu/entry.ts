/**
 * recycleu 的界面连接点（Xaihi 形状）。
 *
 * 上游这一族 import 了三样东西：`@xiranite/contract`（类型）、
 * `@xiranite/node-recycleu/definition`（纯数据定义）与 `./core.js`（执行器）。
 * ADR-0007 决定 4 只允许前两样，而本仓连"纯数据叶子"都不用引包：
 * `def` 来自注册表嵌进来的 `package.json#xaihi.node`（`scripts/gen-node-registry.mjs`），
 * 于是"从 barrel 取值把 core 拉进 GUI chunk"这类事故在形状上就不可能。
 * `core` 一律不带：界面跑动作只走 `/operations`（`host.actions?.run`）。
 */

import { Component } from './Component'
import { NODE_MANIFESTS, type AppNodeEntry } from '@/components/modules/packageModules.generated'

export default {
  def: NODE_MANIFESTS.recycleu,
  Component,
} satisfies AppNodeEntry
