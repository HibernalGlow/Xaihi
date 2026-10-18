/**
 * kisaki 的宿主半边：Czkawka Rust 原生引擎去重与文件分析工作台。
 * @module xaihi-kisaki
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, KISAKI_ENGINE_SERVICE, OPERATIONS_SERVICE, validateNodeDefinition, type KisakiEngineCallOptions, type KisakiEngineFace, type KisakiEngineMethod, type KisakiEngineStatus, type NodeCall, type NodeHandlers, type OperationJournal } from '@hibernalglow/xaihi-sdk'
import { ENGINE_ENTRY_SEARCHED, resolveEngineHostEntry, startKisakiEngineHost, type KisakiEngineClient, type KisakiSubprocessRuntime } from './engine-gateway.js'
import { runKisaki, type KisakiAction, type KisakiInput, type KisakiTool } from './core.ts'
import { createNodeKisakiRuntime } from './platform.ts'
import { def } from './definition.ts'

export const name = '@hibernalglow/xaihi-kisaki'

export const inject = ['tools', 'subprocess']

export interface Config {
  defaultTool: Volatile<string>
  recursive: Volatile<boolean>
  useCache: Volatile<boolean>
  saveAlsoAsJson: Volatile<boolean>
  cacheFolderPath: Volatile<string>
  configFolderPath: Volatile<string>
}

export const Config = Schema.object({
  defaultTool: Schema.string().default('duplicate-files').volatile(),
  recursive: Schema.boolean().default(true).volatile(),
  useCache: Schema.boolean().default(true).volatile(),
  saveAlsoAsJson: Schema.boolean().default(false).volatile(),
  cacheFolderPath: Schema.string().default('').volatile(),
  configFolderPath: Schema.string().default('').volatile(),
})

function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) {
    throw new Error('xaihi-kisaki: package.json 里没有 xaihi.node，节点清单无从注册')
  }
  return node
}

export function apply(ctx: Context, config: Config): void {
  // 定义先校验一次：动作清单要用来生成 handler 表，必须是同一个真源（与 findz 同一写法，
  // `plugins/findz/src/index.ts:261-263`）。
  const validated = validateNodeDefinition(ownNodeDefinition())
  if (!validated.ok) throw new Error(`xaihi.node/v1 invalid: ${validated.errors.join('; ')}`)
  const definition = validated.value

  /*
   * 引擎宿主（子进程）的取用器：起一次、失败就忘掉，别让一次启动失败等于节点永久不可用
   * （与 findz 那条 `host()` 同一形状，`plugins/findz/src/index.ts:275-285`）。
   */
  const entryPath = resolveEngineHostEntry(import.meta.url)
  let pending: Promise<KisakiEngineClient> | undefined
  let live: KisakiEngineClient | undefined
  let lastFailure = ''
  const engine = (): Promise<KisakiEngineClient> => {
    if (entryPath === null) {
      lastFailure = `refused entry-missing: ${ENGINE_ENTRY_SEARCHED}，都不在`
      return Promise.reject(new Error(lastFailure))
    }
    if (live !== undefined) return Promise.resolve(live)
    // `ctx.subprocess` 按**形状**读，不 value-import `@deepseek-ai/dsh-subprocess`：
    // 本包的 package.json 没有那条依赖边（而且它正在别的 lane 手里改），而这条面在运行时就在
    // ctx 上（findz 用的就是同一个：`plugins/findz/src/index.ts:277`）。
    // 读不到就是 `no-subprocess` 那条有名拒绝，不猜一个假的 provider 顶上去。
    const subprocess = (ctx as { subprocess?: KisakiSubprocessRuntime }).subprocess
    pending ??= startKisakiEngineHost(subprocess, { entryPath, cwd: process.cwd() })
      .then((host) => { live = host; lastFailure = ''; return host })
      .catch((error: unknown) => {
        pending = undefined
        lastFailure = error instanceof Error ? error.message : String(error)
        throw error
      })
    return pending
  }

  // 卸载时收掉那一格：terminate() 是树级的，不留孤儿扫描进程（ADR-0015 决定 2 的那条理由）。
  ctx.effect(() => () => {
    const started = pending
    if (started !== undefined) void started.then((host) => { host.dispose() }, () => undefined)
  }, 'xaihi-kisaki: terminate the engine host on unload')

  /*
   * 交给服务表的那一面。`status()` 走**显式记账**（`live` / `pending` / `lastFailure` 三个变量
   * 各自在真正发生的那一刻被写上），不用 promise 的回调去猜状态——`.then` 里的赋值
   * 在同步读的那一刻永远不会生效，那样写出来的读数是"永远 starting"，比缺席更难查。
   */
  const engineFace: KisakiEngineFace = {
    info: async () => (await engine()).info(),
    call: <T, P>(method: KisakiEngineMethod, params: unknown, options?: KisakiEngineCallOptions<P>) =>
      engine().then((host) => host.call<T, P>(method, params, options)),
    cancel: async (scanId: string) => (await engine()).cancel(scanId),
    status: (): KisakiEngineStatus => {
      if (entryPath === null) return { transport: 'subprocess', state: 'refused', reason: `refused entry-missing: ${ENGINE_ENTRY_SEARCHED}，都不在` }
      if (live !== undefined) return live.status()
      if (lastFailure !== '') return { transport: 'subprocess', state: 'refused', entry: entryPath, reason: lastFailure }
      if (pending !== undefined) return { transport: 'subprocess', state: 'starting', entry: entryPath }
      return { transport: 'subprocess', state: 'idle', entry: entryPath }
    },
  }
  ctx.effect(() => ctx.provide(KISAKI_ENGINE_SERVICE, engineFace), 'xaihi-kisaki: engine service')

  const runAction = async (actionId: KisakiAction, call: NodeCall): Promise<string> => {
    const raw = call.inputs as unknown as KisakiInput
    const mergedInput: KisakiInput = {
      ...raw,
      tool: (raw.tool || config.defaultTool.get() || 'duplicate-files') as KisakiTool,
      recursive: raw.recursive ?? config.recursive.get(),
      useCache: raw.useCache ?? config.useCache.get(),
      saveAlsoAsJson: raw.saveAlsoAsJson ?? config.saveAlsoAsJson.get(),
      cacheFolderPath: raw.cacheFolderPath || config.cacheFolderPath.get(),
      configFolderPath: raw.configFolderPath || config.configFolderPath.get(),
      // 动作由被调到的那条工具决定：面板与模型都可能带着上一次的 action 再来一次，
      // 让它盖掉 actionId 的症状是"点删除却跑了一次扫描"。
      action: actionId,
    }

    call.run.preview({ message: `Kisaki: 开始执行 ${actionId} · 工具: ${String(mergedInput.tool)}` })

    const runtime = await createNodeKisakiRuntime({ engine })
    const result = await runKisaki(mergedInput, runtime, (event) => {
      if (event.type === 'progress') call.run.progress({ done: Math.round(event.progress ?? 0), total: 100 })
      if (event.message !== '') call.run.preview({ message: event.message })
    })
    // 结果视图由节点自己发：注册表把它抓进 `NodeRunResult.data`，界面读的就是这一格。
    call.run.resultView({ action: actionId, ...(result.data ?? {}), data: result.data ?? null })
    if (!result.success) throw new Error(result.message)
    return result.message
  }

  // handler 表由定义推导：清单里每个动作都必须有实现，`defineNode` 也会再查一遍。
  const handlers: NodeHandlers = {}
  for (const action of definition.actions) handlers[action.id] = (call) => runAction(action.id as KisakiAction, call)

  defineNode(ctx, {
    definition,
    // 每次调用现取：core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers,
  })
}

// 不许 `export default`：loader 的 `unwrapExports` 会拿 default 顶掉命名空间里的 `apply`，
// 于是 `registry.plugin` 报 "invalid plugin"，宿主只留下一句 "failed to import"（其余 26 个插件都只有具名导出）。
export { def }
