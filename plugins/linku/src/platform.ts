/**
 * linku 的 `LinkuRuntime` 落地实现，从 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/linku/src/platform.ts`（299 行）搬来。**文件系统那几条逐字未改**
 * （`pathInfo` / `isLiveLinkRecord` / `removeSymlink` / `createSymlink` / `movePath` /
 * `exists` / `pathsMatch` / `directoryStats`，含 `readlink` 那两处动态 import），
 * 只有"链接记录住在哪里"这一条按本仓的纪律换了落点，逐条列在下面。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：与 `docs/adr/0003-migrated-node-file-state.md`
 * 决定 1 判的是同一件事——`ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明
 * `FsTarget`、禁止解析、禁止假设本地绝对路径，而这个内核到处要 `resolve()`、`lstat()`、
 * `symlink()`、`rename()`。权限边界靠动作分级：`create` / `move_link` / `recover` / `restore`
 * 在 `package.json#xaihi.node.danger`（`actionIn` 那四条）里被判为危险，经 `defineNode`
 * 变成 DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：随本包发布的那几条腿全程不调用外部程序
 * （唯一用 `node:child_process` 的是 `readClipboardText`，见下面第 4 条）。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **记录文件的位置必须由配置显式给**（`Config.recordsPath`，默认空串）。
 *    上游那条"cli 覆盖 > `XIRANITE_CONFIG_PATH` / `XIRANITE_DATA_DIR` > 系统配置目录"
 *    的优先级（`resolveLinkuConfigPath`，上游 `:84-90`）整块不接：ADR-0013 规定配置只有一个
 *    出口（DSH 的 settings 面），ADR-0003 规定"要落文件的位置由使用者在 `Config` 里给，
 *    没给就拒绝动手"。两处都没给时，`assertRecordsConfigured`（本文件导出）让
 *    `src/index.ts` 与 `src/cli.ts` 在**调用内核之前**就拒，`readConfig` / `writeConfig`
 *    里那条 `targetFor` 拒绝只作第二层——只靠第二层的话 `create` 会先把软链建出来。
 *    `info` 不在 `RECORDS_ACTIONS` 里：内核那条分支本来就不碰记录文件（与上游一致）。
 * 2. **`[nodes.linku]` 那半条读写通路不搬**（上游 `:37-73` 依赖 `@xiranite/config` 的
 *    `loadXiraniteConfig` / `getNodeConfig` / `stringifyToml` / `parseToml` / `updateNodeConfigFile`）。
 *    换成两条**只认内核自己那份格式**的判据：
 *    读的时候带 `[nodes.*]` 段的文件一律拒（它是一份配置文档，接了就得再造一条配置存储），
 *    其余交给内核的 `parseLinkRecords`（它容忍注释行与 `config_version = 1`）；
 *    写的时候只有"文件不存在 / 是空白 / 是内核写手产出的那种文件"才动手，
 *    否则拒绝——拒绝而不是拿一份独立格式的文档去 `writeFile` 盖掉别人的东西。
 *    注意"内核写出的空记录文件"没有 `[[links]]` 行（`core.ts:111` 那三行头 + `trimEnd`），
 *    所以判据里必须有 `config_version = ` 这一半，否则 `restore` 之后那条 `list` 会读不回来
 *    ——这颗钉子就在 `tests/core.spec.ts` 的"全链"那条用例上。
 * 3. **`importLegacyLinkuToml` / `resolveLinkuConfigPath` 两个导出没搬**：
 *    上游全仓 grep 只有定义（`platform.ts:84`、`:96`）、没有消费者，
 *    `import` 动作读旧文件走的是内核注入的 `readConfig` 那条缝。
 * 4. **`readClipboardText` / `runCommand` 没搬**：上游唯一的消费者是引导流
 *    （`cli.ts:334` 的 `resolvePaths`），而引导流不随本包发布（见 `src/cli.ts` 文件头第 1 条）。
 *    把它留下等于让一个不调用外部程序的包为了 `node:child_process` 去碰 `ctx.subprocess`。
 * 5. **`pathInfo` 的返回形状**：没值的两个可选键**不给键**而不是给 `undefined`——
 *    本仓的 `exactOptionalPropertyTypes` 不收后一种，而内核读的是
 *    `linkInfo.linkTarget !== undefined` / `targetExists === true`（`core.ts:323-328`），
 *    两种写法在它眼里同一件事（就地写在 `pathInfo` 那一段上方）。
 *
 * 文件系统语义随上游保持，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` **会 `resolve()`**（与 `samea` / `classq` 那两份不同，别统一），并且用
 *   **`lstat`** ⇒ 软链本身算 `kind: "other"` + `isSymlink: true`，链接目标由 `readlink`
 *   另算，`targetExists` 用 `resolve(dirname(link), target)` 判相对链接；
 *   目录额外做 `directoryStats`（递归 `lstat` 求和，**符号链接目录不下钻**：`Dirent.isDirectory()` 为假），
 *   文件给 `sizeMb = size / 1024 / 1024`；
 * - `removeSymlink` 先 `lstat`：**不是软链就抛**（"Link path is not a symbolic link"），
 *   路径不存在也抛（"Link path does not exist"）——它靠这两条把自己限定在"只删链不删本体"，
 *   上游 `platform.test.ts:14-26` 钉的就是"删目录软链不许删掉目标"；
 * - `createSymlink` 先 `pathInfo(source)`（源不存在就抛），目标目录 `mkdir(recursive)`，
 *   目标已是软链则 `rm(force)` 后重建，**目标是普通文件/目录时抛**而不是覆盖；
 *   Windows 上目录用 `junction`；
 * - `movePath` 先 `rename`，**失败时退到 `cp(recursive, errorOnExist, force:false)` + `rm`**
 *   ——这份内核是有跨卷兜底的（与 `samea` 那份不同），照上游留着。
 *
 * @module xaihi-linku/platform
 */

import { access, cp, lstat, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { LinkPathInfo, LinkRecord, LinkuAction, LinkuRuntime } from "./core.ts"

/**
 * 记录文件没配时的缺口点名。写成一条常量是为了让终端面、宿主面与测试说的是同一句话，
 * 而不是各抄一遍（抄两份就会漂）。
 */
export const RECORDS_PATH_GAP = "DSH 0.2.0-rc.2 不给插件「每个插件一个数据目录」的口子（ctx.path / ctx.home / ctx.storage.dir 实测零命中），"
  + "按 docs/adr/0003 与 ADR-0013，链接记录的位置必须由 Config.recordsPath 显式给出"

/** 记录文件判据不成立时的缺口点名（读写两侧共用；两种触发形状见文件头第 2 条）。 */
export const CONFIG_SECTION_GAP = "那份文件不是 linku 的记录文件（带 [nodes.*] 段，或者是内核写手不会产出的形状）⇒ "
  + "本包不接第二条配置存储（docs/adr/0013：配置只走 DSH 的 settings 面），也不覆盖它"

/**
 * 六个要读写链接记录的动作。真源是内核：这六个分支都调 `readConfig` / `writeConfig`
 * （`core.ts:152`、`:158`、`:163`、`:173`、`:187`、`:191`），只有 `info` 不碰记录文件
 * （`core.ts:145-149` 只走 `pathInfo`）。
 */
export const RECORDS_ACTIONS: readonly LinkuAction[] = ["create", "move_link", "list", "recover", "restore", "import"]

/**
 * **动手之前的闸门**（ADR-0003 决定 2 的同一条纪律，与 `dissolvef` 的 `historyPath` 一致）：
 * 记录位置两处都没给时，任何要写记录的动作都在碰文件系统之前被拒绝。
 *
 * 为什么必须有这道闸门而不只靠 `readConfig` 里那条：内核 `create` 的次序是
 * "建链 → 记账"（`core.ts:172-173`），`move_link` 是"移动 → 建链 → 记账"
 * （`core.ts:184-187`）。只在记账那一步拒的话，**文件已经被改了**，
 * 症状是"报错了但机器上多出一条软链"。`tests/cli.spec.ts` 里钉的就是这件事。
 */
export function assertRecordsConfigured (action: LinkuAction, configPath: string | undefined, recordsPath: string | undefined): void {
  if (!RECORDS_ACTIONS.includes(action)) return
  if ((configPath ?? "").trim() !== "" || (recordsPath ?? "").trim() !== "") return
  throw new Error(`linku: 动作 ${action} 需要链接记录文件，但两处都没给 —— ${RECORDS_PATH_GAP}。`)
}

export function createNodeLinkuRuntime(configPath?: string): LinkuRuntime {
  const resolvedConfigPath = configPath ?? ""
  return {
    pathInfo,
    isLiveLinkRecord,
    removeSymlink,
    createSymlink,
    movePath,
    readConfig: async (path) => readLinkuConfig(targetFor(path, resolvedConfigPath)),
    writeConfig: async (content, path) => writeLinkuConfig(content, targetFor(path, resolvedConfigPath)),
  }
}

/**
 * 两条来源按上游 `path || resolvedConfigPath` 的次序合一条；
 * 两边都没给 ⇒ 在碰任何文件之前拒绝（文件头第 1 条）。
 */
function targetFor(path: string | undefined, resolvedConfigPath: string): string {
  const chosen = (path ?? "").trim() !== "" ? (path as string).trim() : resolvedConfigPath.trim()
  if (chosen === "") {
    throw new Error(`linku: 链接记录文件未配置 —— ${RECORDS_PATH_GAP}。`)
  }
  return chosen
}

/**
 * Read linku records. 带 `[nodes.*]` 段的那份不接（文件头第 2 条）；其余原样交给
 * 内核的 `parseLinkRecords`——它本来就容忍注释行、`config_version = 1` 与未知键
 * （`core.ts:83-107`），所以"内核自己写出的空记录文件"（只有头两行、一条 `[[links]]` 都没有）
 * 也必须读得回来，而不是被判成"不是记录文件"。
 */
async function readLinkuConfig(path: string): Promise<string | null> {
  const content = await readFile(path, "utf8").catch(() => null)
  if (content === null) return null

  // Detect legacy standalone linku.toml by checking for top-level [[links]] without [nodes.linku] parent
  if (looksLikeLegacyLinkuToml(content)) return content
  if (content.includes("[nodes.")) throw new Error(`linku: 读不了 ${path} —— ${CONFIG_SECTION_GAP}。`)
  return content
}

/**
 * Write linku records into a standalone records file（上游的 legacy 分支逐字保留：
 * 先 `mkdir(dirname)` 再 `writeFile`）。目标已有内容且**不是**记录文件时响亮拒绝——
 * 上游那半条"合并进 `[nodes.linku]` 段并保留其它段"的通路本包不接，
 * 所以宁可拒也不拿一份独立格式的文档去盖别的东西。
 */
async function writeLinkuConfig(content: string, path: string): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => null)
  if (existing !== null && existing.trim() !== "" && !looksLikeLinkuRecordsFile(existing)) {
    throw new Error(`linku: 拒绝覆盖 ${path} —— ${CONFIG_SECTION_GAP}。`)
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}

function looksLikeLegacyLinkuToml(content: string): boolean {
  // Legacy linku.toml has top-level [[links]] but no [nodes.*] parent
  if (!content.includes("[[links]]")) return false
  return !content.includes("[nodes.")
}

/**
 * "这份文件是 linku 的记录文件"的判据：内核的写手（`core.ts:111`）产出的两种形状——
 * 带 `[[links]]` 条目的，或只有 `config_version = ` 头行的空表。
 * 两个 token 都来自内核自己的输出，不在这里另发明第三种。
 */
function looksLikeLinkuRecordsFile(content: string): boolean {
  return looksLikeLegacyLinkuToml(content) || (content.includes("config_version = ") && !content.includes("[nodes."))
}

async function pathInfo(path: string): Promise<LinkPathInfo> {
  const resolved = resolve(path)
  let stat
  try {
    stat = await lstat(resolved)
  } catch {
    return { path: resolved, exists: false, kind: "missing", isSymlink: false }
  }

  const isSymlink = stat.isSymbolicLink()
  let linkTarget: string | undefined
  let targetExists: boolean | undefined
  if (isSymlink) {
    try {
      const { readlink } = await import("node:fs/promises")
      linkTarget = await readlink(resolved)
      targetExists = await exists(resolve(dirname(resolved), linkTarget))
    } catch {
      targetExists = false
    }
  }

  const kind = stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other"
  const extra = kind === "dir" ? await directoryStats(resolved) : kind === "file" ? { sizeMb: stat.size / 1024 / 1024 } : {}
  // 本仓开着 `exactOptionalPropertyTypes`（`tsconfig.base.json`），上游那句
  // `{ ...linkTarget, targetExists, ...extra }` 里"键在、值是 undefined"的形状过不了类型。
  // 这里改成没值就**不给键**：内核读的是 `linkInfo.linkTarget !== undefined`
  // 与 `linkInfo.targetExists === true`（`core.ts:323-328`），两种写法在它眼里同一件事。
  return {
    path: resolved,
    exists: true,
    kind,
    isSymlink,
    ...(linkTarget === undefined ? {} : { linkTarget }),
    ...(targetExists === undefined ? {} : { targetExists }),
    ...extra,
  }
}

async function isLiveLinkRecord(record: LinkRecord): Promise<boolean> {
  const linkPath = resolve(record.link)
  let linkStat
  try {
    linkStat = await lstat(linkPath)
  } catch {
    return false
  }
  if (!linkStat.isSymbolicLink()) return false

  let actualTarget
  try {
    const { readlink } = await import("node:fs/promises")
    actualTarget = resolve(dirname(linkPath), await readlink(linkPath))
  } catch {
    return false
  }

  const expectedTarget = resolve(record.target)
  if (!pathsMatch(actualTarget, expectedTarget)) return false
  return await exists(actualTarget) && await exists(expectedTarget)
}

function pathsMatch(left: string, right: string): boolean {
  return left
    .replace(/^\\\\\?\\/, "")
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLowerCase() === right
      .replace(/^\\\\\?\\/, "")
      .replace(/\//g, "\\")
      .replace(/\\+$/, "")
      .toLowerCase()
}

async function removeSymlink(path: string): Promise<void> {
  const linkPath = resolve(path)
  let stat
  try {
    stat = await lstat(linkPath)
  } catch {
    throw new Error(`Link path does not exist: ${path}`)
  }
  if (!stat.isSymbolicLink()) throw new Error(`Link path is not a symbolic link: ${path}`)
  await unlink(linkPath)
}

async function createSymlink(source: string, link: string): Promise<void> {
  const sourceInfo = await pathInfo(source)
  if (!sourceInfo.exists) throw new Error(`Source path does not exist: ${source}`)
  const linkPath = resolve(link)
  await mkdir(dirname(linkPath), { recursive: true })
  try {
    const existing = await lstat(linkPath)
    if (!existing.isSymbolicLink()) {
      throw new Error(`Link path already exists and is not a symlink: ${linkPath}`)
    }
    await rm(linkPath, { force: true })
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined
    if (code !== "ENOENT") throw error
  }
  const type = process.platform === "win32" && sourceInfo.kind === "dir" ? "junction" : sourceInfo.kind === "dir" ? "dir" : "file"
  await symlink(resolve(source), linkPath, type)
}

async function movePath(source: string, target: string): Promise<void> {
  const sourcePath = resolve(source)
  const targetPath = resolve(target)
  await mkdir(dirname(targetPath), { recursive: true })
  try {
    await rename(sourcePath, targetPath)
  } catch {
    await cp(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true })
    await rm(sourcePath, { recursive: true, force: true })
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function directoryStats(path: string): Promise<{ sizeMb: number; fileCount: number }> {
  const { readdir } = await import("node:fs/promises")
  let size = 0
  let fileCount = 0
  async function walk(current: string) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(current, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile()) {
        try {
          const stat = await lstat(child)
          size += stat.size
          fileCount += 1
        } catch {
          // ignore unreadable files
        }
      }
    }
  }
  await walk(path)
  return { sizeMb: size / 1024 / 1024, fileCount }
}
