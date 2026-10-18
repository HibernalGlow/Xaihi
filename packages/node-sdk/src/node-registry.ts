/**
 * `node-registry` —— 本地节点注册表与执行分发器（Runner）。
 *
 * 为工作台 UI 面板和本地调用提供纯本地插件执行通道，彻底解耦对 DSH Agent 会话的依赖。
 *
 * @module xaihi-sdk/node-registry
 */

import type { NodeDefinition } from './node.ts'
import type { NodeHandlers } from './define-node.ts'
import type { RunFace } from './bridge-shell.ts'
import type { OperationJournal } from './operations.ts'

export interface NodeRunResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  runId?: string
  stats?: Record<string, number>
  outputPath?: string
}

export interface RegisteredNode {
  nodeId: string
  definition: NodeDefinition
  handlers: NodeHandlers
  invoke: (actionId: string, raw?: Record<string, unknown>) => Promise<string>
  run: (actionId: string, raw?: Record<string, unknown>, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
  execute?: (input: unknown, onEvent?: (event: unknown) => void) => Promise<NodeRunResult>
  /**
   * 请求中止这个节点的一次在飞运行。
   * 回 true 只表示"中止键按下了"（信号发出 + 账本记下那一笔），不表示处理器已经停下——
   * 那半件事只有理会 `signal.aborted` 的节点做得到。
   */
  cancelRun?: (runId: string) => boolean
  /** 这个节点此刻还在跑的那些运行的 runId。 */
  inFlightRuns?: () => readonly string[]
}

/** 规范化节点名称：剥离 `@hibernalglow/` 和 `xaihi-` 前缀以便多口径命中。 */
export function normalizeNodeId(id: string): string {
  return id.replace(/^@hibernalglow\//, '').replace(/^xaihi-/, '')
}

export class NodeRegistry {
  private readonly nodes = new Map<string, RegisteredNode>()

  /**
   * 注册一个节点。如果已有同名节点，则覆盖；返回取消注册函数。
   *
   * 注销器**按身份判**：只有当表里那一格仍然是本次注册的条目时才摘除它。热更的落地顺序是
   * "先装新的、再卸旧的"，无条件按 key 删会把新实例一起摘掉（ABA）—— 症状是新插件刚装上
   * 就被上一条的注销器摘空。按身份判之后，同名重叠注册是幂等的：谁的注销器只摘谁那一条。
   */
  register(entry: RegisteredNode): () => void {
    const key = entry.nodeId
    const norm = normalizeNodeId(key)
    this.nodes.set(key, entry)
    if (norm !== key) {
      this.nodes.set(norm, entry)
    }
    return () => {
      if (this.nodes.get(key) === entry) this.nodes.delete(key)
      if (norm !== key && this.nodes.get(norm) === entry) this.nodes.delete(norm)
    }
  }

  /**
   * 按 nodeId 显式注销（长短名字一起摘）。这是"立刻清掉"的入口；fiber 回收走 `register`
   * 返回的那个按身份判的注销器，两者刻意不同：显式注销是"我就要删这个名字"，注销器是
   * "只删我自己那一条"。
   */
  unregister(nodeId: string): boolean {
    const deleted1 = this.nodes.delete(nodeId)
    const deleted2 = this.nodes.delete(normalizeNodeId(nodeId))
    return deleted1 || deleted2
  }

  get(nodeId: string): RegisteredNode | undefined {
    return this.nodes.get(nodeId) ?? this.nodes.get(normalizeNodeId(nodeId))
  }

  has(nodeId: string): boolean {
    return this.nodes.has(nodeId) || this.nodes.has(normalizeNodeId(nodeId))
  }

  list(): RegisteredNode[] {
    const seen = new Set<RegisteredNode>()
    for (const node of this.nodes.values()) {
      seen.add(node)
    }
    return [...seen]
  }

  /**
   * 运行一个节点的动作。
   * @param nodeId - 节点 ID（如 "findz", "linedup", "sleept" 或带包名前缀）。
   * @param input - 输入载荷（通常包含 action 字段及参数）。
   * @param onEvent - 可选的过程事件回调（progress, preview 等）。
   */
  async run(nodeId: string, input: unknown, onEvent?: (event: unknown) => void): Promise<NodeRunResult> {
    const entry = this.get(nodeId)
    if (!entry) {
      return {
        success: false,
        message: `Node "${nodeId}" is not registered in local NodeRegistry`,
      }
    }

    if (entry.execute) {
      try {
        return await entry.execute(input, onEvent)
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}

    // 解析 actionId
    let actionId: string | undefined
    if (typeof raw.actionId === 'string' && raw.actionId !== '') {
      actionId = raw.actionId
    } else if (typeof raw.action === 'string' && raw.action !== '') {
      actionId = raw.action
    } else {
      const selector = entry.definition.fields.find((f) => f.isActionSelector === true)
      if (selector && typeof raw[selector.id] === 'string') {
        actionId = String(raw[selector.id])
      } else if (entry.definition.actions.length === 1) {
        actionId = entry.definition.actions[0]?.id
      } else if (entry.definition.actions.length > 0) {
        actionId = entry.definition.actions[0]?.id
      }
    }

    if (!actionId) {
      return {
        success: false,
        message: `Node "${nodeId}" requires an action, but none was provided or deduced`,
      }
    }

    return await entry.run(actionId, raw, onEvent)
  }

  /**
   * 中止一次在飞运行。
   *
   * 为什么遍历而不是按 runId 直接查表：runId 是账本在 `defineNode` 里面生成的，注册表
   * 在调用之前无从预知，所以它今天没有"runId → 节点"的索引可查（要加就得让 run 的发起方
   * 回填，而 `execute` 那条覆盖路径不经过这里，回填会漏）。条目自己答"这条是不是我的"
   * 才是两侧都成立的形状；表只有几十个节点，线性扫不是代价。
   * @param runId - 要中止哪一次运行。
   * @returns 有没有真按下中止键；未知 runId 回 false（不是回 true 假装取消了）。
   */
  async cancel(runId: string): Promise<boolean> {
    for (const entry of this.list()) {
      if (entry.cancelRun?.(runId) === true) return true
    }
    return false
  }

  /**
   * 取消"此刻在跑的那些"。面板上那条取消按钮走的是这一条（桥上只有 `runner.cancelCurrent`，
   * 它不带 runId —— 见 `host-bridge.ts` 的 `BRIDGE_METHODS`）。
   * @returns 至少按下一个中止键才回 true；一条都没在飞时回 false，而不是回 true 假装取消过。
   */
  async cancelCurrent(): Promise<boolean> {
    let cancelled = false
    for (const entry of this.list()) {
      for (const runId of entry.inFlightRuns?.() ?? []) {
        if (entry.cancelRun?.(runId) === true) cancelled = true
      }
    }
    return cancelled
  }

  /**
   * 这个节点声明的一次运行硬上限（毫秒）；没声明回 null = 不设上限。
   * 与文档侧读的是同一份 `NodeDefinition.runTimeoutMs`，两侧不许各算各的。
   */
  runTimeoutFor(nodeId: string): number | null {
    return this.get(nodeId)?.definition.runTimeoutMs ?? null
  }
}

/**
 * 注册表挂在 `ctx` 上的服务名；由 xaihi-core 提供，节点侧经 `ctx.inject()` 取用。
 *
 * 为什么必须有这一格：`@hibernalglow/xaihi-sdk` 是被**内联**进每个包的（profile 解析不了
 * `@hibernalglow/*`，见 `packages/core/tsdown.config.ts` 的 `noExternal` 与 ADR-0002），
 * 所以下面那个模块级实例在装机产物里**每个包各一份**——实测三份 `const nodeRegistry = n()`
 * 分别在 `xaihi-core/lib/`、`xaihi-linedup/lib/`、`xaihi-sleept/lib/`。节点写自己那份、
 * core 的 Runner 读自己那份，症状是界面上 `Node "linedup" is not registered`。
 * 跨包共享只能走 cordis 的服务表（`OPERATIONS_SERVICE` 早就是这么做的）。
 */
export const NODE_REGISTRY_SERVICE = 'xaihiNodeRegistry'

/** `inject` 回调那一侧看得见的东西：只要一条按名字取服务。 */
export interface NodeRegistryReader {
  get(name: string): unknown
}

/**
 * `defineNode` 取用注册表所需的最小宿主面（真 `Context` 结构化成立）。
 *
 * `inject` 是 cordis 的"等依赖到位再跑，依赖变了就重跑"缝：core 的 fiber 可能比节点
 * 晚激活，注册时读一次会永久读空——与账本那条 `() => ctx.get(OPERATIONS_SERVICE)` 同一条理由，
 * 只是注册是一次性的动作，所以必须用 inject 而不是取用器。
 */
export interface NodeRegistryHost extends NodeRegistryReader {
  inject(deps: readonly string[], callback: (ctx: NodeRegistryReader) => unknown): unknown
}

/**
 * 把一份注册表接到宿主的服务表上：可用时注册，缺席时不注册（也不假装注册成功）。
 *
 * 节点脱离 xaihi-core 单独装时，回调永不触发 ⇒ 工具面照常，本地 Runner 查不到这一条。
 * 那是**读得回的**缺席（`Node "x" is not registered`），不是静默假通过。
 * @param ctx - 调用方的 cordis 上下文。
 * @param register - 拿到共享注册表之后登记条目，返回 cordis 的注销器。
 * @param service - 服务名，缺省 `NODE_REGISTRY_SERVICE`。
 */
export function registerWithHost(
  ctx: NodeRegistryHost,
  register: (registry: NodeRegistry) => () => void,
  service: string = NODE_REGISTRY_SERVICE,
): void {
  ctx.inject([service], (scoped) => {
    const registry = scoped.get(service) as NodeRegistry | undefined
    if (registry === undefined) return
    return register(registry)
  })
}

/**
 * xaihi-core 那一份注册表。
 *
 * 刻意**不是**"所有人都往这里写"的进程级单例：那在装机形态下不成立（见
 * `NODE_REGISTRY_SERVICE` 的注释）。core 装载它、并以服务名的形式交出去，节点写进来的
 * 就是这一份；`createLocalRunner` 的缺省参数保留，是为了 core 自己那条路由不用重复传参。
 */
export const nodeRegistry = new NodeRegistry()

/**
 * 创建对接桥 `ShellCapabilities.runner` 的本地运行面。
 * @param registry - 节点注册表实例（缺省为 core 提供的那一份）。
 * @param activity - 现取运行账本，用于"这次运行还在动"的那条订阅（路由给 `runner.run`
 *   的等待定时器续期就靠它）。没给 ⇒ 订阅是空操作，路由退回固定上界，而不是假装有心跳。
 */
export function createLocalRunner(
  registry: NodeRegistry = nodeRegistry,
  activity?: () => OperationJournal | undefined,
): RunFace {
  return {
    run: (nodeId: string, input: unknown, onEvent?: (event: unknown) => void) => registry.run(nodeId, input, onEvent),
    cancel: (runId: string) => registry.cancel(runId),
    cancelCurrent: () => registry.cancelCurrent(),
    getInfo: async (nodeId: string) => {
      const entry = registry.get(nodeId)
      if (entry === undefined) return null
      // 只带运行策略这三样：整份 definition 过桥会把字段表发两遍，而界面要问的只有"能跑多久"。
      return {
        nodeId: entry.nodeId,
        reportsProgress: entry.definition.reportsProgress === true,
        runTimeoutMs: entry.definition.runTimeoutMs ?? null,
      }
    },
    runTimeoutFor: (nodeId: string) => registry.runTimeoutFor(nodeId),
    onRunActivity: (listener: () => void) => activity?.()?.subscribe(listener) ?? (() => undefined),
  }
}
