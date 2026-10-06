# 高级主题（设计语言）：Material 3 与风格派两份配方

状态：实现中（2026-10-05 立项）。落点：React GUI（`src/`），不进节点包、不进 Rust 宿主。

## 1. 这是什么：与颜色主题平级的第二个维度

| 维度 | 现有「颜色主题」 | 新增「高级主题 / 设计语言」 |
| --- | --- | --- |
| 词表 | `AppTheme`（17 预设）+ `themes.json` 自定义 | `AppDesignThemeId = "native" \| "md3" \| "mondrian"`（§8） |
| 管的东西 | 一套 CSS 变量的取值 | 整套设计语言：颜色角色 + 形状 + 层级 + 排版 + 动效 + 状态层 + **逐组件几何 metric** |
| 类型 | `src/types/workspace.ts` | `src/lib/design-theme/contract.ts` |
| 落盘 | `src/lib/appearance.ts`（class + inline 变量） | `src/lib/design-theme/apply.ts`（inline 变量 + 根属性） |

**注意重名**：`src/lib/appearance.ts:59` 已有一个 `ThemeDesignRecipe`，那是「颜色主题自带的 store 级外观旋钮」（fontPreset / 背景 / 颗粒 / chrome 位置…），与本维度的 `DesignThemeConfig` 无关。两个词并存是历史事实，改名不属于本任务范围，引用时按类型名区分。

用户 2026-10-05 的两条裁定，写在这里当作决策记录：

1. **MD3 默认接管颜色**（「他不接管很难做吧」）——所以 `dimensions.color` 默认 `on`。维度开关是逃生阀：想让几何换掉但颜色跟着原主题走，把 color 关掉即可。
2. 其余按推荐默认：装 `@material/material-color-utilities`；外观走 CSS 层不重写组件；第一批只做 Tier-1 表面；持久化进 host TOML；只落 MD3 一个，但注册表是数据驱动的。（同日 §8 追加了第二份配方：注册表确实只多了一条注册项，`apply.ts` 与设置面板没有新增分支。）

## 2. 事实源（没有一个数字来自记忆）

| 用途 | 来源 | 取证 |
| --- | --- | --- |
| 非颜色 token + 77 套组件 metric | `@material/web@2.5.0` 里 Google 自己生成的字典 `tokens/versions/v0_192/_md-*.scss`，文件头写明 `Design system display name: Google Material 3 / Design system version: v0.192 / Platform: Web`，Apache-2.0 | 解析成 `md3/tokens.generated.ts`，`bun run audit:md3-tokens` 查漂移 |
| 层级阴影配方 | 同包 `labs/gb/styles/elevation/md-elevation-tokens.scss`（v0_192 的 `md-sys-elevation` 只有 dp 数字 0/1/3/6/8/12，CSS 可用的两层 box-shadow 在这份生成物里） | 直接解析，不改写 |
| 间距阶梯 | 同包 `labs/gb/styles/space/md-space-tokens.scss`（`--md-sys-space-unit: 8px` + 0…900） | 同上 |
| 动态取色 | @material/material-color-utilities@0.4.0`（Apache-2.0）的 `DynamicScheme` / `Variant` / `MaterialDynamicColors | 实测：Variant` 9 个枚举、构造参数含 `contrastLevel(-1…1)`、角色表含 `surfaceContainer{Lowest,Low,High,Highest}`/`surfaceBright`/`surfaceDim`/`outlineVariant`/`scrim |
| 体积 | 同上，esbuild bundle+minify 实测 | 只要 scheme 角色 **88.4 KB raw / 20.3 KB gz**；加上图片取色链（quantize+score+temperature）**102.9 KB / 24.4 KB gz** |

一条被机器值纠正的常见错误：**状态层不透明度**。规范表里是 hover `0.08`、focus `0.12`、pressed `0.12`、dragged `0.16`；网上大量教程把 focus 写成 10%，照抄就会错。因此本功能的数值一律从生成物读，不从文档读。

`@material/web` 只作为 **devDependency**（`2.5.0`，codegen 的输入；`bun install --frozen-lockfile` 实测 package.json↔lock 一致），运行时代码不 import 它，Lit 也不进产物；真正的运行时依赖只有 MCU。生成器读的是 `node_modules/@material/web/tokens/versions/v0_192/`，所以这份声明缺了 `audit:md3-tokens` 在干净检出上必红——这一条是被「提交了引用没提交被引用者」的旧坑逼出来的，不是多余的保险。

**组件 token 不发全表**：字典里有 3160 条 `--md-comp-*`，全发就是往 `:root` 上挂三千多个 inline 变量。引擎只发 CSS 层真引用到的那部分，且门禁双向查：引用而未发＝红，发了而无人引用＝红。

## 3. Token 管道

```
seed（手动 / 当前主题 --primary / 系统强调色 AccentColor）
   → MCU DynamicScheme(variant, contrastLevel, isDark)
   → M3 颜色角色（light 与 dark 同一 seed 各算一份，不是取反）
   → --md-sys-color-*
                                    Google 生成字典 → --md-sys-shape-* / --md-sys-elevation-* / --md-sys-typescale-* / --md-sys-motion-* / --md-sys-state-* / --md-sys-space-* / --md-comp-<set>-<token>
                                        ↓
                            桥接：BRIDGED_COLOR_VARS（shadcn + --ws-* + --chart-* + --sidebar-*，36 条）
                                        ↓
                     :root inline 变量 + data-app-design / data-design-<dim>
                                        ↓
              src/styles/design/md3-components.css → [data-slot] 组件
```

三条实现约束，都写在代码注释里：

- **顺序是语义**。颜色主题与高级主题都往 `documentElement.style` 写同名变量，后写赢。两件事在同一个组件 `WorkspaceAppearance` 里按 effect 声明顺序串联（不是两个兄弟组件靠挂载顺序赌），并由它提供 `restoreAppearance` 回调：高级主题撤走自己那批变量后，自定义主题的 inline 值必须原地重写回来（inline 被覆盖就没有旧值可回）。
- **优先级：组件皮肤 > 高级主题**。用户 2026-10-05 明确定这条。落地的**第二版**是「加门」而不是「删声明」：`scripts/md3-yield-to-skins.ts` 从 `src/index.css` 现读每个皮肤族（tabs / switch / slider / scrollbar / choice-control / field-title）声明过的 `(data-slot, 属性)` 组合（含 `background`→`background-color` 这类简写展开），并记下**是哪一个皮肤属性**拥有它，然后把 MD3 层里撞上这些组合的选择器加上 `:not([data-choice-control-style])` 这一类门。结果：皮肤在场时 MD3 整组让位，皮肤**不接管**时 M3 的形态回来。
- **一个目的地只有一条指示条**。M3 抽屉的 secondary-container 标的是「当前目的地」，父级展开、子级被选中时当前目的地是那个子项，父级只是分组头——两级同底色就没有层级了（2026-10-05 用户实机指出）。字典 v0_192 没有 `sub-drawer` 这一组（只有 `navigation-drawer` / `-bar` / `-rail` / `list`），所以父级**退回** drawer 自己的静止档（inactive 字色与图色 + 透明容器），一个 token 都不自创。判据挂在 `li:has(> [data-settings-nav-steps] [data-settings-nav-step][aria-current="true"]) > [data-settings-nav-stage][aria-current="true"]` 上——`button` 与步骤 `ol` 是兄弟，不是后代。尺在 `Md3SettingsLayout.browser.test.tsx`：整条栏里「有底色」的条目必须恰好为 1，且被画的那个必须是选中的子项。
  第一版是「撞上的声明整条摘掉」，实测后果是分段控件在 native / md3 / mondrian 三份配方下 `border-radius` 完全一样（有皮肤 `0px`、无皮肤 `4px 0 0 4px`）——也就是「让位」让成了「高级主题根本不接管这个控件」，用户 2026-10-05 看到的就是这个。
  结构判据在 `src/styles/design/skinPriority.test.ts`：皮肤拥有的 `(slot,属性)` 上的声明，**选择器必须点名排除拥有它的那个皮肤属性**——没门即红，门加错属性也红（两条证伪夹具都跑过），伪元素状态层豁免。


## 4. 变量命名沿用 Google 的名字

`--md-sys-shape-corner-medium`、`--md-comp-filled-button-container-height`、`--md-sys-typescale-label-large-size`…… 保留上游拼写，是为了让「这个值来自规范哪一条」可以全文搜索，也便于 `audit:md3-tokens` 与 token 消费门禁做差集。CSS 层**不允许**给这些变量写 fallback 值：变量缺失必须表现为看得见的坏掉，而不是悄悄落在一个近似值上。

偏离是**记账的**，一共四条，每条都在 CSS 里以 `Deviation (x)` 标出、可搜：

- **(字体族，全局)** 规范写 Roboto Flex，本仓不分发该字体，因此 `--md-ref-typeface-brand` 绑到既有的 `--font-app-sans`（字体仍由用户的 font preset 决定），字号/行高/字重/字距照规范走。
- **(a，设置栏)** drawer 的 `active-indicator-width: 336px` 是 `container-width: 360px` 减去两侧各 12dp；本栏保留应用的 `w-52` 而不改成 360dp，只复刻那个 12dp 内缩比例。
- **(b，设置栏)** 抽屉容器落在 tonal 的 `surface-container-*` 阶上，不画描边——M3 的 modal drawer 本来就不是靠 outline 分层的。
- **(c，字段字号)** 字典里 `outlined-text-field.input-text-size` = body-large **16px / 行高 24px**，那是「独立表单页 + 56dp 字段」的密度。实测（1180×760 真实样式表下的计算值）：下拉触发器正文 12→16px、搜索框 14→16px，而同一页的正文与标签是 13px —— 每个字段都比周围文字大一号。所以字段层只接形状/描边/颜色/焦点环，**字号交还应用**。注意这条不解决高度：触发器 32→40px 是 geometry 块（padding/min-height）给的，40dp 正是 `filled-button.container-height`，属于有意保留的那一档。

(a)(b)(c) 是同一条判断：**M3 的语言照规范落地，M3 的密度不与宿主面板对打**。设置侧栏因此用 Google 自己的紧凑档而不是 drawer 档——条目字号取 `navigation-bar.label-text-*`（label-medium 12px）而不是 drawer 的 label-large 14px；stage 行高取 `filled-button.container-height`（40dp，M3 控件的标准高度），step 行高取 `navigation-bar.active-indicator-height`（32dp）。第一版直接套 drawer 的 56dp 行 + 14px 标签，29 行的栏从 870dp 涨到 1624dp，用户判为「界面大小都变形」——这条弯路留在 `src/components/views/settings/Md3SettingsLayout.browser.test.tsx` 里当尺：它 import 真实样式表、量 `getComputedStyle` 的计算值，并配「MD3 关掉」的阳性对照（见 §6）。

⚠️ 这条判断在 2026-10-05 升级成一条法律：**设计语言不得写绝对 `font-size`，只能对当前已生效的字号乘相对量**——见 `docs/adr/0080-design-languages-scale-fonts-relatively.md`，术语见 `CONTEXT.md` 的「外观语言」。本文件里所有 `font-size: var(--md-comp-…-size)` 形式的声明因此是**待改造的存量**：数值出处照旧可引用（规范字阶 ÷ 宿主该角色的实测字号），但落点要换成 `calc(1em * …)`。Deviation (c) 是这条法律的临时特例（先把最刺眼的字段正文撤成不接管），不是终局。

## 5. 范围

**做**：Tier-1 表面（外壳 chrome、设置页、基础控件、节点卡内部）；7 个维度各自的开关；9 个 scheme variant；4 档对比度；形状缩放。

**这轮明确不做**（不是「以后再说」的含糊话，是留在这份清单上的欠账）：

- **ripple 等需要动组件行为的交互**。本轮全部是外观层；ripple 要改事件与 DOM 结构，单独评估，界面上也就没有那个开关。
- **图片/壁纸取色**。MCU 的 `sourceColorFromImage(HTMLImageElement)` 可用，但要接 canvas 解码与文件选择，列为第二批；`Md3SeedSource` 里因此**不含** `"image"` 值——类型里不许出现没人实现的枚举。
- **Tier-2 专有件**（chart / kanban / file-tree / timeline / dockview / grid-pattern 这类自带绘制的组件）。
- **每节点独立 GUI**。MD3 通过统一 GUI 自动覆盖所有节点面；独立分发是构建期属性，见 ADR-0069 §Standalone，两条 route 都已记录且不许写生成器、不许塞回空开关。
- 系统强调色的**跨平台支持矩阵**没有权威结论：本仓只在运行时实测（见上），不为某个 webview 版本背书。

## 6. 验证

```bash
bun run gen:md3-tokens              # 重新生成 token 表
bun run audit:md3-tokens            # 漂移门禁（生成物 vs 安装包内字典）
bun run audit:design-theme-tokens    # 引擎 emit 的变量 vs CSS 层引用的变量差集
bun test scripts/gen-md3-tokens.test.ts
bun run test:browser -- src/styles/design/md3-components.browser.test.tsx
bun run test:browser -- src/components/views/settings/Md3SettingsLayout.browser.test.tsx  # 真实样式表下的尺寸尺，截图落在同目录 .cache/
bun run test:browser -- src/styles/design/stijl-components.browser.test.tsx   # 风格派（§8）
bun run test:unit -- src/lib/design-theme/mondrian/palette.test.ts            # token 出处门禁
bunx tsc -p tsconfig.app.json --noEmit   # 根 tsconfig 是 files:[]+references，那条 CI 命令不跟引用，量不出东西
bun run check:source-size
```

按本仓纪律，以上重任务**严格串行**，前一进程退出后再起下一个。

## 7. 这轮被尺抓到的东西（留档，因为它们都会复发）

1. **`@material/web` 只被手工拷进 `node_modules`、没进 package.json**——生成器读的是安装目录，干净检出上 `audit:md3-tokens` 必红，而本地全绿。锁条目在仓库外的 worktree 生成后搬回，并核过「新锁的 packages 段是旧锁的超集」（removed keys = 0），不是靠肉眼看 diff 行数。
2. **CSS 层自创了 token 短名**：`--md-sys-state-hover-opacity`（上游是 `…-hover-state-layer-opacity`）与零填充的 `--md-sys-space-050`（上游是 `…-space-50`）。共 111 处引用按上游真名改掉，测试夹具同步——夹具里当时两种拼写都给了，正好把这种「两边都供着，谁也发现不了」的假绿暴露出来。
3. **层叠注释写反了**：part 1 写着「无层 `!important` 仍然赢」，与实测相反（见 §3）。注释也是一种会腐烂的产物，它错的时候比代码错更难被发现。
4. **两个数值档位的归一化不一致**：`shapeScale` 吸附到合法档，`contrastLevel` 却是「不认识就回默认」。是自己写的对照测试把它撞出来的，现统一为吸附；字符串枚举（variant）没有「最近」可言，仍回默认。
5. **组件 token 不该发全表**：字典 3160 条，CSS 层真引用的是 29 个集/133 条。全发＝往 `:root` 挂三千多个 inline 变量。双向门禁因此不是洁癖。
6. **i18n 的两个形状坑**：`dims` 必须是 `{color:{label,description}}`，不是 `colorDescription` 平铺；`contrastLevel` 不能直接当 key——`contrasts.0.5` 会被 i18next 当成两级嵌套路径，所以走 `reduced/standard/medium/high` 这层 slug。
7. **间距档位的来源不是稳定字典**：`md-sys-space` 组在 v0_192 里不存在，只有 `labs/gb/styles/space/` 那份 CSS 形态的表。`space.test.ts` 不比较「看起来对」，而是逐条与上游声明**整串相等**，并带一条只应报出 400 档的证伪夹具。

## 8. 第二份配方：风格派（De Stijl / 蒙德里安·新造型主义）

2026-10-05 用户立项：「蒙特里安高级主题添加一个也就是风格派」，并追加一条硬约束——
「找设计技能或者 design MD，然后或者网站，然后或者有设计规范的网站，就是一定要按规范来，不要自己手搓乱搓」。
这条约束决定了这份配方的形态：**MD3 的事实源是 Google 生成的字典，风格派没有字典**，
所以它的每一个值必须要么是可查的成品（公版图画 + 许可 + 采样算法）、要么是显式推导、
要么在来源栏里自己承认「这是 UI 转译，没有成文规范值」。三者不许混，也不许沉默。

### 8.1 成文依据（引文与出处）

原则层只有三条可引的成文表述，全部落在 `src/lib/design-theme/mondrian/palette.ts` 的 `source` 字段里：

| 原则 | 出处 | 落到界面上的哪一条 |
| --- | --- | --- |
| "art allowed only primary colours and non-colours, only squares and rectangles, only straight and horizontal or vertical lines" | Tate Glossary，经 Wikipedia *De Stijl* 条目转引 | `radius` 恒 0、`shadow` 恒 none、结构线只水平/垂直（`border-*-width` + 直角相交） |
| "…limited to the primary colours, red, yellow, and blue, and the three primary values, black, white, and grey" | 同上（新造型主义的用色规定） | 色板词汇表恰好 3 原色 + 3 非彩色，`palette.test.ts` 用 HCT 彩度把两侧夹住 |
| "avoided symmetry and attained aesthetic balance by the use of opposition" | Jaffé, *De Stijl 1917–1931*, 1970 | 交互反馈＝**对置**：悬停把地面色与动作面互换并加方角轮廓，不叠半透明层（`background-image: none` 被断言钉住） |
| "expression in the abstraction of form and colour, that is to say, in the straight line" | Mondrian 文句，见 *De Stijl 1917–1931*（1987 版） | 阴影整条命名空间发 `none`：靠明度分层与线分层级，不用明暗塑形 |

### 8.2 颜色到底从哪来（三类来源，测试逐类检查）

- **`measured`**：对 Wikimedia Commons 的公版（Public domain）复现图做量化采样——中心 80% 区域、
  520px 缩放图、按 HSV 分簇后取每簇通道中位数。红 `#dc281f`、蓝 `#015b9d`、黑（结构线）`#17191a`、
  白（底）`#e7e6e5`、灰 `#95908d` 来自 *Composition II in Red, Blue, and Yellow*（1930）那张文件；
  **黄 `#dbb404` 必须换一幅**（Commons `Composition-with-red-yellow-and-blue.jpg`），因为 1930 那幅里没有黄面——
  这件事写进来源栏而不是藏在注释里。⚠️ 复现图不是分光光度计：这些 hex 代表「这张公版复现图上的颜色」，
  不代表颜料本身，不许将来拿颜料成分给它背书。
- **`derived`**：由 `@material/material-color-utilities` 的 `TonalPalette`（HCT）从上面那些种子推 tone。
  规则写死：平面 light 取 tone 40、dark 取 62（黑底上深原色对比不足，抬明度）；非彩色地面/线各自一档。
  `palette.test.ts` 不重复算这些值，而是**反查**：来源栏标的 tone 必须等于值本身的 tone（±1），
  色相与种子一致（±1.5°），彩度只许**往下**被 sRGB 色域夹掉（实测高彩度黄 tone 40 从 57.49 被压到 38.58，
  第一版把这条当违规写了 `abs()` 断言，于是自己红给自己看）。近中性色的 HCT 色相本身不稳定
  （灰种子在 tone 55 上漂了 2.02°），所以非彩色那一侧改查彩度上界，不比色相。
- **`ui`**：线宽、间距、字号、动效时长——风格派没有留下任何可执行的界面尺度，
  来源栏统一写 "no documented spec value"，设置面板也照这句话披露（`settings:designTheme.provenanceNote`）。
  其中 `--stijl-control-height` 定成 36px 的理由是**本仓既有默认控件高度就是 36px**
  （`src/components/ui/button-variants.ts` 的 `h-9`），浏览器测试直接比较「开配方前后同一个按钮的高度」，
  这句出处就不再是一句话，而是一条会复发的门禁。

### 8.3 门禁

| 尺 | 位置 | 查什么 |
| --- | --- | --- |
| 出处门禁 | `src/lib/design-theme/mondrian/palette.test.ts` | 每条 token 必带 `{kind, source}`；`measured` 必须等于记录在案的 hex；`derived` 必须能被种子反查；非彩色/原色按 HCT 彩度两侧夹住；`text/ground`、`onAccent/planeAccent` 等四对按 WCAG 2.1 相对亮度算对比度 ≥ 4.5:1；注入的假 token 必须被抓住（四条证伪夹具） |
| 覆盖门禁（双向） | `src/lib/design-theme/md3/tokenCoverage.test.ts` 第二个 describe | CSS 层读的 `--stijl-*` 必须是引擎发的；引擎发的**非彩色**必须有人在读（色板那 13 条按词汇表豁免，与 `--md-sys-*` 同等待遇）；不许给 `--stijl-*` 写 fallback；`border-radius` 不许出现不走 `var(--stijl-radius)` 的字面量；挖掉一条真变量必须立刻红 |
| 优先级门禁 | `src/styles/design/skinPriority.test.ts` | 两份配方都不许在组件皮肤拥有的 (槽, 属性) 上写**无门**声明；风格派层目前对 tabs / segmented / slider / scrollbar / field-label 是整族不碰（要接管得像 MD3 那样补带门的规则，见 §9） |
| 渲染验收 | `src/styles/design/stijl-components.browser.test.tsx` | 真引擎 `applyDesignTheme()` 上 `:root`（不喂手抄夹具），逐条测 0 圆角 / `box-shadow: none` / 结构线三档往返 / 换主动作面真的重绘 / 悬停翻面 / 无 layout shift / **逐维度关掉必须回到本仓原样且不许牵连别的维度** |

### 8.4 这轮被风格派的尺抓到的东西（和 §7 一样，都会复发）

1. **引擎发的名字和 CSS 读的名字对不上**：`kebab("planeAccent")` 得到 `plane-accent`，而 CSS 层读
   `--stijl-color-accent`。这类坏法在构建期完全无声，只有双向覆盖门禁能看见——它就是被方向一抓住的。
   改成显式的 `STIJL_COLOR_VARS` 名字表，`palette.test.ts` 再核对发出的值与出处记录逐条相等。
2. **没挂维度门的规则，关掉那个维度时不是「回到原样」，而是「落到属性的初始值」**：
   `border-radius: var(--stijl-radius)` 在变量未定义时按非法值结算，`border-radius` 的初始值是 0，
   于是「关掉 shape」得到的还是 0 而不是本仓的 10px。第一版有 4 条圆角规则漏门。
   修法是把门落到规则上（与 `md3-components.css:417` 同一写法），只靠引擎不发变量不够。
3. **跨维度的 shorthand 会把两个维度绑在一起**：`border: var(--stijl-line-width) solid var(--stijl-color-line)`
   在关掉 color 时整条声明失效，连**几何**那条线宽也一起变 0。这条是被「别的维度不许被牵连」那半边断言抓住的。
   拆成 `border-width` / `border-style` / `border-color`，各自挂自己维度的门。
4. **`transition` 会把「改完立刻读 computed style」骗成旧值**：第一版 4 条红里有 3 条是这个原因
   （线宽 3px 读到 2px、换 accent 颜色没变、hover 后颜色没变），而 `--stijl-*` 的 inline 值证明引擎确实写了。
   harness 里注入 `transition-property: none !important` 把时间轴钉死——用 `transition-property` 而不是
   `transition`，因为后者会连 `transition-duration` 一起清零，motion 那组探针就测不到东西了。
5. **Playwright 的悬停是真实指针状态**，不会随重新 apply 复位；上一次悬停残留会把下一个「未悬停」的
   读数读成悬停值。所以测试里加了「把鼠标让给旁边那个按钮」这一步（`readUnhovered`）。
6. **出处里写了一个不成立的数字**：`--stijl-control-height` 原本注释成「等于本仓既有控件高度」而值给 40px，
   实测本仓默认是 `h-9` = 36px。改成 36px 并把这句话变成浏览器断言（配方前后的同一按钮高度必须相等），
   下次谁改这个值就会被撞红。「关于本仓的事实」不该只活在注释里。
7. **`data-stijl-tokens` 原来是手抄词汇表长度加色板键数**（重复计数）。现在等于 DOM 上真的写了几条
   `--stijl-*`，测试两边都比。

### 8.5 已知代价（不许读成「已经都做完了」）

- **关掉 `states` 之后按钮没有悬停反馈**，不是退回本仓自己的 `hover:bg-primary/90`。原因是本层动作面那条
  规则的选择器比工具类更具体、一直赢。要改得把颜色规则写成 `:not(:hover)` 之类，本轮没做，测试里也把这条
  期望明确写成「和不悬停一样」并留了注释。
- 深色方案是**非彩色互换**（黑底白线）这一条原则推论，不是风格派自己的暗色规范；原色面只抬 tone、不改色相。
- 逐组件几何 metric（`--md-comp-*` 那种）在风格派里**没有对应物**，所以本层是槽级规则而不是 metric 表。
- 线宽三档是本仓的 UI 档位；曾经尝试从 1930 那张复现图量黑线粗细，结论是不可测（暗像素占比 7.0%，
  连续黑段长度中位数 ≤2px，压缩与打光把尺度抹平了），所以标成 `ui` 而不是 `measured`。
- 设置面板的选项只有两个（主动作面、结构线）；色板的 tone 档位、明暗互换规则都不做 UI——
  它们是配方的组成，不是用户旋钮。

## 9. 组件皮肤的「不接管」档（2026-10-05 追加）

高级主题要能在皮肤不接管时说话，前提是**「不接管」这件事在界面上可选**。词表原来只有实际的处理档
（`segmented/pills/tabs/tiles` 等），没有「不接管」，而皮肤规则的选择器是 `:root[data-choice-control-style] [data-slot=…]`
这种**只判存在**的形式——所以「关掉皮肤」在实现上必须写成**属性缺失**，不能写成 `="none"`：
写成值的话皮肤照样命中、而高级主题的 `:not()` 门照样关着，两边同时以为对方在管这个控件。

- 六族各加 `"none"`：`tabs` / `switch` / `slider` / `scrollbar` / `choice-control` / `field-title`
  （`src/components/ui/{tabs,switch,slider,scrollbar,choice-control}-variants.ts`）。**默认值一律不动**，
  所以没有任何人的既有观感被这次改动改变（`componentSkinVocabulary.test.ts` 里有机检这条）。
- `WorkspaceAppearance.tsx` 的 `setSkinAttribute()`：值为 `none` 时 `delete root.dataset[...]`，否则照常写。
- 四份手写清单由 `src/components/views/settings/componentSkinVocabulary.test.ts` 一起查：
  词表本体、`AppConfigSync.tsx` 的宿主持久化白名单（不收的值从 TOML 读回时被整条丢掉 ⇒ 「选了存不住」）、
  en/zh 两份标签、以及「`none` 存在且不是默认值」。带一条「只改词表、忘了改宿主清单」的证伪夹具。
- 面板那一侧由 `src/components/views/settings/ViewSection.browser.test.tsx` 钉住：六族各自渲染出的档位**逐个等于词表映射到 i18n 的标签**（标签从 `en.json` 现读，不在测试里猜字面量——`fieldTitle.legend` 实际叫 "Floating legend"，猜写法必漂），并且点「不接管」真的走到 store → `WorkspaceAppearance` → `:root` 上那个键消失，再点回真档位又出现。
- 端到端效果由 `md3-components.browser.test.tsx` 的 `segmented controls follow MD3 while the choice-control skin is absent`
  钉住：属性缺失时 M3 的 outlined segmented（40dp 容器高、`corner-full` 外框、1px 描边）出现；
  属性一在场整组让位；再删掉门又打开（往返验，三半缺一不可）。

## 10. 配色主题 × 高级主题：逐槽直接映射（2026-10-05 定）

用户口径：「在使用高级主题的情况下，使用 shadcn 的配色主题就是直接映射」，并且
「有些本身是取色的就按取色的来」。落成三条：

- **逐槽合并**（颜色维度开着时）：配色主题**自己声明了**的那几槽原样透传（`oklch()` / `color-mix()`
  不做 hex 量化），没声明的槽才用 seed 派生的 M3 角色值补齐。`dimensions.color = off` 仍是
  「整套不碰颜色」，`seedSource = systemAccent` 仍是整机取色——两者都是这条规则的特例。
- **默认取色**：`DEFAULT_DESIGN_THEME.md3.seedSource` 从 `manual` 改成 `activeTheme`，
  所以派生出来的补集与用户当前主题的主色同一色相；读不到主色时如实报 `seed-fallback`，
  不拿别的颜色顶上（`md3/seed.ts`）。手改过这一档的配置照旧生效。
- **回读路径**：`:root` 上的 `data-md3-bridge-theme` 写成 `2/36` 这种形式，
  表示「这一轮有几槽是直接映射自配色主题的」。没有它，「映射有没有发生」就只能靠眼看。

两个必须记住的坑（都是实测踩出来的）：

1. **判「主题声明了什么」不能读 `:root` 计算值**。基线（`src/styles/themes/base.css` 的 `:root { --primary: … }`，
   见 §11；这一层以前住在 `spatial.css` 里）与预设的类规则都在那里，读计算值会让 36 槽**全部**算成「主题声明的」，
   于是颜色维度一条都不做事，而界面上完全看不出来（值本来就差不多）。
   真源是 store 里选中那份 `AppCustomTheme.cssVars`，由 `WorkspaceAppearance.themeVarsAsCssNames()`
   摊成 `--x -> 原样字符串` 再传进 `DesignThemeContext.themeColorVars`。
   `mapper.test.ts` 里有一条专门钉这个：只给 DOM 读取器、不给 `themeColorVars` 时，
   输出必须是派生值而不是「透传值」。
2. **解析必须发生在撤干净自己上一轮输出之后**。两边写的是同一个 `:root` inline 属性，
   顺序错了就把上一轮 MD3 的输出当成主题给的（`apply.ts` 里 `resolveDesignTheme` 已挪到
   `removeAppliedVars` + `restoreAppearance` 之后；`themeMerge.browser.test.tsx` 第二条测的就是它——
   关掉颜色维度再开回来，计数必须还是 `2/36`）。

## 11. 主题预设与设计语言合并（2026-10-05 用户裁定）

用户口径：「那几个主题预设就是想做成目前的超级主题的样子，所以原本那几个主题预设就可以删掉了，
只保留武陵」，并且「主题预设和设计语言合并了」。落到的范围是**整批删净**——CSS、`AppTheme` 联合、
`THEME_DESIGN_RECIPES` / `THEME_STYLE_PROFILES` / `THEME_PRESET_OPTIONS` 三张表、i18n 成员、
来源元数据与测试夹具，只留 `wuling`。`AppTheme` 现在是单成员类型，`INITIAL_STATE.theme` 与
`sanitizeUiPreferences` 的兜底值一起改成 `wuling`。

### 删的时候真正难的是「它不只住在预设文件里」

同一个名字最多有**五处**手写枚举（词表 / 三张 appearance 表 / `AppConfigSync` 的宿主白名单 /
i18n 两份 / store 默认值），漏任何一处都是静默失效而不是编译错误。编译器只帮其中三处：
`AppTheme` 收窄成单字面量之后，`Record<AppTheme, …>` 与 `=== "endfield"` 这类比较会红，
但**类名字符串**不会——实测 `WorkspaceLayout.tsx` 与 `FloatingComponentWindow.tsx` 各抄了一份
`theme === "endfield" ? "theme-endfield" : …`，`endfield.css` 已经不在了而这两个表达式还活着，
写下去的类名没有任何样式接它。现在只允许经 `presetThemeRootClass(theme)` 取类名（那张表在
`appearance.ts` 里是唯一真源），并且 `appearance.test.ts` 做**双向**差集：
每个预设的根类必须有同名 CSS 文件，盘上每个调色板文件必须被某个预设引用。

### 最贵的一条：预设文件里混着「全应用兜底层」

`spatial.css` 的选择器列表不止 `.theme-spatial`，它还有 bare `:root`（76 条：整套 shadcn 变量、
`--radius`、`--font-app-sans/mono`、`--chart-*`、`--sidebar-*`、`--ws-*`、整套 `--badge-*`）
和 `:root.dark` / `:root.dark:not(其他预设)`（暗色兜底 + 暗色 badge）。
**删掉这个文件就同时删掉了兜底层，而没有任何一处构建或类型会报错。** 后果是两条真实路径失去声明：

- React 挂上预设 class 之前的首屏；
- **任何导入的自定义主题**——`applyCustomTheme` 会把根上所有 `.theme-*` 摘掉。

`--radius` 没有声明时，`border-radius: var(--radius)` 不是「维持原样」，而是落到该属性的初始值
`0px`（见 §7 那条级联事实的加强版），于是整个界面直角。抓到它纯属运气：风格派那套浏览器测里
有一条「没开配方时卡片应当是圆的」的**阳性对照**变红了。

修复是把这一层搬成独立文件 `src/styles/themes/base.css`（在 `themes/index.css` 里排在
`wuling.css` **之前**，因为 `:root` 与 `.theme-wuling` 特指度相同、靠顺序让预设赢）。
颜色值取**武陵**的那一份（首屏不该闪一下已退役的 spatial 色板），武陵没声明的名字
（`--radius`、`--font-app-*`、`--badge-*`）原样保留 spatial 的值。

新增的尺 `src/styles/themes/baseFallback.browser.test.ts`（真 chromium）把这件事钉成三条：
根上确实没有预设 class（否则测的不是兜底）、15 个契约 token 加 `--radius`/`--badge-blue`/
`--font-app-sans`/`--ws-grid-color`/`--chart-3` 等在明暗两态都非空、以及**这把尺能看见缺失**
（同一个页面里读一个没人声明的名字必须回 `""`，再用 `var(--no-such-…)` 的 div 复现 `0px` 那个
真实故障形状）。

### 契约的判据换了一次理由

`PLUGIN_COLOR_TOKENS` 原来靠「17 个调色板的交集」来定义，语料塌成 1 个之后那条交集退化成
那一份文件自己的声明集——`--radius` 与 `--shadow` 因此**通得过**旧判据。它们仍然不在契约里，
但理由必须写成真的那一个，所以 `@xiranite/ui` 现在分两个名单：
`PLUGIN_TOKENS_EXCLUDED_BY_MEASUREMENT`（调色板层确实没声明：`scrollbar-thumb`、`surface-1`）
与 `PLUGIN_TOKENS_OWNED_BY_ANOTHER_AXIS`（有声明，但形状/高度归 `shape` / `elevation` 维度回答，
配方走 `--stijl-radius` / `--md3-shape-*` 而**不改** `--radius`，插件读到的是「调色板说的」而不是
画面画的）。`tokens.test.ts` 的样本量下限改成「≥1 个调色板文件**且亮暗两个完整 token 块都在**」，
阳性对照从 `--radius` 换成 `--scrollbar-thumb`；植入一个不存在的名字会让逐块尺与点名控件同时变红
（实测过，然后撤掉）。`base.css` 被显式排除在「调色板」之外——判据是身份块而不是文件名，
且注释要先剥掉（`base.css` 的出处说明里就写着 `.theme-wuling`，不剥注释会把兜底层当成样本，
反而把这条尺削弱成「兜底层替预设兜底」）。

### 明确没做

- 武陵**成为一份高级主题配方**（`AppDesignThemeId` 里多一条 endfield/武陵配方、按
  `docs/endfield-wuling-reference.md` 逐值带出处）——合并的下一半，还没开始。
- 高级主题自己的「取色」入口与颜色预设**平级**（用户第 4 点）：现在只有 MD3 内部的 seed 选择器。
- `packages/config` 与 `packages/services` 的测试夹具里还写着 `theme: "spatial"`：那是配置深合并测试里
  一个不透明的字符串，不参与 `AppTheme` 类型，改它要动别人的在途文件。


## 12. 第三份配方：武陵成为设计语言（2026-10-06）

§11 删掉 16 套预设之后，剩下的一半是用户那句「武陵得按照超级主题的配置来优，就是让它成为一个高级主题，
保留现有的预设的风格，然后进一步优化」。落地成 `src/lib/design-theme/wuling/`：`spec.ts` 是带出处的
token 表，`resolve.ts` 发 `--wl-*` 与桥接色，`src/styles/design/wuling-components.css` 是维度门住的组件层。

### 出处只有四类，而且不许互相冒充

- `preset` —— 现存 `src/styles/themes/wuling.css` 里量到的值，逐条写 `wuling.css:<行号>`。
- `reference` —— 本仓 `docs/endfield-wuling-reference.md` 第一版落地色板（那份文档自己声明
  「不能视为终末地官方色值」，所以这类值不许冒充官方）。
- `derived` —— 按写死规则从上两类推出来的值（取色派生主色槽，`WULING_SEED_RULE`）。
- `ui` —— 本仓转译，明写没有成文出处（例：`--wl-press-travel: 0px` 是把 `translateY(0)` 表达成可减的
  length，预设里那两行写的是 `0` 不是 `0px`）。

**为什么没有「从原画量出来」这一类**：`docs/endfield-wuling-reproduce.md` 记的 6,635 张从合法安装客户端
提取的 PNG 在 Windows 那台机器的 gitignored `artifacts/` 下，本机不存在（实测 `ls artifacts/reference/endfield-wuling`
无此目录）。量不了就不许声称量过——所以本配方没有任何一条标成 measured。

### 行号型出处必须被机器反查，否则「每条值带出处」是装饰

`src/lib/design-theme/wuling/spec.test.ts` 做三件事：① 被引用的行必须真的是声明行（以 `;` 或 `,` 结尾，
不是选择器行、不是注释行）；② `preset` 类的每个值（亮档查亮值、暗档查暗值）必须**原样出现在它声称的那
些行里**；③ 36 条桥接色逐槽与 `WULING_PRESET_COLORS` 对回原文。阳性对照用真行：第 9 行（选择器）、
第 1 行（注释）必须被判非声明；把 chip（第 222 行）错指到 `--radius`（第 11 行）必须露馅。
这条尺当场抓出我自己两处错引（`--shadow-md/-lg` 的暗色行号各偏了一行）——**这就是它值得存在的证据**。

### 「保留现有预设的风格」= 一条可执行的等式

`tokenCoverage.test.ts` 里有一条「默认档位逐条等于预设实测值」；`wuling-components.browser.test.tsx` 里
有一条在真 DOM 上比 36 个槽：`:root` inline（配方发的）与 `.theme-wuling` 类规则（预设发的）必须同值。
默认 seed 是 `oklch(0.72 0.13 173)` 的标准 sRGB 换算 `#28bf9d`，`seedSource` 默认 `activeTheme`，
`cornerScale` 默认 1 时**不发 `calc()`**（发原值，否则任何 `toBe("8px")` 都会漂）。

### 取色与颜色预设平级（用户第 4 点）

`wuling.seedSource = manual` 时用户在**设计语言这张卡里**直接指定主色，不必回上面的预设下拉；
`activeTheme` 时拿当前配色主题的主色，两者走同一条派生规则（tone 60 亮 / 80 暗，档位就来自上面那两行实测 L）。
解不出来时如实写 `data-wuling-seed-fallback="true"` 并回落到预设值，不拿别的颜色顶上。
界面还有四行回读：`SEED / SOURCE / CORNER / LABELS`——「选了」与「画面上真的换了」是两件事。

### 两条被这次改动照出来的「尺瞎了」

1. **卡片角半径撞车**：§11 把默认 `--radius` 从 spatial 的 0.375rem 对齐到武陵的 0.5rem 之后，
   本仓原样的 `rounded-xl` 算出 12px，**正等于 MD3 规范的 corner-medium**。于是 md3 那条
   「关掉 shape ⇒ 卡片角半径不等于 12px」变成恒真。判据换成机制：推 `--md-sys-shape-corner-extra-small`
   看 tooltip 跟不跟（跟 = 边接着），关掉 shape 之后同一个 token 必须不再带动它。
   同一条思路也用在卡片本身（`card radius follows the elevated-card shape token`）。
2. **按钮角半径在这个 harness 里本来就由皮肤钉住**：`src/index.css` 有 `border-radius: 9999px !important`
   作用在 `[data-slot="button"]`，开不开 MD3 都是 9999px。这是那条皮肤规则的既有形状（不是我这次改出来的），
   但它说明「按钮圆角等于 MD3 值」这条既有断言同样没有判别力——留给下一轮，别把它当成 MD3 的证据。

顺带记两条管路事实（都是当场踩的）：这个 provider **每次 `render()` 都往页面里加一棵树**，
`querySelector` 会一直命中最早那棵，所以「改了属性再测同一个元素」在这种写法下不成立；
以及夹具把 token 写在 `:root` inline 上，探针想临时改一个 token 必须**记下原值再写回**，
用 `removeProperty` 会把夹具的值一起删掉，`var()` 链子虚落成 `0px`（我当时读到的就是这个 0px）。

### 门禁与明确没做

新尺：`wuling/spec.test.ts`、`wuling-components.browser.test.tsx`（5 条，含「维度全关必须逐条回到本仓原样」）、
`registry.test.ts`（注册表↔i18n 中英两份、被注册就必须有 options 块、持久化边界吸附档位）、
`tokenCoverage.test.ts` 的 wuling describe（双向覆盖 + 不许 fallback + 角半径必须走阶梯）。
`scripts/md3-yield-to-skins.ts` 现在也扫武陵这层（现读 0 条撞车：皮肤族管的槽我没碰）。

没做：`--wl-*` 里没有任何**尺寸**类 token（控件高度/padding），因为那要求先证明「预设里有这个值」或
标成 `ui` 并给出与既有控件的等式——风格派那次就是在这上面被浏览器测纠正过；
图片取色、ripple、Tier-2 专有件仍未接。武陵配方在 Windows/真机上没有实机目测过，只有浏览器里的数值证据。

---

## 13. 第四份配方：Swiss / 国际主义排版（2026-10-06）

用户那句「加一份 Swiss 设计风格的高级主题」落在这里。它跟 §8 的风格派同一条路：**没有一份可以直接
抄数字的字典**，所以每条值都要回答「从哪来」，五类来源互不冒充（`spec` SBB 成文值 / `reference`
组合参考条款 / `extracted` 从既有实现量到 / `derived` 规则算出 / `ui` 本仓转译且自陈无出处）。

代码：`src/lib/design-theme/swiss/{spec.ts,resolve.ts,spec.test.ts}` ＋
`src/styles/design/{swiss-components.css,swiss-components.browser.test.tsx}`。命名空间 `--sw-*`。

### 上游是哪一份，许可管到哪一行

- **SBB Design System（mobile，Flutter）`sbb_design_system_mobile` 5.2.0**，本机克隆
  `Prometheus/_refs/sbb-design-system`，commit `bb4f34336112d7ae36367a1abf868b9f3a9d82bb`
  （2026-09-25）。`LICENSE` 是 MIT（Copyright 2024 Schweizerische Bundesbahnen AG），
  `sbb_colors.dart` 头部把色板指回 <https://digital.sbb.ch/de/foundation/colors/base-colors/>
  与那份 `SBB-Colors` Figma。
- ⚠️ **MIT 不覆盖字体与图标**：`NOTICE.md` 明写 `lib/fonts/SBBWeb-*.ttf` 是 URW++ 授权给 SBB 的
  受限许可（原文 "This is narrower than the MIT terms"），`sbb_icons_*.ttf` 连 formalize 的许可都没有。
  ⇒ 本配方**只抄数值**，不引进任何字体/图标资产；`typography` 这一维也不写 `font-family`
  （字族归颜色主题＋字体预设，见偏差 (c)）。
- **组合参考**：`Prometheus/_refs/bwt/templates/Swiss-Minimalist/Swiss-Minimalist.md`
  （designprompts.dev 那份 Swiss DNA 的中译本）。它不是规范，是一份可点名的实现意图；
  与 SBB 冲突时按「谁成文谁赢」，另一条记进下面的偏差清单。
- **同一套律的第二份实现**：姊妹项目 Kisaki 的 `kisaki_app/lib/theme/board_theme.dart`
  （`BoardTokens`）与 `test/swiss_law_test.dart`。它先按 SBB 落过一次，两边对不上的地方在下面
  偏差清单里记账，不假装其中一份唯一正确。

### 上游数值台账（手抄，且被机器反查）

这三张表是**手抄件**——它们才是出处。`swiss/spec.ts` 里的常量必须逐行等于它们，
`spec.test.ts` 双向核（表里有而常量没有＝红，常量里有而表里没有＝红）。

<!-- TABLE:SWISS-SBB-COLORS -->
| 名称 | 值 | 上游符号 |
|---|---|---|
| red | #EB0000 | SBBColors.red（`brand` 与 `product` 都等于它） |
| red85 | #FF3838 | SBBColors.red85（`errorDark` 就是它） |
| red125 | #C60018 | SBBColors.red125（`error` 就是它） |
| white | #FFFFFF | `SBBColors.white` |
| milk | #F6F6F6 | `SBBColors.milk` |
| cloud | #E5E5E5 | `SBBColors.cloud` |
| silver | #DCDCDC | `SBBColors.silver` |
| aluminum | #D2D2D2 | `SBBColors.aluminum` |
| platinum | #CDCDCD | `SBBColors.platinum` |
| cement | #BDBDBD | `SBBColors.cement` |
| graphite | #B7B7B7 | `SBBColors.graphite` |
| storm | #A8A8A8 | `SBBColors.storm` |
| smoke | #8D8D8D | `SBBColors.smoke` |
| metal | #767676 | `SBBColors.metal` |
| granite | #686868 | `SBBColors.granite` |
| anthracite | #5A5A5A | `SBBColors.anthracite` |
| iron | #444444 | `SBBColors.iron` |
| charcoal | #212121 | `SBBColors.charcoal` |
| midnight | #151515 | `SBBColors.midnight` |
| black | #000000 | `SBBColors.black` |
| night | #143A85 | `SBBColors.night` |
| success | #008233 | SBBColors.success（值同 `green`） |
| warning | #FCBB00 | SBBColors.warning（值同 `peach`） |
<!-- /TABLE -->

<!-- TABLE:SWISS-TYPE-SCALE -->
| 档 | 字号 | 行高 |
|---|---|---|
| xxSmall | 10 | 12 |
| xSmall | 12 | 16 |
| small | 14 | 20 |
| medium | 16 | 20 |
| large | 18 | 24 |
| xLarge | 24 | 32 |
| xxLarge | 30 | 32 |
<!-- /TABLE -->

<!-- TABLE:SWISS-GEOMETRY -->
| 名称 | 值 |
|---|---|
| zero | 0 |
| xxSmall | 4 |
| xSmall | 8 |
| small | 12 |
| medium | 16 |
| large | 24 |
| xLarge | 32 |
<!-- /TABLE -->

`--sw-rule-hairline` ＝ 1；`--sw-gap-cluster/-pad/-gutter/-section` ＝ 4/8/16/24
（`xxSmall/xSmall/medium/large`）；`--sw-section-rule-width` ＝ 32（`xLarge`）。

### token 台账（这一张由 `spec.ts` 生成，它是台账不是出处）

<!-- TABLE:SWISS-TOKENS -->
| cssVar | 维度 | 亮 | 暗 | 类 |
|---|---|---|---|---|
| --sw-corner-all | `shape` | 0px | 0px | `reference` |
| --sw-rule-hairline | `geometry` | 1px | 1px | `spec` |
| --sw-rule-structural | `geometry` | 2px | 2px | `reference` |
| --sw-gap-cluster | `geometry` | 4px | 4px | `spec` |
| --sw-gap-pad | `geometry` | 8px | 8px | `spec` |
| --sw-gap-gutter | `geometry` | 16px | 16px | `spec` |
| --sw-gap-section | `geometry` | 24px | 24px | `spec` |
| --sw-shadow-flat | `elevation` | `none` | `none` | `reference` |
| --sw-shadow-raised | `elevation` | `none` | `none` | `ui` |
| --sw-blur | `elevation` | `none` | `none` | `reference` |
| --sw-weight-text | `typography` | 400 | 400 | `spec` |
| --sw-weight-emphasis | `typography` | 700 | 700 | `spec` |
| --sw-line-height-body | `typography` | `calc(20 / 16)` | `calc(20 / 16)` | `spec` |
| --sw-line-height-label | `typography` | `calc(16 / 12)` | `calc(16 / 12)` | `spec` |
| --sw-tracking-label | `typography` | 0.08em | 0.08em | `extracted` |
| --sw-tracking-figure | `typography` | `-0.05em` | `-0.05em` | `reference` |
| --sw-label-transform | `typography` | `uppercase` | `uppercase` | `reference` |
| --sw-motion-duration | `motion` | 150ms | 150ms | `reference` |
| --sw-motion-enter-duration | `motion` | 200ms | 200ms | `reference` |
| --sw-motion-ease | `motion` | `linear` | `linear` | `reference` |
| --sw-press-travel | `motion` | 0px | 0px | `reference` |
| --sw-hover-ground | `states` | #DCDCDC | #5A5A5A | `ui` |
| --sw-invert-ground | `states` | #000000 | #FFFFFF | `reference` |
| --sw-invert-ink | `states` | #FFFFFF | #000000 | `reference` |
| --sw-accent-ground | `states` | #EB0000 | #EB0000 | `reference` |
| --sw-focus-ring-width | `states` | 2px | 2px | `reference` |
| --sw-grid-size | `geometry` | 24px | 24px | `reference` |
| --sw-grid-opacity | `geometry` | 3% | 5% | `ui` |
| --sw-dots-size | `geometry` | 16px | 16px | `reference` |
| --sw-dots-opacity | `geometry` | 4% | 6% | `ui` |
| --sw-pattern-ink | `geometry` | #000000 | #FFFFFF | `ui` |
| --sw-section-rule-thickness | `geometry` | 4px | 4px | `reference` |
| --sw-section-rule-width | `geometry` | 32px | 32px | `reference` |
<!-- /TABLE -->

桥接的 36 条槽另有出处：`SWISS_BRIDGED_COLOR_SOURCES` 每条写成 `sbb:<名>` / `alpha:<文件:行号>` /
`ui:<说明>`，测试按前缀分别回查——`sbb:` 必须等于上面那张色板表的同一行，`alpha:` 指的那一行
（`src/styles/themes/base.css`、`src/styles/themes/wuling.css`）必须真的含那个不透明度。

### 律是怎么落的

- **零圆角是第一律**：`--sw-corner-all: 0px`，而且它**不许有缩放档**——武陵那份有 `cornerScale`，
  Swiss 多一个 `cornerScale` 就等于把「严格矩形」变成口味。这条由 `audit:design-theme-tokens` 里
  「契约不许冒出第三个开关」那条钉住。
- **什么都不许浮**：`--sw-shadow-flat/-raised/--sw-blur` 全是 `none`。注意这一条**不是 SBB 说的**：
  SBB 成文的 0 只有两处（header 的 `elevation: 0.0`、按钮的 `elevation: 0`），它的 switch /
  slider thumb / paginator / header box 都带真 `BoxShadow`。所以「全平」的律来自组合参考，
  `--sw-shadow-raised` 干脆标 `ui`。
- **只有一个红**：`#EB0000` 同时是 `--primary`、`--ring`、`--sidebar-primary`、`--sidebar-ring`。
  暗档**不换值**（SBB 的 `brandDark = brand` 是成文的），但错误色换（`errorDark = red85`，也成文）。
- **层级是中性台阶，不是色相**：卡片面 `milk`、悬停 `silver`/`anthracite`、静默结构线 `cloud`/`iron`
  （`strokeSeparator` 两档，成文）。
- **字重只有两档**：400 / 700。

### 偏差清单（每条都带代价，不是「我们选择」）

- **(a) 两个红**：组合参考的 Swiss Red 是 `#FF3000`，SBB 的 `red` 是 `#EB0000`。取 SBB
  （有可点名的符号与公开规范页），另一条留在这里。
- **(b) 边框不是纯黑 4px**：组合参考写「Border: #000000（纯黑）— 结构可见」与 `border-4`。本仓不接。
  量过的理由在探针里：`[data-slot="button"]` 实测 `height 30px`（dense 档）／字号 14px，
  加 4px 框后内容盒只剩 22px，而这条配方要接管的是同一个产品里 30 多个节点的密集表格与工具条。
  落地是**两级**：静默线走 SBB 的 `strokeSeparator`（1px），主动作条 `32×4` 用红（组合参考自己的
  器件），`ruleWeight` 那一档只作用在抬起面的 `border-width` 上。想回到纯黑 4px：把
  `SWISS_BRIDGED_COLORS` 的 `--border` 改成 `black` 并把默认 `ruleWeight` 设成 4——两处都是一行的事，
  但那样这条配方就不再是「同一个产品里的 Swiss」，而是把落地页搬进工作台。
- **(c) 字号这一轴整个不发**。ADR-0080 允许「对当前已生效字号乘相对量」，这里连相对量都不用：
  `em` 在 `font-size` 里按**父元素**解算，而宿主各面板的父级字号不统一——探针实测 `Card` 里的
  `card-title` 16px、`badge` 12px、裸 `th` 16px（继承），真实节点表里的 `th` 却是 `text-xs` 12px。
  同一条 `calc(1em * 0.75)` 会长出两个 px，那不是排字阶，是把不可回读的东西伪装成规范。
  ⇒ `typography` 这一维只管与父级无关的：字重、行高（规范里的那两个商 `calc(20 / 16)`）、字距、大写。
- **(d) 不接管控件高度**：SBB 的 44.0 是成文的（list item `minHeight`、tab `portraitSize`、
  分段控件 `defaultButtonHeight`），但**按钮那一档不是 44**：`defaultSBBButtonHeight = 42.0`
  （small 30.0），`default_button_themes.dart` 的解释是「Figma 的 44 含内描边，渲染减 2 再加 1 外边距」。
  不接的理由与代价同 §8 那次密度事故（用户实机判「界面大小都变形」）。
- **(e) 暗档图案不透明度是本仓抬的**：`--sw-grid-opacity` 亮 3%（成文）／暗 5%，
  `--sw-dots-opacity` 亮 4%（成文）／暗 6%。两条都标 `ui`，因为「同一个量在黑地上读不出来」这句没有数。
- **(f) 900 那档存在但不用**：组合参考要 Black(900)；SBB 的阶梯只有 Light/Bold 两个族，但
  `SBBFontFamily` 其实声明了 7 个族，`.w900` 在 tab badge / stepper 里出现过。⇒「只有两档」是对
  **阶梯**的事实而不是对资产的事实，本配方按阶梯走（两档），这条不是「规范说一」。

### 宿主底片（2026-10-06 本机浏览器实测，未套颜色主题）

| 探针 | 计算值 |
|---|---|
| `[data-slot="badge"]` | font-size 12px`、`line-height 16px`、`font-weight 500`、`border-radius 3.36e7px`（= `rounded-full`）、`padding 2px/8px |
| `[data-slot="button"]` | font-size 14px`、`line-height 20px`、`font-weight 500`、`border-radius 6px`、`border-top-width 0px`、`padding 0/12 |
| `[data-slot="input"]` | font-size 14px`、`line-height 20px`、`border-radius 6px`、`border-top-width 1px`、`padding 4/12 |
| `[data-slot="card"]` | font-size 16px`、`line-height 24px`、`border-radius 12px`、`padding 24px/0 |
| `[data-slot="card-title"]` | font-size 16px`、`line-height 24px`、`font-weight 400 |
| `.xiranite-node-surface`（裸夹具） | `font-size 16px`、`line-height 24px`；`th`/`td` 继承同值 |
| 三者共同 | transition-duration 0.15s`、`transition-timing-function cubic-bezier(0.4, 0, 0.2, 1) |

三件事直接从这张表读出来：本仓正文基线 16px ＝ SBB `medium`；宿主默认已经是 0.15s ＝ 本配方的
150ms（所以动效这一维换的不是数，是**曲线**）；badge 的 `3.36e7px` 与按钮的 `border-width 0`
说明「零圆角」和「结构可见」两条律真的会改画面，不是自我宣称。

### 门禁与明确没做

尺：`swiss/spec.test.ts`（三张手抄台账 ↔ 常量 ↔ 出处前缀回查 ↔ 12 组 AA 对比度 ↔ 假出处必须被抓）＋
`audit:design-theme-tokens` 的 `swiss token coverage`（双向覆盖、禁 `var()` 兜底、默认档逐字等于表、
`ruleWeight` 只发成文三档、每个维度开关各咬各的）＋
`swiss-components.browser.test.tsx`（真计算值：零圆角、发丝线、红环、反相悬停、
「关掉这一维必须回到上面的底片」，另加**按钮/输入框高度不许被改动**那条 36px 红线）。

没做：不接管字族与字号；不接管控件高度；噪点纹理（组合参考的第四种图案）没接；
12 栏非对称栅格没接（理由见 (b)）；**没有真机目测**，只有浏览器里的数值证据。

---

## 14. 第五份配方：孤星（Arknights「孤星」/ Cassette Futurism，2026-10-06）

### 先说清楚哪一句是查到的、哪一句不是

用户要求「以明日方舟孤星的设计风格」做一份高级主题。本机**可查的只有**这些：

- **四条对这次活动 UI 的成文描述**（聚酯色偏的白地 / 高亮度橙只留给机械交互 / 几何是平面加曲线 /
  鹰角项目经理点名 Dieter Rams 与 less is more）。这四条沿自姊妹项目 Kisaki 在 `board_theme.dart`
  里的记录，**本仓 2026-10-06 复核失败**：web 搜索只命中聚合页与无关稿，没有任何官方访谈、
  设定集页面或一次方来源点名这四条。⇒ 它们在本仓是**转述**，不升级成事实，也不写进设置面板当宣传。
- **一份提取到的 Arknights token contract**（五个功能色相 + `cut.sm` 6 / `cut.md` 12 + 两条律）。
  它是**逆向提取**的产物，不是官方发布的规范。**原始 dart 文件在两台机器上都找不到**
  （2026-10-06 实机试：Windows 30902 上 `dir /s /b E:\gitea\design_tokens.dart` 与
  `E:\1VSCODE\design_tokens.dart` 都报「系统找不到指定的路径」，本机 `Base/` 全域 rg 也没有
  任何一个文件含 `designTokenAccentOrange`）。⇒ 本仓对那份 contract 的**唯一**依据是
  `board_theme.dart` 注释里的转录，因此这里不写任何我量不到的 sha256 或行数。
- **转录件才是本仓能反查的上游**：`docs/design-research/lonestar-kisaki-board-theme.snapshot.dart`
  ＝ `board_theme.dart` 的**逐字全份副本**（源文件 sha256 `573a468b6b15ab2135a48bdea2bbb6889446fa7f0000c57ff188653843247a59`，2026-10-06 取，
  一字未改，所以 `BODY` 之后那一段的 sha256 必须等于 `spec.ts` 里记下的那串——测试就是这么反查的）。
  LONESTAR-CONTRACT 表里的 `symbols` 那一列（`tokens.designTokenAccentOrange` 等）是
  **从这份转录件的注释里读到的符号名**，不是我能打开的文件；它的「从 `#E56B1C` 改校准成 `#F6540E`」
  这句也是转录件的原话。
- **一份 cassette-futurism 的成文设计契约**：`.style-refs/frontend-styles/catfu/AESTHETIC_CONTRACT.md`
  （§1 不可谈判项、§2 丝网印标签、§5 间距、§9 动效、§11 对比度）。这条是真的成文档，
  它给的是**律与器件**，不是孤星的色。⚠️ 它的**钴蓝调色板不采用**——那一组值是从一台真机上
  逐像素采的，属于 catfu 自己。

**没有任何人发布过孤星的十六进制色值**（Kisaki 的原话：*they are ours to defend, not quotes from
the source*）。所以下面 `calibrated` 那一类值都是**校准**而不是引用；本仓沿用同一批数，
不重新发明一遍，也不假装量过。

### 数值台账（手抄，被机器反查）

<!-- TABLE:LONESTAR-CONTRACT -->
| 名称 | 值 | 上游符号 |
|---|---|---|
| orange | #F6540E | `tokens.designTokenAccentOrange`（提取时已从 `#E56B1C` 改校准成 `#F6540E`） |
| cyan | #3FF7FF | `tokens.designTokenCyan` |
| yellow | #FFD802 | `tokens.designTokenWarning` |
| green | #46C47C | `tokens.designTokenDone` |
| grey | #9C9C9C | `tokens.designTokenNormalGrey` |
| cutSm | 6 | `tokens.cut.sm` |
| cutMd | 12 | `tokens.cut.md` |
<!-- /TABLE -->

<!-- TABLE:LONESTAR-CALIBRATION -->
| 名称 | 亮 | 暗 | 上游符号 |
|---|---|---|---|
| bg | #E7E2D6 | #15150F | `BoardPalette.bg` |
| card | #FAF7F0 | #211F1A | `BoardPalette.card` |
| border | #CFC8B8 | #45423A | `BoardPalette.border` |
| fg | #16150F | #F4F1E9 | `BoardPalette.fg` |
| fgMuted | #5C574B | #B4AE9F | `BoardPalette.fgMuted` |
| fgFaint | #8A8474 | #7E796C | `BoardPalette.fgFaint` |
| fgInverted | #16150F | #16150F | `BoardPalette.fgInverted`（两档同值） |
| primarySoft | #C2400A | #FF7A3C | `BoardPalette.primarySoft` |
| cyanInk | #0B6E75 | #3FF7FF | `BoardPalette.cyan`（亮档换明度不换色相） |
| hover | #EFEAE0 | #2B2924 | `BoardPalette.hover` |
| pressed | #D8D1C2 | #0C0C08 | `BoardPalette.pressed` |
| danger | #B02A1E | #FF6B5E | `BoardPalette.danger` |
| warn | #8A6A00 | #FFD802 | `BoardPalette.warn` |
| ok | #1F6B44 | #46C47C | `BoardPalette.ok` |
| selectionAlpha | 0.16 | 0.22 | `BoardPalette.selection` 的 alpha |
<!-- /TABLE -->

<!-- TABLE:LONESTAR-CHART -->
| 序号 | 值 |
|---|---|
| 1 | #F6540E |
| 2 | #3FF7FF |
| 3 | #FFD802 |
| 4 | #46C47C |
| 5 | #9C9C9C |
<!-- /TABLE -->

`LONESTAR_CONTRACT_LAWS` 那两条律在 CSS 里的形状是**可数的**：`--ls-glow` 在整层里只允许出现两次
（`:hover` 与 `:focus-within`），出现第三次就是「辉光变成常设背景」，浏览器测当场红。

### token 台账（由 `lonestar/spec.ts` 生成）

<!-- TABLE:LONESTAR-TOKENS -->
| cssVar | 维度 | 亮 | 暗 | 类 |
|---|---|---|---|---|
| --ls-cut-panel | `shape` | 6px | 6px | `contract` |
| --ls-cut-block | `shape` | 12px | 12px | `contract` |
| --ls-radius-none | `shape` | 0px | 0px | `reference` |
| --ls-hairline | `geometry` | 1px | 1px | `reference` |
| --ls-rule-emphasized | `geometry` | 2px | 2px | `ui` |
| --ls-step-rule-width | `geometry` | 32px | 32px | `reference` |
| --ls-step-rule-thickness | `geometry` | 4px | 4px | `reference` |
| --ls-gap-cluster | `geometry` | 4px | 4px | `reference` |
| --ls-gap-pad | `geometry` | 8px | 8px | `reference` |
| --ls-gap-gutter | `geometry` | 16px | 16px | `reference` |
| --ls-gap-section | `geometry` | 24px | 24px | `reference` |
| --ls-figure-variant | `geometry` | `tabular-nums` | `tabular-nums` | `reference` |
| --ls-figure-font | `geometry` | `var(--font-app-mono)` | `var(--font-app-mono)` | `ui` |
| --ls-shadow-flat | `elevation` | `none` | `none` | `reference` |
| --ls-glow | `elevation` | 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent) | 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent) | `derived` |
| --ls-bevel-inset | `elevation` | `inset 0 1px 0 color-mix(in oklab, #16150F 10%, transparent)` | `inset 0 -1px 0 color-mix(in oklab, #16150F 12%, transparent)` | `ui` |
| --ls-weight-text | `typography` | 400 | 400 | `reference` |
| --ls-weight-emphasis | `typography` | 700 | 700 | `reference` |
| --ls-line-height-body | `typography` | `calc(20 / 16)` | `calc(20 / 16)` | `reference` |
| --ls-line-height-label | `typography` | `calc(16 / 12)` | `calc(16 / 12)` | `reference` |
| --ls-tracking-label | `typography` | 0.08em | 0.08em | `reference` |
| --ls-tracking-step | `typography` | 0.2em | 0.2em | `reference` |
| --ls-tracking-figure | `typography` | `-0.0167em` | `-0.0167em` | `derived` |
| --ls-label-transform | `typography` | `uppercase` | `uppercase` | `reference` |
| --ls-motion-duration | `motion` | 80ms | 80ms | `reference` |
| --ls-motion-ease | `motion` | `linear` | `linear` | `reference` |
| --ls-blink-ease | `motion` | `step-end` | `step-end` | `reference` |
| --ls-blink-duration | `motion` | 1.2s | 1.2s | `ui` |
| --ls-press-travel | `motion` | 1px | 1px | `reference` |
| --ls-hover-ground | `states` | #EFEAE0 | #2B2924 | `calibrated` |
| --ls-pressed-ground | `states` | #D8D1C2 | #0C0C08 | `reference` |
| --ls-selection-ground | `states` | `color-mix(in oklab, #0B6E75 16%, transparent)` | `color-mix(in oklab, #3FF7FF 22%, transparent)` | `derived` |
| --ls-selection-ink | `states` | #0B6E75 | #3FF7FF | `calibrated` |
| --ls-rule-strong | `states` | #D8D1C2 | #B4AE9F | `ui` |
| --ls-focus-ring-offset | `states` | 2px | 2px | `ui` |
<!-- /TABLE -->

### 切角是怎么落的，以及为什么按钮不切

`--ls-cut-panel: 6px` / `--ls-cut-block: 12px` 不是 `border-radius`，是 **`clip-path: polygon()` 的
八个锚点**（四角各切 45°），等价于 Kisaki 那边 `BeveledRectangleBorder(borderRadius: cut)` 的形状。
三条实测出来的取舍：

1. **切过的面上画不出描边**：chromium 里 `clip-path` 会把 `box-shadow` 一起裁掉（本浏览器测的第一版
   就是这么红的——「静息态不许有辉光」那条断言读到的不是 `none` 而是一个被裁剩的 1px 环）。
   ⇒ 分工：**面板与抬起块吃切角**，**按钮与输入框吃直角＋发丝线＋辉光**，一个组件只有一种角处理——
   这一条正好是那份 contract 自己的规则，不是我替它加的。
2. 切角归形状维，但「关掉 shape 必须回到本仓原样」那条断言读的是**边框宽度**而不是 `clip-path`
   计算值：声明撤掉之后 `getComputedStyle` 的 clip-path 本来就报 `none`，读它测不到东西。
3. 抬起块的粗边框（`--ls-rule-emphasized`）与切角同时存在时，斜边可分长度必须 ≥ 2× 线宽，
   否则 2px 的边在 45° 口上自相交。测试里那条算术（`100% - 2×12 - 2×2`）就是这个。

### 颜色：两块地、一个橙、选中永远是青

上面 LONESTAR-CONTRACT 与 LONESTAR-CALIBRATION 两张表就是全部色值来源。三条要命的：

- **`--primary` 在两档都是 `#F6540E`**，而 `--destructive` 两档**不同值**（亮 `#B02A1E`、暗 `#FF6B5E`）
  ——于是 `--destructive-foreground` 在两档**必然相反**（亮档配纸白、暗档配近黑）。这不是手调口味：
  `spec.test.ts` 用 `contrast.ts` 现算，既复现这两个方向，又把 12 组关键色对的对比率钉在 AA 上。
- **选中态永远不许等于那个橙**：种子色只允许覆盖「动作面」六条槽，`LONESTAR_SEED_RULE.frozenSlots`
  那七条（选区两件＋图表五条）一旦被派生名单撞上就直接抛异常。测试拿一个离谱种子（纯绿 `#00ff00`）
  撞两次：一次证明 `--primary` 真的跟着换了（否则这条可以空过），一次证明选区与图表**没跟着换**。
- **不跟随配色主题**：武陵与 MD3 默认 `seedSource: activeTheme`，孤星默认 `manual`。
  那条「高亮度橙」是身份本身，跟随用户当前主题等于把它变成另一个色相。这条差别在
  `contract.ts` 的 `LoneStarOptions` 注释与设置面板的 `lonestarProvenanceNote` 里各说一次。

### 与 Kisaki 那份的差异（同一批数，两个产品，差别要记账）

| 本仓 | Kisaki | 为什么 |
|---|---|---|
| `--ls-*` 命名空间 | `BoardPalette` 的 getter | 两层都往 `:root` inline 写会互相误认（见 `apply.ts` 那条顺序约束） |
| 切角用 `clip-path` | `BeveledRectangleBorder` | 技术栈不同；锚点数量与角度一致 |
| 面板切角、按钮直角＋辉光 | 面板与按钮都切（Flutter 的 outline 不被裁） | 上面第 1 条：Web 上描边会被裁剩 |
| `--ls-figure-font: var(--font-app-mono)` | `figureFamily` 按平台选 Menlo / Consolas | 本仓字族归字体预设，配方只借它已有的等宽档 |
| 不接管高度 | `rowHeight 52 / headerHeight 56` | 与 §13 偏差 (d) 同一条理由（密度打架） |

### 复核命令（这三条是本仓跑得动的，不是「参考链接」）

```bash
# ① 上游转录件（本机可读，且 sha256 记在 lonestar/spec.ts 的 LONESTAR_UPSTREAM_CALIBRATION_SHA）
shasum -a 256 docs/design-research/lonestar-kisaki-board-theme.snapshot.dart
rg -n "0xFF" docs/design-research/lonestar-kisaki-board-theme.snapshot.dart   # 逐值反查用
# ② 那份 token contract 的 dart 原件：**找不到**（别按下面的路径再试一次，两条都已实测为不存在）
#    ssh 30902@100.122.176.77 "cmd /c dir /s /b E:\gitea\design_tokens.dart"     # 路径不存在
#    ssh 30902@100.122.176.77 "cmd /c dir /s /b E:\1VSCODE\design_tokens.dart"   # 路径不存在
# ③ 四条成文属性的一次方来源：本机搜过，**没有命中**——这句是结论，不是待补的步骤
```

### 门禁与明确没做

尺：`lonestar/spec.test.ts`（三张手抄台账 ↔ 常量 ↔ `contract:`/`calibrated:`/`alpha:`/`ui:` 前缀回查
↔ 12 组 AA 对比度 ↔ **转录件逐值反查**）＋ `audit:design-theme-tokens` 的 `lonestar token coverage` ＋
`lonestar-components.browser.test.tsx`（切角真的把圆角归零、辉光出现次数恰好两次、选中不是主色、
`tabular-nums`、指示灯走 `step-end`、关掉维度回到底片、36px 高度红线）。

没做：不给小控件加 `clip-path`（见上）；没有 marquee / 扫描线 / LCD 点阵那些 catfu 器件
（这个产品里没有对应物，硬造就是装饰）；闪烁只落在进度指示上；**孤星的排版比例没有官方件**，
`calibrated` 就是 calibrated，面板上照实说；**没有真机目测**，只有浏览器里的数值证据。
