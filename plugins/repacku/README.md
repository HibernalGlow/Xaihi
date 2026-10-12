# @hibernalglow/xaihi-repacku

脚手架生成的 Xaihi 节点包。五件事各自有出处：

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义
- `cordis.patch.yml`：自带一行（插件即 bundle）
- `src/index.ts`：`defineNode` 接线，危险闸门交给 DSH 的 approval 缝
- `frontend/`：自带 UI 产物（`dist/remoteEntry.js`），React 由宿主提供
- `src/cli.ts` + `src/help.ts` + `src/cli-support.ts`：终端面（`bin` = `repacku`）。
  内核（`src/core.ts`）沿用 `noxide` 基线，`analyze` 与任何动作配
  `--dryRun` 在 bin 里**真跑**（只读目录 + 写一份 config JSON）；需要压缩程序（7-Zip /
  PowerShell `Compress-Archive`）的那一路在 bin 里**响亮拒绝**（退出码 2），理由点名缺的
  那条缝：DSH 的 `ctx.subprocess`（Provider `dsh-subprocess-local`），它只接在 `src/index.ts` 里

扫描的最小打包单位沿用预设规则。例如 `already/图集/85 张图片` 会生成同级的 `图集.zip`。
`preserveRoot` 默认 `false`，图片直接在归档根；设为 `true`，则为 `图集.zip → 图集/ → 图片`。
分析 JSON 默认写到扫描根的同级；扫描和压缩都排除本目录及直接子目录的默认生成配置。

压缩通过 DSH 的 `ctx.subprocess` 调用 7-Zip，使用 `-y`，不调用 PeaZip GUI。
本机也已验证 PeaZip 自带的后端，可将 DSH 设置中的 `sevenZipPath` 配为
`/Applications/PeaZip.app/Contents/MacOS/bin/7z/7z`；其它平台需要指向当地实际安装的 7z/7zz。
Windows 的 PowerShell 兜底通过临时布局保持相对目录和根目录选择，会额外复制待压缩文件。
后端退出码非零或未生成非空归档时，保留来源文件。验证范围见
`docs/stages/repacku-silent-gallery-2026-10-13.md`。

本仓内开发安装通过隔离宿主脚本 `pnpm plugin:add`，避免混用日常宿主的会话和配置。
