# 脚手架的仓外验收：两处真缺陷与修法（2026-10-07）

计划里 Step 3 的验收判据是那句"**在仓库外临时目录跑脚手架生成一个新插件，不手改一行、
`pnpm build` 后直接 `dsh plugin --profile xaihi add <绝对路径>` 能过 Gate 2.1—2.5**"，
它是"以后新增节点只需要 create-xaihi-plugin"这句话的证。
`docs/stages/step-3.md` 里那份证据是**仓内**生成（`plugins/linedup`），仓外那一次今天才真跑，
一跑就红：**同一个包在仓内绿、在仓外连 `pnpm run build` 都进不去**。这一页记的是那两处缺陷、
修法，和修完之后真跑过的那一整条链。

## 1 第一次跑：不改一行，四条命令里三条红

```
$ node packages/create-xaihi-plugin/lib/index.js demo <仓外目录> --sdk-version "file:<仓>/packages/node-sdk"
GEN_RC=0        # 12 个文件落地
$ cd <仓外目录> && pnpm install
INSTALL_RC=0    # 497ms——版本全部命中现成 store，顺带证明脚手架的 pin 与仓内一致
$ pnpm run build      → BUILD_RC=1
$ pnpm run typecheck  → TC_RC=2
$ pnpm run test:unit  → TEST_RC=1     Test Files 2 failed (2)，Tests no tests
```

## 2 缺陷一：生成的 `tsconfig.json` extends 一个仓内才存在的路径

生成的那份是逐字 `{"extends": "../../tsconfig.base.json", …}`——**这条相对路径只在 Xaihi 工作树里成立**。
仓外目录里 `../../` 之上没有 `tsconfig.base.json`（实测 `ls: ../../tsconfig.base.json: No such file or directory`），
于是 tsdown 的 `rolldown-plugin-dts` 在 `get-tsconfig` 的 `readTsconfig` 里抛，
`typecheck`、`test:unit` 是同一条缺文件的下游（三条红一个根因）。

修法不是"把选项内联进 tsconfig"（那会造出第二份编译器约定，仓内 27 个包还是 extends，
两边一起漂更糟），而是给脚手架一个**独立仓那一档**：

- 新开关 `--standalone`：额外写一份 `tsconfig.base.json` 快照进生成的包，并把 extends 改成 `./tsconfig.base.json`。
- 默认档**一字未动**，仍是 `../../tsconfig.base.json` ⇒ 仓内那一族的形状不变。
- 快照会漂这件事不靠"生成时去读仓根那份"来防（发布形态 `pnpm dlx` 下仓根不存在），
  而是由**本仓的测试**钉：`deepStrictEqual(快照.compilerOptions, 仓根 tsconfig.base.json.compilerOptions)`，
  漂了在 CI 红。断言里还有一条是真的落到 `mkdtemp(tmpdir())` 里生成后**把 extends 解析出来的那个文件读一次**——
  只查字符串的测试看不见"路径不存在"这件事。

顺手修了一条解析缺陷：`parseArgs` 原来对任何 `--flag` 一律吞掉后一个 token，
所以 `--standalone demo3 /tmp/x` 会把包名当开关值吃掉，症状是"kebab-case 名字不合法"——
**报的是名字，缺的是这个开关**。现在值-less 开关单独认。

## 3 缺陷二：`types: ["node"]` 点名了类型库，包却没声明 `@types/node`

修掉第一条之后 `build` 与 `test:unit` 绿了，`typecheck` 仍红：

```
error TS2688: Cannot find type definition file for 'node'.
  The file is in the program because: Entry point of type library 'node' specified in compilerOptions
```

生成的 `devDependencies` 里根本没有 `@types/node`——**仓内靠 workspace 提升蒙过去了**
（根 `package.json` 有 `"@types/node": "^22.20.0"`，仓内任何一包都碰得到），
独立成仓就没有提升这回事。这正是"本地全绿而分支自死"那一类的另一张脸。

修法与一条通用规则：给生成的包补上 `'@types/node': '^22.20.0'`（与仓内各包同一档），
并加一条**不是给 `@types/node` 开洞**的断言——
`tsconfig.compilerOptions.types` 里的每一项都必须在 `devDependencies` 里有对应的 `@types/*`，
默认档与 `--standalone` 档各跑一遍。以后谁往 `types` 里加 `vitest/globals` 之类别指望提升。

## 4 修完之后真跑的那一整条链（仓外，不改一行）

```
$ node packages/create-xaihi-plugin/lib/index.js demo3 <仓外目录> --standalone --sdk-version "file:<仓>/packages/node-sdk"
GEN_RC=0         # 13 个文件：比默认档多 tsconfig.base.json
$ pnpm install   → INSTALL_RC=0
$ pnpm run build → BUILD_RC=0      dist/remoteEntry.js、lib/index.js、lib/cli.js 都在
$ pnpm run typecheck → TC_RC=0     $ tsc --noEmit
$ pnpm run test:unit → TEST_RC=0   Test Files 2 passed (2) / Tests 8 passed (8)
```

脚手架自己那一侧：`pnpm --filter @hibernalglow/create-xaihi-plugin test:unit` ⇒
**Test Files 1 passed (1) / Tests 18 passed (18)**（这一轮加进 5 条），`typecheck` rc=0，`build` rc=0。

## 5 装进真宿主：一条时序坑，值得单独记

```
$ pnpm plugin:add <仓外目录>            ADD_RC=0
+ @hibernalglow/xaihi-demo3 link:../../../xaihi-scaffold-e2e/demo3
$ curl …/xaihi/manifest.json            plugins: 27     demo3 present: false   ← 读早了
```

我以为这条会直接读到 28。真因不是缓存（`packages/core/src/index.ts:276` 的 `discover(ctx)` 是
**每次请求现读**，`debug.json` 那条路由同一条路径），而是 `pnpm` 打印 "Done" 之后那条
`link:` symlink 才刚落盘。**同一串命令里紧跟着读会读到旧数**——这条得写下来，
因为"宿主没看见"和"我读早了"症状一模一样，而后者不需要修任何东西。
过三秒再读：

```
$ curl …/xaihi/manifest.json
plugins: 28   demo3: {"id":"xaihi-demo3","panels":["xaihi.workspace.demo3"],"ui":{"remote":"demo3","entry":"./dist/remoteEntry.js"}}
$ node scripts/check-remotes-live.mjs --quiet
check-remotes-live: 宿主 127.0.0.1:3199 注册 28 项，判了 28 条同级 chunk，跳过 0 条 …
产物全部经真的路由取得，陈旧 rev 与两种穿越写法都被拒          LIVE_RC=0
$ pnpm plugin:remove @hibernalglow/xaihi-demo3                  RM_RC=0
$ curl …/xaihi/manifest.json      → plugins: 27，demo3 present: false
$ node scripts/check-remotes-live.mjs --quiet                   LIVE_AFTER_RC=0
$ curl -o /dev/null -w "%{http_code}" …/xaihi/history.json      → 200
```

⇒ 计划里 Gate 2.1/2.3/2.4 与"卸掉之后外壳不破"那条（2.5 的非模型部分）现在都是**用脚手架产的仓外包**证的，
不再依赖已经删掉的 `plugins/hello`。仍然没证的还是同一条模型调用那半截（要使用者点头，见
`docs/stages/live-remotes-2026-10-07.md` 第 5 节）。

## 6 与 DSH / 上游的关系

- `link:` 而不是 `file:`：新版 pnpm 对目录依赖走 link（软链），profile 读的是**仓库外那个目录本身**；
  `--frozen` 那份 6 个老条目仍是拷贝。判"宿主读的是哪份"的办法在 `live-remotes` 第 3 节：比 sha。
- `package.json#xaihi` 与 `dsh.bundle.patch` 两条由脚手架一起写（插件即 bundle，ADR-0002），
  这次实机证明"少一条都不会被装载"不是口号：demo3 靠这两条被看见。
- 生成的 `rspack.config.mjs` 里 `shared.react.import:false` ⇒ 拿不到宿主 React 就硬失败，
  这一条本轮没在浏览器里验（D9 不开 GUI），它仍是 compile-verified only。

## 7 这轮没跑的部分（别当成跑过）

- 浏览器里那个面板真的画出来（要 `dist-ui`，它现在被 6 条构建错挡着，见 `live-remotes` 第 5 节）。
- 发布形态 `pnpm dlx @hibernalglow/create-xaihi-plugin`（SDK 还没发包，`--sdk-version` 的发布档没实测）。
- Windows 那一侧的同一条链（本机是 mac；PTEROSAUR 那台是 Rust 用的）。
