/**
 * 浏览器半边产物的形状判据。
 *
 * 两条都来自实测到的运行期失败，不是假想的洁癖：
 * 1. 宿主只发 `client.*.js` 且只评估 `client.js` 一个文件。rolldown 一旦分片
 *    （实测：`ExecuteButton-BKILkwLD.cjs`、`rolldown-runtime-DOREcbpJ.cjs`），入口就装不上，
 *    原文 `require("./rolldown-runtime-….cjs") missed the module table`。
 * 2. 产物里出现 Node 专用 require 时，宿主在 import 阶段就拒，原文
 *    `require("node:module") missed the module table — not a platform seed word…`。
 *    症状是页面 "web boot: 1 entry did not activate"，而 `pnpm build` 照样 rc=0 ——
 *    构建码不报，所以必须有一把尺钉在产物上。
 *
 * `--self-check` 是阳性对照：把两条违规各造一次，尺必须变红；造不出红就等于这把尺不存在。
 *
 * 已排除的两个假设（别在这里再试一遍，2026-10-06 实测）：
 * - 不是 `@module-federation/*`：递归扫 `src/` 里 `from 'node:'` 只命中测试文件，
 *   运行时源码一处都没有；MF 那条是上一轮的推断，已被下面的定位取代。
 * - 不是某个 CJS-only 依赖的 interop：给 client 加 `resolve.mainFields:
 *   ['browser','module','main']`（想把 `lucide-react` 从 `dist/cjs` 逼到 `dist/esm`）
 *   重建后同一批 Node require 照旧，产物还涨到 3.24 MB ⇒ 该改动已撤回。
 *
 * 定位办法（可复现）：在失败产物里对每条 `require("node:…")` 往前找最近的 `//#region`，
 * 命中的是 `\0rolldown/runtime.js` —— 也就是垫片由打包器自己插入。下一步要查的是
 * **它替谁插的**（哪个模块在 CJS 图里被当成外部/混合格式），而不是继续换依赖入口。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = dirname(new URL('.', import.meta.url).pathname)
const LIB = join(ROOT, 'lib')
const NODE_REQUIRE = /require\(["']node:[^"']+["']\)|require\(["'](url|fs|path|module)["']\)/
const RELATIVE_REQUIRE = /require\(["']\.\/[^"']+["']\)/

/** @returns {{ misses: string[] }} 产物形状违规。 */
export function checkBundle(libDir = LIB) {
  const misses = []
  if (!existsSync(join(libDir, 'client.js'))) return { misses: [`缺 ${libDir}/client.js（先跑 build）`] }

  const code = readFileSync(join(libDir, 'client.js'), 'utf8')
  const nodeRequires = [...new Set(code.match(new RegExp(NODE_REQUIRE, 'g')) ?? [])]
  if (nodeRequires.length > 0) misses.push(`浏览器半边含 Node 专用 require：${nodeRequires.join(', ')}`)

  const relatives = [...new Set(code.match(new RegExp(RELATIVE_REQUIRE, 'g')) ?? [])]
  if (relatives.length > 0) misses.push(`client.js 相对 require（分片没内联）：${relatives.join(', ')}`)

  const chunks = readdirSync(libDir).filter((name) => /\.cjs$/.test(name) && name !== 'client.js')
  if (chunks.length > 0) misses.push(`lib/ 里有 ${chunks.length} 个额外分片，宿主不会去取：${chunks.slice(0, 4).join(', ')}`)

  return { misses }
}

/** 阳性对照：两条违规各自要能把尺变红。 */
export function selfCheck() {
  const cases = [
    { name: 'Node 专用 require 必须被抓', code: 'let a = require("node:module"); a.createRequire', want: true },
    { name: '裸 url 也必须被抓', code: 'let b = require("url"); b', want: true },
    { name: '相对分片 require 必须被抓', code: 'require("./rolldown-runtime-abc.cjs")', want: true },
    { name: '干净产物不许误报', code: 'let r = require("react"); r && window', want: false },
  ]
  let failed = 0
  for (const item of cases) {
    const hits = new RegExp(NODE_REQUIRE.source + '|' + RELATIVE_REQUIRE.source, 'g')
    const caught = hits.test(item.code)
    const ok = caught === item.want
    if (!ok) failed += 1
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${item.name}`)
  }
  return failed
}

if (process.argv[2] === '--self-check') {
  const failed = selfCheck()
  console.log(failed === 0 ? 'check-client-bundle self-check OK' : `self-check FAIL (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

const { misses } = checkBundle()
for (const miss of misses) console.error(`  ✗ ${miss}`)
if (misses.length > 0) {
  console.error(`check-client-bundle: FAIL（${misses.length} 条）`)
  process.exit(1)
}
console.log('check-client-bundle OK：单文件、无 Node 专用 require、无相对分片')
