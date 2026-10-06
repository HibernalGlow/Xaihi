/**
 * 移植搬运器：把 Xiranite 的 UI 树原样搬进 packages/ui-host，并记下来源指纹。
 *
 * 为什么需要「来源指纹」这一件：设计语言最新的那批配方（swiss / lonestar 的标签与
 * 校准表）**只存在于用户的工作树里**，`git archive HEAD` 拿不到 —— 实测 HEAD 的
 * `i18n/locales/en.json` 缺 swiss/lonestar 两条 label，noxide 基线连配方都没有，
 * 于是上游自己那条「每份配方必须有中英标签」的尺（`registry.test.ts`）在混基线时必红。
 * 真源只能是「移植时点的工作树快照」，而快照要可 diff，就得留下每个文件的 sha256。
 *
 * 这个脚本是幂等的：重复跑只会按同一张表覆盖，不做任何改写（别名、格式、注释全原样）。
 *
 * 用法：node scripts/port-ui.mjs [--check]
 *   无参数 = 搬运 + 写 manifest；--check = 只比对不写，红在未同步。
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE = '/Users/glow/Base/Code/Freya/Xiranite/src'
const DEST = join(ROOT, 'packages/ui-host/src')
const MANIFEST = join(ROOT, 'docs/port/xiranite-ui.json')

/**
 * 上游 `src/` 下要搬的子树（相对 `src/`）。
 *
 * 只有**一个基线**：移植时点的 Xiranite 工作树。曾按 tag `noxide` 搬过第一轮，
 * 那批文件现在整棵被覆盖 —— 因为混基线会被上游自己的尺抓到：`registry.test.ts` 要求
 * 「每份被注册的配方在中英两份 i18n 里都有 label」，而 swiss/lonestar 的标签**只在
 * 工作树里**（noxide 没有这两份配方，HEAD 2694975 也只有 native/md3/mondrian/wuling）。
 * 换基线不是口味，是让一条真判据能红。
 *
 * `nodes/` 只点到已迁宿主半边的那四个 + `shared/`（L3）：其余 36 个节点的界面是后面的批次。
 */
const INCLUDE_DIRS = [
  // 外壳自己那三棵子树：搬运第一轮漏了，症状是 30 条 `@/` 边解析不到
  // （`@/actions/wheelPreferences` x5、`@/plugins/*` x8、`@/desktop/tray/*` x3）。
  // 判据不是"看着不像 UI"，是"消费者的 import 落不落地"。
  'actions',
  'plugins',
  'desktop',
  'components/ui',
  'components/data-table',
  'components/niko-table',
  'components/context-menu',
  'components/help',
  'components/workspace',
  'components/views',
  'components/modules',
  'nodes/shared',
  'nodes/linedup',
  'nodes/sleept',
  'nodes/dissolvef',
  'nodes/findz',
  'lib',
  'hooks',
  'store',
  'config',
  'types',
  'i18n',
  'assets',
  'styles',
  'vendor',
  // 上游 UI 半边与宿主之间的那道接缝，14 个 RPC 客户端模块 / 48 处引用。
  // 原样搬，不在搬运这一轮改写：把它换成 DSH 的形状是接线那一步的活儿（docs/service-mapping.md）。
  'backend',
]
const INCLUDE_FILES = ['App.tsx', 'components/use-theme.ts']

/** 浏览器夹具类测试要 Playwright/真 DOM 接线，这一层还没定，先不带过来。 */
const SKIP = /(\.browser\.test\.tsx?|\.e2e\.test\.tsx?|__screenshots__)/

const walk = (dir) => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const wanted = () => {
  const files = []
  for (const dir of INCLUDE_DIRS) {
    const abs = join(SOURCE, dir)
    if (!existsSync(abs)) {
      console.error(`missing upstream subtree: ${dir}`)
      process.exit(1)
    }
    for (const path of walk(abs)) {
      const rel = relative(SOURCE, path).split('/').join('/')
      if (SKIP.test(rel)) continue
      files.push(rel)
    }
  }
  for (const rel of INCLUDE_FILES) {
    if (!existsSync(join(SOURCE, rel))) {
      console.error(`missing upstream file: ${rel}`)
      process.exit(1)
    }
    files.push(rel)
  }
  return files.sort()
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const check = process.argv.includes('--check')
const files = wanted()
const recorded = {}
let copied = 0
let drifted = 0
let missing = 0

for (const rel of files) {
  const src = join(SOURCE, rel)
  const dst = join(DEST, rel)
  const digest = sha256(src)
  const inSync = existsSync(dst) && sha256(dst) === digest
  if (!check && !inSync) {
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
    copied += 1
  }
  if (check && !inSync) {
    console.error(`  × out of sync: ${rel}${existsSync(dst) ? '' : ' (not copied yet)'}`)
    drifted += 1
  }
  if (!existsSync(src)) missing += 1
  recorded[rel] = { sha256: digest, bytes: statSync(src).size, dest: relative(ROOT, dst) }
}

if (!check) {
  mkdirSync(dirname(MANIFEST), { recursive: true })
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        schemaVersion: 1,
        // 工作树快照，不是某个 commit：设计语言的最新配方还没提交，HEAD 与 noxide 都没有它。
        kind: 'xiranite-working-tree-snapshot',
        sourceRoot: SOURCE,
        capturedAt: previous?.capturedAt ?? new Date().toISOString(),
        note: 'docs/adr/0006.md 的 UI 真源；每个文件带 sha256 以便将来与上游 diff（融合不丢，见 ADR-0007）。',
        files: recorded,
      },
      null,
      2,
    ) + '\n',
  )
}

console.log(`${check ? 'check' : 'port'}: ${files.length} tracked file(s), ${copied} copied, ${drifted} out of sync, ${missing} missing`)
if (check && drifted > 0) process.exit(1)
