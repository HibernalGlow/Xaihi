#!/usr/bin/env node
/**
 * 尺：Elysia / Eden 不许再出现在会被安装与构建的那一侧。
 *
 * 阳性对照由 `--expect-violation` 提供：同一份判据跑在"故意留一份违规"的树上必须变红，
 * 否则这把尺看不见违规，等于不存在。
 *
 * 用法：
 *   node scripts/verify-elysia-removal.mjs [--framework elysia|eden|both] [--root <dir>] [--expect-violation]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

const framework = flag('framework', 'both')
const root = flag('root', process.cwd())
const expectViolation = args.includes('--expect-violation')
const stage = flag('stage', null)

/**
 * `--stage tsc-remainder`：类型错误里必须再也找不到 Elysia / Eden 的痕迹（含 `treaty`
 * 与随服务端一起消失的 `XiraniteApp`）。剩余的红**只允许命中逐条具名的既有项**：
 *   1. `@xiranite/*` 未解析——那条 lane 还没把依赖图换成 Xaihi 真名（`pnpm-workspace.yaml` 里被 `!` 挡着）。
 *   2. `client.ts` 里 `Omit & Pick` 的退化交叉类型——摘除前的第一次 `tsc` 运行就报过它
 *      （当时在 `src/client.ts(627,70)`），上游 `Xiranite/packages/api/src/client.ts:638` 同形。
 * 出现名单外的新错误就是回归，不许靠"反正整包是红的"混过去。
 */
if (stage === 'tsc-remainder') {
  const { spawnSync } = await import('node:child_process')
  const KNOWN_RESIDUAL = [
    /Cannot find module '@xiranite\/(shared|services|file-operations)'/,
    /error TS2345: Argument of type 'Omit<FileDeletionQuery, "cursor" \| "limit">'/,
  ]
  const tsc = join(root, 'node_modules', '.bin', 'tsc')
  const run = spawnSync(tsc, ['-p', 'packages/api/tsconfig.json', '--noEmit'], {
    cwd: root,
    encoding: 'utf8',
  })
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const lines = out.split('\n').filter((l) => l.includes('error TS'))
  const gone = lines.filter((l) => /elysia|eden|treaty|XiraniteApp/i.test(l))
  const unexpected = lines.filter((l) => !KNOWN_RESIDUAL.some((p) => p.test(l)))
  console.log(`tsc 错误行=${lines.length} 框架残留=${gone.length} 名单外=${unexpected.length}`)
  if (run.error) {
    console.log(`FAIL: tsc 没能跑起来：${run.error.message}`)
    process.exit(1)
  }
  if (gone.length > 0) {
    console.log('FAIL: 仍有框架痕迹')
    console.log(gone.slice(0, 5).map((l) => `  ${l}`).join('\n'))
    process.exit(1)
  }
  if (unexpected.length > 0) {
    console.log('FAIL: 出现名单外的新错误')
    console.log(unexpected.slice(0, 8).map((l) => `  ${l}`).join('\n'))
    process.exit(1)
  }
  console.log(`tsc remainder verified (剩余 ${lines.length} 条逐条命中既有项)`)
  process.exit(0)
}

/** 每个框架的判据：源码里的引用形状 + manifest 里的依赖字段。 */
const GAUGES = {
  elysia: {
    source: [/(?:from|require\()\s*['"]elysia['"]/],
    deps: ['elysia'],
    // 服务端专用文件：只有 Elysia app 需要它们，留着就是死代码。
    absentFiles: [
      'packages/api/src/index.ts',
      'packages/api/src/nodeApp.ts',
      'packages/api/src/nexusCaptureInbox.ts',
    ],
  },
  eden: {
    source: [/(?:from|require\()\s*['"]@elysiajs\/eden['"]/],
    deps: ['@elysiajs/eden'],
    absentFiles: [],
  },
}

const targets = framework === 'both' ? ['elysia', 'eden'] : [framework]
const SCAN_DIRS = ['packages', 'plugins']
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', '.git', 'artifacts'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(full)
    } else if (SOURCE_EXT.has(`.${entry.split('.').pop()}`) || entry === 'package.json') {
      yield full
    }
  }
}

const violations = []
for (const name of targets) {
  const gauge = GAUGES[name]
  if (!gauge) {
    console.error(`unknown --framework: ${name}`)
    process.exit(2)
  }
  for (const scan of SCAN_DIRS) {
    const base = join(root, scan)
    if (!existsSync(base)) continue
    for (const file of walk(base)) {
      const shown = relative(root, file)
      if (file.endsWith('package.json')) {
        let parsed
        try {
          parsed = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
          violations.push(`${shown}: package.json 解析失败`)
          continue
        }
        const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
        for (const field of fields) {
          for (const dep of gauge.deps) {
            if (parsed[field] && dep in parsed[field]) {
              violations.push(`${shown}: ${field} 仍声明 ${dep}@${parsed[field][dep]}`)
            }
          }
        }
        continue
      }
      const text = readFileSync(file, 'utf8')
      for (const pattern of gauge.source) {
        text.split('\n').forEach((line, i) => {
          if (pattern.test(line)) violations.push(`${shown}:${i + 1}: ${line.trim()}`)
        })
      }
    }
  }
  for (const rel of gauge.absentFiles) {
    const full = join(root, rel)
    if (existsSync(full)) violations.push(`${rel}: 服务端专用文件仍存在`)
  }
}

const marker = expectViolation ? 'positive control verified' : 'elysia-free verification passed'

if (expectViolation) {
  if (violations.length === 0) {
    console.log('CONTROL FAILED: 植入的违规没有被这把尺看见')
    process.exit(1)
  }
  console.log(`植入违规 ${violations.length} 条被捕获：`)
  console.log(violations.slice(0, 3).map((v) => `  ${v}`).join('\n'))
  console.log(marker)
  process.exit(0)
}

if (violations.length > 0) {
  console.log(`FAIL: ${violations.length} 处违规`)
  console.log(violations.slice(0, 15).map((v) => `  ${v}`).join('\n'))
  process.exit(1)
}
console.log(marker)
