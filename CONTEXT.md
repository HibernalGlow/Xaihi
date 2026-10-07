# CONTEXT · Xaihi 的领域词

只收会被跨模块引用的词。每个词给出：定义、不是什么、真源在哪。

## 分发单位

- **bundle（DSH 意义）**：带 `package.json#dsh.bundle.patch` 的 npm 包；一个 patch 文件插入若干插件行。profile 只按 bundles 列表合层。不是"打包产物"，不是"压缩包"。真源：`@deepseek-ai/dsh-package-manifest` 的 `DshBundleManifest`。
- **plugin（DSH 意义）**：一个 Cordis 模块，导出 `apply(ctx, config)`，由一行 loader entry 装载。Xaihi 语境里"插件包"= 一个自包含、自带 patch 的 bundle。
- **profile**：`$DSH_HOME/profiles/<name>/`（`package.json` + `cordis.patch.yml`），一次运行形态。**不是**仓库里的文件：`xaihi.profile.yaml` 这种东西在 DSH 里不存在。
- **Xaihi 入口包 `@hibernalglow/xaihi`**：发布期"一包装齐工作台"的 bundle；本地开发阶段不装它（见 ADR-0002）。

## Xaihi 自己的单位

- **node（节点）**：一个可被工作台调用的域能力单元（动作 + 参数字段 + 危险语义 + 预览/结果视图）。契约是 `xaihi.node/v1`，词表来自 Xiranite 的 `packages/node-definitions/src/contract.ts`，**剥掉宿主执行类字段**（runtime / host_functions / executor 归 DSH）。
- **manifest（贡献清单）**：`package.json#xaihi`，schema `xaihi.manifest/1`。声明 `ui` 产物位置与 `panels` / `slotFills` / `settings` 三类贡献点。
  - **不是组件名表**：清单里的 `id` 是稳定寻址名，`remote` + `export` 只是当前实现的地址。改组件名不破坏已装节点。
- **contribution（贡献点）**：清单里的一项声明。当前只有三类，扩展位留给 commands / menus / toolbar。
- **remote**：一个由宿主装载的 UI 产物容器。名字由节点在 `manifest.ui.remote` 里声明；宿主把它解析成 `/xaihi/remotes/<slug>/<rev>/<file>`。传输方式（远程模块 / 宿主模块表）不属于契约。
- **slot fill**：往宿主声明的插槽（`xaihi.toolbar` 等）里填一个组件。声明插槽的键即"declaring is claiming"，一个键只允许一个声明者；贡献方必须 `ctx.slots.inject`。

## 工作台侧

- **workspace**：Xaihi 拥有的主视图，占用 DSH 的 `main` keyed 面板；面板 id = `xaihi`（`ctx.layout.selectPanel` 接受它）。
- **host（宿主）**：在 Xaihi 文档里指 **Xaihi ui-host**（工作台半边）；在 DSH 文档里指 DeepSeek Harness 进程。两个意思分开用，不混写。
- **theme bridge**：把 Material You 生成的 token 层交给 DSH 的 `ctx.theme.overrideTokens(source, tokens)`。**Xaihi 没有第二套主题引擎**；主题绝不进远程模块。
- **observatory**：装载器留在 `globalThis.__XAIHI__` 的事实（装载了哪些 remote、每个模块的 React 与宿主是否同一个）。没有 Probe 导出的远端记为 `unknown`，不假装通过。
- **UI Kit（上色出口）**：**作废（ADR-0006，2026-10-06）**。它是我凭空造的组件包，把"面板唯一的上色出口"定义成一个包名；真实情况是工作台与节点面板的 UI 早就以 React 实现存在于 `Xiranite`，动词是搬运。下面的"分层回落"与"状态层"两条只作为**机制**保留（回落链的形状、叠加色的做法），但它们服务的是移植过来的**设计语言**（`design-theme` 的 contract + registry + 各语言 spec/resolve），不是这个包。
- **layered fallback（分层回落）**：一处颜色写成
  `var(--xaihi-*, var(--dsw-alias-*, 兜底字面量))`。第一层是 Material You 桥叠上的值，第二层是
  DSH 主题自己的值，第三层只在两套主题都不在场时用。**第二层的名字只能实测**（这台装配的 CSSOM
  里有 107 个 `--dsw-alias-*`，照前缀规律拼出来的 `--dsw-alias-text-primary` 之类一律 `unset`）。
- **state layer（状态层）**：M3 的悬停/按下/聚焦反馈——在容器上叠一层**前景色**（`currentColor`），
  hover 8%、pressed/focus 12%，而不是改背景亮度。所以三个按钮变体不需要各写一条规则。
- **debug 端点 `/xaihi/debug.json`**：发现过程的可读回路径 —— loader 行、候选、每条定位失败原因。症状"没有节点"必须能读出原因。
- **run（运行）**：一次节点动作调用的生命周期单位。`started` / `finished` / `failed` 由 `defineNode` 自动补，节点只管 `progress` / `preview` / `result_view`（经 `call.run`）。
- **operation journal（运行账本）**：core 提供的服务 `xaihiOperations`。事件 `seq` 单调、缓冲区有界，且**截断必须可读**（`truncated` / `oldestSeq`），否则"没有历史"与"没拿到历史"分不清。
- **operation stream（事件流）**：同一份账本的两个视图——`/xaihi/operations/stream`（SSE，靠 `WebRoute.handler` 允许长挂响应）与 `/xaihi/operations.json`（快照）。DSH 的 `ctx.remote.$on` 是闭集，装不进第三方事件，所以搬运归 Xaihi、词表也归 Xaihi。
- **run ledger（运行账目）**：事件流结算后的耐久记录（`xaihi.ledger/1`），落在 DSH 的 storage domain（域名 `xaihi_runs`，域名不许带连字符）。`durable=false` 是**可读出的状态**而不是故障——没有存储缝时它退化成内存账本，原因随响应一起给。
- **feed（运行回显）**：壳状态栏里那一条最近运行。传输方式如实标出来（`data-transport="live|polling|offline"`），退到轮询就写轮询，不假装实时。
- **inhibitor（睡眠拦截）**：sleept 里"养一个活着的子进程来阻止系统休眠"这件事的统称。两平台同形：mac 是 `caffeinate`，Windows 是调 `SetThreadExecutionState` 的 PowerShell —— **状态随进程消失**，所以解除 = 杀进程，宿主退出也必须杀（`ctx.effect`）。
- **locale-proof 解析**：解析外部命令输出时只依赖 ASCII token、GUID/十六进制形状与位置，不读任何本地化标签、不假设控制台编码。判据来自真机（zh-CN Windows 的 `powercfg` 与 GBK 字节输出）。
## 配置面

真源与判据在 `docs/adr/0013-config-goes-through-dsh-settings.md`；这一节只放词。

- **settings 面**：DSH 的标准配置通路，一个名字两个半边——服务侧 `ctx.settings`（`SettingsForms`），
  客户端侧 `ctx.remote.settings`。**Xaihi 不自带配置文件**：上游那个 `xiranite.config.toml` 连同它的
  HTTP/RPC 读写面整块不接。
- **namespace（`ns`）**：一条配置的所有者，**就是 profile 里那条 entry 的 id**（`ui-xaihi`、`xaihi-findz`），
  不是我们自己起的名字。声明仍然是每个包自己的 `Config = Schema.object({…})`。
- **revision / expectedRevision**：`revision` 是该 entry 配置的单调计数，写的时候当乐观并发令牌原样送回；
  令牌过期抛 `SETTINGS_CONFLICT`（带 `expected` / `actual`）。冲突是**可读回的状态**，不是"操作失败"那种 toast。
- **脱敏读（redactSecrets）**：远程读永远脱敏，`secrets[].set` 只回答"这个槽配过没有"，值从不上线。
  因此**改密钥只能走 path op（`mutate`）**；拿那份天生不完整的文档去 `replace`，会静默删掉线上从没返回过的密钥。
- **自动生成页（`autoGenerate` / `configure({auto})`）**：没有自定义页面时 DSH 按 schema 自己生成配置页。
  要留自定义页必须说清标准面给不了什么交互，且数据源是 settings 面。

## 内核算独立进程的节点

只在节点内核**不是 JS** 时出现。判据与形状的真源是 `docs/adr/0004-non-js-core-delivery.md`。

- **core host（内核宿主）**：把原生内核包成一个独立可执行文件的入口（当前只有一个：`native/findz-go/dist/findz-host`）。命名是 `<node>-host`。**不是**"宿主进程"（那是 DSH），也**不是** DLL。
- **frame protocol（帧协议）**：与内核宿主说话的形状 —— 一行一个 JSON 信封，进 `{requestVersion,requestId,method,params}`、出一 `{ok,requestId,result|error}`。请求顺序即响应顺序，所以待决表是一条 FIFO，不需要 id 匹配表。
- **greeting（问候帧）**：内核宿主启动后写出的**第一帧**，内容就是它的自述（ABI、请求版本、能力集、支持的图像格式）。节点用它完成握手，并且**`api_info` 动作也由这一帧回答** —— 它在内核里不是一个方法。这是移植里最容易漏的一处：FFI 时代它是一个自由符号（`findz_api_info`），换成帧协议后它变成了问候。写成请求帧的症状是 `unsupported_method: api.info`。
- **platform package（平台可选依赖包）**：`@hibernalglow/xaihi-<node>-<platform>-<arch>`，装内核宿主的可执行文件。节点在**装载期**解析它，解析不到就报错，不等到第一次调用。**目前一个都还没发**。
- **调用面（invocation surface）**：一个节点动作可被谁触发的那一层。本仓有三种——面板、终端、工具执行管线；**三者都不是模型**，模型只是恰好用其中一条发起调用的第三方。判"某能力够得着吗"要问的是这三条里有没有一条到得了它，不是问模型有没有提示词。（ADR-0016）
- **命令面（command surface）**：节点给 `/` 命令与面板提供的入口，是动作清单的**一个子集**。装不下的组合（分页游标、路径前缀…）只有工具执行管线那条路能到（模型不是那条路的必要调用方）—— 说清楚边界，而不是做一个按不动的控件。
- **死讯（death reason）**：内核宿主没了时给调用方的那一句话。必须同时带退出码与内核自己打到 stderr 的诊断（`diagnose()` 写的那段）—— 只报 "stdout 关了" 等于把最坏那条路上唯一有用的信息吞掉。

## 宿主隔离

- **隔离宿主（dev host）**：一切 `dsh` 调用都必须带 `DSH_HOME=$PWD/../.scratch/dsh-xaihi-home`，
  并用 `pnpm host` / `plugin:add` / `plugin:install` / `profile:dump` 这些脚本走，不要手敲。
- **profile 不隔离会话**：DSH 的会话按 **cwd** 落在 `$DSH_HOME/sessions/<cwd-slug>/`，换 profile
  不换会话库。开发宿主与日常宿主必须换 `DSH_HOME`，否则测试对话会出现在使用者正常界面里。
- **端口**：隔离 profile 的 `cordis.patch.yml` 把 `webserver` 覆写成 `127.0.0.1:3199`；日常 web
  profile 用默认 3080。config 是整值替换，所以 `host` 与 `port` 要一起写。

## 门禁词

- **check-pins**：所有 `@deepseek-ai/dsh*` 必须精确 `0.2.0-rc.2`。原因是 npm 上若干 `dsh-client-*` 的 `latest` 标签还停在 `0.0.1-rc.1`。
- **purity**：浏览器半边不得 value-import 模块表基线之外的 harness 包（会被内联成第二份上下文）；产物里的 `require` 必须落在基线内。
- **check-panels**：**作废（ADR-0006 退回清单 #1，脚本 `scripts/check-panels.mjs` 已删）**。
  `plugins/*/frontend/Panel.tsx` 剥掉注释后不许出现 hex、`rgb()/hsl()` 颜色函数、
  `--dsw-` 引用或自建 React root，且必须从 UI Kit 取组件；样式表里每处 `var(--dsw-` 必须紧跟在
  `var(--xaihi-…, ` 之后（**逐次出现判，不按整行判**——同一行混着合法与裸引用时按行判会放过裸的）。
  尺自带 `--self-check`：三种形状（裸的要抓、带层的要放过、同行混着要抓到那一次）+ 枚举漏口
  （有 `frontend/` 却没有 `Panel.tsx` 的包要报）。
- **自包含**：装进 profile 的包不许引用 `@hibernalglow/*`（profile 解析不了仓内包，见 ADR-0002）。
- **check-brand**：代码里不许出现旧品牌的**活标识符**（包名/scope、`bin`、CSS 类名、`data-*`、
  import 说明符、落盘路径、界面与 i18n 文案）；尺是**剥掉注释之后再找**，所以 prose 与注释里的
  `Xiranite` 是"这条从哪搬来"的出处、不算违规（ADR-0010）。`--self-check` 钉 `1/0/1` 三种形状
  （import 要抓到、注释里的出处要放过、字符串常量要抓到）。**这条此刻故意不接 CI**：数字是活的
  （几分钟内 134 → 504 → 757，增量全是别人在飞的搬运产物），接上去只会把红线画在别人正在写的文件上；
  接线时机 = 最后一条 A 类命中被改掉的那个提交。
- **阳性对照**：每条尺都必须有一个"关掉防御就变红"的用例，否则该判据视为不存在。
