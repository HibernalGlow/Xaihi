/**
 * 能力复用这一条边的判据：`xaihiKisakiEngine` 这个服务名，在场就连上、缺席就**什么都不发生**。
 *
 * 三条各防一种假绿：
 * ① 提供方在场 ⇒ 消费者回调**恰好一次**，并且拿到的就是那一格（防"回调从没跑过也算过"）；
 * ② 提供方缺席 ⇒ 回调**零次**——这条必须与①同形状，否则②的零是"我的假件根本不会触发"，
 *    不是"缺席被正确处理"（本仓记过这条：对照与断言要用同一条码路）；
 * ③ 装机形态下 SDK 被内联进每个包 ⇒ 两份模块实例的服务名常量必须**逐字相同**，
 *    名字不一致就是两侧永远连不上（这跟 `registry-shared-across-bundles.spec.ts` 是同族，
 *    那里量的是注册表实例，这里量的是字符串契约）。"两份确实不是同一份"也写成断言：
 *    query 哪天失效，这条会红而不是假绿。
 *
 * `ctx.inject` 的回调不是同步的（cordis 的 Fiber 装载走 microtask），所以两边都要 `settle()` 一拍；
 * 这与那份注册表判据里同一条注释的理由一致。
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import {
  KISAKI_ENGINE_SERVICE,
  connectKisakiEngine,
  type KisakiEngineFace,
} from '@hibernalglow/xaihi-sdk'

/** 带 query ⇒ 另一份模块实例（vitest 认，TS 不认）。 */
// @ts-expect-error TS 不认带 query 的模块 URL，vitest/vite 认（这一条尺要的就是它）
const importOtherSide = () => import('../../../packages/node-sdk/src/engine-service.ts?side=consumer')

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

function fakeFace(label: string): KisakiEngineFace {
  return {
    info: async () => ({ apiVersion: 5, sourceVersion: '12.0.0', capabilities: [label] }),
    call: async () => ({ from: label }),
    cancel: async () => true,
    status: () => ({ transport: 'subprocess', state: 'running', entry: `entry-${label}`, binding: `binding-${label}` }),
  }
}

describe('kisaki 引擎的服务边', () => {
  it('提供方在场：消费者回调恰好一次，拿到的就是交出那一格', async () => {
    const ctx = new Context()
    const face = fakeFace('provider')
    ctx.provide(KISAKI_ENGINE_SERVICE, face)
    const seen: KisakiEngineFace[] = []
    connectKisakiEngine(ctx, (engine) => { seen.push(engine) })
    await settle()
    expect(seen.length).toBe(1)
    expect(seen[0]).toBe(face)
    expect((await seen[0]?.info())?.sourceVersion).toBe('12.0.0')
  })

  it('提供方缺席：回调零次，也不伪造一份能调却什么都不做的能力面', async () => {
    const ctx = new Context()
    const seen: KisakiEngineFace[] = []
    connectKisakiEngine(ctx, (engine) => { seen.push(engine) })
    await settle()
    expect(seen.length).toBe(0)
  })

  it('服务名是字符串契约：两份内联拷贝逐字相同（并先证它们真不是同一份）', async () => {
    const other = await importOtherSide()
    // 对照：query 失效时两侧同一实例 ⇒ 这条红，说明③没在测装机形态
    expect(other.KISAKI_ENGINE_SERVICE).toBeTypeOf('string')
    expect(other.connectKisakiEngine).not.toBe(connectKisakiEngine)
    expect(other.KISAKI_ENGINE_SERVICE).toBe(KISAKI_ENGINE_SERVICE)
  })

  it('跨实例也连得上：一份模块实例交出的服务，另一份按名取到', async () => {
    const other = await importOtherSide()
    const ctx = new Context()
    const face = fakeFace('provider-side')
    ctx.provide(KISAKI_ENGINE_SERVICE, face)
    const seen: KisakiEngineFace[] = []
    other.connectKisakiEngine(ctx, (engine: KisakiEngineFace) => { seen.push(engine) })
    await settle()
    expect(seen.length).toBe(1)
    expect((await seen[0]?.status()).entry).toBe('entry-provider-side')
  })
})
