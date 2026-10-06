# Xaihi

[English](README.md) · **简体中文**

跑在 **DeepSeek Harness**（DSH）之上的工作台扩展框架 + 领域节点生态。Xaihi 不 fork DSH，
也不自带 runtime：它加的是工作台外壳、节点契约、Material You 主题桥、M3 组件层，以及一批真的
领域节点——全部以合法的 DSH plugin-bundle 形态存在。

状态：框架、SDK、脚手架与五个节点都已落地并有门禁；还有两条端到端证明卡在**本仓之外**的条件上
（见[还没证到的部分](#还没证到的部分)）。

## 谁拥有什么

| 层 | 归属 | 提供 |
|---|---|---|
| 宿主 / runtime | **DSH** | 插件生命周期、profile 合层、web + 桌面宿主、插槽、主题引擎、审批与权限预设、subprocess、storage、commands |
| 工作台外壳 | `@hibernalglow/xaihi-ui` | `main` 面板、布局、`UIModuleLoader`、Xaihi 插槽声明、Material You 桥 |
| 宿主半边 | `@hibernalglow/xaihi-core` | 节点发现、`/xaihi/*` 路由、运行账本（journal）与耐久账目（ledger） |
| 契约 | `@hibernalglow/xaihi-sdk` | `xaihi.manifest/1`、`xaihi.node/v1`、事件词表、`defineNode` |
| 领域节点 | `plugins/*` | 一个节点一个包：宿主动作 + 自带 UI 产物 |

硬规矩：不复制 loader、不占 `root` 槽、不造第二个桌面壳/更新器/市场/agent loop；DSH 不支持某个
设计时——[提 proposal](docs/upstream-proposals.md)，而不是绕过去。

## 从哪里开始读

| 文件 | 用途 |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | 领域词表（plugin 与 node 的区别、run、ledger、命令面……） |
| [`docs/roadmap.md`](docs/roadmap.md) | 已排期 / 未定 / 明确不做 |
| [`docs/stages/`](docs/stages/) | 分阶段交付：改了什么、为什么、与 DSH API 的关系（`file:line`）、编号证据 |
| [`docs/adr/`](docs/adr/) | 架构取舍（传输层、自包含包、非 JS 内核交付、入口 bundle） |
| [`docs/service-mapping.md`](docs/service-mapping.md) | 每个 Xiranite service 对到 DSH 已有子系统——搬运前的门禁 |
| [`.dsh/skills/`](.dsh/skills/) | 在这个仓里干活的编码 Agent 会自动装载的技能 |

## 环境要求

- Node `^22.19.0 || >=24.0.0`、pnpm 12（`packageManager` 已钉）。
- 所有 `@deepseek-ai/*` 依赖精确钉 **`0.2.0-rc.2`**，作为本地 devDependency。
  **不要裸跑 `pnpm add @deepseek-ai/<x>`**：好几个 `dsh-client-*` 的 `latest` 标签还停在
  `0.0.1-rc.1`。这条由 `pnpm check:pins` 守着。

## 开发回路

```bash
pnpm install
pnpm build            # 宿主半边用 tsdown，节点 UI 产物用 rspack Module Federation
pnpm test             # pins + skills + installable 三道门禁，然后 build / typecheck / 单测
```

开发宿主**永远与日常宿主隔离**：

```bash
pnpm host             # DSH_HOME=$PWD/../.scratch/dsh-xaihi-home，profile xaihi，端口 3199
pnpm plugin:add file:$PWD/plugins/<node>     # 把节点装进那个隔离 profile
pnpm profile:dump     # --dump-config：证明 bundle 层真的按顺序合进来了
```

profile 不隔离会话（会话按 cwd 落在 `$DSH_HOME/sessions`），所以换 `DSH_HOME` 不是洁癖而是必需。

## 门禁

| 门禁 | 拒绝什么 |
|---|---|
| `check:pins` | 任何没有钉到我们验证过版本的 `@deepseek-ai/*` 依赖 |
| `check:skills` | 偏离 `.dsh/skills/<kebab-case>/SKILL.md` 布局的技能文件 |
| `check:installable` | 带 `dsh.bundle.patch` 的包却有 `workspace:*` 运行时依赖（装机时会被 pnpm 拒） |
| purity（在 `ui-host` 测试里） | 浏览器半边 value-import 模块表基线之外的 harness 包——把第二份上下文内联进产物这种事由**产物本身**判 |
| 三条 `check:*` 门禁 | 都带阳性对照（`--self-check` 或测试内的证伪用例）；**不能变红的尺视为不存在** |

## 现有节点

| 节点 | 做什么 | 宿主依赖 |
|---|---|---|
| `hello` | 管路样本：一行 loader、一个工具、一个面板 | 无 |
| `linedup` | 行去重 / 过滤（纯逻辑） | 无 |
| `sleept` | 电源状态、阻止休眠、关闭屏幕、进入屏保（macOS + Windows） | external-process |
| `dissolvef` | 单文件夹归档合并，带 checkpoint / undo 语义 | file-io、递归枚举 |
| `findz` | 归档库检索，内核是进程外的 Go 可执行文件 | 非 JS 内核经 subprocess（ADR-0004） |

## 还没证到的部分

- **一次真运行的耐久落盘。** `/xaihi/history.json` 现在读回
  `{"schema":"xaihi.ledger/1","durable":true,"records":[]}`——存储缝开得住，但一条运行都还没写进去。
  触发一次运行要么需要在隔离 home 里给模型凭据，要么需要在**可见浏览器**里真点一次；我们没有伪造
  agentId，也没有自建执行路由来凑这条证据。
- **面板按钮真的派发。** `0.2.0-rc.2` 里第三方插件客户端拿不到当前 `agentId`，而 `commands/*`
  每个方法的第一个 wire 字段就是它。所以面板如实失败，请求已提到上游
  （[P1](docs/upstream-proposals.md)）。
- **入口 bundle `@hibernalglow/xaihi`。** 它是发布期产物：`file:` 安装会被拒，因为它的
  `workspace:*` 依赖在仓外解析不了。见
  [ADR-0005](docs/adr/0005-entry-bundle-reachability.md) 与路线图 R9。

## 许可

MIT。`.dsh/skills/` 里 vendor 自上游的技能各自带署名与 upstream commit；
DeepSeek Harness 为 MIT (c) 2026 DeepSeek。
