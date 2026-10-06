#!/usr/bin/env node
/**
 * 从 i18n JSON 里按行摘掉点名的键，并且自证"只动了这些键"。
 *
 * 为什么不用 `JSON.parse` → `JSON.stringify` 往返：这两份 locale 文件往返一次会重排 520+ 行
 * （实测），把别人正在改的区域一起卷进来。这里改成按缩进定位键所在行、整块删除，
 * 删完再解析一遍并**与删除前的解析树深比对**：差异路径集合必须恰好等于入参点名的集合，
 * 否则不落盘。落盘后仍解析失败也不落盘。
 *
 * 用法：node scripts/remove-i18n-keys.mjs <file.json> <a.b.c> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [file, ...paths] = process.argv.slice(2)
if (!file || paths.length === 0) {
  console.error('usage: remove-i18n-keys.mjs <file.json> <dot.path> [...]')
  process.exit(2)
}

const original = readFileSync(file, 'utf8')
const before = JSON.parse(original)
const lines = original.split('\n')
const targetSet = new Set(paths)

/** 给每一行标出它所属的键路径与它自己的键名。 */
function annotate(rows) {
  const stack = []
  const info = []
  rows.forEach((line, index) => {
    const trimmed = line.trim()
    const indent = (line.match(/^ */)?.[0].length ?? 0) / 2
    while (stack.length > 0 && stack.at(-1).depth >= indent && !trimmed.startsWith('"')) stack.pop()
    while (stack.length > 0 && stack.at(-1).depth >= indent) stack.pop()
    let key = null
    const m = trimmed.match(/^"((?:[^"\\]|\\.)+)"\s*:/)
    if (m) key = m[1]
    const path = key === null ? null : [...stack.map((s) => s.key), key].join('.')
    info.push({ index, indent, key, path, opens: m !== null && /[{[]\s*$/.test(trimmed) })
    if (key !== null && /[{[]\s*$/.test(trimmed)) stack.push({ key, depth: indent })
  })
  return info
}

const marks = annotate(lines)
const drop = new Set()

for (const path of targetSet) {
  const at = marks.find((m) => m.path === path)
  if (at === undefined) {
    console.log(`FAIL: ${file} 里找不到路径 ${path}`)
    process.exit(1)
  }
  if (at.opens) {
    let depth = 0
    for (let i = at.index; i < lines.length; i += 1) {
      const t = lines[i].trim()
      for (const ch of t) {
        if (ch === '{' || ch === '[') depth += 1
        else if (ch === '}' || ch === ']') depth -= 1
      }
      drop.add(i)
      if (depth <= 0) break
    }
  } else {
    drop.add(at.index)
  }
}

const kept = lines.filter((_, i) => !drop.has(i))
/** 若某个块的最后一项被删了，前一行会留下悬空逗号。 */
for (let i = 0; i < kept.length; i += 1) {
  const isCloser = /^\s*[}\]]/.test(kept[i])
  if (isCloser && i > 0 && /,$/.test(kept[i - 1].trimEnd())) {
    kept[i - 1] = kept[i - 1].trimEnd().slice(0, -1) + kept[i - 1].slice(kept[i - 1].trimEnd().length)
  }
}

const next = kept.join('\n')
let after
try {
  after = JSON.parse(next)
} catch (error) {
  console.log(`FAIL: 删除后不再是合法 JSON：${error.message}`)
  process.exit(1)
}

/** 深比对：差异路径集合必须恰好等于点名集合。 */
function* diff(a, b, prefix) {
  if (a === b) return
  if (a === undefined || b === undefined) {
    yield prefix
    return
  }
  if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    yield prefix
    return
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) yield* diff(a[key], b[key], prefix ? `${prefix}.${key}` : key)
}

const changed = [...diff(before, after, '')]
const unexpected = changed.filter((p) => !targetSet.has(p))
const notRemoved = [...targetSet].filter((p) => !changed.includes(p))

if (unexpected.length > 0 || notRemoved.length > 0) {
  console.log(`FAIL: 差异与点名集合不符（意外改动 ${unexpected.length} 条，未删成 ${notRemoved.length} 条）`)
  for (const p of unexpected.slice(0, 10)) console.log(`  意外: ${p}`)
  for (const p of notRemoved.slice(0, 10)) console.log(`  未删: ${p}`)
  process.exit(1)
}

writeFileSync(file, next)
console.log(`removed ${changed.length} keys from ${file} (其余键逐条比对未变)`)
