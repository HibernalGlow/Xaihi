# 阶段报告 · 机器半边的源码归位（Rust 进插件、Go 进插件、构建编排留仓根）

日期 2026-10-08｜批次归属：本会话（GitButler lane `native-source-ownership`）｜对应决定：ADR-0015 的 2026-10-08 修订、ADR-0004 同批修订、ADR-0010 同批修订

## 一、改了什么

| 落点 | 内容 | 实测 |
|---|---|---|
| `plugins/kisaki/native/{core,node}` | 从只读真源 `Xiranite/native/czkawka-{core,node}` 搬来的 Rust：27 个文件 / 4963 行，含 `Cargo.toml`、`build.rs`、`test-fixtures/placeholder_cover.jpg` | crate 名改 `xaihi-kisaki-core` / `xaihi-kisaki-node`；除两处 `set_config_cache_path`（已点名保留）之外 `xiranite` 在非注释位置命中 **0** |
| `Cargo.toml`（仓根，新） | Rust 构建编排层：`members = ["plugins/kisaki/native/core", "plugins/kisaki/native/node"]`、`resolver = "3"`、`[profile.release]` 逐字沿用基线（`lto`/`codegen-units = 1`/`strip`） | 根上 `cargo metadata` 回成员两枚、`target = <仓根>/target`；从 `plugins/kisaki/native/node/` 里读同一条命令回 `workspace_root = <仓根>` ⇒ 插件目录内单独构建也共用一份 target |
| `Cargo.lock`（仓根，新） | 基线那份，5112 行 / 528 个 `name = ` 条目；只把两枚自有 crate 名改掉 | 不重解版本（沿用已跑通的 lock，避免把别人跑通的版本降回去） |
| `plugins/findz/native/` | `native/findz-go/` 整树搬进插件（Go 内核） | 25 个文件移动前后 sha256 集合**逐字节相等**；与基线 `<Xiranite>/native/findz-go` 的差异仍是原有 6 条（本地新增 README/host/probe/singleton 与 `ffi.go`、`go.mod` 两处已申报改动） |
| `.gitignore` | 加 `/target/`（基线实测 1.2 GB）；产物那条从 `/native/*/dist/` 改成 `/plugins/*/native/dist/` | 现读 14,864,034 字节的 `findz-host` 就在新址，`.gitignore` 认它 |
| `native/artifacts/manifest.json`（新，生成物） | 那两份预编 `.node` 第一次有账：6 条，含 `lstat` 口径的符号链接两条（34 / 31 字节 target 名长度）与两份货的 sha256（`c57e7b648279…` / `f093b7f95b87…`） | 生成器 `scripts/gen-native-manifest.mjs` 与校验器 `scripts/check-native-manifest.mjs` 共用同一份取数函数；连跑两次清单字节相同（幂等实测） |
| `scripts/build-kisaki-native.mjs`（新） | ADR-0015 决定 4 那条「构建入口不许是 bun」的等价物：`cargo build --release -p xaihi-kisaki-node` → 按平台命名暂存 → dlopen 探针 → 与仓里预编那份逐条比能力集。**默认不覆盖在用的货**，翻链接要 `--install` | 冷编 rc=0 / 45.4 s，产物 21,443,856 字节 `d2f8fecb0b46…`，暂存 `native/artifacts/darwin-arm64/builds/d2f8fecb0b46/` |
| `docs/adr/0015-…`、`docs/adr/0004-…`、`docs/adr/0010-…` | 三份修订：落点决定改写；品牌尺的落盘数据例外逐地点名（带 reason/unlock） | 历史引用原文未删（那是出处账本） |

## 二、为什么

- 使用者裁定：`一切皆插件` 按**源码所有权**读，机器半边归节点；构建复用是另一层，不与所有权绑定。
- 两条 Cargo 事实把可选形状收窄到只剩一个：
  ① workspace 成员必须在根的子树**之内**——把编排放 `native/Cargo.toml` 再指 `../plugins/…` 实测被拒
  （`error: workspace member … is not hierarchically below the workspace root …`）；
  ② 不接 workspace 时从 crate 目录读 `cargo metadata` 得到 `target_dir = <crate>/target`，
  即「每插件各长一个 1.2 GB target」那条担心的真实成因。仓根那份同时解掉两条。
- Go 那一侧不进 Cargo：`go env GOCACHE` 回 `~/Library/Caches/go-build`，跨模块本来就共享，没有 target 要合并；统一的是所有权。
- 借用能力走 cordis 服务名而不是 crate path 依赖（排第二批），因为跨插件的 path 边是注册表与 `check:installable` 看不见的私边。

## 三、与 DSH API 的关系

- 本批**没碰运行时**：`.node` 仍在宿主进程内被 `createRequire` 装载（`plugins/kisaki/src/native/index.ts:93-102`），
  仍是 ADR-0015 决定 2 想改掉的那条边。
- 第二批要用的现成先例（同仓、已落地）：跨包服务名共享 `packages/node-sdk/src/node-registry.ts:156`
  与 `packages/core/src/index.ts:62,398`（`provide` 表 + `ctx.provide(...)`），消费者侧 `plugins/*/src/index.ts:45` 那条
  `inject = ['tools', 'subprocess', …]` 是子进程通路的现读形状（findz 已按 `ctx.subprocess` 起 `findz-host`）。
- 门禁关系：`check:pins` rc=0、`check:installable` rc=0（30 个 bundle 包，例外 1）、`check-skills` rc=0。
  `check:brand` 扩了 `.rs`/`.toml` 之后实跑 rc=1：命中 1281 条，其中本批的 Rust 只剩账上那 2 条（放行且点名），
  其余 1279 条在 `packages/ui-host`(1111) / `packages/api`(29) 等搬运树里，是本批之前就有的——这把尺照 AGENTS.md 故意还没接进 CI。

## 四、读数与负面事实（都带 rc 与真实输出）

| 判据 | 命令 | 读数 |
|---|---|---|
| Rust 自己的测 | `TMPDIR=/private/tmp/… cargo test --release --no-fail-fast -p xaihi-kisaki-core -p xaihi-kisaki-node` | rc=0；三档读数 `13 passed` / `4 passed` / doc-test `0 passed`，**0 failed** |
| 那条一开始的红是不是搬运造成的 | 默认 TMPDIR 下同一命令 | rc=101，`basic_bad_names::returns_a_proposed_target_without_renaming_the_source` 败在 `assertion failed: proposed.parent()…eq_ignore_ascii_case`；把 TMPDIR 换成已规范化的 `/private/tmp/…` 同一条**过** ⇒ 是 macOS `/var` → `/private/var` 那条符号链接（`TempDir::path()` 给 `/var/…`，内核回 `/private/…`），与搬运无关 |
| 新编的那发能不能替在用的那份 | dlopen 两侧读 `getCzkawkaInfo()` | 都 `api=5 source=12.0.0 exports=14 caps=20`，能力集**缺 0 多 0**，导出名集合相同 |
| 真跑一轮扫描的等价性 | 同一份临时夹具（1 空文件 + 2 同内容文件）三种工具 × 两份产物 | 新编 `empty=["empty.txt"] big=["one.bin","two.bin"] dup=[["one.bin","two.bin"]]`，预编逐字相同；`两份等价=true／夹具非空=true`（第一版探针读 `r.groups` 当 empty-files 的形状，得到「空集对空集」的假绿，已按 `binding.generated.d.ts:34-38` 的 `{entries,messages,stopped}` 改正） |
| 清单尺看得见违规 | `node scripts/check-native-manifest.mjs --self-check` | rc=0，五种扰动（换货／记错尺寸／盘上多文件／记了没货／链接变实体）各红一条 |
| 品牌尺看得见违规 | `node scripts/check-brand.mjs --self-check` | rc=0；六种形状含 `.rs` 字面串、`.rs` 注释放过、`Cargo.toml` 的 crate 名，加申报三条路（在场放行且点名／过期申报红／未点名命中红） |
| findz 那侧的测 | `plugins/findz` 内 `npx vitest run` | rc=1：`8 failed | 58 passed (66)`，红在 `command.spec.ts`(3) 与 `definition.spec.ts`(5)，报 `TypeError: ctx.inject is not a function`。归因：**不是本批**——`command.spec.ts` 我没碰，`definition.spec.ts` 只改了一行注释；未提交区里另一条 lane 正批量改 27 个 `plugins/*/package.json`（`but status` 现读），那条 cordis 迁移与本批无因果关系。我改到的 `kernel.integration.spec.ts`（内核新址那条）不在失败清单里 |

## 五、还没做（明确列出，不算完成）

- ADR-0015 决定 2 的子进程那条腿**未接**；`kisakiNative` 服务边未立（第二批）。
- win32 那档仍是基线预编货，没在本机重编（要在 Windows 那台机上跑同一入口）。
- 平台包 `@hibernalglow/xaihi-kisaki-<triple>`（决定 3）仍未发；`native-asset.ts:63` 那条指向姊妹仓的绝对路径回退**留着**，只在这台机成立。
- `set_config_cache_path("xiranite", …)` 的改名等使用者拍迁移方案；账上两条带 unlock 条件。
- 暂存产物 `builds/<sha12>/` 不在清单里（`walkFiles` 明写跳过），它的账在 `BUILD-INFO.json`；`--install` 之后要不要把它并进清单，等第二批一起定。
