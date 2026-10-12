# ADR-0027 云端桌面包只出未签名 Nightly

状态：接受（2026-10-12）
决策人：HibernalGlow（用户 2026-10-11 口径："授权 B：云端不签名 / ad-hoc 签名（推荐 Nightly）"，
并同期授权把 `desktop/` 那一层一起提交、允许给 `desktop/product.mjs` 加 `--platform/--arch`）
相关：ADR-0011（桌面壳边界与降级铁律）、ADR-0010（品牌自称 Xaihi）、
`desktop/patches/dsh/README.md`（0023/0024/0025 三条的判据）、
`docs/stages/desktop-cloud-packaging-2026-10-11.md`（五轮派发读数）

## 背景

云端要同时出 Windows 与 macOS 的安装包。上游 `apps/desktop` 的打包编排把"签名"当成**前置条件**而不是**开关**：

- `--unsigned` 原本只收 `win-x64`（`package-target.ts:237`）。
- darwin 的 `forceCodeSigning` / `notarize` 在配置里是常量（`electron-builder-config.mjs:156,163`），
  整条 darwin 产物路径又包在签名钥匙串包装里（`package-target.ts:369-370`）。
- 没有凭证时**连只读的 `--check` 都过不去**：`desktop-package-environment.mjs:96-111` 要
  Developer ID 身份、公证策略，还要求那份 p12 真的可读。

也就是说，"在 GitHub Actions 里打 mac 包"这件事，要么把 Apple 凭证搬进 CI secrets，要么改上游。
本仓的边界是 ADR-0011：**不 fork DSH**，我们的改动以 `desktop/patches/dsh/*.patch` 的形式存在，
靠 `node desktop/sync-dsh.mjs` 重放。

## 决定

1. **云端不出带签名的包。** GitHub Actions 里不配 Developer ID p12、不配 Apple 公证凭证；
   mac 与 win 两条腿一律带 `--unsigned`。
2. **darwin 的未签名支路用一条 patch 打开**（0023）：跳过签名身份解析、钥匙串包装、公证两条泳道与签后校验；
   产物**沿用上游已有的隔离约定**——文件名带 `-unsigned` 后缀、落在 `unsigned-artifacts/` 目录，
   `publish: null` 且不写 release record（Updater 元数据一条都不生成，未签名的货不进更新通道）。
3. **可见退化按 ADR-0011 决定 4 落在产物名上**：`deepseek-harness-<version>-mac-arm64-unsigned.dmg`
   这种文件名本身就是"这份没签名"的读回面。使用侧的后果直说：Windows 装的时候 SmartScreen 会拦，
   macOS 没公证 ⇒ Gatekeeper 会拦。
4. **要带签名的那份不在云端做**：在配了凭证的机器上用同一条命令**不带** `--unsigned` 打，
   步骤形状不变（0023 只在 unsigned 分支上改行为）。这条留成 secrets 面的待办，不是本条的隐含承诺。

## 与 DSH API 的关系

只动上游 `apps/desktop` 的打包编排，运行时 API、设置面、配置出口都没碰。
发布设置的入口也没换：仍然只从 `apps/desktop/.env.macos` / `.env.windows` 读，同名环境变量被剥掉、
未知键拒（`desktop-package-environment.mjs:16-19,29-60,47-50`）。CI 里这两个文件由 workflow 步骤
从 GitHub Secrets 现场生成，值不落日志（只把每行等号后面替换掉再打印键名）。

同一条链上另外两条 patch 是这条决定的直接代价——云端第一次真跑打包链才暴露它们：

- 0024：`runPnpm` 无差别把 `npm_execpath` 交给 node 当脚本，而 pnpm 在 Windows 发的是原生 `pnpm.exe`
  ⇒ `ERR_UNKNOWN_FILE_EXTENSION`。规则本来就有（根 `scripts/pnpm-invocation.ts:15-19`），只是没被打包编排用上。
- 0025：0018/0020 加给 `DevelopmentAppOptions` 的可选字段没算上 `exactOptionalPropertyTypes`
  ⇒ `build:lib:host` 的 `tsc` 以 `TS2379` 打回。`check:package` 不跑类型检查，所以这条只能被"真跑打包"抓到。

## 明确不做

- **不把产品资源（`desktop/.products/<id>/` 里的 `.node` 与 dylib）塞进安装包。** 上游的
  `extraResources` 是写死两条（`electron-builder-config.mjs:129-149`），没有目录或环境变量约定可挂，
  而且上游测试钉着条数 ⇒ 要合成一份货得再加一条 patch。本决定的交付形态是**安装包与产品资源各交一份**，
  Release 里两类资产并排。
- **不出 Linux 安装包。** 上游合法目标只有 `mac-arm64|mac-x64|win-x64`，传 linux 直接
  `unsupported target`（`package-target.ts:176`），Linux 主机自己 `unsupported build host`（:206）。
  Linux 那条腿的红绿说的是"Xaihi 在 Linux 上编得出来、测得过"，不是"有 Linux 安装包"。
- **不把 `desktop/` 放进任何门禁的扫描根**（ADR-0011 的边界实测见 `desktop/README.md`）。

## 后果

- 云端能稳定产出四平台原生件 + Windows/macOS 安装包 + kisaki 产品资源，代价是使用者装的时候要过一道
  系统拦截的提示；这条在 Release 正文里逐平台写清，不藏在文件名里。
- "能不能出包"从"有没有凭证"变成"补丁链对不对"：桌面腿的失败原因回归到代码与 CI 形状本身，
  五轮派发读数全部可复现（阶段文档里那一张表）。
- 更新通道保持关闭（`publish: null`）：未签名的 Nightly 不会被官方 Updater 当作可升级源，
  签名的正式发布仍是人工/独立 runner 的事。
