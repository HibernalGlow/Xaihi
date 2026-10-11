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
  Windows 那条不需要系统 dav1d：`SYSTEM_DEPS_DAV1D_BUILD_INTERNAL=always`（system-deps 7.0.8 的开关）
  让 dav1d-sys 自己 meson 静态编，产 MSVC 能链的 `.lib`，产物也就没有动态依赖。
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
- Windows 腿的 `--no-dav1d` 在这台机上读不回装载项（没有 nm/dumpbin），脚本会打一行"那是声明不是实测"；
  真判据要等 windows-latest 那一跑。
