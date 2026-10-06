/**
 * encodeb 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组逐条抄自上游 `packages/nodes/encodeb/src/core.test.ts`（tag `noxide`，49 行）
 *   的四个用例，连它那份 `entries` 夹具（`root/garbled`、`root/╘.txt`）与注入的假
 *   `transcodeName`（`(name) => name.replace("garbled", "fixed")`）一起搬；
 *   `"root/fixed"`、`"root/fixed/a.txt"`、`["root/╘.txt"]` 全是上游手写的常量。
 * - 第 2、3 组钉上游 `core.test.ts` **没有**覆盖的分支。真源是上游 `core.ts` 的行号，
 *   逐条写在用例注释里：`normalizeEncodebInput`（`:64-74`）、`parseEncodebPaths`（`:76-79`）、
 *   `isSuspiciousName` 的六条或（`:85-92`）、`findSuspicious` 的到 limit 就停（`:94-103`）、
 *   `createEncodebMappings` 的 `changedOnly` 与 NUL 比较（`:105-130`）、
 *   `sortReplaceMappings`（`:132-134`）、`runEncodeb` 的三条腿与 progress 算式（`:136-176`）、
 *   `joinPath` 的分隔符判据（`:178-181`）。
 * - 第 4 组是本包兑现不了的那一格（`src/platform.ts` 的 codec 闸门）：期望值是一条
 *   **点名的拒绝**，不是"0 条映射"。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * @module xaihi-encodeb/tests/core
 */

import { describe, expect, it } from 'vitest'
import type { EncodebEntry, EncodebRuntime } from '../src/core.ts'
import {
  ENCODEB_PRESETS,
  SUSPICIOUS_CHARS,
  createEncodebMappings,
  defaultTranscodeName,
  findSuspicious,
  isSuspiciousName,
  normalizeEncodebInput,
  parseEncodebPaths,
  runEncodeb,
  sortReplaceMappings,
} from '../src/core.ts'
import { CODEC_UNAVAILABLE, isCodecFree, nodeTranscodeName } from '../src/platform.ts'

/** 上游 `core.test.ts:5-9` 那份夹具，逐字。 */
const entries: EncodebEntry[] = [
  { path: 'root/garbled', name: 'garbled', type: 'dir', rootPath: 'root', relativeParts: ['garbled'], depth: 1, separator: '/' },
  { path: 'root/garbled/a.txt', name: 'a.txt', type: 'file', rootPath: 'root', relativeParts: ['garbled', 'a.txt'], depth: 2, separator: '/' },
  { path: 'root/╘.txt', name: '╘.txt', type: 'file', rootPath: 'root', relativeParts: ['╘.txt'], depth: 1, separator: '/' },
]

describe('encodeb core（上游 core.test.ts 逐条搬来）', () => {
  // 上游 `core.test.ts:12-20`。
  it('detects suspicious names', () => {
    expect(isSuspiciousName('╘.txt')).toBe(true)
    expect(isSuspiciousName('ã‚»ãƒ¼ãƒ©ãƒ¼.txt')).toBe(true)
    expect(isSuspiciousName('âeâXâg.txt')).toBe(true)
    expect(isSuspiciousName('僥僗僩.txt')).toBe(true)
    expect(isSuspiciousName('#U30BB#U30FC.txt')).toBe(true)
    expect(isSuspiciousName('正常な日本語.txt')).toBe(false)
    expect(findSuspicious(entries).map((entry) => entry.path)).toEqual(['root/╘.txt'])

    // 阳性对照：方块字符集里换一个**不在表上**的符号就不是乱码（`SUSPICIOUS_CHARS`
    // 是一张写死的表，不是"任何非 ASCII"）；`core.ts:50`。
    expect(SUSPICIOUS_CHARS.has('╘')).toBe(true)
    expect(SUSPICIOUS_CHARS.has('★')).toBe(false)
    expect(isSuspiciousName('★.txt')).toBe(false)
    // 阳性对照：`#U` 那条判据是 4-6 位十六进制（`:87`），三位不算。
    expect(isSuspiciousName('#U30B.txt')).toBe(false)
  })

  // 上游 `core.test.ts:22-29`。
  it('creates changed mappings with injected transcoder', () => {
    const mappings = createEncodebMappings(entries, { srcEncoding: 'x', dstEncoding: 'y', transform: 'recode', limit: 10 }, (name) => name.replace('garbled', 'fixed'))

    expect(mappings).toEqual([
      { src: 'root/garbled', dst: 'root/fixed', type: 'dir', depth: 1 },
      { src: 'root/garbled/a.txt', dst: 'root/fixed/a.txt', type: 'file', depth: 2 },
    ])

    // 阳性对照 + 上游 `core.ts:117`：`changedOnly` 默认真 ⇒ 没变化的 `root/╘.txt` 必须被丢掉。
    // 把 `changedOnly` 关掉就得看见三条（含那条没变化的），否则"过滤"这件事根本没发生。
    const all = createEncodebMappings(entries, { srcEncoding: 'x', dstEncoding: 'y', transform: 'recode', limit: 10 }, (name) => name.replace('garbled', 'fixed'), { changedOnly: false })
    expect(all.map((item) => item.src)).toEqual(['root/garbled', 'root/garbled/a.txt', 'root/╘.txt'])
  })

  // 上游 `core.test.ts:31-34`。
  it('sorts replace mappings deepest first', () => {
    const mappings = createEncodebMappings(entries, { srcEncoding: 'x', dstEncoding: 'y', transform: 'recode', limit: 10 }, (name) => name.replace('garbled', 'fixed'))
    expect(sortReplaceMappings(mappings)[0]?.src).toBe('root/garbled/a.txt')

    // 阳性对照 + 上游 `core.ts:133` 的第二判据：**同深度按源路径长度降序**。
    // 两条 depth 都是 1、长度不同，排序必须是长的那条在前（只剩一条判据时这条会红）。
    const sameDepth = [
      { src: 'root/aa', dst: 'x', type: 'file' as const, depth: 1 },
      { src: 'root/bbb', dst: 'y', type: 'file' as const, depth: 1 },
    ]
    expect(sortReplaceMappings(sameDepth).map((item) => item.src)).toEqual(['root/bbb', 'root/aa'])
  })

  // 上游 `core.test.ts:36-48`。
  it('runs preview through runtime transcoder', async () => {
    const result = await runEncodeb(
      { action: 'preview', paths: ['root'] },
      {
        scanPath: async () => entries,
        recoverPath: async () => 'root',
        transcodeName: (name) => name.replace('garbled', 'fixed'),
      },
    )

    expect(result.success).toBe(true)
    expect(result.data?.mappings).toHaveLength(2)

    // 阳性对照：`find` 那条腿**不看 transcoder**，同一份 runtime 下它数的是可疑名字。
    const found = await runEncodeb({ action: 'find', paths: ['root'] }, {
      scanPath: async () => entries,
      recoverPath: async () => 'root',
      transcodeName: (name) => name.replace('garbled', 'fixed'),
    })
    expect(found.data?.matches).toEqual(['root/╘.txt'])
    expect(found.message).toBe('Find completed, 1 item(s).')
  })
})

describe('encodeb core（上游没覆盖的分支，逐条钉住）', () => {
  // 上游 `core.ts:64-74`：内核默认与定义里的界面默认是两套，不许合并。
  it('normalizes to the kernel defaults, not the UI defaults', () => {
    const normalized = normalizeEncodebInput({})
    expect(normalized).toEqual({
      action: 'preview',
      paths: [],
      srcEncoding: 'cp437',
      dstEncoding: 'cp936',
      transform: 'recode',
      strategy: 'replace',
      limit: 200,
    })
    // 阳性对照：定义里 `preset` 的默认是 `auto`、编码默认是 `auto`（`package.json#xaihi.node`），
    // 与这里**不同字**；`auto` 只有从 preset 表下来才会出现。
    expect(ENCODEB_PRESETS.auto.srcEncoding).toBe('auto')
    expect(normalized.srcEncoding).toBe('cp437')
  })

  // 上游 `core.ts:72`：`Math.max(1, Math.trunc(limit))`。
  it('clamps limit through Math.trunc then Math.max(1, …)', () => {
    expect(normalizeEncodebInput({ limit: 0 }).limit).toBe(1)
    expect(normalizeEncodebInput({ limit: -5 }).limit).toBe(1)
    expect(normalizeEncodebInput({ limit: 12.9 }).limit).toBe(12)
    // 阳性对照：不写 limit 才是 200（`??` 那条分支），0 不许被当成"没给"。
    expect(normalizeEncodebInput({}).limit).toBe(200)
  })

  // 上游 `core.ts:76-79`：**只按换行切**，剥首尾引号，去空。
  it('parses paths by newlines only and strips surrounding quotes', () => {
    expect(parseEncodebPaths('"C:\\a"\r\n  /b  ')).toEqual(['C:\\a', '/b'])
    // 阳性对照：分号**不是**分隔符（那是上游 CLI 那一层的事，`cli.ts:221`）。
    expect(parseEncodebPaths('a;b')).toEqual(['a;b'])
    expect(parseEncodebPaths(['a', ' "b" ', ''])).toEqual(['a', 'b'])
    expect(parseEncodebPaths(undefined)).toEqual([])
  })

  // 上游 `core.ts:85-92`：六条或，每条都要单独成立。
  it('flags each isSuspiciousName branch on its own', () => {
    expect(isSuspiciousName('╘')).toBe(true) // 方块字符集
    expect(isSuspiciousName('#U0041')).toBe(true) // 转义
    expect(isSuspiciousName('Ã©')).toBe(true) // [ÃÂâã]\S
    expect(isSuspiciousName('僥')).toBe(true) // cp437→GBK 假名集
    expect(isSuspiciousName('ÄÅ')).toBe(true) // 重音字母满两条
    expect(isSuspiciousName('a\ufffdb')).toBe(true) // U+FFFD
    // 阳性对照：重音那条是**计数**判据（`length >= 2`，`:90`），单字符不算。
    expect(isSuspiciousName('Ä')).toBe(false)
    // 阳性对照：`[ÃÂâã]\S` 要求后面紧跟一个非空白字符（`:88`），所以带空格的不算。
    expect(isSuspiciousName('ã »')).toBe(false)
  })

  // 上游 `core.ts:94-103`：到 limit 就 break，返回前 limit 条。
  it('stops scanning at the limit instead of skipping the rest', () => {
    const many: EncodebEntry[] = Array.from({ length: 5 }, (_unused, index) => ({
      path: `root/╘${String(index)}`, name: `╘${String(index)}`, type: 'file' as const, rootPath: 'root', relativeParts: [`╘${String(index)}`], depth: 1,
    }))
    expect(findSuspicious(many, 2).map((entry) => entry.name)).toEqual(['╘0', '╘1'])
    // 阳性对照：limit 缺席时是 200（`:94` 的默认参数），五条全出来。
    expect(findSuspicious(many)).toHaveLength(5)
  })

  // 上游 `core.ts:116`：比较的是 NUL 连接的 relativeParts；`:126` 只在 changedOnly 分支截断。
  it('limits only the changedOnly branch and joins dst under destRoot', () => {
    const input = { srcEncoding: 'x', dstEncoding: 'y', transform: 'recode' as const, limit: 1 }
    const limited = createEncodebMappings(entries, input, (name) => `fixed-${name}`, { destRoot: 'out' })
    expect(limited).toEqual([
      { src: 'root/garbled', dst: 'out/fixed-garbled', type: 'dir', depth: 1 },
    ])
    // 阳性对照：changedOnly=false 时 limit **不生效**（`:126` 在那条 `if` 里面）。
    const unlimited = createEncodebMappings(entries, input, (name) => `fixed-${name}`, { changedOnly: false, destRoot: 'out' })
    expect(unlimited).toHaveLength(3)
    // 上游 `core.ts:121` + `:178-181`：root 里有反斜杠 ⇒ 分隔符是 `\`，并砍掉 root 尾部多余的分隔符。
    const backslash: EncodebEntry[] = [{ path: 'C:\\root\\a', name: 'a', type: 'file', rootPath: 'C:\\root\\', relativeParts: ['a', 'b'], depth: 1 }]
    expect(createEncodebMappings(backslash, { ...input, limit: 10 }, (name) => `x${name}`).map((item) => item.dst)).toEqual(['C:\\root\\xa\\xb'])
  })

  // 上游 `core.ts:136-176`：三条腿的消息模板与 progress 算式（百分数，不是 0..1）。
  it('reports percent progress on find/preview and nothing on recover', async () => {
    const events: { type: string; progress?: number; message: string }[] = []
    const runtime: EncodebRuntime = {
      scanPath: async () => entries,
      recoverPath: async () => 'recovered',
      transcodeName: (name) => name.replace('garbled', 'fixed'),
    }
    const result = await runEncodeb({ action: 'preview', paths: ['root', 'root'] }, runtime, (event) => events.push(event))
    expect(result.message).toBe('Preview completed, 4 item(s).')
    // 两条路径 × 每条都出全量映射 ⇒ 2×2；progress 是 (0/2)*80=0、(1/2)*80=40，收尾 100。
    expect(events.map((event) => event.progress)).toEqual([0, 40, 100])
    expect(events.map((event) => event.message)).toEqual(['Scanning root', 'Scanning root', 'Scan completed.'])

    // 阳性对照：`recover` 那条腿**一个 progress 都不发**（`:146-153`），
    // 别把"没接进度"读成"接了但没上报"。
    const recoverEvents: string[] = []
    const recovered = await runEncodeb({ action: 'recover', paths: ['a', 'b'] }, {
      scanPath: async () => entries,
      recoverPath: async () => 'x',
      transcodeName: (name) => name,
    }, (event) => recoverEvents.push(event.type))
    expect(recovered.message).toBe('Recovery completed, processed 2 path(s).')
    expect(recovered.data?.processed).toBe(2)
    expect(recoverEvents).toEqual([])
  })

  // 上游 `core.ts:142-144`：没给路径直接 success:false（这一条是 find/preview 的入口闸门）。
  it('refuses when no valid path survived parsing', async () => {
    const result = await runEncodeb({ action: 'find', paths: ['   ', ''] }, {
      scanPath: async () => entries,
      recoverPath: async () => 'x',
    })
    expect(result.success).toBe(false)
    expect(result.message).toBe('No valid paths provided.')
    expect(result.data).toEqual({ mappings: [], matches: [], processed: 0 })
  })

  // 上游 `core.ts:41-45` + `:81-83`：`transcodeName` 是可选注入，缺省那份是恒等。
  it('keeps the identity transcoder as the default', () => {
    expect(defaultTranscodeName('╘.txt')).toBe('╘.txt')
    expect(createEncodebMappings(entries, { srcEncoding: 'x', dstEncoding: 'y', transform: 'recode', limit: 10 })).toEqual([])
  })

  // 上游 `core.ts:52-62`：预设表里没有 `custom`，而认不出的 id 在 UI 腿落回 `cn`
  // （`interaction.ts:90`，接线层照它）。
  it('has no custom entry in the preset table', () => {
    expect(Object.keys(ENCODEB_PRESETS)).toEqual(['auto', 'cn', 'jp', 'kr', 'jp_from_cn', 'jp_iso2022_from_cn', 'latin1_utf8', 'hash_u', 'middle_dot'])
    expect((ENCODEB_PRESETS as Record<string, unknown>).custom).toBeUndefined()
    // 阳性对照：`hash_u` / `middle_dot` 这两条的 transform 字面值是接线层判"能不能跑"的依据。
    expect(ENCODEB_PRESETS.hash_u.transform).toBe('decode-hash-u')
    expect(ENCODEB_PRESETS.middle_dot.transform).toBe('normalize-middle-dot')
    expect(ENCODEB_PRESETS.latin1_utf8.srcEncoding).toBe('windows-1252')
  })
})

describe('encodeb 的 codec 闸门（src/platform.ts）', () => {
  it('runs the two codec-free transforms and refuses the other two', () => {
    // 逐字搬自上游 platform.ts:189-195 / :76 的那两条分支：真能跑。
    expect(nodeTranscodeName('#U30BB#U30FC.txt', 'cp437', 'cp936', 'decode-hash-u')).toBe('セー.txt')
    expect(nodeTranscodeName('魔法・少女', 'cp437', 'cp936', 'normalize-middle-dot')).toBe('魔法·少女')
    expect(isCodecFree('decode-hash-u')).toBe(true)
    expect(isCodecFree('normalize-middle-dot')).toBe(true)

    // 阳性对照：`recode` / `auto` 必须**点名**缺的东西，不许回落成"名字没变"。
    for (const transform of ['recode', 'auto'] as const) {
      expect(() => nodeTranscodeName('╘.txt', 'cp437', 'cp936', transform)).toThrow(/iconv-lite/)
      expect(isCodecFree(transform)).toBe(false)
    }
    expect(CODEC_UNAVAILABLE('recode')).toContain('chardet')
    expect(CODEC_UNAVAILABLE('recode')).toContain('decode-hash-u')
  })

  it('keeps the upstream escape decoder honest about surrogate and out-of-range code points', () => {
    // 上游 platform.ts:189-195：超出平面或落在代理对区间 ⇒ **原样留着**，不许解成 U+FFFD。
    expect(nodeTranscodeName('#U30BB', 'x', 'y', 'decode-hash-u')).toBe('セ')
    expect(nodeTranscodeName('#UD800', 'x', 'y', 'decode-hash-u')).toBe('#UD800')
    expect(nodeTranscodeName('#U110000', 'x', 'y', 'decode-hash-u')).toBe('#U110000')
  })
})
