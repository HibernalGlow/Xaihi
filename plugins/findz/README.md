# @hibernalglow/xaihi-findz

归档检索节点：索引 ZIP/CBZ 库、按条件查归档与成员、按需读图像头、投影矩形图。

**索引内核是进程外的 Go 可执行文件**（`native/findz-go/`）。本节点不把 native 拉进
宿主进程 —— 这是 `docs/adr/0004-non-js-core-delivery.md` 定下的形状，也是批次 D 的
前置门禁。理解这个包的关键就是那条进程边界。

## 四件事各自有出处

- `package.json#xaihi`：贡献清单（`xaihi.manifest/1`）与 `xaihi.node/v1` 定义
- `cordis.patch.yml`：自带一行（插件即 bundle）
- `src/gateway.ts`：进程边界（起 `findz-host`、握手、NDJSON 收发、死讯）
- `src/core.ts` + `src/contract.ts` + `src/watcher-service.ts`：逐字移植的动作翻译层
- `src/index.ts` + `src/command.ts`：表单值 → 内核入参、工具与 `/findz` 命令的接线
- `frontend/Panel.tsx`：面板（走 DSH 的命令通道，不自建 RPC）

## 移植差异（相对 Xiranite `noxide` 基线）

内核 `native/findz-go/` 是**逐字**搬过来的，只有下面这几处不同。差异越少，"行为没变"
越是可以被检查的，而不是被相信的：

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `go.mod` | module 路径改成本仓 | 模块身份 |
| `ffi.go` | 加 `//go:build cshared`；移走单例 | 让 `host.go` 与它二选一编译 |
| `singleton.go` | 新增（无 build tag） | 单例两种构建形态共用一份声明 |
| `host.go` | 新增（`!cshared`） | NDJSON 帧协议的可执行入口 |

`src/core.ts` / `src/worker-protocol.ts` / `src/watcher-service.ts` 同样逐字移植，
只改了 import 边界（`@xiranite/*` → 本包内的 `./contract.ts`），并删掉了那个硬绑
in-process `Worker` 的 `runFindz` 包装 —— 换成 `runFindzWithGateway(input, gateway, onEvent)`
这条注入缝。

`src/gateway.ts` 是**替代** `findz-worker.ts` + `worker-client.ts` + `findz-native` 的
那一层。它多担了一件事：`api.info` 在本层从握手帧回答。

> 基线里 `api.info` 不是内核的方法 —— `findz-worker.ts` 的 `case "api.info"` 走的是 FFI
> 的**自由符号** `findz_api_info`。换成帧协议以后，那个自由符号就是第一帧问候。所以
> 它必须由 `gateway.ts` 答；写成请求帧会得到 `unsupported_method: api.info`。

## 命令面（比动作清单窄，且是有意的）

13 个动作里，面板与 composer 能直接用 `/findz` 覆盖的是这些：

```
/findz api                                  内核自述
/findz open <libraryId> <库根目录>          库根取到行尾，带空格的路径不用加引号
/findz scan <libraryId>                     只读目录与 ZIP 中央目录
/findz query <libraryId> [文本…]            默认按大小降序
/findz members <libraryId> <archiveId> [文本…]
/findz export <libraryId> [文本…]           只回数据，不写文件
/findz treemap <libraryId> [面积指标]
/findz analyze <libraryId> [all|archives|members] [deep]
/findz close <libraryId>
/findz task|pause|resume|cancel <libraryId> <taskId>
```

**没覆盖的**：分页游标 `pageCursor` / 每页条数 `pageLimit`、路径前缀 `pathPrefix`、
矩形图的文本过滤、排序字段 `sortBy`/`sortDesc`。这些只在 agent 的工具路径上。
不摆假控件是有意的：`.dsh/skills/xaihi-node-ui/SKILL.md` 要求面板走命令入口，
而命令面装不下全部组合时，说清楚边界比做一个"看起来能翻页"的按钮强。

合法值（`areaBy` / `scopeKind`）从 `package.json#xaihi.node` 里**读**，不在
`command.ts` 里重抄；`tests/command.spec.ts` 钉住了这一点。

## 开发期怎么跑

内核要 Go 工具链：

```sh
cd native/findz-go
go build -o dist/findz-host .          # 帧协议宿主（插件用这个）
go build -buildmode=c-shared -o dist/libfindz-probe.dylib -tags cshared .   # 只用于探针
```

本仓内开发（两项配置都必须显式给，没有能猜的默认值）：

```sh
pnpm -r run build
pnpm plugin:add "file:$(pwd)"
# 然后在 $DSH_HOME/profiles/xaihi/cordis.patch.yml 里给 xaihi-findz 配：
#   indexDir:   <索引 SQLite 落在哪>
#   hostBinary: <上面 dist/findz-host 的绝对路径>
```

`hostBinary` 留空会去解析平台可选依赖包 `@hibernalglow/xaihi-findz-<platform>-<arch>`
——**那些包还没发**（ADR-0004 的"发布流程"仍未定），所以开发期必须显式指路径，
否则装载期就报 `findz: no core binary for <platform>-<arch>`。

`indexDir` 留空时 `open_library` **拒绝动手**，而不是让内核退回它自己的默认路径
（`$LOCALAPPDATA/Xiranite/findz/indexes/`）。理由与 ADR-0003 里 `historyPath` 那条相同：
索引库是使用者的数据，不写进一个以别的产品命名的目录。

## 判据

```sh
pnpm --filter @hibernalglow/xaihi-findz run test:unit
```

- `tests/gateway.spec.ts` —— 真进程 + 真管道的假宿主，钉握手与失败面（死讯带退出码与
  stderr 诊断、非 JSON 帧、不握手、结构化拒绝、requestId 序号、dispose 后不再收）。
- `tests/kernel.integration.spec.ts` —— **真 Go 内核**走本节点的 gateway + core 翻译层。
  需要 `native/findz-go/dist/findz-host`；没有就跳过并打印原因。
- `tests/core.spec.ts` / `tests/watcher-service.spec.ts` —— 从基线逐字带过来的判据。
- `tests/definition.spec.ts` / `tests/command.spec.ts` —— 定义合法性、工具参数按动作收窄、
  表单值映射、命令解析与危险闸门。

内核那一侧另有 `native/findz-go/probe/probe-host.py`（17 项）与 `probe-bench.py`。

## 实测（本机 darwin-arm64，走节点这条路）

| 量 | 值 |
| --- | --- |
| 起进程 → 读到问候 | 36.8 ms |
| 查询往返中位数 | 0.17 ms（真内核 + 本层帧收发） |
| 冷扫 24 归档 / 768 成员 / 96 MiB | 20.9 ms |
| 二次扫（未变） | 6.7 ms |
| 全量图像头分析 768 成员 | 76.6 ms，768 done / 0 failed |

## 没做

- **跨进程 watcher 语义**。ADR-0004「后果 3」的原话是"这部分尚未设计"，所以
  `watcher-service.ts` 是移植过来、有保真判据的纯逻辑，但**没有活的订阅**：
  `watcher.set_health` / `watcher.apply_changes` / `scan.reconcile` 都在帧协议上够得着，
  可是没有人驱动它们，`library.open` 之后不会自动跟踪文件变化。
- **平台可选依赖包**没有发布，装机路径只有开发期的显式 `hostBinary`。
- **面板动作只覆盖命令面**（见上）。而且面板走的是与 `sleept` 同一条被许可的缝
  （`host.runCommand('/findz …')`，不自建 RPC），所以它**继承**那个已知的 DSH 缺口 ——
  0.2.0-rc.2 里第三方插件客户端拿不到 agentId（`docs/upstream-proposals.md` 的 P1）。
  已验证的是命令**注册**（真宿主 `commands.names` 里有 `findz`）；**点击派发**没验证，
  现状是如实失败并指向 P1，不是静默不动。
- 与上游 Windows 数字的对比：本机是 macOS，没有同机对比数据。
