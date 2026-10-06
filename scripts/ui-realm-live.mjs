/**
 * 用**真的路由实现**把 Xaihi 文档端起来，供浏览器读回三件事。
 *
 * 为什么不是随手写个静态服务：要证的正是 `packages/core` 里那条
 * `/xaihi/ui/<rev>/…` 路由 ——文档壳的 boot 对象、rev 必须是路径的一段、
 * 陈旧 rev 要 404、产物目录没配要 503。随手写一个像的服务，证的是另一件事。
 * 这里 import 的是构建产物 `packages/core/lib/routes.js` 与 `registry.js` 本体。
 *
 * 用法：`node scripts/ui-realm-live.mjs [产物目录]`（默认 `packages/ui-host/dist-realm`）
 * 然后打开它打印的那条文档 URL。
 *
 * @module scripts/ui-realm-live
 */

import { createServer } from 'node:http'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { uiBundleHandler, UI_PATH_PREFIX } from '../packages/core/lib/routes.js'
import { computeRev } from '../packages/core/lib/registry.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = realpathSync(`${root}${process.argv[2] ?? 'packages/ui-host/dist-realm'}`)
const rev = computeRev(dir)
const source = { dir: () => dir, rev: () => rev }
const handler = uiBundleHandler(source)

const server = createServer((req, res) => {
  handler(req, res)
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}${UI_PATH_PREFIX}/${rev}/index.html`
  console.log(`产物目录 ${dir}`)
  console.log(`算出的 rev ${rev}`)
  console.log(`文档 URL ${url}`)
  console.log(`陈旧 rev 应当 404：${UI_PATH_PREFIX}/000000000000/index.html`)
})
