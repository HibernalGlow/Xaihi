# CONTEXT · Xaihi 的领域词

只收会被跨模块引用的词。每个词给出：定义、不是什么、真源在哪。

## 分发单位

- **bundle（DSH 意义）**：带 `package.json#dsh.bundle.patch` 的 npm 包；一个 patch 文件插入若干插件行。profile 只按 bundles 列表合层。不是"打包产物"，不是"压缩包"。真源：`@deepseek-ai/dsh-package-manifest` 的 `DshBundleManifest`。
- **plugin（DSH 意义）**：一个 Cordis 模块，导出 `apply(ctx, config)`，由一行 loader entry 装载。Xaihi 语境里"插件包"= 一个自包含、自带 patch 的 bundle。
- **profile**：`$DSH_HOME/profiles/<name>/`（`package.json` + `cordis.patch.yml`），一次运行形态。**不是**仓库里的文件：`xaihi.profile.yaml` 这种东西在 DSH 里不存在。
- **Xaihi 入口包 `@hibernalglow/xaihi`**：发布期"一包装齐工作台"的 bundle；本地开发阶段不装它（见 ADR-0002）。

## Xaihi 自己的单位

- **node（节点）**：一个可被工作台调用的域能力单元（动作 + 参数字段 + 危险语义 + 预览/结果视图）。契约是 `xaihi.node/v1`，词表来自 Xiranite 的 `packages/node-definitions/src/contract.ts`，**剥掉宿主执行类字段**（runtime / host_functions / executor 归 DSH）。
- **manifest（贡献清单）**：`package.json#xaihi`，schema `xaihi.manifest/1`。声明 `ui` 产物位置与 `panels` / `slotFills` / `settings` 三类贡献点。
  - **不是组件名表**：清单里的 `id` 是稳定寻址名，`remote` + `export` 只是当前实现的地址。改组件名不破坏已装节点。
- **contribution（贡献点）**：清单里的一项声明。当前只有三类，扩展位留给 commands / menus / toolbar。
- **remote**：一个由宿主装载的 UI 产物容器。名字由节点在 `manifest.ui.remote` 里声明；宿主把它解析成 `/xaihi/remotes/<slug>/<rev>/<file>`。传输方式（远程模块 / 宿主模块表）不属于契约。
- **slot fill**：往宿主声明的插槽（`xaihi.toolbar` 等）里填一个组件。声明插槽的键即"declaring is claiming"，一个键只允许一个声明者；贡献方必须 `ctx.slots.inject`。

## 工作台侧

- **workspace**：Xaihi 拥有的主视图，占用 DSH 的 `main` keyed 面板；面板 id = `xaihi`（`ctx.layout.selectPanel` 接受它）。
- **host（宿主）**：在 Xaihi 文档里指 **Xaihi ui-host**（工作台半边）；在 DSH 文档里指 DeepSeek Harness 进程。两个意思分开用，不混写。
- **theme bridge**：把 Material You 生成的 token 层交给 DSH 的 `ctx.theme.overrideTokens(source, tokens)`。**Xaihi 没有第二套主题引擎**；主题绝不进远程模块。
- **observatory**：装载器留在 `globalThis.__XAIHI__` 的事实（装载了哪些 remote、每个模块的 React 与宿主是否同一个）。没有 Probe 导出的远端记为 `unknown`，不假装通过。
- **debug 端点 `/xaihi/debug.json`**：发现过程的可读回路径 —— loader 行、候选、每条定位失败原因。症状"没有节点"必须能读出原因。

## 门禁词

- **check-pins**：所有 `@deepseek-ai/dsh*` 必须精确 `0.2.0-rc.2`。原因是 npm 上若干 `dsh-client-*` 的 `latest` 标签还停在 `0.0.1-rc.1`。
- **purity**：浏览器半边不得 value-import 模块表基线之外的 harness 包（会被内联成第二份上下文）；产物里的 `require` 必须落在基线内。
- **自包含**：装进 profile 的包不许引用 `@hibernalglow/*`（profile 解析不了仓内包，见 ADR-0002）。
- **阳性对照**：每条尺都必须有一个"关掉防御就变红"的用例，否则该判据视为不存在。
