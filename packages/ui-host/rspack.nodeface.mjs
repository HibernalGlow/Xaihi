import { documentBase } from './rspack.document.mjs'

/**
 * **只用于验证「节点界面能不能经路线 (A) 问到宿主」**的那份产物：
 * entry 是 `src/document/node-face-entry.tsx`——一个真节点组件（`linedup`）配一份桥背书的
 * 扁表面 host，画在同一份文档里。
 *
 * 它既不是上线形态（那是 `dist-ui/main.js`，由 `rspack.document.mjs` 出），也不是 realm 管道探针
 * （那是 `dist-realm/`）：这一份只回答一个问题——搬来的组件读的 `host.getData/patchData/config`
 * 扁名，能不能真的穿过 `/xaihi/host` 落到 DSH 的设置面上。
 * 用法是把 `core.uiBundleDir` 指到这个目录（换目录要重启宿主），然后用无窗口浏览器取那一格读数。
 */
export default {
  ...documentBase,
  entry: { main: './src/document/node-face-entry.tsx' },
  output: { ...documentBase.output, path: new URL('dist-nodeface/', import.meta.url).pathname },
}
