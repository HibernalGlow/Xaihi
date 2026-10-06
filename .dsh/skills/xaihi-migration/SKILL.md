---
name: xaihi-migration
description: Use when porting a capability from Xiranite into Xaihi: deciding whether a service may be moved at all, choosing the next node batch, reading old code, writing cross-platform node logic, or running a destructive live test. Keywords: 迁移, Xiranite, noxide, 台账, 跨平台, 真机测试, 睡眠.
---

# 从 Xiranite 迁移到 Xaihi

## 顺序不可颠倒

1. **先过服务对照表**（`docs/service-mapping.md`）。任何要搬的服务，必须先在该表落到"DSH 没有"那一列，并指出 DSH 侧最接近的东西差在哪。写不出差别 = 有 = 不搬。
2. **再搬节点。** 节点集来源是 `docs/xiranite-target-node-manifest.json` 里 `disposition = retain-rewrite` 的 28 个；`removed` / `hold-unmigrated` / `drop-to-standalone` 一律不碰。批次顺序：A `linedup` → B `sleept` → C `dissolvef` → D `findz`。
3. 已判定不搬的清单（config / workspace / fs / subprocess / jobs / schedule / spill / terminal / code-runtime / workflow / CLI-TUI / repository / 权限确认机制）不要在 Xaihi 里再出现一份。

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

## 别把文档当发布物

文档与 npm 上的 `.d.ts` 会漂：`docs/subsystems/subprocess.md` 写了 `SubprocessHandle.pid`，0.2.0-rc.2 实际发布的类型里没有；`defineDomain` 拒绝连字符域名这条约束文档里没写，是 import 时抛出来的。**判"某个 API 长什么样"以安装后的 `.d.ts` 与实机运行为准**；判"某个服务在不在"以运行时的 `ctx.get(name)` 为准（`createRequire` 从 profile 目录解析包会给出假阴性）。
