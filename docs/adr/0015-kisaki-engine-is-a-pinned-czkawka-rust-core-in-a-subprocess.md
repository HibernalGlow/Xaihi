# ADR-0015 · kisaki 的原生引擎（czkawka 改名而来的那一份 Rust）怎么交付

- 状态：接受（工程裁定；三条待测项已于 03:19 量完，批次现在卡在**两个决定**上，见文末）
- 日期：2026-10-07
- 相关：批次 H `kisaki`（台账 `hostRequirements: ["os-native","external-process","recursive-enumeration","file-io"]`）、
  使用者 2026-10-07 裁定「kisaki 就是 czkawka 的改名，ocean / folia 不要」、
  `docs/adr/0004-build-findz-as-a-go-index-core-in-a-subprocess.md`（非 JS 内核的边界与交付形状）、
  `docs/adr/0002-self-contained-plugin-packages.md`、`docs/adr/0010-brand-is-xaihi.md`、
  `docs/adr/0011-desktop-shell-*.md` 决定 4（退化必须可见）

## 现状（实测，全部读自基线 `noxide` = `ccf465fe` 的只读 worktree）

先前我在 `docs/stages/step-4.md` 里写过一句**错的**账："noxide 树内没有一份 `.rs`，所以 kisaki 的引擎是外部件"。
那句的真相是：`packages/czkawka-native` 这一包里确实没有 Rust——它是**装载器**；
Rust 在仓库根的 `native/` 那一层：

| 实测项 | 读数 |
|---|---|
| `native/` 布局 | `Cargo.toml`（workspace）、`Cargo.lock`、`czkawka-core/`、`czkawka-node/`、`arcthumb-{core,node}/`、`findz-go/`、`prebuilt/`、`vendor/` |
| Rust 行数 | `find native/czkawka-{core,node} -name '*.rs' \| xargs wc -l` ⇒ **4963 行**（含 `czkawka-core/src/upstream/{common.rs 76, duplicate.rs 148}` 这一小片上游胶水） |
| 引擎从哪来 | `czkawka-core/Cargo.toml`：`czkawka_core = { version = "=12.0.0", default-features = false, features = ["libavif"] }` + `image_hasher = "3.0"` + `thiserror = "2"` + `crossbeam-channel = "0.5"` ⇒ **不是 fork czkawka，是钉死 crates.io 那一份**；`native/czkawka-core/src/upstream/` 只是薄胶水 |
| crates.io 现测 | `https://crates.io/api/v1/crates/czkawka_core/12.0.0` ⇒ `http=200`、`yanked=false`、`created_at=2026-06-28`；feature `libavif = ["image/avif-native","image/avif"]` |
| Node-API 侧 | `czkawka-node/Cargo.toml`：`crate-type = ["cdylib"]`、`napi = "3" (features napi8, async)`、`napi-derive = "3"`、`trash = "=5.2.6"`；Windows 追加 `rayon 1.11` + `windows 0.56` 一堆 `Win32_*` feature |
| 装载器 | `packages/czkawka-native/src/native-asset.ts`：`resolveNativeBindingPath({ id: "czkawka", filename: \`xiranite-czkawka.${process.platform}-${process.arch}.node\`, overrideEnv: "XIRANITE_CZKAWKA_NATIVE_PATH", … })`，另两条出口是 `@xiranite/native-loader` 的 `extractEmbeddedNativeBinding`（把资产从打包资源目录解出来） |
| 现成产物 | `native/prebuilt/win32-x64/`：`czkawka.win32-x64.zip` **12,888,672 字节** + `manifest.json`（`id=czkawka, version="12.0.0-api5", binding="xiranite-czkawka.win32-x64.node"`，档案与 `.node` 各记一条 sha256）。**只有 win32-x64 一档**——`native/prebuilt/` 下没有 darwin 目录 |
| 构建入口 | `packages/czkawka-native/package.json`：`"build:native": "bun scripts/build-native.ts"`、`generate:binding-dts`、`check:binding-dts`、`smoke:native` 全走 `bun` |
| 本机工具链 | `cargo 1.98.1 (Homebrew)`、`rustc` 同 PATH ⇒ mac 侧**编得动**是前提，但没编过就是没编过 |

台账那条 `disposition: removed` 的 `czkawka`（standalone `czkawka-tauri`）与 `retain-rewrite` 的 `kisaki`
按使用者裁定读成**同一个节点的改名前后**：出局的是退休的 Tauri 前端壳，能力与它的原生引擎以 `kisaki` 的名字保留。

## 决定

1. **引擎按逐字移植对待，不重写、不换实现。** 移的是基线 `native/czkawka-core` + `native/czkawka-node`
   那 4963 行 Rust（它们对 `czkawka_core` 只是 `=12.0.0` 的依赖），落点 `native/czkawka/`→改名 `native/kisaki/`。
   纪律与 `dissolvef`、findz 同一条：差异要能被尺看见，不许"顺手改一版更干净的"。
2. **边界是子进程，不是把 Node-API 装进 DSH 宿主进程。** 沿用 ADR-0004 那条决定性理由（故障半径）：
   Rust 侧的 panic/abort 与 napi 的 async + rayon 线程池一旦在宿主进程里出事，死的是使用者的整个会话；
   `native/czkawka-node` 在 Windows 上显式拉了 `rayon`，这恰恰是"它会开一堆线程"的书面证据。
   具体形状：引擎平台包里带一个**装载 `.node` 的小 Node 入口**，Xaihi 经 `ctx.subprocess`
   （本地 provider `dsh-subprocess-local`）按操作 spawn 它，stdio 上传 JSONL 事件（进度/分组/结果），
   `terminate()` 是树级的 ⇒ 不留孤儿扫描进程。这条与 findz 的索引进程是同一种接线，不是新机制。
3. **交付形状 = 平台包**，与 ADR-0004 同形：`@hibernalglow/xaihi-kisaki-<platform>-<arch>`
   （`win32-x64` / `darwin-arm64` / `darwin-x64`），包内是 `.node` + 那个装载入口 + sha256 清单；
   `plugins/kisaki` 只按 `process.platform/arch` 请求对应包，装不到就走第 5 条的可见退化。
   **基线里那份 win32-x64 档案可以当第一份产物直接记账**（12,888,672 字节与两条 sha256 都在 `manifest.json` 里），
   但"能拿到 zip"不等于"能在这台 DSH 上跑"——那条要实机证明。
4. **构建入口不许是 bun。** 基线把 `build:native` 等一整排脚本钉在 `bun` 上，而我们已经按使用者指令
   把"spawn 裸 bun"整块拆掉（`docs/stages/step-4-terminal-port.md` §八）。本仓的等价入口是
   `cargo build --release -p xiranite-czkawka-node`（改名后 `-p xaihi-kisaki-node`）+ `node` 侧打包脚本；
   `generated/binding.generated.d.ts` 那份类型由 `generate-binding-dts` 生成，我们**先带已生成的那份**，
   并把"重新生成"列为待还项（生成器本身也吃 bun）。
5. **退化必须可见（ADR-0011 决定 4）。** 本平台没有装对应引擎包 / 装载失败 / ABI 不匹配这三种情况，
   面板与工具都要读回同一句话（"引擎缺失：未安装 `@hibernalglow/xaihi-kisaki-<platform>-<arch>`"），
   工具**拒绝执行**并给出可复制的安装命令。不许静默降级成"用 TS 粗扫一遍"，更不许伪造分组结果。
6. **命名按 ADR-0010 分两类处理。** 随代码活的一律换成 Xaihi：`xiranite-czkawka.*.node` → `xaihi-kisaki.*.node`、
   env `XIRANITE_CZKAWKA_NATIVE_PATH` → `XAIHI_KISAKI_NATIVE_PATH`、`data-testid="czkawka-*"`（上游那份 UI 里
   实测 10+ 处）跟着节点 id 一起改，**与消费者同批**落。
   另一类是**落盘数据**：上游存储键里有 `czkawka12MotionCropMigrationNotified` 这种带旧名的键，
   改它等于数据迁移 ⇒ 动之前问使用者，不许静默改键把老账目变成孤儿。
7. **`trash = "=5.2.6"` 那条删除通路先不引。** 本仓已有 `recycleu`（可恢复删除）节点，
   两个内核各自持有一份"扔进回收站"的实现会是第二套通路；这一条在批次里必须有裁定，
   默认倾向是 kisaki 只**报**"要删哪些"，删除动作交回 recycleu 那条已接线的通路（待使用者确认，见 §还差的三条）。

## 为什么不选别的

- **在宿主进程里 `require` 那个 `.node`**：装载器上游已经替我们判断过一次风险（它把 binding 的装载路径
  做成独立包 + env 覆盖 + 嵌入资产解包三件套），而 findz 那条我们同样因为故障半径否掉了内嵌 FFI。
  同一个理由在这里成立得更强：napi  addon 一起步就带 async runtime 与线程池。
- **Extism / WASM**：等于在 DSH 之外再带一个 runtime，正面违反第一条原则；ADR-0004 已判过一次。
- **用 TS 重写去重内核**：哈希、分桶、相似图比对那套是 czkawka 十几年社区成果的成品，
  重写既放弃那份基准，也把"移植"变成"再造"（ADR-0006 的第一条理由）。
- **把 `@xiranite/native-loader` 整层搬进来**：它服务的是上游"桌面壳里内嵌资产 + 解包缓存"那一套，
  我们的边界在子进程，装载发生在子进程里；搬那一层等于多养一个我们不调用的抽象。
- **让 kisaki 直接吃 npm 上的 czkawka CLI**（`czkawka_cli`）：那是另一个交付形状（要装 Python/Rust 二进制、
  参数面与我们的分组语义不对齐），而且会把"引擎版本"从 `=12.0.0` 的钉版降级成运行时碰运气。

## 后果

- 正面：引擎版本是**编译期钉死**的（`=12.0.0` + `-api5` 的 ABI 后缀），装不到就可见失败；
  Windows 一档有现成产物与 sha256 可核；边界与 findz 同形 ⇒ 一套子进程接线服务两个非 JS 内核。
- 负面 / 待还：
  - mac 一档**必须我们自己编**（基线无 darwin 资产）——双平台承诺的前提是这一次构建真的跑过；
  - `libavif` 这个 feature 在 Windows 上靠 `native/vendor/dav1d-windows-x64.zip`，mac 侧要另找来源
    （brew 的 libavif，或先关 feature 并让退化读得回来）；
  - `binding.generated.d.ts` 的再生成还挂在 bun 脚本上，要先把它改成 `node`；
  - 安装体积：zip 12.9 MB 那一档是**压缩后**的产物大小，装进 profile 的体积要实测再写进文档。

## 那三条待测项已量完（2026-10-07 03:19，读数与命令在 `docs/stages/kisaki-engine-measurements.md`）

1. **mac 编得动，但那份产物不是自足的**：`cargo build --release -p xiranite-czkawka-node` **rc=0（5m09s）**，
   `libavif` feature 原样带着（rustc 命令行里有 `--cfg feature="libavif"`），产物 21,443,856 字节
   （gz 9,055,058 / xz 5,560,296；对照 win32 那份 zip 是 12,888,672）。子进程边界这一条也过了：
   addon 只在 `spawn` 出来的子 Node 里装载，真跑一次扫描返回 2 组重复且 blake3 相符，子进程 rc=0，
   父进程 `addonLoadedInParent:false`；扫描中途 `SIGKILL` 子进程 ⇒ 父进程 rc=0；
   子进程里 `process.abort()` ⇒ SIGABRT 而父进程无碍。**这条决定 2 成立**（注意：那是 `spawn(node)` 的代理，
   不是 `ctx.subprocess` 真兑现）。
   **但** `otool -L` 现读那份 `.node` 挂着绝对路径 `/opt/homebrew/opt/dav1d/lib/libdav1d.7.dylib`，
   把这条改成不存在的路径再装载 ⇒ `ERR_DLOPEN_FAILED`（阳性对照跑过）。链条是
   `libavif → image → dav1d-sys`。所以决定 3 里"按平台预编译随包分发"在 mac 上**还差一步**：
   要么把 `libdav1d.7.dylib` 一起打进平台包并把 install name 改成 `@rpath`，要么出一个关掉 `libavif` 的
   mac 变体（那条尚未测，代价是 AVIF 相似图这一档能力按可见退化处理）。
   另一条相关的坑：基线装载器里的 `prependNativeLibraryPath` 在 win32 是空操作 ⇒ 装载入口修不了 mac 的库路径。
2. **`12.0.0-api5` 是"引擎版本 + 我们自己那层桥的计数"，不是 napi 的 ABI 号**：
   它在 `build-native-assets.ts:126` 打包时按 `${sourceVersion}-api${API_VERSION}` 拼出来，
   `API_VERSION: u32 = 5` 写在 `capabilities.rs:8`；反证是 10.0.0 → 12.0.0 期间引擎大版本变了而它一直是 `-api5`
   （`upgrade-plan:79`），而 napi 这边是 8/10。运行期**没有任何代码解析这个后缀**
   （`@xiranite/native-loader` 只把它当缓存目录名），做版本比对的 `compatibility.ts` 有 **零个生产调用者**
   （13 处命中全是自身/测试/再导出）。所以真正的 ABI 耦合是**符号清单**：Rust 侧 14 条、TS 侧 `.d.ts` 14 条、
   运行期 census 14 条，27 个接口、无 class。决定 5 的"ABI 不匹配要可见失败"因此**不能靠这个后缀**，
   得靠装载时的符号清单比对——这条要落到我们的装载入口实现里。
3. **删除归口仍未拍**（这条是使用者的一句话，不是测量）。而且量出一条新的：引擎会往
   `~/Library/Caches/pl.Qarmin.xiranite/cache_duplicates_Blake3_prehash_120.bin` 写缓存
   （`set_config_cache_path("xiranite","xiranite")`，本次跑真落盘了，本机现有这个目录）——
   既带旧品牌又绕过 DSH 的 storage domain。按 ADR-0010 这属于"落盘文件名 = 数据迁移"那一类，
   改之前要问；按 ADR-0013 耐久数据该走 storage domain（域名 `xaihi_*`）。

⇒ 批次仍然不开，但开批的门槛从"能不能编"缩成了**两个具体决定**：
mac 那份 `.node` 的 dav1d 怎么带（打进包 + `@rpath`，还是关 feature 走可见退化），
以及缓存目录与删除动作的归口。**这一个是工程决定、一个是使用者决定，都写进了任务里。**

**2026-10-07 追加：第一条不再是决定，是测量。**
`docs/stages/kisaki-engine-measurements.md` §5 现读了上游那份产物的装载形状
（`@rpath/libdav1d.7.dylib` + `LC_RPATH=@loader_path`，dav1d 自己只依赖 libSystem），
并把那两个文件搬到新目录各真装载一次：只放 `.node` 必须红（`Library not loaded`，
且 dyld 不会退回 `/opt/homebrew` 去找），放那一对必须绿（`require OK`）。
代价有数：mac +825,360 B、Windows +727,341 B（noxide 那侧 `native/vendor/dav1d-windows-x64.zip`
就是同一纪律的 Windows 形态）。⇒ 本 ADR 采纳**带着发**，这不是新机制而是搬运上游既有形状；
决定 3 里"按平台预编译随包分发"那句在 mac 上的那一步由这里补齐，不需要额外裁定。
**剩下挡批次的只有使用者那两句话**：删除动作归 `trash` 还是 `recycleu`，
以及引擎缓存目录（旧品牌 + 绕开 storage domain）怎么处置。

**2026-10-07 再追加：缓存那句也消掉了。** `czkawka_core` 12.0.0 的
`src/common/config_cache_path.rs` 现读写着 `CZKAWKA_CACHE_PATH` / `CZKAWKA_CONFIG_PATH` 两个 env
优先于 `ProjectDirs::from("pl","Qarmin",…)` 那一路默认，且 `resolve_folder` 里带 `create_dir_all`
（实测三层都不存在的目录会被自己建出来，缓存落在那里，品牌目录逐字节未变）。
⇒ 那份缓存是**可再生的哈希缓存**，不属于"改名 = 数据迁移"那一类：起子进程时把两个变量指到
storage domain `xaihi_kisaki` 即可，**没有新品牌落盘，也不需要白名单**。
两条附带事实记在 `docs/stages/kisaki-engine-measurements.md` §6：回落分支只在
"路径存在但不是目录 / canonicalize 失败"时走，且只往 czkawka 自己的 warnings 里说一声
（子进程那侧看不见 ⇒ 回读判据要用"缓存文件真出现在我们目录里"，不是"我设过 env"）；
`DuplicateScanOptions.use_cache` 还能整次扫描不带缓存。
**所以开批只剩一件事**：`trashPath` / `listTrashItems` / `restoreTrashItem` / `getTrashCapabilities`
这四条导出与已迁的 `recycleu` 是同一件事的两个实现，归谁是用者的产品裁定。
