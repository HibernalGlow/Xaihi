/**
 * 生产打包形状的一条尺：**两份** `@hibernalglow/xaihi-sdk` 拷贝之间，节点注册必须查得到。
 *
 * 为什么单开这一个文件：`local-runner-integration.spec.ts` 那批用例 import 的是 src，
 * vitest 里 core 与节点拿到的是**同一个**模块实例，于是"注册表只有一份"这件事在测试里
 * 天然成立、在生产里天然不成立——装机产物实测三份 `const nodeRegistry = n()`
 * （`xaihi-core/lib/`、`xaihi-linedup/lib/`、`xaihi-sleept/lib/`，因为 SDK 被 `noExternal`
 * 内联进每个包）。界面上的症状就是 `Node "linedup" is not registered in local NodeRegistry`。
 *
 * 这里给 core 那一侧的 URL 挂一个 query，逼出第二份实例；节点那一侧走裸 URL，
 * 与它自己 `define-node.ts` 内部 import 的那份是同一个实例。
 * "两份确实不是同一份"写成断言（对照）：query 哪天失效、两侧回到同一实例，这条会红而不是假绿。
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

/** core 那一侧：带 query ⇒ 另一份模块实例。 */
// @ts-expect-error TS 不认带 query 的模块 URL，vitest/vite 认（这一条尺要的就是它）
const importCoreSide = () => import('../../node-sdk/src/node-registry.ts?side=core')
/** 节点那一侧：裸 URL ⇒ 与 `define-node.ts` 内部 import 的那份同实例。 */
const importNodeOwn = () => import('../../node-sdk/src/node-registry.ts')
const importNodeDefine = () => import('../../node-sdk/src/define-node.ts')

const sampleDefinition = (nodeId: string): unknown => ({
  definitionVersion: 1,
  nodeId,
  title: { en: 'Bundle shape', zh: '打包形状' },
  description: { en: 'Bundle shape sample', zh: '打包形状样例' },
  actions: [{ id: 'go', label: { en: 'Go', zh: '跑' } }],
  fields: [],
  inputBindings: [],
})

/** 一条只够 `defineNode` 用的宿主上下文（工具面假掉，服务面是真的 cordis）。 */
function hostContext(): Context {
  const ctx = new Context()
  // 按 `local-runner-integration.spec.ts` 同一写法：与 `Context & {tools}` 交叉会被
  // cordis 自己那份 `tools.register(definition: ToolDefinition)` 撞成不相交的交集。
  ctx.tools = { register: () => undefined } as never
  return ctx
}

/**
 * 让 cordis 把注入出来的那条 fiber 跑到 ACTIVE。
 *
 * `ctx.inject` 的回调不是同步的（`Fiber` 装载走 microtask）。生产里这没有后果——注册发生在
 * 装载期，面板按"运行"至少晚一个用户动作；但用例必须等一拍，否则测的是"还没轮到"而不是"没接上"。
 * 这条因此也是判据的一部分：如果哪天注册变成永久不发生，多等一拍也不会变绿。
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

describe('两份 SDK 拷贝共用一张注册表（装机形态）', () => {
  it('core 那侧的 Runner 查得到节点那侧注册的条目', async () => {
    const coreSide = await importCoreSide()
    const nodeOwn = await importNodeOwn()
    const { defineNode } = await importNodeDefine()

    // 对照：两侧必须是两个实例，否则这条尺什么都没看。
    expect(coreSide.nodeRegistry, 'query 没生效，两侧仍是同一实例').not.toBe(nodeOwn.nodeRegistry)

    const ctx = hostContext()
    ctx.provide(coreSide.NODE_REGISTRY_SERVICE, coreSide.nodeRegistry)
    defineNode(ctx, {
      definition: sampleDefinition('bundle-shape-sample'),
      handlers: { go: async () => 'ran' },
    })
    await settle()

    expect(coreSide.nodeRegistry.has('bundle-shape-sample'), '宿主那份表没收到节点那侧的注册').toBe(true)
    expect(nodeOwn.nodeRegistry.has('bundle-shape-sample'), '又写回节点自己那份 = 两份表并存的老毛病').toBe(false)

    const result = await coreSide.createLocalRunner(coreSide.nodeRegistry)
      .run('bundle-shape-sample', { action: 'go' }) as { success: boolean; message: string }
    expect(result.success, `执行失败：${result.message}`).toBe(true)
    expect(result.message).toBe('ran')
  })

  it('注销挂在注入出来的那条 fiber 上：撤掉服务之后条目跟着离开', async () => {
    const coreSide = await importCoreSide()
    const { defineNode } = await importNodeDefine()
    const ctx = hostContext()

    const registry = new coreSide.NodeRegistry()
    const dispose = ctx.provide(coreSide.NODE_REGISTRY_SERVICE, registry)
    defineNode(ctx, {
      definition: sampleDefinition('late-unload-sample'),
      handlers: { go: async () => 'ran' },
    })
    await settle()
    expect(registry.has('late-unload-sample')).toBe(true)

    // core 卸载 = 服务消失：注入出来的那条 fiber 必须连带撤掉注册，
    // 否则停用的节点还能被 Runner 调到一个已经失效的闭包。
    await dispose()
    expect(registry.has('late-unload-sample'), '服务撤了而条目还在 = 停用不生效').toBe(false)
  })
})
