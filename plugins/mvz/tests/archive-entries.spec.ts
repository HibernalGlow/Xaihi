/**
 * mvz 归档条目叶子的保真用例：断的是 `src/archive-entries.ts` 那片**纯文本解析**，
 * 与界面 `packages/ui-host/src/nodes/mvz/Component.tsx:7` 经
 * `@xiranite/node-mvz/archive-entries` 拿到的那一份是同一个文件。
 *
 * 前两条用例的期望值逐条手抄自基线
 * `<Xiranite>/packages/nodes/mvz/src/core.test.ts`（tag `noxide`）的 `:6` 与 `:16` 两条，
 * 一个字符都没改；换的只有 import 指向（`./core.js` → `../src/archive-entries.ts`）。
 * 那片实现住在 core 里时这两条已经跑过一遍（`tests/core.spec.ts`），这里留着它们是因为
 * 界面走的现在是**非 core 的那条边**：叶子坏了要让 `pnpm --filter … test:unit` 直接点名，
 * 而不是等文档构建在解析表上响。
 *
 * 第三条是本仓才有的判据（钉的是叶子与 core 的**同一份文本**这件事）：`LONG_FORMAT_RE`
 * 只在叶子里出现一次，`findz` 那种 `<日期> <时间> <大小> <路径>` 长行的剥壳规则因此没有第二份。
 *
 * 每条尺都配阳性对照（`mutate-` 那两条：改坏判据必须红）。
 *
 * @module xaihi-mvz/tests/archive-entries
 */

import { describe, expect, it } from 'vitest'
import type { ArchiveEntry } from '../src/archive-entries.ts'
import { groupByArchive, parseMvzEntries, parseMvzLine } from '../src/archive-entries.ts'

describe('mvz archive entries', () => {
  it('parses compact and long findz lines', () => {
    expect(parseMvzLine('C:/packs/book.zip//page/001.jpg')).toEqual({
      archivePath: 'C:/packs/book.zip',
      internalPath: 'page/001.jpg',
      rawLine: 'C:/packs/book.zip//page/001.jpg',
    })
    expect(parseMvzLine('2024-01-02 03:04:05 1.5K C:/packs/book.zip//page/002.jpg')?.internalPath).toBe('page/002.jpg')
    expect(parseMvzLine('not an archive entry')).toBeNull()
  })

  it('groups entries by archive', () => {
    const groups = groupByArchive(parseMvzEntries('a.zip//one.txt\na.zip//two.txt\nb.zip//one.txt'))
    expect(groups.size).toBe(2)
    expect(groups.get('a.zip')?.map((entry) => entry.internalPath)).toEqual(['one.txt', 'two.txt'])
  })

  it('长行的壳只在这一处剥：分隔符可换、缺任一半即 null', () => {
    // 手抄自基线 core.ts 的判据：`separator` 是参数（默认 `//`），换分隔符不换实现。
    expect(parseMvzLine('C:/packs/book.zip::page/001.jpg', '::')?.internalPath).toBe('page/001.jpg')
    expect(parseMvzLine('C:/packs/book.zip//')).toBeNull()
    expect(parseMvzLine('//page/001.jpg')).toBeNull()
    expect(parseMvzLine('')).toBeNull()
    // 数组入口与字符串入口走同一份行解析：空行被丢掉，行数不等于条目数。
    const lines = ['a.zip//one.txt', '', 'not an entry', 'a.zip//two.txt']
    const entries: ArchiveEntry[] = parseMvzEntries(lines)
    expect(entries.map((entry) => entry.rawLine)).toEqual(['a.zip//one.txt', 'a.zip//two.txt'])
    // 阳性对照：同一份文本经长行格式进来，归档路径必须是剥掉日期/时间/大小之后的那半。
    const longForm = parseMvzEntries('2024-01-02 03:04:05 1.5K a.zip//one.txt')
    expect(longForm[0]?.archivePath).toBe('a.zip')
    expect(longForm[0]?.internalPath).toBe('one.txt')
  })
})
