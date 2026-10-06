# Step 2 · 最小可运行 Bundle

四段式：改了什么 / 为什么这样设计 / 与 DSH API 的关系 / 后续扩展方式。证据都是实测输出。

## 1. 改了什么

- `examples/dsh-plugin-template/`：官方模板 53 个文件原样搬迁，一行未改。它是 DSH-native 兜底后端的活样本（14 个 slot 面 + 五个测试替身），也是 `tests/support/*` 里插槽双亲的出处。
- `packages/node-sdk` → `@hibernalglow/xaihi-sdk`：`xaihi.manifest/1` 贡献清单、`xaihi.node/v1` 节点词表、`UIModuleLoader` 接口、`/xaihi/manifest.json` 的线上形状。纯类型 + 校验器，零运行时依赖。
- `packages/core` → `@hibernalglow/xaihi-core`（宿主半边）：从 loader 行发现已装节点、校验并聚合清单、注册 `/xaihi/manifest.json`、`/xaihi/debug.json`、`/xaihi/remotes/*` 三类路由，并注册 `xaihi_nodes` 工具。
- `packages/ui-host` → `@hibernalglow/xaihi-ui`（浏览器半边）：占用 `main` 面板、用 `children` 声明 `xaihi.toolbar` / `xaihi.status` / `xaihi.panel.action`、在侧栏 `sidebar.panellist` 注册入口、`UIModuleLoader` 的远程模块实现 + 同一性探针。
- `packages/bundle` → `@hibernalglow/xaihi`：发布期入口 bundle（插 core + ui 两行）。本地开发阶段不装它（见 §3）。
- `plugins/hello` → `@hibernalglow/xaihi-hello`：一个后端工具 + 一个自带 UI 面板的最小节点。
- 门禁：`scripts/check-pins.mjs`（`@deepseek-ai/dsh*` 必须精确 `0.2.0-rc.2`）、`packages/core/tests/bundle.spec.ts`（产物里不许出现 `@hibernalglow/`）、`packages/ui-host/tests/purity.spec.ts`（浏览器半边不许 value-import 模块表基线之外的 harness 包，产物 `require` 必须在基线内），全部带阳性对照。CI 改成工作区顺序 `install → check:pins → build → typecheck → test:unit`。

## 2. 为什么这样设计

- **插件即 bundle**：桌面端 Plugins 页只管理声明了 `dsh.bundle` 的包，"a dependency without a bundle patch is refused before it installs"。所以 core / ui / 每个节点都自带一行，能单独开关；工作台不受节点装卸影响。
- **贡献点而非组件名**：清单声明 `panels` / `slotFills` / `settings`，`remote` + `export` 只是当前实现的地址。组件重命名不破坏已装插件；扩展 `commands`/`menus`/`toolbar` 时不动装载器。
- **传输可换**：`UIModuleLoader` 里不出现任何打包器或联邦协议词汇。第一实现是远程模块（rspack MF2 产物由 core 自己的前缀路由发出），兜底是 DSH 原生 `dsh.client` + `ctx.slots`。DSH 全仓零 Module Federation 先例（`remoteEntry`/`@module-federation`/rspack 在源码、CLI 安装、桌面 asar 共 10,649 个文本文件里 0 命中），所以"自己开路由发产物"这条缝隙是公开 API 给的，不是绕过去。
- **异步边界归宿主**：DSH 明写 "`renderSlot` 是唯一渲染形式，没有 Suspense 集成、没有按条目懒加载"，所以远程模块的 Promise 由工作台自己变成可见状态（骨架 → 内容 → 失败原因 + 重新加载），不指望插槽挂起。
- **两条硬约束各配一把尺**：`/xaihi/debug.json` 报出 loader 行、候选与每条定位失败原因（"没有节点"必须是可读事实而不是假信号）；装载器把 `probe.react === 宿主 React` 写进 `globalThis.__XAIHI__`（双 React 的症状比原因晚很久）。

## 3. 与 DSH API 的关系（实测锚点）

| 用到的 API | 出处 |
|---|---|
| `package.json#dsh.bundle.patch` / `dsh.client` | `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:6-52` |
| profile = `$DSH_HOME/profiles/<name>/package.json` + `cordis.patch.yml`；层序 bundle patches → profile patch → home patch → `--patch`，按行覆盖、config 整值替换 | `docs/user/develop/basic/publish.md:11-16,113-120`、`packages/boot/app-boot/README.md:38` |
| `dsh plugin --profile <name> <pnpm args…>` 是 pnpm 转发器 + 按已安装状态重算 `dsh.profile.bundles`；`dsh plugin install` 不存在；`--profile desktop` 被 CLI 拒绝 | `lib/plugin-BGnVfe_D.js`、`bin.js:105,31-33` |
| `ctx.webServer.register({kind:'exact'|'prefix', path, handler})`，重复 `(kind,path)` 抛错、最长前缀胜 | `packages/host/webserver/src/index.ts:24-145` |
| `/plugins` 前缀被 client-modules 独占，插件产物只有 `client.js` 与 `client.<chunk>.js` | `packages/client/modules/src/index.ts:241-248,421-457`、asar `dsh-client-modules` 的 `CLIENT_CHUNK` 正则 |
| 浏览器模块表 seed ⇒ React 单例 | `packages/client/web/src/seed.ts:9-41`、`platform.ts:8-15` |
| `ctx.slots.register({name, children, locale, key/id, store, inject})`；`children` 的键即声明，一键一声明者；第三方必须 `ctx.slots.inject` | `packages/client/ui-slots/src/index.ts:88-145,787-791,825-832,871-889`、`packages/client/runtime/src/client/slots.ts:128-205` |
| `main` 为 root-scoped keyed 槽、`ctx.layout.selectPanel(MainPanelId)`（未注册即抛） | 安装后的 `dsh-client-ui-layout/lib/types/client/index.d.ts:33-53`、`service.d.ts:15,32` |
| `sidebar.panellist` owner 只给 `{size, active}`，选中由行自己处理 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:46-50,94-99` |
| `ctx.theme.overrideTokens(source, tokens)` 分层覆盖（注释点名 dynamic packages） | `dsh-client-ui-theme/lib/types/client/index.d.ts:281` |
| Skill 发现：`<projectRoot>/.dsh/skills`(100) 压过 `.agents/skills`(200)，`<name>/SKILL.md` | `docs/subsystems/skills.md:66-85` |

实测证据（HEAD `8db2735` + 两条探针提交）：

- 三门禁：`pnpm test` ⇒ `GATE_RC=0`，测试 `node-sdk 6 / ui-host 5 / core 11`，`check-pins OK`。
- 干净检出（`git archive` 到仓库外）：`install --frozen-lockfile` / `build` / `check-pins` / `typecheck` / `test:unit` 全部 rc=0。**这条抓到过一个真缺陷**：`discover.spec.ts` 原先依赖被 `.gitignore` 排除的 `tests/fixtures/profile/node_modules/…`，本地全绿、克隆即死，已改为临时目录现造。
- Gate 2.1：`~/.dsh/profiles/xaihi/package.json` 的 `dsh.profile.bundles` = base + web-app + 三个 xaihi 包；`--dump-config` 里 `xaihi-core` / `xaihi-hello` / `xaihi-ui` 三行各带其 bundle 层来源注释。
- Gate 2.4：`/xaihi/manifest.json` ⇒ 200 + `cache-control: no-store`；入口 200 `text/javascript` 116,807B；同级 chunk 200 2,307B；错 rev 404；旧式 `?rev=` 404；`..%2f` 404。
- Gate 2.5：`dsh xaihi-headless "调用 xaihi_hello_ping …"` ⇒ 工具返回 `hello from xaihi: GATE25-7f3a`（nonce + 行 config 值，模型无从编造）。
- Gate 2.6：profile patch 写 `- {id: xaihi-hello, disabled: true}` ⇒ `registrations: 0`、manifest `plugins: []`、`debug.json` 里该行 `disabled: True` 且不进候选，**而 core/ui 无装载告警**；headless 同一 prompt ⇒ `NO_SUCH_TOOL`。恢复 `[]` 后 `registrations` 回到 1。

## 4. 已知代价与未决

- **rev 必须在路径里**：`/xaihi/remotes/<slug>/<rev>/<file>`。rspack 用 remoteEntry 所在目录推同级 chunk 的 URL 时会丢查询串，挂在 query 上时实测入口 200 而 chunk 永远 404。
- **headless profile 里 `xaihi-core` 是 pending**（`waiting for service: webServer`）：它的路由面确实只在有 web 宿主时存在，节点自己的工具不受影响（Gate 2.5 正是在 headless 跑通的）。fail-loud 保留，不做静默降级；无头形态若要注册表需另做一份不依赖 webServer 的半边。
- **全局配置文件里的 `xaihi-ui` 行没有 Config**：浏览器半边目前不读任何宿主配置，写一个 GUI 能改而没人读的字段就是装饰品。节点的实时配置走各自行的 config + 清单。
- **Gate 2.0 已收口（真浏览器，隔离宿主 3199）**：`window.__XAIHI__` 报
  `modules: {"hello/Panel": {reactVersion: "18.3.1", sameReactAsHost: true}, "linedup/Panel": {...sameReactAsHost: true}}`，
  两个节点面板都由各自 UI 模块渲染（linedup 有输入框、hello 有计数按钮）。
  尺的可证伪性不靠改打包器，而由 `packages/ui-host/tests/probe.spec.ts` 常驻守住：
  传一个形状相同但不同一性的 decoy React 必须判 `false`，远端不导出 Probe 必须判 `unknown`。
- **宿主隔离边界（踩过之后写死的规则）**：profile 只隔离插件层与配置；**会话按 cwd 存在
  `$DSH_HOME/sessions/`，与 profile 无关**。早期几次 `dsh xaihi-headless` 直接写进了日常
  使用的 `~/.dsh`，并且宿主默认端口 3080 与日常 web profile 撞。现在所有宿主操作必须带
  `DSH_HOME=$PWD/../.scratch/dsh-xaihi-home`（已封进 `pnpm host` / `plugin:add` /
  `plugin:install` / `profile:dump` / `host:headless`），隔离 profile 的 `cordis.patch.yml`
  把 `webserver` 端口固定成 3199。
- **移动 profile 目录的代价**：profile 里 `file:` 依赖原本是相对路径，目录一搬就指向
  `.scratch/Base/Code/Freya/Xaihi/...`（`ERR_PNPM_FS_PACKLIST_IO`），且只删 lockfile 不够，
  必须连 `node_modules` 一起清掉重装。 ⇒ 结论：隔离要在**创建 profile 之前**就把
  `DSH_HOME` 定好，别指望搬目录。
- 产物 `lib/` 与 `dist/` 不进版本控制，由 CI 的 build 步骤现生成；profile 用 `file:` 装的是工作树副本，因此本地开发必须先 `pnpm -r run build`。
- `@deepseek-ai/dsh-web-app` 必须显式装进自定义 profile（模板只带 `dsh-base`），且 profile 的 `pnpm-workspace.yaml` 里 `allowBuilds.koffi` 要填 `true`，否则整次 add 被 `ERR_PNPM_IGNORED_BUILDS` 拒掉。
