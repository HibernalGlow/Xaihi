# @hibernalglow/xaihi-cleanf

脚手架生成的 Xaihi 节点包。五件事各自有出处：

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义
- `cordis.patch.yml`：自带一行（插件即 bundle）
- `src/index.ts`：`defineNode` 接线，危险闸门交给 DSH 的 approval 缝
- `frontend/`：自带 UI 产物（`dist/remoteEntry.js`），React 由宿主提供
- `src/cli.ts` + `src/help.ts` + `src/cli-support.ts`：终端面（`bin` = `cleanf`）。
  脚手架档的动作在 bin 里**只拒绝不执行**（退出码 2，理由点名缺的那条 DSH 服务），
  内核搬进来之后再在 `runHostedAction` 里点亮

本仓内开发：`pnpm -r run build` 之后 `dsh plugin --profile xaihi add file:$(pwd)`。
