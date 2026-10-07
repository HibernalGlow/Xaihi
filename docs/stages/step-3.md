# Step 3 · Node SDK 与脚手架 + 批次 A（linedup）

## 改了什么

- `packages/node-sdk`：新增 `conditions.ts`（`single`/`all`/`any`/`anyAll` 求值器，`anyAll` 是 OR of ANDs 的扁平谓词列表）与 `define-node.ts`（每动作一个工具、按动作可见性生成参数、`inputBindings` 变换、危险动作 → `tools/pre-execute` 的 `ask`）；参数面直接复用 dsh-tools 的 `ParameterSchemaSpec`；`NodeDanger` 字段名按参考实现对齐。
- `packages/create-xaihi-plugin`：脚手架生成 12 个文件（清单 + 自带 patch + 宿主接线 + rspack 容器 + 面板 + README），并带自洽性测试。
- `plugins/linedup`：由脚手架生成后填上从 Xiranite tag `noxide` 原样搬来的纯逻辑，节点定义写进 `package.json#xaihi.node`。

## 为什么这样设计

- **定义只有一份真源**：生成的节点从自己包里的 `package.json#xaihi.node` 读定义，不在代码里复制常量。否则"清单上有面板、工具却少一个动作"这类分叉只能靠人盯。
- **可见性与危险闸门共用一个求值器**：字段可见性决定参数表与表单，参数表决定工具签名；两处不同源就等于模型看到的和界面看到的不是一回事。
- **危险语义不自己实现**：SDK 只产出 `ask`，审批渠道、审计与降级规则全在 DSH（`ctx.get('approval')`，无 ApprovalService 时按 DSH 规则降为拒绝）。
- **脚手架的产物必须自带 patch 且钉版**：否则装进 profile 就是"安装了但不会被装载"。

## 与 DSH API 的关系

- 工具注册 `ctx.tools.register(defineTool({...}))`；`output.schema/render`、`presentResult` 见 `@deepseek-ai/dsh-tools/lib/types/schema.d.ts:176-248`。
- 危险闸门落点 `tools/pre-execute` 与 `PreToolDecision.ask`：`@deepseek-ai/dsh-tools/lib/types/index.d.ts:47,437-455`；`ask` 由 `ctx.get('approval')` 解析、缺失即降为拒绝：同文件 `:817-825`。
- 装载行由插件包自带 patch 提供，`id` 即 settings 命名空间；profile 只认 `dsh.bundle`（见 ADR-0002）。

## 实测证据

- `pnpm test` 全绿：`create-xaihi-plugin 4 / node-sdk 17 / ui-host 5 / core 22`，`check-pins OK`。
- `dsh plugin --profile xaihi add file:…/plugins/linedup` ⇒ `ADD_RC=0`；`/xaihi/manifest.json` 现在两个插件、`problems: None`；linedup 的 `remoteEntry.js` 与同级 chunk 各 200。
- headless agent 真调用生成的工具（**后续更正**：这一条当时被当成验收门槛，其实模型不是必需的调用方——
  工具与面板/命令共用同一个 `invoke()`；门槛的替代判据见 ADR-0016。下面那次跑动的读数仍然有效，只是降级成额外证）：
  `linedup_filter(sourceText=zebra/apple/zebra/drop-ZZZ, filterText=drop)` ⇒
  ```
  linedup · kept 2, removed 1
  + apple
  + zebra
  - drop-ZZZ
  ```
  去重、排序、`+/-` 前缀与 `label` 前缀都来自代码与行配置，不是模型能顺手编出的形状。

## 后续扩展

- 预览与结果视图（`previewExport: preview` / `resultExport: result_view`）现在只是被带着走：等 Step 4 的 operation stream 落地，`defineNode` 才能把结构化结果交给面板而不是拼字符串。
- `reportsProgress` 同上；`line 级 danger` 已有语义位，缺的是带副作用节点的实例（批次 B `sleept`）。
- 参数按动作过滤已生效，但 `rules` 里的数值区间/`oneOfDeclaredOptions` 还没映射到 JSON Schema —— 需要在真实节点上验证后再补，别提前猜。
