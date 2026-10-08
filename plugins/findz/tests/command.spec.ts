/**
 * `/findz` 命令面的判据：解析、词表与清单的一致性、以及那条危险闸门。
 *
 * 这里刻意把"量得到"和"量不到"分开写：findz 的定义是 `danger:{type:'none'}`，所以
 * 走真定义时 `gateReason` 一定返回 `undefined` —— 这一条本身就是判据（阳性对照），
 * 而"它拦得住"只能用一份 `actionIn` 的替身定义来量。两句话都写出来，免得读的人
 * 以为已经在真定义上验过危险分支。
 *
 * 解析之外的路径（真起内核进程）不在这里：命令 handler 只被喂到"不碰内核"的输入
 * （帮助、解析错误、被闸门拒绝），凡是要真调用的一律不进这个文件。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dangerFor, validateNodeDefinition, type NodeDefinition } from '@hibernalglow/xaihi-sdk'
import { helpText, parseFindzCommand } from '../src/command.ts'
import { apply, gateReason } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { xaihi?: { node?: unknown } }

function definition(): NodeDefinition {
  const result = validateNodeDefinition(pkg.xaihi?.node)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value
}

function optionsOf(node: NodeDefinition, fieldId: string): string[] {
  return (node.fields.find((field) => field.id === fieldId)?.options ?? []).map((option) => option.value)
}

interface RegisteredCommand {
  name: string
  description: string
  handler(input: { rawInput: string }): Promise<{ kind: 'success'; text?: string } | { kind: 'error'; text: string }>
}

function fakeContext(): { ctx: never; commands: RegisteredCommand[] } {
  const commands: RegisteredCommand[] = []
  const ctx = {
    tools: { register: () => () => undefined },
    commands: { register: (command: RegisteredCommand) => { commands.push(command); return () => undefined } },
    on: () => () => undefined,
    get: () => undefined,
    effect: (create: () => () => void) => { create(); return () => undefined },
  }
  return { ctx: ctx as never, commands }
}

/** 装一次、拿到那条命令；config 给满，免得装载期因为缺内核路径就炸。 */
async function registered(): Promise<RegisteredCommand> {
  const { ctx, commands } = fakeContext()
  apply(ctx, { indexDir: { get: () => '/tmp/xaihi-findz-index' }, hostBinary: { get: () => '/tmp/findz-host' } })
  const command = commands[0]
  if (command === undefined) throw new Error('apply did not register a command')
  return command
}

/**
 * 每个动作最小可用的位置参数。
 *
 * 这张表是**故意重复**的：下面的判据会断言它的键集恰好等于清单里的动作 id，所以
 * 谁往 `package.json` 加一个动作，这里立刻红 —— 要的就是"加了动作就得想清楚它在
 * 命令面上长什么样"。用一段万能 filler 去凑是错的：`scan` 恰好一个参数、`task`
 * 恰好两个，多给一个就该被拒，那种写法会把这条判据自己测坏。
 */
const MINIMAL: Record<string, string> = {
  api_info: '',
  open_library: 'lib /tmp/lib',
  close_library: 'lib',
  scan: 'lib',
  analyze: 'lib',
  query_archives: 'lib',
  query_members: 'lib 7',
  export_rows: 'lib',
  treemap: 'lib',
  task: 'lib t1',
  pause: 'lib t1',
  resume: 'lib t1',
  cancel: 'lib t1',
}

describe('parseFindzCommand：词表跟定义走', () => {
  it('每个动作 id 自己就是一个可用的命令名（清单加动作时命令面不会漏）', () => {
    const node = definition()
    const declared = node.actions.map((action) => action.id).sort()
    expect(Object.keys(MINIMAL).sort()).toEqual(declared)
    for (const actionId of declared) {
      const parsed = parseFindzCommand(`${actionId} ${MINIMAL[actionId] ?? ''}`.trim(), node)
      expect(parsed.kind).toBe('invoke')
      if (parsed.kind !== 'invoke') continue
      expect(parsed.action).toBe(actionId)
      expect(parsed.args.action).toBe(actionId)
    }
  })

  it('短名与全名等价（/findz query 与 /findz query_archives 同一条）', () => {
    const node = definition()
    expect(parseFindzCommand('query lib hello', node)).toEqual(parseFindzCommand('query_archives lib hello', node))
    expect(parseFindzCommand('api', node)).toEqual(parseFindzCommand('api_info', node))
    expect(parseFindzCommand('members lib 7', node)).toEqual(parseFindzCommand('query_members lib 7', node))
  })

  it('treemap 的面积指标只认定义里列出的那几个', () => {
    const node = definition()
    const declared = optionsOf(node, 'areaBy')
    expect(declared.length).toBeGreaterThan(4)
    for (const value of declared) {
      const parsed = parseFindzCommand(`treemap comics ${value}`, node)
      expect(parsed).toEqual({ kind: 'invoke', action: 'treemap', args: { action: 'treemap', libraryId: 'comics', areaBy: value } })
    }
    // 阳性对照：不在词表里的值必须被拒，而不是悄悄当文本过滤传下去。
    const rejected = parseFindzCommand('treemap comics medianBytesPerMegaPixel', node)
    expect(rejected.kind).toBe('error')
    if (rejected.kind === 'error') expect(rejected.text).toContain(declared.join(' | '))
  })

  it('analyze 的范围只认定义里列出的那几个，且 deep 可叠加、不许重复', () => {
    const node = definition()
    expect(parseFindzCommand('analyze comics deep', node)).toEqual({
      kind: 'invoke',
      action: 'analyze',
      args: { action: 'analyze', libraryId: 'comics', deepRetry: true },
    })
    expect(parseFindzCommand('analyze comics members deep', node)).toEqual({
      kind: 'invoke',
      action: 'analyze',
      args: { action: 'analyze', libraryId: 'comics', scopeKind: 'members', deepRetry: true },
    })
    const twice = parseFindzCommand('analyze comics deep deep', node)
    expect(twice.kind).toBe('error')
    const bogus = parseFindzCommand('analyze comics everything', node)
    expect(bogus.kind).toBe('error')
    if (bogus.kind === 'error') expect(bogus.text).toContain(optionsOf(node, 'scopeKind').join(' | '))
  })

  it('帮助文本里的合法值就是从定义里取的那一份', () => {
    const node = definition()
    const text = helpText(node)
    for (const value of optionsOf(node, 'areaBy')) expect(text).toContain(value)
    for (const value of optionsOf(node, 'scopeKind')) expect(text).toContain(value)
  })
})

describe('parseFindzCommand：位置参数', () => {
  const node = definition()

  it('open 的库根取到行尾（带空格的路径不用使用者自己加引号）', () => {
    expect(parseFindzCommand('open comics /Users/glow/My Comix/shelf', node)).toEqual({
      kind: 'invoke',
      action: 'open_library',
      args: { action: 'open_library', libraryId: 'comics', libraryRoot: '/Users/glow/My Comix/shelf' },
    })
  })

  it('query 的多词文本合成一个过滤串；不给文本时压根不带这个槽位', () => {
    expect(parseFindzCommand('query comics 中文 标题', node)).toEqual({
      kind: 'invoke',
      action: 'query_archives',
      args: { action: 'query_archives', libraryId: 'comics', text: '中文 标题' },
    })
    const bare = parseFindzCommand('query comics', node)
    expect(bare.kind).toBe('invoke')
    if (bare.kind === 'invoke') expect('text' in bare.args).toBe(false)
  })

  it('members 的归档 id 必须是正整数', () => {
    const ok = parseFindzCommand('members comics 12 page', node)
    expect(ok).toEqual({
      kind: 'invoke',
      action: 'query_members',
      args: { action: 'query_members', libraryId: 'comics', archiveId: 12, text: 'page' },
    })
    for (const bad of ['0', '-1', '1.5', 'abc']) {
      const parsed = parseFindzCommand(`members comics ${bad}`, node)
      expect(parsed.kind).toBe('error')
    }
  })

  it('缺参数时报的是还差什么，不是静默用空串去调用', () => {
    const missing = parseFindzCommand('scan', node)
    expect(missing.kind).toBe('error')
    if (missing.kind === 'error') expect(missing.text).toContain('<libraryId>')

    const open = parseFindzCommand('open comics', node)
    expect(open.kind).toBe('error')

    const task = parseFindzCommand('pause comics', node)
    expect(task.kind).toBe('error')
  })

  it('api 不吃参数、treemap 不吃文本（命令面比动作清单窄，且明说）', () => {
    expect(parseFindzCommand('api extra', node).kind).toBe('error')
    const treemap = parseFindzCommand('treemap comics archiveSize some text', node)
    expect(treemap.kind).toBe('error')
    if (treemap.kind === 'error') expect(treemap.text).toContain('agent-only')
  })

  it('空输入 / help 都给帮助', () => {
    expect(parseFindzCommand('', node)).toEqual({ kind: 'help' })
    expect(parseFindzCommand('help', node)).toEqual({ kind: 'help' })
  })

  it('不认识的动作报出它自己', () => {
    const parsed = parseFindzCommand('serach comics', node)
    expect(parsed.kind).toBe('error')
    if (parsed.kind === 'error') expect(parsed.text).toContain('serach')
  })
})

describe('gateReason：命令入口不是危险动作的后门', () => {
  it('走真定义时不会触发 —— 因为 findz 现在没有危险动作（这条是阳性对照）', () => {
    const node = definition()
    expect(node.danger).toEqual({ type: 'none' })
    for (const action of node.actions) {
      expect(gateReason(node, action.id, { action: action.id })).toBeUndefined()
    }
  })

  it('定义里一旦标了危险动作，同一条命令立刻跟着拒绝', () => {
    const gated: NodeDefinition = {
      ...definition(),
      danger: { type: 'actionIn', actionField: 'action', dangerous: ['scan'] },
    }
    expect(dangerFor(gated, undefined, 'scan', { action: 'scan' })).toBeDefined()

    const refused = gateReason(gated, 'scan', { action: 'scan' })
    expect(refused).toContain('refused /findz scan')
    expect(refused).toContain('agent')
    // 阳性对照：闸门是挑动作的，不是一刀切。
    expect(gateReason(gated, 'query_archives', { action: 'query_archives' })).toBeUndefined()
  })
})

describe('命令 handler 的短路路径（都不碰内核进程）', () => {
  it('不带输入 → 帮助原文', async () => {
    const command = await registered()
    const outcome = await command.handler({ rawInput: '' })
    expect(outcome.kind).toBe('success')
    if (outcome.kind === 'success') expect(outcome.text).toContain('/findz open <libraryId>')
  })

  it('解析失败 → error，并把原因原样交回', async () => {
    const command = await registered()
    const outcome = await command.handler({ rawInput: 'query' })
    expect(outcome.kind).toBe('error')
    if (outcome.kind === 'error') expect(outcome.text).toContain('<libraryId>')
  })

  it('参数解析通过但缺索引目录 → error 里带上内核前的那道拒绝，而不是静默起进程', async () => {
    const { ctx, commands } = fakeContext()
    // indexDir 留空：open_library 在 `toFindzInput` 就该被拒，走不到起进程那一步。
    apply(ctx, { indexDir: { get: () => '' }, hostBinary: { get: () => '/tmp/findz-host' } })
    const command = commands[0]
    if (command === undefined) throw new Error('apply did not register a command')
    const outcome = await command.handler({ rawInput: 'open comics /tmp/comics' })
    expect(outcome.kind).toBe('error')
    if (outcome.kind === 'error') expect(outcome.text).toContain('config.indexDir is unset')
  })
})
