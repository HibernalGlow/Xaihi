/**
 * 工具类 CSS 的生成阶段。
 *
 * 上游那份装配里这件事是 `@tailwindcss/vite` 顺手做的；本包构建是 tsdown，没有 Vite，
 * 于是搬运来的组件全是 utility class 而**没有任何一条规则**（`lib/client.js` 里
 * `backdrop-blur` / `rounded-[4px]` 命中数为 0 就是这件事的症状）。这里显式跑一次
 * PostCSS + `@tailwindcss/postcss`，候选由 `src/styles/tailwind.css` 的 `@source` 决定。
 *
 * 为什么不走 `@tailwindcss/cli`：它带进 `@parcel/watcher`，那个包要跑安装脚本，
 * 本仓现在一个被批准的构建脚本都没有 ⇒ 为了少一条信任边界换用 PostCSS 这条腿。
 *
 * 为什么产物还要变成 TS 模块：宿主的插件文件路由是
 * `/plugins/<id>/<fileName>`，而 fileName 要过 `CLIENT_CHUNK = /^client\\.[\\w.-]+\\.js$/`
 * 并且响应体按 JS 拼接（`dsh-client-modules/lib/index.js:169,913-947`）⇒ 一个
 * `client.css` 根本发不出来。所以 CSS 走 JS 通道：`src/client/generated/client-css.ts`
 * 由 `src/client/styles.ts` 注进同一个 `<style>`。同目录下的 `client.css` 只是给人看的落盘件（不能写进 `lib/`：
 * tsdown 在它之后跑，会先把整目录清掉）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const ROOT = new URL('..', import.meta.url).pathname
const INPUT = join(ROOT, 'src', 'styles', 'tailwind.css')
const ALIASES = join(ROOT, 'src', 'styles', 'xaihi-aliases.css')
const OUTPUT_CSS = join(ROOT, 'src', 'client', 'generated', 'client.css')
const OUTPUT_MODULE = join(ROOT, 'src', 'client', 'generated', 'client-css.ts')

const compiled = await postcss([tailwindcss()]).process(readFileSync(INPUT, 'utf8'), { from: INPUT })
for (const warning of compiled.warnings()) console.warn(`  ! ${warning.toString()}`)

// 别名层必须在 @theme 之前到位：`@theme inline` 里的 `--color-background: var(--background)`
// 只是引用，真正的值来自这里。
const css = `${readFileSync(ALIASES, 'utf8').trim()}\n${compiled.css}`

mkdirSync(dirname(OUTPUT_CSS), { recursive: true })
writeFileSync(OUTPUT_CSS, css)
mkdirSync(dirname(OUTPUT_MODULE), { recursive: true })
writeFileSync(
  OUTPUT_MODULE,
  '/* 由 scripts/build-css.mjs 生成，不要手改：Tailwind 工具类 + 裸变量别名层。\n'
  + '   改样式请改 src/styles/tailwind.css 或 src/styles/xaihi-aliases.css 后重跑 build。 */\n'
  + `export const CLIENT_CSS = ${JSON.stringify(css)}\n`,
)
console.log(`build-css: ${css.length} bytes -> lib/client.css + src/client/generated/client-css.ts`)
