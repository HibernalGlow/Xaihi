---
name: xaihi-migration
description: Use when porting a capability from Xiranite into Xaihi: deciding whether a service may be moved at all, choosing the next node batch, reading old code, writing cross-platform node logic, or running a destructive live test. Keywords: 迁移, Xiranite, noxide, 台账, 跨平台, 真机测试, 睡眠.
---

# 从 Xiranite 迁移到 Xaihi

## 顺序不可颠倒

1. **先过服务对照表**（`docs/service-mapping.md`）。任何要搬的服务，必须先在该表落到"DSH 没有"那一列，并指出 DSH 侧最接近的东西差在哪。写不出差别 = 有 = 不搬。
2. **再搬节点。** 节点集来源是**上游仓**的 `<Xiranite>/docs/xiranite-target-node-manifest.json` 里
   `disposition = retain-rewrite` 的 28 个；`removed` / `hold-unmigrated` / `drop-to-standalone` 一律不碰。
   **Xaihi 自己的 `docs/` 里没有这个文件**——按裸路径 `docs/xiranite-target-node-manifest.json` 找会空手。
   批次顺序：A `linedup` → B `sleept` → C `dissolvef` → D `findz`；**UI（含终端面）与节点分批的对应关系见
   `docs/adr/0006-ui-source-is-xiranite.md`，组件该放哪一层见 `docs/adr/0007-component-placement.md`。**
3. 已判定不搬的清单（config / workspace / fs / subprocess / jobs / schedule / spill / terminal / code-runtime / workflow / repository / 权限确认机制）不要在 Xaihi 里再出现一份。
   **`CLI-TUI` 已于 2026-10-06 移出这份名单——终端面要搬**（每节点 `cli.ts` / `Tui.tsx`，
   口径见 `docs/adr/0006-ui-source-is-xiranite.md` §「裁定：终端面（CLI / TUI）纳入搬运，与 GUI 同批」，
   排期 `docs/roadmap.md` R11）。**别把 `terminal` 和 `CLI-TUI` 当同一件事**：前者是 DSH 的终端子系统
   （PTY / 代码执行 / 编排脚本），仍不搬；后者是 Xiranite 自己的终端面（同一棵 React 树的第二个渲染器）。
   两者在旧版名单里只差一个词，最容易复犯。

## 读旧代码只读一个地方

稳定基线是 tag **`noxide`**（2026-09-13，Bun + Wails，无 crates/）。用只读 worktree 取：

```bash
git -C <Xiranite> worktree add ../.scratch/xiranite-noxide noxide
```

`master` 与 `xiranite-rust-rewrite` 是使用者优先不满意的进行中重构：**只取台账和 ADR 结论，不取实现**。UI 与参数契约的真源是 `node-definitions/*.json`（definitionVersion 1）+ `packages/node-definitions/src/contract.ts`，不是 `target-node-manifest.json`（那是裁决台账）。

## 跨平台节点的三条硬规矩

1. **夹具必须来自真机**，不能手写样例文本。macOS 用本机；Windows 用 `ssh 30902@100.122.176.77`（PTEROSAUR / Win11，只读查询）。
2. **不许按本地化标签解析外部命令输出**。`powercfg` 在 zh-CN 系统上是"当前交流电源设置索引"，英文系统是 "Current AC Power Setting Index"。只能依赖 ASCII 别名 token、GUID 形状、十六进制值与**位置**。参照 `plugins/sleept/tests/platform.spec.ts` 里"同一份内容换成英文标签也必须解析得出"那条断言。
3. **不许假设控制台编码**。同一条 `powercfg /availablesleepstates` 经 SSH 直接拿到的是 GBK 字节（那份原样留在夹具 `windows-availablesleepstates.gbk.txt` 里当反例）。

## 破坏性真机测试的四条纪律

`/sleept sleep` 这类动作，即使用户批准也要：

1. 先用**必然被拒**的输入自检管路（证明闸门真的会拦）。
2. 载荷用被测程序自己产出的那份，不要另造。
3. 尺用**不可伪造**的计数：`sysctl kern.hibernatecount`、`pmset -g log | grep -c 'Entering Sleep state'`，前后各数一次。
4. 明确交代**别碰键盘**——1 秒内的 HID 输入会把"其实没睡着"伪装成"系统拦住了"。
5. 真实睡眠需要使用者当场说"跑"；没拿到之前，只交付到"argv 正确 + 危险闸门把它变成 `ask`"，并把这条列进"未证"。

## 内核不是 JS 的节点：先读 ADR-0004，再分清三层

批次 D（`findz`）是这一类。**不要自己发明交付形状** —— 形状在
`docs/adr/0004-non-js-core-delivery.md` 里已经定了（进程外 + 一行一个 JSON 信封 +
按平台的可选依赖包），三条被否掉的方案也在同一份里。

搬这类节点时，先把自己要动的东西分成三层，**每一层的真源在哪要单独确认**：

1. **内核本体**（`native/<node>-go/`）：逐字搬，只改 module 路径与构建标签，两种构建形态
   （`cshared` 出库、`!cshared` 出宿主）同源。`diff -q` 要能复核。
2. **wrapper 层**（基线里的 Worker / FFI 客户端 / `*-native` 包）：这一层**不搬**，
   换成 `<node>/src/gateway.ts`。**这里最会漏东西**：被 wrapper 服务过的方法不在内核的
   方法表里，照抄"方法名 → 内核调用"就会得到 `unsupported_method`。
   `findz` 的实例是 `api.info` —— 它走的是 FFI 的**自由符号** `findz_api_info`，
   换成帧协议后那个符号就是**第一帧问候**，必须由 gateway 自己答。
   所以：**移植前把 wrapper 的 switch 逐条列出来，对每条问"它的真源是内核方法，还是宿主侧的符号/资产？"**
3. **翻译层**（`src/core.ts` 之类）：逐字搬，只改 import 边界；把硬绑 in-process Worker 的
   包装函数换成注入缝（`run<X>WithGateway(input, gateway, onEvent)`）。

另外两条来自批次 D 的实测：

- **枚举与终态名照契约抄，不凭印象写**。`FindzTask.status` 的终态是 `completed` /
  `completed_with_warnings`，不是 `succeeded`；按印象写的症状是"轮询一直等到超时"，
  离原因很远。判据里的终态集合直接从 `contract.ts` 的联合类型取。
- **"它崩了会不会带走宿主"才是判要不要独立进程的标准**，不是"它快不快"。
  报告耗时时也要分开报：裸协议（`probe-host.py`）与走节点这条路（集成判据）各一份，
  否则说不清本层的收发开销有没有把内核的优点吃掉。

## 别把文档当发布物

文档与 npm 上的 `.d.ts` 会漂：`docs/subsystems/subprocess.md` 写了 `SubprocessHandle.pid`，0.2.0-rc.2 实际发布的类型里没有；`defineDomain` 拒绝连字符域名这条约束文档里没写，是 import 时抛出来的。**判"某个 API 长什么样"以安装后的 `.d.ts` 与实机运行为准**；判"某个服务在不在"以运行时的 `ctx.get(name)` 为准（`createRequire` 从 profile 目录解析包会给出假阴性）。
