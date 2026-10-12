# 桌面端云端打包与 kisaki 原生件四平台（2026-10-11）

四条腿的落点：`.github/workflows/native.yml`、`.github/workflows/desktop.yml`、
`scripts/build-kisaki-native.mjs`、`desktop/product.mjs` + `desktop/patches/dsh/0023-xaihi-unsigned-macos-package.patch`。

## 改了什么

- `ci.yml`：门禁从 3 条补到根 `test` 的全套（补 `check:vocab`、`check:vendored`、`check:cliregistry`、
  `check:noderegistry`、`test:contract`、`check:nodebundle`、`check:cliface`、`check:tuiface`）。
  新接的 `check:nativemanifest` 也进了根 `test` 链（`scripts/check-native-manifest.mjs` 本来就有
  换货／记错尺寸／多文件／缺货／链接变实体五种扰动的对照，此前没接进任何脚本）。
  本机实跑：补进去的 6 条不吃 dist 的门禁各 rc=0；`nodebundle/cliface/tuiface` 没跑，
  它们要先 `pnpm -r run build` 重写正在被宿主加载的 `dist/`。
- `native.yml`（新）：darwin-arm64 / darwin-x64 / win32-x64 / linux-x64 一条腿一个 OS，产物只上
  workflow artifact（一份 `.node` 是 21–26 MB，四个平台一起签进仓就是把仓库当网盘）。
- `desktop.yml`（新）：preflight 数必填项 → 复用 native.yml → 产品资源装配 → win-x64 未签名打包 →
  mac 未签名打包 → linux 编译腿 → 可选 Release。
- `scripts/build-kisaki-native.mjs`：`--platform/--arch`（缺省本机）、`--publish`（落真字节给发布用）、
  `--no-dav1d`（静态链进来那份的显式出口）。
- `desktop/product.mjs`：`--platform/--arch`，并把 `@hibernalglow/xaihi-ui` 的 `build` 变成装配链的显式一步。

## 为什么

- **一条腿一个 OS**：dav1d 是唯一的库外动态依赖（`czkawka_core` 的 `libavif` feature），
  `dav1d-sys-0.8.3/build.rs:82` 在交叉时直接 panic（pkg-config 没配交叉 sysroot）。
  mac-x64 只能带一份 x86_64 的 dav1d 去交叉：meson 要 **cross file**（只给 `CC` 加 `-arch x86_64` 时它仍按
  编译器 triple 认 aarch64，去编 `src/arm/64/*.S`），交给构建脚本的环境变量是 **`PKG_CONFIG_LIBDIR`**
  而不是 `PKG_CONFIG_PATH`（实测后者无效：`link-search` 仍指宿主 brew 的 1.5.4）。
  Windows 那条可以不让系统 dav1d 参与：`SYSTEM_DEPS_DAV1D_BUILD_INTERNAL=always`（system-deps 7.0.8 的开关）
  让 dav1d-sys 自己 meson 静态编，产物也就没有动态依赖。但这条路上有两个必须显式给的工具，
  都是云跑第一轮/第二轮的红点教出来的：**要有 pkg-config 二进制**去读 meson 自产那份 `.pc`，
  以及**要逼 meson 用 MSVC**（`CC=cl` + VS Developer Shell 的 `PATH/INCLUDE/LIB`）——否则它自己会找到
  镜像里的 gcc，产出 MinGW ABI 的静态库，被 MSVC 的 `link.exe` 链时炸 `___chkstk_ms` / `__mingw_vfprintf`。
- **发布腿要能证伪"编出来就能用"**：实测 rc=0 的 darwin-x64 产物引用 8 个 dav1d 符号而 `otool -L` 里没有
  dav1d（链接器发现库的架构不对就跳过它，macOS 允许 dylib 留未定义符号）⇒ 那种货不能进包。
  现在 `--publish` 先拿 `nm -u` 与装载项对账，再改写到 `@rpath` + `LC_RPATH @loader_path` 并重新 ad-hoc 签
  （动过 Mach-O 就废了原签名，Apple Silicon 装载要求签名有效），改写后读回不是 `@rpath` 就判失败。
  仓里那份预编货本来就记 `@rpath`，而**我们自己编的那份记的是构建机绝对路径** —— 这条以前没人发现。
  `copyFileSync(src, 符号链接)` 会写穿链接改到指向的真货，所以落盘前先把链接本身挪开备份。
  四条判据都在仓外夹具上真跑过（坏货拒 rc=1／arm64 改写 rc=0／`--no-dav1d` 与实链不符拒 rc=1／
  x86_64 改写 rc=0），仓库跟踪区一个字节没动。
- **Linux 只编译**：上游没有 Linux 打包目标（`package-target.ts:176` 拒目标，`:206` 拒 Linux 主机）。
  这条腿的红绿说的是"Xaihi 在 Linux 上编得出来、测得过"。
- **mac 未签名是选择不是绕过**：见 patch 0023 那段。

## 云上读数（native 矩阵，三轮跑到四条腿全绿）

| 轮次 | run | 判决 | 红点 |
|---|---|---|---|
| 1 | `38161576761`（12m57s） | linux ✓ / darwin-arm64 ✓ / darwin-x64 ✓ / **win ✗** | `dav1d-sys/build.rs:82` unwrap：「The pkg-config command could not be found.」——`BUILD_INTERNAL=always` 只是不探测系统库，读 meson 自产那份 `.pc` 仍要有 pkg-config 二进制 |
| 2 | `38162650407`（~20 min） | 三条 ✓ / **win ✗** | `link.exe` 退出 1120：`libdav1d.a` 带着未解析的 `___chkstk_ms`（GCC 栈探测）与 `__mingw_vfprintf`（MinGW stdio）⇒ meson 在 runner 上自己找到了 gcc（镜像里 Strawberry Perl/MSYS2 都带），产的是 MinGW ABI 的静态库 |
| 3 | `38164994269` | **四条全 success** | — |

第三轮的产物与回读（日志原文，不是推断）：

- `win32-x64`：`cl = C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Tools\MSVC\14.51.36231\bin\HostX64\x64\cl.exe`；
  产物 `xaihi_kisaki_node.dll` 31,879,680 字节 `sha256 5890a086…`；`--publish … --no-dav1d` 落地，
  且**没**打印「这台机读不回装载项」那句 ⇒ runner 上 `nm -u` 可用并读到 0 个 dav1d 未定义符号
  ⇒ 「静态吃进来了、不需要带 dll」是量到的，不是照抄声明。修法：进 VS Developer Shell（`vswhere` 定位，
  与上游 `desktop-toolchain-preflight.ts:46-69` 同一把尺），把 `PATH/INCLUDE/LIB` 交给后续步骤并设 `CC=cl`。
- `darwin-arm64`：21,443,808 字节 `c821210e…`；`改写装载项：/opt/homebrew/opt/dav1d/lib/libdav1d.7.dylib → @rpath/libdav1d.7.dylib`，
  回读 `otool -L` 就是 `@rpath/…`，`codesign --verify` 过。
- `darwin-x64（试验腿）`：25,913,968 字节 `067e47ad…`；装载探针按规矩跳过（标 compile-verified only），
  改写源是 runner 自己那份交叉 dav1d（`_temp/dav1d-x64-prefix/lib/…→ @rpath`），回读同样是 `@rpath`。
- `linux-x64`：回读 `NEEDED libdav1d.so.7` —— soname 是脚本从**产物自己**读的（不是表里写死的名字），
  这台 Ubuntu 24.04 给的正是 `.so.7`。

体积记账：第二轮起 `builds/<sha>/` 那份暂存缓存不再进 artifact（同样的字节已在 `.node` 里），
darwin-arm64 从 37.8 MB 降到 27.05 MB、darwin-x64 从 21.9 MB 降到 10.9 MB；BUILD-INFO 改在回读步骤 `cat` 进日志。
跨机器的产物尺寸/哈希本来就不同（runner 的 rustc-LLVM 与本机 1.98.1 不是一份），不拿它当一致性的证据。

## 与上游 DSH API 的关系（带 file:line，路径相对 `desktop/dsh/apps/desktop/`）


- 目标集与主机闸门：`scripts/package-target.ts:50,61-83,176,179-190,206,237`。
- 必填项只从文件读、未知键拒：`scripts/desktop-package-environment.mjs:16-19,29-60,47-50`；
  mandatory-update origin 无条件必填：`scripts/desktop-policy-environment.mjs:18-44`；
  `--unsigned` 免掉 updater 校验：`desktop-package-environment.mjs:85-86`。
- 写死的签名常量：`scripts/electron-builder-config.mjs:156,163`（0023 把它们改成 `!unsigned`），
  darwin 的钥匙串包装：`scripts/package-target.ts:369-370`（0023 加了 `&& !invocation.unsigned`），
  公证两条泳道：`scripts/package-macos.ts:78-104` 与 `electron-builder-config.mjs:215-222`。
- 产物隔离早已存在、跨平台通用：`electron-builder-config.mjs:111-112`（`-unsigned` 后缀 +
  `unsigned-artifacts/`），所以 mac 未签名腿不需要新目录约定。
- **产品资源进不了安装包**：`extraResources` 写死两条（`electron-builder-config.mjs:129-149`），
  上游测试钉着条数 ⇒ 这条 workflow 交两份货（安装包 + 产品资源 zip），合成一份要再加一条 patch。
- 顺手记一处上游缺陷（本轮没动它）：`electron-builder-config.mjs` 的 `mac` 块里 `extendInfo` **写了两次**
  （`:154` 的 `CFBundleLocalizations` 被 `:158` 的麦克风文案整份覆盖）⇒ 那份 bundle 实际上不声明 zh_CN，
  而上面那行注释说的正是"macOS 按 bundle 匹配应用语言"。这是 proposal 级的上游 bug，不是我们的补丁。

## 后续可扩展

- 要 Developer ID 那份 mac 包：配 `XAIHI_MACOS_*` / `XAIHI_APPLE_*` secrets 并把 `package-mac` 的命令里
  的 `--unsigned` 去掉即可，其余步骤同形（0023 只在 unsigned 分支上改行为）。
- 想让产品资源进安装包：新增一条 patch 扩 `extraResources`（连带改上游那两条钉条数的测试），
  然后 `desktop.yml` 的安装包腿与产品资源腿合并。
- `desktop/standalone/{development-app,startup-policy}.test.ts` 读的是重放后的上游源码 ⇒ 任何要在 CI 跑
  它们的腿，必须先 `node desktop/sync-dsh.mjs`（当前只在 preflight 用只读的 `--check`）。
- Linux 那份 `.node` 的 `$ORIGIN` RPATH 没解（不维护平台），`native.yml` 的 linux 腿注释里写明了这一半。
- Windows 腿的"没有动态依赖"已经在 windows-latest 上量到：runner 有 `nm`，`nm -u` 读到 0 个 dav1d
  未定义符号，脚本因此没打那句"读不回装载项"的免责声明（那条分支只在 `nm` 与装载项都取不到时才印）。
- 打包必填的身份值已进 secrets：`DSH_DESKTOP_APP_ID=com.hibernalglow.xaihi`（过 `desktop-release-environment.mjs:65`
  的反 DNS 正则）、`DSH_DESKTOP_AUTO_UPDATE_ENV=test`、`DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=https://xaihi.invalid`
  与 `..._CONFIG={"allowedAuthOrigins":["https://xaihi.invalid"]}`（形状拿上游 `resolveDesktopPolicyEnvironment`
  现跑验过，含一条"带 path 必须被拒"的对照）。选 `.invalid`（RFC 6761 保留域）是因为**我们没有升级服务**：
  它保证解析不到，也不冒充有一个端点、不把流量打到别人的真实域名。这条选择的安全性也量过：
  `src/mandatory-update-policy.ts:201-204` 对传输/JSON 失败只 `failures++` 并把 `error` 置 `unavailable`，
  初始态 `blocking:false` ⇒ 没有策略端点时壳照常起（fail-open）。
- `desktop.yml`（安装包腿）**还没有任何云上读数**：它是 `workflow_dispatch`，而 GitHub 要求可派发的
  workflow 文件存在于默认分支 ⇒ 要等这些内容进 `main`。同理 `ci.yml` 补的那 8 条门禁要开 PR 才跑；
  本机只跑了其中不吃 `dist/` 的 6 条（各 rc=0），`check:nodebundle/cliface/tuiface` 没跑——它们要先
  `pnpm -r run build` 重写正在被宿主加载的产物。
  （下一条作废：`desktop.yml` 已经有五轮云上读数，见下面「五轮派发读数」。）

## 云上第二把读数：`ci.yml` 在 main 上跑到 `check:cliface` 就红（归属不在本轮）

`ci.yml` 每次推 main 都会跑。今天（2026-10-12）main 上四连红（`6e3caa73`、`174402f9`、`b97178f0` 各一次，
更早的 `b7b8c1ec` 也红），上一次绿是 **2026-10-06 的 `ee62011e`**。红的位置固定在 `workspace` 这条 job 的
`Run pnpm check:cliface`，真实输出是：

```
check-cli-face: 逐条跑 --help，26 个 bin（判据：产物在、rc=0、输出里有自己的 bin 名）
  ✓ kisaki     kisaki      ok
  × bandia     bandia      rc — rc=1；输出首行 node:internal/modules/package_json_reader:314
  …（共 25 条同样）
check-cli-face: FAIL（25 条起不来或没有面）
```

**这不是本轮造成的，是本轮加的那条门禁把它照出来了**（`check:cliface` 在我补门禁之前不在 CI 里）。
机制三条读数钉死，不是推断：

1. `import('@hibernalglow/xaihi-cli-runtime')` 从 `plugins/sleept/` 这个 cwd **解析成功**，落点是仓根的
   `node_modules/@hibernalglow/xaihi-cli-runtime`——而 `plugins/sleept/package.json` 里**没有**这条声明。
   本机那个链接是历史遗留 ⇒ 本机 `node scripts/check-cli-face.mjs` 全绿（现测 rc=0，26 条全过）。
2. CI 走 `pnpm install --frozen-lockfile`：仓根不会替工作区包建这个链接 ⇒ 25 条 bin 在装载期就抛，
   尺只打印"输出首行"，所以云上读到的是一句内部帧。
3. **唯一的例外恰好是唯一的绿灯**：`plugins/kisaki/package.json:232` 声明了
   `"@hibernalglow/xaihi-cli-runtime": "workspace:*"`，kisaki 就是 CI 里唯一 `ok` 的那条。

所以"照抄 kisaki 那一行"并不是机械修法：`pnpm check:installable` 现在的账是
「25 个 bundle 包都能被 `file:` 安装，**例外 1 个**」——那个例外就是 kisaki 这条 `workspace:*`。
给另外 25 个插件各加一条 `workspace:*`，等于把例外名单开到 26 条，那是 ADR-0002 那条约束要不要放宽的决定，
归属在终端面那几条 lane（`cli-runtime` 的投递面），不在本轮。**本轮不放宽尺、也不用 skip 把它变绿。**

附带一条门禁自身的缺陷（也没顺手改，脚本不是本轮的文件）：`check-cli-face.mjs` 只打"输出首行"，
把真正的 `Error:` 行截掉了——云上这条红要花两次实验才能定因。判据失败时至少该打两行。

## 五轮派发读数

| 轮次 | run | main 上的 sha | 走到哪一步 | 判因 |
| --- | --- | --- | --- | --- |
| 1 | 38209825531 | `2b7f11b5` | `preflight` 红 | 只跑只读 `--check` 不重放 ⇒ `patches_on_top=0 expected_patches=23`；改成先 `node desktop/sync-dsh.mjs` 再 `--check` |
| 2 | 38210506594 | `46c76c7b` | `preflight` 红 | CI 的 `actions/checkout` 深度拉取让 **tag ref 缺席**（commit 在）⇒ `ensureAtPin` 只查 commit 就不 fetch，`本地解析不出 tag` 拒绝 checkout；改成 commit/tag 任一缺席都 fetch |
| 3 | 38211438074 | `1af0d59a` | `preflight` 红 | runner 没有 git 身份 ⇒ `git am` 报 `Committer identity unknown`，被脚本误报成「patch 0001 打不进」；改成从 patch 的 `From:` 头取 `GIT_COMMITTER_*`，并把 git 给的第一行原因打出来 |
| 4 | 38211852905 | `93c7e861` | `package-win` 假绿 | 四条上游步骤在**仓根**跑 `pnpm --filter "@deepseek-ai/dsh-desktop"` ⇒ `Scope: 0 of 33`、rc=0；`回读产物目录` 那步 `ls` 到空目录才暴露。改成 `working-directory: desktop/dsh` |
| 5 | 38212124615 | `93c7e861` | `package-win` 真红 | 见下 |

第 5 轮的失败行原文（`打未签名的 win-x64 安装包`，rc=1；这轮跑到这里已经不可能出 release，直接取消把日志解锁）：

```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".exe" for C:\Users\runneradmin\setup-pnpm\
node_modules\.bin\package-manager-store\v11\links\@pnpm\exe\11.7.0\...\@pnpm\exe\pnpm.exe
Error: desktop package: run build:official failed; evidence: D:\a\Xaihi\Xaihi\desktop\dsh\apps\desktop\
.desktop-build\packaging-runs\2026-10-12T06-24-13.492Z-8hEkuW
```

### 第 5 轮的判因与 0024（改了什么 / 为什么）

`package-target.ts` 的 `runPnpm` 不分平台地把 `npm_execpath` 当**脚本**交给 node 执行（`:293/:295`）。
pnpm 在 Windows 上发的是原生可执行文件（`@pnpm\exe\pnpm.exe`），于是 node 把它当 JS 加载 ⇒
`ERR_UNKNOWN_FILE_EXTENSION`，第一个 build 步之前就死。mac/linux 拿到的是 `.cjs`，同一段代码在那里恰好成立
——所以这条只在 win 上红，也是它没被上游撞见的原因（上游自己在 Windows 上不带 `--unsigned` 出包）。

**与 DSH API 的关系**：仓库根早就写好了这条规则——`scripts/pnpm-invocation.ts:15-19`「只有 `.js` 入口由
node 承载，其余直接把入口当命令」。0024 就是把这条已有规则搬进 `apps/desktop/scripts/package-target.ts`
（三行），不是新发明一条；`packaging-run.mjs:121` 的 `spawn(executable, args, {windowsHide:true})` 不带
shell，所以把 exe 路径当 `executable` 传是它本来就支持的形状。

**对照（阳性）**：把这条改动撤掉再跑它自己的 spec，新增那条立刻红在
`expected '/opt/homebrew/Cellar/node/26.10.0_1/bin/node' to be 'C:\tools\pnpm.exe'`（`Tests 1 failed | 21 passed`，rc=1）；
改后 `apps/desktop/tests/package-target-stages.spec.ts` **22 条 rc=0**。两种入口形状各钉一条：
`.cjs` ⇒ 命令是 node、argv 首项是入口；`.exe` ⇒ 命令是那个 exe、入口字符串**不许出现在 argv 里**。

**重放判据**：`node desktop/sync-dsh.mjs` 连跑两次得到同一个
`head=37e1e8ed… / tree=b9d322a833cc…`（`patches=24/24 dirty=0`），`--check` rc=0 且
`gitlink_committed=gitlink_staged=want=639ed015`——补丁链没被这轮改动污染，父仓仍只记 pin。

**同一条 bug 还剩两处没动**（都在上游，本轮不改）：`scripts/flock-entry.ts:79` 与 `scripts/dev.ts:56`。
前者在 Windows 上不可达（`hostAddonBuilt` 对非 darwin/linux 直接返回 true），后者只在 `pnpm run dev:desktop`
的开发路径上——云端打包两条都不走。要提上游 proposal 的话，这三处是同一个缺口。


## 第六、七轮读数：Windows 真出了货，mac 红在第二道签名闸

| 轮次 | run | main | 结果 |
| --- | --- | --- | --- |
| 6 | `38214764230` | `b97178f0`（0024+0025） | **`package-win` success**、`native` 的 win32/linux/darwin-arm64 success；`package-mac (mac-arm64)` failure（见下）；mac-x64/product/release 被取消——它只能产出旧命名的货，而交付物要自称 Xaihi |
| 7 | `38219113172` | `f1ccc426`（+0026 改名、+0027 mac ad-hoc 签名） | 进行中 |

**第 6 轮的 Windows 读数**（不是"步骤绿"，是字节）：把那条资产 `gh run download` 回本机，
`deepseek-harness-0.2.0-rc.2-win-x64-unsigned.exe` = **287,888,238 字节**，
`file` 认成 `PE32 executable (GUI) Intel 80386, …, Nullsoft Installer self-extracting archive`。
同一次回读暴露一处会把 release 弄脏的形态问题：`unsigned-artifacts/**` 把 electron-builder 的
`win-unpacked/` 整目录也收了进去，里面有一份**散装 `DeepSeek Harness.exe`（约 200 MB）**，
而 release 的收集步骤按 `*.exe` 找文件就会把它一起附上 ⇒ 上传面改成按后缀只收安装包
（win 一份 `.exe`，mac 一份 `.dmg` + 一份 `.zip`），`release` 的 `find` 同步收窄成 `*-unsigned.*`；
少收一条仍由 `if-no-files-found: error` 响亮红，不靠"看起来绿"。

**第 6 轮 mac 的红在哪**：过了 `build:official`（0025 那条 tsc 闸已让路），死在下一个阶段
`run prepare:dsh`，原文：

```
Error: desktop release environment: DSH_DESKTOP_MACOS_SIGNING_IDENTITY must be set to a non-empty value
Error: desktop package: run prepare:dsh failed; evidence: …/.desktop-build/packaging-runs/2026-10-12T07-17-01.913Z-gBZjAf
```

0023 只放开了**产物那一侧**；`prepare-dsh.ts:156-158` 仍无条件按发布身份签运行期。
**修法不是"跳过签名"**——Apple Silicon 拒绝执行无签名 Mach-O，运行期一跑烟测就是 `Killed: 9`。
0027 把身份换成 ad-hoc 的 `-`，并跳过发布 Authority/TeamIdentifier 断言与那条带发布身份的共享签名缓存；
`--unsigned` 沿用它传给 smoke 的老路子由 `package-target` 递给 `prepare:dsh`。

**0027 的判据是拿真货跑的**（本机，非构造）：复制 `/bin/ls` 到临时目录、在 `CSC_KEYCHAIN` **未设**的环境下
调改后的 `signMacOSRuntimeCode(…, { signingIdentity: '-' })` ⇒ rc=0，`codesign -dvv` 回读
`Identifier=ai.xaihi.probe` / `Signature=adhoc` / `TeamIdentifier=not set`，`codesign --verify --strict`
报 `valid on disk` + `satisfies its Designated Requirement`。改动前那行 `if (!keychain) throw` 保证同一条调用必然抛——
这条红不需要等云跑。

## 交付物自称 Xaihi（0026）

使用者要求桌面交付物不再叫 `DeepSeek Harness`。**名字不是一个字符串**：除了 `productName` 与产物文件名前缀，
还有几处**按名字找文件**的落点，漏一处就是"改一半比不改更糟"——

- `apps/desktop/cli/dsh` 与 `cli/dsh.cmd`：安装包里那两个 CLI 垫片按 `…/MacOS/DeepSeek Harness`、
  `..\DeepSeek Harness.exe` 拼主程序路径，只改 `productName` ⇒ 装出来的 `dsh` 命令找不到可执行文件。
- `package-macos.ts:81`、`package-target.ts:499`、`smoke-packaged-runtime.ts:16,18`：钉死
  `DeepSeek Harness.app` / `MacOS/DeepSeek Harness` 的产物路径与烟测入口。

0026 因此连着 `src/locale.ts`（en + zh 两侧都写死同一个英文品牌串）、`installer/strings.nsh`、
`installer/extract-report.h` 与 20 来份 `tests/expected/*` 夹具一起改：**57 个文件、170 行**。
尺的分母是"同一范围在 pin 的树上有 171 行命中"，改完 `rg -l "DeepSeek Harness" apps/desktop`
只剩上游自己那两份 README 与它的 i18n 台账（那是上游文档的自称，不是我们的交付面）。

**故意不动的三样**（动它们属安装身份/OS 落点迁移，要使用者点头）：npm scope `@deepseek-ai/*`、
URL scheme `dsh`、Windows 注册表键 `Software\DeepSeekHarness\…`。

改名后的验证：`tsc -p tsconfig.host.json --noEmit` rc=0；被品牌串断言到的
`tray / quit-confirmation / package-macos / windows-sign / package-target-stages / macos-signature`
六个 spec **73 条 rc=0**（全量 124 个文件那次跑到 36 条失败，抽到的两条都是
`Test timed out in 5000ms`，当时本机 load1m≈70 在并行压构建；把 `installed-update-builder.spec.ts`
单独复跑即转绿 ⇒ 归属是负载不是改名）。27 条补丁重放两次同 head `e84f3f0e`，
且重放出的树与手工提交的树同为 `77d70b171115`。

## 第七轮的终局读数（release 真开出来了）

**Release**：`desktop-f1ccc426d32adbe704c53519da24a4043574608f`（标题 `Xaihi desktop …`，08:16:12Z 建），
按字节核对后的 6 条资产：

```
xaihi-0.2.0-rc.2-win-x64-unsigned.exe              287,888,311 B
xaihi-0.2.0-rc.2-mac-arm64-unsigned.dmg            370,221,507 B
xaihi-0.2.0-rc.2-mac-arm64-unsigned.zip            374,547,963 B
xaihi-product-darwin-arm64-product-resources.zip    ~10 MB
xaihi-product-darwin-x64-product-resources.zip      ~11 MB
xaihi-product-linux-x64-product-resources.zip       ~12 MB
```

**这条 release 一开始不是干净的**：它带着 16 个 `win-unpacked/` 里的散装运行时二进制
（`elevate.exe`、`node.exe`、`libreoffice-kit.exe`、`rg.exe`、`python.exe`、`Xaihi.exe` …约 800 MB），
原因是我"收紧上传面"那笔只 `but commit` 了、漏了 `but land` —— 云上跑的仍是旧的 `unsigned-artifacts/**` 上传。
处理：把那条收紧提交补 land（`bf3c9170`），并对已发布的 release 逐条 `gh release delete-asset`
（留 6 条、删 16 条，删前先按 `startswith("xaihi-")` 把去留列表打出来核对）。
教训本身：**"改了"与"生效了"之间差一次读回**——上传面要在资产清单上读回，而不是在 workflow 文件里。

**两条仍红的腿，各自的原因不同（都是现读，不是推）**

- `package-mac (mac-x64)`：0027 之后过了签名闸，红在运行期自检——
  `Error: desktop runtime: docx conversion failed: OfficeToPdfError: LibreOffice conversion failed.` /
  `[cause]: ConversionError: LibreOffice conversion timed out.`（`run prepare:dsh --unsigned`）。
  这条腿是在 arm64 runner 上用 Rosetta 跑 x86_64 的 LibreOffice 做 docx→pdf，超时是那条转换路径的速度问题，
  不是打包面的问题 ⇒ mac 的交付按 arm64 那份出货，x64 那份仍是试验腿。
- `product (win32-x64)`：平台解析修好之后（`Error: spawn pnpm ENOENT` 消失了，
  `pnpm recursive run` 真的跑起来了），红在下一层——
  `× "pnpm recursive run" failed in D:\a\Xaihi\Xaihi\packages\ui-host`。
  也就是 Windows 的 kisaki **产品资源装配**卡在 ui-host 的构建本身，
  这与未提交区里那条 `windows-build-path-portability`（构建脚本用 `.pathname` 取路径，Windows 上盘符被写成
  `D:\D:\`）是同一片归属地；kisaki 的**原生件**在 win32-x64 上是好的（`kisaki-native-win32-x64` 已上传）。

**Linux 的说法保持原样**：`linux-compile` 的 `pnpm -r run build` 过，红在
`pnpm -r run typecheck` ⇒ `packages/node-sdk typecheck: src/define-node.ts(320,45): error TS18046`
+ `(320,56): error TS2698`（别处的账）。别名表那条已按预期不再是障碍——先 `build-aliases.mjs --write`
再 typecheck，这一轮才第一次读到"红在类型而不是红在目录不存在"。

## 工作台随包（0029–0031 + 载荷脚本，2026-10-12 晚）

**要解决什么**：装完打开的是**上游界面**，与检出里组合了什么无关。实测包里根本没有我们的组合：
`rg -a -c 'xaihi-core' /Applications/Xaihi.app/Contents/Resources/app.asar` = **0**，`uiBundleDir`/`dist-ui` 同样 0。
根因有两处：桌面 profile 的初始依赖来自随包 tarball 集、bundle 列表写死在上游常量
（`apps/desktop/src/project-manager.ts:136-142`）；而 `uiBundleDir` 是**我们的** `packages/core` 的配置项
（空串默认 ⇒ 路由 503，`packages/core/src/routes.ts:226`）。

**做法（三件已落 main）**

1. **载荷**：`desktop/desktop-payload.mjs` 拼 `desktop/.products/xaihi-desktop/` = `ui/`（工作台文档产物）
   + `packs/<name>/`（5 个 bundle 的**目录形态**，用目录而非 `.tgz` 以绕开 `workspace:*` 的版本改写）
   + `profile.json`。CI 两条打包腿各加"拼载荷"一步，并把 `XAIHI_DESKTOP_PAYLOAD_DIR` 传给自检与打包。
2. **包内 profile 指向它**（patch 0029 + 0031）：`extraResources` 收进 `Resources/xaihi`；新建 profile 时写
   bundle 依赖（`file:` 目录）与 `xaihi-core` 的 `uiBundleDir` 补丁行。**不设变量时资源表与 profile 与上游逐字相同**，
   正反两向都有用例钉住。0031 修的是 0029 第一版把补丁行**追加**在 `initProfile` 预置的空序列 `[]` 之后
   ——块序列与 `[]` 并存会让装载层直接拒（`YAMLException: end of the stream …(7:1)`），改成替换占位符。
3. **品牌/标题**：`packages/ui-host/src/client/brand.tsx` 占 `sidebar.brand.mark`/`sidebar.brand.name`（`priority: -1`，
   `single` 槽取最小优先级、同优先级撞位会抛）；标记槽用排印式字母标（本仓无 Xaihi 标志美术，也不手画）。
   窗口标题走 patch 0030（构建环境给 `XAIHI_CLIENT_TITLE` 就用它）。

**本机端到端证据（不是单测）**：真载荷 → 真函数铺 profile → **包里的** `runtime/pnpm/bin/pnpm.mjs` 装（+13 包 rc=0）
→ **包里的** `runtime/cli/bin/dsh --profile … --dump-config` **rc=0**，dump 里 `uiBundleDir` 指向载荷的 `ui/`。
这条链当初正是它抓到了 `[]` 那个解析错（单测只断言"文件里有这一行"，量不到"文件根本不能被解析"）。

**云上仍挡着的两处，都在构建面，且都不属于本轮的文件**

- **别名表绝对路径**（已修：载荷步在 `build:document` 前跑 `packages/ui-host/build-aliases.mjs --write`）。
  本机对照：把表根改成 `/nonexistent-xaihi` ⇒ `build:document` rc=1、9 条同类错；`--write` 后 rc=0。
  （该表由另一条 lane 保养，实验动过之后一律按快照逐字节还原并 `shasum` 比对。）
- **孪生别名缺口（未解，且只能由生成器那一处修）**：main 的界面源码已写改后的名字
  （`packages/ui-host/src/nodes/kisaki/use-kisaki-workbench.ts:269` 引 `@hibernalglow/xaihi-kisaki/selection-strategies`），
  而 main 的 `build-aliases.mjs` 只产 `@xiranite/node-<id>/<leaf>` ⇒ runner 上 `build:document` 报 30 条
  `Can't resolve '@hibernalglow/xaihi-…'`。**我试过在构建侧自己补，两次都被证伪**：
  只补 `@xiranite/node-*` 的孪生 ⇒ 187 条、与生成器少 10 条（漏 `@xiranite/cli-runtime/*`），补完仍 rc=1；
  把 `@xiranite/<rest>` 整体换名 ⇒ 数量也 197，但**只有 10 条与生成器重合**（生成器连 `…/selection-assistant.test`
  这种叶子都进，`@xiranite/` 侧没有对应键）；改用生成器**已导出**的 `nodeCoreAliases()` 数据做同样映射 ⇒ 仍 31 条错。
  ⇒ 这一族有自己的规则，下游照抄必漂；**正解是生成器产出孪生名**（该改动已写在 `windows-build-path-portability`
  那条 lane 上、尚未落 main）。本机把它剥成 main 形态即可复现（202 键 ⇒ rc=1、31 条同类错；补回去就绿）。
