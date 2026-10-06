# @hibernalglow/xaihi-repacku

脚手架生成的 Xaihi 节点包。五件事各自有出处：

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义
- `cordis.patch.yml`：自带一行（插件即 bundle）
- `src/index.ts`：`defineNode` 接线，危险闸门交给 DSH 的 approval 缝
- `frontend/`：自带 UI 产物（`dist/remoteEntry.js`），React 由宿主提供
- `src/cli.ts` + `src/help.ts` + `src/cli-support.ts`：终端面（`bin` = `xrepacku`）。
  内核（`src/core.ts`）是从 `noxide` 基线逐字搬来的那份，所以 `analyze` 与任何动作配
  `--dryRun` 在 bin 里**真跑**（只读目录 + 写一份 config JSON）；需要压缩程序（7-Zip /
  PowerShell `Compress-Archive`）的那一路在 bin 里**响亮拒绝**（退出码 2），理由点名缺的
  那条缝：DSH 的 `ctx.subprocess`（Provider `dsh-subprocess-local`），它只接在 `src/index.ts` 里

本仓内开发：`pnpm -r run build` 之后 `dsh plugin --profile xaihi add file:$(pwd)`。
