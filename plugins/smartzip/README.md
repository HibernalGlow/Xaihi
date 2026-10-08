# @hibernalglow/xaihi-smartzip

Xaihi 节点 SmartZip：TypeScript 写的归档工作流，自己找 7-Zip（不要 SmartZip.exe，也不要 AutoHotkey）。

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义。
  定义只有一份真源：`src/index.ts` 用 `createRequire` 读自己这一份，词表逐字抄自
  `<Xiranite>/node-definitions/smartzip.json`（六条动作、七条字段、七条绑定、危险闸门都在里面）。
- `cordis.patch.yml`：自带一行（插件即 bundle）。
- `src/core.ts`：内核，逐字搬基线 tag `noxide` 那份 455 行（尺：`node scripts/check-verbatim.mjs --only smartzip`）。
- `src/platform.ts` + `src/exec.ts`：内核那 6 个 DI 方法的落地——文件系统与 ZIP 字节层走 `node:fs`
  （ADR-0003 决定 1），起 7-Zip 走 DSH 的 `ctx.subprocess`。
- `src/index.ts`：`defineNode` 接线。危险动作（`extract` / `extract_codepage` / `open` / `archive`
  且预演没开）由清单变成 DSH 的 `ask`，进度与预览走 xaihi-core 的 `OPERATIONS_SERVICE` 账本。
  上游 `[nodes.smartzip]` 那六个默认值在这里声明成 `Config`（ADR-0013），值由 DSH 的 patch 层给。
- `src/cli.ts` + `src/help.ts` + `src/cli-support.ts`：终端面，`bin` = `smartzip`。
  这一面**不在宿主进程里**，够不到 `ctx.subprocess`，于是：`status` 与四条执行动作的
  `--dryRun` 计划是真跑的；要碰 7-Zip 的那几条一律退出码 1 并点名缺的那条服务
  （`ui` / `gd` / `guided` 三条交互腿未接，退出码 2）。
- `frontend/`：**还是脚手架那块面板**（一个 target 输入框），没接这份定义的六个动作；
  一方节点界面目前也还没有消费者（`docs/adr/0014-first-party-node-ui-in-realm.md`、台账 G9）。

本仓内开发：`pnpm -r run build`，然后在仓根 `pnpm plugin:add "file:$PWD/plugins/smartzip"`
（宿主与 profile 的口径见 `.dsh/skills/xaihi-plugin-development/SKILL.md`）。
