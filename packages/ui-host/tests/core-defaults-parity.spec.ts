/**
 * 默认数字只许有一处真源。
 *
 * 界面不能 import `@hibernalglow/xaihi-core`（那包要 cordis/schemastery，进不了浏览器产物），
 * 所以 `DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS` 是本包里的一份**镜像**。
 * 镜像不可怕，静默漂移才可怕 —— 这把尺盯着 core 那一行的四个 `.default(…)`，
 * 字段名与数字逐个对上。
 *
 * 阳性对照：同一份解析器喂给它一份改过一个数字的 core 文本副本，必须报出那一条
 * （证明这把尺看得见漂移，不是只对着常量比自己也比常量）。
 *
 * @module xaihi-ui/tests/core-defaults-parity
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS } from '../src/backend/localBackendControl.ts'

/** 从 core 的源码文本里读出 memoryPolicySchema 那一段的默认值（不 import，避免拖进 cordis 依赖树）。 */
function readCoreDefaults(source: string): Record<string, number> {
  const block = /const memoryPolicySchema[\s\S]*?\n}\)/.exec(source)?.[0]
  if (block === undefined) throw new Error('core 里找不到 memoryPolicySchema 那一段（改名了？那这条尺要一起改）')
  const found: Record<string, number> = {}
  for (const match of block.matchAll(/(\w+): Schema\.number\(\)\.default\((\d+)\)/g)) {
    found[match[1] as string] = Number(match[2])
  }
  return found
}

// 不用 new URL(import.meta.url)：这条 vitest 通道里那个 URL 不是 file: scheme，会在收集阶段就抛
// "The URL must be of scheme file"（实测）。pnpm --filter 保证 cwd 是本包根。
const CORE_SOURCE = readFileSync(join(process.cwd(), '..', 'core', 'src', 'index.ts'), 'utf8')

describe('默认数字与 core 的 Config 声明不许漂', () => {
  it('四个字段名与四个默认数字逐条对上', () => {
    const coreDefaults = readCoreDefaults(CORE_SOURCE)
    expect(Object.keys(coreDefaults).sort()).toEqual(Object.keys(DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS.defaultPolicy).sort())
    for (const [key, value] of Object.entries(coreDefaults)) {
      const mirror = DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS.defaultPolicy[key as keyof typeof DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS.defaultPolicy]
      expect(mirror, `${key}：core 说 ${String(value)}，界面镜像的是 ${String(mirror)}`).toBe(value)
    }
  })

  it('阳性对照：core 改了一个数字，这把尺必须点名那一条', () => {
    const drifted = CORE_SOURCE.replace('maxRetainedEvents: Schema.number().default(1000)', 'maxRetainedEvents: Schema.number().default(4321)')
    expect(readCoreDefaults(drifted).maxRetainedEvents, '解析器没读到扰动，尺是假绿的').toBe(4321)
    expect(readCoreDefaults(drifted).maxRssGrowthMiB).toBe(8192)
  })
})
