/**
 * `/xaihi/*` 路由的证伪测试：穿越、后缀白名单、rev 失效都必须可见失败。
 * rev 是路径的一段（`/xaihi/remotes/<slug>/<rev>/<file>`），因为打包器推导同级
 * chunk 的 URL 时会丢掉查询串——这条形状由 chunk 请求的用例守住。
 * @module xaihi-core/tests/routes
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { MANIFEST_SCHEMA, type WorkspaceDocument, type XaihiManifest } from '@hibernalglow/xaihi-sdk'
import { manifestHandler, remoteHandler, renderUiDocument, resolveServedFile, resolveUiFile, uiBundleHandler } from '../src/routes.ts'
import type { ServedRegistration } from '../src/registry.ts'

const tree = realpathSync(fileURLToPath(new URL('./fixtures/remote-tree/', import.meta.url)))
const manifest: XaihiManifest = { schema: MANIFEST_SCHEMA, id: 'xaihi-fixture' }
const REV = '0123456789ab'
const SLUG = 'fixture__xaihi-thing'

const registration: ServedRegistration = {
  package: '@fixture/xaihi-thing',
  slug: SLUG,
  manifest,
  frontendDir: tree,
  entryFile: 'remoteEntry.js',
  rev: REV,
  remote: 'fixture',
}

const source = {
  registrations: () => [registration],
  document: (): WorkspaceDocument => ({ schema: 'xaihi.workspace/1', rev: REV, plugins: [], ui: { documentUrl: '', rev: 'missing' } }),
}

class FakeResponse {
  status = 0
  headers: Record<string, string> = {}
  body = ''
  writeHead(status: number, headers: Record<string, string>): void {
    this.status = status
    this.headers = headers
  }
  end(body?: string | Buffer): void {
    this.body = typeof body === 'string' ? body : ''
  }
}

const call = (handler: (req: IncomingMessage, res: ServerResponse) => void, url: string, method = 'GET') => {
  const res = new FakeResponse()
  handler({ url, method } as unknown as IncomingMessage, res as unknown as ServerResponse)
  return res
}

const fileUrl = (file: string, rev = REV) => `/xaihi/remotes/${SLUG}/${rev}/${file}`

describe('resolveServedFile', () => {
  it('服务同级 chunk（一个 UI 容器不止一个文件）', () => {
    expect(resolveServedFile(registration, 'chunk.js')).toBe(`${tree}/chunk.js`)
  })

  it('拒绝穿越到产物目录之外', () => {
    expect(resolveServedFile(registration, '../outside-of-tree.txt')).toBeNull()
    expect(resolveServedFile(registration, 'a/../../outside-of-tree.txt')).toBeNull()
    expect(resolveServedFile(registration, '/etc/passwd')).toBeNull()
  })

  it('拒绝白名单之外的后缀', () => {
    expect(resolveServedFile(registration, 'notes.txt')).toBeNull()
  })
})

describe('remoteHandler', () => {
  it('rev 匹配时按 JS 发产物并标 immutable', () => {
    const res = call(remoteHandler(source), fileUrl('remoteEntry.js'))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/javascript')
    expect(res.headers['cache-control']).toContain('immutable')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('打包器推导出的同级 chunk URL（无查询串）也能取到', () => {
    const res = call(remoteHandler(source), fileUrl('__federation_expose_Panel.js'.replace('__federation_expose_Panel.js', 'chunk.js')))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/javascript')
  })

  it('rev 过期一律 404（陈旧 rev 若被接受，症状会是面板空白）', () => {
    const res = call(remoteHandler(source), fileUrl('remoteEntry.js', 'stalestalest'))
    expect(res.status).toBe(404)
    expect(res.body).toContain(`current ${REV}`)
  })

  it('缺 rev 段的旧式 ?rev= 请求不再被接受', () => {
    expect(call(remoteHandler(source), `/xaihi/remotes/${SLUG}/remoteEntry.js?rev=${REV}`).status).toBe(404)
  })

  it('未登记的插件与穿越路径都是 404', () => {
    expect(call(remoteHandler(source), '/xaihi/remotes/nobody/0123456789ab/remoteEntry.js').status).toBe(404)
    expect(call(remoteHandler(source), fileUrl('..%2Foutside-of-tree.txt')).status).toBe(404)
  })

  it('HEAD 只回头不回头体', () => {
    const res = call(remoteHandler(source), fileUrl('chunk.js'), 'HEAD')
    expect(res.status).toBe(200)
    expect(res.body).toBe('')
  })

  it('POST 被拒', () => {
    expect(call(remoteHandler(source), fileUrl('chunk.js'), 'POST').status).toBe(405)
  })
})

describe('manifestHandler', () => {
  it('清单禁止缓存，装卸节点后无需刷新页面即可见', () => {
    const res = call(manifestHandler(source), '/xaihi/manifest.json')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.body).schema).toBe('xaihi.workspace/1')
  })
})

describe('uiBundleHandler（ADR-0009 那一刀的文档侧）', () => {
  const uiSource = { dir: () => tree, rev: () => REV }
  const uiUrl = (file: string, rev = REV) => `/xaihi/ui/${rev}/${file}`

  it('文档壳按 HTML 出、禁缓存，并把 rev 烧进 boot 对象', () => {
    const res = call(uiBundleHandler(uiSource), uiUrl('index.html'))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain('"rev":"0123456789ab"')
    expect(res.body).toContain('./main.js')
  })

  it('产物目录没配时是 503 并点名配置项，而不是掉进 rev 不匹配的 404', () => {
    const res = call(uiBundleHandler({ dir: () => '', rev: () => 'missing' }), '/xaihi/ui/0123456789ab/index.html')
    expect(res.status).toBe(503)
    expect(res.body).toContain('core.uiBundleDir')
  })

  it('陈旧 rev 一律 404（文档壳钉着 rev，接受旧 rev 会让界面停留在旧产物上）', () => {
    const res = call(uiBundleHandler(uiSource), uiUrl('index.html', 'stalestalest'))
    expect(res.status).toBe(404)
    expect(res.body).toContain(`current ${REV}`)
  })

  it('rev 不是 12 位十六进制时不进 boot 对象（它会被写进内联脚本）', () => {
    const hostile = { dir: () => tree, rev: () => 'a";alert(1);//' }
    expect(call(uiBundleHandler(hostile), '/xaihi/ui/whatever/index.html').status).toBe(404)
    expect(renderUiDocument('a";alert(1;//')).not.toContain('alert')
  })

  // 这一条专门守"当前 rev 自己就不是十六进制"那一格：只比 requested !== rev 是不够的，
  // 因为此时两边可以相等，然后 200 一份什么都装不出来的 HTML。
  it('当前 rev 本身不可用时是 404 并说 unreadable，而不是 200 一份空壳', () => {
    const broken = { dir: () => tree, rev: () => 'missing' }
    const res = call(uiBundleHandler(broken), '/xaihi/ui/missing/index.html')
    expect(res.status).toBe(404)
    expect(res.body).toContain('current unreadable')
  })

  // ADR-0011 决定 3：节点各自成窗 = 同一份文档 + 寻址参数，所以参数要能进 boot 而不能进路径。
  it('?node= 被原样带进 boot 对象（同一份产物开不同节点的窗）', () => {
    const res = call(uiBundleHandler(uiSource), `${uiUrl('index.html')}?node=sleept`)
    expect(res.status).toBe(200)
    expect(res.body).toContain('"node":"sleept"')
    expect(call(uiBundleHandler(uiSource), uiUrl('index.html')).body).not.toContain('"node"')
  })

  it('节点段形状不合法就 400，且不落进内联脚本（它是会被执行的字符串）', () => {
    const res = call(uiBundleHandler(uiSource), `${uiUrl('index.html')}?node=${encodeURIComponent('a";alert(1;//')}`)
    expect(res.status).toBe(400)
    expect(res.body).not.toContain('alert(1')
    expect(res.body).toContain('[a-z0-9]')
    expect(renderUiDocument(REV, '')).not.toContain('"node"')
  })

  it('目录里的 HTML 不出门：只有文档壳这一份 text/html 是代码生成的', () => {
    expect(call(uiBundleHandler(uiSource), uiUrl('notes.txt')).status).toBe(404)
    expect(resolveUiFile(tree, 'remoteEntry.js')).toBe(`${tree}/remoteEntry.js`)
  })

  it('穿越与缺段都被拒（与 remote 那条面同一条闸）', () => {
    expect(call(uiBundleHandler(uiSource), uiUrl('..%2Foutside-of-tree.txt')).status).toBe(404)
    expect(call(uiBundleHandler(uiSource), '/xaihi/ui/').status).toBe(404)
    expect(call(uiBundleHandler(uiSource), `/xaihi/ui/${REV}`).status).toBe(404)
    expect(call(uiBundleHandler(uiSource), uiUrl('chunk.js'), 'POST').status).toBe(405)
  })
})
