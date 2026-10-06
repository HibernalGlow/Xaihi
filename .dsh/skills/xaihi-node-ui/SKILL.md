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
- 颜色只写 `var(--xaihi-*, var(--dsw-alias-*))`。主题属于 Core Theme Service，**绝不进 MF2**；Material You 生成的 token 经 `ctx.theme.overrideTokens('xaihi.md3', …)` 叠一层，插件禁止自带颜色类名。
- 面板要动宿主：走 DSH 的命令入口（`/node action`，不经过模型），或在 `PanelProps.host` 上加受控的调用口。**不要自建 RPC**；也不要为了演示在 `/xaihi` 下开一条"执行节点动作"的路由——那会绕过宿主的分派语义和危险闸门。

## 运行回显

状态栏的 `RunFeed` 订阅 `/xaihi/operations/stream`（SSE），失败退到 `/xaihi/operations.json` 轮询，并把传输方式如实标成 `data-transport="live|polling|offline"`。没有运行就不画回显。
