/**
 * 本包自己的判据：定义合法性、动作 ↔ 工具的覆盖、表单值到 `FindzInput` 的映射、
 * 二进制解析与结果渲染。
 *
 * 判据都配阳性对照（"关掉防御就变红"）：路径穿越必须被拒、缺索引目录必须被拒、
 * 缺内核包必须报出那句可读的失败——每一条都有一个"输入翻过来就该通过"的邻居。
 *
 * 这里**不**调用工具的 `execute`：那会真的去起内核进程。动作到内核的实机对齐在
 * `native/findz-go/probe/probe-host.py` 里读回。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateNodeDefinition, type NodeDefinition } from '@hibernalglow/xaihi-sdk'
import { apply, platformPackageOf, renderResult, resolveHostBinary, toFindzInput } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { xaihi?: { node?: unknown } }

function definition(): NodeDefinition {
  const result = validateNodeDefinition(pkg.xaihi?.node)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

/**
 * `ctx.tools.register` 收到的东西。
 *
 * `parameters` 是 `defineTool` 收下 `ParameterSpec` 之后**整理过的 JSON Schema**
 * （`{type:'object', properties, required}`），不是我们交给它的那张平表 —— 所以断言
 * 要读 `properties`。我们那侧的真源仍是 `parametersFor`（SDK 自己的
 * `tests/define-node.spec.ts` 就是从那一头量的），这里顺带把"经 `defineTool` 之后
 * 模型实际看到什么"也钉住。
 */
interface RegisteredParameters {
  type: string
  properties: Record<string, { type?: string; enum?: string[] }>
  required?: string[]
}

interface RegisteredTool {
  name: string
  description: string
  parameters: RegisteredParameters
}

interface RegisteredCommand {
  name: string
  description: string
  handler(input: { rawInput: string }): Promise<{ kind: 'success'; text?: string } | { kind: 'error'; text: string }>
}

/** 一个只够 `defineNode` 用的假上下文：捕获注册，别的一概不做。 */
function fakeContext(): {
  ctx: never
  registered: RegisteredTool[]
  commands: RegisteredCommand[]
  disposers: Array<() => void>
} {
  const registered: RegisteredTool[] = []
  const commands: RegisteredCommand[] = []
  const disposers: Array<() => void> = []
  const ctx = {
    tools: { register: (tool: RegisteredTool) => { registered.push(tool); return () => undefined } },
    commands: { register: (command: RegisteredCommand) => { commands.push(command); return () => undefined } },
    on: () => () => undefined,
    get: () => undefined,
    effect: (create: () => () => void) => { disposers.push(create()); return () => undefined },
  }
  return { ctx: ctx as never, registered, commands, disposers }
}

const config = (indexDir: string, hostBinary: string) => ({
  indexDir: { get: () => indexDir },
  hostBinary: { get: () => hostBinary },
})

describe('findz 的节点定义与装载', () => {
  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义，13 个动作 14 个字段', () => {
    const node = definition()
    expect(node.nodeId).toBe('findz')
    expect(node.actions).toHaveLength(13)
    expect(node.fields).toHaveLength(14)
    expect(node.danger).toEqual({ type: 'none' })
    expect(node.reportsProgress).toBe(true)
  })

  it('apply 给每个动作注册一个工具，名字是 findz_<action>', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config('/tmp/xaihi-findz-index', '/tmp/findz-host'))
    const node = definition()
    expect(registered).toHaveLength(node.actions.length)
    expect(registered.map((tool) => tool.name).sort()).toEqual(node.actions.map((action) => `findz_${action.id}`).sort())
  })

  it('apply 同时注册一条 /findz 命令（面板与 composer 走的就是这条）', () => {
    const { ctx, commands } = fakeContext()
    apply(ctx, config('/tmp/xaihi-findz-index', '/tmp/findz-host'))
    expect(commands.map((command) => command.name)).toEqual(['findz'])
    expect(commands[0]?.description).toContain('/findz api')
  })

  it('动作清单与工具清单互为子集（清单多一个 = 装载期就炸，不是运行时空转）', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config('/tmp/xaihi-findz-index', '/tmp/findz-host'))
    const registeredNames = new Set(registered.map((tool) => tool.name))
    for (const action of definition().actions) expect(registeredNames.has(`findz_${action.id}`)).toBe(true)
  })

  it('工具参数按动作收窄：open_library 要库根、query_members 要 archiveId，且互相看不到对方的字段', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx, config('/tmp/xaihi-findz-index', '/tmp/findz-host'))
    const byName = new Map(registered.map((tool) => [tool.name, tool.parameters]))

    const open = byName.get('findz_open_library')
    expect(open).toBeDefined()
    // 动作选择器自己不进参数表（模型不需要选动作，工具名已经定了）。
    expect(Object.keys(open?.properties ?? {}).sort()).toEqual(['libraryId', 'libraryRoot'])
    expect(open?.required).toEqual(['libraryId', 'libraryRoot'])
    // 阳性对照：另一个动作的字段不该出现在这里。
    expect(open?.properties.archiveId).toBeUndefined()

    const members = byName.get('findz_query_members')
    expect(members?.required).toEqual(['libraryId', 'archiveId'])
    // 阳性对照：open_library 独占的字段不该漏进来。
    expect(members?.properties.libraryRoot).toBeUndefined()
    expect(members?.properties.archiveId?.type).toBe('number')

    // 选择器的候选值来自定义，不是另写的一张表。
    expect(byName.get('findz_analyze')?.properties.scopeKind?.enum).toEqual(['all', 'archives', 'members'])
    expect(byName.get('findz_treemap')?.properties.areaBy?.enum).toContain('estimatedSavings')

    // `api_info` 不吃任何参数：它的表是空的，而不是把别的动作的字段兜给模型。
    expect(byName.get('findz_api_info')?.properties).toEqual({})
    expect(byName.get('findz_api_info')?.required).toBeUndefined()

    // `text` 被 core.ts 消费的地方只有那四个查询动作，别的动作不该看到它
    // （模型填了、内核丢掉，两边都不报错 —— 这是最坏的一种静默）。
    for (const ignored of ['findz_api_info', 'findz_scan', 'findz_close_library', 'findz_task', 'findz_analyze']) {
      expect(byName.get(ignored)?.properties.text).toBeUndefined()
    }
    for (const consumer of ['findz_query_archives', 'findz_query_members', 'findz_export_rows', 'findz_treemap']) {
      expect(byName.get(consumer)?.properties.text).toBeDefined()
    }
  })

  it('显式给了内核路径就不去解析平台包（开发期那条路）', () => {
    const { ctx } = fakeContext()
    expect(() => { apply(ctx, config('/tmp/xaihi-findz-index', '/tmp/findz-host')) }).not.toThrow()
  })

  it('没给内核路径又装不到平台包：装载期就报出可读的失败', () => {
    const { ctx } = fakeContext()
    expect(() => { apply(ctx, config('/tmp/xaihi-findz-index', '')) }).toThrow(/findz: no core binary for \w+-\w+/)
  })
})

describe('resolveHostBinary', () => {
  it('显式路径优先，且不碰解析器', () => {
    const resolved = resolveHostBinary({
      override: '  /opt/findz-host  ', platform: 'darwin', arch: 'arm64',
      resolvePackage: () => { throw new Error('must not be called') },
    })
    expect(resolved).toBe('/opt/findz-host')
  })

  it('没显式路径时按 <platform>-<arch> 解析 bin/findz-host', () => {
    const seen: string[] = []
    const resolved = resolveHostBinary({
      override: '', platform: 'win32', arch: 'x64',
      resolvePackage: (specifier) => { seen.push(specifier); return 'D:/xaihi/findz-host.exe' },
    })
    expect(resolved).toBe('D:/xaihi/findz-host.exe')
    expect(seen).toEqual([`${platformPackageOf('win32', 'x64')}/bin/findz-host`])
    expect(platformPackageOf('win32', 'x64')).toBe('@hibernalglow/xaihi-findz-win32-x64')
  })

  it('解析失败时报的是"这个平台没有内核包"，并指出怎么改', () => {
    expect(() => resolveHostBinary({
      override: '', platform: 'linux', arch: 'arm64',
      resolvePackage: () => { throw new Error('MODULE_NOT_FOUND') },
    })).toThrow(/findz: no core binary for linux-arm64 \(install @hibernalglow\/xaihi-findz-linux-arm64, or set config\.hostBinary\)/)
  })
})

describe('toFindzInput', () => {
  it('open_library 把库根 + 索引目录拼成内核要的 databasePath', () => {
    const input = toFindzInput('open_library', { libraryId: 'manga', libraryRoot: '/Volumes/books' }, '/tmp/index')
    expect(input).toEqual({
      action: 'open_library',
      libraryId: 'manga',
      library: { libraryId: 'manga', root: '/Volumes/books', databasePath: '/tmp/index/manga.sqlite' },
    })
  })

  it('没配 indexDir 就拒绝，而不是让内核退回它自己那个 Xiranite 目录', () => {
    expect(() => toFindzInput('open_library', { libraryId: 'manga', libraryRoot: '/Volumes/books' }, ''))
      .toThrow(/config\.indexDir is unset, refusing to open a library at an implicit index location/)
  })

  it('库 id 会被当作文件名，所以路径形状的 id 必须被拒（阳性对照：合法 id 通过）', () => {
    expect(() => toFindzInput('open_library', { libraryId: '../etc/passwd', libraryRoot: '/tmp' }, '/tmp/index'))
      .toThrow(/is not a usable index file name/)
    expect(() => toFindzInput('scan', { libraryId: 'manga-2024_v2' }, '/tmp/index')).not.toThrow()
  })

  it('query_archives 把排序与分页拼进 query，路径前缀只在给了的时候出现', () => {
    const input = toFindzInput('query_archives', {
      libraryId: 'manga', text: 'cover', sortBy: 'anomalyCount', sortDesc: true, pageLimit: 50, pageCursor: 'abc',
    }, '/tmp/index')
    expect(input).toEqual({
      action: 'query_archives',
      libraryId: 'manga',
      text: 'cover',
      query: { sortBy: 'anomalyCount', sortDesc: true, page: { limit: 50, cursor: 'abc' } },
    })
  })

  it('缺 archiveId 的 query_members 在打内核之前就被拒', () => {
    expect(() => toFindzInput('query_members', { libraryId: 'manga' }, '/tmp/index')).toThrow(/archiveId is required/)
  })

  it('analyze 的 scope 有默认值，deepRetry 只在打开时才出现', () => {
    expect(toFindzInput('analyze', { libraryId: 'manga' }, '/tmp/index')).toEqual({
      action: 'analyze', libraryId: 'manga', analysisScope: { kind: 'all' },
    })
    expect(toFindzInput('analyze', { libraryId: 'manga', scopeKind: 'members', deepRetry: true }, '/tmp/index')).toEqual({
      action: 'analyze', libraryId: 'manga', analysisScope: { kind: 'members', deepRetry: true },
    })
  })

  it('treemap 的 areaBy 不合法就不下发（内核自己会退回 archiveSize）', () => {
    expect(toFindzInput('treemap', { libraryId: 'manga', areaBy: 'estimatedSavings' }, '/tmp/index')).toMatchObject({ areaBy: 'estimatedSavings' })
    expect(toFindzInput('treemap', { libraryId: 'manga' }, '/tmp/index')).not.toHaveProperty('areaBy')
  })

  it('api_info 不需要库 id', () => {
    expect(toFindzInput('api_info', {}, '')).toEqual({ action: 'api_info' })
    expect(() => toFindzInput('scan', {}, '')).toThrow(/libraryId is required/)
  })
})

describe('renderResult', () => {
  it('归档页渲染行、总数与翻页游标', () => {
    const text = renderResult({
      success: true,
      message: 'Findz: archive query.',
      data: {
        action: 'query_archives',
        archives: {
          total: 2,
          nextCursor: 'page-2',
          items: [
            { id: 1, relativePath: 'a.cbz', size: 100, modifiedAt: '', scanState: 'ok', memberCount: 3, imageMemberCount: 3, analyzedImageCount: 0, compressedImageBytes: 0, averageImageBytes: 0, averageBytesPerMegapixel: 0, medianBytesPerMegapixel: 0, anomalyCount: 0, estimatedSavingsBytes: 0 },
            { id: 2, relativePath: 'b.zip', size: 200, modifiedAt: '', scanState: 'ok', errorCode: 'encrypted_archive', memberCount: 1, imageMemberCount: 0, analyzedImageCount: 0, compressedImageBytes: 0, averageImageBytes: 0, averageBytesPerMegapixel: 0, medianBytesPerMegapixel: 0, anomalyCount: 0, estimatedSavingsBytes: 0 },
          ],
        },
      },
    })
    expect(text).toContain('2 row(s) in this query')
    expect(text).toContain('1 · a.cbz · 100 B · 3 member(s) · 3 image(s)')
    expect(text).toContain('encrypted_archive')
    expect(text).toContain('nextCursor: page-2')
  })

  it('内核自述与任务渲染成一行，不是把 JSON 直接倒出来', () => {
    const apiText = renderResult({
      success: true,
      message: 'Findz: native capability check.',
      data: { action: 'api_info', apiInfo: { abiVersion: 1, coreVersion: '0.1.0', requestVersions: [1], capabilities: ['a', 'b'], supportedFormats: ['png'] } },
    })
    expect(apiText).toContain('core 0.1.0 · abi 1 · 2 capabilities')
    expect(apiText).toContain('formats: png')

    const taskText = renderResult({
      success: true,
      message: 'Findz: ZIP scan.',
      data: { action: 'scan', task: { id: 'task-1', libraryId: 'manga', kind: 'scan', status: 'running', totalArchives: 9, doneArchives: 4, totalMembers: 90, doneMembers: 40, skippedMembers: 0, failedMembers: 0, message: '' } },
    })
    expect(taskText).toContain('task task-1 · scan · running · archives 4/9 · members 40/90')
  })
})
