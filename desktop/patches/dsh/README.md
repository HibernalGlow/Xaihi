# patches/dsh/

一条 patch 一个文件，命名 `NNNN-<短 slug>.patch`（`0001-xaihi-document-window.patch`）。
必须是 `git format-patch` 能产出的形状（带 commit message 与作者），这样每条都能回答
"为什么要有它"和"上游落地后该撤哪一条"。

## 规则

- 每条 patch 的 commit message 要指名它对应 `../Xaihi/docs/upstream-proposals.md` 的哪一条
  （P5 / P6），上游接了就在文件名前加 `DO-NOT-USE-` 并删掉，而不是留着当"保险"。
- **不许改插件契约**（ADR-0011 决定 4）：不许要求 bundle 提供只有本壳才读的字段。
- 打不进来的 patch 就是红，不许 `--3way` 蒙过去掉别人的行。

## 计划中的第一批

| # | 目标 | 上游落点（现读行号，会随 rebase 变） | 对应 proposal |
|---|---|---|---|
| 0001 | Xaihi 自有文档的原生窗：一份 `dsh-app` 文档 + 一个窗 | `apps/desktop/src/main.ts:206`（`createWindow`）与 `main.ts:1066`（唯一调用点）；`apps/desktop/src/ipc.ts:8-34` 加 window 通道；preload | P5 |
| 0002 | **已落地**：页面递来的 `window.open` 先过一条纯 URL 判策，自家文档才转成原生次级窗 | 新模块 `apps/desktop/src/xaihi-window-policy.ts` + `main.ts:239-242` 的 `setWindowOpenHandler` 接线 | P5 |
| 0003 | 壳侧 profile 策略（本仓自己定，不再受 `paths.ts:19-20` 写死约束） | `apps/desktop/src/paths.ts`、`apps/desktop/src/project-manager.ts:95`（`lock` 独占） | P6 |

0001 与 0002 已落地，0003（壳侧 profile 策略）未开工。判据都在 `node desktop/sync-dsh.mjs --verify`：
0001 查 IPC 通道 + 产物两份文件；0002 查 11 条用例（**拒绝分支才是重点**：路径穿越、跨 host、
非自家发起者、多带查询键、超长串）+ 新模块进了 `lib/types/` + 判策接进了 `lib/main.js`。
摘掉 patch 跑 `--verify` ⇒ rc=1（不是空转）。Xaihi 侧的落地位置已经在 `/xaihi/ui` 路由 +
节点寻址参数上（Xaihi 提交 `0e4b61b`，`packages/core/src/routes.ts:101`）。
