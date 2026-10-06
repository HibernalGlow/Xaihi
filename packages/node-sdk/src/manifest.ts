/**
 * `package.json#xaihi` —— 插件贡献清单（`xaihi.manifest/1`）。
 *
 * 为什么不直接暴露组件名：组件重命名会破坏已安装的插件。清单声明的是贡献点
 * （面板、插槽填充、设置页），`remote` + `export` 只是当前实现地址，宿主负责
 * 解析，插件与宿主之间稳定的契约是 `id`。
 *
 * 校验器返回全部错误而不是首次抛出：装载期一次报清一个插件的全部清单问题，
 * 比让人逐条试出来有用。不认识的 schema 版本一律拒绝，绝不静默降级。
 *
 * @module xaihi-sdk/manifest
 */

/** 清单格式标识，写进每个插件包，装载期严格比对。 */
export const MANIFEST_SCHEMA = 'xaihi.manifest/1' as const

/** 中英双语文案；两个键都必填，缺一种语言就是清单错误而不是运行期回退。 */
export interface LocalizedText {
  zh: string
  en: string
}

/** 面板落在工作台的哪个区域。 */
export type PanelArea = 'workspace' | 'side' | 'status'

/** 一个可被宿主打开的面板。 */
export interface PanelContribution {
  /** 稳定标识，工作台按它寻址；不是组件名。 */
  id: string
  /** 标题（双语）。 */
  title: LocalizedText
  /** 面板区域。 */
  area: PanelArea
  /** UI 模块 remote 名；由宿主解析成实际地址。 */
  remote: string
  /** remote 暴露的模块导出名。 */
  export: string
  /** 同区域内排序，小的靠前。 */
  order?: number
  /** 需要宿主具备的能力名（缺失时面板显示不可用，而不是崩溃）。 */
  requires?: string[]
}

/** 往某个已声明插槽填一个组件；`slot` 是宿主声明的键。 */
export interface SlotFillContribution {
  /** 宿主声明的插槽键。 */
  slot: string
  /** keyed/list 槽的键或 id。 */
  key?: string
  remote: string
  export: string
  order?: number
}

/** 插件自有设置页，由宿主的设置容器渲染。 */
export interface SettingsContribution {
  id: string
  title: LocalizedText
  remote: string
  export: string
}

/** 插件自带的 UI 产物位置（宿主按它开文件路由）。 */
export interface UiBundleDeclaration {
  /** remote 名；贡献点里的 `remote` 必须等于它。 */
  remote: string
  /** 包内相对路径，指向 remote 入口文件；不允许 `..` 或绝对路径。 */
  entry: string
}

/** 插件清单根对象。 */
export interface XaihiManifest {
  schema: typeof MANIFEST_SCHEMA
  /** 命名空间 id，必须与该插件 cordis.patch.yml 行的 `id` 一致。 */
  id: string
  /** 显示名（双语）。 */
  title?: LocalizedText
  /** UI 产物声明；缺失表示纯后端插件。 */
  ui?: UiBundleDeclaration
  panels?: PanelContribution[]
  slotFills?: SlotFillContribution[]
  settings?: SettingsContribution[]
}

/** 校验结果：成功带归一化值，失败带全部原因。 */
export type ManifestValidation =
  | { ok: true; value: XaihiManifest }
  | { ok: false; errors: string[] }

const areStringPairs = (value: unknown): value is LocalizedText =>
  typeof value === 'object' && value !== null
  && typeof (value as LocalizedText).zh === 'string'
  && typeof (value as LocalizedText).en === 'string'

const isPanelArea = (value: unknown): value is PanelArea =>
  value === 'workspace' || value === 'side' || value === 'status'

/**
 * 校验一份贡献清单。
 * @param raw - 通常来自 `package.json` 的 `xaihi` 键，接受任何未知形状。
 * @returns 归一化清单，或全部错误原因。
 */
export function validateManifest(raw: unknown): ManifestValidation {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be an object'] }
  }
  const manifest = raw as Partial<XaihiManifest>

  if (manifest.schema !== MANIFEST_SCHEMA) {
    // 拒绝而不是降级：不认识版本意味着字段语义未知，静默继续会渲染出半对的东西。
    return {
      ok: false,
      errors: [`unsupported manifest schema: ${String(manifest.schema)} (expected ${MANIFEST_SCHEMA})`],
    }
  }
  if (typeof manifest.id !== 'string' || manifest.id === '') {
    errors.push('manifest.id must be a non-empty string')
  }
  if (manifest.title !== undefined && !areStringPairs(manifest.title)) {
    errors.push('manifest.title must carry both zh and en')
  }

  const seenPanelIds = new Set<string>()
  for (const [index, panel] of (manifest.panels ?? []).entries()) {
    const at = `panels[${index}]`
    if (typeof panel?.id !== 'string' || panel.id === '') errors.push(`${at}.id is required`)
    else if (seenPanelIds.has(panel.id)) errors.push(`${at}.id duplicates "${panel.id}"`)
    else seenPanelIds.add(panel.id)
    if (!areStringPairs(panel?.title)) errors.push(`${at}.title must carry both zh and en`)
    if (!isPanelArea(panel?.area)) errors.push(`${at}.area must be workspace | side | status`)
    if (typeof panel?.remote !== 'string' || panel.remote === '') errors.push(`${at}.remote is required`)
    if (typeof panel?.export !== 'string' || panel.export === '') errors.push(`${at}.export is required`)
    if (panel?.order !== undefined && typeof panel.order !== 'number') errors.push(`${at}.order must be a number`)
    if (panel?.requires !== undefined
      && (!Array.isArray(panel.requires) || panel.requires.some((name) => typeof name !== 'string'))) {
      errors.push(`${at}.requires must be an array of capability names`)
    }
  }

  for (const [index, fill] of (manifest.slotFills ?? []).entries()) {
    const at = `slotFills[${index}]`
    if (typeof fill?.slot !== 'string' || fill.slot === '') errors.push(`${at}.slot is required`)
    if (typeof fill?.remote !== 'string' || fill.remote === '') errors.push(`${at}.remote is required`)
    if (typeof fill?.export !== 'string' || fill.export === '') errors.push(`${at}.export is required`)
  }

  for (const [index, setting] of (manifest.settings ?? []).entries()) {
    const at = `settings[${index}]`
    if (typeof setting?.id !== 'string' || setting.id === '') errors.push(`${at}.id is required`)
    if (!areStringPairs(setting?.title)) errors.push(`${at}.title must carry both zh and en`)
    if (typeof setting?.remote !== 'string' || setting.remote === '') errors.push(`${at}.remote is required`)
    if (typeof setting?.export !== 'string' || setting.export === '') errors.push(`${at}.export is required`)
  }

  const declaredRemotes = new Set<string>()
  const hasContributions = (manifest.panels?.length ?? 0) > 0
    || (manifest.slotFills?.length ?? 0) > 0
    || (manifest.settings?.length ?? 0) > 0
  if (manifest.ui !== undefined) {
    if (typeof manifest.ui !== 'object' || manifest.ui === null) {
      errors.push('manifest.ui must be an object with remote and entry')
    } else {
      const ui = manifest.ui
      if (typeof ui.remote !== 'string' || ui.remote === '') errors.push('manifest.ui.remote is required')
      else declaredRemotes.add(ui.remote)
      if (typeof ui.entry !== 'string' || ui.entry === '') {
        errors.push('manifest.ui.entry is required')
      } else if (ui.entry.startsWith('/') || ui.entry.includes('..')) {
        // 入口必须是包内相对路径：宿主按它开文件路由，绝对路径或 `..` 会把路由变成任意文件读取。
        errors.push(`manifest.ui.entry must be package-relative without ".." (got "${ui.entry}")`)
      }
    }
  } else if (hasContributions) {
    errors.push('manifest declares UI contributions but no ui bundle, so nothing can load them')
  }
  for (const [kind, ref] of [
    ...((manifest.panels ?? []).map((panel) => ['panels', panel.remote] as const)),
    ...((manifest.slotFills ?? []).map((fill) => ['slotFills', fill.remote] as const)),
    ...((manifest.settings ?? []).map((setting) => ['settings', setting.remote] as const)),
  ]) {
    if (typeof ref === 'string' && ref !== '' && !declaredRemotes.has(ref)) {
      errors.push(`${kind} references undeclared remote "${ref}" (declared: ${[...declaredRemotes].join(', ') || 'none'})`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: manifest as XaihiManifest }
}
