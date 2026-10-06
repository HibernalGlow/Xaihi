/**
 * 这份配置只为 `Tui.test.tsx` 存在，逐字取自上游 `78ecd201` 给 `packages/logging` 加的那份
 * （`react-reconciler@0.33.0` 的 `constants.js` 没有 `exports` 映射，Node 的 ESM 装载器不会替
 * `@opentui/react` 那个 bundled chunk 补扩展名 ⇒ 要靠 alias + `server.deps.inline` 让 vite 去解析）。
 *
 * 与上游唯一不同的一行：上游注释列的是它当时"另外三个文件不加配置也是绿的"那三份，
 * 本包那三份是 `cli.test.ts` / `core.test.ts` / `node.test.ts`（上游另有 `Tui.bun.test.tsx` 已改成 node 侧）。
 * 这一句改的是**文件清单**，不是判据；alias 与 inline 两条原样。
 */
export default {
  resolve: {
    alias: {
      "react-reconciler/constants": "react-reconciler/constants.js",
    },
  },
  test: {
    environment: "node",
    server: {
      deps: {
        inline: [/@opentui\/react/],
      },
    },
  },
}
