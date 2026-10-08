# findz-go · 索引内核（从 Xiranite 基线逐字移植）

这份 Go 内核是从 Xiranite 基线 tag **`noxide`**（提交 `ccf465fe`）的
`native/findz-go/` 原样搬来的。它是批次 D `findz` 的**非 JS 内核**，
交付形状由 `docs/adr/0004-non-js-core-delivery.md` 决定：**进程外子进程，不走 FFI**。

## 移植差异（全部，可 diff 核对）

| 文件 | 改了什么 | 为什么 |
|---|---|---|
| 12 个内核文件 + 4 个 `*_test.go` | **零改动** | 逐字移植。`diff -q` 逐文件为空 |
| `ffi.go` | 第 1 行加 `//go:build cshared`；`var sharedFindzService = …` 挪走 | 同一份源码要出两种形态：上游的 `-buildmode=c-shared` DLL（`cshared`）与本仓库的独立可执行文件（`!cshared`）。两个 `func main()` 不能同包共存，所以按标签分家；单例挪到不带标签的 `singleton.go`，两种形态共用同一个服务实例声明 |
| `singleton.go` | **新文件**，内容是一行基线原文 | 见上 |
| `host.go` | **新文件**，`//go:build !cshared` | ADR-0004 决定 2 的薄进程边界 |
| `go.mod` | module 路径 `…/xiranite/…` → `…/xaihi/…` | 交付归属。单包无内部 import，改路径不动任何逻辑 |
| `go.sum` | **零改动** | 依赖集与基线完全一致 |
| `probe/` | **新目录** | 实机探针与基准，让本文档的证据可复跑 |

`ffi.go` 的四处导出符号（`findz_abi_version` / `findz_api_info` / `findz_call` / `findz_free`）
在 `cshared` 形态下与基线一致（生成的 `.h` 里逐条可核对），所以**上游的 Bun FFI 客户端
仍能原样加载我们自己构建的 DLL**——用来做交叉核对。

## 两种构建形态

```bash
# 1) 独立可执行文件（Xaihi 交付形态）
CGO_ENABLED=1 go build -o dist/findz-host .

# 2) 上游形态：Windows 的 c-shared DLL（交叉核对 / 兼容上游客户端用）
CGO_ENABLED=1 go build -tags cshared -buildmode=c-shared -o dist/findz.dll .
```

两个平台都要 Go：macOS 用本机 `go1.27.1 darwin/arm64`，Windows 用
`ssh 30902@100.122.176.25`（PTEROSAUR）上的 `go1.26.5 windows/amd64`。
本机 `mattn/go-sqlite3` 需要 CGO 与 C 编译器（`clang` 已有）。

## 帧协议（`host.go`）

一行一进一出，词表就是内核自己的 `requestEnvelope` / `responseEnvelope`，不新增第三套：

```
← {"ok":true,"result":{"abiVersion":1,"coreVersion":"0.1.0","requestVersions":[1],"capabilities":[…15 项…],"supportedFormats":[…]}}
→ {"requestVersion":1,"requestId":"…","method":"library.open","params":{"root":"…","databasePath":"…"}}
← {"ok":true,"requestId":"…","result":{"libraryId":"…","archiveCount":0,…}}
```

- 第一行是 `findz_api_info` 语义的握手（同一个 `currentAPIInfo()`，同一个 `success()`）。
- 之后每行一个请求；失败是 `{"ok":false,"error":{"code","message","retryable"}}`，**不是**退出码。
- 变异方法（`library.open` / `scan.*` / `watcher.*` / `analysis.start` / `task.{pause,resume,cancel}`）
  必须带 `requestId`，内核按 id 做幂等回执——所以**同一个 id 只该用一次**。
- stdout 只承载帧：内核里没有任何一处写 stdout 或打日志，`host.go` 把诊断写 stderr。

### `databasePath` 必须显式给

内核在不给 `databasePath` 时会自己造一个：`$LOCALAPPDATA/Xiranite/findz/indexes/<id>.sqlite`
（非 Windows 退到 `os.UserCacheDir()`）。Xaihi 侧**必须显式传**，理由与
`docs/adr/0003-migrated-node-file-state.md` 里 `historyPath` 的那条相同：
索引库是使用者的数据，不让内核把它写进一个以别的产品命名的目录。

## 证据

```bash
CGO_ENABLED=1 go test -count=1 ./...                       # 上游自带的 30 组测试（保真门禁）
python3 probe/probe-host.py dist/findz-host /tmp/findz-probe    # 17 项判据
python3 probe/probe-bench.py dist/findz-host /tmp/findz-bench   # ADR-0004 后果第 2 条
```

实测（macOS arm64，2026-10-06）：上游测试全绿；`hostSpawnToGreetingMs` 36.8、
`libraryOpenMs` 11.3、24 档 / 768 成员（96 MiB）`scanColdMs` 20.9、
`scanWarmUnchangedMs` 6.7、单次查询往返中位数 1.28、768 个成员的头解析 76.6 且零失败。
