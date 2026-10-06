/**
 * 把分支 tip 检出到仓库外，再跑一次文档构建 —— 量"tip 上还差几条"。
 *
 * 为什么需要这一份而不是直接 `pnpm build:document`：本仓所有 lane 共用**同一个工作树**
 * （用户明确说过但不用额外 worktree），所以工作树里看到的错误集既包含 tip 的账，也包含
 * 别人**跑到一半还没提交**的现场（删除、改 import），两件事混在一个数里就没人能读。
 * 2026-10-06 实测到它的价值：`src/config/webview2.ts`（tip 上还在）import 的
 * `config/webview2-flags.json` **从来没被提交过、盘上也没有**，这条只在干净检出里出现；
 * 而工作树里因为那整个文件正被删，本地构建看不见它。
 *
 * 只读，不改任何东西：`git archive` 导出 tip 的树到仓库外的 `.scratch/xaihi-tipcheck/`，
 * `node_modules` 用**符号链接**指回真装好的依赖（不重装、不联网、不碰 lockfile），
 * 产物落在那个目录里，跑完默认删掉（`--keep` 留着看）。
 *
 * 用法：
 *   node scripts/tip-build-check.mjs [--branch <ref>] [--keep]
 *   node scripts/tip-build-check.mjs --self-check     # 阳性对照：解析与分类本身要能被判错
 *
 * @module xaihi-scripts/tip-build-check
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DEST = resolve(REPO, '../.scratch/xaihi-tipcheck')

/** rspack 会补的那些后缀（相对 specifier 要逐一试）。 */
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts']

/**
 * 从 rspack 的日志文本里取出未解析的边。
 * 只认这两类形状；`Reading from "node:*"` 那一类是 scheme 问题，不在这把尺的范围里。
 * @param log - 构建的 stdout+stderr 文本。
 * @returns 逐条边。
 */
export function parseUnresolved(log) {
  const rows = []
  for (const line of log.split('\n')) {
    const relative = /Can't resolve '([^']+)' in '([^']*)'/.exec(line)
    if (relative !== null) {
      rows.push({ specifier: relative[1], inDir: relative[2], bare: !relative[1].startsWith('.') })
      continue
    }
    const aliased = /Cannot find module '([^']+)' for matched aliased key/.exec(line)
    if (aliased !== null) {
      rows.push({ specifier: aliased[1], inDir: '', bare: !aliased[1].startsWith('.') })
    }
  }
  return rows
}

/**
 * 一条边的定性。
 * @param edge - 解析出来的一条。
 * @param existsOnDisk - 目标在盘上（真仓 / 检出树任一）是否存在。
 * @returns 四类之一，每类对应**不同的下一步**：
 * `not-ported`（`@xiranite/*` 这类由别名表解析的边 miss 掉了 ⇒ 本仓没有对应物，是搬运台账的账，
 * 不是"加个依赖"能解决的）、`dep-missing`（真·npm 裸包名没装/没声明）、
 * `never-committed`（相对路径且盘上哪都没有 ⇒ 只有干净检出才看得见的那类）、
 * `in-flight`（盘上有 ⇒ tip 与工作树不一致，多半是别人未提交的删除）。
 */
export function classify(edge, existsOnDisk) {
  if (edge.specifier.startsWith('@xiranite/')) return 'not-ported'
  if (edge.bare) return 'dep-missing'
  return existsOnDisk ? 'in-flight' : 'never-committed'
}

/** 检出树里的绝对路径 → 真仓里对应的绝对路径。 */
function backToRepo(absolute) {
  if (absolute.startsWith(DEST)) return join(REPO, absolute.slice(DEST.length).replace(/^\//, ''))
  return absolute
}

/** 相对 specifier 在盘上是否存在（两边都试：真仓与检出树）。 */
function targetExists(inDir, specifier) {
  const dir = backToRepo(inDir)
  return EXTENSIONS.some((ext) => existsSync(join(dir, specifier + ext)) || existsSync(join(DEST, specifier + ext)))
}

function extract(ref) {
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })
  execFileSync('sh', ['-c', `git -C ${REPO} archive ${ref} | tar -x -C ${DEST}`], { stdio: 'inherit' })
}

/** 把真装好的依赖软链进检出树（根 + 每个包 + 每个插件）。 */
function linkDeps() {
  let linked = 0
  const linkInto = (dir, src) => {
    const target = join(dir, 'node_modules')
    if (existsSync(target)) return
    symlinkSync(src, target, 'dir')
    linked += 1
  }
  linkInto(DEST, join(REPO, 'node_modules'))
  for (const kind of ['packages', 'plugins']) {
    const srcRoot = join(REPO, kind)
    const dstRoot = join(DEST, kind)
    if (!existsSync(srcRoot) || !existsSync(dstRoot)) continue
    for (const name of readdirSync(dstRoot)) {
      const src = join(srcRoot, name, 'node_modules')
      const dst = join(dstRoot, name)
      if (existsSync(src) && statSync(dst).isDirectory()) linkInto(dst, src)
    }
  }
  return linked
}

function runTipBuild() {
  const pkgDir = join(DEST, 'packages/ui-host')
  const bin = join(pkgDir, 'node_modules/.bin/rspack')
  if (!existsSync(bin)) {
    return { rc: 127, log: `缺 ${bin}：真树里没装 ui-host 的依赖，先跑一次 pnpm install` }
  }
  try {
    const out = execFileSync(bin, ['build', '-c', 'rspack.document.mjs'], { cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { rc: 0, log: out }
  } catch (error) {
    const e = error
    return { rc: e.status ?? 1, log: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

/** 阳性对照：解析与分类都必须能被证伪，否则这把尺恒绿。 */
export function selfCheck() {
  const failures = []
  const rel = { specifier: './x.json', inDir: '/abs/src/config', bare: false }
  if (classify(rel, false) !== 'never-committed') failures.push('盘上也没有 ⇒ 该判 never-committed')
  if (classify(rel, true) !== 'in-flight') failures.push('盘上有 ⇒ 该判 in-flight')
  if (classify({ specifier: '@x/y', inDir: '', bare: true }, false) !== 'dep-missing') failures.push('裸包名 ⇒ 该判 dep-missing')
  const log = [
    "× Module not found: Can't resolve './a.json' in '/x/y'",
    "× Cannot find module '@/backend/gone' for matched aliased key '@'",
    "× Module not found: Can't resolve '@xiranite/z' in '/x/y'",
    'unrelated line that must not match',
  ].join('\n')
  const parsed = parseUnresolved(log)
  if (parsed.length !== 3) failures.push(`解析器该抓到 3 条（实际 ${String(parsed.length)}）`)
  if (parsed.filter((edge) => edge.bare).length !== 2) failures.push('两条裸包名都要被判成 bare，否则上面那两类判据没被走到')
  return { ok: failures.length === 0, failures }
}

function main() {
  if (process.argv.includes('--self-check')) {
    const check = selfCheck()
    console.log(check.ok ? 'tip-build-check --self-check OK（解析与分类都能被证伪）' : 'tip-build-check --self-check 失败:\n  ' + check.failures.join('\n  '))
    return check.ok ? 0 : 1
  }
  const branchAt = process.argv.indexOf('--branch')
  const ref = branchAt === -1 ? 'xaihi-workspace-skeleton' : process.argv[branchAt + 1]
  const keep = process.argv.includes('--keep')

  extract(ref)
  const linked = linkDeps()
  const { rc, log } = runTipBuild()
  rmSync(DEST, { recursive: true, force: true })

  const edges = parseUnresolved(log)
  const lines = [`检出 ${ref}（依赖软链 ${String(linked)} 处）跑文档构建：rc=${String(rc)}，未解析的边 ${String(edges.length)} 条`]
  for (const edge of edges) {
    const kind = classify(edge, edge.bare ? false : targetExists(edge.inDir, edge.specifier))
    lines.push(`  ${kind.padEnd(15)} ${edge.specifier}${edge.inDir === '' ? '' : '   ← ' + backToRepo(edge.inDir).replace(REPO + '/', '')}`)
  }
  lines.push('对照：工作树里现跑 pnpm --filter @hibernalglow/xaihi-ui build:document，')
  lines.push('     两边条数之差就是别人未提交的那部分现场；in-flight 这几条不该记进 tip 的账。')
  console.log(lines.join('\n'))
  if (!keep) console.log('（检出的目录已删除；要留着看加 --keep）')
  return rc === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('tip-build-check.mjs')) {
  process.exitCode = main()
}
