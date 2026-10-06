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
| 0002 | **已落地并实机验过**：页面递来的 `window.open` 先过一条纯 URL 判策，自家文档才转成原生次级窗（E 段：`popup=null` 而原生窗恰好出来一个；自家非文档路径的 `window.open` 不长窗。外链那条只走单元用例——它的命中分支是 `shell.openExternal`，活体跑会真打开使用者的浏览器） | 新模块 `apps/desktop/src/xaihi-window-policy.ts` + `main.ts:239-242` 的 `setWindowOpenHandler` 接线 | P5 |
| 0003 | **已落地**：`XAIHI_DESKTOP_PROFILE` 让壳选 profile，缺省仍 `desktop`，形状不合直接抛 | `apps/desktop/src/paths.ts`（`resolveDesktopProfileName`） | P6 第 1 条 |

| 0004 | **已落地**：同一个 node 的窗按寻址键去重（重复请求聚焦既有窗并回报 `alreadyOpen`），换 node 才多开；窗标题带 node 名（标题在运行时才保住要靠 0006） | `xaihi-window-policy.ts` 的 `xaihiWindowKey` + `main.ts` 的登记表（两条开窗路汇一处） | 无（我们的产品行为） |
| 0005 | **已落地**：`xaihiWindow.open` 的发起者放宽到"任一活着的自家文档窗"，目标 URL 改从发起者自己的文档取；四条形状守卫一条不松 | `main.ts` 的 `xaihiOwnedSender` + 那条 IPC handler（原来是 `assertProductSender`，主语只有主窗） | P5 的续条（官方壳没有"次级窗再开次级窗"这一层） |
| 0006 | **已落地**：自家文档窗保住带 node 的标题（拦住 `page-title-updated`） | `main.ts` 的 `openXaihiDocumentWindow` | 无（读回面；标题是使用者辨认窗口的唯一线索） |

| 0007 | **已落地**：产品文档可以替**被嵌在自己里面的** Xaihi 帧转达开窗（Electron 44 的 preload 不进子帧，`HandlerDetails` 又没有"哪一帧发起的"，所以 `window.open` 那条路在嵌入形态下量到的是 0 个窗）。带路径时只有主窗这一支被接受，路径必须过壳自己的路由形状；不带路径时行为与 0005 逐字相同 | `main.ts` 的 `xaihiWindowOpen` handler（新增 `isMainDocument && documentPath !== undefined` 分支）+ `ipc.ts` 的 `open(node, documentPath?)` 类型 + `preload-app.ts` 透传 | P5 的续条（原样抄在 `docs/upstream-proposals.md`） |

0001–0007 已落地；活体判据在 `desktop/live-check.mjs`（**42 条全绿**：R 段复位、A 段产品文档面与拒绝分支、
B 段真 Xaihi 文档进第二窗、C 段按 node 去重与标题、D 段"主窗只是隐藏时节点窗仍能继续开"加守卫没跟着放宽、
E 段页面自己 `window.open` 走原生窗且弹出窗没长出来、F 段决定 4 的退化读回真上屏（含 iframe 反向对照）、
H 段产品文档转达开窗 + 三条边界对照）。判据都在 `node desktop/sync-dsh.mjs --verify`：
0001 查 IPC 通道 + 产物两份文件；0002 查 11 条用例（**拒绝分支才是重点**：路径穿越、跨 host、
非自家发起者、多带查询键、超长串）+ 0003 三条 profile 用例 + 0004 去重键用例；产物判据现在要
`lib/main.js` 里同时有 `resolveXaihiDocumentTarget` **和** `xaihiWindowKey`（少一个就是只跑了 tsc 没跑 bundle），
0005/0006 各查一处接线（`xaihiOwnedSender` / `openXaihiDocumentWindow` 函数体里的 `page-title-updated`）。
0006 那条还配减法对照：把那行从函数体切片里抹掉，判据必须变红。
摘掉 patch 跑 `--verify` ⇒ rc=1（不是空转）。Xaihi 侧的落地位置已经在 `/xaihi/ui` 路由 +
节点寻址参数上（Xaihi 提交 `0e4b61b`，`packages/core/src/routes.ts:101`）。
