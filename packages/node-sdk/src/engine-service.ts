/**
 * Kisaki 原生引擎的**跨包能力面**：以服务名共享能力，而不是把 crate 或 `.node` 共享出去。
 *
 * 为什么住在这里而不是 `plugins/kisaki`：装进 profile 的包不许引用 `@hibernalglow/*`
 * （ADR-0002 与 `check:installable`），而 `@hibernalglow/xaihi-sdk` 是被**内联进每个包**的
 * （`packages/core/tsdown.config.ts` 的 `noExternal`）。所以两个各自打包的插件要认出同一条边，
 * 这条边的名字与形状只能住在这份被内联的 SDK 里——`NODE_REGISTRY_SERVICE` 与 `OPERATIONS_SERVICE`
 * 已经是同一个道理（见 `node-registry.ts:150-193` 那段实测：模块级单例在装机形态下每包一份）。
 *
 * 三条立场，逐条对应本仓已有的决定：
 * - **消费者只声明服务名**，不 path 依赖实现，也不 `import` 提供方的私有模块。提供方将来换成
 *   另一份引擎时，消费者一行都不用改（ADR-0015 的借用理由）。
 * - **缺席不许静默**：`connectKisakiEngine` 在提供方不在场时**永不触发回调**，也不伪造一份
 *   能调但什么都不做的实现；界面/账本要读回的"引擎不可用"由提供方自己的 `status()` 给
 *   （ADR-0011 决定 4：可以退化，不许崩、不许静默、更不许伪造）。
 * - **`status()` 是这一面唯一的落点读数**：它说的是"此刻这条边是什么状态、为什么"，
 *   不是"我猜能跑"。`transport` 只有一个值，因为 ADR-0015 决定 2 已把宿主进程内那条判死。
 *
 * @module xaihi-sdk/engine-service
 */

/** 服务名：提供方 `ctx.provide`，消费者 `ctx.inject([KISAKI_ENGINE_SERVICE])` 后按名取。 */
export const KISAKI_ENGINE_SERVICE = 'xaihiKisakiEngine'

/** 引擎自述（握手里那一帧的载荷，字段与 `KisakiRuntimeInfo` 对齐）。 */
export interface KisakiEngineInfo {
  apiVersion: number
  sourceVersion: string
  capabilities: readonly string[]
}

/** 引擎进程的可读状态；`reason` 只在 `state !== 'running'` 时出现，且必须是人话。 */
export interface KisakiEngineStatus {
  transport: 'subprocess'
  state: 'idle' | 'starting' | 'running' | 'dead' | 'refused'
  /** 子进程入口（绝对路径）；`refused` 时是"找过哪里"的那句话。 */
  entry?: string
  /** `.node` 的位置；缺席时说明没找到还是加载失败。 */
  binding?: string
  reason?: string
}

/** 过桥的引擎方法名（与 `engine-host.ts` 的派发表一一对应，两侧不许各写一份）。 */
export type KisakiEngineMethod =
  | 'info'
  | 'scan.duplicate'
  | 'scan.basic'
  | 'scan.media'
  | 'scan.exif'
  | 'scan.video-optimizer'
  | 'candidate.exif'
  | 'candidate.video-optimizer'
  | 'operation.trash'

/** 一次引擎调用可选项：`scanId` 用来收这一趟的进度事件。 */
export interface KisakiEngineCallOptions<TProgress> {
  scanId?: string
  onProgress?: (progress: TProgress) => void
}

/** 消费者真正拿到的那一面：能力复用走这里，不走 `import`。 */
export interface KisakiEngineFace {
  info(): Promise<KisakiEngineInfo>
  call<T = unknown, TProgress = unknown>(
    method: KisakiEngineMethod,
    params: unknown,
    options?: KisakiEngineCallOptions<TProgress>,
  ): Promise<T>
  /** 按 scanId 取消那一趟扫描；返回引擎自己说的"接不接得到"。 */
  cancel(scanId: string): Promise<boolean>
  /** 唯一的状态读数：界面与账本都读它，不许用"能调"代替"能用"。 */
  status(): KisakiEngineStatus
}

/** 消费者那一侧只需要这两条：按名取值 + cordis 的"等依赖到位再跑"缝。 */
export interface KisakiEngineReader {
  get(name: string): unknown
}

export interface KisakiEngineHost extends KisakiEngineReader {
  inject(deps: readonly string[], callback: (ctx: KisakiEngineReader) => unknown): unknown
}

/**
 * 把一份引擎能力接到宿主的服务表上（提供方侧）。
 * @param ctx - 提供方的 cordis 上下文。
 * @param face - 交出能力面。
 * @param service - 服务名，缺省 `KISAKI_ENGINE_SERVICE`。
 * @returns cordis 的注销器。
 */
export function provideKisakiEngine (
  ctx: { provide(name: string, value: unknown): unknown },
  face: KisakiEngineFace,
  service: string = KISAKI_ENGINE_SERVICE,
): () => void {
  ctx.provide(service, face)
  return () => { /* cordis 的 provide 没有反向动词，注销由外层 effect 的清理负责 */ }
}

/**
 * 取用引擎能力（消费者侧）：提供方在场才跑回调，缺席就**什么都不发生**。
 *
 * 与 `registerWithHost` 同一条理由：cordis 的 `inject` 是"依赖到位才跑、变了再重跑"，
 * 在 apply 里读一次会永久读空。缺席不伪造能力面——症状是消费者那一格自己说出
 * "没有引擎提供方"，而不是调到一半才发现没人应答。
 * @param ctx - 消费者的 cordis 上下文。
 * @param use - 拿到能力面之后的动作（登记、订阅、暴露成自己的工具面）。
 * @param service - 服务名。
 */
export function connectKisakiEngine (
  ctx: KisakiEngineHost,
  use: (engine: KisakiEngineFace) => void,
  service: string = KISAKI_ENGINE_SERVICE,
): void {
  ctx.inject([service], (scoped) => {
    const engine = scoped.get(service) as KisakiEngineFace | undefined
    if (engine === undefined) return
    use(engine)
  })
}
