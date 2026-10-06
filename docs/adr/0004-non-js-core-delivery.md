# ADR-0004 · 非 JS 内核（findz 的 Go 索引核心）怎么交付

- 状态：接受
- 日期：2026-10-06
- 相关：批次 D `findz`（`docs/xiranite-target-node-manifest.json` 里 `hostRequirements: ["no-host-free-answer","os-native","file-io"]`）、`docs/service-mapping.md`、`docs/adr/0002-self-contained-plugin-packages.md`、`docs/adr/0003-migrated-node-file-state.md`

这条 ADR 是批次 D 的**前置门禁**：先定交付形状，再动节点代码。下面每个数字都是从机器上读出来的，不是估的。

## 现状（实测）

| 事实 | 出处 |
|---|---|
| Go 内核源码在 `native/findz-go/`（`analysis.go` / `database.go` / `scanner.go` / `query.go` / `protocol.go` / `ffi.go` + `go.mod`） | 基线 worktree 目录列表 |
| 对外只有 **4 个符号**：`findz_abi_version`、`findz_api_info`、`findz_call`、`findz_free` | `native/findz-go/ffi.go:17,22,27,36` |
| 构建方式是 `go build -buildmode=c-shared -o native/artifacts/<platform>-<arch>/findz.dll .` | `packages/findz-native/scripts/build-native.ts:8,15` |
| JS 侧是 **Bun FFI** 客户端（`@xiranite/findz-native` 自述 "Typed Bun FFI client for the Findz Go index core"），跑在 Bun worker 里 | `packages/findz-native/package.json` description、`packages/nodes/findz/src/findz-worker.ts` |
| 单平台预编译产物 zip 体积 **8.6 MB**（win32-x64） | `native/prebuilt/win32-x64/findz.win32-x64.zip` |
| 本机两个工具链都在：`go1.27.1 darwin/arm64`（这台 Mac）、`go1.26.5 windows/amd64`（SSH 到 PTEROSAUR） | `go version` 实跑 |
| DSH 里 FFI 有先例：`koffi@3.1.1` 被 `dsh-host-directory-picker-native` 与 `libreoffice-kit` 依赖，且在 profile 的 `allowBuilds` 名单里 | profile `node_modules/@deepseek-ai/*/package.json`、`pnpm-workspace.yaml` |
| `ctx.subprocess` 的 `resolveExecutable` **明确支持绝对可执行路径**（bare name 走 scrubbed PATH，绝对路径做校验） | `docs/subsystems/subprocess.md` "Executable lookup" |

## 决定

**1. 交付形态：out-of-process 子进程，不走 FFI 内嵌。**

关键理由不是"FFI 难写"——恰恰相反，DSH 里 koffi 有先例，4 符号的窄 ABI 用 FFI 接很省事。决定性的那条是**故障半径**：

- 节点跑在 **DSH 宿主进程内**。`-buildmode=c-shared` 的 Go 库一旦 segfault / runtime panic（Go 的 panic 在 cgo 边界是**不可恢复**的），死掉的是使用者的宿主与那一整条会话。
- 上游自己也是这么判断的：它把 FFI 客户端关进 **Bun worker**（`findz-worker.ts` + `worker-client.ts`）而不是直接调，说明"要隔离"本来就是这套内核的前提；而 Node 的 `worker_threads` **给不了**这个隔离——native crash 是进程级的，不是线程级的。所以在 DSH 里换用 koffi 等于把上游特意避开的那个风险搬回主进程。
- 索引内核是**长驻 + 后台 watch** 的状态持有者，进程边界顺便给了它干净的启动与终止时机，而 `ctx.subprocess` 的 `terminate()` 是树级的（`subprocess.md` SubprocessHandle 段），不会留下孤儿索引进程。

代价如实记在下面"后果"里：多一次进程启动、要序列化、要管二进制生命周期。

**2. 协议形状：沿用内核现有的 4 符号语义，把它包成一行一进一出的 JSON 帧。**
`findz_call` 本来就是"一次带 ABI 版本的调用"，`findz_api_info` / `findz_abi_version` 给了握手与版本不匹配时的可见失败——这与 Xaihi 对契约版本的一贯做法一致（不认识的版本拒绝，而不是静默降级）。Go 侧需要一个薄 `main()` 读 stdin 帧、调 `findz_call`、写 stdout 帧；这一层是新写的，内核逻辑本身仍然逐字不动。

**3. 分发：每个平台一个可选依赖包，节点包按 `<platform>-<arch>` 解析。**

```
@hibernalglow/xaihi-findz            # 节点（JS）
@hibernalglow/xaihi-findz-darwin-arm64
@hibernalglow/xaihi-findz-win32-x64
```

节点侧 `optionalDependencies` 全列，pnpm 只会装上匹配当前平台的那个（装不上的会被跳过）；二进制路径经 `createRequire(...).resolve('@hibernalglow/xaihi-findz-<plat>-<arch>/bin/findz-host')` 拿到，再交给 `ctx.subprocess`（绝对路径合法，见上表）。

选它而不是"单包塞三平台"的理由是体积是可算的：8.6 MB **每平台**，单包多平台会让每个使用者都为别人平台的二进制付 2–3 倍下载，而且**发布之后改包装形状是对已装节点的破坏性变更**（ADR-0002 的自包含约束），所以必须现在就定对。

失败面要响：当前平台没有对应包时，节点在装载期就报 `findz: no core binary for <platform>-<arch>`，而不是等第一次搜索再给出空结果。

**4. 明确不采用**

- **Extism / WASM**：等于在 DSH 之外再带一个 runtime，正面违反第一条原则；且 findz 要的是真实文件系统与 watch，WASI 路径还要额外解决宿主能力映射。
- **用 TS 重写索引内核**：`docs/findz-v2-benchmarks.md` 与 `docs/adr/0053-build-findz-as-a-go-index-core-with-a-bun-worker-boundary.md` 说明上游是**为了性能才做成 Go** 的；重写等于放弃那份已测的结论，也把"移植"变成"再造"。
- **FFI + koffi 内嵌**：见上，故障半径不可接受。若将来 DSH 提供"隔离运行 native 组件"的合法缝，这条可以重开。

## 后果

- 正面：宿主进程不会被索引内核带崩；安装体积按平台算；ABI 版本不匹配是可见失败；内核逻辑保持可对比的逐字移植（与 `dissolvef` 同一条纪律）。
- 负面 / 待还：
  1. 每个平台都要构建机 —— 本机已验证 mac 与 Windows 两边都有 Go，但**发布流水线还没定**（CI 里 `pnpm check:*` 不含 Go 构建）。
  2. 进程启动与序列化的开销没测；批次 D 的验收必须带一次真实目录的搜索耗时对比（与上游 benchmark 文档对齐口径）。
  3. watch 语义跨进程后要重新设计（订阅、失效通知、进程重启后索引怎么恢复），这部分**尚未设计**，属批次 D 的实施内容而不是本 ADR 已经解决的。
  4. `no-host-free-answer` 这条宿主需求仍然在：索引要能回答"这台机器上有什么"，所以内核必须能读真实文件系统——按 ADR-0003 的同一条理由，进程内由 Go 自己读，不经 `ctx.fs`。
