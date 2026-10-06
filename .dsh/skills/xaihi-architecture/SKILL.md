---
name: xaihi-architecture
description: Use when deciding where a capability belongs in Xaihi (DSH host vs core vs ui-host vs node plugin), when an idea would require touching DSH, when bumping @deepseek-ai/* versions, or when a stage deliverable needs writing up. Keywords: 边界, fork, bundle, profile, 钉版, 提案, ADR, 阶段交付.
---

# Xaihi 架构边界

Xaihi 是 DSH 之上的 **Workspace Extension Framework + Domain Plugin Ecosystem**。判断任何新功能落点之前先读这一页。

## 不可让步的四条

1. **不 fork DSH，不复制 runtime。** 需要扩展时只用四条合法通道：plugin 包、bundle 行、profile 装配、adapter。写不出"DSH 的哪个公开 API 支持这件事"的落点，就是 hack。
2. **DSH 有的东西不再造第二套。** 判定方法写在 `docs/service-mapping.md`：每条"DSH 没有"必须指出 DSH 侧最接近的那件东西差在哪，写不出差别的按"有"处理。
3. **DSH 不支持就走提案，不走捷径。** 提案候选记在计划与 `docs/stages/` 里；本轮已知的三个：插件自带静态资源目录、boot 期默认选中某个 `main` 面板、槽渲染的 Suspense/lazy 支持。
4. **证据优先。** "构建绿了"不等于"跑对了代码"。每个 Step 的验收是编号证据（命令 rc + 关键输出 + 实机读回），门禁测试不许靠 skip 变绿，判据必须配阳性对照。

## 落点分工

| 层 | 包 | 拥有 |
|---|---|---|
| 宿主 | DSH | runtime、plugin lifecycle、profile、桌面/ web 宿主、slots、主题引擎、审批与权限 |
| Xaihi 宿主半边 | `@hibernalglow/xaihi-core` | 节点发现、`/xaihi/*` 路由、运行账本（journal）与耐久账目（ledger）、`xaihiOperations` 服务 |
| Xaihi 浏览器半边 | `@hibernalglow/xaihi-ui` | `main` 面板与工作壳、布局、`UIModuleLoader`、Xaihi 插槽声明、Material You 桥 |
| 契约 | `@hibernalglow/xaihi-sdk` | `xaihi.manifest/1`、`xaihi.node/v1`、事件词表、`defineNode`。只有类型、校验器与常量 |
| 组件层 | `@hibernalglow/xaihi-ui-kit` | 面板唯一的上色出口：M3 观感的 `XPanel` / `XButton` / `XField` 与 `--xaihi-*` 别名表。**插件面板不许自带颜色**（hex 或直接引用 `--dsw-*`） |
| 域节点 | `plugins/*` | 一个节点一个包：后端动作 + 自带 UI 产物 |

## 版本纪律

- 所有 `@deepseek-ai/dsh*` 精确钉 `0.2.0-rc.2`；`scripts/check-pins.mjs` 是门禁。原因：若干包的 `latest` dist-tag 停在 `0.0.1-rc.1`，**裸 `pnpm add @deepseek-ai/x` 会装错版本**。
- 例外（允许 caret）：`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`，在 check-pins 里显式登记。
- 开发期宿主一律带 `DSH_HOME=$PWD/../.scratch/dsh-xaihi-home`，走根 `package.json` 的 `host` / `plugin:add` / `plugin:install` / `profile:dump` 脚本；**新开 profile 不隔离会话**（会话按 cwd 落在 `$DSH_HOME/sessions`），端口覆写在 3199。

## 发布策略（分阶段，不提前）

现在：workspace 内部 `workspace:*`，不发公开 npm。契约冻结后：`0.1.0-alpha` + `pnpm publish --tag alpha`。稳定后：`1.0.0`。`@hibernalglow/xaihi` 是用户入口 bundle 包。

## 每个阶段的交付格式

写进 `docs/stages/step-N.md`，四段：改了什么 / 为什么这样设计 / 与 DSH API 的关系（引用到 `file:line`）/ 后续扩展方式，再加编号证据与**明确没做**。架构取舍单独进 `docs/adr/`，新术语进 `CONTEXT.md`。

还没做但已排期的、以及"等外部条件所以我不 hack"的清单在 `docs/roadmap.md`（含 `flow-plugin`
的立项边界与触发条件）。新推迟一项要同时写明**触发条件**，否则它只会躺在表里。
