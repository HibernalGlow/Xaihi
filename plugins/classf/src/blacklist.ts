/**
 * classf 的黑名单标签判定，从 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/classf/src/blacklist.ts`（72 行）搬来。七条导出、判据、
 * `[社团 (画师)]` 的切法、"只剥最外层方/圆括号"的循环、去重函数全部原样，
 * `core.ts:268` 靠它决定一个画师进 `del` 还是 `wait`。
 *
 * 两处改动，都在下面点名：
 * 1. 第 1 行 `@xiranite/node-samea/core` → `./samea-core.ts`（那两个纯函数的副本，
 *    理由与缺口见那个文件的头注释）。
 * 2. 第 2 行的 `opencc-js/t2cn` **没有随本包发布**，因此
 *    `normalizeClassfBlacklistText` 现在只做小写化，**不再做繁→简折字**。
 *   为什么不是"顺手找个内置办法替代"：上游那句是
 *   `OpenCC.Converter({ from: "t", to: "cn" })`，靠的是 opencc 那份繁简词典。
 *   Node 没有内置繁简转换（`String.prototype.normalize` 只管组合等价，不管汉字异形），
 *   自己写一张表就是发明一条上游没有的判定。按本次口径，**新依赖要提出来给人批**，
 *   所以这里落一条**可见的退化**而不是假装有词典：
 *   - 判据变化只有一种：黑名单里写简体、标签是繁体（或反之）时**不再互相命中**
 *     （上游 `blacklist.test.ts:30-35` 那四条里有两条正是这个方向）。
 *   - 大小写、`[社团]` / `[画师]` 拆分、包含匹配（`includes`）三条判据不变。
 *   - 退化状态由 `CLASSF_BLACKLIST_FOLDING` 说出去：宿主半边的工具输出与运行账本
 *     都带这一行（`src/index.ts`），终端面印在结果之后（`src/cli.ts`），
 *     所以它是"读得回来的降级"，不是注释里的一句话（ADR-0011 决定 4）。
 *
 * @module xaihi-classf/blacklist
 */

import { extractArtist, normalizeSameaInput } from './samea-core.ts'

/**
 * 默认黑名单标签。这份**定义住在这里**（不是 core.ts 里那份的副本）：
 * 搬来的界面三处都从 `@xiranite/node-classf/blacklist` 取它
 * （`packages/ui-host/src/nodes/classf/{Component,BlacklistKeywordsEditor,ClassfBlacklistQuickAddDialog}.tsx`），
 * 而本包 `core.ts` 早就把其余六条判据做成"叶子定义、core 再导出"的形状，
 * 只有这一条常量还留在 core 里 ⇒ 界面那条边指不到东西（文档构建报
 * `export 'DEFAULT_CLASSF_BLACKLIST_KEYWORDS' ... not found in '@xiranite/node-classf/blacklist'` ×3）。
 * 数组字面量与基线逐字符相同（noxide `core.ts:123` 与上游当下 `blacklist.ts:13` 是同一串）。
 */
export const DEFAULT_CLASSF_BLACKLIST_KEYWORDS = ["[OgoG]", "[ぶたコマ300g]", "[すいせいむし]", "[ダツマ69]", "[ヤキカルビー]"]

const sameaArtistInput = normalizeSameaInput({})

/**
 * 繁简折字这一格的现状，随结果一起说出去。
 *
 * `converter: 'none'` 不是"选了个弱一点的转换器"，而是**没有**那个依赖：
 * `opencc-js` 未进本包 `dependencies`（新依赖需要使用者批准），
 * 而词典本身也没有第二份来源。`request` 一行是要留给谁的：它说清"补上依赖就恢复原判据"，
 * 而不是让后人以为这里在等一个 DSH 能力。
 */
export const CLASSF_BLACKLIST_FOLDING = {
  converter: 'none' as const,
  /** 命中判据仍然大小写不敏感，只是不再跨繁简。 */
  caseInsensitive: true,
  request: '恢复繁简折字需要依赖 `opencc-js`（上游 blacklist.ts:2 用的是 `opencc-js/t2cn`）：本包未声明它，新依赖待使用者批准。',
}

export interface ClassfArtistLabelParts {
  label: string
  /** 上游那边 `exactOptionalPropertyTypes` 没开，所以写的是 `circle?: string`；
   *  本仓开了 ⇒ 这里必须显式收 `undefined`（`groupArtist?.[1]?.trim() || undefined`
   *  给的正是它）。纯类型层，运行期一个字节都不变。 */
  circle?: string | undefined
  artist: string
}

/** Parse a configured keyword with the same canonicalization that SameA uses. */
export function parseSameaArtistLabel(keyword: string): ClassfArtistLabelParts | undefined {
  const source = keyword.trim()
  if (!source) return undefined
  const artist = extractArtist(source.includes('[') ? source : `[${source}]`, sameaArtistInput)
  if (!artist) return undefined
  const content = artist.label.replace(/^\[|\]$/g, '')
  const groupArtist = content.match(/^(.+?)\s*\(([^()]+)\)$/)
  return {
    label: artist.label,
    circle: groupArtist?.[1]?.trim() || undefined,
    artist: groupArtist?.[2]?.trim() ?? content,
  }
}

/** Remove only enclosing square or round brackets, preserving inner artist data. */
export function stripOuterKeywordBrackets(keyword: string): string {
  let value = keyword.trim()
  while ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('(') && value.endsWith(')'))) {
    value = value.slice(1, -1).trim()
  }
  return value
}

/** Split each `[circle (artist)]` label into independently matchable bracketed keywords. */
export function splitSameaArtistAndCircleKeywords(keywords: string[]): string[] {
  return unique(keywords.flatMap((keyword) => {
    const parts = parseSameaArtistLabel(keyword)
    if (!parts) return keyword.trim() ? [keyword.trim()] : []
    return parts.circle ? [`[${parts.circle}]`, `[${parts.artist}]`] : [parts.label]
  }))
}

/** Extract the first SameA artist label from each source name, preserving safe brackets. */
export function extractSameaArtistKeywords(keywords: string[]): string[] {
  return unique(keywords.flatMap((keyword) => parseSameaArtistLabel(keyword)?.label ?? keyword.trim()))
}

/** Append candidate labels without duplicating entries already persisted for ClassF. */
export function mergeClassfBlacklistKeywords(existing: string[], additions: string[]): string[] {
  return unique([...existing, ...additions])
}

/**
 * Normalize both blacklist entries and extracted labels without changing stored config text.
 *
 * 上游这一行是 `toSimplifiedChinese(value).toLocaleLowerCase()`（两个动作）。
 * 现在只剩后半个：繁→简那半个的动作要 `opencc-js`，见文件头第 2 条与
 * `CLASSF_BLACKLIST_FOLDING`。
 */
export function normalizeClassfBlacklistText(value: string): string {
  return value.toLocaleLowerCase()
}

export function isClassfBlacklistedArtist(artist: string, keywords: string[]): boolean {
  const parts = parseSameaArtistLabel(artist)
  const labels = [artist, parts?.circle && `[${parts.circle}]`, parts?.artist && `[${parts.artist}]`]
    .filter((label): label is string => Boolean(label))
    .map(normalizeClassfBlacklistText)
  const normalizedKeywords = keywords.map(normalizeClassfBlacklistText).filter(Boolean)
  return normalizedKeywords.some((keyword) => labels.some((label) => label.includes(keyword)))
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
