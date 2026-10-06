/**
 * 搬运树的 Tailwind 候选表生成器（`scripts/build-css.mjs` 的前半段，也能单独跑）。
 *
 * 为什么要有这个文件：`src/styles/tailwind.css` 第一行是
 * `@import "tailwindcss" source(none)` ⇒ Tailwind v4 的**自动内容探测是关掉的**，
 * 类名只来自显式 `@source`。其中一条是 `@source ".tailwind-candidates.txt"`，
 * 那份快照在上游是 Vite 的 `configResolved` 钩子用 `@tailwindcss/oxide` 的 `Scanner`
 * 现扫现写的（`<Xiranite>/vite.config.ts:35-54`，搜 `tailwind-candidate-snapshot`）。
 * 本包构建是 tsdown，没有 Vite 那一钩，所以快照必须由这一步生成——
 * 否则 ADR-0007 结论 5 说的「L4 的类名根本不生成」就只能靠约定防住。
 *
 * 输出默认落在 `src/client/generated/`（gitignore 覆盖、由构建 owns），
 * **不覆写** `src/styles/.tailwind-candidates.txt`：那份是上游快照，归搬运批。
 * 要把快照提到契约路径（顺带让旧快照里那批已不存在的候选退出产物）就显式加
 * `--snapshot-out packages/ui-host/src/styles/.tailwind-candidates.txt`。
 *
 * 扫树时**排除** `src/client/generated/**`：产物自己不许当输入，
 * 否则类名会自我固化（第二圈的候选来自第一圈的 CSS），那条尺就量不到东西了。
 *
 * @module xaihi-scripts/tailwind-candidates
 */

import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(PKG, 'src')
export const DEFAULT_SNAPSHOT = path.join(SRC, 'client', 'generated', 'tailwind-candidates.txt')

/** 与上游那条钩子同形：正负 glob 都写明白，负向先排备份再排测试。 */
const SOURCES = [
  { base: SRC, pattern: '**/*.{html,ts,tsx}', negated: false },
  { base: SRC, pattern: '**/__backup__/**', negated: true },
  { base: SRC, pattern: '**/client/generated/**', negated: true },
  { base: SRC, pattern: '**/*.{test,spec}.{ts,tsx}', negated: true },
  { base: SRC, pattern: '**/tests/**', negated: true },
]

/**
 * 拿 `Scanner`。先按"已声明依赖"那条路走（`@tailwindcss/oxide` 进 devDependencies 之后），
 * 拿不到再从**已装好的** `@tailwindcss/postcss` 的 store 目录里找它自己的那份 oxide
 * （pnpm 把传递依赖放在包的真实目录旁边，软链路径下 `require.resolve` 找不到，
 * 实测必须先 `realpathSync`）。两条都不通就报话，不静默退回"什么都不生成"。
 */
export function loadOxide(pkgRoot = PKG) {
  const req = createRequire(path.join(pkgRoot, 'index.js'))
  const attempts = []
  try {
    return finalize(req.resolve('@tailwindcss/oxide'), req, 'declared')
  } catch (error) {
    attempts.push(`declared: ${error.message}`)
  }
  try {
    const host = realpathSync(req.resolve('@tailwindcss/postcss'))
    const nested = createRequire(host)
    return finalize(nested.resolve('@tailwindcss/oxide'), nested, `fallback via @tailwindcss/postcss (${host})`)
  } catch (error) {
    attempts.push(`fallback: ${error.message}`)
  }
  throw new Error(
    'tailwind-candidates: 找不到 @tailwindcss/oxide，候选表没法生成（这一步是产物类名的唯一来源）。\n'
    + `尝试记录：\n  - ${attempts.join('\n  - ')}\n`
    + '处理：把 "tailwindcss" 同档的 "@tailwindcss/oxide": "4.3.2" 加进 packages/ui-host/package.json 的 devDependencies 后重装。',
  )
}

function finalize(resolved, req, via) {
  const { Scanner } = req(resolved)
  if (typeof Scanner !== 'function') throw new Error(`@tailwindcss/oxide 在 ${resolved} 但不导出 Scanner（via ${via}）`)
  const oxideVersion = req(path.join(path.dirname(resolved), 'package.json')).version
  let tailwindVersion = 'unknown'
  try {
    tailwindVersion = req(path.join(realpathSync(req.resolve('tailwindcss')), '..', '..', 'package.json')).version
  } catch {
    try { tailwindVersion = req('tailwindcss/package.json').version } catch { /* 只报 oxide 那半边 */ }
  }
  // oxide 的原生绑定与 tailwind 的主版本必须同档，不同档的症状是"扫得出候选但 CSS 里没规则"。
  if (tailwindVersion !== 'unknown' && tailwindVersion.split('.')[0] !== oxideVersion.split('.')[0]) {
    throw new Error(`tailwind-candidates: oxide=${oxideVersion} 与 tailwindcss=${tailwindVersion} 主版本不一致`)
  }
  return { Scanner, resolvedFrom: resolved, via, oxideVersion, tailwindVersion }
}

/** 扫描并去重排序，返回候选数组（上游格式：排序、每行一个）。 */
export function collectCandidates({ sources = SOURCES } = {}) {
  const { Scanner, ...meta } = loadOxide()
  const found = [...new Scanner({ sources }).scan()]
  return { candidates: [...new Set(found)].sort(), meta: { oxide: meta.oxideVersion, tailwind: meta.tailwindVersion, via: meta.via, resolvedFrom: meta.resolvedFrom } }
}

/** 落盘；返回字节数与是否变化（内容相同就不写，避免每次 build 都把下游判脏）。 */
export function writeSnapshot(outPath, candidates) {
  const text = `${candidates.join('\n')}\n`
  let current = ''
  try { current = readFileSync(outPath, 'utf8') } catch { /* 首建 */ }
  const changed = current !== text
  if (changed) {
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, text)
  }
  return { path: outPath, candidates: candidates.length, bytes: Buffer.byteLength(text), changed }
}

/**
 * 阳性对照：三条都要成立。
 * 1. 夹具里写死的两个类名必须被扫到（证明 Scanner 真在读那棵树）。
 * 2. 空目录必须扫出 0 条（证明 `base` 路径写错时这把尺是"红"而不是"绿着什么都不生成"）。
 * 3. 搬运树里一个字面类名（不经 oxide，直接读文件文本找）必须出现在扫描结果里
 *    ——期望值来自源码文本，不是再调一次被测的扫描器。
 */
export function selfCheck() {
  const dir = path.join(os.tmpdir(), `xaihi-candidates-selfcheck-${process.pid}`)
  const results = []
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'Fixture.tsx'), 'const a = <div className="grid min-w-0" />\n')
    const hit = collectCandidates({ sources: [{ base: dir, pattern: '**/*.tsx', negated: false }] })
    results.push({ name: '夹具里的 grid / min-w-0 必须扫到', ok: hit.candidates.includes('grid') && hit.candidates.includes('min-w-0') })

    rmSync(path.join(dir, 'Fixture.tsx'))
    const empty = collectCandidates({ sources: [{ base: dir, pattern: '**/*.tsx', negated: false }] })
    results.push({ name: '空目录必须扫出 0 条（base 写错要显形）', ok: empty.candidates.length === 0 })

    // 期望值独立取得：直接读搬运源码的文本。2026-10-07 实测 `backdrop-blur-2xl`
    // 在 `MusicPlayerSurface.tsx:474`，而签进来的旧快照里没有它 ⇒ 只有真扫到这棵树才会进表。
    const sourceFile = path.join(SRC, 'components', 'modules', 'musicPlayer', 'MusicPlayerSurface.tsx')
    const wanted = 'backdrop-blur-2xl'
    const inSource = firstLiteralClass(sourceFile, wanted)
    const whole = collectCandidates()
    results.push({ name: `源码里真实出现的字面类名要进候选表（${wanted}）`, ok: inSource && whole.candidates.includes(wanted) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return results
}

/** 在某个文件的字符串字面量里找一个类名 token（独立于 oxide 的核对路径）。 */
export function firstLiteralClass(file, token) {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines.some((line) => {
    let at = line.indexOf(token)
    while (at >= 0) {
      const before = at === 0 ? '' : line[at - 1]
      const after = at + token.length >= line.length ? '' : line[at + token.length]
      if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) return true
      at = line.indexOf(token, at + 1)
    }
    return false
  })
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) {
    let failed = 0
    for (const r of selfCheck()) {
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`)
      if (!r.ok) failed++
    }
    console.log(`tailwind-candidates self-check: ${failed === 0 ? 'PASS' : `FAIL (${failed})`}`)
    process.exit(failed === 0 ? 0 : 1)
  }
  const outIndex = argv.indexOf('--snapshot-out')
  const target = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : DEFAULT_SNAPSHOT
  const { candidates, meta } = collectCandidates()
  const written = writeSnapshot(target, candidates)
  console.log(
    `tailwind-candidates: ${written.candidates} 条 / ${written.bytes} 字节 -> ${path.relative(PKG, target)} `
    + `(changed=${written.changed}, oxide=${meta.oxide}, tailwind=${meta.tailwind}, 解析方式=${meta.via})`,
  )
}
