import { expect, test } from "vitest"
import entry from "./entry"
// `?raw` 而不是 `node:fs`：浏览器里跑的是测试本体，Node API 到不了（同 `src/styles/design/lonestar-components.browser.test.tsx:9`）。
import entrySource from "./entry.ts?raw"

test("loads the Kisaki app entry in the browser bundle", () => {
  expect(entry.def).toMatchObject({ id: "kisaki", name: "Kisaki" })
  expect(entry.Component).toBeTypeOf("function")
  expect(entry.host?.capabilities).toContain("runner")
})

// 反面断言：GUI entry 一旦重新带上 `core`，说明有人又把 `@hibernalglow/xaihi-kisaki` 的执行器值导进了浏览器分块，
// 那是在面进程里放了第二份执行宿主（ADR-0074 §5）。`AppNodeEntry.core` 是可选字段且宿主从不读它，
// 所以这条红不会伤到任何真实通路，只挡住回归。
// 这条断言只管入口对象：`./use-kisaki-workbench.ts` 仍按值导入 `/core` 的 `smartSelect`，那是 workbench 切片的活，
// 不在本文件的射程内，也不得因为「chunk 里还有引擎」就把这条断言放宽。
test("ships no in-process node engine with the GUI entry", () => {
  // 用属性存在性而不是 `entry.core`：`satisfies` 保留了入口的实际形状，字段本就不该在类型里。
  expect(Object.hasOwn(entry, "core")).toBe(false)
})

// 上一条只挡「入口交出 core 对象」；这条挡更隐蔽的那类边：值导入包根 barrel。
// 30/30 节点包的 `src/index.ts` 都写着 `export * from "./core.js"`，所以 `from "@hibernalglow/xaihi-kisaki"`
// 即使只取 `def`，也会把整份 core 模块图连进这个 GUI chunk（`scripts/audit-face-execution-path.ts` 的
// `isCoreSource` 已把裸包名算作 core 边）。入口因此只准从 definition-only 子路径取 `def`。
// 这条只判 `entry.ts` 本体：`./use-kisaki-workbench.ts` 的那条 `/core` 边是它自己切片的账。
test("reaches the node definition without the package barrel or the core subpath", () => {
  // 先剥注释：注释里的散文会提到 `from "./core.js"` 这类字样，不剥就是假红。
  const stripped = entrySource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
  // 按 `from "<spec>"` / `import "<spec>"` 取说明符，不要求整条语句在同一行——行级正则看不见跨行 clause，
  // 那是 `audit-face-execution-path.ts` 记过的瞎点。
  const specifiers = [...stripped.matchAll(/(?:\bfrom\b|\bimport\b)\s*["']([^"']+)["']/g)].map((match) => match[1])
  const coreEdge = /^(\.\/core(?:\.js)?|@xiranite\/node-[a-z0-9]+\/core(?:\.js)?)$/
  const barePackage = /^@xiranite\/node-[a-z0-9]+$/

  // 正控：说明符表为空说明扫描本身瞎了，下面的空断言就成了假绿。
  expect(specifiers.length).toBeGreaterThan(0)
  expect(specifiers.filter((source) => coreEdge.test(source) || barePackage.test(source))).toEqual([])
  // 反证的另一半：`def` 必须真的来自 definition-only 子路径，而不是被换成别处的第二份定义。
  expect(specifiers).toContain("@hibernalglow/xaihi-kisaki/definition")
})
