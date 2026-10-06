# kisaki 引擎的两条实测：mac 能不能编能跑，`-api5` 到底钉住了什么

本文件量的是 `docs/adr/0015-kisaki-engine-is-a-pinned-czkawka-rust-core-in-a-subprocess.md`
§还差的三条 里的第 1、2 条。第 3 条（删除动作归谁）是使用者的裁定，本文件没碰。

所有产物在 `/Users/glow/Base/Code/Freya/.scratch/kisaki-engine/`（仓库外）。
**仓库里只新增了本文件**：没有在 `native/` 下落任何构建产物，所以与在飞的 `native/findz-go/` 无交集；
基线只读 worktree `/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide`（`ccf465fe`）未被写入
（事后 `diff -r` 两侧源码 rc=0，见 §1.1）。

## 0 结论先说

| 问题 | 读数 |
|---|---|
| mac（arm64）编不编得动 | **编得动，rc=0**，`libavif` feature 原样保留，5m 09s 出 `libxiranite_czkawka_node.dylib`（21,443,856 字节） |
| 产物能不能跨进程用 | **能**：子进程 `require()` 装载，`getCzkawkaInfo()` 回 `{apiVersion:5, sourceVersion:"12.0.0", capabilities:[20]}`，一次真实去重扫描回 2 组重复（blake3 一致），子进程 rc=0，父进程 rc=0 且从未装载该 addon |
| 子进程可杀吗 | **可杀**：见到"addon 已装载"标记即 `SIGKILL`，父进程读到 `childSignal:"SIGKILL"`、自身 rc=0；另一例 `process.abort()` → `childSignal:"SIGABRT"`，父进程不受影响。**这是代理，不是真缝**（生产是 `ctx.subprocess`/`dsh-subprocess-local`，这里只是 `child_process.spawn(node, …)`） |
| 需要联网吗 | **本次没有**：build 日志里 `Downloading`/`Updating` 命中 0，`cargo build --offline` rc=0。`czkawka_core 12.0.0` 确实是从 crates.io 那份源码编的（rustc 命令行为 `~/.cargo/registry/src/index.crates.io-…/czkawka_core-12.0.0/src/lib.rs`），但 .crate 早在 2026-09-17 就已在本地缓存里 —— 换一台干净机器仍要拉 crates.io |
| `-api5` 是什么 | 是 **（a）上游 czkawka 版本 + 我们自己那条桥的传输契约修订号**，不是 napi 的 ABI 号。**没有任何运行时逻辑解析这个字符串**；真正的耦合是那 14 个导出符号（Rust 14 / TS 声明 14 / 运行时实测 14） |

## 1 测量 1 · mac 构建 + 子进程装载

### 1.1 搬运与逐字性

```sh
SRC=/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/native
DST=/Users/glow/Base/Code/Freya/.scratch/kisaki-engine
cp -R "$SRC/czkawka-core" "$DST/czkawka-core"
cp -R "$SRC/czkawka-node" "$DST/czkawka-node"
cp "$SRC/Cargo.lock" "$DST/Cargo.lock"
```

| 核对项 | 读数 |
|---|---|
| `diff -r` 两侧 `czkawka-core` | rc=0（构建前、构建后各跑一次） |
| `diff -r` 两侧 `czkawka-node` | rc=0（同上） |
| `.rs` 行数 | `find czkawka-core czkawka-node -name '*.rs' \| xargs wc -l` ⇒ **4963 total**，与基线同数 ⇒ ADR 那条 4963 复验通过 |

**偏离只有两处，都在 workspace 层，不在 crate 源码里**：

1. 新写 `$DST/Cargo.toml`：workspace `members` 从基线的
   `["arcthumb-core","arcthumb-node","czkawka-core","czkawka-node"]` 收窄为 `["czkawka-core","czkawka-node"]`，
   `[workspace.package]`（edition 2024 / rust-version 1.96 / license MIT）与 `[profile.release]`（lto=true、
   codegen-units=1、strip=true）逐字照抄。原因：本任务只搬 czkawka 那一层，`arcthumb-*` 不在范围内。
2. `Cargo.lock` 被 cargo 重新解析：5462 → 5112 行、563 → 528 个 `name = ` 条目，删掉的正是 `arcthumb`
   两条及其独占依赖（`rg -c arcthumb Cargo.lock` ⇒ 0 命中）。**没有升降任何版本。**

没有需要改路径的 build 脚本：`czkawka-node/build.rs` 全文只有 `fn main() { napi_build::setup(); }`；
基线 `native/` 下没有 `.cargo/config.toml`；`native/vendor/dav1d-windows-x64.zip` 在 mac 上不被引用
（`packages/czkawka-native/scripts/build-native.ts:20` 那段解包只在 `process.platform === "win32"` 走）。

### 1.2 构建

```sh
cd /Users/glow/Base/Code/Freya/.scratch/kisaki-engine
cargo build --release -p xiranite-czkawka-node   # rc=0，5m 09s
```

末尾 15 行里的关键三行（原文）：

```text
warning: `xiranite-czkawka-node` (lib) generated 11 warnings
    Finished `release` profile [optimized] target(s) in 5m 09s
warning: the following packages contain code that will be rejected by a future version of Rust: proc-macro-error2 v2.0.1
BUILD_RC=0
```

11 条 warning 全是 `czkawka-node/src/trash_api.rs` 里非 Windows 平台用不到的 trash 缓存实现
（`TRASH_LIST_CACHE_TTL` / `TrashListCache` / `list_trash_items_cached` 等 11 个 never-used 项，
行号 437–491）。**不是错误，也不该被读成"mac 上 trash 通路坏了"**——mac 走 `trash` crate 自己的实现。

与上游入口的差异：`build-native.ts:10-12` 那串参数是 `build -p xiranite-czkawka-node [--release] -j 1`，
我们没加 `-j 1`（只影响时长，不影响产物）。
`CARGO_PROFILE_RELEASE_LTO`/`CODEGEN_UNITS` 那两个 env 覆盖在 `build-native.ts` 里同样只在 win32 分支。

**`libavif` feature 一个字没动。** 依据是当场抓到的 rustc 命令行：
`--crate-name czkawka_core … --cfg feature="libavif" … -L native=/opt/homebrew/Cellar/dav1d/1.5.4/lib`。

### 1.3 产物

| 路径 | 字节 | sha256 |
|---|---|---|
| `target/release/libxiranite_czkawka_node.dylib` | 21,443,856 | — |
| `artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node`（改名副本） | 21,443,856 | `a7762936e6ecac0623c9a6284655639834f3804f8bebf052f2112b0fab9bc517` |
| `gzip -9` 后 | 9,055,058 | — |
| `xz -9` 后 | 5,560,296 | — |

对照基线那份 win32 档案 `native/prebuilt/win32-x64/czkawka.win32-x64.zip` 的 12,888,672 字节：
**mac 这档压完（gz）比 win32 的 zip 还大**，ADR 后果段那条"安装体积要实测"现在有了 mac 侧数字。

`target/` 占 1.2 GB。

### 1.4 mac 产物不是自足的（本测量最要紧的负面发现）

```sh
otool -L artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node   # rc=0
```

依赖清单里唯一一条非系统绝对路径：

```text
/opt/homebrew/opt/dav1d/lib/libdav1d.7.dylib (compatibility version 7.0.0, current version 7.0.0)
```

阳性对照（把这条改成不存在的路径再装载，证明它是活的而不是 otool 上的装饰）：

```sh
cp artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node /tmp/broken.node
install_name_tool -change /opt/homebrew/opt/dav1d/lib/libdav1d.7.dylib /nonexistent/libdav1d.7.dylib /tmp/broken.node  # rc=0
node -e 'require("/tmp/broken.node")'
# dlopen(/private/tmp/broken.node, 0x0001): Library not loaded: /nonexistent/libdav1d.7.dylib | ERR_DLOPEN_FAILED
```

归因链（`cargo tree --offline -e features -i dav1d` rc=0）：
`czkawka_core` 的 `libavif` ⇒ `image 0.25.10` 的 AVIF ⇒ `dav1d 0.11.1` ⇒ `dav1d-sys 0.8.3` ⇒ 系统 libdav1d。
被拖进来的还有 `rav1e 0.8.1` / `ravif` / `imgref`；`libavif-sys`、`libdav1d-sys` 虽在本地缓存里但**不在本次依赖图**中。

也就是说：win32 那档随包带一个 `dav1d.dll`（`manifest.json` 里第三条 sha256）解决的就是同一件事，
mac 侧的等价做法是 `install_name_tool -change … @rpath/libdav1d.7.dylib` + 把 dylib 一起打进平台包，
或者关掉 `libavif` 换一个自足产物。**两条都没做，"关掉 libavif 能不能出无外部依赖的 .node" 未验证**。
另外 `prependNativeLibraryPath`（`packages/native-loader/src/index.ts:84-85`）在非 win32 直接 return，
所以搬来的装载入口在 mac 上不会帮忙修 PATH —— rpath 这件事必须自己做。

### 1.5 子进程装载 + 一次真实扫描

harness（`harness/child-scan.cjs`、`harness/parent.cjs`）：父进程 `spawn(process.execPath, …)`，
子进程 `require()` 那个 `.node`，在 `os.tmpdir()` 的 fixture（2 对字节相同的 `.bin`，各 6600 字节 + 4 个唯一文件）
上跑一次 `scanDuplicateFiles({hashType:"blake3", checkMethod:"hash", threadCount:2})`。

```sh
node harness/parent.cjs artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node scan   # PARENT_RC=0
```

读回来的东西（节选）：

```json
{ "childCode": 0, "childSignal": null, "addonLoadedInParent": false, "parentStillAlive": true }
```

子进程 stdout 里：`apiVersion:5`、`sourceVersion:"12.0.0"`、`capabilities` 20 条、`ok:true`、
`groups` 两条，每条两个文件同一颗 blake3（`44cd8546…` 与 `5d795acb…`），`stopped:false`。
`messages` 为 `Properly loaded ⁨53⁩ cache entries. / Properly saved to file ⁨53⁩ cache entries.`。

可杀性（父进程一看见子进程 stderr 上的 `ADDON_LOADED` 就 `SIGKILL`）：

```sh
node harness/parent.cjs …/xiranite-czkawka.darwin-arm64.node kill   # PARENT_RC=0
# { "killSent": true, "childSignal": "SIGKILL", "childStdoutBytes": 0, "addonLoadedInParent": false, "parentSurvived": true }
```

崩溃隔离（子进程在 addon 已装载之后 `process.abort()`）：

```sh
node harness/parent.cjs …/xiranite-czkawka.darwin-arm64.node abort   # PARENT_RC=0
# { "childCode": null, "childSignal": "SIGABRT", "addonLoadedInParent": false, "parentStillAlive": true }
```

子进程 stderr 带一份 Node 自己的 native stack trace（`node::Abort` / `libnode.147.dylib`），父进程照常 rc=0 退出。
**没测的那半**：真正的 Rust panic/abort 从引擎内部炸出来是什么样子（napi-rs 大概率 `catch_unwind` 兜住），
本 harness 没制造那种现场；`spawn(node,…)` 也只是 `ctx.subprocess` 的代理，`terminate()` 的树级语义没在这里验。

### 1.6 一个越界副作用

扫描跑完后：

```text
~/Library/Caches/pl.Qarmin.xiranite/cache_duplicates_Blake3_prehash_120.bin   Oct 7 03:10:06（本次写入）
```

来源是 `native/czkawka-core/src/upstream/common.rs:33-38` 的 `set_config_cache_path("xiranite","xiranite")`。
两件事要记账：它写在 DSH storage domain 之外（ADR-0013 那条耐久数据规矩），
而且带旧品牌 `xiranite` 与上游的 `pl.Qarmin.` 前缀（ADR-0010 里"落盘文件名/格式判别符 = 数据迁移，动之前先问"那一类）。
`useCache` 默认 false，但 `saveAlsoAsJson`/prehash 缓存仍会落这个目录，所以不是"配了才写"。

## 2 测量 2 · `-api5` 钉住了什么

### 2.1 符号清单（两侧 + 运行时）

Rust 侧 `#[napi]` 自由函数 14 个（`native/czkawka-node/src/`：`lib.rs` 6、`trash_api.rs` 4、
`exif_api.rs` 2、`video_optimizer_api.rs` 2；`basic_task.rs` 只贡献 `BasicScanTask`，`windows_trash.rs` 是
`#[cfg(target_os = "windows")]`）。**没有任何 `#[napi]` class / impl 导出**，TS 侧也没有。

TS 侧 `packages/czkawka-native/generated/binding.generated.d.ts` 里 `export declare function` 14 条，
另有 `export interface` 27 个。运行时 census：`harness/symbols.cjs` 打印
`{count:14, keys:[…]}`（rc=0），14 个名字与下表逐一对齐。

| # | Rust | JS 名 |
|---|---|---|
| 1 | `get_czkawka_info` | `getCzkawkaInfo` |
| 2 | `cancel_czkawka_scan` | `cancelCzkawkaScan` |
| 3 | `get_czkawka_scan_progress` | `getCzkawkaScanProgress` |
| 4 | `scan_duplicate_files` | `scanDuplicateFiles` |
| 5 | `scan_basic_files` | `scanBasicFiles` |
| 6 | `scan_media_files` | `scanMediaFiles` |
| 7 | `scan_exif_files` | `scanExifFiles` |
| 8 | `create_exif_candidate` | `createExifCandidate` |
| 9 | `scan_video_optimizer` | `scanVideoOptimizer` |
| 10 | `create_video_optimizer_candidate` | `createVideoOptimizerCandidate` |
| 11 | `get_trash_capabilities` | `getTrashCapabilities` |
| 12 | `trash_path` | `trashPath` |
| 13 | `list_trash_items` | `listTrashItems` |
| 14 | `restore_trash_item` | `restoreTrashItem` |

⇒ **14 = 14 = 14**，两侧完全对齐，无孤儿导出、无 TS 声明了但 Rust 没导出的名字。

### 2.2 `-api5` 是哪一类

**是（a）：上游 czkawka 版本 + 我们自己那条桥的传输契约修订号。** 三段证据：

1. 数字的来源与含义都是自己的：`native/czkawka-core/src/capabilities.rs:8` `pub const API_VERSION: u32 = 5;`，
   经 `getCzkawkaInfo()` 以 `apiVersion` 出到 JS。上游计划文档把语义写死了
   （`docs/czkawka-12-upgrade-plan.md:213` §8.1 Version handshake）：`:224` "`apiVersion` describes only the
   Xiranite Node-API transport contract"、`:227` "Runtime compatibility checks use a minimum supported API plus
   required capabilities"、`:229` "Increment `apiVersion` only for an incompatible transport change. Additive
   optional exports should normally use capabilities"；`:226` 明写 `sourceVersion` 是 informational 的。
2. 标签是打包时拼出来的，不是编译期常量：`packages/native-loader/scripts/build-native-assets.ts:126-127`
   `` return `${String(info.sourceVersion ?? "unknown")}-api${apiVersion}` `` —— 前半是 czkawka 自己的版本，
   后半是那个 5。前半的真身在 `native/czkawka-core/src/upstream/common.rs:29-31`
   （`czkawka_core::CZKAWKA_VERSION`，即钉住的 `=12.0.0` 那份 crate 报的串）。
3. **反证（b）**：`docs/czkawka-12-upgrade-plan.md:79` 记着"manifest.json 当时写的是 `10.0.0-api5`"，
   而 `:78` 还把"冒烟与兼容门面要求 `sourceVersion === "10.0.0"` 精确匹配"列成要修掉的问题。
   核心从 10.0.0 跳到 12.0.0，后缀的 5 **没动**；今天的 `smoke-native.mjs:10` 只断言 `apiVersion !== 5`、
   不再比 `sourceVersion` 串 ⇒ 5 是被刻意维护的自有计数器，跟 czkawka 版本无关。
   而 `napi` 侧的 Node-API 版本是另一回事（`napi` features `napi8`，本机 Node 报 `process.versions.napi = "10"`，
   Node v26.10.0）——5 既不是 8 也不是 10，所以它不可能是 napi ABI 号。

### 2.3 运行时到底谁在读它

| 读的地方 | 读的是什么 | 性质 |
|---|---|---|
| `packages/native-loader/src/index.ts:61` | `asset.version` 整串 → `safeSegment()` 拼进解包缓存目录名 `<version>-<sha256前12位>` | 只做**目录命名/换版失效**，不是比较、不是闸门 |
| `packages/czkawka-native/src/compatibility.ts:18-24` | `info.apiVersion < requirement.minimumApiVersion` | **比较的是数字**，来自 addon 的 `getCzkawkaInfo()`，跟字符串后缀无关；另有一条 `requiredCapabilities` 集合差 |
| `packages/czkawka-native/scripts/smoke-native.mjs:10`、`smoke-embedded.mjs:21` | `if (info.apiVersion !== 5 …)` | 打包/冒烟脚本，不是生产路径 |
| `packages/nodes/czkawka/src/platform.ts:162` `getNodeRuntimeInfo()` | 把 `apiVersion/sourceVersion/capabilities` 原样读出，交给运行时信息 | **不做判定** |

关键读数：**基线里 `checkCzkawkaCompatibility` / `assertCzkawkaCompatibility` 的生产调用者是 0**。
不带任何过滤跑 `rg 'CzkawkaCompatibility|assertCzkawka|checkCzkawka'`，全部 13 处命中只落在三个文件：
`src/compatibility.ts`（自己的定义与内部调用 `:42`）、`src/index.ts:129-132`（纯 re-export）、
`src/compatibility.test.ts:3,8,16,21,25`（用假 `CzkawkaInfo` 测这条闸门）。
包外、节点里、宿主里一处都没有。
也就是说 ADR 决定 5 里"ABI 不匹配要读回同一句话"这件事在基线**没有现成接线可复用** —— 闸门函数存在但没人按下，
`minimumApiVersion` 与必需 capabilities 得由我们的子进程入口自己给。

⇒ 结论照 ADR 该改的一字不改地写：**`-api5` 是包装标签（packaging label）**，
运行时没有任何逻辑解析这个串；真正会被读的是 addon 自己报回来的 `apiVersion` 数字（目前 5），
而**真正的 ABI 耦合是那 14 个符号 + 27 个 interface 的清单**（§2.1 的 14=14=14 就是证据）。

## 3 对 ADR-0015 意味着什么

- **决定 1（逐字移植，不重写）：站住。** 源码 4963 行原样复制、`diff -r` rc=0、`libavif` feature 未动，
  一次 `cargo build --release -p xiranite-czkawka-node` 就出可用产物。落点 `native/kisaki/` 之前，
  要一并搬的两样是：一个只含 czkawka 两个成员的 workspace `Cargo.toml`，以及"lock 由 cargo 重解析"这件事
  （不是手改版本号）。
- **决定 3（平台包 = `.node` + 装载入口 + sha256 清单）：形状站住，但 mac 一档必须补一步。**
  ADR 说的"mac 一档必须我们自己编"现在证明了：编得出、跑得动。但**编出来的 `.node` 不自足**——
  它绝对依赖 `/opt/homebrew/opt/dav1d/lib/libdav1d.7.dylib`（§1.4 的阳性对照）。所以 darwin 平台包要么
  带这份 dylib 并把 install name 改成 `@rpath/...`（win32 那档带 `dav1d.dll` 是同一件事），
  要么换 1.4 末尾那条"关 `libavif` 出无外部依赖产物"的路（**未验证**）并让退化在界面上读得回来。
  装载入口也不能照搬上游：`prependNativeLibraryPath` 在非 win32 是 no-op。
- **决定 5（退化可见）：比 ADR 写的更孤立。** 基线那个 `compatibility.ts` 闸门从未被生产代码调用（§2.3）。
  我们的子进程入口要自己定 `minimumApiVersion` 与必需 capabilities，否则"装到了但 ABI 不对"这一档没人判。
- **决定 2（边界在子进程）：方向被支持，但没被这次测量证明。** `spawn(node,…)` + `SIGKILL`/`abort` 两例
  只证明"addon 死在子进程里、父进程 rc=0"，且父进程从未装载过 addon（`addonLoadedInParent:false`）。
  真正的 `ctx.subprocess` / `terminate()` 树级语义、以及 Rust 内部 panic 的真实形态都还没测。
- **决定 6（改名）新增一处落盘名**：`set_config_cache_path("xiranite","xiranite")` → `~/Library/Caches/pl.Qarmin.xiranite/`，
  属于"改它等于数据迁移"那一类，动之前要使用者点头（同一条也提醒：这份缓存写在 DSH storage 之外）。

### 批次还挡着什么

1. darwin 资产的 **dav1d 外部依赖处理**没定：随包带 dylib + `@rpath`，还是关 `libavif`。
   前者是打包脚本的活，后者要先跑一次诊断构建才知道可不可行（本文件没跑）。
2. `binding.generated.d.ts` 的再生成还吃 bun（`generate-binding-dts.ts` 用 `Bun.spawn`/`Bun.which`），
   要改成 node；本次是**直接带基线已生成的那份**（14 个函数声明与 mac 实测 census 相符，所以可用）。
3. ADR 原第 2 条的另一半仍未量：`czkawka_core` 12.0.x 里已有 `12.0.1`（2026-07-29）、`12.0.2`（2026-09-09，
   当前 max_stable），把 `=12.0.0` 放宽到 `=12.0.2` 后 `upstream/*.rs` 那层胶水还编不编得过 —— **没跑，未验证**。
   要量就一条命令：另开一份副本，把 `czkawka-core/Cargo.toml` 的 `=12.0.0` 改成 `=12.0.2`，
   `cargo build --release -p xiranite-czkawka-node`（这条需要联网取新 crate）。
   注意符号清单由我们的胶水决定，12.0.x 内部 bump 不会改 §2.1 那 14 个名字，风险在编译与行为而不在 ABI。
4. 删除归口（ADR 第 3 条）—— 使用者裁定，本文件没碰。

## 4 复现清单

```sh
cd /Users/glow/Base/Code/Freya/.scratch/kisaki-engine
cargo build --release -p xiranite-czkawka-node                                   # rc=0, 5m 09s
mkdir -p artifacts/darwin-arm64 && cp target/release/libxiranite_czkawka_node.dylib \
  artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node
otool -L artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node                # rc=0
node harness/parent.cjs artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node scan   # rc=0，2 组重复
node harness/parent.cjs … kill                                                     # rc=0，childSignal=SIGKILL
node harness/parent.cjs … abort                                                    # rc=0，childSignal=SIGABRT
node harness/symbols.cjs artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node # rc=0，count=14
```

未跑的部分（不要当成跑过）：`cargo test`（czkawka-core 有 `src/tests.rs`，本次没跑）、
`--no-default-features`/关 `libavif` 的诊断构建、真正的 `ctx.subprocess` 接线、
`=12.0.2` 的放宽构建、win32 那档 zip 的装载（本机没有 Windows）。
本机工具链读数：`cargo 1.98.1 (Homebrew)`、`rustc 1.98.1`、**`node v26.10.0`（`process.versions.napi = 10`，
不是任务书里记的 v24）**、`pkg-config` 见 `libavif 1.4.2` / `dav1d 1.5.4`（`/opt/homebrew`）。

## 5 测量 3（2026-10-07）· dav1d 那一半不是工程问题，是"带不带"的一句话

§1.4 留的那个口子（"要么打进包并把 install name 改成 `@rpath`，要么关 `libavif`"）**在本机可测，
所以不该留在纸上等人猜**。而且答案就在使用者自己的仓里：那条路他已经走过一次。

### 5.1 读上游那份产物的装载形状（现读，不推测）

`/Users/glow/Base/Code/Freya/Xiranite/native/artifacts/darwin-arm64/`（`master` 那一侧，
**只取它的打包机制，不取实现**——ADR-0006 说的"实现只从 tag `noxide` 搬"没被违反）：

```
libdav1d.7.dylib                             825,360 B   ← 与 .node 同目录带着
xiranite-czkawka.darwin-arm64.node        21,319,296 B
findz.dylib                                 9,745,874 B
```

`otool -L` 那份 `.node`：非系统依赖只有两条，一条是 cargo-napi 的中间 dylib（绝对路径，
记的是 `/Users/glow/Projects/Xiranite/native/target/release/deps/…`，正是记忆里
"搬仓后生成物记旧绝对路径"那一类），另一条是 **`@rpath/libdav1d.7.dylib`**；
`otool -l` 里 `LC_RPATH` 有一条 **`path @loader_path`**。
`otool -L` 那份 `libdav1d.7.dylib`：自己的 install name 还是 brew 的绝对路径，
但依赖只有 `/usr/lib/libSystem.B.dylib` ⇒ **它没有传递链，带一个文件就够**。
（本机 brew 现值：`dav1d 1.5.4`、`libavif 1.4.2`，与 §4 的工具链读数同一份。）

noxide 那侧（我们真正的搬运来源）同一条纪律的 Windows 形态在磁盘上：
`native/vendor/dav1d-windows-x64.zip` **727,341 B**，`native/prebuilt/win32-x64/` 里
`czkawka.win32-x64.zip` / `arcthumb…` / `findz…` 三个 zip 加一份 `manifest.json`
⇒ "平台包带着 dav1d 一起发"不是新发明，是上游既有做法的另一种载体。

### 5.2 A/B：把那两个文件搬到一个新目录里真装载一次

复制到 `.scratch/kisaki-rpath-probe/{alone,pair}`（`alone` 只放 `.node`，`pair` 放上那对），
`node -e "require(...)"` 两侧各跑一次，然后**把这份 41 MB 的临时目录删掉**（已删，`test -e` 为空）：

```
== alone ==
require FAILED: dlopen(…/alone/xiranite-czkawka.darwin-arm64.node, 0x0001): Library not loaded: @rpath/libdav1d.7.dylib
== pair ==
require OK; exports= 14
```

这两条合起来才是判据：`alone` 必须红 ⇒ 依赖是真的，且 dyld **不会**退回去在 `/opt/homebrew` 里找它
（引用写的是 `@rpath/…`，只经 `LC_RPATH=@loader_path` 解析）；
`pair` 必须绿 ⇒ 那两个文件搬到新位置仍然自足，**不需要**改 dylib 自己的 install name
（带过去的那份里面写的还是 brew 的绝对路径，装载照样成功——它只是自己的名字，不是被引用时用的键）。

⇒ 本机的 `require` 走的是 `dlopen`，`exports=14` 与 §2.1 那份符号清单同一档，
没有触发任何扫描动作（只装载，不调用）。

### 5.3 于是决定 (a) 变成一句话的事，代价有数

带：**mac 每平台包 +825,360 B、Windows +727,341 B**，工程动作只有"构建时把 dylib 放到产物旁边 +
`-C link-arg=-Wl,-rpath,@loader_path` 那一类"，机制已被 §5.2 证可达；
avif 能解，不需要退化面。
不带：省 0.8 MB，但 `.avif` 那条路必须**在界面上读得回来**（ADR-0011 决定 4 的降级铁律），
那就还要多做一条"这个文件我没解"的可见状态。

我的建议是按上游既有形状带着（这条是"搬运"而不是"选设计"），但**批次仍不开**——
挡着的是另外两件事，都不是测量能替我拍的：**删除动作归 `trash` 还是 `recycleu`**，
以及引擎那份缓存目录（`~/Library/Caches/pl.Qarmin.xiranite/…`，既带旧品牌又绕开
DSH 的 storage domain，按 ADR-0010 属于落盘名/数据迁移那一类）。

### 5.4 这一节没跑的

Windows 侧那个 zip 的装载（本机没有 Windows；PTEROSAUR 那台是跑 Rust 用的，
napi 的 `.node` 装载证据要另开一次）；`--no-default-features` 关掉 `libavif` 的对照构建
（要证"不带会怎样"的话需要它，本轮没做，所以上面只写代价不写症状）；
`cargo test`（同 §4 的自留项）。
