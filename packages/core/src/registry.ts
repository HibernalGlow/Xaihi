/**
 * Xaihi 包发现与清单聚合。
 *
 * 发现方式不靠扫 node_modules：loader 的插件行才是"已安装且已启用"的权威来源
 * （行由每个插件自己的 cordis.patch.yml 插入，DSH 的 Plugins 页按行开关）。
 * 因此调用方把行里的包 specifier 交进来，本模块只负责定位包、校验清单、
 * 计算 UI 产物的修订号。
 *
 * 单个插件清单坏掉不会拖垮宿主：登记为带 problems 的记录，聚合文档里照样
 * 可见，UI 能显示"这个插件的清单读不了"，与 DSH 自己的 problem tag 一致。
 *
 * @module xaihi-core/registry
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { validateManifest, type UiBundleFace, type WorkspaceDocument, type XaihiManifest } from '@hibernalglow/xaihi-sdk'

/** 已定位的包：package.json 路径与其解析结果。 */
export interface LocatedPackage {
  pkgPath: string
  pkg: Record<string, unknown>
}

/** specifier → 包位置；找不到时返回 undefined（未安装或行写错）。 */
export type PackageLocator = (specifier: string) => LocatedPackage | undefined

/** 一个可服务的插件登记项。 */
export interface ServedRegistration {
  package: string
  /** 路由段用的安全名。 */
  slug: string
  manifest: XaihiManifest
  /** UI 产物根目录的绝对路径（已 realpath）。 */
  frontendDir: string
  /** 入口文件名，相对 frontendDir。 */
  entryFile: string
  /** UI 产物修订号。 */
  rev: string
  /** 清单声明的 remote 名（可能缺失，纯后端插件）。 */
  remote?: string
  /** 有则代表该包不可用，其余字段除 package/slug 外可忽略。 */
  problems?: string[]
}

const REV_PATH_CAP = 2000

/** 把包名变成路由安全的单段名。 */
export function slugOf(specifier: string): string {
  return specifier.replace(/^@/, '').replace(/[/.]+/g, '__')
}

/**
 * 计算 UI 产物修订号：对目录内 (相对路径, 字节数, mtimeMs) 排序后取框定哈希。
 * 与 DSH 0.2.0 的 plugin-artifact 修订同源（不读内容，只看 stat），差别是这里
 * 覆盖整棵产物树，因为一个 remote 由多个文件组成。
 * @param root - 产物根目录（已 realpath）。
 * @returns 12 位十六进制摘要。
 */
export function computeRev(root: string): string {
  const rows: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (rows.length >= REV_PATH_CAP) return
      const absolute = join(dir, name)
      const relative = prefix === '' ? name : `${prefix}/${name}`
      const stat = statSync(absolute)
      if (stat.isDirectory()) walk(absolute, relative)
      else rows.push(`${relative}:${stat.size}:${Math.round(stat.mtimeMs)}`)
    }
  }
  walk(root, '')
  return createHash('sha1').update(`xaihi-artifact\u0000${rows.join('\n')}`).digest('hex').slice(0, 12)
}

/**
 * 由 loader 行的 specifier 列表构造登记项。
 * @param specifiers - loader 插件行的 `name` 字段集合。
 * @param locate - 把 specifier 定位到 package.json。
 * @returns 每个声明了 `xaihi` 键的包一条登记项。
 */
export function buildRegistrations(specifiers: string[], locate: PackageLocator): ServedRegistration[] {
  const registrations: ServedRegistration[] = []
  for (const specifier of specifiers) {
    const located = locate(specifier)
    if (!located || located.pkg.xaihi === undefined) continue
    const slug = slugOf(specifier)
    const validation = validateManifest(located.pkg.xaihi)
    if (!validation.ok) {
      registrations.push({
        package: specifier,
        slug,
        problems: validation.errors,
        manifest: { schema: 'xaihi.manifest/1', id: specifier },
        frontendDir: dirname(located.pkgPath),
        entryFile: '',
        rev: 'unreadable',
      })
      continue
    }

    const manifest = validation.value
    const packageRoot = dirname(located.pkgPath)
    if (!manifest.ui) {
      // 纯后端插件：没有 UI 也要登记，聚合文档里它贡献 0 个 remote。
      registrations.push({ package: specifier, slug, manifest, frontendDir: packageRoot, entryFile: '', rev: 'no-ui' })
      continue
    }

    const entryFile = manifest.ui.entry.replace(/^\.\//, '')
    const absoluteEntry = join(packageRoot, entryFile)
    if (!existsSync(absoluteEntry)) {
      registrations.push({
        package: specifier, slug, manifest, problems: [`ui entry not found: ${absoluteEntry} (build the package before installing it)`],
        frontendDir: packageRoot, entryFile, rev: 'missing',
      })
      continue
    }
    const frontendDir = realpathSync(dirname(absoluteEntry))
    const rev = computeRev(frontendDir)
    registrations.push({
      package: specifier,
      slug,
      manifest,
      frontendDir,
      // 路由段相对 frontendDir，所以入口就是它自己的文件名；sibling chunks 与它同级。
      entryFile: basenameOf(entryFile),
      rev,
      remote: manifest.ui.remote,
    })
  }
  return registrations
}

/** 入口文件相对自身目录的名字。 */
function basenameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/**
 * 把登记项折叠成浏览器可消费的文档。
 * @param registrations - buildRegistrations 的结果。
 * @param ui - Xaihi 自己那份 UI 文档此刻的可装载信息（ADR-0009 的那一刀）。
 * @returns 聚合文档；整体 rev 由条目 rev 组成，浏览器可据此判断是否需要重载 remote。
 */
export function buildWorkspaceDocument(registrations: readonly ServedRegistration[], ui: UiBundleFace): WorkspaceDocument {
  const plugins = registrations.map((registration) => {
    const remotes: Record<string, string> = {}
    if (registration.remote && registration.rev !== 'missing' && registration.rev !== 'unreadable') {
      remotes[registration.remote] = `/xaihi/remotes/${registration.slug}/${registration.rev}/${registration.entryFile}`
    }
    return registration.problems
      ? { package: registration.package, manifest: registration.manifest, remotes, problems: registration.problems }
      : { package: registration.package, manifest: registration.manifest, remotes }
  })
  const rev = createHash('sha1')
    .update(`xaihi-workspace\u0000${registrations.map((entry) => `${entry.package}:${entry.rev}`).join('\n')}`)
    .digest('hex').slice(0, 12)
  return { schema: 'xaihi.workspace/1', rev, plugins, ui }
}
