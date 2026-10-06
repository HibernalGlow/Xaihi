# 技能层（`.dsh/skills/`）

给**开发 Agent** 看的，不是运行时插件。放这里的原因写在 DSH 的 `docs/subsystems/skills.md`：
本地 provider 按 rank 扫 `<projectRoot>/.dsh/skills`（100）再到 `.agents/skills`（200），
`projectRoot` 是最近的 `.git` 祖先，条目形状是 `<name>/SKILL.md` 或扁平 `<name>.md`，
kebab-case，**不支持嵌套 SKILL.md**。技能当插件装是错的：它服务的是写代码的人，不是终端用户。

## 清单

自写四份（本仓约定都在这四份里）：

| 技能 | 管什么 |
|---|---|
| `xaihi-architecture` | 落点判断（DSH / core / ui-host / 节点包）、四条不可让步的原则、版本钉与发布策略、宿主隔离、阶段交付四段式 |
| `xaihi-plugin-development` | 脚手架起手式、"一个包同时是三样东西"、`defineNode` 接线与危险闸门、装载验证命令序列、装不上时先查哪三条 |
| `xaihi-node-ui` | 清单贡献点、壳自己扛异步边界、`UIModuleLoader` 可换后端、rev 进路径、浏览器半边依赖纯度、颜色只走别名、面板动宿主走命令而不自建 RPC |
| `xaihi-migration` | 先过服务对照表再搬节点、只读 `noxide` 基线、跨平台三条硬规矩、破坏性真机测试四条纪律、"别把文档当发布物" |

Vendor 两份上游（MIT，署名见 `.dsh/skills/VENDOR.md`）：`dsh-prose-standard`、`dsh-doc-standards`。
它们是**原文照抄**，要改先改上游再同步；vendored 文本里指向上游仓库的相对链接在本仓不存在，
`VENDOR.md` 逐条列了哪些行要按"上游约定"理解。

## 门禁

`scripts/check-skills.mjs`（`pnpm check:skills`，已串进 `pnpm test` 与 CI）：

- `.dsh/skills` 必须存在；下面只允许技能目录与 `VENDOR.md`。
- 目录名 kebab-case，且必须等于 frontmatter 的 `name`。
- 不许有嵌套 `SKILL.md`（DSH 扫不到，写了就是白写）。
- `description` 不能缺、不能短于 40 字符——它是模型选中这份技能的唯一线索。

判据自己也被证过：塞一个 `.dsh/skills/Bad_Name/`（name 写成 `other`、description 写 "short"）
必须红，报出三条问题；删掉后回绿。
