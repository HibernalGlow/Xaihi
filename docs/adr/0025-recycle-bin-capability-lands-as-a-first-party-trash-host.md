# ADR-0025 · 回收站能力（缺口 G10）的交付形状：自有 `trash-host` 子进程 + 系统回收站语义

- 状态：接受（2026-10-10，使用者在两条语义里选了①"移入系统回收站"）
- 决策人：使用者、HibernalGlow
- 相关：`docs/adr/0004-non-js-core-delivery.md`（非 JS 内核 → out-of-process 子进程 + 每平台一个可选依赖包）、
  `docs/adr/0002-self-contained-plugin-packages.md`、`docs/adr/0011-desktop-shell-is-a-sibling-vendor-repo.md`（决定 4：退化必须在界面上读得回来）、
  `docs/adr/0013-config-goes-through-dsh-settings.md`（耐久数据走 storage domain）、
  `docs/adr/0015-kisaki-engine-is-a-pinned-czkawka-rust-core-in-a-subprocess.md`（napi/rayon 不进宿主）、
  `docs/adr/0024-input-seam-accepts-both-shapes.md`（同一天的界面缝复查）

## 背景（实测，逐条带出处）

| 事实 | 出处 |
|---|---|
| cleanf 的非预演路径在**碰任何文件之前**被 `undoState().trashRestore === false` 拒掉 | `plugins/cleanf/src/platform.ts` 的文件头、`:223`、`:260-265` |
| 要复刻的上游语义是"移入系统回收站 + 可撤销批次"，不是自建隔离区 | 同上；以及**已经发给使用者**的那句话：`plugins/cleanf/package.json#xaihi.node.dangerPrompt`「匹配到的文件和目录将移入系统回收站，之后可撤销恢复」 |
| 跨平台"移入回收站"的库**已经在我们的依赖图里**：`trash` 5.2.6，由 `czkawka_core` 12.0.0 带进 `Cargo.lock` | `Cargo.lock`（`czkawka_core` 的 dependencies 列表里有 `trash`） |
| 仓里**已经有一份** trash 包装：4 个动词 + 能力自报 | `plugins/kisaki/native/node/src/trash_api.rs`（`get_trash_capabilities` / `trash_path` / `list_trash_items` / `restore_trash_item`），生成绑定 `plugins/kisaki/src/native/binding.generated.d.ts:155,157,244,271` |
| 但 macOS 上 list/restore 在**库这一层**就不存在：`os_limited` 的 cfg 是 `windows \| unix(非 macos/ios/android)` | 本机 `~/.cargo/registry/src/*/trash-5.2.6/src/lib.rs` 的 `os_limited` 模块与其文档句 "only supported on Windows and Linux or other Freedesktop Trash compliant environment" |
| macOS 的落点信息**本来拿得到，只是被丢掉**：`trashItemAtURL_resultingItemURL_error(&url, None)` 第三个实参是 `None` | 同上 `src/macos/mod.rs:100` |
| 小文件洪泛有真实代价：Finder 会**逐条枚举** `~/.Trash` 来维护体积与 Dock 角标 | `ai-trash` 的 README retention 段（2026-10-10 现读 `raw.githubusercontent.com/forethought-studio/ai-trash/main/README.md`） |

## 决定

1. **语义 = 系统回收站**。文件进 OS 回收站，Finder/资源管理器自己的"放回原处"照常可用，我们另给一条自己的撤销。
   **边界必须写在界面上**：使用者手动清空回收站 = 真丢；我们不复制字节（不做隔离区，见"明确不采用"）。
2. **不新增 in-process 原生依赖**：交付一个**自有小 bin** `xaihi-trash-host`，stdio 上行 JSON 帧协议，
   由节点经 `ctx.subprocess` 拉起。理由与 ADR-0004 决定 1、ADR-0015 决定 2 同源：
   native panic 的故障半径是整个宿主进程。
3. **平台分支**：macOS 走 `trashItemAtURL` 并**接住 `resultingItemURL`**（落点名让系统算：撞名改名与跨卷
   `<卷>/.Trashes/<uid>` 都由它处理）；Windows/Linux 直接用 `trash::os_limited::{list, restore_all}`。
   能力自报**照抄** `get_trash_capabilities()` 的形状（`delete_to_trash/list/restore/provider/provider_version`），
   缺哪一条就如实报缺，不静默降级（ADR-0011 决定 4）。
4. **账本只记账，不存字节**：一次运行 = 一个批次（`operationId` + 每条的 `{原路径, 回收站落点, 删除时间, 大小}`），
   落在 DSH 的 storage domain（`xaihi_*`，ADR-0013 的耐久数据那条）。键名借 `ai-trash` 的实测设计
   （`original-path` / `deleted-at` / `deleted-by` / `original-size`），并且**把同样的元数据写到文件自己身上**
   （macOS/Linux 扩展属性），让"这个回收站条目原来是哪儿的"跟着文件走。
5. **小文件洪泛要有闸**：批次按**条数上限 + 宽限期**（借 `ai-trash` 的实测对策）。
   cleanf 的预设恰好是海量小项（空文件夹、`[#hb]` 文本、日志、`.upbak`），没有这条闸就会把使用者的 Finder 拖慢。
6. **不从 cleanf 依赖 kisaki 节点**：ADR-0002 的自包含约束（`check:installable`）与 ADR-0015 的进程边界都在。
   Rust 源码另起一份（`native/trash-host/`），**复用那份逻辑的形状与 `trash` 这个库**，不复用 kisaki 的 21 MB napi 引擎
   （它带 napi/rayon/libavif，对"删一个空文件夹"是三个数量级的过量）。

## 后果

- 正面：cleanf 的 `trashRestore` 这一格第一次能报 true；Windows/Linux 的"可恢复"由库直接提供，
  macOS 由 `resultingItemURL` + 批次账本提供；同族节点共用同一条座（`bandia` 的 `useTrash` 今天是个读不回来的死控件、
  `timeu`/`recycleu` 同族）。
- 负面 / 待还：
  1. **ADR-0004 决定 3 的"每平台一个可选依赖包"在本仓还没落地**（`findz` 也没有 `optionalDependencies`）。
     本轮交付走**仓内 `native/artifacts/<triple>/`**，配 `scripts/build-kisaki-native.mjs` 同款纪律
     （暂存 → dlopen/exec 探针 → 只有 `--install` 才翻链接）；平台包与发布流水线仍待定。
  2. 三条平台的构建机问题未定（本机 darwin-arm64 可编；Windows 要 SSH 到 PTEROSAUR；Linux 未定）。
  3. 被 Finder 自己"放回原处"之后，我们的账本会指向一个**已经不存在的**回收站条目 ——
     撤销时要按"条目不在"如实报，不许假装成功。

## 明确不采用

- **自建隔离区（自己存字节）**：它能扛"清空回收站"，但会让 node 清单里**已经发给使用者**的那句话变成假话，
  而且要另定一份落盘格式。使用者 2026-10-10 明确选了另一条。
- **`gomi` / `trash-cli-go` / `ai-trash` 作为底座**：三者的"回收区"都不是系统回收站
  （`gomi` 用自己的 `.trashinfo`；`ai-trash` 在 macOS 上确实进 `~/.Trash`，但它的安装方式是
  **顶掉使用者的 `rm`**：README 原话 "`/usr/local/bin/rm` … is replaced with a wrapper … all `rm` calls … go through it automatically"。
  一个 DSH 节点去改整台机器的删除命令，超出这条架构的边界）。值得偷的只有两条设计：xattr 元数据（决定 4）
  与条数上限 + 宽限期（决定 5）。
- **从 cleanf 调 kisaki 节点**：见决定 6。
- **把清理调度塞进节点**：保留期与定时清空是**另一个**功能（仓里 timer 家族与运行账本已在），不在本 ADR 范围。
