# ADR-0001 插件 UI 的传输：远程模块为主，DSH 原生 client 为兜底

状态：接受（2026-10-06）
决策人：HibernalGlow

## 背景

Xaihi 要"插件独立发布为 npm 包、运行时依赖 DSH、插件自带 Web UI、宿主拥有 React/布局/主题/状态"。DSH 自己已经有一条客户端模块管线（`dsh.client` + `window.__ModuleLoader__` + `ctx.slots`），它能做到"每包独立构建、共享宿主 React、懒装载"。差异在于：DSH 的产物 URL 空间只有 `/plugins/<pkg>/client.js` 与 `client.<chunk>.js`（严格命名 + 必须带当前 `?rev=`），`/plugins` 前缀被 client-modules 独占，且一个 Module Federation 容器是"入口 + 同级 chunk + 资源"的文件树。DSH 全仓零 Module Federation 先例。

## 决定

1. 契约层只承认 `remote` + `export`，接口叫 `UIModuleLoader`，公开类型里不出现具体打包器或联邦协议的名字。
2. 第一实现：远程模块容器由 **Xaihi Core 自己的前缀路由** `/xaihi/remotes/<slug>/<rev>/<file>` 发出。用的是 DSH 公开的 `ctx.webServer.register({kind:'prefix'})`，不碰 `/plugins`，不改 DSH。
3. 兜底实现：DSH 原生 `dsh.client` + `ctx.slots.inject`。切换后端不改清单、不改面板 id。
4. rev 必须是路径的一段，不能是查询串。
5. React 由宿主模块表提供，远端 `shared.react.import: false`：拿不到共享实例就硬失败，绝不允许远端悄悄自带第二份。

## 后果

- 正面：插件包不需要声明 `dsh.client` 就能带 UI；DSH 不为 Xaihi 的插件集合负责；remote 可指向任何 URL；契约与传输解耦，未来可换。
- 代价：Xaihi 自己负责 MIME 白名单、`immutable` 缓存语义、rev 失效、路径穿越防护（各配证伪测试）；多一套模块系统，双 React 风险必须由 `Probe` 断言而不是靠约定；桌面端 `dsh-app://` origin 的转发还要真机确认一次。
- 若 §5 的浏览器断言（`window.__XAIHI__.modules[*].sameReactAsHost === true`，且把 `import:false` 改掉时必须变 `false`）在真机上不过，则按本 ADR 第 3 条切兜底后端，契约不动。

## 证据

`packages/host/webserver/src/index.ts:24-145`（路由 API 与重复注册抛错）；`packages/client/modules/src/index.ts:241-248,421-457`（`/plugins` 独占与产物白名单）；`packages/client/web/src/seed.ts:9-41`（React 单例来源）；`packages/client/web-react/README.md:19`（插槽渲染无 Suspense、无按条目懒加载）；实测 `remoteEntry.js` 200 / 同级 chunk 200 / 错 rev 404 / `..%2f` 404。

## 修订

- **2026-10-06 — 形态定为"1 个宿主容器 + N 个节点 remote"，机制与决定不变。**
  ADR-0007 决定 6（方案甲：L1+L2+L4 同一个客户端包）曾把本 ADR 的适用面收窄成"只发一个 remote"，
  **该决定当日即被 ADR-0008 取代**：现在 L1 外壳 + L2 原子层同包（`@hibernalglow/xaihi-ui`，即
  `packages/ui-host`，已是 `dsh.client` 包），**L4 每节点各自成包**，L2 由宿主经 MF2 `shared` 共享。
  ⇒ 本 ADR 的机制**继续服务 N 个远程单元**（1 个宿主容器 + 每节点 1 个），**不是**收窄成 1 个。
  标题里的"插件 UI"仍读作"节点 UI"。
  决定 1–5（契约只认 `remote`+`export`、`/xaihi/remotes/<slug>/<rev>/<file>`、`dsh.client` 兜底、
  rev 进路径、React 单例硬断言）与全部后果段**保留不变**；第 5 条的硬断言按 ADR-0008 后果扩一条
  `sameUiAsHost`。
