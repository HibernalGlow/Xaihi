# Vendored 技能与出处

两份技能是从 DeepSeek Harness 仓库原文复制来的，未作改写：

- 来源仓库：`deepseek-harness`（本机只读副本 `Xiranite/ref/deepseek-harness`）
- upstream commit：`47f943859bef60e4160492346772ded9b24f765a`
- 许可证：MIT, Copyright (c) 2026 DeepSeek（见该仓 `LICENSE`）
- vendor 日期：2026-10-06
- 复制内容：`.dsh/skills/dsh-prose-standard/`（含 `agents/openai.yaml`、`references/examples.md`）、
  `.dsh/skills/dsh-doc-standards/SKILL.md`

## 在本仓里不适用 / 链接指向仓外

原文里的相对路径指向上游仓库，本仓没有对应文件。读到这些链接时按"上游约定"理解，不要去找文件：

| 出处 | 指向 | 本仓情况 |
|---|---|---|
| `dsh-prose-standard/SKILL.md:26,66`、`dsh-doc-standards/SKILL.md:8,12` | `../../../docs/AGENTS.md` | 不存在。本仓的文档约定写在 `CONTEXT.md`（术语）与 `docs/stages/*`（阶段交付四段式） |
| `dsh-prose-standard/SKILL.md:53` | `../../../docs/cookbook/adding-a-package.md` | 不存在。本仓包结构约定见 `docs/adr/0002-self-contained-plugin-packages.md` |
| `dsh-doc-standards/SKILL.md:13,15` | `.agents/notes/README.md`、`docs/i18n/README.md`、根 `AGENTS.md` | 不存在。取舍记录写在 `docs/adr/`，中英 README 惯例见根 `README.md` |
| 两处 frontmatter 的 "in the deepseek-harness repo" | 上游仓库 | 本仓是 Xaihi，判定标准一致照用 |

要改这两份技能时的规矩：**先改上游再同步**，本仓不单边改写 vendored 文本；本仓自己的约定写进
`xaihi-*` 那四份技能里。
