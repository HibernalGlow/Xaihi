# @hibernalglow/xaihi-bitv

脚手架生成的 Xaihi 节点包。五件事各自有出处：

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义
- `cordis.patch.yml`：自带一行（插件即 bundle）
- `src/index.ts`：`defineNode` 接线，危险闸门交给 DSH 的 approval 缝
- `frontend/`：自带 UI 产物（`dist/remoteEntry.js`），React 由宿主提供
- `src/cli.ts` + `src/help.ts` + `src/cli-support.ts`：终端面（`bin` = `bitv`），四条动作
  `status` / `analyze` / `classify` / `report` 都在面上，但**一律拒绝执行**（退出码 2）：
  内核要跑的 ffprobe 一律经 DSH 的 `ctx.subprocess`（`src/platform.ts`），独立 bin 不在宿主
  进程里、够不到那条缝（缺口 G1/G6 那一类）。真跑用宿主侧的 `bitv_*` 四个工具。
- `src/core.ts` + `src/platform.ts` + `src/contract.ts`：`noxide` 基线那份 683 行内核逐字搬入，
  文件那一格走 `node:fs`（ADR-0003 决定 1），外部程序那一格走 `ctx.subprocess`

本仓内开发：`pnpm -r run build` 之后 `dsh plugin --profile xaihi add file:$(pwd)`。
