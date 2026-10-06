# ADR-0003 · 移植内核的文件状态与撤销账本放哪里

- 状态：接受
- 日期：2026-10-06
- 相关：`docs/service-mapping.md`、`docs/adr/0002-self-contained-plugin-packages.md`、`docs/stages/step-4.md` §10/§14

## 背景

批次 C 的 `dissolvef` 是从 Xiranite 的 `noxide` 基线（commit `ccf465fe`，即 tag `noxide`
的提交对象）逐字移植的 915 行内核。它有两个和宿主绑定的假设：

1. 文件读写直接用 `node:fs/promises` 与 `node:child_process`（通过一个 13 个方法的
   `DissolvefRuntime` 依赖注入缝暴露，不是散落各处）。
2. 撤销账本落在**它自己的配置目录旁边**：
   `join(dirname(resolveXiraniteConfigPath()), "artifacts/undo/dissolvef.undo.json")`。

DSH 两边都不给：

- 文件系统缝 `ctx.fs` 存在，但它的效果策略是给**模型面的工具调用**用的；文档原话是裸缝
  "complete, unconstrained"，`writeText` 的 `sandboxPolicy` 可选而 bare backend 忽略它
  （`docs/subsystems/filesystem.md:7,410,425`）。而且它要求把路径收成不透明
  `FsTarget`、明令"不得解析 `targetKey`、不得假设它是本地绝对路径"（`filesystem.md:13,296`）
  ——对一个要算相对位置、要 `rename`/`rmdir` 的目录归并内核是反向工作。
- **没有"每插件数据目录"这个 API**：`ctx.path` / `ctx.home` / `ctx.storage.dir` 全仓零命中，
  home 只是配置项（`$DSH_HOME`，否则 `~/.dsh`），json 后端的 `root` 故意没有默认值，
  文档说明理由是"回落到 `process.cwd()` 会把 unit 文件撒得到处都是"
  （`docs/config-catalog.md:1972-1974`）。

## 决定

1. **内核继续用 `node:fs`（移植版 `platform.ts`），不改写成 `ctx.fs`。**
   理由不是"方便"，而是 `ctx.fs` 的设计对象是模型发起的工具调用；节点内核的进程内文件操作
   不是它的用例，硬套会把一个可审计的 DI 缝换成一个禁止解析路径的不透明句柄。
   权限边界因此**不靠 fs 层**，而靠动作分级：`dissolve` / `undo` 在 `xaihi.node/v1` 里
   声明为危险，经 `defineNode` 变成 DSH 的 `ask`，审批与审计全在宿主。
2. **撤销账本路径必须由配置显式给出**（`Config.historyPath`，默认空串）。
   没给时：`plan` / `history` 照常，`dissolve` 在**动手之前**抛错拒绝，
   而不是"先搬完文件再把账本写进一个没人知道的地方"。
   这是与基线唯一的实质行为差异，写在 `platform.ts` 的注释里。
3. **运行历史与检查点仍然走 DSH 的 `ctx.storageDomain`**（`docs/stages/step-4.md` §10）。
   两者不冲突：undo journal 是**要被旧 Python 工具继续读写的文件**（域语义，属于节点），
   运行账目是"这个节点跑过什么"的查询面（属于工作台）。所以一个是文件、一个是存储域，
   各归各处，不合并、不互相冒充。

## 备选择

- **改成 `ctx.fs`**：一致性最好，但需要先解决"内核要算路径、要 rename/rmdir、要 `execFile`"
  与"不得假设本地绝对路径"的矛盾；等于为了合规重写内核，正是移植最不该做的事。
- **账本进 storage domain**：查询面统一了，但会丢掉与既有 undo journal 的互操作
  （基线的 `run-legacy-undo` 就是吃这份 JSON 的，移植测试里也钉着这条）。
- **默认写到 `process.cwd()` 附近**：被 DSH 文档自己点名批评过的做法，排除。

## 后果

- 正面：内核保持逐字可对比（差异只有历史路径那一处，且是显式拒绝而不是隐式乱写）；
  危险动作的把关仍完全在宿主。
- 负面 / 待还：`historyPath` 目前要求使用者自己写配置，界面上**还没有填它的地方**；
  等设置面（`contributes.settings` 的渲染）落地时补上。另外若 DSH 将来给插件进程加上
  文件系统策略，本决定要重新评估——那时 `platform.ts` 是唯一需要动的文件，
  因为内核只认那 13 个方法。
