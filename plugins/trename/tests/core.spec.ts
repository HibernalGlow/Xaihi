/**
 * trename 内核的保真测试：断的是"从 noxide 基线搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（全部手写，**不由被测函数算出来**）：
 * - 第 1 组五条逐条抄自基线 `packages/nodes/trename/src/core.test.ts`（170 行）的五个用例，
 *   连它自带的 `createMemoryRuntime` 与那三个假路径函数（`normalize` / `dirname` / `basename`）
 *   一起搬：`"/work"`、`4`、`'"src_dir": "gallery"'`、`"batch001"`、
 *   `["/work/a.jpg", "/work/A.jpg"]`、`"raw pack.zip"` 全是上游手写的常量。
 * - 第 2 组往上游**没覆盖**的分支里钉：`normalizeTrenameInput`（`core.ts:187-205`）的
 *   camel/snake 优先级与那十七个默认值、`splitRenameJson` 的 2 行起算与目录 `3 + 子节点`
 *   （`:279-296`、`:681-684`）、`preprocessRenameJson`（`:302-327`）的三条清洗文案、
 *   `validateRenameJson` 的 `duplicate_target` / `source_not_found` / 冲突分类（`:329-400`）、
 *   四条缺参拒绝（`:403` / `:411` / `:417` / `:428`）、撤销的三句拒绝（`:493-494`）、
 *   `keepRecent` 的切片（`:515` / `:520`）、leak 空目录丢弃（`:554`）与
 *   `excludePatterns` 的两条别名与裸正则（`:147-150` + `:746`）。
 * - 分段与那两句 `[AUTO-FIX]` 的目标名是**手推**的，推导写在用例里。
 * - 最后一组是本包的 DI 缝：`src/platform.ts` 的账本位置闸门（ADR-0003 决定 2）。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * @module xaihi-trename/tests/core
 */

import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { TrenameDirEntry, TrenameJson, TrenamePathInfo, TrenameRuntime } from '../src/core.ts'
import {
  countPending,
  countReady,
  countTotal,
  normalizeTrenameInput,
  parseRenameJson,
  preprocessRenameJson,
  runTrename,
  scanTrenamePaths,
  splitRenameJson,
  stringifyRenameJson,
  validateRenameJson,
} from '../src/core.ts'
import { createNodeTrenameRuntime } from '../src/platform.ts'

describe('trename core（上游 core.test.ts 五条逐条搬来）', () => {
  // 上游 `core.test.ts:6-25`。
  it('scans folders into rename JSON and respects excludes', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/gallery/a.jpg')
    runtime.file('/work/gallery/readme.txt')
    runtime.file('/work/gallery/sub/b.png')

    const scan = await scanTrenamePaths(['/work/gallery'], {
      includeHidden: false,
      includeRoot: true,
      excludeExts: ['.txt'],
      excludePatterns: [],
      mode: 'normal',
    }, runtime)

    expect(scan.basePath).toBe('/work')
    expect(countTotal(scan.renameJson)).toBe(4)
    expect(countPending(scan.renameJson)).toBe(4)
    expect(stringifyRenameJson(scan.renameJson, true)).toContain('"src_dir": "gallery"')
    expect(stringifyRenameJson(scan.renameJson, true)).not.toContain('readme.txt')

    // 阳性对照：`includeRoot: false` 走的是另一条腿（`:249` 把子项直接摊进 root），
    // 计数因此少掉 gallery 自己那一条。
    const noRoot = await scanTrenamePaths(['/work/gallery'], {
      includeHidden: false,
      includeRoot: false,
      excludeExts: ['.txt'],
      excludePatterns: [],
      mode: 'normal',
    }, runtime)
    expect(countTotal(noRoot.renameJson)).toBe(3)

    // 阳性对照：隐藏项默认被滤（`:531`），打开开关才回来。
    runtime.file('/work/gallery/.hidden.jpg')
    const withHidden = await scanTrenamePaths(['/work/gallery'], {
      includeHidden: true,
      includeRoot: true,
      excludeExts: ['.txt'],
      excludePatterns: [],
      mode: 'normal',
    }, runtime)
    expect(stringifyRenameJson(withHidden.renameJson, true)).toContain('.hidden.jpg')
  })

  // 上游 `core.test.ts:27-33`。
  it('imports and counts ready targets', async () => {
    const json = JSON.stringify({ root: [{ src_dir: 'gallery', tgt_dir: '', children: [{ src: 'a.jpg', tgt: 'A.jpg' }] }] })
    const parsed = parseRenameJson(json)
    expect(countTotal(parsed)).toBe(2)
    expect(countPending(parsed)).toBe(1)
    expect(countReady(parsed)).toBe(1)

    // 阳性对照：`tgt === src` 不算 ready（`:799-805` 那条 `node.tgt !== node.src`）。
    const same = parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'a.jpg' }] }))
    expect(countReady(same)).toBe(0)
    expect(countTotal(same)).toBe(1)
    // 阳性对照：认不出的节点形状被 `normalizeNode` 丢掉（`:692-703`），不炸整份。
    expect(countTotal(parseRenameJson(JSON.stringify({ root: [{ nope: 1 }, { src: 'x' }] })))).toBe(1)
  })

  // 上游 `core.test.ts:35-47`。
  it('validates target conflicts and plans dry-run rename', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')
    runtime.file('/work/existing.jpg')
    const json = JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'existing.jpg' }] })

    const result = await runTrename({ action: 'rename', jsonContent: json, basePath: '/work' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.successCount).toBe(0)
    expect(result.data?.skippedCount).toBe(1)
    expect(result.data?.conflicts[0]?.type).toBe('target_exists')
    expect(runtime.moves.length).toBe(0)

    // 阳性对照：内核默认就是预演（`dryRun ?? true`，`:200`）——上面没写 dryRun。
    // 显式打开也必须一个目录都不动；只有显式 false 才动手（下一条用例）。
    const explicit = await runTrename({ action: 'rename', jsonContent: json, basePath: '/work', dryRun: true }, runtime)
    expect(explicit.message).toBe('Rename plan complete: 0 operation(s), 1 skipped.')
    expect(runtime.moves.length).toBe(0)
  })

  // 上游 `core.test.ts:49-64`。
  it('renames files and records undo batches', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')
    const json = JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'A.jpg' }] })

    const renamed = await runTrename({ action: 'rename', jsonContent: json, basePath: '/work', dryRun: false, undoPath: '/undo.json' }, runtime)
    expect(renamed.success).toBe(true)
    expect(renamed.data?.successCount).toBe(1)
    expect(renamed.data?.operationId).toBe('batch001')
    expect(runtime.moves[0]).toEqual(['/work/a.jpg', '/work/A.jpg'])

    const undone = await runTrename({ action: 'undo', batchId: 'batch001', undoPath: '/undo.json' }, runtime)
    expect(undone.success).toBe(true)
    expect(undone.data?.successCount).toBe(1)
    expect(runtime.moves[1]).toEqual(['/work/A.jpg', '/work/a.jpg'])

    // 阳性对照：账本真的落盘了（`:736-739` 写的是那份 `{batches:[…]}` JSON），
    // 不是只在内存里改了个标记——读得回来才谈得上跨进程撤销。
    const store = JSON.parse(await runtime.readText('/undo.json')) as { batches: { id: string; undone: boolean; operations: unknown[] }[] }
    expect(store.batches).toHaveLength(1)
    expect(store.batches[0]?.id).toBe('batch001')
    expect(store.batches[0]?.undone).toBe(true)
    expect(store.batches[0]?.operations).toEqual([{ originalPath: '/work/a.jpg', newPath: '/work/A.jpg' }])

    // 阳性对照：已撤销的批次再撤销必须被拒（`:494`），不许把同一对路径回搬第二次。
    const again = await runTrename({ action: 'undo', batchId: 'batch001', undoPath: '/undo.json' }, runtime)
    expect(again.success).toBe(false)
    expect(again.message).toBe('Undo batch has already been undone: batch001')
    expect(runtime.moves).toHaveLength(2)
  })

  // 上游 `core.test.ts:66-77`。
  it('leak mode keeps archives without known prefixes', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/box/2024.01 done.zip')
    runtime.file('/work/box/raw pack.zip')
    runtime.file('/work/box/image.png')

    const result = await runTrename({ action: 'scan', path: '/work/box', mode: 'leak', compact: true }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.jsonContent).toContain('raw pack.zip')
    expect(result.data?.jsonContent).not.toContain('2024.01 done.zip')
    expect(result.data?.jsonContent).not.toContain('image.png')

    // 阳性对照：同一份夹具在 normal 下三个文件都留（`:558-565` 的 leak 分支不进）。
    const normal = await runTrename({ action: 'scan', path: '/work/box' }, runtime)
    expect(normal.data?.jsonContent).toContain('image.png')
    expect(normal.data?.jsonContent).toContain('2024.01 done.zip')
  })
})

describe('trename core（上游没覆盖的分支）', () => {
  it('normalizes both spellings and keeps the seventeen kernel defaults', () => {
    const bare = normalizeTrenameInput({})
    expect(bare).toMatchObject({
      action: 'scan',
      paths: [],
      includeHidden: false,
      includeRoot: true,
      excludeExts: ['.json', '.txt', '.html', '.htm', '.md', '.log'],
      excludePatterns: [],
      maxLines: 1000,
      compact: true,
      mode: 'normal',
      jsonContent: '',
      basePath: '',
      dryRun: true,
      batchId: '',
      undoPath: '',
      keepRecent: 10,
    })

    const both = normalizeTrenameInput({
      action: 'rename',
      path: '"/a b" /c',
      includeHidden: true,
      include_hidden: false,
      includeRoot: false,
      excludeExts: 'TXT, .md',
      excludePatterns: ['vol', ''],
      maxLines: 12.7,
      compact: false,
      mode: 'leak',
      jsonContent: '  { "root": [] }  ',
      basePath: ' /work ',
      dryRun: false,
      batchId: ' b1 ',
      undoPath: ' /u.json ',
      keepRecent: 3.9,
    })
    // `splitPathInput`（`:763-766`）的分隔符是**空白 + 引号**，不是逗号：引号那段整体成一项
    // （`"/a b"` → `/a b`），剩下的按空白切。这条就是宿主半边为什么交数组、
    // 而不是把路径 join 成一条字符串（`src/index.ts` 的 `pathsFrom`）。
    expect(both.paths).toEqual(['/a b', '/c'])
    expect(both.includeHidden).toBe(true)
    expect(both.includeRoot).toBe(false)
    expect(both.excludeExts).toEqual(['.txt', '.md'])
    expect(both.excludePatterns).toEqual(['vol'])
    expect(both.maxLines).toBe(12)
    expect(both.keepRecent).toBe(3)
    expect(both.compact).toBe(false)
    expect(both.mode).toBe('leak')
    expect(both.jsonContent).toBe('{ "root": [] }')
    expect(both.basePath).toBe('/work')
    expect(both.dryRun).toBe(false)
    expect(both.batchId).toBe('b1')
    expect(both.undoPath).toBe('/u.json')

    // 阳性对照：camel 那份赢（`:191` 的 `??` 链）——换成 false 就翻过来。
    expect(normalizeTrenameInput({ includeHidden: false, include_hidden: true }).includeHidden).toBe(false)
    // 阳性对照：负数被夹到 0（`:195` 与 `:203` 的 `Math.max(0, …)`）。
    expect(normalizeTrenameInput({ maxLines: -5, keepRecent: -1 }).maxLines).toBe(0)
    expect(normalizeTrenameInput({ maxLines: -5, keepRecent: -1 }).keepRecent).toBe(0)
    // 阳性对照：`mode` 只认字面 "leak"（`:197`）。非字面量那一条（`LEAK`）在类型层就进不来，
    // 它由 `tests/cli.spec.ts` 的 `--mode LEAK` 那条覆盖（flag 那侧没有类型保护）。
    expect(normalizeTrenameInput({ mode: 'normal' }).mode).toBe('normal')
  })

  it('segments by serialized lines with a 2-line frame per segment', () => {
    const json: TrenameJson = {
      root: [
        { src: 'a.jpg', tgt: '' },
        { src: 'b.jpg', tgt: '' },
        { src: 'c.jpg', tgt: '' },
      ],
    }
    // 手推（不由被测函数算）：每段起算 2 行（`{` 与 `"root": [`，`:283`），文件节点 1 行（`:682`）。
    // maxLines 3 ⇒ 装完第一个就是 3 行，第二个要 4 行 > 3 ⇒ 换段 ⇒ 三段各一个节点。
    expect(splitRenameJson(json, 3)).toHaveLength(3)
    expect(splitRenameJson(json, 4)).toHaveLength(2)
    // 阳性对照：`maxLines <= 0` 是"一段装全部"（`:280`），不是"零段"。
    expect(splitRenameJson(json, 0)).toHaveLength(1)
    expect(splitRenameJson(json, -1)).toHaveLength(1)
    // 阳性对照：root 为空时一段都不产（`:294` 的那个 `current.length` 闸门）。
    expect(splitRenameJson({ root: [] }, 3)).toHaveLength(0)

    // 阳性对照：目录节点是 `3 + 子节点` = 4 行（`:683`），加上 2 行框架 = 6 行 ⇒
    // 单节点自己就超额度时**不拆**（没有可拆的边界），但它把下一段挤出去。
    const dirNode: TrenameJson = { root: [{ src_dir: 'd', tgt_dir: '', children: [{ src: 'x.jpg', tgt: '' }] }] }
    expect(splitRenameJson(dirNode, 4)).toHaveLength(1)
    const two: TrenameJson = { root: [{ src_dir: 'd', tgt_dir: '', children: [{ src: 'x.jpg', tgt: '' }] }, { src: 'y.jpg', tgt: '' }] }
    expect(splitRenameJson(two, 4)).toHaveLength(2)
  })

  it('serializes compact lines versus indented JSON', () => {
    const json: TrenameJson = { root: [{ src: 'a.jpg', tgt: '' }] }
    // 紧凑那份是自己拼的行（`:662-679`），空串 `tgt` 永远在场。
    expect(stringifyRenameJson(json, true)).toBe('{\n  "root": [\n    {"src": "a.jpg", "tgt": ""}\n  ]\n}')
    // 阳性对照：`compact: false` 走 `JSON.stringify(…, null, 2)`（`:299`），形状完全不同。
    const pretty = stringifyRenameJson(json, false)
    expect(pretty).not.toContain('{"src": "a.jpg", "tgt": ""}')
    expect(pretty).toContain('"tgt": ""')
  })

  it('preprocesses illegal characters and misplaced extensions', () => {
    const parsed = parseRenameJson(JSON.stringify({
      root: [{ src: 'a.jpg', tgt: 'x<y>.txt' }, { src_dir: 'd1', tgt_dir: 'a"b', children: [] }],
    }))
    const processed = preprocessRenameJson(parsed)
    expect(processed.renameJson.root[0]).toEqual({ src: 'a.jpg', tgt: 'x_y_.txt' })
    expect(processed.renameJson.root[1]).toEqual({ src_dir: 'd1', tgt_dir: 'a_b', children: [] })
    expect(processed.messages).toEqual([
      '[AUTO-FIX] illegal path characters were replaced.',
      '[AUTO-FIX] illegal path characters were replaced.',
    ])

    // 阳性对照：扩展名位置错的是另一条分支。手推 `fixExtensionPosition`（`:606-623`）：
    // `a.txt[vol1].jpg` 拆成 ['a','txt[vol1]','jpg']，第二段命中 ⇒ base = `a` + `[vol1]`，
    // 剩下的 fixed 是 ['txt','jpg'] ⇒ 结果 **`a[vol1].txt.jpg`**（把被错放的扩展名整段挪到末尾）。
    const misplaced = preprocessRenameJson(parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'a.txt[vol1].jpg' }] })))
    expect(misplaced.renameJson.root[0]).toEqual({ src: 'a.jpg', tgt: 'a[vol1].txt.jpg' })
    expect(misplaced.messages).toEqual(['[AUTO-FIX] extension suffix moved before .txt'])

    // 阳性对照：扩展名里含非法字符是 `[ERROR]` 且**不改名**（`:588`）。
    const broken = preprocessRenameJson(parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'a.tx<t' }] })))
    expect(broken.renameJson.root[0]).toEqual({ src: 'a.jpg', tgt: 'a.tx<t' })
    expect(broken.messages).toEqual(['[ERROR] extension contains illegal characters: .tx<t'])
  })

  it('collects conflicts from the filesystem and blocks duplicate targets', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')
    runtime.file('/work/dup.jpg')

    const duplicate = parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'same.jpg' }, { src: 'dup.jpg', tgt: 'same.jpg' }] }))
    const checked = await validateRenameJson(duplicate, '/work', runtime)
    // 排序后留**第一个**（`:384` 那个 `[, ...duplicates]`）：a.jpg 在先，dup.jpg 被判重。
    expect(checked.operations).toEqual([{ originalPath: '/work/a.jpg', newPath: '/work/same.jpg' }])
    expect(checked.conflicts).toHaveLength(1)
    expect(checked.conflicts[0]).toEqual({
      type: 'duplicate_target',
      srcPath: '/work/dup.jpg',
      tgtPath: '/work/same.jpg',
      message: 'Duplicate target skipped: /work/same.jpg',
    })

    // 阳性对照：源不存在 ⇒ `source_not_found`，而且那条候选**被扣掉**（`:381` 的 blocked 集合）。
    const missing = parseRenameJson(JSON.stringify({ root: [{ src: 'gone.jpg', tgt: 'x.jpg' }] }))
    const missingChecked = await validateRenameJson(missing, '/work', runtime)
    expect(missingChecked.operations).toEqual([])
    expect(missingChecked.conflicts[0]?.type).toBe('source_not_found')
    expect(missingChecked.conflicts[0]?.message).toBe('Source not found: /work/gone.jpg')

    // 阳性对照：目录节点先递归子项、后给自己加候选（`:375-376`）⇒ 顺序是子、父。
    const tree = parseRenameJson(JSON.stringify({ root: [{ src_dir: 'd', tgt_dir: 'D', children: [{ src: 'c.jpg', tgt: 'C.jpg' }] }] }))
    runtime.file('/work/d/c.jpg')
    const treeChecked = await validateRenameJson(tree, '/work', runtime)
    expect(treeChecked.operations.map((operation) => operation.originalPath)).toEqual(['/work/d/c.jpg', '/work/d'])

    // 基名里的非法字符走 `[AUTO-FIX]`：不是冲突，条目改完名照样进 operations（`:590-592`）。
    const fixed = await validateRenameJson(parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'b<c>.jpg' }] })), '/work', runtime)
    expect(fixed.conflicts).toEqual([])
    expect(fixed.operations).toEqual([{ originalPath: '/work/a.jpg', newPath: '/work/b_c_.jpg' }])

    // `[ERROR]` 那一类才成冲突。这里钉一个上游分类里的**够不到的分支**：
    // `:344` 按"消息里有没有 extension"分流成 `invalid_extension` / `illegal_chars`，
    // 而两条 `[ERROR]` 模板（`:588` 与 `:601`）都含 "extension" ⇒ `illegal_chars` 永远不出现。
    const errorCase = await validateRenameJson(parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'b.jpg<t' }] })), '/work', runtime)
    expect(errorCase.conflicts.map((conflict) => conflict.type)).toEqual(['invalid_extension'])
    expect(errorCase.operations).toEqual([])
    const positionError = await validateRenameJson(parseRenameJson(JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'a.txt[vol1].jpg' }] })), '/work', runtime)
    expect(positionError.conflicts.map((conflict) => conflict.type)).toEqual(['invalid_extension'])
    expect(positionError.conflicts[0]?.message).toBe('[ERROR] extension suffix should be placed before .txt: a.txt[vol1].jpg')
  })

  it('says four different sentences when the required input is missing', async () => {
    const runtime = createMemoryRuntime()

    const scan = await runTrename({ action: 'scan' }, runtime)
    expect(scan.message).toBe('Scan requires at least one path.')
    expect(scan.data?.errors).toEqual(['Scan requires at least one path.'])
    expect(scan.data?.failedCount).toBe(1)

    const imported = await runTrename({ action: 'import' }, runtime)
    expect(imported.message).toBe('Import requires JSON content.')
    const validate = await runTrename({ action: 'validate' }, runtime)
    expect(validate.message).toBe('Validate requires JSON content.')
    const rename = await runTrename({ action: 'rename' }, runtime)
    expect(rename.message).toBe('Rename requires JSON content.')

    // 阳性对照：四句互不相同 ⇒ 少接一条腿就会用错文案。
    expect(new Set([scan.message, imported.message, validate.message, rename.message]).size).toBe(4)

    // 阳性对照：坏 JSON 走 `runTrename` 的 catch（`:220-222`）。消息文本由 JSON 解析器给，
    // 所以这里只钉形状（一条 error、failedCount 1、success false），不钉那句英文。
    const broken = await runTrename({ action: 'import', jsonContent: '{oops' }, runtime)
    expect(broken.success).toBe(false)
    expect(broken.data?.errors).toHaveLength(1)
    expect(broken.data?.failedCount).toBe(1)
  })

  it('rejects missing and non-directory scan paths', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')

    const gone = await runTrename({ action: 'scan', path: '/work/nope' }, runtime)
    expect(gone.message).toBe('Path does not exist: /work/nope')

    // 阳性对照：文件不是目录（`:241`）。
    const file = await runTrename({ action: 'scan', path: '/work/a.jpg' }, runtime)
    expect(file.message).toBe('Path is not a directory: /work/a.jpg')
  })

  it('drops empty directories in leak mode and reports zero segments', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/box/note.png')

    const leak = await runTrename({ action: 'scan', path: '/work/box', mode: 'leak' }, runtime)
    expect(leak.success).toBe(true)
    // `:554` 丢掉空目录节点后 root 是空的，`splitRenameJson` 因此一段都不产（`:294`）。
    expect(leak.message).toBe('Scan complete: 0 item(s), 0 segment(s).')
    expect(leak.data?.jsonContent).toBe('')
    expect(leak.data?.segments).toEqual([])

    // 阳性对照：normal 下同一份夹具是"1 个目录 + 1 个文件 + 1 段"。
    const normal = await runTrename({ action: 'scan', path: '/work/box' }, runtime)
    expect(normal.message).toBe('Scan complete: 2 item(s), 1 segment(s).')
  })

  it('applies exclude pattern aliases and raw regexes', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/box/vol (汉化路 1).zip')
    runtime.file('/work/box/plain.zip')

    const aliased = await scanTrenamePaths(['/work/box'], {
      includeHidden: false,
      includeRoot: true,
      excludeExts: [],
      excludePatterns: ['processed'],
      mode: 'normal',
    }, runtime)
    expect(stringifyRenameJson(aliased.renameJson, true)).not.toContain('汉化路')
    expect(stringifyRenameJson(aliased.renameJson, true)).toContain('plain.zip')

    // 阳性对照：`numbered` 是另一条别名（`:147-150`），裸正则也收（`:746` 的那个 `??`）。
    runtime.file('/work/box/01. title.zip')
    const numbered = await scanTrenamePaths(['/work/box'], {
      includeHidden: false,
      includeRoot: true,
      excludeExts: [],
      excludePatterns: ['numbered'],
      mode: 'normal',
    }, runtime)
    expect(stringifyRenameJson(numbered.renameJson, true)).not.toContain('01. title.zip')
    expect(stringifyRenameJson(numbered.renameJson, true)).toContain('plain.zip')
    const raw = await scanTrenamePaths(['/work/box'], {
      includeHidden: false,
      includeRoot: true,
      excludeExts: [],
      excludePatterns: ['^plain'],
      mode: 'normal',
    }, runtime)
    expect(stringifyRenameJson(raw.renameJson, true)).not.toContain('plain.zip')

    // 阳性对照：编译不过的模式被 `safeRegex` 静默丢掉（`:749-755`），不炸整次扫描。
    const bad = await scanTrenamePaths(['/work/box'], {
      includeHidden: false,
      includeRoot: true,
      excludeExts: [],
      excludePatterns: ['('],
      mode: 'normal',
    }, runtime)
    expect(stringifyRenameJson(bad.renameJson, true)).toContain('plain.zip')
  })

  it('undoes the newest active batch and trims history by keepRecent', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')
    runtime.file('/work/b.jpg')

    const empty = await runTrename({ action: 'undo', undoPath: '/undo.json' }, runtime)
    expect(empty.message).toBe('No undo batch available.')
    const unknown = await runTrename({ action: 'undo', batchId: 'zzz', undoPath: '/undo.json' }, runtime)
    expect(unknown.message).toBe('Undo batch not found: zzz')
    const history = await runTrename({ action: 'history', undoPath: '/undo.json' }, runtime)
    expect(history.message).toBe('History loaded: 0 batch(es).')

    // 两批：假 runtime 的 `randomId` 恒为 "batch001"，第二批靠 `batches.length + 1`（`:708`）。
    await runTrename({ action: 'rename', jsonContent: JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'A.jpg' }] }), basePath: '/work', dryRun: false, undoPath: '/undo.json' }, runtime)
    runtime.randomId = () => ''
    await runTrename({ action: 'rename', jsonContent: JSON.stringify({ root: [{ src: 'b.jpg', tgt: 'B.jpg' }] }), basePath: '/work', dryRun: false, undoPath: '/undo.json' }, runtime)

    const listed = await runTrename({ action: 'history', undoPath: '/undo.json', keepRecent: 1 }, runtime)
    expect(listed.message).toBe('History loaded: 2 batch(es).')
    // 阳性对照：`keepRecent` 只切列表，不动"共几批"那句（`:520`）；批次是 unshift 到最前的（`:709`）。
    expect(listed.data?.history.map((batch) => batch.id)).toEqual(['2'])
    expect(listed.data?.history[0]?.operations).toEqual([{ originalPath: '/work/b.jpg', newPath: '/work/B.jpg' }])

    // 不给 batchId ⇒ 取未撤销里时间戳最大的那批（`:489-491`）。假 `now()` 冻在同一个串上，
    // 所以这里钉的是"两批都活跃时它挑的是列表第一条"（sort 稳定 + unshift ⇒ '2'）。
    const latest = await runTrename({ action: 'undo', undoPath: '/undo.json' }, runtime)
    expect(latest.success).toBe(true)
    expect(latest.data?.operationId).toBe('2')
    expect(latest.message).toBe('Undo complete: 1 succeeded, 0 failed.')
  })

  it('执行期新增的失败才算 failedCount，事前跳过的那条不算', async () => {
    const runtime = createMemoryRuntime()
    runtime.file('/work/a.jpg')
    // 两条候选：`a.jpg` 能搬；目录 `d` 在 validate 阶段就被判 source_not_found 跳过
    // （`:355`），它进 conflicts、不进 operations，因此不算失败（`:470` 的判据）。
    const json = JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'A.jpg' }, { src_dir: 'd', tgt_dir: 'D', children: [] }] })
    const result = await runTrename({ action: 'rename', jsonContent: json, basePath: '/work', dryRun: false, undoPath: '/undo.json' }, runtime)
    // `/work/d` 不存在 ⇒ 那条被判 source_not_found 跳过；a.jpg 成功。
    expect(result.success).toBe(true)
    expect(result.message).toBe('Rename complete: 1 succeeded, 0 failed, 1 skipped.')
    expect(result.data?.failedCount).toBe(0)
    expect(runtime.moves).toEqual([['/work/a.jpg', '/work/A.jpg']])
  })
})

describe('trename platform（DI 缝：文件走 node:fs，账本位置必须显式给）', () => {
  it('没配 undoPath 就点名拒绝，不猜一个地方写账本', async () => {
    const runtime = createNodeTrenameRuntime()
    expect(() => runtime.defaultUndoPath()).toThrow(/undoPath/)

    // 两条只读账本的腿收成一句 failure（内核的 catch，`core.ts:220-222`）。
    const undo = await runTrename({ action: 'undo' }, runtime)
    expect(undo.success).toBe(false)
    expect(undo.message).toContain('no undoPath configured')
    const history = await runTrename({ action: 'history' }, runtime)
    expect(history.success).toBe(false)
    expect(history.message).toContain('no undoPath configured')

    // 阳性对照：预演那条腿**不碰账本**（`:433` 在 `recordUndoBatch` 之前就 return），
    // 所以没配 undoPath 也照样出计划。真动手那一侧的"动手之前就拒绝"是接线层的闸门，
    // 判据在 `tests/cli.spec.ts`（`rename --execute` 不带 `--undoPath` 时一个文件都不许动）。
    const planned = await runTrename({ action: 'rename', jsonContent: JSON.stringify({ root: [{ src: 'a.jpg', tgt: 'A.jpg' }] }), basePath: '/work' }, runtime)
    expect(planned.success).toBe(true)
    expect(planned.message).toBe('Rename plan complete: 0 operation(s), 1 skipped.')
  })

  it('落地实现按 node:fs 的口径回报存在性、类型与大小', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'xaihi-trename-platform-')))
    const gallery = join(root, 'gallery')
    const runtime = createNodeTrenameRuntime({ undoPath: join(root, 'undo.json') })
    // 阳性对照：配了就不再抛（上一条与这一条只差那一个 option）。
    expect(runtime.defaultUndoPath()).toBe(join(root, 'undo.json'))

    await writeFile(join(root, 'a.jpg'), 'x'.repeat(7), 'utf8')

    const missing = await runtime.pathInfo(gallery)
    expect(missing.exists).toBe(false)
    expect(missing.isFile).toBe(false)
    expect(missing.isDirectory).toBe(false)
    // 阳性对照：缺席那条是**五个零**，不是 undefined（`:50`）。
    expect([missing.size, missing.createdMs, missing.modifiedMs]).toEqual([0, 0, 0])
    expect(missing.path).toBe(gallery)

    const file = await runtime.pathInfo(join(root, 'a.jpg'))
    expect(file.exists).toBe(true)
    expect(file.isFile).toBe(true)
    expect(file.isDirectory).toBe(false)
    expect(file.size).toBe(7)

    // 目录建出来再列（上一条靠的就是它还不存在）。
    await mkdir(gallery, { recursive: true })

    const listed = await runtime.listDir(root)
    expect(listed.map((entry) => entry.name).sort()).toEqual(['a.jpg', 'gallery'])
    const byName = new Map(listed.map((entry) => [entry.name, entry]))
    expect(byName.get('a.jpg')?.size).toBe(7)
    // 阳性对照：目录的 size 记 0（`:65` 那个三元），不是 stat 的块数。
    expect(byName.get('gallery')?.isDirectory).toBe(true)
    expect(byName.get('gallery')?.size).toBe(0)

    // 纯算术那三颗直接对接 node:path。
    expect(runtime.dirname(join(root, 'a.jpg'))).toBe(root)
    expect(runtime.basename(join(root, 'a.jpg'))).toBe('a.jpg')
    expect(runtime.join('a', 'b')).toBe(join('a', 'b'))
    expect(runtime.resolve('.')).toBe(process.cwd())
    expect(runtime.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(runtime.randomId()).toHaveLength(36)
  })
})

describe('trename core 的逐字移植判据', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/core.ts', import.meta.url)), 'utf8')
  // 剥掉注释之后再扫（判据与 `scripts/check-brand.mjs` 同一条理由：注释是"出处位"，
  // 里面本来就写着上游那个包叫什么）。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')

  it('内核除那条 import 之外不认得任何别的东西', () => {
    const imports = code.split('\n').filter((line) => /^\s*(import|export \{)/.test(line) && /from ['"]/.test(line))
    // 期望值手写：基线 `core.ts:1` 只有这一条 import，移植后仍然只有这一条。
    expect(imports).toEqual([`import type { NodeRunEvent, NodeRunResult } from './contract.ts'`])
    // 零 I/O 这条不变量（内核只认 `TrenameRuntime` 那 13 个方法）。旧品牌与仓外依赖那两件事
    // 由 `imports` 那条精确等式与 `scripts/check-brand.mjs` 各自负责，这里不重复第三份判据。
    for (const forbidden of ['node:fs', 'node:path', 'node:child_process', 'node:crypto']) {
      expect(code.includes(forbidden)).toBe(false)
    }
    // 阳性对照：把"违规"真的写进一份副本，上面那把尺必须抓得到。
    const mutated = `${code}\nimport { readFileSync } from "node:fs"\n`
    expect(mutated.split('\n').filter((line) => /^\s*(import|export \{)/.test(line) && /from ['"]/.test(line)).length).toBe(2)
    expect(mutated.includes('node:fs')).toBe(true)

    // 行数钉在这里：基线 838 行 ⇒ 本文件 = 56 行头部注释 + 空行 + 那条 import +
    // 基线第 2..838 行 = **895 行 / split 出 896 段**，净增 57。头部再加一行就要同步改这条
    // （那是有意的摩擦：注释漂了要让有人看见）。
    expect(source.split('\n')).toHaveLength(896)
    expect(source.split('\n').filter((line) => line.startsWith('export '))).toHaveLength(30)
  })
})

type MemoryItem = { type: 'dir' | 'file'; text: string; createdMs: number; modifiedMs: number }

/** 基线 `core.test.ts:80-170` 那份内存 runtime，逐字搬来（含它自己的三个假路径函数）。 */
function createMemoryRuntime() {
  const items: Record<string, MemoryItem> = { '/': dirItem() }
  const runtime: TrenameRuntime & {
    moves: string[][]
    file: (path: string, text?: string) => void
    randomId: () => string
  } = {
    moves: [],
    file(path: string, text = '') {
      ensureDir(dirname(path))
      items[normalize(path)] = { type: 'file', text, createdMs: 1_700_000_000_000, modifiedMs: 1_700_000_000_000 }
    },
    async pathInfo(path): Promise<TrenamePathInfo> {
      const item = items[normalize(path)]
      return {
        path: normalize(path),
        exists: Boolean(item),
        isFile: item?.type === 'file',
        isDirectory: item?.type === 'dir',
        size: item?.text.length ?? 0,
        createdMs: item?.createdMs ?? 0,
        modifiedMs: item?.modifiedMs ?? 0,
      }
    },
    async listDir(path): Promise<TrenameDirEntry[]> {
      const root = normalize(path)
      return Object.entries(items)
        .filter(([itemPath]) => itemPath !== root && dirname(itemPath) === root)
        .map(([itemPath, item]) => ({ name: basename(itemPath), path: itemPath, isFile: item.type === 'file', isDirectory: item.type === 'dir', size: item.text.length }))
    },
    async readText(path) {
      const item = items[normalize(path)]
      if (!item) throw new Error(`missing file: ${path}`)
      return item.text
    },
    async writeText(path, content) {
      runtime.file(path, content)
    },
    async ensureDir(path) {
      ensureDir(path)
    },
    async movePath(source, target) {
      runtime.moves.push([normalize(source), normalize(target)])
      const from = normalize(source)
      const to = normalize(target)
      const moving = Object.entries(items).filter(([path]) => path === from || path.startsWith(`${from}/`))
      if (!moving.length) throw new Error(`missing source: ${source}`)
      for (const [path] of moving) delete items[path]
      for (const [path, item] of moving) items[to + path.slice(from.length)] = { ...item }
    },
    join: (...parts) => normalize(parts.filter(Boolean).join('/')),
    dirname,
    basename,
    resolve: normalize,
    defaultUndoPath: () => '/undo.json',
    now: () => '2026-01-01T00:00:00.000Z',
    randomId: () => 'batch001',
  }

  function ensureDir(path: string) {
    const normalized = normalize(path)
    if (items[normalized]) return
    ensureDir(dirname(normalized))
    items[normalized] = dirItem()
  }

  return runtime
}

function dirItem(): MemoryItem {
  return { type: 'dir', text: '', createdMs: 1_700_000_000_000, modifiedMs: 1_700_000_000_000 }
}

function normalize(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized || '/'
}

function dirname(path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

function basename(path: string): string {
  const normalized = normalize(path)
  if (normalized === '/') return ''
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}
