/**
 * 浏览器半边的依赖纪律闸门。
 *
 * 两条各挡一种真事故：
 * 1. 源码里 value-import harness 包 —— tsdown 会把它内联，产出第二份 slots/第二份
 *    React 上下文，症状是跨边界 hooks 随机崩，而原因离症状很远。只允许 `import type`
 *    （类型擦除后不产生模块请求）。
 * 2. 产物里 require 了浏览器模块表基线之外的 specifier —— 装载时才会变成
 *    "找不到模块"，除非它被 `dsh.client.external` 显式声明。
 *
 * 两条尺都配了阳性对照夹具：把闸门去掉时它们必须变红，否则这条判据是假的。
 *
 * @module xaihi-ui/tests/purity
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** DSH 0.2.0 浏览器模块表的基线 externals（shell seed 真带的那些）。 */
const BASELINE_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const HARNESS = /@deepseek-ai\//

/**
 * 找出 value-import（或 require）"浏览器模块表基线之外"的 harness 包。
 * 基线内的（react、cordis、slots、store、primitives、dockkit）可以照常 import：
 * 模块表会回答它们，产物里留下的是 require 而不是第二份代码。真正的危险是基线之外
 * 的那些（layout / theme / renderer / locale）——它们会被内联成第二份上下文。
 */
function findHarnessValueImports(source: string): string[] {
  const offenders: string[] = []
  for (const [index, line] of source.split('\n').entries()) {
    const trimmed = line.trim()
    if (!HARNESS.test(trimmed)) continue
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    if (/^import\s+type\s/.test(trimmed)) continue
    if (/^export\s+type\s/.test(trimmed)) continue
    if (/^\s*(?:interface|declare)/.test(trimmed)) continue
    const specifier = /from\s+'([^']+)'/.exec(trimmed)?.[1] ?? /require\(\s*['"]([^'"]+)['"]/.exec(trimmed)?.[1]
    if (specifier === undefined) continue
    if (!specifier.startsWith('@deepseek-ai/')) continue
    if (BASELINE_EXTERNALS.includes(specifier)) continue
    offenders.push(`line ${index + 1}: ${trimmed}`)
  }
  return offenders
}

/** 找出产物里对模块表的请求。 */
function findModuleRequests(bundle: string): string[] {
  return [...bundle.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] as string)
}

const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url))
const sourceFiles = (): string[] => readdirSync(clientDir, { recursive: true })
  .map((name) => String(name))
  .filter((name) => /\.(ts|tsx)$/.test(name) && !name.includes('node_modules'))
  .map((name) => `${clientDir}${name}`)

describe('浏览器半边依赖纪律', () => {
  it('src/client 下没有 value-import harness 包', () => {
    const offenders = sourceFiles().flatMap((path) => {
      const hits = findHarnessValueImports(readFileSync(path, 'utf8'))
      return hits.map((hit) => `${path.replace(clientDir, '')} ${hit}`)
    })
    expect(offenders).toEqual([])
  })

  it('阳性对照：value-import harness 包会被抓到', () => {
    const sample = readFileSync(fileURLToPath(new URL('./fixtures/bad-value-import.sample.ts.txt', import.meta.url)), 'utf8')
    expect(findHarnessValueImports(sample)).toHaveLength(1)
  })

  it('阳性对照：纯 type-import 与 declare module 不会被误抓', () => {
    const clean = readFileSync(fileURLToPath(new URL('../src/client/index.ts', import.meta.url)), 'utf8')
    expect(findHarnessValueImports(clean)).toEqual([])
  })

  it('产物只请求基线 externals（跑 pnpm build 之后生效）', () => {
    const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
    if (!existsSync(bundlePath)) throw new Error('lib/client.js 不存在：先跑 pnpm -r run build，再跑测试')
    const requests = findModuleRequests(readFileSync(bundlePath, 'utf8'))
    const offenders = requests.filter((specifier) => !BASELINE_EXTERNALS.includes(specifier))
    expect(offenders).toEqual([])
  })

  it('阳性对照：基线之外的请求会被抓到', () => {
    const sample = readFileSync(fileURLToPath(new URL('./fixtures/bad-client.sample.js.txt', import.meta.url)), 'utf8')
    const requests = findModuleRequests(sample)
    expect(requests.filter((specifier) => !BASELINE_EXTERNALS.includes(specifier))).toEqual([
      '@deepseek-ai/dsh-client-ui-layout',
    ])
  })
})
