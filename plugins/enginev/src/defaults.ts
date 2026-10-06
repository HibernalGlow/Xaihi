// EngineV 默认值的唯一声明处：节点词表的一部分，不是界面常量。
//
// 为什么单独成模块而不是留在 `core.ts`：GUI 面（`src/nodes/enginev/`）按 ADR-0074 §5 与
// `scripts/audit-face-execution-path.ts` 的口径不得值导入节点 core，否则浏览器里就多出一个执行宿主；
// 但「默认工坊路径」「默认重命名模板」属于三面共读的定义（AGENTS.md：默认值只有一份词表），
// 也不许在面侧抄第二份。零逻辑的 defaults 出口让 GUI 读到与宿主完全相同的值，且不把任何业务实现带进面。
//
// 消费方：`core.ts` 的输入归一化（模板空值回落）、终端 `interaction.ts`/`cli.ts`（经 core 的原路径）、
// 以及 GUI 的占位符与「使用默认工坊路径」按钮。`node-definitions/enginev.json` 的
// `fields[].default` 是这份词表发布出去的投影，改这里就要同步那里。
export const DEFAULT_TEMPLATE = "[#{id}]{original_name}+{title}"
export const DEFAULT_WORKSHOP_PATH = "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960"
