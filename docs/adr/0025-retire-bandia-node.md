# ADR-0025 · 退役 bandia 节点

- 状态：接受（2026-10-10 使用者指令：`bandia` 不再维护）
- 决策人：使用者、HibernalGlow
- 相关：`docs/adr/0017-retire-logx-node-and-align-node-roster.md`（同一套退役流程）、`docs/adr/0023-retire-rawfilter-and-marku-drops-the-flow-workflow.md`（同一天的上一次退役，清单逐条照抄）

## 背景

1. **使用者裁定 `bandia` 不再维护** ⇒ 整个节点退役。它依赖外部 Bandizip（Windows 工具），本机从来没有可验证的实机路径：本轮的界面缝复查里，它的动作只能跑到"归档不存在"那一类**参数级**判定，真解压/真压缩一次都没在宿主里跑成过。
2. **两条与它相关的发现随退役作废**（记录在此，避免下一个人再去追）：
   - `useTrash`（ADR-0024 第 7 条）：清单没有这条字段、卡片有开关 ⇒ 那次"关掉回收站不生效"的修复**只做到 code-verified**，节点删掉后这条缺口不存在了。
   - `stop`（ADR-0024 第 9 条）：内核 `BandiaAction` 有 `stop`、清单没有，是上游自带的分歧、被两处测试钉着，界面那个"停止"按钮因此永远回 `no handler for action "stop"`。**这条两难随节点退役一起消失**，不需要再拍。

## 决定

照 ADR-0017 / ADR-0023 同一套流程退役，一步不少：

1. 删 `plugins/bandia` 与 `packages/ui-host/src/nodes/bandia`（两侧同批：`gen-node-registry.mjs` 是按"界面目录 × 插件清单"配对算的，单边删会被它记成 skipped）。
2. 从 `packages/cli/package.json` 的依赖表、`packages/ui-host/src/lib/hazardMode.ts` 的 `DRY_RUN_MODULE_IDS`、两份 locale 的 `bandia` 段（各 109 行，按花括号配对删并复验 JSON 可解析）、`packages/ui-host/tests/node-mount.spec.tsx` 的 `REGISTERED` 名单里摘掉。
3. `packages/ui-host/src/components/workspace/AlphabetNodeRail.test.ts` 的"按首字母分组"用例原来断言 `b` 里有 `bandia` ⇒ 改成还活着的 `bitv`（那条尺的判据是"字母映射到已登记节点"，不是"必须有 bandia"）。
4. 重跑 `scripts/gen-node-registry.mjs` 与 `scripts/gen-cli-registry.mjs`（**不手改生成物**）。
5. 开发 profile 用 `pnpm plugin:remove @hibernalglow/xaihi-bandia` 摘掉那一行（那条 `link:` 指着即将消失的目录，留着会锁死后续所有 profile 安装）。

## 后果

- **节点全集 26 → 25**（`packageModules.generated.ts` 的注册条数实测，生成器自己的输出是"25 个界面目录 → 25 条注册"）；**带 bin 的 CLI 条目 25 → 24**（`gen-cli-registry` 现读）。
- 门禁读数（2026-10-10）：`check:noderegistry`、`check:cliregistry`、`check:installable`、`check:nodebundle`（现比 **25** 个节点包）、`check:cliface`、`check:tuiface`、`check:vocab`、`check:skills`、`check:pins` **全 rc=0**。
- 构建与投递：`pnpm -r run build` rc=0、`pnpm plugin:install` rc=0、宿主重启后 `/xaihi/manifest.json` 现读 **25 个插件、无 `bandia`、无 `rawfilter`**；`POST /xaihi/runner {nodeId:"bandia"}` 回 `Node "bandia" is not registered in local NodeRegistry`；回归探针 cleanf（界面形状 ⇒ `success`，9 项）与 marku（`text` ⇒ `Text processed: no changes.`）照常。
- 测试：`packages/ui-host` **56/56 文件通过**（改完 `AlphabetNodeRail.test.ts` 那条之后）。
- **有意保留的残留（账在这里）**：
  - `README.md` / `README.zh.md` 的节点表与 `assets/readme/*.svg` 仍带 bandia（**那两处正被另一条 lane 改**，`assets/readme/` 整个目录还是未跟踪的新产物）⇒ 留待那一批落地后一起处理，与 ADR-0023 同一口径。
  - `plugins/enginev` 的 `contract.ts`/`platform.ts` 以 bandia 当"同源同形"的先例（prose 出处位），`scripts/port-ui.mjs` 的搬运名单里仍有 `nodes/bandia`（logx 退役时也留着，先例一致）——按"删它们等于烧掉搬运的账本"保留。
  - `desktop/README.md` 有 bandia 的历史探针记录；`desktop/` 不进任何门禁扫描根，要改得连探针一起重跑并把数字写回（ADR-0011），本次不动。
- **另一条 lane 的未提交编辑随目录一起消失**：`plugins/bandia/package.json` 里那两行 `icon` / `category`（与本节点一起被删，属预期）。
- 仍与本节点无关的两处既存状态：全仓 `typecheck` 有 **308 条红**分散在 26 个搬运包的 CLI/终端层（`@hibernalglow/xaihi-contract` 解析不到、`exactOptionalPropertyTypes` 等），我改过的文件**一条都没有**；`packages` 那一档 `test:unit` 偶发一条 ui-host 的**未捕获错误**（56 文件 433 用例全过、rc=1，与另一条 lane 的 `workspace-app-render.spec.tsx` 相关），单独复跑为绿。
