# 文档产物的地址：固定的是入口，不是哈希

状态：接受（2026-10-07）。

## 背景

`/xaihi/ui/<rev>/index.html` 里的 `rev` 是 `computeRev(uiBundleDir)` 的结果，而它过去
**每条请求现算一次**（`packages/core/src/registry.ts` 的 `computeRev`：对目录内
`(相对路径, 字节数, mtimeMs)` 排序取框定哈希）。现算本身是有意的——ADR-0011 记过一条装配事实：
换 `uiBundleDir` 指向的**目录**要重启宿主，而改**目录里的文件**不用，靠的就是它。

病出在"一次页面加载不是一条请求"：HTML 先按 rev A 出门，浏览器回头去要 A 的那批 chunk 时，
产物目录已经被重建到 B，于是整批 404。而 Chrome 对一个 404 的 `text/plain` 响应报的是
「Refused to apply style from '…/main.css' because its MIME type ('text/plain') …」——
症状长得像 MIME 配置坏了，其实 `.css` 在表里一直是 `text/css`（`packages/core/src/routes.ts:25`）。
实测读数：同一分钟内 `/xaihi/manifest.json` 的 `ui.rev` 从 `8d4ed81e8393` 变成 `687d583bc830`
（那侧正在重建 `dist-nodeface`），使用者手里那个哈希地址当场失效。

## 决定

1. **`rev` 继续每次请求现算，不冻在启动时。** 冻住能治这个症状，但代价是这条：
   改完产物必须重启宿主才吃得到——那是开发回路（重构建 → 刷新 → 看到新界面）本身。
   本 ADR 就是从这一条被推翻的第一版改写来的：第一版做成 `createUiRevFreezer`
   （启动时算一次 + 用入口文件 stat 判 `stale`），使用者一句「保留 HMR 能力」把它否了。
2. **固定的是入口**：`/xaihi/ui`、`/xaihi/ui/`、`/xaihi/ui/index.html` 302 到当前 rev 的文档壳，
   `?node=` 带过去（不合形状的丢掉，由目标页自己报 400），响应 `no-store`。
   人不该为了打开一次界面去清单里抄哈希。
3. **发出去过的地址不腐烂**：`uiBundleHandler` 自己记一份"这个进程发出过哪些 rev"
   （`REV_GRACE_WINDOW_MS = 10min`、`REV_GRACE_CAP = 16`）。被新构建超过之后仍然解析得出来，
   但两件事同时变：那批产物从 `immutable` 降级成 `no-store`（内容已经不是当年那一份，
   再按 immutable 发就是让浏览器永久留着混合代次），文档壳的 boot 里念一句
   `revState:"superseded"`，界面因此说得出"你看到的这批文件不是最新那一次构建"。
4. **不放宽的两条闸**：当前 `rev` 自己不合 12 位十六进制时仍是 404 并说 `current unreadable`
   （只比 `requested !== rev` 不够——两边可以相等，然后 200 一份什么都装不出来的 HTML）；
   从没发出过的 rev 一律 404，宽限不是"任意旧号都认"。
5. **不做文件快照。** 让旧 rev 真的回到旧字节，等于在 DSH 之外再起一份产物存储；
   这一刀只保证"旧地址不会整批 404"，不保证"旧地址还能重现旧内容"。

## 判据

`packages/core/tests/routes.spec.ts`（`uiBundleHandler` 那一块）：

- 裸路径三种写法逐个断 302 + `Location` + `no-store`；`?node=` 保留、越形状的丢掉。
- 先发一次 A 的 HTML（= 地址确实出门过），把当前 rev 换成 B，再要 A 的产物 ⇒ 200 且 `no-store`；
  同一时代新 rev 的产物仍 `immutable`，HTML 永远 `no-store`。
- `superseded` 只落在被超过的那一代：新 rev 的 shell 里不许出现 `revState`。
- 阳性对照两条：从没发出过的 rev 必须 404；宽限窗用注入的 clock 推到 11 分钟后必须重新变 404
  （证明这把尺看得见"窗口有界"，不是永久别名）。

读数：`pnpm --filter @hibernalglow/xaihi-core test:unit` rc=0、104 passed（这一刀 +3 条）；
`pnpm --filter @hibernalglow/xaihi-core build` rc=0，且产物 `packages/core/lib/routes.js`
里读得到 `superseded`/`revState`/`REV_GRACE_CAP` 三串（不是只编过没落进文件）。

## 后果

- 宽限窗内同一个 URL 的内容可能换代次——这是 `no-store` 存在的理由，不是漏洞。
- 换 `uiBundleDir` 指向的目录仍要重启宿主（`ADR-0011` 那条事实没动）。
- 真正的原子性（一次构建一个地址，重建期间不漂）要靠**构建侧最后落一份戳**
  （`<dir>/xaihi-rev.json`，运行期只读那一份，缺戳时回落到现算并在清单里说清）。
  那是构建配置的改动，落在搬运那刀正在重写的 `rspack.*.mjs` 上，不在这一刀里做。
