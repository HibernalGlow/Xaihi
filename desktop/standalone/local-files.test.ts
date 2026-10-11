// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createDesktopLocalFiles } from './local-files'

afterEach(() => { document.body.replaceChildren() })

it('uses preload paths for modern Electron Files and routes only to the nearest drop target', async () => {
  const files = new Map<File, string>()
  const cover = new File(['image'], 'cover.png')
  const folder = new File([], 'images')
  files.set(cover, '/tmp/kisaki/cover.png')
  files.set(folder, '/tmp/kisaki/images')
  const pathFor = vi.fn((file: File) => files.get(file) ?? '')
  const capability = createDesktopLocalFiles({ __DSH_HOST_PATHS__: { pathFor } }, document)
  document.body.innerHTML = '<section data-local-file-drop-target="included"><span>drop here</span><section data-local-file-drop-target="excluded"></section></section>'
  const included = vi.fn()
  const excluded = vi.fn()
  const releaseIncluded = await capability.subscribeDrops!('included', included)
  const releaseExcluded = await capability.subscribeDrops!('excluded', excluded)
  const drop = (target: Element) => {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [cover, folder, cover] } })
    target.dispatchEvent(event)
  }
  drop(document.querySelector('span')!)
  await Promise.resolve()
  expect(included).toHaveBeenCalledExactlyOnceWith(['/tmp/kisaki/cover.png', '/tmp/kisaki/images'])
  expect(excluded).not.toHaveBeenCalled()
  expect((cover as File & { path?: string }).path).toBeUndefined()
  drop(document.querySelector('[data-local-file-drop-target="excluded"]')!)
  await Promise.resolve()
  expect(excluded).toHaveBeenCalledExactlyOnceWith(['/tmp/kisaki/cover.png', '/tmp/kisaki/images'])
  expect(included).toHaveBeenCalledTimes(1)
  releaseIncluded()
  releaseExcluded()
  drop(document.querySelector('span')!)
  await Promise.resolve()
  expect(included).toHaveBeenCalledTimes(1)
})

it('detects available native pickers and exposes cancellation as no selection', async () => {
  const pickFiles = vi.fn(async () => ['/tmp/a.png'])
  const local = createDesktopLocalFiles({
    __XAIHI_LOCAL_FILES__: { pickFiles },
    __DSH_DIRECTORY_PICKER__: { pick: async () => null },
  }, document)
  expect(await local.pickFiles!({ title: '选择文件' })).toEqual(['/tmp/a.png'])
  expect(pickFiles).toHaveBeenCalledWith({ title: '选择文件' })
  expect(await local.pickDirectory!()).toBeUndefined()
  const web = createDesktopLocalFiles({}, document)
  expect(web.pickFiles).toBeUndefined()
  expect(web.subscribeDrops).toBeUndefined()
})
