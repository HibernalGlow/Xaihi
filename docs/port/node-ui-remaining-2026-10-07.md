# 节点界面残余（2026-10-07 实测）

这一档只回答一个问题：`packages/ui-host/src/test/setup-webstorage.ts` 与 `setup-i18n.ts`
两层修完并各自提交之后，`src/nodes/**` 那一族**还剩多少红**、剩下的红**各自是谁买的单**。
所有数字都是当场跑出来的，每条判断后面跟着它的 rc 与真实输出行；没跑的部分在第 6 节点名。

## 1. 三个数

前置：本仓四个包（`packages/{shared,contract,cli-runtime,logging}`）当时没有自己的 `node_modules`，
别名表把 `@xiranite/shared` / `@xiranite/contract` 指到这些包的 `src/*.ts`，那些源码里的裸 `zod` 解析不到，
整族 43 个文件里 31 个直接收不起来。**这一层本轮自己复现了一遍**（四条软链撤掉之后现跑，不是引用上一档的读数）：

### 1a. 无软链（前置那一层）

```sh
cd packages/ui-host && ../../node_modules/.bin/vitest run -c vitest.nodeui.config.ts   # 无软链
```

```
rc=1
 Test Files  31 failed | 12 passed (43)
      Tests  52 passed (52)
```

解析不到的规格只有 `zod`，来自三处：

```
   3 Failed to resolve import "zod" from "../shared/src/index.ts"
   1 Failed to resolve import "zod" from "../shared/src/rules.ts"
   1 Failed to resolve import "zod" from "../logging/src/schema.ts"
```

本轮临时建了四条软链把这一层垫掉，**跑完即删**（见第 7 节）：

```sh
ln -s ../ui-host/node_modules packages/shared/node_modules
ln -s ../ui-host/node_modules packages/contract/node_modules
ln -s ../ui-host/node_modules packages/cli-runtime/node_modules
ln -s ../ui-host/node_modules packages/logging/node_modules
```

建之前 `find packages plugins -maxdepth 2 -name node_modules -type l` 输出为空（四条位置都干净，四条 `ln` 各自 rc=0）。

### 1b. 带两层起手

```sh
cd packages/ui-host && ../../node_modules/.bin/vitest run -c vitest.nodeui.config.ts
```

```
rc=1
 Test Files  8 failed | 35 passed (43)
      Tests  11 failed | 391 passed (402)
     Errors  20 errors
   Duration  9.22s (transform 6.83s, setup 2.08s, import 28.20s, tests 26.98s, environment 9.36s)
```

### 1c. 减法对照（抽掉 `setup-i18n.ts` 一条腿）

```sh
cd packages/ui-host && XAIHI_UI_WITHOUT_SETUP=1 ../../node_modules/.bin/vitest run -c vitest.nodeui.config.ts
```

```
rc=1
 Test Files  19 failed | 24 passed (43)
      Tests  103 failed | 299 passed (402)
     Errors  13 errors
   Duration  8.13s (transform 6.31s, setup 860ms, import 26.92s, tests 27.00s, environment 8.12s)
```

`103 − 11 = 92` 条断言、`19 − 8 = 11` 个文件靠 `setup-i18n.ts` 这一条起手翻绿，
与上一档"~92 条读中文标签"的口径逐位对上 ⇒ **那条起手是承重的，不是装饰品**。
被翻回来的 11 个文件：`classq`、`cleanf`、`crashu`、`dissolvef/Component`、`dissolvef/Component.host`、
`enginev`、`formatv`、`nameu`、`recycleu`、`smartzip`、`timeu` 的 `Component.test.tsx`（`enginev` 一次带走 13 条，
`cleanf` 11 条，`crashu`/`dissolvef`/`smartzip` 各 10 条，`trename` 从 12 条降到 1 条）。

## 2. 逐文件 pass/fail（1b 那一跑，43 个文件全收起来了，没有 0 测试的文件）

红 8 个：

| 文件 | 该文件测试数 | 红 |
| --- | --- | --- |
| `src/nodes/bandia/Component.test.tsx` | 11 | 1 |
| `src/nodes/classf/Component.test.tsx` | 13 | 2 |
| `src/nodes/linku/Component.test.tsx` | 12 | 1 |
| `src/nodes/migratef/Component.test.tsx` | 14 | 1 |
| `src/nodes/rawfilter/Component.test.tsx` | 13 | 1 |
| `src/nodes/shared/RuleTreeEditor.test.tsx` | 4 | 1 |
| `src/nodes/sleept/Component.test.tsx` | 14 | 3 |
| `src/nodes/trename/Component.test.tsx` | 16 | 1 |

绿 35 个（括号内是断言数）：`bitv`(8)、`classq`(15)、`cleanf`(13)、`crashu`(12)、
`dissolvef/Component.host`(2)、`dissolvef/Component`(12)、`encodeb`(13)、`enginev`(25)、
`findz/workspace-layout`(2)、`formatv`(11)、`gifu`(10)、`linedup/Component.host`(2)、`linedup/Component`(13)、
`logx/Component`(7)、`logx/browser-boundary`(1)、`marku/Component`(14)、`marku/workflow-result-projection`(3)、
`marku/workflow-state`(14)、`mvz`(14)、`nameu`(12)、`recycleu`(18)、`repacku`(12)、`samea`(1)、
`shared/LocalAudioPreviewDialog`(1)、`shared/LocalImagePreview`(3)、`shared/LocalImagePreviewDialog`(1)、
`shared/LocalVideoPreview`(3)、`shared/LocalVideoPreviewDialog`(2)、`shared/NodeConfigPopover`(7)、
`shared/api`(8)、`shared/externalNodeGateway`(1)、`shared/useLocalFileDrop`(5)、`shared/useNodeSurface`(16)、
`smartzip`(14)、`timeu`(10)。

## 3. 上游对照是怎么做的

**搬运基线那棵工作树（`.scratch/xiranite-noxide`，HEAD `ccf465fe` 2026-09-13，工作树干净）跑不起来**，
这是实测不是推测：它没有 `node_modules`（`ls: node_modules: No such file or directory`），
临时把上游主检出那份 `node_modules` 软链过去之后，8 个文件全部在**收集阶段**就死，
死因是那棵提交里的 `vite.config.ts:246` 把 `@hibernalglow/folia-player/locales` 别名指到
`vendor/folia-major/packages/player/src/locales.ts`，而工作树里 `vendor/folia-major` 是个**没初始化的子模块空目录**：

```
rc=1
 Test Files  8 failed (8)
      Tests  no tests
Error: Failed to resolve import "@hibernalglow/folia-player/locales" from "src/i18n/index.ts". Does the file exist?
  File: /Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/src/i18n/index.ts:71:46
```

补子模块要动 git 写操作（不在授权范围内），那条软链当场删掉、工作树回到 `git status --porcelain | wc -l` = 0。

于是上游那一跑改在**装好依赖的上游主检出** `/Users/glow/Base/Code/Freya/Xiranite`（HEAD `26949750` 2026-10-05）做，
与上一档 `docs/port/ui-tests-283-triage.md:166` 用的是同一棵、同一条命令路数。
它跑得起来这件事也顺手解释了为什么两棵不一样：主检出的 `vite.config.ts` 里 `folia-player` **零命中**
（`rg -c "folia-player" Xiranite/vite.config.ts` ⇒ `No matches found`；它的 `vendor/` 是
`Xiranite-Nexus neoxide ocean-dataview`，没有 `folia-major`）⇒ 那一版已经把这条别名换掉了。
这个**版本差是这条证据的已知让步**，下面第 4 节把差额的每一处都单独钉住了，没有靠"反正差不多"糊过去。

## 4. 归因：8 个红文件 / 11 条红断言，全部落在 `upstream-red`

上游同一条命令（8 个文件一起点）：

```sh
cd /Users/glow/Base/Code/Freya/Xiranite && ./node_modules/.bin/vitest run \
  src/nodes/shared/RuleTreeEditor.test.tsx src/nodes/bandia/Component.test.tsx \
  src/nodes/classf/Component.test.tsx src/nodes/sleept/Component.test.tsx \
  src/nodes/linku/Component.test.tsx src/nodes/migratef/Component.test.tsx \
  src/nodes/rawfilter/Component.test.tsx src/nodes/trename/Component.test.tsx
```

```
rc=1
 Test Files  8 failed (8)
      Tests  11 failed | 86 passed (97)
```

四个独立读数叠起来才敢判 `upstream-red`：

1. **总数同档**：两边这 8 个文件的测试数都是 97（本仓 `11+13+12+14+13+4+14+16 = 97`），红都是 11。
2. **标题集逐字节相同**：两边 `FAIL` 行剥 ANSI、去掉前缀后排序 `diff` ⇒ `IDENTICAL TITLE SETS (11/11 match)`，rc=0。
3. **错误文本集逐字节相同**：同一套做法比 `TestingLibraryElementError:` / `AssertionError:` 首行 ⇒ `MSG SETS IDENTICAL`，rc=0。
4. **失败点 file:line:col 逐个相同**：11 条全部对上（下表最后一列），两侧一一对应。

| 文件 | 红的测试标题 | 错误文本（首行，两侧一致） | 失败点（两侧同） |
| --- | --- | --- | --- |
| `bandia/Component.test.tsx` | uses the shared configuration-management workflow | `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "配置管理"` | `:100:29` |
| `classf/Component.test.tsx` | runs plan through host.runner.run and stores classification rows | `AssertionError: expected { nodeId: 'classf', input: { …(20) } } to deeply equal { nodeId: 'classf', input: { …(13) } }` | `:94:30` |
| `classf/Component.test.tsx` | previews the planned target hierarchy in the file tree tab | `TestingLibraryElementError: Unable to find an element with the text: a.zip · 待执行…` | `:143:19` |
| `linku/Component.test.tsx` | uses shared configuration management controls | `TestingLibraryElementError: Unable to find role="button" and name "配置管理"` | `:186:11` |
| `migratef/Component.test.tsx` | uses shared configuration management in full view | `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "配置管理"` | `:109:29` |
| `rawfilter/Component.test.tsx` | saves and restores shared configuration | `TestingLibraryElementError: Unable to find role="button" and name "配置管理"` | `:193:11` |
| `shared/RuleTreeEditor.test.tsx` | renders semantic theme classes and mature query-builder controls | `AssertionError: expected …(3) to have a length of 4 but got 3` | `:44:72` |
| `sleept/Component.test.tsx` | renders the collapsed surface with Sleept-specific UI | `TestingLibraryElementError: Unable to find an element with the text: /倒计时 \/ 休眠 \/ 演练/…` | `:53:23` |
| `sleept/Component.test.tsx` | runs countdown through host.actions.run and stores progress and logs | `AssertionError: expected { nodeId: 'sleept', input: { …(14) } } to deeply equal { nodeId: 'sleept', input: { …(14) } }` | `:107:30` |
| `sleept/Component.test.tsx` | saves, restores, clears, and opens default config controls | `TestingLibraryElementError: Unable to find role="button" and name "sleept defaults"` | `:212:11` |
| `trename/Component.test.tsx` | uses shared configuration management controls | `TestingLibraryElementError: Unable to find role="button" and name "配置管理"` | `:193:11` |

### 版本差额单独钉了一遍

`cmp` 逐字节比 8 个测试文件在 `ccf465fe` 与 `26949750` 两棵里的内容：`bandia`、`shared/RuleTreeEditor` **SAME**
（这 2 个文件 3 条红，上游那一跑就是同内容，没有让步）；另外 6 个 DIFFERS。对那 6 个，
去搬运基线那棵里现读**被测表达式本身**是否还在（行号有平移，字符串一条不落）：

```
.scratch/xiranite-noxide/src/nodes/bandia/Component.test.tsx:100  await user.click(screen.getByRole("button", { name: "配置管理" }))
.scratch/xiranite-noxide/src/nodes/shared/RuleTreeEditor.test.tsx:44  expect(container.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(4)
```

```
配置管理 出现次数（基线那棵）: bandia=1 linku=2 migratef=1 rawfilter=2 trename=2
sleept  基线 :50  expect(screen.getByText(/倒计时 \/ 休眠 \/ 演练/)).toBeTruthy()
sleept  基线 :112 targetDatetime: undefined
sleept  基线 :195-196 getByRole("button", { name: "sleept defaults" })
classf  基线 :141 expect(screen.getByText("a.zip · 待执行")).toBeTruthy()
```

⇒ 11 条红的**期望值在搬运基线那一版里同样存在且字面相同**，跨版本的只是行号平移。
`upstream-red` 这个判据在两个版本上都成立。

## 5. 其余四档

- **(b) `port-defect`：空**。判据不是"没找到"，是两条反证：11 条红的失败点 `file:line:col` 与上游**逐个相同**
  （真分叉一般先把行号顶开），且第 4 节那 11 个标题与错误文本两侧 `diff` 全等。
  `fuse-button.tsx` 那处唯一的两侧差异另有原因（第 5 节 (e)：源码逐字节相同、差在依赖版本），不是分叉。
- **(c) `dep-missing`：0 个红文件**，但**别读成"这层修好了"**。本轮是靠四条临时软链垫起来的，
  没软链时同一条命令就是第 1a 节那一跑（本轮实测，rc=1，`31 failed | 12 passed (43)` / `52 passed (52)`）。
  缺的规格就是 `packages/shared/src` 与 `packages/logging/src` 里的裸 `zod`：
  `packages/shared/package.json` 的 `dependencies` 现读是 `"csv-parse": "^7.0.1", "json-rules-engine": "7.3.1", "zod": "^4.3.6"`，
  `packages/logging/package.json` 含 `"zod": "^4.3.6"`，`packages/contract/package.json` 只有
  `"@hibernalglow/xaihi-shared": "workspace:*"`。正解是 `pnpm install` 给这四个包各建真 `node_modules`；
  本轮按指示没跑（`pnpm-lock.yaml` 与 `packages/{api,cli-runtime,cli,contract,logging,shared,ui-host}/package.json`
  正在别的 lane 手里改）。⇒ 这一档**记在"待别的 lane 落地"，不记成已清**。
- **(d) `harness-missing`：空**。起手两层已齐（`vitest.nodeui.config.ts:30-32` 把 `setup-webstorage.ts` 与
  `setup-i18n.ts` 都写上），对应上游那两棵的同一处：搬运基线 `ccf465fe` 的 `vite.config.ts:355-357`
  与本轮实跑的 `26949750` 的 `vite.config.ts:368-370`，两边都是
  `environment: "happy-dom"` + `setupFiles: [./src/test/setup-i18n.ts]`（上游只有 i18n 这一条起手，
  webstorage 那条是本仓为 Node 26 加的一层，上游那棵里没有对应物）。
  一处**已知不同但本轮没造成红**：`server.deps.inline` —— 基线 `vite.config.ts:359-363` 是 `["zod"]`，
  `26949750` 的 `vite.config.ts:372-378` 是 `["zod", "@material/material-color-utilities"]`，
  而本仓 `vitest.config.ts:63-67` 只内联 `@material/material-color-utilities`、**没有 `zod`**；
  1b 那一跑 zod 解析正常（软链把 node_modules 供上了），所以这条**不判红**，
  留作装好依赖后要回头看的一眼——真缺 `node_modules` 时它可能才露头。
- **(e) `flaky-or-env`：0 个红文件，但 20 条未处理 rejection，足以让 rc 恒为 1**。
  本仓 1b 报 `Errors 20 errors`，上游那一跑**一条都没有**（其汇总块里根本没有 `Errors` 行）。
  20 条来自 20 个**互不相同**的文件（`rg -o 'This error originated in "([^"]+)"' | sort -u | wc -l` ⇒ 20），
  与第 2 节的红绿表 join 之后 ⇒ **6 个红文件 + 14 个绿文件**（bandia、shared/RuleTreeEditor 这两个红文件不在里面）。
  那 14 个绿的：`bitv`、`classq`、`cleanf`、`crashu`、`dissolvef/Component`、`encodeb`、`formatv`、`gifu`、
  `marku`、`mvz`、`nameu`、`recycleu`、`smartzip`、`timeu`。

  ```
  AbortError: The animation was canceled.
   ❯ Animation.cancel ../../node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/animation/Animation.js:161:32
   ❯ src/components/ui/fuse-button.tsx:213:21
      213|       anim.current?.cancel()
  ```

  不是搬运买的：`fuse-button.tsx` 两侧 205-216 行**逐字节相同**（`anim.current?.cancel()` 都在 `:213`）。
  差别在依赖解析档：两边 manifest 都写 `"happy-dom": "^20.10.6"`
  （本仓 `packages/ui-host/package.json:121`、上游 `package.json:307`），
  本仓 lock 浮到 `happy-dom@20.14.5`（`Xaihi/pnpm-lock.yaml`、`node_modules/.pnpm/happy-dom@20.14.5`），
  上游实装 `20.10.6`，而 `20.10.6` 那份**连 `lib/animation/` 目录都没有**
  （`ls: Xiranite/node_modules/happy-dom/lib/animation/: No such file or directory`），
  `20.14.5` 那份在 `Animation.js:161` 主动 `#rejectFinished?.(DOMException('The animation was canceled.', abortError))`。
  ⇒ 同一个 caret 区间内的 lock 漂移。后果要说清：**11 条红全修完，这条命令的 rc 仍然是 1**，
  要它真绿得先压住这 20 条（`pnpm.overrides` 钉 `happy-dom`，或给 `:213` 那次 cancel 兜住 rejection——
  后者是在改搬运文件的红线路，按 AGENTS.md 那条"不要给正在重写的搬运文件画新红线"排给正在写它的人，不在本轮动）。

### 档位汇总

| 档 | 红文件 | 红断言 |
| --- | --- | --- |
| (a) `upstream-red` | 8 | 11 |
| (b) `port-defect` | 0 | 0 |
| (c) `dep-missing` | 0（但整族没有四条临时软链就跑不起来，见 (c) 那条） | 0 |
| (d) `harness-missing` | 0 | 0 |
| (e) `flaky-or-env` | 0 | 0（但有 20 条未处理 rejection，让 rc 恒为 1） |
| 合计 | **8** | **11** |

## 6. 本轮没有跑的东西

- 上游那一跑**没有在搬运基线 `ccf465fe` 上完成**，只在 `26949750` 上完成；基线那棵的不可跑是第 3 节实测的，
  跨版本的等价性靠第 4 节那四处字符串核对，不是靠假设。
- 上游 `26949750` 的工作树是脏的（`git status --porcelain | wc -l` = 918，别的 lane 的在飞改动），
  本轮只读它、只往它自己的 `node_modules` 写缓存，没动它的源码。
- 没跑 `pnpm install`（按指示禁）、没跑全仓 `pnpm test`（别的 lane 在飞，结果不可归因）、
  没跑 `check:pins` / `check:installable` / `check:brand`（本轮没改这些尺覆盖的东西，且四条软链是临时物、不进口）。
- **没有把任何残余判成"可交付"**：1b 仍是 rc=1。
- 未搬运的测试文件不在本轮口径里（本轮只归因"红的文件"）。只顺手取了一个数：
  `packages/ui-host/src/nodes/` 有 27 个节点目录，搬运基线那棵 `src/nodes/` 有 52 个，
  差 24 个（`arcthumb audiov clipm comfygure coveru czkawka envuconfig gitalso jellypot kavvka lata lorat
  melodeck movea neoview owithu scoolp seriex snf soundw synct transq vert xlchemy`）；
  **这 24 个里有多少是"上游已把 UI 迁走"、多少是"我们漏搬"，本轮没查**，不许当下成结论。

## 7. 清理

四条软链跑完即删，且只删这四条：

```sh
rm packages/shared/node_modules packages/contract/node_modules packages/cli-runtime/node_modules packages/logging/node_modules
```

```
rc=0
$ find packages plugins -maxdepth 2 -name node_modules -type l
（无输出）
```

`[ -e packages/<p>/node_modules ]` 逐个复核 ⇒ 四条全 `gone`。
除这四条之外，本轮在 `packages/`、`plugins/` 下没有建过任何文件。

**另一棵里的一次临时物也要记上**：第 3 节为了试跑上游基线那棵，在
`.scratch/xiranite-noxide/` 建过一个 `node_modules` 软链（指向上游主检出），
当场 `rm` 掉了（`rc=0`，现测 `ls` ⇒ `No such file or directory`），那棵回到 `git status --porcelain | wc -l` = 0。

**没有任何 git 写操作**：全程没跑 `git add` / `git commit` / `git push` / `git checkout` / `git stash` /
`git submodule add`，也没跑 `but commit` / `but discard` / `but undo`。
只在三棵上游工作树上跑过**只读**查询（`git rev-parse` / `git log -1` / `git status --porcelain`），
本仓的归属用 `but status` 读了一遍（只读），输出里 `docs/port` 那一片只有一行、就是本文档：

```
┊   kss  A docs/port/node-ui-remaining-2026-10-07.md
```

⇒ 本文档是**新建文件**，未编辑任何既有文件、未改任何测试、未改任何源码、未提交。
上游主检出 `26949750` 那棵脏文件数在本轮跑完后仍是 918（跑前也是 918），源码未动。
