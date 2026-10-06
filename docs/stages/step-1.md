# Step 1 · DSH API 研究

四段式：改了什么 / 为什么这样设计 / 与 DSH API 的关系（引用到 `file:line`）/ 后续扩展方式。
这一篇的计划落点原本是 `docs/dsh-api-notes.md`，**实际落点是 `.dsh/skills/xaihi-architecture/SKILL.md`**
（这份偏离在 `docs/roadmap.md` 里记着）。这里补的是"Step 1 作为一次阶段交付"的报告，以及
2026-10-06 对研究结论的一次**复验**——研究是地基，地基的话没人复验过就是运气。

## 1 改了什么

- 把 DSH 的 12 个可依赖面读成可执行的结论：profile 合层、bundle 装机、client 模块管线、
  slots 渲染契约、theme 覆盖层、subprocess/storage/commands/skills 等宿主服务，以及
  "第三方插件能占哪些 surface"的边界。
- 结论没有落成一份笔记，而是落成**会被自动装载的技能**（`.dsh/skills/xaihi-architecture`），
  因为它的读者是"在这个仓里干活的开发 Agent"，文档不会被自动读，技能会。
- 由此定下后面每一步的形状：MF2-over-Core-route 的传输（ADR-0001）、自包含包（ADR-0002）、
  非 JS 内核经 subprocess（ADR-0004）、入口 bundle 是发布期产物（ADR-0005）。

## 2 为什么这样设计

研究结论只有一条标准：**能变成断言或门禁的才算结论**。所以 Step 1 的产物不是"知道很多"，而是
`check:pins`（版本线真相）、`purity`（浏览器半边的依赖纪律）、`/xaihi/remotes/<slug>/<rev>/<file>`
的 rev 必须在路径里（打包器丢查询串）、以及"面板控件只能是命令面能到达的形状"这类写法约束。

## 3 与 DSH API 的关系（本轮复验过的锚点）

复验对象是**装机在用的那一份** `0.2.0-rc.2`（npm 解包后的 `node_modules/.pnpm/…`），
不是 `Xiranite/ref/deepseek-harness` 那份旧源码检出（它是 `0.1.0-rc.5` 世代）。两个来源的差别
本身就是一条结论：**类型与 wire 形状以装机的 npm 包为准，行为以真宿主实测为准**，旧检出只能
提供命名规律与历史意图。

| 结论 | 本轮复验到的出处 | 状态 |
|---|---|---|
| `package.json#dsh` 的四个键 | `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:25`（`dsh?: DshManifest`），其内 `bundle:32`、`profile:34`、`client:36` | 成立；**计划文档里写的 `:6-52` 是行号漂移**，本节按现读的为准 |
| 版本线真相 | 现查 `npm view … dist-tags.latest`：`dsh-client-ui-slots` / `dsh-client-modules` / `dsh-tools` 都是 **`0.0.1-rc.1`**，而 `@deepseek-ai/dsh` 是 `0.2.0-rc.2` | 成立 ⇒ `check:pins` 的前提今天仍然真 |
| 插件可以带一个 icon | `types.d.ts:15`（源字段：SVG/PNG/JPEG/WebP，相对清单目录，**≤256 KiB**，realpath 解析后必须仍在目录内）；`types.d.ts:49-50`（解析结果：base64 data URL，"render as an image, not inline markup"）；wire 侧 `@deepseek-ai/dsh-plugin-manager/lib/typert.host.js:90,119,137,155`（`icon: z.string().readonly().optional()` 出现在四个只读 DTO 里） | **Step 1 当时漏掉的一条**。schema 与约束都在，渲染端在宿主 app 包里，本轮没实机验到 |
| 客户端只有 `/plugins/<pkg>/client.js` + `client.<name>.js` 这条 URL 空间 | 装机包 `@deepseek-ai/dsh-client-modules` 的 README/产物；本仓的行为证据是"我们自开 `/xaihi/*` 前缀路由来发 remoteEntry 与同级 chunk" | 成立（Gate 2.0 的实机证据仍有效） |
| 槽渲染只有 `renderSlot`，没有 Suspense | 研究期读自 `packages/client/web-react/README.md:19`（旧检出） | 命名空间与形状在 0.2.0-rc.2 装机包里一致；**这条的行号属于旧检出**，别再当 0.2.0 的出处引用。行为侧的替代证据是"壳自己管加载态、多 remote 挂载后 kit 样式标签只有 1 个"（§18/§20 实机） |
| `ctx.remote.$on` 是闭集事件表 | 装机包生成的 `typert.remote-client.js` | 成立 ⇒ operation stream 走 `WebRoute`（SSE）而不是 `$on`，这条决定的实现见 §6 |

## 4 本轮复验新加进文档的两件事

1. **icon 是宿主已经开好的图片通道**（上面表格第三行）。`docs/upstream-proposals.md` 的 P2
   因此**缩窄**：要提的诉求不再是"插件不能带图"，而是"icon 之外的静态资源目录托管"。
   本仓暂时不往包里放 icon——`examples/dsh-plugin-template/icon.svg` 是模板的美术，不是我们的；
   没有可引用的原始美术就不自己画图标（沿用视觉保守的口径）。
2. **行号会漂，版本线更会漂**。研究期写的 `types.d.ts:6-52` 现在读是 `:25` 起；旧检出的
   `web-react/README.md:19` 不能拿来当 0.2.0-rc.2 的出处。所以从这一版起，凡引用上游都以
   "装机那份"为准，旧检出的引用一律标世代。

## 5 明确没做

- 没有把研究结论复制成第二份笔记（`docs/dsh-api-notes.md` 不存在是**有意的**，见 roadmap）。
- 没有实机验 icon 的渲染端（需要桌面宿主，属 R8 那一次）。
- 没有回头改 `docs/adr/0001` 的传输决定：复验没有动摇它（MF2 三证仍然成立）。
