/**
 * crashu 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源：
 * - 第 1 组逐条抄自上游 `packages/nodes/crashu/src/core.test.ts`（tag `noxide`，107 行）
 *   的五个用例，连它的 `createMemoryRuntime` 与自带的 `join` / `dirname` / `basename`
 *   假实现一起搬（`"circle project rj123456"`、`["Circle Project CN", "Other"]`、
 *   `"move:/src/Circle Project->/dest/Circle Project CN/Circle Project"`、
 *   `"/dest/folder_pairs.json"` 全是上游手写的常量）。
 * - 第 2、3 组钉上游 `core.test.ts` **没有**覆盖的分支。这些行为的真源是上游 core.ts 的
 *   行号，逐条写在用例注释里：`normalizeCrashuInput`（`:107-124`）、`clamp01`（`:475-477`）、
 *   `buildCrashuPlan` 的三种 skip（`:214-254`）、`resolveCrashuTargetPath` 的 rename 后缀
 *   （`:372-378`）、`sanitizePathSegment`（`:462-465`）、`bestTargetMatch` 并列取首个
 *   （`:381-390`）、`executePlan` 的 overwrite 先删（`:334-336`）、`failure()` 的
 *   `errorCount: 1`（`:458-460`）。
 * - 相似度那两个数是**手推**的，推导写在用例里，不由被测函数算出来。
 *
 * 每条尺都配阳性对照（"关掉防御就立刻红"），写在同一条用例里。
 *
 * @module xaihi-crashu/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bindInputs, dangerFor, parametersFor, validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { CrashuDirEntry, CrashuPathInfo, CrashuRuntime } from '../src/core.ts'
import {
  buildCrashuPlan,
  compareFolderNames,
  loadTargets,
  matchSimilarFolders,
  normalizeCrashuInput,
  normalizeFolderName,
  runCrashu,
} from '../src/core.ts'

describe('crashu core（上游 core.test.ts 逐条搬来）', () => {
  // 上游 `core.test.ts:5-10`。
  it('normalizes folder names and compares aliases', () => {
    expect(normalizeFolderName('Circle - Project [RJ123456]')).toBe('circle project rj123456')
    const comparison = compareFolderNames('Circle Project [Alt Name]', 'Alt Name')
    expect(comparison.similarity).toBe(1)
    expect(comparison.matchDim).toBe('exact')

    // 阳性对照：同一对名字换成无关目标就不许是 exact（`extractNameAliases` 一旦把
    // 方括号里的别名漏掉，上面那两条就会靠"整串 bigram 很像"蒙过去，这里把它拆开看）。
    const miss = compareFolderNames('Circle Project [Alt Name]', 'Unrelated Trash Folder')
    expect(miss.similarity).toBeLessThan(1)
    expect(miss.matchDim).not.toBe('exact')
  })

  // 上游 `core.test.ts:12-19`。
  it('loads target child directories from target path', async () => {
    const runtime = createMemoryRuntime({
      '/src': ['Circle Project'],
      '/targets': ['Circle Project CN', 'Other'],
    })
    const targets = await loadTargets({ targetPath: '/targets', targetNames: [] }, runtime)
    expect(targets.map((item) => item.name)).toEqual(['Circle Project CN', 'Other'])

    // 阳性对照 + 上游 `core.ts:187` 的另一条分支：targetPath 不可用时落回 targetNames，
    // 而**那条分支不排序**（只有目录那份排）。给一个乱序名单，排了序就红。
    const fromNames = await loadTargets({ targetPath: '/missing', targetNames: ['Zeta', 'Alpha'] }, runtime)
    expect(fromNames.map((item) => item.name)).toEqual(['Zeta', 'Alpha'])
  })

  // 上游 `core.test.ts:21-27`（阈值 0.6、命中一条、targetFullpath 是那个假路径）。
  it('matches source folders above threshold', () => {
    const sources = [{ name: 'Circle Project', path: '/src/Circle Project', sourceRoot: '/src' }]
    const targets = [{ name: 'Circle Project CN', path: '/targets/Circle Project CN' }]
    const matches = matchSimilarFolders(sources, targets, 0.6)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.targetFullpath).toBe('/targets/Circle Project CN')

    // 手推的那个分数（不由被测函数算）：别名只有一个，源 `circle project`、目标
    // `circle project cn`。
    //   exact = 0；
    //   token = 2·2/(2+3) = 0.8（共有 token 是 `circle`、`project`）；
    //   bigram = 去空格后 12 个 gram vs 14 个 gram，12 个全共有 ⇒ 2·12/(12+14) = 24/26。
    // 三者取最大 ⇒ 24/26，且 token < bigram ⇒ matchDim 走 `name`（`core.ts:299`）。
    expect(matches[0]!.similarity).toBe(24 / 26)
    expect(matches[0]!.matchDim).toBe('name')
    expect(matches[0]!.matchSrc).toBe('circle project')
    expect(matches[0]!.matchTgt).toBe('circle project cn')

    // 阳性对照：阈值抬到 0.93（严格大于 24/26 ≈ 0.9231）就必须一条都不中；
    // `matchSimilarFolders` 的判据是 `best.similarity < threshold` 才 continue（`:194`）。
    expect(matchSimilarFolders(sources, targets, 0.93)).toHaveLength(0)
  })

  // 上游 `core.test.ts:29-47`。
  it('plans and moves matched folders', async () => {
    const runtime = createMemoryRuntime({
      '/src': ['Circle Project'],
      '/targets': ['Circle Project CN'],
      '/dest': [],
    })
    const result = await runCrashu({
      action: 'move',
      sourcePaths: ['/src'],
      targetPath: '/targets',
      destinationPath: '/dest',
      autoMove: true,
    }, runtime)

    expect(result.success).toBe(true)
    expect(result.data?.movedCount).toBe(1)
    expect(result.data?.pairsFile).toBe('/dest/folder_pairs.json')
    expect(runtime.operations).toContain('move:/src/Circle Project->/dest/Circle Project CN/Circle Project')
    // 消息模板手抄上游 `core.ts:354`。
    expect(result.message).toBe('Crashu completed: 1 matched, 1 moved, 0 error(s).')
    // 配对文件真的写到目的地（假 runtime 把写盘记成 `write:<path>:<长度>`，`:86`）。
    expect(runtime.operations.some((line) => line.startsWith('write:/dest/folder_pairs.json:'))).toBe(true)

    // 阳性对照：同一份夹具把 `autoMove` 关掉，`core.ts:148` 那四条判据成立一条就必须只出计划。
    const idle = createMemoryRuntime({
      '/src': ['Circle Project'],
      '/targets': ['Circle Project CN'],
      '/dest': [],
    })
    const planned = await runCrashu({
      action: 'move',
      sourcePaths: ['/src'],
      targetPath: '/targets',
      destinationPath: '/dest',
      autoMove: false,
    }, idle)
    expect(planned.data?.movedCount).toBe(0)
    expect(idle.operations.some((line) => line.startsWith('move:'))).toBe(false)
    // plan 那条消息是 `core.ts:151` 的第二个分支（不是 scan 分支）。
    expect(planned.message).toBe('Plan generated: 1 move(s).')
  })

  // 上游 `core.test.ts:49-54`。
  it('reports validation errors', async () => {
    const runtime = createMemoryRuntime({})
    const result = await runCrashu({ action: 'scan', sourcePaths: ['/missing'], targetNames: ['x'] }, runtime)
    expect(result.success).toBe(false)
    expect(result.data?.errorCount).toBe(1)
    // 上游用例只数了 errorCount；这句话本身在 `core.ts:137`，一起钉住才认得出是哪条闸门。
    expect(result.message).toBe('No valid source directories found.')
    expect(result.data?.errors).toEqual(['No valid source directories found.'])

    // 阳性对照：一条来源都没给时说的是**另一句**（`core.ts:133`），
    // 两条闸门不许共用文案，否则"你忘传了"和"路径不存在"读起来一样。
    const empty = await runCrashu({ action: 'scan', sourcePaths: [] }, createMemoryRuntime({}))
    expect(empty.message).toBe('At least one source directory is required.')
  })
})

describe('normalizeCrashuInput（上游 core.test.ts 未覆盖，判据照 core.ts:107-124）', () => {
  it('source 是 unshift 到最前，去空白去重，首尾引号被 clean 剥掉', () => {
    const normalized = normalizeCrashuInput({ source: ' "/b" ', sourcePaths: ['/a', '/b', ''] })
    // 手推：[clean('"/b"'), clean('/a'), clean('/b'), clean('')] → ['/b','/a','/b','']，
    // Set 保序 ⇒ ['/b','/a']（`core.ts:108-109` 的 unshift + `:467-469` 的 uniqueClean）。
    expect(normalized.sourcePaths).toEqual(['/b', '/a'])
    expect(normalized.source).toBe('/b')

    // 阳性对照：push 而不是 unshift 的实现给出 ['/a','/b'] ⇒ 这条红。
    expect(normalized.sourcePaths[0]).toBe('/b')
  })

  it('snake_case 与 camelCase 都吃，阈值夹到 0..1，其余落内核默认', () => {
    const normalized = normalizeCrashuInput({ action: 'move', source_paths: ['/a'], target_path: ' /t ', similarity_threshold: 5 })
    expect(normalized.similarityThreshold).toBe(1)
    expect(normalized.targetPath).toBe('/t')
    expect(normalized.action).toBe('move')
    // 内核默认一份都不许被"界面上的默认值"污染（`:111-123`）。
    expect({ autoMove: normalized.autoMove, moveDirection: normalized.moveDirection, conflictPolicy: normalized.conflictPolicy, dryRun: normalized.dryRun })
      .toEqual({ autoMove: false, moveDirection: 'to_target', conflictPolicy: 'skip', dryRun: false })

    // 阳性对照：非有限值落 0.6 而不是 0 或 NaN（`clamp01`，`:475-477`）。
    expect(normalizeCrashuInput({ similarityThreshold: Number.NaN }).similarityThreshold).toBe(0.6)
    expect(normalizeCrashuInput({ similarityThreshold: -3 }).similarityThreshold).toBe(0)
    // 对照：内核默认阈值是 **0.6**，不是定义里那个界面默认 0.65。
    expect(normalizeCrashuInput({}).similarityThreshold).toBe(0.6)
  })

  it('pairsFileName 空串落回 folder_pairs.json', () => {
    // `core.ts:121`：`clean(...) || "folder_pairs.json"`。
    expect(normalizeCrashuInput({ pairsFileName: '   ' }).pairsFileName).toBe('folder_pairs.json')
    expect(normalizeCrashuInput({ pairs_file_name: 'pairs.json' }).pairsFileName).toBe('pairs.json')
  })
})

describe('buildCrashuPlan 的三种 skip 与冲突策略（core.ts:209-255, 359-379）', () => {
  const folder = {
    name: 'Circle Project',
    path: '/src/Circle Project',
    target: 'Circle Project CN',
    similarity: 0.9,
    matchDim: 'name',
    matchSrc: 'circle project',
    matchTgt: 'circle project cn',
    targetFullpath: '/targets/Circle Project CN',
  }
  const withoutTargetPath = { ...folder, targetFullpath: undefined }

  it('没有目的地时整份计划都是 missing_destination', async () => {
    const runtime = createMemoryRuntime({})
    const plan = await buildCrashuPlan([folder], { destinationPath: '', moveDirection: 'to_target', conflictPolicy: 'skip' }, runtime)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ status: 'skipped', reason: 'missing_destination', destinationPath: '' })

    // 阳性对照：给了目的地就不许再说 missing_destination。
    const given = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'skip' }, runtime)
    expect(given[0]).toMatchObject({ status: 'pending', reason: 'matched', destinationPath: '/dest/Circle Project CN/Circle Project' })
  })

  it('to_source 而目标没有全路径时报 target_path_unavailable', async () => {
    const runtime = createMemoryRuntime({})
    const plan = await buildCrashuPlan([withoutTargetPath], { destinationPath: '/dest', moveDirection: 'to_source', conflictPolicy: 'skip' }, runtime)
    expect(plan[0]).toMatchObject({ status: 'skipped', reason: 'target_path_unavailable', sourcePath: '/src/Circle Project', destinationPath: '' })

    // 对照：同一份条目在 to_target 下不许走这条分支（源路径就是 folder.path）。
    const forward = await buildCrashuPlan([withoutTargetPath], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'skip' }, runtime)
    expect(forward[0]).toMatchObject({ status: 'pending', sourcePath: '/src/Circle Project' })
  })

  it('to_source 时源路径换成目标那一侧', async () => {
    const runtime = createMemoryRuntime({ '/dest/Circle Project': [] })
    const plan = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_source', conflictPolicy: 'skip' }, runtime)
    // `core.ts:229`：to_source 且有 targetFullpath ⇒ sourcePath = 目标全路径；
    // `:365`：to_source 时 baseFolder 用 **folder.name**（不是 target）。
    expect(plan[0]).toMatchObject({
      sourcePath: '/targets/Circle Project CN',
      destinationPath: '/dest/Circle Project/Circle Project CN',
      status: 'pending',
    })
  })

  it('目标已存在：skip 判 target_exists，rename 从 (2) 往上找空位', async () => {
    // 夹具手搭：desired = `/dest/Circle Project CN/Circle Project`（base 用 sanitize 过的
    // 目标名，尾段是 basename(sourcePath)，`:365-367`），所以这个路径必须在 dirs 里。
    const existsRuntime = createMemoryRuntime({
      '/dest': ['Circle Project CN'],
      '/dest/Circle Project CN': ['Circle Project'],
    })
    const skipped = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'skip' }, existsRuntime)
    expect(skipped[0]).toMatchObject({ status: 'skipped', reason: 'target_exists', destinationPath: '' })

    // 手推：desired 已存在，policy=rename ⇒ suffix 从 2 起（`:372-378`），
    // `... (2)` 也已存在 ⇒ 下一个空位是 `(3)`。
    const renameRuntime = createMemoryRuntime({
      '/dest': ['Circle Project CN'],
      '/dest/Circle Project CN': ['Circle Project', 'Circle Project (2)'],
    })
    const renamed = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'rename' }, renameRuntime)
    expect(renamed[0]).toMatchObject({ status: 'pending', destinationPath: '/dest/Circle Project CN/Circle Project (3)' })

    // 阳性对照：`(2)` 空着时必须就停在 `(2)`——"后缀从 2 起"这条只有两头都钉才看得见。
    const freeRuntime = createMemoryRuntime({
      '/dest': ['Circle Project CN'],
      '/dest/Circle Project CN': ['Circle Project'],
    })
    const first = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'rename' }, freeRuntime)
    expect(first[0]!.destinationPath).toBe('/dest/Circle Project CN/Circle Project (2)')

    // 阳性对照：overwrite 说的是"就用原目标"，路径不许带后缀（`:370`），
    // 真删在 executePlan 那一侧。
    const over = await buildCrashuPlan([folder], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'overwrite' }, existsRuntime)
    expect(over[0]).toMatchObject({ status: 'pending', destinationPath: '/dest/Circle Project CN/Circle Project' })
  })

  it('目的地名里的非法字符换成下划线，全被清光时用 target', async () => {
    const runtime = createMemoryRuntime({ '/dest': [] })
    const dirty = { ...folder, target: 'A/B:C' }
    const plan = await buildCrashuPlan([dirty], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'skip' }, runtime)
    // `sanitizePathSegment`（`:462-465`）把 `<>:"/\|?*` 与控制符换成 `_`。
    expect(plan[0]!.destinationPath).toBe('/dest/A_B_C/Circle Project')

    const blank = { ...folder, target: '   ' }
    const fallback = await buildCrashuPlan([blank], { destinationPath: '/dest', moveDirection: 'to_target', conflictPolicy: 'skip' }, runtime)
    expect(fallback[0]!.destinationPath).toBe('/dest/target/Circle Project')
  })

  it('并列同分时取第一个目标（core.ts:381-390 的严格大于）', () => {
    const matches = matchSimilarFolders(
      [{ name: 'Circle [Alt]', path: '/src/Circle [Alt]', sourceRoot: '/src' }],
      [{ name: 'Alt', path: '/targets/Alt' }, { name: 'ALT', path: '/targets/ALT' }],
      0.6,
    )
    // 手推：两个目标的别名都是 `alt`，与源的别名 `alt` 全等 ⇒ 都是 1；
    // `bestTargetMatch` 只在 `>` 时替换 ⇒ 留下**第一个**。
    expect(matches[0]!.target).toBe('Alt')
  })
})

describe('executePlan 的冲突策略与记账（core.ts:318-357）', () => {
  const fixture = (): CrashuRuntime & { operations: string[] } => createMemoryRuntime({
    '/src': ['Circle Project'],
    '/targets': ['Circle Project CN'],
    '/dest/Circle Project CN': ['Circle Project'],
  })

  it('overwrite 先删目标再搬，skip 一条都不动', async () => {
    const runtime = fixture()
    const result = await runCrashu({
      action: 'move',
      sourcePaths: ['/src'],
      targetPath: '/targets',
      destinationPath: '/dest',
      autoMove: true,
      conflictPolicy: 'overwrite',
    }, runtime)
    const deleteAt = runtime.operations.indexOf('delete:/dest/Circle Project CN/Circle Project')
    const moveAt = runtime.operations.findIndex((line) => line.startsWith('move:/src/Circle Project->'))
    // 手推：`:334-336` 的删除必须在 move 之前，否则 `rename` 撞已存在目录。
    expect(deleteAt).toBeGreaterThanOrEqual(0)
    expect(moveAt).toBeGreaterThan(deleteAt)
    expect(result.data?.movedCount).toBe(1)

    // 阳性对照：同一份夹具换成默认的 skip ⇒ 计划里就是 target_exists，一条 op 都不发。
    const idle = fixture()
    const skipped = await runCrashu({
      action: 'move',
      sourcePaths: ['/src'],
      targetPath: '/targets',
      destinationPath: '/dest',
      autoMove: true,
    }, idle)
    expect(skipped.data?.movedCount).toBe(0)
    expect(skipped.data?.skippedCount).toBe(1)
    expect(idle.operations.some((line) => line.startsWith('move:') || line.startsWith('delete:'))).toBe(false)
  })

  it('配对文件记的是执行前那份计划，不是执行后的合并结果', async () => {
    const runtime = createMemoryRuntime({
      '/src': ['Circle Project'],
      '/targets': ['Circle Project CN'],
      '/dest': [],
    })
    await runCrashu({ action: 'move', sourcePaths: ['/src'], targetPath: '/targets', destinationPath: '/dest', autoMove: true }, runtime)
    const written = runtime.written.get('/dest/folder_pairs.json')
    expect(typeof written).toBe('string')
    const pairs = JSON.parse(String(written)) as { generatedAt: string; pairs: Array<{ status: string }> }
    // 手推：`writeText` 在 `:346` 发生，而 `completed` 的回填在 `:350` ⇒ 文件里的条目
    // 还是 `pending`。这是上游行为，"顺手改成执行后"就在这里红。
    expect(pairs.pairs.map((item) => item.status)).toEqual(['pending'])
    expect(typeof pairs.generatedAt).toBe('string')
  })

  it('执行报错的条目进 errors 并把 success 拉成假，其他条目照样搬', async () => {
    const runtime = createMemoryRuntime({ '/src': ['Circle Project'], '/targets': ['Circle Project CN'], '/dest': [] })
    runtime.movePath = async () => { throw new Error('boom') }
    const result = await runCrashu({ action: 'move', sourcePaths: ['/src'], targetPath: '/targets', destinationPath: '/dest', autoMove: true }, runtime)
    expect(result.success).toBe(false)
    // 手推：`errorCount` 来自 `summarize` 里 `status === 'error'` 的条目数（`:395`），
    // `errors` 是 `${sourcePath}: ${reason}`（`:407`）。
    expect(result.data?.errorCount).toBe(1)
    expect(result.data?.errors).toEqual(['/src/Circle Project: boom'])
    expect(result.message).toBe('Crashu completed: 1 matched, 0 moved, 1 error(s).')
  })
})

describe('crashu 的接线形状：参数表与危险闸门', () => {
  const node = ownNode()
  const validated = validateNodeDefinition(node)
  if (!validated.ok) throw new Error(validated.errors.join('; '))
  const definition = validated.value

  it('动作选择器不进参数表，dryRun 只在 move 上出现（定义里那条 actionIs 真的生效）', () => {
    const scanKeys = Object.keys(parametersFor(definition, 'scan'))
    const moveKeys = Object.keys(parametersFor(definition, 'move'))
    // 手推自 `package.json#xaihi.node`：10 个字段里 `action` 是 isActionSelector ⇒ 不进表；
    // 其余 9 个的 visible 是 always，只有 `dryRun` 的 visible 是 `actionIs move`。
    expect(scanKeys).toEqual(['sourcePaths', 'targetPath', 'targetNames', 'destinationPath', 'similarityThreshold', 'moveDirection', 'conflictPolicy', 'pairsFileName'])
    expect(moveKeys).toEqual([...scanKeys, 'dryRun'])
    // 阳性对照：scan 的参数表里出现 dryRun 就说明可见性没接上。
    expect(scanKeys).not.toContain('dryRun')
  })

  it('danger.all 只在 move + 非预演时亮，且缺 dryRun 也算危险（fail-safe）', () => {
    expect(dangerFor(definition, undefined, 'scan', {})).toBeUndefined()
    expect(dangerFor(definition, undefined, 'plan', { dryRun: false })).toBeUndefined()
    expect(dangerFor(definition, undefined, 'move', { dryRun: true })).toBeUndefined()
    expect(dangerFor(definition, undefined, 'move', { dryRun: false })?.zh).toContain('crashu')
    // 阳性对照：模型没给 dryRun 时必须仍然判危险（`fieldTrue` 拿不到 true ⇒ 取反成立）。
    expect(dangerFor(definition, undefined, 'move', {})).toBeDefined()
  })

  it('sourcePaths 的声明绑定是 lines：数组形状会被粘成一条（内核因此收到接线层的原始数组）', () => {
    const binding = (definition.inputBindings ?? []).find((item) => item.fieldId === 'sourcePaths')
    expect(binding?.slot).toBe('sourcePaths')
    expect(binding?.transform).toBe('lines')
    // 期望值手抄 SDK 自己的实现语义（`transformValue`）：数组进来会被 `String()` 粘成一条。
    expect(bindInputs(definition, { sourcePaths: ['/a', '/b'] })).toMatchObject({ sourcePaths: ['/a,/b'] })
    expect(bindInputs(definition, { sourcePaths: '/a\n/b' })).toMatchObject({ sourcePaths: ['/a', '/b'] })
  })
})

function ownNode(): unknown {
  const path = fileURLToPath(new URL('../package.json', import.meta.url))
  return (JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }).xaihi?.node
}

/**
 * 上游 `core.test.ts:56-106` 那份内存 runtime 逐字搬来（含它自己的 `join` / `dirname` /
 * `basename` 假实现与 `write:<path>:<长度>` 记账），另外多存一份写入内容，
 * 只为本节那条"配对文件记的是执行前那份计划"能读到字节。
 */
function createMemoryRuntime(tree: Record<string, string[]>): CrashuRuntime & { operations: string[]; written: Map<string, string> } {
  const dirs = new Set<string>(Object.keys(tree))
  for (const [root, children] of Object.entries(tree)) {
    dirs.add(root)
    for (const child of children) dirs.add(join(root, child))
  }
  const operations: string[] = []
  const written = new Map<string, string>()

  return {
    operations,
    written,
    async pathInfo(path: string): Promise<CrashuPathInfo> {
      return { path, exists: dirs.has(path), isFile: false, isDirectory: dirs.has(path) }
    },
    async listDir(path: string): Promise<CrashuDirEntry[]> {
      return (tree[path] ?? []).map((name) => ({ name, path: join(path, name), isFile: false, isDirectory: true }))
    },
    async ensureDir(path: string): Promise<void> {
      dirs.add(path)
    },
    async movePath(source: string, target: string): Promise<void> {
      operations.push(`move:${source}->${target}`)
      dirs.delete(source)
      dirs.add(target)
      dirs.add(dirname(target))
    },
    async deletePath(path: string): Promise<void> {
      operations.push(`delete:${path}`)
      dirs.delete(path)
    },
    async writeText(path: string, content: string): Promise<void> {
      operations.push(`write:${path}:${content.length}`)
      written.set(path, content)
      dirs.add(dirname(path))
    },
    join,
    dirname,
    basename,
  }
}

function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
