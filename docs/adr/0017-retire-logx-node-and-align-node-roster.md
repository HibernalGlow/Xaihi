# ADR-0017 · 节点名单对齐 Rust 最终清单：退役 logx 与旧节点，命令行统一去掉 x 前缀

- 状态：接受（2026-10-07 使用者指令）
- 决策人：使用者、HibernalGlow
- 相关：`docs/adr/0006-ui-source-is-xiranite.md`、`docs/adr/0010-brand-is-xaihi.md`、`docs/adr/0015-kisaki-engine-is-a-pinned-czkawka-rust-core-in-a-subprocess.md`、`<Xiranite>` commit `c23058ab` / `8a84eb2a`

## 背景

1. **节点清单的历史分叉**：
   在 `<Xiranite>` 经历 Rust 内核重构与精简后，使用者对节点做过最终筛选与裁定（见 `<Xiranite>/docs/xiranite-target-node-manifest.json` 与 commit `c23058ab` / `8a84eb2a`）。早期的一批实验性或出局节点（如 `lorat`、`audiov`、`comfygure`、`coveru`、`envuconfig`、`jellypot`、`kavvka`、`movea`、`owithu`、`seriex`、`snf`、`soundw`、`synct`、`transq`、`arcthumb`）已在基线中被物理删除，最终保留名单收敛为 **27 个节点**。
2. **`logx` 节点的过时性**：
   `logx` 是上游桌面端用于分析本地 JSONL 结构化日志的独立观察器面板。但在跑在 DeepSeek Harness (DSH) 上的 Xaihi 架构中：
   - DSH 拥有自己的日志与调试跟踪机制。
   - Xaihi 的运行流由 `packages/core` 的 operations stream、checkpoint 与耐久 ledger 负责。
   - `logx` 在独立命令行缺少 `ctx.fs`，在宿主中也无实际使用场景，属于旧架构残留，在 Xaihi 中已完全用不上。
3. **命令行前缀的历史误解**：
   在最初搬迁时，为了贴合 ADR-0010「品牌自称一律 Xaihi」，曾给每个节点的独立 bin 加了 `x` 前缀（如 `xlinedup`、`xcleanf`、`xsleept`）。然而使用者最终筛选的最新规范为：**命令行名称统一保持纯正节点名，不带 `x` 前缀**（即直接是 `linedup`、`cleanf`、`smartzip` 等）。

## 决定

1. **物理删除 `logx` 节点**：
   - 彻底删除 `plugins/logx` 与 `packages/ui-host/src/nodes/logx`。
   - 从 `packages/cli/package.json` 依赖表与 `packageModules.generated.ts` 中移除。
   - 使用 `scripts/gen-cli-registry.mjs` 与 `scripts/gen-node-registry.mjs` 重新生成注册表。
2. **节点清单锁定为最终筛选的 27 个保留节点**：
   - `bandia`, `bitv`, `classf`, `classq`, `cleanf`, `crashu`, `dissolvef`, `encodeb`, `enginev`, `findz`, `formatv`, `gifu`, `kisaki` (原 czkawka), `linedup`, `linku`, `marku`, `migratef`, `mvz`, `nameu`, `rawfilter`, `recycleu`, `repacku`, `samea`, `sleept`, `smartzip`, `timeu`, `trename`。
   - 任何不在清单中的旧节点（`logx`, `lorat`, `arcthumb` 等）一律不引入。
3. **命令行 bin 统一去掉 `x` 前缀**：
   - 各节点的 `package.json#bin` 声明由 `"x<id>": "./lib/cli.js"` 改为 `"<id>": "./lib/cli.js"`。
   - `nodeCliName(id)` 返回裸 `<id>`（`NODE_CLI_PREFIX = ""`）。
   - 聚合 CLI 与各节点自身的帮助文档、用例文案、单测断言同步更新为不带 `x` 的标准形态。
4. **终端交互契约明确归属**：
   - 交互引导流（guided / `gd`）必须且只能使用 `@clack/prompts`。
   - 终端全屏交互界面（TUI / `ui`）必须使用 `@opentui/core` / `@opentui/react`。
   - 安装依赖并保证两者在真实运行时与门禁下均可正常执行。

## 后果

- 节点注册表由 26 个 CLI 条目收敛为 25 个真实具备 CLI 的节点（加上无 bin 的 `findz` 和 Rust 规划的 `kisaki`，全集保持 27）。
- 命令行调用更加自然简洁（如直接在终端使用 `linedup filter --help`、`cleanf preview`）。
- 彻底消除了过时节点对主仓构建与测试链的干扰。
