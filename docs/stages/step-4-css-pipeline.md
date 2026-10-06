# 阶段报告：CSS 通路（搬运树的 Tailwind v4 样式 → 浏览器）

对应计划 Step 4（界面半边）的最后一道阻塞。判据在 `docs/adr/0006-ui-source-is-xiranite.md`、
落点在 `docs/adr/0007-component-placement.md`（结论 5 与它那条"要落成构建期断言"的后果）。
本文件只讲 CSS 这一刀；搬运本身与挂载见 `step-4-ui-port.md`。

## 一、改了什么

四个文件，全是新建/本刀 owns：

| 文件 | 是什么 |
|---|---|
| `packages/ui-host/scripts/tailwind-candidates.mjs` | 候选表生成器：`@tailwindcss/oxide` 的 `Scanner` 扫搬运树，排序去重落盘。带 `--self-check`。 |
| `packages/ui-host/scripts/build-css.mjs` | 装配 + 整形 + 四条尺。`package.json` 的 `build` 早就指向它（`node scripts/build-css.mjs && tsdown`），本轮把内容换成这一套。 |
| `packages/ui-host/src/client/styles-inject.ts` | 运行期注入：一张 `<style>`、作用域锚点、Radix portal 的门镜像、引用计数回收。 |
| `docs/stages/step-4-css-pipeline.md` | 本报告。 |

生成物落在 `packages/ui-host/src/client/generated/`（`.gitignore:15` 已覆盖）：
`tailwind-candidates.txt`、`design-entry.css`、`client.css`、`client-css.ts`。
产物名沿用搬运批已经接好的那份契约（`src/client/styles.ts:14` `import { CLIENT_CSS } from './generated/client-css.ts'`），
不另立 `design-css.ts`，否则同一棵样式树有两个真源。

### 命令、rc、读数（2026-10-07 本机 macOS / Node v26.10.0）

```
$ cd packages/ui-host && node scripts/tailwind-candidates.mjs --self-check   rc=0
ok   夹具里的 grid / min-w-0 必须扫到
ok   空目录必须扫出 0 条（base 写错要显形）
ok   源码里真实出现的字面类名要进候选表（backdrop-blur-2xl）
tailwind-candidates self-check: PASS

$ node scripts/build-css.mjs                                                 rc=0
candidates: 15015 条 / 244649 字节 -> src/client/generated/tailwind-candidates.txt (changed=false)
tailwind: 566446 字节（9 份表 + 别名层，一次编译）
artifact: 574145 字符 / 574297 字节（编译产物 566446 字符，整形差 +7699）
assertions: canary 17/17 · groups src/nodes=2375 src/components=9520 src/lib=4160 src/client=770
  src/plugins=1265 · order 9/9 · 整形后能命中宿主的无层规则 0（allowlist 0）· 文档级变量块 5/8
  · 投递危险序列 0/5
build-css: PASS

$ node scripts/build-css.mjs --self-check                                    rc=0
（12 条全 ok；见下面每条尺的"关掉防御"那一行）

$ ./node_modules/.bin/tsdown -c tsdown.config.ts -d ../.scratch/css-pipeline/out2   rc=0
client.js 1,799,598 字节（其中这份 CSS 574,297 = 31.9%），握手首尾原样：
  head  window.__ModuleLoader__.load({ id: "@hibernalglow/xaihi-ui", factory: (require) => {
  tail  return module.exports; } });
$ node --check out2/client.js                                                rc=0
```

确定性：连跑两次（第二次 `--skip-scan`）产物 sha256 前缀都是 `53fad8a960565de9`。

运行期那份模块也在同一台机器上活跑过一遍（夹具在
`/Users/glow/Base/Code/Freya/.scratch/css-pipeline/verify-inject.mjs`，happy-dom 起文档，
**仓里没有它的测试文件**——接线那一刀归属时再落成 `tests/`）：

```
$ node --experimental-strip-types verify-inject.mjs                          rc=0
ok   注了一张表 / 内容就是产物那份 CSS / 重复注入不再加第二张表
ok   根挂上了作用域锚点 / 门属性从 documentElement 镜像到根
ok   portal 容器被标了锚点   stats={owners:2,cssBytes:574145,parsedRules:682,scopedRoots:2,portalsMarked:1}
ok   宿主的弹层没被误标       skipped=2 reason=last-interaction-outside
ok   还有一个持有者时表留着 / 回收后表摘掉 / 回收后锚点摘掉 / 宿主自己的属性没被我们动过
styles-inject 运行期核对：PASS（12 条）
```

`tsc` 单查这一份文件（仓级 `tsconfig.base.json` 严格度）：rc=0。
`parsedRules=682` 是 **happy-dom 的 CSSOM 读数**，不是浏览器读数（它不展开 `@media`/`@layer`），
只用来证明"这张表真被解析了、规则数读得回来"；浏览器里的真实数要活体宿主读（第四节 3）。

**「做了」与「实机验过」的分界**：生成、四条尺、12 条对照、打包、`node --check`、
运行期那 12 条 happy-dom 核对都在这台机器上跑过并贴了 rc。
**没验的**是"注进真 DSH 宿主后界面长什么样"——那要 `pnpm host` 起宿主 + 浏览器读 CSSOM，
本刀没做（`styles-inject.ts` 至今没有调用者，见第四节）。

## 二、为什么这样设计

### 1. CSS 只能当字符串活在 JS 里

宿主给插件的 URL 形状只有 `client.js` 与 `client.<name>.js`，资源路由按
`CLIENT_CHUNK = /^client\.[\w.-]+\.js$/` 收并当 JS 发（`dsh-client-modules/lib/index.js:169,913-947`）。
发不出 `client.css` ⇒ 只能内联。本包用 tsdown（不是 Vite），所以
`@tailwindcss/postcss` 在构建期被直接调（`postcss@8.5.15` + `@tailwindcss/postcss@4.3.2` +
`tailwindcss@4.3.2` 都在本包 devDependencies，实测已装）。
不用 `@tailwindcss/cli`：它带 `@parcel/watcher`，而 `pnpm-workspace.yaml` 里
`allowBuilds` 的那一行还是占位串（`set this to true or false`）⇒ 引它等于让每次 install 直接红。

### 2. 候选表：`source(none)` 把自动探测关了，就得有人显式扫

`src/styles/tailwind.css:1` 是 `@import "tailwindcss" source(none)`，`:5` 是
`@source ".tailwind-candidates.txt"`。上游那份快照由 Vite 的 `configResolved` 钩子用
`Scanner` 现扫现写（`<Xiranite>/vite.config.ts:35-54`）。本包没有 Vite ⇒ 这件事搬到构建脚本。
扫描**排除** `src/client/generated/**`：产物不许当输入，否则类名自我固化。

实测把任务里那条前提修正了（数字都在上面命令的 rc=0 输出里）：

| 口径 | 数值 |
|---|---|
| 签进来的旧快照 | 19,536 条候选 / 318,682 字节 |
| 新生成的候选表（搬运树，去掉测试与产物） | 15,015 条 / 244,649 字节 |
| `src/nodes`（L4）扫出 / 旧快照缺 | 2,375 / **1**（还是条噪声 `scripts/gen-*.mjs`） |
| `src/components` 扫出 / 旧快照缺 / 其中 utility 形状 | 9,520 / 471 / **105** |
| `src/client`（外壳）扫出 / 旧快照缺 / 其中 utility 形状 | 770 / 177 / **28** |

⇒ **"L4 的类名根本不生成"这个形状不成立**：L4 全部来自上游 `src/nodes`，而旧快照正是扫上游 `src` 出的。
真正的缺口在 L2 的 modules/workspace 那一批（`WorkspaceMelodeck.tsx`、`MusicPlayerSurface.tsx`、
`DatabaseDataView.tsx`、`ui/context-menu.tsx`、`data-table-date-filter.tsx` 等 133 条 utility 形状候选），
以及"快照是签进来的死文件、下一批搬运一来就漂"这件事。

三条腿对照（`/Users/glow/Base/Code/Freya/.scratch/css-pipeline/probe-legs.mjs`，
只换候选表那一行，其余一字照抄；canary 名单是手钉的字面量，不来自被测的生成器）：

| 腿 | 候选表 | 编译产物 | 11 条 port canary |
|---|---|---|---|
| stale | 旧快照 19,536 条 | 550,825 字节 | **0/11** |
| fresh | 生成的 15,015 条 | 517,486 字节 | **11/11** |
| empty | 空表 | 235,481 字节 | 0/11 |

生成器买到的东西 = 11/11 的端口新增类名，同时产物**小** 33,339 字节。
现在仓里那份实际产物是 **union**（`tailwind.css` 自己那条旧 `@source` 还在，脚本不能改它）：
566,446 字符，比 fresh-only 多 **48,960 字节**——那是 3,853 条"搬运树里已经没有"的旧候选生成的死规则。
去掉它的办法是把快照提到契约路径（脚本已支持，不改样式源）：

```
node scripts/build-css.mjs --snapshot-out packages/ui-host/src/styles/.tailwind-candidates.txt
```

### 3. 装配顺序是被测对象，不是注释

上游 `main.tsx:13-25` 那份顺序是活的：design 配方与 `index.css`、`themes/*` **不进 `@layer`**
（`md3-components.css` 头部自己写明"this sheet is NOT inside any `@layer`"），
CSS Cascade 4 里无层压过 `@layer utilities` 的工具类，同特异性再靠先后决胜。
所以脚本按那份顺序生成 `design-entry.css`（9 张表 + 别名层的绝对路径 `@import`），
并用 `checkOrder` 逐段查字节位置（9 个标记，全部命中才绿）。
`xaihi-aliases.css` 排在**所有表的最后**：它是我们把裸 shadcn 名桥到 `--xaihi-*` / `--dsw-*` 的那一层，
而 `themes/base.css` 在 `:root` 上用同样特异性写了 oklch 常量 ⇒ 别名在前就等于白写。
这条也有尺：`--background: var(--xaihi-surface` 必须排在 `--badge-teal-subtle-foreground`（base.css）之后。

`md3-components-selection.css` 不单独列——它由 `md3-components.css:119` 自己 `@import`，列两次就是两份真源。

### 4. 泄露整形：先分清"哪一层真的压得住宿主"

关键事实：Tailwind 的 preflight 与工具类都在 `@layer` 里（产物内 3,904 条），
**层序已经让宿主的无层声明压在它们上面**，动它们既无必要也是替搬运批改行为。
真正会改宿主脸的是**无层**那 676 条（`index.css` + `themes/*` + 6 份配方 + 别名层）。

策略表（`applyPolicy`，只作用在无层规则上）：

| 形状 | 整形前 | 整形后 | 处置 | 理由 |
|---|---|---|---|---|
| `*`（universal） | 2 | 0 | SCOPE 到 `:is(.xaihi-workbench, [data-xaihi-ui])` | `index.css` 的 `*{border-color:var(--border)}` 会改宿主页面上每个有边框元素的默认色 |
| 裸标签（`code,pre,kbd,samp`、`html`） | 4 | 0 | SCOPE | 字体/行高属于文档壳 |
| `::selection` 等全局伪元素 | 13 | 0 | SCOPE | 选中高亮色会跟着改宿主的选中色 |
| `body` / `#root` | 3 | 0 | DROP | `html,body,#root{width;height;background;color}` 就是给宿主换脸 |
| `:root[data-*]`（设计语言的门） | 665 | 0 | REWRITE 成 `[data-xaihi-ui][data-*]` | 见下 |
| `:root` 纯自定义属性块 | 6 | 5 | **KEEP 在文档级** | Radix portal 挂在 `document.body` 下，只有文档根的变量能继承进去；`color-scheme` 那 4 条非变量声明摘掉 |
| 已锚定（class / id / `[data-*]` 起头） | 231 | 917 | 不动 | 整形后 665 条门改写完就落进这一档 |
| `@property` | 93 条 | 93 条 | 不动 | 名字全在 `--tw-*` / `--xaihi-*`  namespace |
| `@media` 包裹 | 256 条 | — | 递归同样处理 | — |

门那一档为什么必须改写：`apply.ts:83-92` 把 `data-app-design` 与 `--md-*` 写在
`document.documentElement` 上，而门内的选择器全是 `[data-slot="card"]`、`[data-slot="dialog-content"]`
这类——DSH 自己的 dist 里也有 `data-slot`（实测 14 处）。**不改写的话，使用者一开 md3 配方，
我们的规则就盖到宿主自己的卡片和弹窗上。** 改写后 `[data-xaihi-ui]` 是唯一的入口，
而这个属性只有 `styles-inject.ts` 会挂。

变量名冲突实测：扫 53 个 `@deepseek-ai/dsh-client-ui*` 包（1,307 文件 / 149 个 css+js），
`--background / --border / --primary / --radius` 等 14 个裸名的**声明 0 处、`var()` 引用 0 处** ⇒
留在 `:root` 的 5 个变量块不会覆盖宿主在用的东西。DSH 壳自己那张表不在 npm 包里
（只能现读 CSSOM，见 `AGENTS.md` 那条实测），所以这条要补一次活体读数才算封死（第四节）。

SCOPE 的代价量过：`*{border-color}` 改作用域后，全树 306 处裸 `border` 工具类里只有
**3 处**在会进 portal 的文件里（`ui/command.tsx` 1 处 + `niko-table` 那条按文件名误判的 2 处），
`box-sizing` 之类仍由 `@layer base` 的 preflight 全文覆盖（我们不动它），所以 portal 里的对话框
不会因为这条尺失去盒模型。`allowlist` 留空 ⇒ 产物里一条能命中宿主任意 DOM 的无层规则都不许留；
要加条目得有名字和理由（减法跑测已证明：把任意一条 SCOPE 改回 `*`，这条尺立刻红）。

### 5. 四条尺与阳性对照

| 尺 | 抓什么 | 期望值从哪来（不再调被测函数） | 对照（关掉防御必须红） |
|---|---|---|---|
| A canary 17 条 | 端口类名真的生成了 | 手钉 `cls + file`，构建期独立读源码文件找字面量 | 把产物里 `.backdrop-blur-2xl{…}` 抹掉 → 变红并点名；再加一条源码里没有的类名 → 报"源码里找不到" |
| B 目录组下限 5 组 | `@source` 扫到整棵树（ADR-0007 结论 5） | 2026-10-07 实测数取一半做下限 | 把 `src/nodes` 的下限抬到 999999 → 变红；扫描 glob 一旦不再覆盖某棵树，那组直接掉到 0 |
| C 顺序 9 段 | 上游加载顺序没在装配里丢 | 每张表里"只有那里才有"的声明名 | 把别名层挪到最前 → 变红 |
| D 泄露预算 + 变量块上限 + 投递序列 | 整形有没有生效、CSS 字符串能不能安全住进 `<script>` 引的 JS | `GLOBAL_ALLOWLIST` 空集 / `DOCUMENT_VAR_BLOCK_MAX=8` / 5 个危险序列 | 把一条 SCOPE 改回 `*` → 泄露红；`css + '</script>'` → 投递红 |

`build-css --self-check` 一次跑完 12 条对照，当前 rc=0（全 ok）。

**尺抓不到的东西（同等重要）**：
1. **动态类名**：模板字符串拼出来的（`text-${size}`）、`cn()` 里三元的一半、`clsx` 的运行时分支、
   第三方组件内部自己写的类。`Scanner` 只看文件里的字面文本，Tailwind 也一样——这类只能靠浏览器实测。
2. **远程模块带进来的类**：`src/client/loader/remote-modules.ts` 那条路上，第三方节点包的 UI
   不进这次扫的树 ⇒ 它的类名不会被生成，也不在这 17 条 canary 里。这是 L4 边界的结构性限制，
   不是 canary 名单不够长。
3. **规则对不对**：尺只说"有规则命中这个类名"，不说这条规则的**值**对不对（比如 `--md-*`
   变量齐不齐、配方门有没有开）。设计语言的值由搬运批带来的 `skinPriority.test.ts` 那 6 份测试管。
4. **运行期门属性有没有人挂**：`[data-xaihi-ui]` 是 `styles-inject.ts` 的契约；没接线时
   改写后的 665 条设计规则一条都不生效（今天也确实一条都不生效，见 `client/theme/engine.ts:10`）。
5. **宿主那张表**：DSH 壳的 CSS 不在 npm 包里，静态扫不到。

## 三、与 DSH API 的关系

- 内联 CSS 这个形状是**宿主路由逼出来的**：`/plugins/<id>/<fileName>` 只认 `client.[\w.-]+.js`
  （`@deepseek-ai/dsh-client-modules/lib/index.js:169,913-947`），没有资产通道。
  这不是我们选的通路，上游有 proposal 空间（`docs/upstream-proposals.md`）。
- `styles-inject.ts` **不碰任何 DSH 服务面**：只用 `document` / `MutationObserver`。
  它需要的那个 `ctx.effect(() => injectDesignCss({ root }), 'xaihi-ui: design css')`
  是 `client/index.ts:344` 现在挂 `registerStyles()` 的同一个位置——那一行归搬运批，本刀没动。
- 主题边界没变：宿主 token 仍然只从 `ctx.theme.overrideTokens(source, tokens)` 进
  （ADR-0006），`--dsw-*` 由 `xaihi-aliases.css` 桥成裸 shadcn 名，本产物只是消费那层桥。
  `apply.ts` 写 `documentElement` 那一半是文档 realm（`rspack.document.mjs` 走真 `main.css` +
  `<link>`）的事，与这份内联 CSS 是两条通路。
- 界面在 `single` 槽里，DOM 在宿主子树内，Radix portal 落 `document.body`——
  这就是"shadow root 那条路走不通"的具体原因（本刀试过再收回来，见第四节）。

## 四、后续与未闭合

1. **接线一行**（本刀不做，归 `client/index.ts` 的 owner）：
   `ctx.effect(() => injectDesignCss({ root: panelRoot }), 'xaihi-ui: design css')`。
   现在 `styles.ts` 的 `registerStyles()` 已经会把同一份字符串注进
   `#xaihi-ui-styles`；两条路同时在跑也不会重复（`findExistingSheet()` 按内容前 512 字符认表），
   但**只有 `styles-inject` 会挂 `[data-xaihi-ui]`** ⇒ 不接这一行，665 条设计语言的规则在面板 realm 不生效。
   这一行接了以后 `data-xaihi-ui` 的有无就同时是尺，也是"设计语言开没开"的读数。
2. **快照提到契约路径**：一条 `--snapshot-out` 命令，能去掉 48,960 字节死规则，
   并把"签进来的上游快照"从仓库里换成产物。这一步要搬运批同意（那是一条 `@source` 的归属）。
   未做的原因：本刀的边界不覆写 `src/styles/**`。
3. **活体读数**：`document.styleSheets` 里我们的规则数、`parsedRules`、
   `portalsMarked / portalsSkipped`（已挂到 `window.__XAIHI_CSS__`），都要在起宿主之后读一次。
   没读过 ⇒ 上面所有"能命中宿主"的数字都是文本级静态判据，不是渲染判据。
4. **CSSOM 实测 `--dsw-*` 与宿主自己那张表用了哪些变量名**：静态那 149 个文件说 0 处引用，
   壳的表在运行时才拿得到。这条能证伪"裸名留在 `:root` 是安全的"。
5. **备选方案与各自的失败形状**（都试过/推过，写下来免得下一轮再走）：
   - shadow root：Radix portal 落 `body` ⇒ 对话框/菜单掉在根外，样式全丢；且宿主 React 拿不到我们的表。
   - 每条选择器前缀 `.xaihi-workbench`：portal 同一刀死，另外 `:root` 变量必须留文档根，前缀帮不上。
   - 整体包进 `@layer xaihi`：零泄露削减（选择器照样命中宿主 DOM），只是让宿主压过我们；
     实测把产物整份包进 `@layer xaihi` 后，"最左是 `*`/裸标签/`::`/`html`/`body`"的规则数
     **51 → 51**，一条不掉（那 51 条里大部分正是 `@layer base` 里的 preflight，本来就不该动）。
   - 逐属性改名（`--background` → `--xaihi-background`）：变量块那条路能走，
     但覆盖不到 `*`/`::selection`/裸标签这一档，而那一档才是真会换脸的。
   - `@scope`：Chrome 118+ 才有，宿主可跑的 Electron/WebView 版本本刀没量，不当默认。
6. **本刀之外的一条真红**：`pnpm --filter @hibernalglow/xaihi-ui typecheck` 当前 rc=1，
   `own` 桶 1 条在 `src/client/workspace.tsx(238,19)`（搬运批在飞的按钮 props），
   与本刀无关；`styles-inject.ts` 单独跑 tsc（仓级 `tsconfig.base.json` 严格度）rc=0，
   在整把尺的 `own` 桶里也是 0 条。

## 8. 接线那一刀与它抓到的缺陷（2026-10-07 00:48，own）

`scripts/build-css.mjs` rc=0、`--self-check` rc=0、`node scripts/tailwind-candidates.mjs --self-check` rc=0，
`pnpm exec vitest run tests/css-scope.spec.tsx` 12 条绿，`pnpm run build` rc=0（`lib/client.js` 1.56 MB）。

**写这张表之前有一个真缺陷**（是 `tests/css-scope.spec.tsx` 抓的，不是人看出来的）：
表与 portal observer 原来是**每个调用各一份**，摘表按各自闭包里的 `addedHere` 决定。
引用数真的会 >1（React 18 StrictMode 双挂载、面板重开、DSH 重载插件都是同一 document），
于是"第一个主人先 dispose、最后一个后 dispose"这条路上：表留在文档里摘不掉（574 KB 一份），
而且每个调用留下的 `MutationObserver` 永远不断开，往那份**全局** `portalsSkipped / scopedRoots` 里灌水。
改法是把两层分开：`sessions`（挂载点级：各自的根、门、undo 账、标过的元素）与
`sharedTag / sharedCreated / stopSharedObserver`（文档级一份，最后一个主人走时才收）。
portal 只标进**最后一次交互落在的那个 session** 的账，没交互就不标（不猜）。

**接线**：`src/client/surface.tsx` 的 `MainSurface` 在 in-realm 那一面的 `useEffect` 里
`return injectDesignCss({ root: realmRoot.current })`；文档面是独立 realm，它的 CSS 在自己的产物里，
这一格不注。**没人接这一刀就等于六份设计配方静默不生效**——构建期把 492 条设计门从
`:root[data-app-design=…]` 改写成 `[data-xaihi-ui][data-app-design=…]`，锚点不在就没有匹配。

**减法跑测**（把 `useEffect` 的 `return` 摘掉再跑，实测 rc=1）：红的是两条——
"卸载之后锚点与表都撤干净"，以及"走文档面时不在宿主文档里注我们那张表"，
后者红在 `beforeEach` 的前置条件上（`owners` 1 ≠ 0）。前置条件是必要的：
没有它，那条判据会因为上一条用例漏 dispose 而**变成假绿**（同一实验里它一开始就是这样绿的）。

**判据口径**：`portalsMarked / portalsSkipped / scopedRoots` 是模块级共享的一份账，
用例一律按**增量**判；断绝对值会把别的用例灌进来的数算成本条的行为。

**这一刀没随提交走的三件**（都不是技术问题，是并发 lane 的落点）：
`tests/css-scope.spec.tsx` 与 `src/client/surface.tsx` 留在未提交区——后者同一文件里载着搬运批
正在做的整块重写（`RealmProps` / `NoDocumentFace`），GitButler 只能整文件收，按"别把别人的 hunk 提走"
这条规矩两边一起等；`packages/ui-host/package.json` 里 `@tailwindcss/oxide: 4.3.2` 的声明与
`pnpm-lock.yaml` 也不能分开发（lock 现在同时载着批次 F 那六个还没成形的包目录，
提上去会让干净检出的 `--frozen-lockfile` 多出六个空 importer）。
另记一条**HEAD 本来就有的**同类悬挂：`pnpm-lock.yaml` 在 HEAD 里已列 `plugins/findz`（其 `package.json`
仍未提交）与 `packages/ui-kit`（那个包在 ADR-0006 退回时已删）——干净检出的 install 门在这一条上
**早就红**，不是这一刀造成的，收口时一并清。
