# 实机：27 个节点装进 profile，产物经真的路由取回（2026-10-07）

这一页只记**量到的东西**。命令都在仓库里跑过，rc 是原样的 rc，输出是原样的输出。
上一版这一步的说法停在"Gate 2.x 过了"，而那次的证据是 hello 一个样本包；
这一页把同一套判据铺到全部 27 个已装节点上，并把其中一条**假绿的负控**抓了出来。

## 1. 装了什么（bundle 层合入的证明）

```
$ pnpm plugin:add <plugins/* 里 23 个 settled 包的绝对路径>
ADD_RC=0
$ pnpm profile:dump
DUMP_RC=0        # 1347 行合并后的层配置
$ rg -c "^# == @hibernalglow" /tmp/profile-dump2.txt
29
```

29 = 27 个节点包 + `@hibernalglow/xaihi-core` + `@hibernalglow/xaihi-ui`。
`--dump-config` 打印的是**分层合入之后**的配置，所以这一条证的是 ADR-0002 的形状
（插件即 bundle、各自带 `cordis.patch.yml`）真的被 DSH 的 boot 接受了，不是"我们假定它会接受"。

先做的事：`@hibernalglow/xaihi-hello` 从 profile 里摘掉了。
并发 lane 在工作区删了 `plugins/hello`（`but status` 里那条 `D`），而 profile 的
`dependencies` 里还留着一条指向那个目录的 `file:`。
DSH 的 `plugin add` 会**重算整张 bundles 表**，于是那一条悬空引用让任何一次 add 都失败：

```
Error: × adding a new package
  ╰─▶ Failed to resolve dependency tree: Could not install from
      ".../Xaihi/plugins/hello" as it does not exist.
```

`pnpm plugin:remove @hibernalglow/xaihi-hello` ⇒ `RM_RC=0`，profile 回到 7 个依赖，
再 add 才走得动。仓库里没有任何消费者把 `plugins/hello` 当路径读
（`rg -l "xaihi-hello|plugins/hello"` 命中 5 份文件：4 份是 docs 的出处叙述，
`packages/node-sdk/tests/manifest.spec.ts` 里那几处是 `'hello'` 这个**字符串字面量**，
不是目录），所以摘掉的是我这份开发宿主里的一条死引用，不掩盖任何回归。

## 2. 新尺 `scripts/check-remotes-live.mjs`：把每条边真的取一遍

```
$ node scripts/check-remotes-live.mjs --self-check
check-remotes-live --self-check OK（12 条夹具，含"入口 404""改 rev 仍 200""穿越拿到外面那份文件""拒绝不是 handler 给的"四条必须红）
SELFCHECK_RC=0

$ node scripts/check-remotes-live.mjs --quiet
check-remotes-live: 宿主 127.0.0.1:3199 注册 27 项，判了 27 条同级 chunk，跳过 0 条（没有同级 chunk 可判）；负控每项 1 条改 rev + 2 条穿越。
  · 穿越两层的实际判决：裸 ../ → 404（空正文，拒绝在路由那一层）；编码 %2e%2e%2f → 404 not found
产物全部经真的路由取得，陈旧 rev 与两种穿越写法都被拒
LIVE_RC=0

$ node scripts/check-remotes-live.mjs --port 9      # 宿主没在跑
  × 读不到 127.0.0.1:9 的 /xaihi/manifest.json 或 /xaihi/debug.json：connect ECONNREFUSED 127.0.0.1:9
    这把尺只判跑着的宿主。先 `pnpm host`（3199，DSH_HOME 已烧进脚本）再来跑，不许拿"没跑"当绿。
NOHOST_RC=1
```

判据是五条，逐条都有理由：

1. `/xaihi/manifest.json` 的插件数 == `/xaihi/debug.json` 的注册数（现读，不数文件）。实测 27 == 27。
2. 每项的入口文件 200 且 Content-Type 是 JS。
3. 每项的**同级 chunk** 200——文件名从注册项自己那份 `frontendDir` 里 `readdirSync` 现取，
   不手抄。这条是 ADR-0001"rev 必须在路径的一段里"的那件事：query 形态下入口 200 而 chunk 永远 404。
   27 项里任何一项只给了一个 `.js`（没有同级 chunk）就记进"跳过"并打印，**不当通过**。
4. 把 rev 末位改掉必须非 200。实测 handler 回的是 `404 rev mismatch (current cae4b20249b8)`，
   带着当前 rev ⇒ "取到陈旧产物"是**可读回**的失败，不是一个空白屏。
5. 两种穿越写法都不许把 `frontendDir` 之外那份文件发出来。
   "外面那份"是 `dirname(frontendDir)/package.json`，从磁盘现读；判据是**逐字节相等**，
   不是"看起来没漏"。

**这条尺抓到的假绿是我自己的**：第一版用 `fetch`，而 `fetch` 按 WHATWG URL 规则
先把路径里的 `..` 收起来——实测 `new URL('http://…/xaihi/remotes/<slug>/<rev>/../../../package.json').pathname`
得到 `/xaihi/package.json`。也就是说那条"穿越负控"根本没到过我们那条路由，
它测的是**客户端自己**把请求吞了。改成 `node:http` 的 `request({path})`（原样上线）之后，
两层的分工才是实测的：裸 `../` 在路由之前被拒（404、空正文、不带 Content-Type），
编码 `%2e%2e%2f` 才会被 `decodeURIComponent` 打开成 `../../package.json` 而落到 `resolveServedFile`，
那一版回的是 handler 自己的 `not found`。所以尺里多了一条 `judgeHandlerRefusal`：
编码那条腿的拒绝**必须**来自 `/xaihi/remotes` handler，哪天它也变成空正文的 404，
就说明这条腿不再测解析器 ⇒ 尺要红，而不是继续算过。夹具里那条"文案漂了也要红"就是盯着这件事。

不进根 `test` 链：它判的是**跑着的宿主**，CI 里没有宿主。用法写在文件头，
和 `scripts/*-live.mjs` 那一族同一档（`bridge-live` / `ui-realm-live` 都不在 CI）。

## 3. profile 里那份产物是不是仓库里那份（比 sha，不推理）

`file:` 依赖是**拷贝**不是软链，`link:` 才是软链。profile 现在两种都有：
`{"link":23,"file":6}`（6 份里含 core 与 ui 两个非节点包）。逐字节比过入口产物：

```
same: 27        stale: 0        unreadable: 2（xaihi-core、xaihi-ui：它们不按 dist/remoteEntry.js 那个形状出）
```

⇒ 眼下没有陈旧拷贝。但这条不是免费的：以后 `pnpm --filter <包> build` 之后如果那一个是 `file:` 拷贝档，
服务的是旧字节，**判据仍然是比 sha**，不是"我构建过了"。

## 4. 与 DSH API 的关系（指到 file:line）

- `ctx.webServer.register({kind:'exact'|'prefix', path, handler})`：`/xaihi/manifest.json`、
  `/xaihi/debug.json`、`/xaihi/remotes` 三条都是它，见 `packages/core/src/index.ts:329-368`
  与 `packages/core/src/routes.ts:229-268`（`remoteHandler` 的三层拒绝：前缀、rev、`resolveServedFile`）。
- 装 bundle 走的是 DSH 自己的 `dsh plugin --profile <name> <pnpm args>`（`lib/bin.js`），
  层的顺序由 profile 的 `dsh.profile.bundles` 决定 ⇒ 第 1 节那 29 行就是它落地的形状。
- 工具注册在 SDK 里，按 `xaihi.node/v1` 的 `actions[]` **每个动作一条**：
  `packages/node-sdk/src/define-node.ts:273-283`，危险动作由同文件 `:286-296` 的
  `tools/pre-execute` 返回 `ask`。也就是说 27 个节点的 agent 面是**同一条代码**接的，
  不需要逐包补 `ctx.tools.register`（我一开始按"`plugins/*/src/index.ts` 里搜不到注册"
  就要去补工具，那是错的读法：注册在共用半边）。

## 5. 还没证的三条（写清楚，不含糊过去）

1. **非模型入口真跑一次节点动作**（ADR-0016 把这条换掉了原来的"agent 真调一次 tool"）。
   原先写成"要动使用者自己配的模型额度，我没替你花"——那是把**巧合的调用方**当成了**必需的调用方**：
   `defineNode` 注册工具时其 `execute` 走的就是面板与命令用的同一个 `invoke()`
   （`packages/node-sdk/src/define-node.ts:221`、`:273-283`），所以这件事本不需要模型、也就不需要授权。
   剩下的真活是**命令通道**：面板对未接的节点运行现在给的是可见拒绝
   （`packages/ui-host/src/client/node-mount.tsx:229`，实测注册过的 `ctx.commands` 入口只有两条）。
   模型跑过的那几次（Step 2/3 的 nonce 读数）继续算证据，只是从门槛降级成额外证。
   `xaihi_nodes` 那个列表面向工具的判据改成宿主 HTTP 面：`/xaihi/manifest.json` 的插件数 ==
   `/xaihi/debug.json` 的注册数（`check-remotes-live` 判的就是这个，现跑 rc=0）。
2. **节点界面在屏上**。判据是 `scripts/check-node-face.mjs`（在 `dist-ui/*.js` 里搜每个节点自己的中文串），
   它现在仍然红，因为 `pnpm run build:document` 仍有 6 条错、`dist-ui/` 是空的：

   ```
   $ node scripts/check-node-face.mjs
     × 文档产物不在 …/packages/ui-host/dist-ui（先 `pnpm --filter @hibernalglow/xaihi-ui-host run build:document`）⇒ "节点界面上屏"这句在没有产物的时候不成立，也不许被报成成立
   FACE_RC=1
   ```

   6 条的归属实测如下——**三条正是并发 lane 在飞的那一刀，两条等装依赖，一条和它们同一批**：
   - `RuntimeSection.tsx` ×3：`@/backend/localBackendControl`、`@/components/views/Webview2ExperimentsPanel`、
     `./NodeMemoryProtectionSettings`。这三份文件**在 HEAD 里都有**（`git cat-file -e HEAD:<路径>` 三份全 YES），
     是未提交区里把它们删掉的：`but status` 有 `D` 三条，而 `RuntimeSection.tsx` 自己在同一区里是 `M`。
     方向与 ADR-0013 一致——上游"配置住在后端 toml + HTTP/RPC"那条通路整块不接，
     `localBackendControl` 正是那一层的客户端半边。**这条归那条 lane**，我不动它正在改的文件。
     （写这一页时我先用 `git ls-files` 判过一次"从未存在过"，那是错的读法：它对已经被删出工作区的路径
     同样不打印，而 `git status`/`git ls-files` 在这里读的还可能是 GitButler 的索引。
     能证"在不在 HEAD"的是 `git cat-file -e HEAD:<路径>`，配 `but status` 的 `D` 一起看。）
   - `WorkflowEditor.tsx` ×2：`@xyflow/react` 与它的 `dist/style.css`——没装，`pnpm-lock.yaml` 在未提交区。
   - `ClassfDeletionHistoryDialog.tsx` ×1：`@xiranite/node-classf/deletion-history`。
     基线里有这份叶子（noxide `packages/nodes/classf/src/deletion-history.ts` 56 行 + 26 行测），
     它 `import { parse } from "csv-parse/browser/esm/sync"`，而 `csv-parse` 同样没装
     ⇒ 先搬叶子只会把错从 `@xiranite/...` 换成 `csv-parse/...`，所以**这一条和 `@xyflow/react` 一起等安装窗口**，
     不在这里制造一个"错换了个名字"的假进展。
3. **TUI 那条腿的可见退化**。`check-tui-face` 实测 27 个包里 0 个走共享探测（`probeTerminalRuntime`），
   判决 `works` 仍是 0——它等的也是 `@opentui/*` 装得上（`packages/cli-runtime/package.json` 在未提交区）。

## 6. 下一步（按依赖排，不按想做的排）

1. 等 `pnpm-lock.yaml` 与 5 份 `packages/*/package.json` 离开未提交区：一次 `pnpm install` 同时解开
   `@xyflow/react`（界面 2 条错）、`csv-parse`（classf 叶子 + `packages/shared/efu.ts`）、`@opentui/*`（TUI 从 0 条 `works` 起来）。
   在那之前不在 vitest / alias 表里养第二套解析规则（任务 #25 的口径）。
2. 保真尺接线（任务 #21）仍然**不**能进根 `test`：现跑 `check-verbatim` 是 rc=1，红的那一条是
   `plugins/findz/src/core.ts`——它删掉了 `import { getFindzWorkerClient } from ""` 那一行，
   而那条 lane 的 findz 有 26 份文件在未提交区（`native/findz-go/` 整个目录也是新落的）。
   尺保持红、不加白名单，等它落地后复跑再接线。
3. 使用者当场点头的那一次模型调用（第 5 节第 1 条）。

## 7 客户端半边在真宿主里的形状（同日追加，因为这条差点被我读成缺陷）

先说结论：**工作台客户端半边被宿主投递、被浏览器取回，都是实测到的**；
而"节点界面上屏"仍然不成立（第 5 节那条 503 就是它的读数）。

### 7.1 我先把一个陈旧宿主读成了"客户端 404"

在一个跑了 6 小时的宿主上，四种写法全 404：

```
/plugins/@hibernalglow/xaihi-ui/client.js     HTTP 404
/plugins/%40hibernalglow/xaihi-ui/client.js   HTTP 404
/plugins/@hibernalglow%2Fxaihi-ui/client.js   HTTP 404
/plugins/xaihi-ui/client.js                   HTTP 404
```

我差点把这写成"我们的 `dsh.client` 半边没接上"。停下来的原因是先去看生产者怎么拼 URL
（`desktop/dsh/packages/client/modules/src/index.ts:249` ⇒ `/plugins/${id}/${file}?rev=${rev}`，
`:311` 与 `:1088` 是同一形状的两个用法）——**rev 是必需的**，而那条 404 是
不带 rev 的必然结果。带 rev 的正确形状要从宿主的 boot 文档里读，而那份文档要 token
（`/` 回 `401 dsh web authentication required; reopen the URL printed by dsh web.`）。

重启我自己的开发宿主（`--profile xaihi` 那台；端口 3199 是脚本里烧好的开发宿主端口，
DSH_HOME 是 `../.scratch/dsh-xaihi-home`——日常宿主在别处，见 AGENTS.md 的隔离条）之后，
boot 文档里就有我们那一行：

```
{"id":"@hibernalglow/xaihi-ui","url":"plugins/??@hibernalglow/xaihi-ui/client.js&rev=0afdaf545d4b","rev":"…"}
```

⇒ **实测到的不对称，值得记住**：我们自己的 `/xaihi/manifest.json` 是**每次请求现读** profile 目录
（第 1、2 节：装完不重启，注册数从 7 变 27 就看见了）；
DSH 的客户端模块表是**启动时组合**的——改了客户端产物必须重启宿主才投递。
以后"我构建了但界面没变"这一类，先按这条分流。

（顺手一条并发纪律：杀进程前先看 `-ww -o command=`。我杀掉 3199 那两个之后 `pgrep` 还剩一个，
读回来是 `--profile xaihi-realm`——别的会话的宿主，没动它。）

### 7.2 投递判据：取回的字节与仓库那份是不是同一个产物

```
$ curl -o /dev/null -w "%{http_code} %{size_download} %{content_type}" \
    "http://127.0.0.1:3199/plugins/??@hibernalglow/xaihi-ui/client.js&rev=0afdaf545d4b"
200 bytes=1434493 ct=text/javascript; charset=utf-8          # 不带 cookie 也是 200 ⇒ /plugins 这条不鉴权
$ … &rev=000000000000
404 bytes=0                                                  # DSH 自己的 rev 闸门，作用在我们产物上
$ head -c 120 取回的那份
window.__ModuleLoader__.load({
	id: "@hibernalglow/xaihi-ui",
	factory: (require) => {
```

逐字节比仓库 `packages/ui-host/lib/client.js`（1,434,449 B）：**前 1,434,414 个字节完全相同**，
差的是尾部那一行 source-map 引用——宿主把我们写的相对 `//# sourceMappingURL=client.js.map`
换成 combo 形式 `??@hibernalglow/xaihi-ui/client.js.map&rev=0afdaf545d4b`（`prepareSource()`，
`index.ts:305-313`），净差 **+44 B**。
⇒ 判"投的是不是我们这份"要比**前缀相同 + 只换 map 行**，不能要求整文件 sha 相等；
这条也解释了为什么 `--frozen` 的拷贝档在第 3 节那种 sha 比对里对客户端半边不适用。

**没做成判据的一条，说明原因**：我想把 rev 从产物本身推出来，好让实机尺不需要 token。
实测 `sha256` / `sha1` / `sha512` 三种对 `lib/client.js` 的前缀都不是 `0afdaf545d4b`
（`95d65ff7…` / `a221cca7…` / `54caa62d…`），map 那份也不是 ⇒ DSH 的 rev 不是产物摘要，
不猜。所以 `check-remotes-live.mjs` 不判客户端那一行，只判我们自己那四条面。

### 7.3 两条新的实机判据（不需要 token，也不需要知道 rev）

```
$ curl -s http://127.0.0.1:3199/xaihi/ui/000000000000/index.html
503 xaihi ui bundle is not configured (config core.uiBundleDir is empty)
$ curl -s http://127.0.0.1:3199/xaihi/history.json
200 {"schema":"xaihi.ledger/1","durable":true,"reason":null,"records":[]}
```

- 文档壳那两条腿**必须**是 200 给真 HTML，或者 503 把原因写在正文里——这就是
  ADR-0011 决定 4 的"可以退化，不许静默/伪造"在实机上的读数；现在它是 503，
  和 `check-node-face` 的红是同一件事的两侧（产物没建，宿主就明说没配）。
- `/xaihi/history.json` 是运行账本那条面（计划 4.2 的 checkpoint/ledger）第一次在真宿主里被读到：
  `durable:true` 说明它真落盘而不是内存摆设，`records:[]` 说明还没有一次运行被记进去。

两条都进了尺：`node scripts/check-remotes-live.mjs` 现跑多打一行
`· 另外两条面现读：文档壳 503（判据通过） · 运行账本 200（判据通过）`，
`--self-check` 从 12 条夹具涨到 **20 条**，其中必须红的四条新增"503 不说原因"
"200 回 JSON 冒充 HTML""200 空正文""500"与"账本 durable 不是布尔""正文不是 JSON"。
