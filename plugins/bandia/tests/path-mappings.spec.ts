/**
 * bandia 路径映射叶子的保真用例：断的是 `src/path-mappings.ts` 那片**纯文本解析**，
 * 界面 `packages/ui-host/src/nodes/bandia/Component.tsx:7` 经
 * `@xiranite/node-bandia/path-mappings` 拿到的就是这同一个文件。
 *
 * 期望值两个来源，分开标：
 * - 第一条 `parses archive paths and mappings` 的三条断言逐字抄自基线
 *   `<Xiranite>/packages/nodes/bandia/src/core.test.ts`（tag `noxide`）的 `:6`，
 *   一个字面量都没改，换的只有 import 指向（`./core.js` → `../src/path-mappings.ts`）。
 * - 其余几条钉的是基线 `core.ts:99-166`（同 tag）里**写了但上游那份 test 没测到**的分支：
 *   判据按源码那几行的分支手推（三种分隔符、外层引号、蛇形键、去重），不是跑本仓代码现算的。
 *
 * 为什么值得单独一份：这片从 core 里搬出来后，界面走的是非 core 的那条边；
 * 叶子坏了要让 `pnpm --filter … test:unit` 点名，而不是等文档构建在解析表上响。
 *
 * 每条尺都配阳性对照（最后那组 `mutate-`：判据改坏必须红）。
 *
 * @module xaihi-bandia/tests/path-mappings
 */

import { describe, expect, it } from 'vitest'
import type { BandiaPathMapping } from '../src/path-mappings.ts'
import {
  ARCHIVE_EXTENSIONS,
  isArchivePath,
  mappingsToText,
  normalizeMappings,
  parseBandiaPaths,
  parsePathMappings,
  stripOuterQuotes,
  unique,
} from '../src/path-mappings.ts'

describe('bandia path mappings', () => {
  it('parses archive paths and mappings', () => {
    expect(parseBandiaPaths('"C:/a/foo.zip"\nnot archive\nD:/bar.7z')).toEqual(['C:/a/foo.zip', 'D:/bar.7z'])
    expect(parsePathMappings('C:/a/foo.zip=>C:/a/foo\n{"mappings":[{"archive_path":"D:/b.7z","extracted_path":"D:/b"}]}').length).toBe(1)
    expect(parsePathMappings('{"mappings":[{"archive_path":"D:/b.7z","extracted_path":"D:/b"}]}')).toEqual([{ archivePath: 'D:/b.7z', extractedPath: 'D:/b' }])
  })

  it('三种分隔符等价，缺任一半即整条丢掉（core.ts:119-144）', () => {
    const expected: BandiaPathMapping[] = [{ archivePath: 'a.zip', extractedPath: 'a' }]
    expect(parsePathMappings('a.zip=>a')).toEqual(expected)
    expect(parsePathMappings('a.zip|a')).toEqual(expected)
    expect(parsePathMappings('a.zip\ta')).toEqual(expected)
    expect(parsePathMappings('')).toEqual([])
    expect(parsePathMappings('只有一列')).toEqual([])
    expect(parsePathMappings('a.zip|')).toEqual([])
    expect(parsePathMappings('|a')).toEqual([])
  })

  it('JSON 优先，蛇形与驼峰两种键名都认，非对象项丢掉（core.ts:146-160）', () => {
    expect(normalizeMappings([{ archivePath: 'a.zip', extractedPath: 'a' }])).toEqual([{ archivePath: 'a.zip', extractedPath: 'a' }])
    expect(normalizeMappings({ mappings: [{ archive_path: 'b.7z', extracted_path: 'b' }] })).toEqual([{ archivePath: 'b.7z', extractedPath: 'b' }])
    expect(normalizeMappings({ mappings: ['nope', { archive_path: 'c.rar' }] })).toEqual([])
    expect(normalizeMappings('not an array')).toEqual([])
  })

  it('mappingsToText 的产物能被 parsePathMappings 原样读回（core.ts:164-166）', () => {
    const mappings: BandiaPathMapping[] = [{ archivePath: 'C:/a/foo.zip', extractedPath: 'C:/a/foo' }]
    expect(mappingsToText(mappings)).toEqual([
      '{',
      '  "mappings": [',
      '    {',
      '      "archivePath": "C:/a/foo.zip",',
      '      "extractedPath": "C:/a/foo"',
      '    }',
      '  ]',
      '}',
    ].join('\n'))
    expect(parsePathMappings(mappingsToText(mappings))).toEqual(mappings)
  })

  it('归档判定只看那张扩展名表，大小写不敏感（core.ts:91-97）', () => {
    expect([...ARCHIVE_EXTENSIONS]).toEqual(['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz'])
    expect(isArchivePath('D:/a.ZIP')).toBe(true)
    expect(isArchivePath('D:/a.tar.gz')).toBe(true)
    expect(isArchivePath('D:/a.txt')).toBe(false)
  })

  it('剪贴板那层的引号与重复项都归一（core.ts:100-118、:168-186）', () => {
    expect(stripOuterQuotes('"C:/a/foo.zip"')).toBe('C:/a/foo.zip')
    expect(stripOuterQuotes("'C:/a/foo.zip'")).toBe('C:/a/foo.zip')
    expect(stripOuterQuotes('"C:/a/foo.zip')).toBe('C:/a/foo.zip')
    expect(stripOuterQuotes('  C:/a/foo.zip  ')).toBe('C:/a/foo.zip')
    expect(unique(['a.zip', 'a.zip', '', 'b.7z'])).toEqual(['a.zip', 'b.7z'])
    // 非归档行里仍能捞到带扩展名的那个 token（`core.ts:107` 那条 `(?:^|\s)…(?:\s|$)` 的捞法）。
    expect(parseBandiaPaths('解压到 D:/out/x.zip 完成')).toEqual(['D:/out/x.zip'])
    // 阳性对照：同一行把 token 用引号夹住，那条捞法就够不着了（`[^\s"']+` 不含引号）。
    expect(parseBandiaPaths('解压到 "D:/out/x.zip" 完成')).toEqual([])
    expect(parseBandiaPaths('D:/out/x.zip\nD:/out/x.zip\nD:/y.7z')).toEqual(['D:/out/x.zip', 'D:/y.7z'])
  })
})
