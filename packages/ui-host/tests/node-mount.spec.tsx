/**
 * in-realm 挂载的判据。
 *
 * 每条尺都写清楚它看得见的违规是什么（阳性对照），并在落地前真的把被测那件东西弄坏跑过一次：
 * 注册表少一条 id、在飞的那发改成"装载过一次就不管"的旗子、命令表多加一条仓内没注册的入口、
 * 渲染边界换成裸渲染 —— 对应那条必须红。
 *
 * 装载入口一律注入假件。真注册表那些入口要 value-import `@/components/ui/*` 与
 * `@xiranite/node-<id>/core`，把整棵搬运树拉进来，这条判据问的就变成"别人正在改的文件红了没有"，
 * 而不是"接线在不在"（同 `tests/surface.spec.tsx:4-7` 用假 `inRealm` 的理由）。
 *
 * @module xaihi-ui/tests/node-mount
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement, useEffect, useRef, useState } from 'react'
import type { AppNodeEntry } from '../src/components/modules/packageModules.generated.ts'
import type { PanelContribution, PanelHost } from '@hibernalglow/xaihi-sdk'
import type { PanelEntry } from '../src/client/workspace.tsx'
import { WorkspaceRoot } from '../src/client/workspace.tsx'
import type { Translate } from '../src/client/locales.ts'
import {
  COMMAND_SEAMS,
  NodeModuleSurface,
  collisionNotice,
  inRealmPanelEntries,
  mergePanelEntries,
  nodeMountRecord,
  planCommandLine,
  type NodeEntryLoader,
} from '../src/client/node-mount.tsx'

/** `t` 座位在测里就是键名本身：断的是"文案走座位不走字面量"，不是具体措辞。 */
const t = ((key: string) => key) as Translate

const outcomeHost = (): PanelHost => panelHost()

function panelHost(
  runCommand?: (line: string) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>,
): PanelHost {
  return {
    openPanel: () => false,
    notify: () => undefined,
    runCommand: runCommand ?? (async (line: string) => ({ ok: true as const, text: `ran ${line}` })),
  }
}

const contributionOf = (id: string): PanelContribution => ({
  id,
  title: { zh: `${id}-zh`, en: `${id}-en` },
  area: 'workspace',
  remote: '',
  export: '',
})

const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

/** 一份可挂的入口：`AppNodeEntry` 在本仓就这两个键（`packageModules.generated.ts:23-26`）。 */
const entryFor = (label: string): { default: AppNodeEntry } => ({
  default: {
    def: {},
    Component: () => createElement('div', { 'data-testid': 'node-body' }, label),
  },
})

const readyLoader: NodeEntryLoader = async (id) => entryFor(`${id} 界面`)

/** 每个用例自己的 container：`querySelector` 会把上一个用例留下的 DOM 一起捞进来（同 tests/surface.spec.tsx:27-29）。 */
const mountSurface = (id: string, loader: NodeEntryLoader, host = outcomeHost()) =>
  render(createElement(NodeModuleSurface, { id, contribution: contributionOf(id), locale: 'zh', host, t, loader }))

const statusOf = (container: HTMLElement): string | null =>
  container.querySelector('.xaihi-node-mount')?.getAttribute('data-node-status') ?? null

const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  const book = (globalThis as { __XAIHI__?: Record<string, unknown> }).__XAIHI__
  if (book !== undefined) delete book.nodeMount
})

/**
 * 手抄的期望：注册表里"应该有面"的节点 id 全集（2026-10-07 数出来的 27 个，
 * 出处是「`plugins` 下每个包的 package.json」与「src/nodes 下每个目录的 entry.ts」的交集，
 * 不是再调一次被测函数得到）。
 * 本文件所有计数都从它推，不再各写一个数字：手抄的期望只能有一处。
 */
const REGISTERED = ['bandia', 'bitv', 'classf', 'classq', 'cleanf', 'crashu', 'dissolvef', 'encodeb', 'enginev', 'findz', 'formatv', 'gifu', 'linedup', 'linku', 'logx', 'marku', 'migratef', 'mvz', 'nameu', 'rawfilter', 'recycleu', 'repacku', 'samea', 'sleept', 'smartzip', 'timeu', 'trename']

describe('注册表 → 面板条目', () => {

  it('全部已登记节点各产出一条 workspace 面板贡献', () => {
    const entries = inRealmPanelEntries()
    expect(entries.map((entry) => entry.contribution.id).sort()).toEqual(REGISTERED)
    for (const entry of entries) {
      expect(entry.source).toBe('in-realm')
      expect(entry.contribution.area).toBe('workspace')
      expect(entry.package).toBe('@hibernalglow/xaihi-ui')
      // 这条边没有 remote 地址。空串是"没有"，填一个看起来像的 slug 就是伪造地址。
      expect(entry.contribution.remote).toBe('')
      expect(entry.contribution.export).toBe('')
    }
  })

  it('标题取嵌进来的 package.json#xaihi.node，两种语言各自一份', () => {
    const titles = Object.fromEntries(inRealmPanelEntries().map((entry) => [entry.contribution.id, entry.contribution.title]))
    // 点名的这四个 zh/en 本来就不同：退成注册表 `name`（或退成单一语言）在这几条上立刻看得出来。
    expect(titles.sleept).toEqual({ zh: '休眠管理', en: 'Sleep control' })
    expect(titles.dissolvef).toEqual({ zh: '文件归并整理', en: 'Dissolve folders' })
    expect(titles.findz).toEqual({ zh: '归档检索', en: 'Archive search' })
    expect(titles.linedup).toEqual({ zh: '行去重过滤', en: 'Line dedup' })
    for (const entry of inRealmPanelEntries()) {
      expect(entry.contribution.title.zh).not.toBe('')
      expect(entry.contribution.title.en).not.toBe('')
    }
  })
})

describe('两条来源并成一份导航', () => {
  const remoteEntry = (id: string, order?: number): PanelEntry => ({
    source: 'remote',
    package: '@hibernalglow/xaihi-example',
    contribution: {
      id,
      title: { zh: `${id} 面板`, en: `${id} panel` },
      area: 'workspace',
      remote: 'some-remote',
      export: 'Panel',
      ...(order === undefined ? {} : { order }),
    },
  })

  it('没有撞车时远程条目在先，in-realm 接在后面', () => {
    const merged = mergePanelEntries([remoteEntry('alpha'), remoteEntry('beta', -1)])
    expect(merged.collisions).toEqual([])
    expect(merged.entries.map((entry) => `${entry.source}:${entry.contribution.id}`)).toEqual([
      'remote:beta',
      'remote:alpha',
      ...REGISTERED.map((id) => `in-realm:${id}`),
    ])
  })

  it('清单里的面板 id 撞上注册表时两条都不显示，而不是 last-write-wins', () => {
    const merged = mergePanelEntries([remoteEntry('findz'), remoteEntry('alpha')])
    expect(merged.collisions).toEqual(['findz'])
    // 直接 concat 会留下两行 findz，谁后画谁；这里断的是**一行都不留**，并且撞车被交回给壳显示。
    expect(merged.entries.filter((entry) => entry.contribution.id === 'findz')).toEqual([])
    expect(merged.entries.map((entry) => entry.contribution.id)).toContain('alpha')
    const notice = collisionNotice('findz')
    expect(notice).toContain('插件清单')
    expect(notice).toContain('@hibernalglow/xaihi-ui')
    expect(notice).toContain('两条都不显示')
  })
})

describe('装载状态', () => {
  it('装载中先出可见状态，落定才换组件', async () => {
    const gate = deferred<{ default: AppNodeEntry }>()
    const loader: NodeEntryLoader = () => gate.promise
    const view = mountSurface('linedup', loader)
    expect(statusOf(view.container)).toBe('loading')
    expect(view.getByText('panel.loading')).toBeTruthy()
    expect(view.queryByTestId('node-body')).toBeNull()
    gate.resolve(entryFor('linedup 界面'))
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    expect(view.getByTestId('node-body').textContent).toBe('linedup 界面')
    expect(view.queryByText('panel.loading')).toBeNull()
  })

  it('entry 没带 Component 时失败态说清是哪一格，并留着重新装载的出口', async () => {
    const loader: NodeEntryLoader = async () => ({ default: { def: {}, Component: undefined } })
    const view = mountSurface('crashu', loader)
    await waitFor(() => expect(statusOf(view.container)).toBe('failed'))
    expect(view.getByRole('alert').textContent).toContain('crashu 的 entry 没带 Component')
    expect(view.getByText('panel.reload')).toBeTruthy()
  })

  it('装载器抛出 ⇒ 这一格显示原因，重试再走一次同一条缝', async () => {
    let calls = 0
    const loader: NodeEntryLoader = () => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('模块解析失败：@xiranite/node-sleept/duration'))
      return Promise.resolve(entryFor('sleept 界面'))
    }
    const view = mountSurface('sleept', loader)
    await waitFor(() => expect(statusOf(view.container)).toBe('failed'))
    expect(view.getByRole('alert').textContent).toContain('@xiranite/node-sleept/duration')
    expect(view.getByRole('alert').textContent).toContain('panel.failed')
    fireEvent.click(view.getByText('panel.reload'))
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    expect(calls).toBe(2)
  })

  it('一份坏模块带不走兄弟格子', async () => {
    const bad: NodeEntryLoader = async () => {
      throw new Error('这一份坏了')
    }
    const view = render(createElement('div', null,
      createElement(NodeModuleSurface, { id: 'linku', contribution: contributionOf('linku'), locale: 'zh', host: panelHost(), t, loader: bad }),
      createElement(NodeModuleSurface, { id: 'logx', contribution: contributionOf('logx'), locale: 'zh', host: panelHost(), t, loader: readyLoader }),
    ))
    await waitFor(() => expect(view.getByTestId('node-body').textContent).toBe('logx 界面'))
    const surfaces = view.container.querySelectorAll('.xaihi-node-mount')
    expect(surfaces).toHaveLength(2)
    expect(surfaces[0]?.getAttribute('data-node-status')).toBe('failed')
    expect(surfaces[0]?.textContent).toContain('这一份坏了')
    expect(surfaces[1]?.getAttribute('data-node-status')).toBe('ready')
  })

  it('入口组件渲染期抛出停在失败态，界外那格照旧画', async () => {
    const thrower = (): never => {
      throw new Error('渲染时炸了')
    }
    const bad: NodeEntryLoader = async () => ({ default: { def: {}, Component: thrower } })
    const noisy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(createElement('div', null,
      createElement(NodeModuleSurface, { id: 'samea', contribution: contributionOf('samea'), locale: 'zh', host: panelHost(), t, loader: bad }),
      createElement(NodeModuleSurface, { id: 'timeu', contribution: contributionOf('timeu'), locale: 'zh', host: panelHost(), t, loader: readyLoader }),
    ))
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('渲染时炸了'))
    noisy.mockRestore()
    // 接住抛出之后这一格仍然在（壳没被带走），重试的出口也还在。
    expect(view.container.querySelectorAll('.xaihi-node-mount')).toHaveLength(2)
    expect(view.container.textContent).toContain('timeu 界面')
    expect(view.getByText('panel.reload')).toBeTruthy()
  })

  it('换了节点之后那一发在飞的落定不上屏，也不写观测面', async () => {
    const first = deferred<{ default: AppNodeEntry }>()
    const loaders: Record<string, NodeEntryLoader> = {
      classq: () => first.promise,
      formatv: readyLoader,
    }
    // 引用必须稳定：它进了装载那条 effect 的依赖，每渲染换一份就等于每次渲染都重新装载。
    const byId: NodeEntryLoader = (id) => {
      const load = loaders[id]
      if (load === undefined) throw new Error(`测试没给 ${id} 的装载器`)
      return load(id)
    }
    const view = mountSurface('classq', byId)
    expect(statusOf(view.container)).toBe('loading')
    view.rerender(createElement(NodeModuleSurface, { id: 'formatv', contribution: contributionOf('formatv'), locale: 'zh', host: panelHost(), t, loader: byId }))
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    expect(view.getByTestId('node-body').textContent).toBe('formatv 界面')
    expect(nodeMountRecord()).toMatchObject({ id: 'formatv', status: 'ready' })
    // 把装载器里那句 `generation.current !== current` 换成"已经装载过一次就别再装"的旗子，这里就红：
    // 慢的那一发落定会把 formatv 画成 classq。
    first.resolve(entryFor('classq 界面'))
    await flush()
    expect(view.getByTestId('node-body').textContent).toBe('formatv 界面')
    expect(view.container.querySelector('.xaihi-node-mount')?.getAttribute('data-node-id')).toBe('formatv')
    expect(view.container.textContent).not.toContain('classq 界面')
    expect(nodeMountRecord()).toMatchObject({ id: 'formatv', status: 'ready' })
  })

  it('卸载之后那一发落定既不画也不记', async () => {
    const gate = deferred<{ default: AppNodeEntry }>()
    const loader: NodeEntryLoader = () => gate.promise
    const view = mountSurface('recycleu', loader)
    expect(statusOf(view.container)).toBe('loading')
    const generation = nodeMountRecord()?.generation
    expect(generation).toBeTypeOf('number')
    view.unmount()
    expect(view.container.querySelector('.xaihi-node-mount')).toBeNull()
    gate.resolve(entryFor('recycleu 界面'))
    await flush()
    // 观测面停在卸载前那一发（loading），落定的 ready 不写：写了就是在报告一个没在上屏的状态。
    expect(nodeMountRecord()).toMatchObject({ id: 'recycleu', status: 'loading', generation })
  })

  it('入口组件当元素挂：它的 hooks 不许记到壳身上（宿主实测 React #300）', async () => {
    const Hooked = () => {
      useState(0)
      useEffect(() => undefined, [])
      useRef(null)
      return createElement('div', { 'data-testid': 'node-body' }, '带 hooks 的那一份')
    }
    const loaders: Record<string, NodeEntryLoader> = {
      linedup: async () => ({ default: { def: {}, Component: Hooked } }),
      linku: async () => ({ default: { def: {}, Component: Hooked } }),
    }
    const byId: NodeEntryLoader = (id) => {
      const load = loaders[id]
      if (load === undefined) throw new Error(`测试没给 ${id} 的装载器`)
      return load(id)
    }
    const noisy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = mountSurface('linedup', byId)
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    view.rerender(createElement(NodeModuleSurface, { id: 'linku', contribution: contributionOf('linku'), locale: 'zh', host: panelHost(), t, loader: byId }))
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    const hookError = noisy.mock.calls.flat().find((arg) => String(arg).includes('fewer hooks'))
    noisy.mockRestore()
    expect(hookError).toBeUndefined()
    expect(view.getByTestId('node-body').textContent).toBe('带 hooks 的那一份')
  })

  it('交给入口组件的是 compId + host：状态卡与 run 都从 host 走', async () => {
    const seen: { props: Record<string, unknown> | null } = { props: null }
    const spy = (props: Record<string, unknown>) => {
      seen.props = props
      const host = props.host as { state: { getData: () => Record<string, unknown>; patchData: (patch: Record<string, unknown>) => void } }
      return createElement('button', {
        type: 'button',
        'data-testid': 'patch',
        onClick: () => host.state.patchData({ phase: 'completed' }),
      }, String(host.state.getData().phase ?? 'none'))
    }
    const loader: NodeEntryLoader = async () => ({ default: { def: {}, Component: spy } })
    const view = mountSurface('timeu', loader)
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    const props = seen.props
    if (props === null) throw new Error('入口组件没收到 props')
    expect(props.compId).toBe('timeu')
    expect(Object.keys(props)).toEqual(['compId', 'host'])
    const adapter = props.host as unknown as {
      runner: { run: (...args: unknown[]) => unknown }
      actions: { run: (...args: unknown[]) => unknown }
      state: unknown
    }
    expect(typeof adapter.runner.run).toBe('function')
    expect(adapter.actions.run).toBe(adapter.runner.run)
    expect(adapter.state).toBeTruthy()
    expect(view.getByTestId('patch').textContent).toBe('none')
    fireEvent.click(view.getByTestId('patch'))
    await waitFor(() => expect(view.getByTestId('patch').textContent).toBe('completed'))
  })
})

describe('run 的缝：命令面给得了就给，给不了就点名', () => {
  it('没注册命令入口的节点：拒绝理由点名缺的那条缝', () => {
    const plan = planCommandLine('linedup', { action: 'filter' })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toContain('refused linedup')
    expect(plan.reason).toContain('ctx.commands')
    expect(plan.reason).toContain('runNodeOperation')
    expect(plan.reason).toContain('/nodes/linedup/operations')
    // 说清今天只有哪两条，而不是只丢一句"不行"。
    expect(plan.reason).toContain('/sleept')
    expect(plan.reason).toContain('/findz')
  })

  it('送得出去的形状：动作词加它自己的位置参数', () => {
    expect(planCommandLine('sleept', { action: 'status' })).toEqual({ ok: true, line: '/sleept status' })
    expect(planCommandLine('sleept', { action: 'block', minutes: 5 })).toEqual({ ok: true, line: '/sleept block 5' })
    expect(planCommandLine('sleept', { action: 'unblock', minutes: '' })).toEqual({ ok: true, line: '/sleept unblock' })
    expect(planCommandLine('findz', { action: 'open_library', libraryId: 'lib1', libraryRoot: '/tmp/My Comix' })).toEqual({
      ok: true,
      line: '/findz open_library lib1 /tmp/My Comix',
    })
    expect(planCommandLine('findz', { action: 'analyze', libraryId: 'lib1', scopeKind: 'members', deepRetry: true })).toEqual({
      ok: true,
      line: '/findz analyze lib1 members deep',
    })
    expect(planCommandLine('findz', { action: 'query_members', libraryId: 'lib1', archiveId: 7 })).toEqual({
      ok: true,
      line: '/findz query_members lib1 7',
    })
  })

  it('命令面带不了的东西：拒绝并点名，不静默丢掉使用者填的值', () => {
    const extraField = planCommandLine('sleept', { action: 'sleep', allowHibernate: true })
    expect(extraField.ok).toBe(false)
    if (extraField.ok) return
    expect(extraField.reason).toContain('allowHibernate')

    const missingSlot = planCommandLine('findz', { action: 'scan' })
    expect(missingSlot.ok).toBe(false)
    if (missingSlot.ok) return
    expect(missingSlot.reason).toContain('libraryId')

    const unknownAction = planCommandLine('findz', { action: 'treemap_x' })
    expect(unknownAction.ok).toBe(false)

    const noAction = planCommandLine('sleept', { minutes: 5 })
    expect(noAction.ok).toBe(false)
    if (noAction.ok) return
    expect(noAction.reason).toContain('input.action')

    // 非尾部位置参数带空格会被解析成两个参数，那送出去的和使用者填的就不是同一份东西了。
    const spaced = planCommandLine('findz', { action: 'task', libraryId: 'lib 1', taskId: '9' })
    expect(spaced.ok).toBe(false)
  })

  it('经 host 调用：命令行原文、宿主的失败原因、跨节点派发各自都读得回来', async () => {
    const lines: string[] = []
    const events: { type: string; message: string }[] = []
    const seen: { host: Record<string, unknown> } = { host: {} }
    const spy = (props: { host: Record<string, unknown> }) => {
      seen.host = props.host
      return createElement('div', { 'data-testid': 'node-body' }, 'sleept 界面')
    }
    const loader: NodeEntryLoader = async () => ({ default: { def: {}, Component: spy } })
    const runCommand = async (line: string) => {
      lines.push(line)
      return line === '/sleept status'
        ? { ok: true as const, text: 'sleep disabled' }
        : { ok: false as const, reason: 'refused /sleept sleep: gated as dangerous' }
    }
    const view = mountSurface('sleept', loader, panelHost(runCommand))
    await waitFor(() => expect(statusOf(view.container)).toBe('ready'))
    const run = seen.host.runner as unknown as {
      run: (nodeId: string, input: unknown, onEvent?: (event: { type: string; message: string }) => void) => Promise<{ success: boolean; message: string }>
    }

    const done = await run.run('sleept', { action: 'status' }, (event) => events.push(event))
    expect(lines).toEqual(['/sleept status'])
    expect(done).toEqual({ success: true, message: 'sleep disabled' })
    // 命令通道没有事件流：这句得由 adapter 明着说给界面，而不是让进度条静静不动。
    expect(events.map((event) => event.message).join(' ')).toContain('没有 progress 事件流')

    // 节点自己说不（危险闸门在这条缝的宿主侧）：这不是本壳接不了，照原话回成一次失败的运行，
    // 不报假成功、也不冒充成 adapter 抛的错。
    expect(await run.run('sleept', { action: 'sleep' })).toEqual({
      success: false,
      message: 'refused /sleept sleep: gated as dangerous',
    })
    expect(lines).toEqual(['/sleept status', '/sleept sleep'])

    // 本壳接不了的三种：跨节点派发、命令面带不了的字段 —— 都必须是点名缺口的抛出，不是失败态的空文案。
    await expect(run.run('findz', { action: 'api_info' })).rejects.toThrow('这一格挂的是 sleept')
    await expect(run.run('sleept', { action: 'status', minutes: 3 })).rejects.toThrow('minutes')
    const surfaceStillThere = view.container.querySelector('.xaihi-node-mount')?.getAttribute('data-node-status')
    expect(surfaceStillThere).toBe('ready')
  })

  /**
   * 表与仓内注册的命令入口必须相等。
   * 今天实测两条：`findz`（plugins/findz/src/index.ts:312-313）与 `sleept`（plugins/sleept/src/index.ts:221-222）。
   * 哪个节点新增 `ctx.commands.register` 而这张表没接，`run` 就会继续报缺缝 —— 那条判据当场红。
   */
  it('COMMAND_SEAMS 与仓内注册的命令集合相等', () => {
    const extract = (source: string): string[] =>
      [...source.matchAll(/commands\.register\(\{[\s\S]{0,120}?name:\s*['"]([^'"]+)['"]/g)].map((match) => match[1] as string)

    // 抽取器自己的阳性对照：两种写法都得看得见，全看不见就是这把尺不存在。
    expect(extract("ctx.effect(() => ctx.commands.register({\n  name: 'demo',\n}))")).toEqual(['demo'])
    expect(extract('ctx.commands.register({ name: "other" })')).toEqual(['other'])
    expect(extract('const nothing = 1')).toEqual([])

    const pluginsDir = join(import.meta.dirname, '../../../plugins')
    const registered = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const file = join(pluginsDir, entry.name, 'src/index.ts')
        return existsSync(file) ? extract(readFileSync(file, 'utf8')) : []
      })
      .sort()
    // 读数本身也得是这两条：路径或正则漂了会让上面那条 deepEqual 变成空对空。
    expect(registered).toEqual(['findz', 'sleept'])
    expect(Object.keys(COMMAND_SEAMS).sort()).toEqual(registered)
  })
})

/**
 * 壳那一格：两条来源在同一条导航里，坏的那一格不把壳带走。
 *
 * 默认选中的永远是**远程**那一条（远程在先），所以这里没有任何一测会去碰真注册表——
 * 那 12 份入口今天在这个环境里全都装不起来（实测 vitest：`Failed to resolve import
 * "@radix-ui/react-tabs" from "src/components/ui/tabs.tsx"`、`"zod" from "../shared/src/index.ts"`、
 * sleept 另加按设计不给解析的 `@xiranite/node-sleept/duration`），
 * 那是搬运那侧还欠的依赖边，判"我的接线在不在"不该借它当分母。
 */
describe('壳里的导航', () => {
  const remotePanel = (id: string): PanelContribution => ({
    id,
    title: { zh: `${id} 远程面板`, en: `${id} remote panel` },
    area: 'workspace',
    remote: 'not-registered-remote',
    export: 'Panel',
  })

  const workspaceDocument = (panels: PanelContribution[]) => ({
    schema: 'xaihi.workspace/1',
    revision: 'r1',
    plugins: [{
      package: '@hibernalglow/xaihi-example',
      remotes: {},
      manifest: { schema: 'xaihi.manifest/1', id: 'example', panels },
    }],
  })

  const renderShell = (panels: PanelContribution[]) => {
    vi.stubGlobal('fetch', (async () => ({
      ok: true,
      status: 200,
      json: async () => workspaceDocument(panels),
    })) as unknown as typeof fetch)
    return render(createElement(WorkspaceRoot, { t, locale: 'zh', renderSlot: () => null, runCommand: async () => ({ ok: true as const, text: '' }) }))
  }

  it('装载失败的远程格只显示自己的原因，全部 in-realm 行仍在导航里', async () => {
    const view = renderShell([remotePanel('alpha')])
    // 先看见"正在装载"，再看见原因：两条都是壳自己扛异步的结果（SKILL.md「壳负责所有异步状态」）。
    await waitFor(() => expect(view.getByText('panel.loading')).toBeTruthy())
    await waitFor(() => expect(view.container.textContent).toContain('is not registered by any installed plugin'))
    // 壳没被带走：导航、标题条那枚失败标记、以及全部 in-realm 行都还在。
    expect(view.container.querySelector('.xaihi-node-chrome-bar')?.textContent).toContain('panel.failed')
    const sources = [...view.container.querySelectorAll('nav button')].map((button) => button.getAttribute('data-panel-source'))
    expect(sources).toHaveLength(1 + REGISTERED.length)
    expect(sources.filter((source) => source === 'in-realm')).toHaveLength(REGISTERED.length)
    expect(sources.filter((source) => source === 'remote')).toEqual(['remote'])
  })

  it('清单面板 id 与注册表撞车时，导航里那一条说明代替两行按钮', async () => {
    const view = renderShell([remotePanel('alpha'), remotePanel('sleept')])
    await waitFor(() => expect(view.container.querySelectorAll('nav button')).toHaveLength(REGISTERED.length))
    // 1 条远程(alpha) + 11 条 in-realm：撞车的两边都不给点，而不是后写的盖掉先写的。
    expect(view.container.textContent).toContain('面板 id sleept 同时由插件清单与 @hibernalglow/xaihi-ui 的 in-realm 注册表贡献')
    expect(view.container.textContent).not.toContain('sleept 远程面板')
    expect(view.container.textContent).not.toContain('休眠管理')
    const sources = [...view.container.querySelectorAll('nav button')].map((button) => button.getAttribute('data-panel-source'))
    expect(sources.filter((source) => source === 'in-realm')).toHaveLength(REGISTERED.length - 1)
    expect(sources.filter((source) => source === 'remote')).toEqual(['remote'])
  })

  it('点 in-realm 那一行 ⇒ 换成本包注册表挂载，而不是去装载一个不存在的 remote', async () => {
    const view = renderShell([remotePanel('alpha')])
    await waitFor(() => expect(view.container.textContent).toContain('is not registered by any installed plugin'))
    const row = [...view.container.querySelectorAll('nav button')].find((button) => button.textContent === '休眠管理')
    if (row === undefined) throw new Error('导航里没有 sleept 那一行')
    fireEvent.click(row)
    await waitFor(() => expect(view.container.querySelector('.xaihi-node-mount')).toBeTruthy())
    // 换格之后走的是注册表那条路：装载器那句"remote 未注册"不该再出现在主区。
    expect(view.container.querySelector('.xaihi-node-mount')?.getAttribute('data-node-id')).toBe('sleept')
    expect(view.container.textContent).not.toContain('is not registered by any installed plugin')
    expect(nodeMountRecord()?.id).toBe('sleept')
  })

  it('区域不是 workspace 的贡献照旧被挡在外面，in-realm 那些不受影响', async () => {
    const view = renderShell([{ ...remotePanel('side-only'), area: 'side' }])
    await waitFor(() => expect(view.container.querySelectorAll('nav button')).toHaveLength(REGISTERED.length))
    expect(view.container.textContent).not.toContain('side-only 远程面板')
  })
})
