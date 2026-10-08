#!/usr/bin/env node
/**
 * 生成 `native/artifacts/manifest.json`：那份 21 MB / 37 MB 的预编 `.node` 之前没有账。
 * 判据（字节数、sha256、链接指向）住在 `scripts/check-native-manifest.mjs`，
 * 这里**共用它的取数函数**，不养第二套形状——两处各写一份就会漂移，
 * 症状是尺绿而货不对。
 *
 * 用法：node scripts/gen-native-manifest.mjs [--dir native/artifacts]
 * 幂等：同一份盘跑两次必须逐字节相同（`sha256sum manifest.json` 前后一致）。
 *
 * @module xaihi-scripts/gen-native-manifest
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, walkFiles } from './check-native-manifest.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : join(ROOT, 'native', 'artifacts'))

const entries = []
for (const path of walkFiles(dir)) {
  const rel = path.slice(dir.length + 1)
  if (rel === 'manifest.json') continue
  const d = describe(path)
  entries.push({ path: rel, kind: d.kind, size: d.bytes, ...(d.sha256 ? { sha256: d.sha256 } : {}), ...(d.link ? { link: d.link } : {}) })
}
entries.sort((a, b) => a.path.localeCompare(b.path))

const manifest = {
  schema: 'xaihi.native-manifest/1',
  note: '这些是**预编原生内核**（ADR-0015 决定 3 的平台包形状）。Rust 源码在 plugins/kisaki/native/{core,node}，仓根 Cargo.toml 是构建编排；重编入口 node scripts/build-kisaki-native.mjs。xaihi-kisaki.*.node 是改名兼容的符号链接，真货仍叫 xiranite-czkawka.*.node（落盘文件名改名＝数据迁移，见 ADR-0010）。',
  entries,
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`写了 ${String(entries.length)} 条 → ${join(dir, 'manifest.json')}`)
