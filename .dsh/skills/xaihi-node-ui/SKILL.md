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
- **面板摆的控件只能是"命令面能到达的形状"**。节点动作清单常常比 `/node` 命令宽（`findz`：13 个动作，命令面覆盖常用形状，分页游标 / 路径前缀 / 排序字段只有 agent 的工具路径能到）。装不下的部分**明说**，不要摆一个按下去没有用的控件；给按钮禁用态一个 `title` 说明缺什么。合法值从 `package.json#xaihi.node` 读，不要重抄一份，并用判据钉住"命令面覆盖的动作集合恰好等于清单"——加了动作没想它在命令面长什么样，判据当场红。
- **命令注册 ≠ 点击派发**。`ctx.commands.register` 成功（真宿主 `debug_info` 的 `commands.names` 里能看到）只证明命令面在了；面板按钮能不能真的派发取决于宿主给不给插件客户端身份，那是另一件事（见 `docs/upstream-proposals.md` 的 P1）。汇报时把这两件分开说，别用"注册成功"暗示"按钮能用"。

## 运行回显

状态栏的 `RunFeed` 订阅 `/xaihi/operations/stream`（SSE），失败退到 `/xaihi/operations.json` 轮询，并把传输方式如实标成 `data-transport="live|polling|offline"`。没有运行就不画回显。

## 上色只有一个出口（有门禁）

面板组件与颜色一律来自 `@hibernalglow/xaihi-ui-kit`：`XPanel` / `XButton`（filled|tonal|text）/
`XField` + 挂载时 `registerKitStyles()`。写进 `devDependencies`（开发期 `workspace:*`）；kit 是
**打包期内联进每个 remote** 的（ADR-0002「一个包就是一个 bundle」），运行时不解析共享组件包。

- 只有 kit 的 `tokens.ts` 允许出现 hex，且只能在 `ALIAS` 的兜底位；面板里 hex、`rgb(a)(`/`hsl(`、
  或直接引用 `--dsw-*` 都是违规。布局用的 inline style（`margin` / `whiteSpace` / `fontSize`）允许。
- `XPanel` 可以没有正文（`children` 可选）：只有动作行与状态行是合法形状，不要塞空片段占位。
- 样式标签按 `id="xaihi-ui-kit"` 去重。实机连挂三个 kit 面板之后 `<style>` 仍然是 1 个——
  这条同时证明去重守卫在起作用（守卫失效就会涨到 3）。
- 门禁是 `pnpm check:panels`（`scripts/check-panels.mjs`，CI 里排在 build 前面）：剥掉注释后跑
  四条规则，并要求每个面板从 kit 取组件；它还报"有 `frontend/` 却没有 `Panel.tsx`"这种会让枚举
  静默变窄的洞。**不要为了让门禁变绿把违规颜色挪进注释**——尺先剥注释，挪进去只是把问题留给下一个人。

