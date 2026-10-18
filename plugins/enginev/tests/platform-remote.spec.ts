/**
 * enginev 的**远程地址**这一条：`\\host\share\sub` 在 macOS 上翻译到挂载点，
 * 没挂起来就响亮拒绝（不许退化成"路径不存在"，也不许假装扫到了空目录）。
 *
 * 这条不是从上游搬来的：上游只吃本机绝对路径。加它的理由是**数据在另一台机器上**
 * （实测现场：macOS 上的宿主 + Windows 上的
 * `D:\scoop\persist\steam\steamapps\common\wallpaper_engine\projects\backup`），
 * 而本仓能用的缝只有本机 `node:fs` ⇒ 做法是翻译到已有挂载点，不是自己写一个 SMB 客户端。
 *
 * 期望值全部手写；`volumeRoot` 注入到临时目录，所以**不碰本机真实的 `/Volumes`**。
 * 每条都有阳性对照：把"能翻译"和"该拒绝"两侧都钉住，只钉一侧的尺在这类功能上等于不存在。
 *
 * @module xaihi-enginev/tests/platform-remote
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runEngineV } from '../src/core.ts'
import { createNodeEngineVRuntime, parseRemoteAddress, translateWorkshopAddress } from '../src/platform.ts'

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

async function tempDir (prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

/** 造一个"已经挂好的共享"：`<root>/<share>/111/project.json`。 */
async function fakeMountedShare (share: string, id = '111'): Promise<{ root: string; folder: string }> {
  const root = await tempDir('enginev-remote-')
  const folder = join(root, share, id)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'project.json'), JSON.stringify({ title: 'Remote One', type: 'scene' }), 'utf8')
  return { root, folder }
}

describe('远程地址的解析：认哪些形状，不认哪些', () => {
  it('UNC 与 smb:// 两种写法都认，host / share / rest 拆得对，rest 统一成正斜杠', () => {
    expect(parseRemoteAddress('\\\\100.122.176.77\\we\\111')).toEqual({ host: '100.122.176.77', share: 'we', rest: '111' })
    expect(parseRemoteAddress('\\\\BOX\\we\\a\\b')).toEqual({ host: 'BOX', share: 'we', rest: 'a/b' })
    expect(parseRemoteAddress('smb://100.122.176.77/we/111')).toEqual({ host: '100.122.176.77', share: 'we', rest: '111' })
    expect(parseRemoteAddress('smb://30902@100.122.176.77/we')).toEqual({ host: '100.122.176.77', share: 'we', rest: '' })
  })

  it('阳性对照：本机路径与 POSIX 的双斜杠路径都不许被当成远程', () => {
    expect(parseRemoteAddress('/Volumes/we/111')).toBeNull()
    expect(parseRemoteAddress('/Users/glow/Base/Code/Freya/Xaihi')).toBeNull()
    expect(parseRemoteAddress('D:\\scoop\\persist\\steam\\steamapps')).toBeNull()
    // 单个 `/` 开头、乃至 `//tmp/x` 这种 POSIX 双斜杠，都不是 Windows UNC
    expect(parseRemoteAddress('//tmp/x')).toBeNull()
    expect(parseRemoteAddress('')).toBeNull()
    expect(parseRemoteAddress('   ')).toBeNull()
  })
})

describe('翻译到挂载点：挂上了就用，没挂就拒绝', () => {
  it('macOS + 已挂载：落到 <volumeRoot>/<share>/<rest>，路径真的过得去', async () => {
    const { root, folder } = await fakeMountedShare('we')
    expect(translateWorkshopAddress('\\\\host\\we\\111', { platform: 'darwin', volumeRoot: root })).toBe(folder)
    expect(translateWorkshopAddress('smb://host/we/111', { platform: 'darwin', volumeRoot: root })).toBe(folder)
    // 只给到共享根也成立
    expect(translateWorkshopAddress('\\\\host\\we', { platform: 'darwin', volumeRoot: root })).toBe(join(root, 'we'))
  })

  it('macOS + 没挂载：**抛**，且文案点名原始地址、挂载命令与目标路径（不是一句"不存在"）', async () => {
    const root = await tempDir('enginev-unmounted-')
    let message = ''
    try {
      translateWorkshopAddress('\\\\100.122.176.77\\we\\111', { platform: 'darwin', volumeRoot: root })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toBe('')
    expect(message).toContain('\\\\100.122.176.77\\we')
    expect(message).toContain('smb://100.122.176.77/we')
    expect(message).toContain('mount_smbfs')
    expect(message).toContain(join(root, 'we', '111'))
    // 反面对照：这不是内核那句"路径不存在"，别让两件事在界面上读成同一句
    expect(message).not.toContain('Workshop path does not exist')
  })

  it('Windows：UNC 原样返回（哪怕没挂载）——UNC 在那儿本来就是合法路径', async () => {
    const root = await tempDir('enginev-win-')
    const raw = '\\\\100.122.176.77\\we\\111'
    expect(translateWorkshopAddress(raw, { platform: 'win32', volumeRoot: root })).toBe(raw)
  })

  it('linux 之类的平台：远程地址是响亮拒绝，不是安静改路', () => {
    expect(() => translateWorkshopAddress('\\\\host\\we', { platform: 'linux', volumeRoot: '/nope' })).toThrow(/只支持 Windows/)
  })
})

describe('真盘上的整条路（runEngineV → scan）：远程地址扫得到，没挂起来读得回原因', () => {
  it('已挂载的共享：scan 走通，返回的 path 就是翻译后的本机路径', async () => {
    const { root, folder } = await fakeMountedShare('we')
    const result = await runEngineV(
      { action: 'scan', workshopPath: '\\\\100.122.176.77\\we' },
      createNodeEngineVRuntime({ volumeRoot: root }),
    )
    expect(result.success).toBe(true)
    expect(result.data?.totalCount).toBe(1)
    expect(result.data?.wallpapers[0]?.title).toBe('Remote One')
    expect(result.data?.wallpapers[0]?.path).toBe(folder)
  })

  it('没挂载：整次失败 + errors 里是那句挂载提示；阳性对照是"挂上同一个 share 立刻就扫得到"', async () => {
    const share = 'we'
    const before = await tempDir('enginev-unmounted2-')
    const refused = await runEngineV(
      { action: 'scan', workshopPath: `\\\\100.122.176.77\\${share}` },
      createNodeEngineVRuntime({ volumeRoot: before }),
    )
    expect(refused.success).toBe(false)
    expect(refused.data?.errors[0]).toContain('smb://100.122.176.77/we')
    expect(refused.data?.totalCount).toBe(0)

    const { root } = await fakeMountedShare(share)
    const accepted = await runEngineV(
      { action: 'scan', workshopPath: `\\\\100.122.176.77\\${share}` },
      createNodeEngineVRuntime({ volumeRoot: root }),
    )
    expect(accepted.success).toBe(true)
    expect(accepted.data?.totalCount).toBe(1)
  })
})
