#!/usr/bin/env node
/**
 * 尺：`treaty()` → `fetch()` 的改写必须与被摘除的服务端形状逐条对得上。
 *
 * 对照物不是我的记忆，而是摘除前那份快照里的 `index.ts` 路由表：
 * 每条被改写的调用都要能在原表里找到同 `(method, path)`，且解包形状一致。
 * 顺带断言这两个 factory 里再没有 `client.` 的 treaty 用法、token 头仍在。
 */
import { readFileSync, existsSync } from 'node:fs'

const SNAPSHOT = '/Users/glow/Base/Code/Freya/_scratch/xaihi-elysia-removal-2026-10-06/packages-api.snapshot'
const OLD_SERVER = `${SNAPSHOT}/src/index.ts`
const CLIENT = 'packages/api/src/client.ts'

if (!existsSync(OLD_SERVER) || !existsSync(CLIENT)) {
  console.log('FAIL: 快照服务端或现文件缺失，无法比对')
  process.exit(1)
}

const oldText = readFileSync(OLD_SERVER, 'utf8')
const clientText = readFileSync(CLIENT, 'utf8')

/** 原服务端路由表：`.get("/health", ...)` → `GET /health`。 */
const routes = new Set()
for (const m of oldText.matchAll(/\.(get|post|put|delete|patch)\("([^"]+)"/g)) {
  routes.add(`${m[1].toUpperCase()} ${m[2]}`)
}

/** 取某个 factory 的函数体（按大括号配对）。 */
function factoryBody(name) {
  const start = clientText.indexOf(`export function ${name}(`)
  if (start === -1) return null
  const brace = clientText.indexOf('{', clientText.indexOf('):', start) === -1 ? start : clientText.indexOf('):', start))
  let depth = 0
  for (let i = brace; i < clientText.length; i += 1) {
    if (clientText[i] === '{') depth += 1
    else if (clientText[i] === '}') {
      depth -= 1
      if (depth === 0) return clientText.slice(start, i + 1)
    }
  }
  return null
}

/** 从一个 factory 体里抽出它实际发出的 `(method, path)`。 */
function callsIn(body) {
  const out = []
  const re = /apiUrl\(baseUrl,\s*"([^"]+)"\)([\s\S]{0,220}?)\}/g
  for (const m of body.matchAll(re)) {
    const method = /method:\s*"([A-Z]+)"/.exec(m[2])?.[1] ?? 'GET'
    out.push(`${method} ${m[1]}`)
  }
  return out
}

const CASES = [
  ['createXiraniteSystemClient', ['GET /health']],
  ['createXiraniteWorkspaceClient', ['GET /workspace/snapshot', 'PUT /workspace/snapshot']],
]

const problems = []
for (const [name, expected] of CASES) {
  const body = factoryBody(name)
  if (body === null) {
    problems.push(`${name}: 找不到函数体`)
    continue
  }
  const emitted = callsIn(body)
  for (const want of expected) {
    if (!routes.has(want)) problems.push(`${name}: 期望的 ${want} 在原服务端路由表里不存在（比对基准不符）`)
    if (!emitted.includes(want)) problems.push(`${name}: 改写后没有发出 ${want}（实测: ${emitted.join(', ') || '无'}）`)
  }
  if (/\bclient\.[a-zA-Z]/.test(body)) problems.push(`${name}: 仍在用 treaty 形式的 client.*`)
  if (!/requestHeaders\(options\)/.test(body)) problems.push(`${name}: token 头不再经 requestHeaders 发出`)
}

// 解包形状：原服务端 `return { snapshot }` ⇒ 客户端必须读 `.snapshot`
const unwrapsSnapshot = (clientText.match(/result\.snapshot/g) ?? []).length
if (unwrapsSnapshot < 2) problems.push(`workspace snapshot 解包次数应为 2（读与写各一次），实测 ${unwrapsSnapshot}`)

if (problems.length > 0) {
  if (process.argv.includes('--expect-violation')) {
    console.log(`植入违规 ${problems.length} 条被捕获：`)
    console.log(problems.slice(0, 3).map((p) => `  ${p}`).join('\n'))
    console.log('positive control verified')
    process.exit(0)
  }
  console.log('FAIL: 改写与原形状不一致')
  console.log(problems.map((p) => `  ${p}`).join('\n'))
  process.exit(1)
}
if (process.argv.includes('--expect-violation')) {
  console.log('CONTROL FAILED: 改写前的原件没有被这把尺看见差异')
  process.exit(1)
}
console.log(`client rewrite fidelity verified (${routes.size} 条原路由可读，比对 3 条调用)`)
