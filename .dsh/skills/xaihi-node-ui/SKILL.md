---
name: xaihi-node-ui
description: Use when writing or reviewing a node's Web UI (frontend/Panel.tsx), the workspace shell in ui-host, theme/token usage, or a module loader change. Keywords: 面板, contributes, UIModuleLoader, MF2, remoteEntry, 插槽, 主题, 纯度.
---

# 节点 UI 与工作台壳

## 契约在清单里，不在组件名里

面板通过 `package.json#xaihi.panels[]` 贡献：`{id, title, area, remote, export, order?}`。`id` 是稳定寻址名，`remote` + `export` 只是当前实现的地址——改组件名不许破坏已装节点。贡献点词表在 `xaihi.manifest/1`（`panels` / `slotFills` / `settings`），不认识版本号就整份拒绝，不静默降级。

## 壳负责所有异步状态

DSH 的槽渲染没有 Suspense、没有按条目懒加载（`packages/client/web-react/README.md:19`）。所以远程模块的 Promise 边界由 `packages/ui-host/src/client/workspace.tsx` 自己扛：先出骨架，落定再换组件，失败显示原因 + 重新加载按钮。**永远不要 `throw` 到渲染路径里**——装载器的失败一律返回 `{ok:false, reason}`。

## 传输是可换的

`UIModuleLoader`（`node-sdk/src/loader.ts`）只有 `kind` / `init()` / `load()`。当前后端是 MF2（`loader/remote-modules.ts`），DSH 原生模块表是兜底。公开类型与文档里不许出现 "MF2" 字样。装载器把事实留在 `globalThis.__XAIHI__`（observatory）：装了哪些 remote、每个模块的 React 是否与宿主同一对象；没有 `Probe` 导出的远端记 `unknown`，不假装通过。

产物 URL 的形状是 `/xaihi/remotes/<slug>/<rev>/<file>`：**rev 必须在路径里**，因为打包器推导同级 chunk 的 URL 时会丢查询串（实测症状是入口 200 而 chunk 永远 404）。

## 浏览器半边的依赖纪律（有门禁）

`packages/ui-host/tests/purity.spec.ts` 会读源码与产物：

- 值导入只许来自基线 externals（react、react-dom、cordis、DSH 客户端 UI 包）。想拿宿主的主题 / 插槽 / 布局，只能 `import type`。
- 从 `@hibernalglow/xaihi-sdk` **取值必须走子路径** `@hibernalglow/xaihi-sdk/operations`。从 barrel 取会把 Node 侧工具管线（连带 `node:module`、`url`）内联进浏览器产物——这条被抓过一次。
- 该文件还有一条硬断言：产物 `lib/client.js` 不存在就报错，不许静默跳过。别为了绿而删它。

## 面板写法

```tsx
export const Probe = { react: React, version: React.version }   // 宿主校验同一性用
export default function Panel({ contribution, locale, host }: PanelProps) { ... }
```

- React 由宿主给（`shared` 里 `import:false`），面板不建自己的 root。
- 颜色与形状来自**当前设计语言的 token**，而语言本身要移植（`Xiranite/src/lib/design-theme/`：`contract` + `registry` + 每套语言的 `spec/resolve`），落到 DSH 只经 `ctx.theme.overrideTokens(source, tokens)` 叠一层；主题**绝不进 MF2**。**不要自造 token 命名层，也不要自造组件包**——`--xaihi-*` 别名层与 `packages/ui-kit` 是 ADR-0006 撤掉的东西，Material You 只是 `md3` 这一套语言，不是默认长相。
- 面板要动宿主：走 DSH 的命令入口（`/node action`，不经过模型），或在 `PanelProps.host` 上加受控的调用口。**不要自建 RPC**；也不要为了演示在 `/xaihi` 下开一条"执行节点动作"的路由——那会绕过宿主的分派语义和危险闸门。
- **面板摆的控件只能是"命令面能到达的形状"**。节点动作清单常常比 `/node` 命令宽（`findz`：13 个动作，命令面覆盖常用形状，分页游标 / 路径前缀 / 排序字段只有 agent 的工具路径能到）。装不下的部分**明说**，不要摆一个按下去没有用的控件；给按钮禁用态一个 `title` 说明缺什么。合法值从 `package.json#xaihi.node` 读，不要重抄一份，并用判据钉住"命令面覆盖的动作集合恰好等于清单"——加了动作没想它在命令面长什么样，判据当场红。
- **命令注册 ≠ 点击派发**。`ctx.commands.register` 成功（真宿主 `debug_info` 的 `commands.names` 里能看到）只证明命令面在了；面板按钮能不能真的派发取决于宿主给不给插件客户端身份，那是另一件事（见 `docs/upstream-proposals.md` 的 P1）。汇报时把这两件分开说，别用"注册成功"暗示"按钮能用"。

## 运行回显

状态栏的 `RunFeed` 订阅 `/xaihi/operations/stream`（SSE），失败退到 `/xaihi/operations.json` 轮询，并把传输方式如实标成 `data-transport="live|polling|offline"`。没有运行就不画回显。

## UI 的真源是 Xiranite（ADR-0006）

**别在这里造 UI。** 工作台与每个节点的面板都已经以 React 实现存在于 `Xiranite`：

- 工作台：`src/App.tsx` + `src/components/{workspace,views,modules,ui}`（实测 231 个 `.tsx`，`src/` 全下 558 个，Svelte 0 个）
- 节点：`src/nodes/<id>/`（31 个），形状固定为 `entry.ts` / `Component.tsx` / `controls.tsx` / `constants.ts` / `types.ts`
  加 `Component.test.tsx` 与 `*.browser.test.tsx`；sleept 那份 1671 行
- 注册表：`src/components/modules/packageModules.generated.ts` 里 `sleept: () => import('@/nodes/sleept/entry')
  as Promise<{ default: AppNodeEntry }>`，契约与 `HeadlessNodePackage` 都在 `@xiranite/contract`
- 共享形状：`src/nodes/shared/`（ExecuteButton、LocalImage/Video/Audio Preview(Dialog)、NodeConfigPopover、
  NodeConfigSourceView、NodeRunHistoryPopover、NodeRuntimeContext）
- 设计语言：`src/lib/design-theme/`——`contract.ts`(476) + `registry.ts`(100) + `apply.ts`(163) + `contrast.ts`(49)
  + `domColor.ts`(74)，六套语言 `native|md3|mondrian|wuling|swiss|lonestar` 各带 `spec.ts`/`resolve.ts` 与测试，
  另有 `DESIGN_DIMENSIONS` 按维度开关

所以写面板的动词是**搬运与接线**：保真优先，判据是「与 `src/nodes/<id>` 那份行为一致」，不是好看或可扩展。
不许新增组件包、不许新造设计语言、不许把共享形状另写一份；需要共享的东西就从 `shared/` 搬名字和它的测试。
UI 层契约以 `AppNodeEntry` 为准（Xaihi 现在的 `PanelProps` + `Probe` 是子集，要按那份补齐）。

仍然有效的两条宿主边界（与 UI 形状无关）：主题只能经 `ctx.theme.overrideTokens(source, tokens)` 叠，
DOM 由宿主的 presenter 写；回落层里 `--dsw-alias-*` 的**名字只能从真宿主 CSSOM 现读**，不能照前缀规律拼。
