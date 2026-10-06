# 阶段实测：TUI 这一腿到底能不能跑

对应 roadmap R11、`docs/adr/0006-ui-source-is-xiranite.md`「裁定：终端面…」。
来源对照：Xiranite tag `noxide`（commit `ccf465fe65966bb5c44a13f78f36ec80d6eb94a5`，只读基线
`/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide`）与上游活体 checkout `/Users/glow/Base/Code/Freya/Xiranite`。

本报告只记录**执行过的命令与真实 rc**。本仓唯一写入是这份文件；`packages/logging`、`packages/cli*`、
`scripts/`、任何 manifest 都没动，`pnpm install` 一次都没跑（另一条 lane 正在重做 lockfile）。

## 0. 机器与前置读数

| 判据 | 命令 | 结果 | rc |
| --- | --- | --- | --- |
| Node | `node -v` | `v26.10.0` | 0 |
| npm | `npm -v` | `11.19.1` | 0 |
| 架构 | `uname -m` | `arm64` | 0 |
| 系统 | `sw_vers` | macOS `ProductVersion: 27.0.1` / `BuildVersion: 26A434` | 0 |
| 本机可选 Node | `ls ~/.nvm/versions/node`、`which -a node` | 只有 `/opt/homebrew/bin/node` 一条 | 0 |
| 仓内 opentui | `ls node_modules/.pnpm \| rg -c opentui` | 无输出（零命中） | 1 |
| `packages/logging` 自己的 `node_modules` | `ls -d packages/logging/node_modules` | `No such file or directory`（这个包从没装过） | 1 |

⇒ 委托前题成立：**TUI 源码在树里，但从没被安装过，也没被执行过**。下面所有"能跑"都只指探针目录里那次安装。

## 1. 隔离探针的安装事实（仓库外）

探针根：`/Users/glow/Base/Code/Freya/.scratch/tui-probe`（自建 `package.json`，`"type": "module"`）。

```
mkdir -p /Users/glow/Base/Code/Freya/.scratch/tui-probe          # rc=0
npm install --prefix … @opentui/core@0.4.5 @opentui/react@0.4.5  # rc=0，"added 20 packages in 3s"
npm install --prefix … vitest@4.1.10                             # rc=0，"added 44 packages in 5s"
npm install --prefix … zod@4.3.6                                 # rc=0（fsevents 装后脚本未批准，只是 warning）
```

**没走代理**：`env | rg -i proxy` rc=1（零命中），`npm config get proxy`/`https-proxy` 均 `null`，
`npm config get registry` = `https://registry.npmmirror.com`。三次 install 全 rc=0，所以 7890 那条路没用上。

`npm ls --depth=0`（rc=0）：

```
tui-probe@0.0.0
+-- @opentui/core@0.4.5
+-- @opentui/react@0.4.5
+-- vitest@4.1.10
`-- zod@4.3.6
```

`npm ls --depth=1`（rc=0）里的关键传递项：`@opentui/core-darwin-arm64@0.4.5`（已装）、
其余 7 个平台包 `UNMET OPTIONAL DEPENDENCY`（本机 arm64 darwin，正常）、
`react@19.3.0`、`react-reconciler@0.33.0`、`bun-ffi-structs@0.2.4`、`web-tree-sitter@0.25.10`、`ws@8.22.0`。
`react` 不是我装的，是 `@opentui/react` 带进来的 19.3.0；`packages/logging/package.json:41` 声明的是 `^19.2.4`，
同一主版本，所以 `Tui.test.tsx:3` 那个 `import { act } from "react"` 解析到的形状与本包声明一致。

## 2. 决定性判定：OpenTUI 0.4.5 能不能在没有 Bun 的 Node 下建 renderer

**能。** 三条执行过的证据，全部 `node v26.10.0 darwin/arm64`。

### 2.1 纯 core，连 TTY 都不要

`probe-core.mjs`（`createCliRenderer({ exitOnCtrlC: true, screenMode: "alternate-screen" })`
+ `BoxRenderable` + `TextRenderable` + `renderer.idle()` + `destroy()`）：

```
node probe-core.mjs > /tmp/core-notty.out 2>/tmp/core-notty.err   # rc=0
```

stdout 里抓到真实绘制结果：`┌──────────…`、`OPEN TUI CORE RENDERS UNDER NODE`。
stderr 166 字节，只有一句 `ExperimentalWarning: FFI is an experimental feature and might change at any time`。
同程序进真 PTY（`script -q /dev/null node probe-core.mjs`）也 rc=0、`rg -c` 命中 1。

### 2.2 照抄 tui-runner 的调用面，在真 TTY 下

`probe-real.mjs` 镜像 `packages/logging/src/tui-runner.tsx:13-25` 的真实调用：
`createCliRenderer({ exitOnCtrlC, clearOnShutdown, useMouse, screenMode: "alternate-screen", onDestroy })`
→ `createRoot(renderer)` → `root.render(<box><text/></box>)` → `root.unmount(); renderer.destroy()` → `await destroyed`。
（写成 `createElement` 是为了让纯 `node` 不经过 JSX 转换也能跑；选项集与生命周期一字不差。）

```
script -q /dev/null node --import ./hooks-rr.mjs probe-real.mjs   # rc=0
```

stderr 行（ANSI 剥掉后）：

```
PROBE node v26.10.0 darwin/arm64 stdin.isTTY=true stdout.isTTY=true
PROBE createCliRenderer -> CliRenderer
PROBE idle done; no captureCharFrame
PROBE onDestroy resolved; exit clean
```

PTY 捕获里 `rg -c 'RENDERS UNDER NODE'` = 1（rc=0），并能看到 `┌────…` 边框 → **react 层 + core 层同时在 Node 上落地**。
`onDestroy` 不是我们臆造的选项：`node_modules/@opentui/core/renderer.d.ts:48` 有 `onDestroy?: () => void`。

### 2.3 唯一挡住"裸 node 直接 import @opentui/react"的东西（失败类别：ESM 子路径解析，不是原生/不是 Bun/不是 TTY）

同一份 `probe-real.mjs` 不加 loader 钩子：

```
node probe-real.mjs                        # rc=1（重定向到文件复测仍 rc=1）
script -q /dev/null node probe-real.mjs    # rc=1，真 TTY 下同一错误 ⇒ 与 TTY 无关
```

原文错误：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/Users/glow/Base/Code/Freya/.scratch/tui-probe/node_modules/react-reconciler/constants'
imported from …/node_modules/@opentui/react/chunk-hjtp6jv9.js
Did you mean to import "react-reconciler/constants.js"?
```

出处：`node_modules/@opentui/react/chunk-hjtp6jv9.js:162` 与 `:247` 都写了无扩展名的
`import … from "react-reconciler/constants"`；`react-reconciler@0.33.0` 的 `package.json` 只有 `"main": "index.js"`、
**没有 `exports` 映射**，目录里实际是 `constants.js`；Node 的 ESM loader 不做扩展名猜测。
⇒ 类别 = **ESM/CJS 解析（第三方包的上游打包缺陷）**，不是「缺 darwin-arm64 原生件」、
不是「要 Bun 运行时 API」、不是「要控制终端」。（上游同版本同现象，见 §4 与 §5。）

### 2.4 它依赖的其实是 Node 的 FFI：两条阳性对照

core 的 Node 腿走 `node:ffi`（`node_modules/@opentui/core/chunk-node-q0cwyvm9.js:355-358` 的
`createNodeBackend(nodeFfi)` → `nodeFfi.dlopen(...)`；`chunk-node-…:12085` 的 `dlopen(resolvedLibPath, …)`）。

```
node --no-experimental-ffi probe-core.mjs   # rc=1
Error: Failed to initialize OpenTUI render library: OpenTUI native FFI is not available for this runtime yet
    at resolveRenderLib (…/@opentui/core/chunk-node-q0cwyvm9.js:15392:13)

node --permission --allow-fs-read='*' probe-core.mjs   # rc=1
Access to this API has been restricted. Use --allow-ffi to manage permissions.

node -e 'import("node:ffi")'   # rc=0，exports: DynamicLibrary,default,dlclose,dlopen,dlsym,…
```

⇒ 两个前提被钉死：**`node:ffi` 必须开着**（本 Node 默认开、带 ExperimentalWarning），
**在 Permission Model 下要 `--allow-ffi`**。文档位（未实测）：`nodejs.org/api/ffi.html` 写 `Added in: v26.1.0`、
`Stability: 1 – Experimental`。而本仓根 `package.json:7-9` 的 engines 是 `"node": "^22.19.0 || >=24.0.0"`
⇒ **声明支持的运行时有两条腿根本没有 `node:ffi`**；本机只装了一个 Node，`^22.19` / `24.x` 下会怎样**我没测**。

对照跑通的另一条运行时：`script -q /dev/null bun probe-real.mjs` → rc=0，四条 PROBE 行齐（`bun 1.4.2`；
那条 `PROBE node v26.3.0 …` 里的 `process.version` 是 bun 的 Node 兼容号，不是真 Node）。

## 3. 把**我们**那份 Tui.test.tsx 拿去打已装的包

复制（逐字节，未改内容）：`packages/logging/src/{schema.ts,query.ts,Tui.tsx,Tui.test.tsx}` → `tui-probe/src/`。
闭包是完整的：`Tui.test.tsx` 引 `./schema.js` + `./Tui.js`，`Tui.tsx` 引 `./query.js`，`query.ts` 引 `./schema.js`，`schema.ts` 引 `zod`。
`tsconfig.json` 直接拷 `packages/logging/tsconfig.json`（含 `jsx: react-jsx` + `jsxImportSource: @opentui/react`）。

### 3.1 反面：只配 JSX、不给 alias/inline

第一版 `vitest.config.ts`（`esbuild.jsx` + `environment: node`）：

```
npx vitest run --config vitest.config.ts src/Tui.test.tsx    # rc=1
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored.
Error: Cannot find module '…/node_modules/react-reconciler/constants' imported from …/@opentui/react/chunk-hjtp6jv9.js
```

（顺带一条 vitest 4 的事实：**vitest 4 已经不吃 `esbuild` 选项，吃 `oxc`**。）

### 3.2 正面：上游那份 config 逐字照抄 ⇒ 绿

`vitest.upstream.config.ts` = `/Users/glow/Base/Code/Freya/Xiranite/packages/logging/vitest.config.ts` 的逐字副本
（`resolve.alias["react-reconciler/constants"] = "react-reconciler/constants.js"`
+ `test.server.deps.inline: [/@opentui\/react/]` + `environment: "node"`；**没有任何 JSX 设置**，
JSX 完全由拷过来的 `tsconfig.json` 决定）。

```
npx vitest run --config vitest.upstream.config.ts src/Tui.test.tsx    # rc=0
 ✓ src/Tui.test.tsx (1 test) 18ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

输出是**管道给 `tail`** 的（`piped stdout isTTY = undefined`）⇒ **headless 路径成立，不需要 TTY**。

### 3.3 阳性对照：断言是活的

```
sed 's/XIRANITE LOG EXPLORER/NOT-PRESENT-XYZ/' src/Tui.test.tsx > src/Tui.falsify.test.tsx
npx vitest run --config vitest.config.ts src/Tui.falsify.test.tsx    # rc=1
AssertionError: expected '┌────────────────────────────────────…' to contain 'NOT-PRESENT-XYZ'
```

对照文件跑完即删（`rm src/Tui.falsify.test.tsx`）。

## 4. 平台原生件：装到的到底是什么

`node_modules/@opentui/core/package.json` 的 `optionalDependencies`（0.4.5，8 条）：
`core-darwin-x64`、`core-darwin-arm64`、`core-linux-x64`、`core-linux-arm64`、`core-win32-x64`、
`core-win32-arm64`、`core-linux-x64-musl`、`core-linux-arm64-musl`。

本机装到的那一件（`ls node_modules/@opentui/` → `core  core-darwin-arm64  react`）：

```
@opentui/core-darwin-arm64 0.4.5  os=["darwin"] cpu=["arm64"]
file …/libopentui.dylib  →  Mach-O 64-bit dynamically linked shared library arm64   (3,777,856 字节)
```

上游活体 checkout 的对照（同一台机器）：
`rg -n opentui /Users/glow/Base/Code/Freya/Xiranite/package.json` → `285: "@opentui/core": "0.4.5"`、
`286: "@opentui/react": "0.4.5"`（根 manifest 的 devDependencies），
`/Users/glow/Base/Code/Freya/Xiranite/packages/cli/package.json` 把同两个 0.4.5 写成 dependencies。
它的 `node_modules/@opentui/` 同样是 `core  core-darwin-arm64  react`，`file` 同一句 Mach-O arm64。

⇒ **平台件不缺，版本不漂**：我们声明的 pin 与上游一致，darwin-arm64 的 dylib 装得下来、加载得了。

## 5. 我们的移植缺了上游 TUI 需要的哪一块

**缺 `packages/logging/vitest.config.ts`。** 逐条实测：

- `ls -a /Users/glow/Base/Code/Freya/Xaihi/packages/logging/` → `README.md package.json src tsconfig.json`，没有 vitest 配置。
  `packages/cli`、`packages/cli-runtime` 同样没有（`ls packages/cli packages/cli-runtime`）。
- 只读基线 `ccf465fe` 里也没有：`ls .scratch/xiranite-noxide/packages/{cli,logging}/` 只有
  `package.json src tsconfig.json`（`packages/cli` 连 README 都没有）。
- 上游现在**有**：`Xiranite/packages/logging/vitest.config.ts`（内容见 §3.2），
  以及 `Xiranite/packages/cli/vitest.config.ts`（同一段 alias+inline，注释里写清了为什么）。
  它的引入记录：`git log --oneline -- packages/logging/vitest.config.ts` →
  `78ecd201 test(logging): Tui.bun.test.tsx→Tui.node.test.tsx 收进主 test …；包内新增 vitest.config.ts 只为 OpenTUI 的 @opentui/react inline 与 react-reconciler/constants 扩展名`。
  ⇒ **这是 tag 之后才长出来的上游修复，我们按 `ccf465fe` 抄，抄不到它。**
- 测试文件本身我们已经做完了那一半改名：
  `diff .scratch/xiranite-noxide/packages/logging/src/Tui.bun.test.tsx packages/logging/src/Tui.test.tsx` → rc=1，
  差异只有一行：`import { expect, test } from "bun:test"` → `"vitest"`。
  `diff …/Tui.tsx packages/logging/src/Tui.tsx` → **rc=0（逐字节一致）**；
  `diff …/tui-runner.tsx packages/logging/src/tui-runner.tsx` → rc=1，差异只有第 5 行的包名
  （`@xiranite/cli-runtime` → `@hibernalglow/xaihi-cli-runtime`）。
- 副作用（不在这次范围内，只登记）：`packages/logging/src/Tui.tsx:38` 与
  `Tui.test.tsx:12,19` 仍带着旧品牌串（`XIRANITE LOG EXPLORER`、`serviceName: "xiranite"`），
  与基线逐字节一致——它们是 `check:brand` 接线时要连 JSX 一起改的消费者，不是我该在这里动的东西。

## 6. 门禁视角的"把它变真"还差什么（列事实，不做决定）

1. `pnpm-workspace.yaml` 现在写着 `- '!packages/logging'`，所以 `@opentui/*` 永远不会被装进仓内任何 `node_modules`。
   放行条件这条已经写在同一个文件的注释里（依赖图里的 `@xiranite/*` `workspace:*` 要先换成 Xaihi 真名）。
2. `packages/logging` 需要一个 §3.2 那份 `vitest.config.ts`（alias + inline + `environment: node`）；
   没有它，就算装了包，`vitest run src` 仍是 rc=1 `ERR_MODULE_NOT_FOUND`。
3. 运行时下限：`node:ffi` 是 `v26.1.0` 才有的实验特性（§2.4），本仓 engines 允许 `^22.19.0 || >=24.0.0`。
   要么把 TUI 腿的运行时下限写成一条被 ADR 点名的约束，要么接受"这条腿只在 Node ≥26.1 上工作"。
   DSH 的 Permission Model 还要 `--allow-ffi`（实测 rc=1 那句原文）。
4. vitest 4 不吃 `esbuild` 选项（§3.1 那句 warning）——照搬上游 `esbuild:{jsx:"automatic"}` 风格的配置在
   本仓 `vitest@^4.1.10` 上会静默走 oxc，`react-reconciler` 那条 alias 反而是**必须**的。

## TUI 这一腿现在能承诺什么、不能承诺什么

**已装且实机执行过（`/Users/glow/Base/Code/Freya/.scratch/tui-probe`，不在仓内）：**

- OpenTUI `0.4.5` 在 **Node v26.10.0 / darwin-arm64 / 无 Bun** 下能建 renderer：core 腿连 TTY 都不要（rc=0），
  core+react 腿在真 PTY 下走完整生命周期（`createCliRenderer → createRoot → render → unmount → destroy → onDestroy`，rc=0）。
- darwin-arm64 原生件齐全：`@opentui/core-darwin-arm64@0.4.5` 的 `libopentui.dylib`（Mach-O arm64，3,777,856 字节）加载成功。
- **仓里那份 `Tui.test.tsx` + `Tui.tsx` + `query.ts` + `schema.ts` 原样搬出仓外就能跑绿**：rc=0、1 passed、18ms，
  headless（stdout 是管道）；断言非空转（把期望串换掉立刻 rc=1）。
- 唯一挡在裸 Node 面前的缺陷被定位到行：`@opentui/react` 的 `chunk-hjtp6jv9.js:162/247` 那条无扩展名 import。
  上游的解法（alias + inline）逐字搬进探针即成立 ⇒ **移植本身是健康的，卡的是 workspace 管线，不是代码**。

**没做过、因此不承诺：**

- **本仓内**没有任何一次安装或执行：`pnpm install` 一次没跑，`packages/logging` 仍在 workspace 之外，
  仓内 `node_modules/.pnpm` 对 `opentui` 零命中（`rg -c` rc=1），`packages/logging/node_modules` 这个目录压根不存在
  （`ls -d` rc=1）。
  ⇒ 现在说"TUI 已迁移"仍是假的；真话是"**上游那把钥匙已被实测确认存在，且我们缺的只是那把钥匙本身**"。
- `packages/logging` 其余测试（`cli.test.ts`、`core.test.ts`、`node.test.ts`）**没搬进探针、没跑**。
- `packages/cli-runtime/src/tui/**`（31 文件、19 个 `.tsx`）与 `@hibernalglow/xaihi-cli-runtime` 的
  `./terminal/opentui` 那条导出**没被这个探针覆盖**——探针只吃 `packages/logging` 这一条 TUI。
- `packages/cli-runtime` 依赖里点到的 `sharp`、`sixel` **没装、没跑**；图片相关的那条 TUI 腿在 Node 下能否成立，未知。
- Node `^22.19.0` 与 `24.x` 两条腿**没测**（本机只有 homebrew 一个 Node）；`>=26.1` 才有 `node:ffi` 这一条来自官方文档，属文档位。
- Windows / Linux 平台腿**没测**（对应 optionalDependencies 在 macOS 上是 UNMET OPTIONAL DEPENDENCY，正常）。
- 生产入口的**端到端**没测：`xlogs` bin、`runLogTui` 经 `CliHost` 的真实 stdin/stdout 接线、
  以及它在 DSH 宿主里被拉起来的样子——探针驱动的是 `tui-runner.tsx` 的那 13 行调用面，不是它的宿主。
- `pnpm --filter @hibernalglow/xaihi-logging test:unit`、`check:pins`、`check:installable`、`check:brand`
  全仓门禁**一律没跑**（另一条 lane 在飞，仓级结果不可归因）。

## 主 agent 亲自复跑的两条（不采信代理的叙述）+ 它逼出来的一条 engines 冲突

复跑探针（`/Users/glow/Base/Code/Freya/.scratch/tui-probe/probe-core.mjs`，本机 Node **v26.10.0**）：

```
$ node probe-core.mjs                      → rc=0    （终端里真画出帧，收尾 "CORE: destroyed cleanly"）
$ node --no-experimental-ffi probe-core.mjs → rc=1
  Error: Failed to initialize OpenTUI render library: OpenTUI native FFI is not available for this runtime yet
```

⇒ "OpenTUI 能在 Node 上跑、不必回到裸 bun" 这条**由我自己跑过**，与之前那次量到的
`opentui 0.4.5 有 node 条件导出` 是同一件事的两半。仓内还差两件（都不在 TUI 代码本身）：
`packages/logging` 没有 `vitest.config.ts`（上游是打完 tag 之后的 `78ecd201` 才加的，
里面那两条——`react-reconciler/constants` 指到 `.js` 与 `server.deps.inline: [/@opentui\/react/]`——
少一条就是 `ERR_MODULE_NOT_FOUND`），以及 `@opentui/*` 在本仓从未安装。

**量出来的新冲突，是要人拍的一条**：装载 `node:ffi` 才有那条 rc=0，
而根 `package.json:8` 现在写的是 `"node": "^22.19.0 || >=24.0.0"`——
这个式子放进来的版本里，`ui` 那条腿**跑不起来**（`--no-experimental-ffi` 那次 rc=1 就是它的症状）。
两种处置都不该我替使用者定：

1. **抬 engines**（把 TUI 变成"只有新 Node 才有"的硬条件）——代价是同一份包里 GUI/CLI 被连带抬高门槛；
   本机也没装 22/24 可以当场证伪"22.19 到底行不行"，所以这一条要先在别的 Node 上量一次再说。
2. **运行时探一次 + 可见退化**（照 ADR-0011 决定 4 的形状：探不到 `node:ffi` 就把 `ui` 这条腿
   标成"这台机的 Node 不支持"，界面上读得回来，不假装能开）——它不动 engines，
   代价是 TUI 成"按 Node 版本可选的能力"，而落点要挑在 workspace 内的包
   （`packages/logging` 与 `cli-runtime` 现在都在 workspace 外，见 `pnpm-workspace.yaml` 的负向条目）。

第 2 条与本仓既有纪律同向（"不许崩、不许静默、更不许伪造"），但它是**一次契约/接线改动**，
不是我这轮顺手能替使用者定的事，所以只把读数与两条路摆在这里。
