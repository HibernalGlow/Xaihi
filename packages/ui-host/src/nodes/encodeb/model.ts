// GUI 面的输入文档构造（纯 TS，不依赖 React）：把「每行一条路径」的文本框投影成 `EncodebInput.paths`。
//
// 为什么必须住在面侧：ADR-0074 §5 不许 GUI 值导入节点 core，否则浏览器里就有了第二个执行宿主。
// 这里做的只是「文本 → 行数组」的展示投影，供条数徽标、按钮禁用和请求拼装使用，不含编码判定。
// 权威解析仍然只在宿主那份 core 里——`normalizeEncodebInput()` 会对收到的数组再跑一次 `parseEncodebPaths()`，
// 所以保留同样的 trim 与去首尾引号，是为了让界面报出的「N 条路径」与宿主真正处理的条数一致；
// 即便漂移，改变的也只有显示条数，不会改变宿主执行的路径集合。同写法的前例：`src/nodes/migratef/Component.tsx` 的 `splitPaths()`。
export function encodebPathsFromText(text?: string): string[] {
  if (!text) return []
  return text.split(/\r?\n/).map((line) => line.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}
