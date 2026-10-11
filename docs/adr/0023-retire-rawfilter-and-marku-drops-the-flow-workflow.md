# ADR-0023 · 退役 rawfilter 节点；marku 只保留 JSON 工作流，删掉 React Flow 那一套

- 状态：接受（2026-10-10 使用者指令）
- 决策人：使用者、HibernalGlow
- 相关：`docs/adr/0017-retire-logx-node-and-align-node-roster.md`（同一套退役流程：两侧目录 + 生成器 + profile）、`docs/adr/0016-plugin-invocation-does-not-require-a-model.md`、`docs/adr/0020-local-plugin-runner-decoupled-from-dsh-agent.md`、`docs/adr/0013-config-goes-through-dsh-settings.md`

## 背景

1. **rawfilter 卡片上的"预演"只剩字面**（2026-10-10 实测，退役的直接证据，不是全部理由）：
   - 卡片组输入时写的是 `dryRun: data.dryRun ?? false`（`packages/ui-host/src/nodes/rawfilter/Component.tsx:545`，`data` 来自 `host.getData(compId) ?? {}` 即"新卡片没有这一格"），
     而清单声明的是 `{"id":"dryRun","kind":"boolean","default":{"boolean":true}}`（`plugins/rawfilter/package.json`，HEAD 实测），插件文件头与 `Config.dryRun` 也都把"界面默认预演"当契约。
   - 适配器对布尔只做 `typeof value === "boolean"` 采纳，显式 `false` 与"没给"在那一层没有区别 ⇒ 新卡片上一按执行就是**真执行**。
   - 那条路走 `/xaihi/runner`（`packages/core/src/host-routes.ts` 的 `RUNNER_PATH` → `NodeRegistry.run` → `defineNode` 的 `runAction`），**不经过 `tools/pre-execute`**，所以 `danger.all` 判出来的 `ask` 在面板这条路上根本不出现——`define-node.ts` 自己在 `invoke` 那一行就写着"命令、面板按钮这类非模型入口必须自己先问 `dangerFor`"，而 `runAction` 没有问。
   - 也就是：这张卡与"我默认只预演"的声明相反，且没有任何审批挡在前面。
2. **marku 有两套工作流**：JSON/文本那条（清单 `plugins/marku/package.json#xaihi.node.actions` = `text|run|history|undo`，handler 同）与画布式的 React Flow 面板。后者会发 `action:"workflow"`，而清单与 handler 从来没有这条动作（实测 `xaihi.node/v1: no handler for action "workflow"`）——按下"运行工作流"只会得到 SDK 的框架措辞。
3. **使用者 2026-10-10 裁定**：`rawfilter` 整个节点删除；`marku` 只保留 JSON 工作流，不再要 React Flow 渲染的那一套。

## 决定

1. **物理删除 `rawfilter`**（照 ADR-0017 的同一套流程）：
   - 删 `plugins/rawfilter` 与 `packages/ui-host/src/nodes/rawfilter`（两侧必须同批，`gen-node-registry.mjs` 是按"界面目录 × 插件清单"配对算的，单边删会被它记成 skipped）；
   - 从 `packages/cli/package.json` 的依赖表、`packages/ui-host/src/lib/hazardMode.ts` 的 `DRY_RUN_MODULE_IDS`、两份 locale 的 `rawfilter` 段、`packages/ui-host/tests/node-mount.spec.tsx` 的 `REGISTERED` 名单里摘掉；
   - 重跑 `scripts/gen-node-registry.mjs` 与 `scripts/gen-cli-registry.mjs`（**不手改生成物**）；
   - 开发 profile 用 `pnpm plugin:remove @hibernalglow/xaihi-rawfilter` 摘掉那一行（那条 `link:` 指着即将消失的目录，留着会锁死后续所有 profile 安装）。
2. **marku 只留 JSON 工作流**：
   - 删掉 React Flow 那一套：`WorkflowEditor.tsx`、`WorkflowInspector.tsx`、`WorkflowPanel.tsx`、`WorkflowResults.tsx`、`workflow-editor-primitives.ts`、`workflow-state.ts`(+test)、`workflow-result-projection.ts`(+test)；
   - `Component.tsx` / `normal-views.tsx` / `model.ts` / `types.ts` 摘掉对应引用与 `workflow` 那一支（含 `workflowMode` 渲染分支、"工作流模式"按钮、`actionLabel` 的 `workflow` 分支、只服务 Flow 的状态字段与类型）；
   - 删掉两个本地垫片 `packages/ui-host/src/vendor/xyflow-stub.tsx` / `xyflow-stub.css`，以及 `rspack.document.mjs` 与 `vitest.browser.config.ts` 里指过去的别名（`@xyflow/react` 从未进过任何 `package.json` 或锁文件，它一直是别名指垫片）；
   - `tsconfig.ported.json` 的 `@xiranite/node-marku/workflow` 别名一并摘掉（删 Flow 后无消费者）。
   - **插件侧一个字不改**：`plugins/marku` 的清单与 handler 本来就是四动作，要拆的是界面那一侧多出来的入口。

## 后果

- **节点全集 27 → 26**（`packageModules.generated.ts` 的 `id` 条数实测 27 → 26）；**带 bin 的 CLI 条目 26 → 25**（`gen-cli-registry` 现读输出）。
- 门禁读数（2026-10-10，本机）：`check:noderegistry`、`check:cliregistry`、`check:installable`、`check:nodebundle`（现比 **26** 个节点包）、`check:cliface`、`check:tuiface`（现 **26** 个包）、`check:vocab`、`check:skills`、`check:pins` 全绿。
- **有意保留的残留（账在这里）**：
  - `README.md` / `README.zh.md` 的节点表与 `assets/readme/nodes.svg`、`hero.svg` 仍带 `rawfilter`。那两个 README 当时正被另一条 lane 改，重出图要过 README 技能 ⇒ 留待那一批落地后处理，不在本次硬碰。
  - `plugins/mvz`、`plugins/classf` 的注释以 rawfilter 的 `dryRun` 分歧当**先例**（6 处）。它们是出处位 prose，照"删它们等于烧掉搬运的账本"（ADR-0010 同一条口径）保留，不改成无出处的一句结论。
  - `scripts/port-ui.mjs` 的搬运名单里仍有 `nodes/rawfilter`——logx 退役时也留在那张表里，先例一致。
- **旧卡片上的残留数据**：`mode:"workflow"` / `workflowDraft` / `workflowLibrary` 会成为孤儿键。不迁移、不写兼容读取，留原样（`workflowLibrary` 已从 `MarkuNodeConfig` 里摘掉）。
- **两条既存红**（与本次无关，但会挡 `pnpm test`）——**2026-10-10 当天已修，修法记在这里**：
  1. HEAD 的 node-sdk 产物里 `registerWithHost` 要 `ctx.inject`（cordis 正典形状：等依赖到位再注册），而 6 个插件的 definition 测试与 `packages/ui-host/tests/{local-runner-e2e,run-progress-wiring}.spec.tsx` 的假 ctx 都没给 ⇒ `TypeError: ctx.inject is not a function` / `xxx 没进 NodeRegistry`。判据：**未改动的 `mvz` 用同一条错复现**；它一直藏着是因为树里的 sdk 产物比 HEAD 旧。**修的是夹具不是被测代码**：手搓的假 ctx 补一条 `inject`（回调交回 `{ get: () => undefined }`——那些用例的判据是工具注册，不是宿主注册表），两个用真 `Context` 的 spec 则把 `xaihiNodeRegistry` 服务 provide 进去。
  2. `packages/node-sdk` 的 typecheck 在 HEAD 就红：`operations.ts` 的 `preview(payload: unknown)` 对上 `define-node.ts` 里 `...p` 的展开（`TS18046`/`TS2698`）。修法是在 `define-node.ts` 那一层**先收窄再取 `message`**（载荷形状由节点决定，所以 `unknown` 是对的，假设形状的是调用方）。
  - 另有一条**属于另一条 lane 的在途红**：`packages/ui-host/tests/surface.spec.tsx` 期望清单里的 `core.uiBundleDir` 原因，实际拿到"还没读到宿主清单"——那份 spec 依赖的 `components/workspace/*` 与 `store/workspace/*` 当时正在被另一条 lane 改，未动。
