/**
 * encodeb 的 `EncodebRuntime` 落地实现：从 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/encodeb/src/platform.ts`（336 行）搬来，改动**只有编码那一段**，
 * 其余（`scanPath`、`walkEncodebDirectory`、`recoverPath`、`applyCopyMappings`、
 * `applyReplaceMappings`、`uniquePath`）逐字保留，差异只是 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `crashu` / `formatv` 同写法）。
 *
 * 唯一被换成"响亮拒绝"的是转码器。上游那 200 行（`iconvTranscodeName`、
 * `autoTranscodeName`、`safelyRecodeName`、`addChardetCandidates`、`encodeNameLosslessly`
 * 等，`platform.ts:9-211`）整棵坐在两颗包上：`iconv-lite`（把名字**编成** cp437 /
 * cp936 / cp932 / cp949 / windows-1252 的字节）与 `chardet`（猜目标编码）。本仓的依赖闭包
 * 里没有它们，而**加依赖不在这个任务的授权范围内**（Node 自带的 `TextDecoder` 也补不了：
 * 它既没有 `cp437` 也没有 `cp936`/`cp932`/`cp949` 的标签，`TextEncoder` 更是只出 UTF-8 ⇒
 * "编码回字节"这一步根本没有内置件）。所以：
 * - `recode` / `auto` 两个 transform 一律**在动任何文件之前**抛
 *   `CODEC_UNAVAILABLE`（点名缺的东西与可用的替代）。为什么不是"回落到原样、出 0 条映射"：
 *   `core.ts` 的 `createEncodebMappings` 在 `changedOnly` 默认真时会把没变化的条目全丢掉
 *   （`core.ts:117`），静默回落的症状是"预览永远是空的"，读起来像"这里没有乱码"，
 *   而那正是这个节点要回答的问题——属于伪造读数，不是退化。
 * - `decode-hash-u`（`platform.ts:189-195` 的 `decodeHashUnicodeEscapes`）与
 *   `normalize-middle-dot`（`:76` 那一行 `replaceAll("・", "·")`）两条**不依赖任何包**，
 *   逐字搬过来，真能跑：`find` / `preview` / `recover` 三条腿在这两个 transform 下完整工作。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io` + 递归枚举。**不走 `ctx.fs`**：
 * 那条缝面向模型发起的工具调用，要求路径收成不透明 `FsTarget` 且禁止解析，而这个内核要
 * `resolve`/`dirname`/`basename`/`extname` 的路径算术、要 `rename`、要 `mkdir -p`
 * （`docs/adr/0003-migrated-node-file-state.md` 决定 1，`crashu` / `formatv` 先例）。
 * 权限边界靠动作分级：`recover` 在定义里是 `danger.actionIn`，经 `defineNode` 变成 DSH 的
 * `ask`，审批与审计走 DSH 的 `approval` 缝（`docs/service-mapping.md:42-44` 实测
 * `dsh-user-approval` 在默认组合里）。
 *
 * 这里也**不搬 `readClipboardText()`**（上游 `:32-71`，走 `node:child_process` 的 `execFile`）：
 * 它不属于 `EncodebRuntime` 那三个方法，唯一的上游消费者是终端的 `guided` 腿
 * （`cli.ts:393`），而那条腿在本包是响亮拒绝的未接面（见 `src/cli.ts` 文件头）。
 * 缺口沿用台账的 **G5**，不另立新号。
 *
 * 枚举/改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `scanPath` 先 `resolve` 再 **`lstat`**（不是 `stat`）：传进来的若是一个指向目录的软链，
 *   `lstat` 既不是 file 也不是 directory ⇒ 直接 `throw Unsupported path type: <resolved>`。
 *   单个**文件**入参时返回一条以 `dirname(resolved)` 为 `rootPath` 的条目（`depth: 1`，
 *   **没有 `separator` 字段**），目录入参时 `rootPath` 是那个目录本身。
 * - `walkEncodebDirectory` 的 `readdir` 失败被**咽掉**（`catch { return }`）：
 *   中途失去权限的子目录当成"没有内容"，不整条失败。软链目录条目被静默跳过
 *   （`!isDirectory() && !isFile()` ⇒ continue）。
 * - `depth` 从 **1** 起、且是**父目录的层级**（递归调用时才 `+1`）⇒ 根下第一层条目 depth=1。
 * - `applyReplaceMappings` 按 `sortReplaceMappings`（深→浅）**逐条 `rename`**，
 *   先 `lstat(src)` 不在就跳过、`mkdir(dirname(dst))`、目标冲突走 `uniquePath(src, dst)`
 *   （`samePath` 那条判据让"原地改名回自己"不算冲突）。
 * - `applyCopyMappings` 反过来按**浅→深**排（`a.depth - b.depth`）：先建目录再拷文件；
 *   文件一律 `copyFile(src, await uniquePath(dst))` ⇒ 复制腿**从不覆盖**。
 * - `uniquePath` 的后缀是 `_1`、`_2`…（`extname` 保留在点后），循环判据是 `lstat` 抛错。
 *
 * @module xaihi-encodeb/platform
 */

import { copyFile, lstat, mkdir, readdir, rename } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import type { EncodebEntry, EncodebInput, EncodebMapping, EncodebRuntime, EncodebTransform, NameTranscoder } from "./core.ts"
import { createEncodebMappings, sortReplaceMappings } from "./core.ts"

/**
 * 没有 legacy codec 时那句拒绝。**名字要点名到缺的东西与能走的路**，
 * 因为"预览是空的"与"这里做不了"是两种完全不同的读数。
 * `src/index.ts` / `src/cli.ts` / `tests/*.spec.ts` 共用这一份文案，抄两份就会漂。
 */
export const CODEC_UNAVAILABLE = (transform: EncodebTransform): string =>
  `encodeb: transform "${transform}" needs a legacy code-page codec (上游 platform.ts 用的是 iconv-lite + chardet), `
  + `and neither is in this package's dependency closure. 可用的替代：--transform decode-hash-u（#Uxxxx 转义）`
  + `、--transform normalize-middle-dot（・ → ·），或只跑不依赖 codec 的 find。`
  + `要接上 recode/auto 需要新增依赖 iconv-lite + chardet，那是一条依赖申请，不在本包里私开一条通路。`

/** 两条不需要 codec 的 transform；其余（`recode` / `auto`）走 `CODEC_UNAVAILABLE`。 */
const CODEC_FREE_TRANSFORMS: readonly EncodebTransform[] = ["decode-hash-u", "normalize-middle-dot"]

export function createNodeEncodebRuntime(): EncodebRuntime {
  return {
    scanPath,
    recoverPath,
    transcodeName: nodeTranscodeName,
  }
}

/**
 * `platform.ts:73-79` 的 `iconvTranscodeName` 的判据顺序，只是把两个需要 codec 的分支
 * 换成点名拒绝：`auto` → 上游 `autoTranscodeName`、`recode` → 上游 `safelyRecodeName`。
 * 两条免费的分支逐字保留（`decodeHashUnicodeEscapes` / `replaceAll("・", "·")`）。
 * 形参 `srcEncoding` / `dstEncoding` 在当下这两个分支里没有消费者（它们只喂 codec 那两条），
 * 所以下划线前缀躲 `noUnusedParameters`；签名保持与上游 `NameTranscoder` 一致，
 * 是为了调用方（内核 `createEncodebMappings`）不用改一行。
 */
export const nodeTranscodeName: NameTranscoder = (name, _srcEncoding, _dstEncoding, transform = "recode") => {
  if (transform === "decode-hash-u") return decodeHashUnicodeEscapes(name)
  if (transform === "normalize-middle-dot") return name.replaceAll("・", "·")
  throw new Error(CODEC_UNAVAILABLE(transform as EncodebTransform))
}

/**
 * 上游 `platform.ts:189-195`，逐字：4-6 位十六进制，超出平面或落在代理对区间就原样留着。
 * 这条**不依赖 iconv-lite**（`String.fromCodePoint` 是内置件），所以它跟 `middle_dot`
 * 一起构成本包现在真能跑的转码面。
 */
export function decodeHashUnicodeEscapes(name: string): string {
  return name.replace(/#U([0-9a-fA-F]{4,6})/g, (match, hex: string) => {
    const codePoint = Number.parseInt(hex, 16)
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return match
    return String.fromCodePoint(codePoint)
  })
}

export function isCodecFree(transform: EncodebTransform): boolean {
  return CODEC_FREE_TRANSFORMS.includes(transform)
}

async function scanPath(path: string): Promise<EncodebEntry[]> {
  const resolved = resolve(path)
  const stat = await lstat(resolved)
  if (stat.isFile()) {
    return [{
      path: resolved,
      name: basename(resolved),
      type: "file",
      rootPath: dirname(resolved),
      relativeParts: [basename(resolved)],
      depth: 1,
    }]
  }

  if (!stat.isDirectory()) {
    throw new Error(`Unsupported path type: ${resolved}`)
  }

  const entries: EncodebEntry[] = []
  await walkEncodebDirectory(resolved, resolved, [], 1, entries)
  return entries
}

async function recoverPath(
  path: string,
  input: Required<EncodebInput>,
): Promise<string> {
  const resolved = resolve(path)
  const stat = await lstat(resolved)
  const entries = await scanPath(resolved)

  if (stat.isDirectory() && input.strategy === "copy") {
    const destRoot = await uniquePath(`${resolved}_recovered`)
    const mappings = createEncodebMappings(entries, input, nodeTranscodeName, { changedOnly: false, destRoot })
    await applyCopyMappings(mappings)
    return destRoot
  }

  const mappings = createEncodebMappings(entries, input, nodeTranscodeName, { changedOnly: true })
  if (input.strategy === "copy") {
    await applyCopyMappings(mappings)
    return mappings[0]?.dst ?? resolved
  }

  await applyReplaceMappings(sortReplaceMappings(mappings))
  return resolved
}

async function walkEncodebDirectory(
  rootPath: string,
  currentPath: string,
  relativeParts: string[],
  depth: number,
  entries: EncodebEntry[],
): Promise<void> {
  let children
  try {
    children = await readdir(currentPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const child of children) {
    if (!child.isDirectory() && !child.isFile()) continue
    const childPath = join(currentPath, child.name)
    const childParts = [...relativeParts, child.name]
    entries.push({
      path: childPath,
      name: child.name,
      type: child.isDirectory() ? "dir" : "file",
      rootPath,
      relativeParts: childParts,
      depth,
    })

    if (child.isDirectory()) {
      await walkEncodebDirectory(rootPath, childPath, childParts, depth + 1, entries)
    }
  }
}

async function applyCopyMappings(mappings: EncodebMapping[]): Promise<void> {
  const sorted = [...mappings].sort((a, b) => a.depth - b.depth)
  for (const mapping of sorted) {
    if (mapping.type === "dir") {
      await mkdir(mapping.dst, { recursive: true })
      continue
    }

    await mkdir(dirname(mapping.dst), { recursive: true })
    await copyFile(mapping.src, await uniquePath(mapping.dst))
  }
}

async function applyReplaceMappings(mappings: EncodebMapping[]): Promise<void> {
  for (const mapping of mappings) {
    if (mapping.src === mapping.dst) continue
    try {
      await lstat(mapping.src)
    } catch {
      continue
    }
    await mkdir(dirname(mapping.dst), { recursive: true })
    await rename(mapping.src, await uniquePath(mapping.dst, mapping.src))
  }
}

async function uniquePath(path: string, samePath?: string): Promise<string> {
  let candidate = path
  let index = 1
  const ext = extname(path)
  const stem = ext ? path.slice(0, -ext.length) : path

  while (true) {
    if (samePath && resolve(candidate) === resolve(samePath)) return candidate
    try {
      await lstat(candidate)
      candidate = `${stem}_${index}${ext}`
      index += 1
    } catch {
      return candidate
    }
  }
}
