/**
 * classq 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组四条**逐条抄自上游** `packages/nodes/classq/src/core.test.ts`（tag `noxide`，
 *   109 行）的同名用例，连它那份 `fakeRuntime`（`:84-99`）/ `infoFor`（`:101-109`）
 *   形状一起搬（假 join / dirname / basename / relative 的规则都保留，
 *   包括 `dirname` 兜底成 `.` 那条）。
 * - 第 2 组钉**上游没有用例覆盖**的行为，出处逐条点名：
 *   `keyword_folder_missing`（`core.ts:134`）、`root_not_directory`（`core.ts:127-129`）、
 *   没有根目录那句（`core.ts:96`）、同父关键词目录去重（`core.ts:138-143`）、
 *   三条同级排除规则（`core.ts:149-152`，含"名字含关键词的**文件**不被排除"与
 *   "既不是文件也不是目录的条目静默跳过"两半边）、
 *   `existingPolicy: "skip"` 只换 reason 不换动作（`core.ts:201`）、
 *   `copy` 落 `copied` 状态（`core.ts:111`）、单条搬运抛错记成 `error` 而不炸整轮
 *   （`core.ts:112-114`）、结论句按"搬成了几件"计（`core.ts:116`）、
 *   `success` 只看 `errorCount`（`core.ts:226` 配 `data()` 里只数 `status === "error"` 的口径）、
 *   `errors` 行的 `源路径: reason` 格式（`core.ts:206`）、
 *   `normalizeClassqInput` 的三路合并去重与默认词（`core.ts:79-91`）。
 * - 第 3 组钉 `platform.ts` 在真文件树上的枚举/搬运语义（符号链接、move 与 copy 两条腿、
 *   预演不动文件、关键词大小写、多根顺序），期望值照 fixture 的构造手写。
 * - 第 4 组只钉"清单合法"这一颗钉子；词表逐字对照与正控在 `tests/definition.spec.ts`。
 *
 * 每条尺都配阳性对照，写在同一条用例里。
 *
 * @module xaihi-classq/tests/core
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { ClassqDirEntry, ClassqPathInfo, ClassqRuntime, ClassqTransferMode } from '../src/core.ts'
import { findKeywordFolders, normalizeClassqInput, runClassq } from '../src/core.ts'
import { createNodeClassqRuntime } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
  process.exitCode = 0
})

describe('classq core（上游 core.test.ts 逐条搬来）', () => {
  it('递归找到关键词目录', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [{ name: 'series', path: '/root/series', isFile: false, isDirectory: true }],
        '/root/series': [{ name: 'already', path: '/root/series/already', isFile: false, isDirectory: true }],
        '/root/series/already': [],
      },
    })

    const found = await findKeywordFolders('/root', 'already', runtime)

    expect(found.map((item) => item.path)).toEqual(['/root/series/already'])
  })

  it('把同级项规划进 wait 目录', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
          { name: 'extra', path: '/root/extra', isFile: false, isDirectory: true },
        ],
        '/root/already': [],
        '/root/extra': [],
      },
    })

    const result = await runClassq({ action: 'plan', paths: ['/root'], keyword: 'already', waitKeyword: 'wait' }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.keywordCount).toBe(1)
    expect(result.data?.readyCount).toBe(2)
    expect(result.data?.items.map((item) => [item.stage, item.sourceName, item.targetRelative])).toEqual([
      ['keyword', 'already', 'wait'],
      ['wait', 'pending.zip', 'wait/pending.zip'],
      ['wait', 'extra', 'wait/extra'],
    ])
  })

  it('已存在的 wait 目标报成冲突', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      existing: new Set(['/root/wait/pending.zip']),
    })

    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)

    expect(result.data?.conflictCount).toBe(1)
    expect(result.data?.items.find((item) => item.status === 'conflict')?.reason).toBe('target_exists')
  })

  it('真实执行时才搬 wait 项', async () => {
    const transfers: Array<[string, string, ClassqTransferMode]> = []
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      transfers,
    })

    const result = await runClassq({ action: 'classify', paths: ['/root'], dryRun: false }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.movedCount).toBe(1)
    expect(transfers).toEqual([['/root/pending.zip', '/root/wait/pending.zip', 'move']])
  })
})

describe('classq core（上游没写用例的行为，出处逐条点名）', () => {
  it('根目录里找不到关键词目录 ⇒ keyword_folder_missing 记成错误，而不是静默空计划（core.ts:134）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [{ name: 'misc', path: '/root/misc', isFile: false, isDirectory: true }],
        '/root/misc': [],
      },
    })

    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toBe('ClassQ planned 1 item(s).')
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]?.reason).toBe('keyword_folder_missing')
    // `errors` 行的格式是 `源路径: reason`（core.ts:206）；errorItem 把 sourcePath 记成根目录本身。
    expect(result.data?.errors).toEqual(['/root: keyword_folder_missing'])

    // 阳性对照：换一个真存在的关键词就不该有错误项。
    const found = await runClassq({ action: 'plan', paths: ['/root'], keyword: 'misc' }, runtime)
    expect(found.success).toBe(true)
    expect(found.data?.errorCount).toBe(0)
    expect(found.data?.keywordCount).toBe(1)
  })

  it('根目录不是目录 ⇒ root_not_directory（core.ts:127-129）', async () => {
    const runtime = fakeRuntime({ dirs: {} })
    const result = await runClassq({ action: 'plan', paths: ['/root/missing'] }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.items[0]?.reason).toBe('root_not_directory')

    // 阳性对照：一个真存在的根不产错误项（哪怕没有可搬的东西）。
    const ok = fakeRuntime({
      dirs: {
        '/root': [{ name: 'already', path: '/root/already', isFile: false, isDirectory: true }],
        '/root/already': [],
      },
    })
    expect((await runClassq({ action: 'plan', paths: ['/root'] }, ok)).data?.errorCount).toBe(0)
  })

  it('一个根目录都没有时由内核说那句话（core.ts:96），并且一次搬运都不发', async () => {
    const transfers: Array<[string, string, ClassqTransferMode]> = []
    const runtime = fakeRuntime({ dirs: {}, transfers })
    const result = await runClassq({ action: 'classify', paths: [], dryRun: false }, runtime)
    expect(result.success).toBe(false)
    expect(result.message).toBe('At least one root directory is required.')
    expect(transfers).toEqual([])

    // 阳性对照：只给空白也算"没给"，同一条拒绝。
    const blank = await runClassq({ action: 'plan', path: '   ' }, fakeRuntime({ dirs: {} }))
    expect(blank.message).toBe('At least one root directory is required.')
  })

  it('同父的两个关键词目录只产一条 keyword 项（core.ts:138-143）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [{ name: 'sets', path: '/root/sets', isFile: false, isDirectory: true }],
        '/root/sets': [
          { name: 'already', path: '/root/sets/already', isFile: false, isDirectory: true },
          { name: 'already-old', path: '/root/sets/already-old', isFile: false, isDirectory: true },
        ],
        '/root/sets/already': [],
        '/root/sets/already-old': [],
      },
    })

    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)
    // 两个都被 findKeywordFolders 找到，但父目录去重后只记第一条。
    expect(result.data?.keywordCount).toBe(1)
    expect(result.data?.items.map((item) => item.sourceName)).toEqual(['already'])
    expect(result.data?.waitCount).toBe(0)

    // 阳性对照：同父再加一个不含关键词的文件，它就产出一条 wait 项。
    const withFile = fakeRuntime({
      dirs: {
        '/root': [{ name: 'sets', path: '/root/sets', isFile: false, isDirectory: true }],
        '/root/sets': [
          { name: 'already', path: '/root/sets/already', isFile: false, isDirectory: true },
          { name: 'already-old', path: '/root/sets/already-old', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/sets/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/sets/already': [],
        '/root/sets/already-old': [],
      },
    })
    const planned = await runClassq({ action: 'plan', paths: ['/root'] }, withFile)
    expect(planned.data?.keywordCount).toBe(1)
    expect(planned.data?.readyCount).toBe(1)
    expect(planned.data?.items[1]?.targetRelative).toBe('sets/wait/pending.zip')
  })

  it('三条同级排除里"名字含关键词"只管目录，不管同名文件（core.ts:149-151）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'already-notes.txt', path: '/root/already-notes.txt', isFile: true, isDirectory: false },
          { name: 'already-old', path: '/root/already-old', isFile: false, isDirectory: true },
        ],
        '/root/already': [],
        '/root/already-old': [],
      },
    })

    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)
    expect(result.data?.items.map((item) => [item.stage, item.sourceName])).toEqual([
      ['keyword', 'already'],
      ['wait', 'already-notes.txt'],
    ])
    expect(result.data?.waitCount).toBe(1)

    // 阳性对照：`already-old` 是**目录**且名字含关键词 ⇒ 被排除（就是上面 fixture 的第三条）。
    expect(result.data?.items.some((item) => item.sourceName === 'already-old')).toBe(false)
  })

  it('既不是文件也不是目录的条目被静默跳过（core.ts:152）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          // `readdir(withFileTypes)` 下符号链接就是这一对 false（platform.ts 的 Dirent 语义）。
          { name: 'link.zip', path: '/root/link.zip', isFile: false, isDirectory: false },
        ],
        '/root/already': [],
      },
    })
    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)
    expect(result.data?.items.map((item) => item.sourceName)).toEqual(['already'])

    // 阳性对照：同一条位置换成 isFile: true 就会被规划。
    const asFile = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'real.zip', path: '/root/real.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
    })
    expect((await runClassq({ action: 'plan', paths: ['/root'] }, asFile)).data?.readyCount).toBe(1)
  })

  it('existingPolicy=skip 只换 reason，动作照旧不动手（core.ts:201）', async () => {
    const transfers: Array<[string, string, ClassqTransferMode]> = []
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      existing: new Set(['/root/wait/pending.zip']),
      transfers,
    })

    const result = await runClassq({ action: 'classify', paths: ['/root'], existingPolicy: 'skip', dryRun: false }, runtime)
    expect(result.data?.conflictCount).toBe(1)
    expect(result.data?.items.find((item) => item.status === 'conflict')?.reason).toBe('target_exists_skip')
    expect(result.data?.errors).toEqual(['/root/pending.zip: target_exists_skip'])
    // "跳过"在上游只是报告口径，不是第二条实现：一条都没搬。
    expect(transfers).toEqual([])
    expect(result.data?.movedCount).toBe(0)

    // 阳性对照：同一份 fixture 换成默认 merge 时 reason 是 target_exists。
    const mergeRuntime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      existing: new Set(['/root/wait/pending.zip']),
    })
    const merged = await runClassq({ action: 'plan', paths: ['/root'] }, mergeRuntime)
    expect(merged.data?.items.find((item) => item.status === 'conflict')?.reason).toBe('target_exists')
  })

  it('copy 模式落在 copied 而不是 moved（core.ts:111）', async () => {
    const transfers: Array<[string, string, ClassqTransferMode]> = []
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      transfers,
    })

    const result = await runClassq({ action: 'classify', paths: ['/root'], transferMode: 'copy', dryRun: false }, runtime)
    expect(transfers).toEqual([['/root/pending.zip', '/root/wait/pending.zip', 'copy']])
    expect(result.data?.copiedCount).toBe(1)
    expect(result.data?.movedCount).toBe(0)
    expect(result.message).toBe('ClassQ applied 1 transfer(s).')

    // 阳性对照：同一份 fixture 用默认 transferMode 时记的是 move。
    const moveTransfers: Array<[string, string, ClassqTransferMode]> = []
    const moveRuntime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      transfers: moveTransfers,
    })
    expect((await runClassq({ action: 'classify', paths: ['/root'], dryRun: false }, moveRuntime)).data?.movedCount).toBe(1)
    expect(moveTransfers).toEqual([['/root/pending.zip', '/root/wait/pending.zip', 'move']])
  })

  it('单条搬运抛错记成那一条的 error，不炸整轮（core.ts:112-116）', async () => {
    const transfers: Array<[string, string, ClassqTransferMode]> = []
    const runtime = faultRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'bad.zip', path: '/root/bad.zip', isFile: true, isDirectory: false },
          { name: 'good.zip', path: '/root/good.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      transfers,
      failOnSource: '/root/bad.zip',
    })

    const result = await runClassq({ action: 'classify', paths: ['/root'], dryRun: false }, runtime)
    expect(result.success).toBe(false)
    // 结论句仍按"搬成了几件"来报（core.ts:116），错的这件不进计数。
    expect(result.message).toBe('ClassQ applied 1 transfer(s).')
    expect(result.data?.movedCount).toBe(1)
    expect(result.data?.errorCount).toBe(1)
    const failed = result.data?.items.find((item) => item.status === 'error')
    expect(failed?.reason).toBe('boom')
    expect(failed?.sourcePath).toBe('/root/bad.zip')

    // 阳性对照：不注入故障时同一份 fixture 是全绿。
    const cleanRuntime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'bad.zip', path: '/root/bad.zip', isFile: true, isDirectory: false },
          { name: 'good.zip', path: '/root/good.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
    })
    const allMoved = await runClassq({ action: 'classify', paths: ['/root'], dryRun: false }, cleanRuntime)
    expect(allMoved.success).toBe(true)
    expect(allMoved.data?.movedCount).toBe(2)
  })

  it('有冲突仍然报成功，有错误才报失败（core.ts:226 配 data() 只数 error 的口径）', async () => {
    const runtime = fakeRuntime({
      dirs: {
        '/root': [
          { name: 'already', path: '/root/already', isFile: false, isDirectory: true },
          { name: 'pending.zip', path: '/root/pending.zip', isFile: true, isDirectory: false },
        ],
        '/root/already': [],
      },
      existing: new Set(['/root/wait/pending.zip']),
    })
    const result = await runClassq({ action: 'plan', paths: ['/root'] }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.errorCount).toBe(0)
    expect(result.data?.conflictCount).toBe(1)
    // conflict 同时进 `errors` 列表（core.ts:206 那条 filter 含 conflict），读得回来。
    expect(result.data?.errors).toEqual(['/root/pending.zip: target_exists'])

    // 阳性对照：把冲突换成真正的错误项（根目录不存在）就报失败。
    const failing = await runClassq({ action: 'plan', paths: ['/root/nope'] }, runtime)
    expect(failing.success).toBe(false)
    expect(failing.data?.errorCount).toBe(1)
  })

  it('normalizeClassqInput：三路根目录合并去重，空白落回默认词（core.ts:79-91）', () => {
    const normalized = normalizeClassqInput({
      path: ' /a ',
      paths: ['/a', '/b', '  '],
      listText: '/b, /c\n/d',
      keyword: '   ',
      waitKeyword: '',
    })
    expect(normalized.paths).toEqual(['/a', '/b', '/c', '/d'])
    expect(normalized.path).toBe('/a')
    expect(normalized.keyword).toBe('already')
    expect(normalized.waitKeyword).toBe('wait')
    expect(normalized.action).toBe('plan')
    expect(normalized.transferMode).toBe('move')
    expect(normalized.existingPolicy).toBe('merge')
    expect(normalized.dryRun).toBe(true)
    // listText 原样留着（内核不"清洗"它，切分发生在 parseList 里）。
    expect(normalized.listText).toBe('/b, /c\n/d')

    // 阳性对照：显式给了 false 就不许被默认值吃回去。
    expect(normalizeClassqInput({ dryRun: false, action: 'classify', transferMode: 'copy', existingPolicy: 'skip' }).dryRun).toBe(false)
    expect(normalizeClassqInput({ keyword: 'done', waitKeyword: 'later' })).toMatchObject({ keyword: 'done', waitKeyword: 'later' })
  })
})

describe('classq platform（真文件树上的枚举与搬运语义）', () => {
  it('符号链接既不算文件也不算目录 ⇒ 既不规划也不下钻', async () => {
    const root = await tempRoot('symlink')
    const linked = join(root, 'outside')
    await mkdir(join(root, 'already'))
    await mkdir(linked)
    await writeFile(join(root, 'pending.zip'), 'pending', 'utf8')
    await writeFile(join(linked, 'inner.txt'), 'inner', 'utf8')
    await symlink(join(root, 'pending.zip'), join(root, 'link.zip'), 'file')
    await symlink(linked, join(root, 'link-dir'), 'dir')

    const result = await runClassq({ action: 'plan', paths: [root] }, createNodeClassqRuntime())
    const sources = (result.data?.items ?? []).map((item) => item.sourcePath)
    expect(sources).toContain(join(root, 'pending.zip'))
    // 阳性对照：两条软链条目不许出现在计划里（`readdir(withFileTypes)` 的 Dirent 两者都不算）。
    expect(sources).not.toContain(join(root, 'link.zip'))
    expect(sources).not.toContain(join(root, 'link-dir'))
    // 软链指向的那个真文件也不该被顺时下钻枚举进来。
    expect(sources).not.toContain(join(linked, 'inner.txt'))
  })

  it('预演一个字节都不动；关掉预演才 move（rename），源路径消失', async () => {
    const root = await tempRoot('live-move')
    await mkdir(join(root, 'already'))
    const one = join(root, 'pending.zip')
    await writeFile(one, 'pending', 'utf8')
    const runtime = createNodeClassqRuntime()

    const dry = await runClassq({ action: 'classify', paths: [root], dryRun: true }, runtime)
    expect(dry.data?.movedCount).toBe(0)
    expect(existsSync(one)).toBe(true)
    expect(existsSync(join(root, 'wait'))).toBe(false)

    const live = await runClassq({ action: 'classify', paths: [root], dryRun: false }, runtime)
    expect(live.success).toBe(true)
    expect(live.data?.movedCount).toBe(1)
    expect(existsSync(one)).toBe(false)
    expect(readFileSync(join(root, 'wait', 'pending.zip'), 'utf8')).toBe('pending')
    // wait 目录是内核经 ensureDir 建的，不是人手摆的。
    expect(existsSync(join(root, 'wait'))).toBe(true)
  })

  it('copy 模式留源；目标已存在时报冲突而不去撞 cp 的 errorOnExist', async () => {
    const root = await tempRoot('copy-conflict')
    const wait = join(root, 'wait')
    await mkdir(join(root, 'already'))
    await mkdir(wait)
    const one = join(root, 'pending.zip')
    await writeFile(one, 'new', 'utf8')
    await writeFile(join(wait, 'pending.zip'), 'old', 'utf8')

    const result = await runClassq({ action: 'classify', paths: [root], transferMode: 'copy', dryRun: false }, createNodeClassqRuntime())
    expect(result.success).toBe(true)
    expect(result.data?.conflictCount).toBe(1)
    expect(result.data?.copiedCount).toBe(0)
    // 阳性对照：冲突那件既不搬也不覆盖——目标仍是 old，源仍在原位。
    expect(readFileSync(join(wait, 'pending.zip'), 'utf8')).toBe('old')
    expect(existsSync(one)).toBe(true)

    // 另一侧对照：目标空着时 copy 真的留源。
    const fresh = await tempRoot('copy-fresh')
    await mkdir(join(fresh, 'already'))
    const src = join(fresh, 'pending.zip')
    await writeFile(src, 'data', 'utf8')
    const copied = await runClassq({ action: 'classify', paths: [fresh], transferMode: 'copy', dryRun: false }, createNodeClassqRuntime())
    expect(copied.data?.copiedCount).toBe(1)
    expect(existsSync(src)).toBe(true)
    expect(readFileSync(join(fresh, 'wait', 'pending.zip'), 'utf8')).toBe('data')
  })

  it('关键词目录按目录名子串匹配，大小写不敏感（core.ts:165）', async () => {
    const root = await tempRoot('case')
    await mkdir(join(root, 'ALREADY-read'))
    await writeFile(join(root, 'pending.zip'), 'p', 'utf8')
    const result = await runClassq({ action: 'plan', paths: [root], keyword: 'already' }, createNodeClassqRuntime())
    expect(result.data?.keywordCount).toBe(1)

    // 阳性对照：换一个不沾边的关键词就一条都找不到，并记成 keyword_folder_missing。
    const none = await runClassq({ action: 'plan', paths: [root], keyword: 'later' }, createNodeClassqRuntime())
    expect(none.data?.keywordCount).toBe(0)
    expect(none.data?.items[0]?.reason).toBe('keyword_folder_missing')
  })

  it('多个根目录各自成段，rootCount 数的是根不是条目（core.ts:125 那个循环不排序）', async () => {
    const first = await tempRoot('multi-a')
    const second = await tempRoot('multi-b')
    await mkdir(join(first, 'already'))
    await mkdir(join(second, 'already'))
    await writeFile(join(first, 'one.zip'), '1', 'utf8')
    await writeFile(join(second, 'two.zip'), '2', 'utf8')

    const result = await runClassq({ action: 'plan', listText: `${first}\n${second}` }, createNodeClassqRuntime())
    expect(result.data?.rootCount).toBe(2)
    expect(result.data?.keywordCount).toBe(2)
    expect(result.data?.readyCount).toBe(2)
    expect(result.data?.items.map((item) => item.stage)).toEqual(['keyword', 'wait', 'keyword', 'wait'])
    // 预演没动文件：第一个根里两个原始条目都还在，wait 目录也没被建出来。
    expect((await readdir(first)).sort()).toEqual(['already', 'one.zip'])
    expect(existsSync(join(first, 'one.zip'))).toBe(true)
    expect(existsSync(join(first, 'wait'))).toBe(false)

    // 阳性对照：listText 里的逗号也算分隔符（core.ts:238 的 parseList），两条根合成一段计划。
    const joined = await runClassq({ action: 'plan', listText: `${first},${second}` }, createNodeClassqRuntime())
    expect(joined.data?.rootCount).toBe(2)
  })
})

describe('classq 清单', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const result = validateNodeDefinition(ownNode())
    expect(result.ok ? true : result.errors).toBe(true)
  })
})

/** 上游 `core.test.ts:84-99` 那份 fakeRuntime 逐字搬来（假路径规则与假 join/dirname 都保留）。 */
function fakeRuntime (options: {
  dirs: Record<string, ClassqDirEntry[]>
  existing?: Set<string>
  transfers?: Array<[string, string, ClassqTransferMode]>
}): ClassqRuntime {
  return {
    pathInfo: async (path) => infoFor(path, options.dirs, options.existing ?? new Set()),
    listDir: async (path) => options.dirs[path] ?? [],
    ensureDir: async () => undefined,
    transfer: async (source, target, mode) => { options.transfers?.push([source, target, mode]) },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (path) => path.replace(/[/\\][^/\\]+$/, '') || '.',
    basename: (path) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
    relative: (from, to) => to.startsWith(`${from}/`) ? to.slice(from.length + 1) : to,
  }
}

/**
 * 同一个假缝，只多一处故障注入：`transfer` 撞上 `failOnSource` 就抛。
 * 单独一个函数是为了让上面那份保持与上游**逐字一致**（上游没有故障注入这件事）。
 */
function faultRuntime (options: {
  dirs: Record<string, ClassqDirEntry[]>
  existing?: Set<string>
  transfers?: Array<[string, string, ClassqTransferMode]>
  failOnSource: string
}): ClassqRuntime {
  const base = fakeRuntime(options)
  return {
    ...base,
    transfer: async (source, target, mode) => {
      if (source === options.failOnSource) throw new Error('boom')
      options.transfers?.push([source, target, mode])
    },
  }
}

/** 上游 `core.test.ts:101-109` 那份 infoFor 逐字搬来。 */
function infoFor (path: string, dirs: Record<string, ClassqDirEntry[]>, existing: Set<string>): ClassqPathInfo {
  if (dirs[path]) return { path, exists: true, isFile: false, isDirectory: true }
  if (existing.has(path)) return { path, exists: true, isFile: true, isDirectory: false }
  for (const entries of Object.values(dirs)) {
    const entry = entries.find((item) => item.path === path)
    if (entry) return { path, exists: true, isFile: entry.isFile, isDirectory: entry.isDirectory }
  }
  return { path, exists: false, isFile: false, isDirectory: false }
}

async function tempRoot (label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `xaihi-classq-${label}-`))
  tempRoots.push(root)
  return root
}

function ownNode (): unknown {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }
  return pkg.xaihi?.node ?? {}
}
