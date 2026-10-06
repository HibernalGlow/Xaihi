import { documentBase } from './rspack.document.mjs'

/**
 * **只用于验证 realm 管道**的那份产物：entry 不认识搬运树（`src/document/realm-entry.tsx`），
 * 所以在整棵界面树还建不出来时也能装出来，用来回答三个问题：
 * 这份文档里装进来的 React 到底是 19 的哪一份、桥能不能和外层真往返、
 * 产物没配时是不是显示退化而不是空白。
 *
 * 它**不是**上线形态的替代品：`dist-ui/main.js`（由 rspack.document.mjs 出）才是
 * 文档壳引用的那一份，这个目录不会被 core 的路由指到，除非有人显式把
 * `core.uiBundleDir` 指过来做验证 —— 那种情况下页面上会明写"界面内容待搬运"。
 */
export default {
  ...documentBase,
  entry: { main: './src/document/realm-entry.tsx' },
  output: { ...documentBase.output, path: new URL('dist-realm/', import.meta.url).pathname },
}
