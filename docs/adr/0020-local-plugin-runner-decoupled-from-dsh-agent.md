# 本地插件执行通道（Runner）与 DSH Agent 解耦

状态：接受（2026-10-07）。

## 背景

Xaihi 的核心定位是跑在微内核上的**个人工作台扩展框架 + 领域节点生态**。它的底层核心依赖是 **Cordis** 微内核插件框架及其生命周期与服务注入机制。

此前，前人教条地认为“所有来自工作台界面的操作必须经由 DSH 官方命令或 Agent 会话通道（`commands.execute(agent)`）执行”。又由于 DSH 0.2.0-rc.2 插件客户端无法拿到当前 `agentId`（上游提案 P1），且程序化创建 Agent（`agents.create`）会在使用者会话库中残留真实会话记录，前人在跨桥协商层写死了硬编码拒绝拦截：
```ts
HOST_REFUSAL_REASONS.runner: '命令要跑在一个 Agent 上：宿主只给了"程序化造一个 Agent"这条路，而那会在你的会话库里留下真会话。这一格等上游那个在现有 Agent 上执行的口子（提案 P1），不自开。'
```
该教条导致工作台 UI 中几乎所有节点（`findz`, `sleept`, `linedup`, `enginev` 等 30 个节点）的操作按钮在点击时全数抛出 `refused: 命令要跑在一个 Agent 上...`，节点面板核心功能整体瘫痪。

使用者明确裁定：
1. **Xaihi 是作为个人插件体系来使用的**，核心依赖仅为底层的 **Cordis** 微内核，必须解耦对 DSH 官方 Agent 会话体系的强绑定；
2. 节点面板的操作按钮是**确定性的纯本地插件逻辑**，不需要也不应该触发 Agent 会话或模型交互，更不应等待所谓上游提案 P1；
3. 必须彻底接通本地插件执行通道（Runner），使工作台各节点的按钮能够直接在本地 Node.js 插件中执行并返回结构化数据。

## 决定

1. **解耦 DSH Agent，确立 Cordis 本地执行为唯一主通道**：
   - 废除“界面按钮操作必须依赖 DSH Agent / 会话库”的教条。
   - 移除 `HOST_REFUSAL_REASONS.runner` 与 `shell-caps.ts` 中的硬编码拒绝拦截；
   - 节点执行直接走本地 Node.js 纯函数派发，不再调用 `commands.execute` 或伪造 Agent。

2. **建立 `NodeRegistry` 本地节点注册表与执行分发器（`@hibernalglow/xaihi-sdk`）**：
   - 在 SDK 中引入全局与 Context 作用域的 `NodeRegistry`，支持节点注册、名称规范化（剥离 `@hibernalglow/` 与 `xaihi-` 前缀匹配）与动作解析；
   - 升级 `defineNode`：插件声明节点时自动注册到 `NodeRegistry`；
   - `defineNode` 内部实现 `runAction`：调用动作 handler 时传入包装的 `OperationRun`，捕获插件通过 `run.resultView(payload)` 产生的结构化数据，返回标准的 `{ success: boolean, message: string, data?: unknown, runId?: string }`；
   - 导出 `createLocalRunner(registry)`，实现对齐桥契约的 `RunFace` 接口。

3. **宿主核心桥与同源 HTTP 通路（`@hibernalglow/xaihi-core`）**：
   - `host-routes.ts`：`HostBridgeDeps` 接入 `runner?: RunFace | (() => RunFace | undefined)`；当注入 runner 时，协商结果正常将 `runner` 写入 `ready.granted`，并从 `reasons` 中移除该项；
   - 新增端点 `/xaihi/runner` 与 `runnerHttpHandler`，接收同源 HTTP POST 请求 `{ nodeId, input }`，使客户端外壳或外部工具能够直接发起本地执行；
   - `core/index.ts`：在宿主装配中将 `createLocalRunner(nodeRegistry)` 挂载至 `/xaihi/host` 桥与 `/xaihi/runner` 路由。

4. **双外壳载体一致性透传（`@hibernalglow/xaihi-ui`）**：
   - **iframe 模式**：UI 客户端外壳构造同源 `/xaihi/runner` 直调客户端，通过 `shellCapsFrom({ runner })` 注入并经 postMessage 桥授予给内部工作台文档；
   - **顶层独立窗（realm）模式**：文档通过 `/xaihi/host` HTTP 桥直通 `hostBridgeHandler`，直接由后端本地 Runner 执行；
   - 节点组件统一调用 `host.runner.run(nodeId, input)` 或 `host.actions.run`，两类窗口行为完全一致。

5. **结构化数据（`resultView`）透传保障**：
   - 前端节点面板（如 `findz`, `linedup`, `sleept`）依赖返回值中的 `response.data` 渲染卡片状态与统计视图；
   - 执行器捕获 `lastResultView` 作为 `response.data` 回传，同时保证终端日志文本（`response.message`）与结构化对象并存。

## 判据

1. **单元测试与正向断言**：
   - `packages/node-sdk/tests/node-registry.spec.ts`：断言 `NodeRegistry` 别名检索、`defineNode` 自动注册与 `resultView` 捕获正确，rc=0；
   - `packages/core/tests/host-routes.spec.ts`：断言注入 runner 时 `ready.granted` 包含 runner 且成功响应 `runner.run`，rc=0；
   - `packages/ui-host/tests/shell-caps.spec.ts`：断言外壳桥阳性对照绿，`ready.refused` 不含 runner，rc=0；
   - `packages/core/tests/local-runner-integration.spec.ts`：端到端集成测试断言 `linedup`（过滤计算）与 `sleept`（系统状态与指标读取）在无 Agent 介入下纯本地成功执行并回传 `data`，rc=0。

2. **全仓门禁**：
   - `check-pins`：依赖版本保持精确；
   - `check-installable`：所有 bundle 包安装性检查通过；
   - `check-skills`：技能规范检查通过。

## 后果与禁忌

1. **严禁回退为 Agent 拦截**：
   - 后续维护者或其他 AI Agent **绝对不可**重新将 UI 面板按钮重定向为 DSH Agent 交互、Slash Command 或伪造真实 Agent 会话；
   - 任何破坏 `NodeRegistry` 或把 `runner` 重新标为 `refused` 的改动均视为违反本 ADR。
2. **渐进式动作适配**：
   - 若某节点有复杂动作未在基础 handler 中覆盖（如 `sleept` 倒计时与监控），应在节点的 `customExecute` 中接入其核心逻辑，而不是要求外界走模型代理。
