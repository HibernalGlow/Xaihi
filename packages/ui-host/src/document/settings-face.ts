/**
 * 工作台文档里的设置面装配点。
 *
 * 存在的理由：搬来的那一格设置界面（`NodeMemoryProtectionSettings`）认的是 `host.config`，
 * 而 `host` 是在这里组的——组件不该自己起桥，装配层也不该等谁来猜一个单例。
 * 这一层做的就那一行：握手落地之后，把 `host.config` 的 `getUi`/`saveUi` 两片折成
 * 那一格要的 `ConfigFace`，交出去（那条折法与它的判据在 `../backend/settings-face.ts`）。
 *
 * 两条写死的立场：
 * - **桥从外面递进来，这里不再自己起**。`startRealm()` 每调一次就多一条握手、多一个会话号
 *   （顶层窗那条还会在宿主侧多开一格会话记录），而生产入口 `main.tsx` 已经起过一条了。
 *   所以这个函数的参数是 `Realm | null`，不是"自己去建、建完猜谁用"。
 * - **等不到握手就什么都不装**。这时候界面读到的是"没有设置面"那条可见退化
 *   （ADR-0011 决定 4），不是装着数值的一屏假象。
 * - 定时器只是"别把在飞的握手等成无限"，上界 30 次 × 150ms；桥自己的单条超时才是主判据。
 *
 * @module xaihi-ui/document/settings-face
 */

import type { Realm } from './realm.ts'
import { attachSettingsFace } from '../backend/settings-face.ts'

const ATTACH_ATTEMPTS = 30
const ATTACH_INTERVAL_MS = 150

/**
 * 等握手 + 把设置面装到**这一条**桥上。
 *
 * 入口调用它一次就够；失败路径全部是"不装"，界面上那条退化由组件自己显示。
 * @param realm - `startRealm()` 的返回值；null（缺启动信息）时直接判为没装成。
 * @returns 立刻能装上时 true；需要等在飞握手时是 false（定时器会补上）。
 */
export function mountSettingsFace(realm: Realm | null): boolean {
  if (realm === null) return false
  const bridge = realm.bridge
  const node = realm.boot.node === undefined || realm.boot.node === '' ? 'workbench' : realm.boot.node
  if (attachSettingsFace(bridge, node)) return true
  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    if (attachSettingsFace(bridge, node) || attempts >= ATTACH_ATTEMPTS) clearInterval(timer)
  }, ATTACH_INTERVAL_MS)
  return false
}
