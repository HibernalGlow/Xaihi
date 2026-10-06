/**
 * classf 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/classf/src/core.ts`
 * （377 行）逐字搬来：类型、动作与阶段的字面量、三条队列的默认与 legacy `classifyMode`
 * 折算、阶段进度百分比、目标目录推导、去重与排序比较器、reason 文案全部原样，
 * **一处逻辑都没改**（`diff` 对着上游复核过，差异只有下面点名的 import 说明符）。
 *
 * 那六行 import 换成本包的文件，因为 `@xiranite/*` 是 `workspace:*`，一写进依赖全仓
 * pnpm 就解不出依赖树（`pnpm-workspace.yaml` 顶部注释、`docs/adr/0002-self-contained-plugin-packages.md`）：
 * - `@xiranite/contract` → `./contract.ts`（`NodeRunEvent` / `NodeRunResult` 两个类型）。
 * - `@xiranite/node-{samea,crashu,migratef}/core` → `./samea-core.ts` / `./crashu-core.ts` /
 *   `./migratef-core.ts`：**只有类型**（classf 是这三个节点的编排器，真实现经
 *   `ClassfRuntime` 的 `runSamea` / `runCrashu` / `runMigratef` 注入，见 `src/platform.ts`
 *   文件头那条拒绝的理由）。
 * - `@xiranite/node-repacku/core` → `./repacku-core.ts`：**两个纯函数**
 *   （`isArchiveFile` / `selectSinglePackFolderSources`），逐字抄自上游 repacku 内核，
 *   因为它们在 classf 的枚举里是被**调用**的，不是类型。
 * - `./blacklist.js` → `./blacklist.ts`（本包自己的文件，见那个文件的头注释）。
 *
 * 类型层的让步（不涉及运行期，两处，都是签名不是逻辑）：
 * - `runTransferGroups` 与 `emitCompletedItems` 的形参 `input` 在这两个函数体里**没被用到**，
 *   而上游 `tsconfig.app.json` 没开 `noUnusedParameters`、本仓 `tsconfig.base.json` 开了，
 *   于是这两个位置写成 `_input`（`node scripts/check-verbatim.mjs` 把"未用到的形加下划线"
 *   列为放行的第 4 类，同时有一条"改到用得着的标识符就编译不过"的兜底）；
 * - `src/platform.ts` 里 `ClassfRuntime.readClipboardPaths` 返回 `Promise<string[]>`，与上游同形。
 * 本文件里那几个 `!` 是**上游自己就写了**的（`:154` `:159` `:272` `:353`），没有新增。
 *
 * 会被"顺手优化"改掉、所以在这里点名的上游语义（行号指上游那份文件）：
 * - `dryRun` 内核默认 **true**（`:75`），与 `rawfilter` / `formatv` 那两份"内核默认 false"
 *   **相反**；定义里 `dryRun` 的默认也是 true，这一格两头一致，但 `classify` 仍然被
 *   `danger.all` 标成危险（预演不危险，真执行才要批准）。
 * - 三条队列是**独立开关**（`alreadyEnabled` / `waitEnabled` / `delEnabled`），缺席时由
 *   legacy `classifyMode` 折算（`legacyQueueSettings`，`:343-347`：`only` ⇒ already+del、
 *   `del` ⇒ 只 del、其余 ⇒ 三条全开）。同一份 `classifyMode` 还留在结果里原样回显。
 * - 阶段判定优先级（`buildFileTransfers`，`:266-268`）：CrashU 命中 → `already`，
 *   命中黑名单 → `del`，其余 → `wait`。**已存在的画师不会因为撞上黑名单就降级成 del**
 *   （上游测试 "keeps a matching existing artist in already" 钉的就是这条）。
 * - 画师分组（SameA 在输出目录里再跑一遍）有三条独立开关，默认值不同：
 *   `sameaGroupAlreadyEnabled` / `sameaGroupWaitEnabled` 跟随 legacy 的
 *   `sameaGroupEnabled`，`sameaGroupDelEnabled` **默认 false**（`:80`）。
 * - 枚举（`collectInputItems`，`:229-258`）：`files` 递归进目录、跳过分类目录本身；
 *   `folders` / `mixed` 只看根目录的第一层子目录（经 repacku 的
 *   `selectSinglePackFolderSources` 排序），并跳过分类目录与 `[画师]` 目录；
 *   两条都按 `normalizePath`（反斜杠→正斜杠 + 小写，`:374`）去重，**保留第一次出现的顺序**。
 * - `findClassificationDirectories`（`:193-227`）只收目录、`visited` 用规范化路径防环，
 *   命中分类目录名就不再往下钻。
 * - 目标推导：`local` 是"文件所在目录 / 阶段名"（`:271`）；`root` 在**多个来源根**时把
 *   根目录自己的名字拼回相对路径（`rootTargetDirectory`，`:278-284`），这是
 *   "两个根里有同名相对路径"不互相覆盖的唯一机制。
 * - 计划先发后跑：`action === "plan"` 或 `dryRun` 就在此返回（`:113-115`），
 *   真执行前那条 `classf-plan` 事件（`:112`）已经在 progress 45 发出去了。
 * - 汇总计数（`summarize`，`:356`）十二条键 + `errors`；`errorCount` 是条目里的
 *   `error` **加上**画师分组的报错（`:356` 那句 `+ groupingErrors.length`）。
 *
 * @module xaihi-classf/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"
import type { CrashuData, CrashuInput, CrashuResult } from "./crashu-core.ts"
import type { MigratefData, MigratefInput, MigratefResult, MigratePlanItem } from "./migratef-core.ts"
import type { SameaData, SameaInput, SameaResult } from "./samea-core.ts"
import { isArchiveFile, selectSinglePackFolderSources } from "./repacku-core.ts"
import { isClassfBlacklistedArtist } from "./blacklist.ts"

export { extractSameaArtistKeywords, mergeClassfBlacklistKeywords, parseSameaArtistLabel, splitSameaArtistAndCircleKeywords, stripOuterKeywordBrackets } from "./blacklist.ts"

export type ClassfAction = "plan" | "classify"
export type ClassfTransferMode = "move" | "copy"
export type ClassfClassifyMode = "off" | "auto" | "only" | "del"
export type ClassfPlacementMode = "local" | "root"
export type ClassfExistingPolicy = "merge" | "skip"
export type ClassfWorkItemMode = "files" | "folders" | "mixed"
export type ClassfPlanStatus = "ready" | "skipped" | "moved" | "copied" | "conflict" | "error"
export type ClassfStage = "samea" | "crashu" | "del" | "already" | "wait"
export type ClassfRouteStage = Extract<ClassfStage, "del" | "already" | "wait">
type ClassfTransferStage = ClassfRouteStage

export interface ClassfInput {
  action?: ClassfAction | undefined; path?: string | undefined; paths?: string[] | undefined; listText?: string | undefined
  crashuSourcePaths?: string[] | undefined; crashuSimilarityThreshold?: number | undefined
  targetDir?: string | undefined; transferMode?: ClassfTransferMode | undefined; classifyMode?: ClassfClassifyMode | undefined; placementMode?: ClassfPlacementMode | undefined; existingPolicy?: ClassfExistingPolicy | undefined; dryRun?: boolean | undefined
  /** Independent stage gates. Omitted settings preserve the legacy classifyMode behavior. */
  alreadyEnabled?: boolean | undefined; waitEnabled?: boolean | undefined; delEnabled?: boolean | undefined
  workItemMode?: ClassfWorkItemMode | undefined
  /** Case-insensitive keywords matched against the SameA artist label with simplified/traditional Chinese normalization. */
  blacklistKeywords?: string[] | undefined
  sameaIgnorePathBlacklist?: boolean | undefined; sameaMinOccurrences?: number | undefined; sameaCentralize?: boolean | undefined
  /** Legacy shared group switch. Per-stage switches take precedence when set. */
  sameaGroupEnabled?: boolean | undefined; sameaGroupMinOccurrences?: number | undefined; sameaGroupCentralize?: boolean | undefined
  /** Run SameA again inside each enabled stage directory after transfer. */
  sameaGroupAlreadyEnabled?: boolean | undefined; sameaGroupWaitEnabled?: boolean | undefined; sameaGroupDelEnabled?: boolean | undefined
}
export interface ClassfDirEntry { name: string; path: string; isFile: boolean; isDirectory: boolean }
export interface ClassfPathInfo { path: string; exists: boolean; isFile: boolean; isDirectory: boolean }
export interface ClassfPlanItem { sourcePath: string; targetPath: string; sourceName: string; targetRelative: string; kind: "file" | "folder"; stage: ClassfStage; status: ClassfPlanStatus; reason?: string | undefined }
export type ClassfProgressData =
  | { kind: "classf-plan"; result: ClassfData }
  | { kind: "classf-stage"; stage: ClassfStage; status: "running" | "completed" }
  | { kind: "classf-item"; sourcePath: string; stage: ClassfStage; status: ClassfPlanStatus | "running"; reason?: string | undefined }
export interface ClassfData {
  action: ClassfAction; transferMode: ClassfTransferMode; classifyMode: ClassfClassifyMode; placementMode: ClassfPlacementMode; workItemMode?: ClassfWorkItemMode | undefined; targetDir?: string | undefined; baseDir?: string | undefined; items: ClassfPlanItem[]
  selectedCount: number; readyCount: number; movedCount: number; copiedCount: number; delCount: number; waitCount: number; conflictCount: number; errorCount: number; errors: string[]
  samea?: SameaData | undefined; crashu?: CrashuData | undefined; migrateDel?: MigratefData | undefined; migrateAlready?: MigratefData | undefined; migrateWait?: MigratefData | undefined
  sameaGroupAlready?: SameaData | undefined; sameaGroupWait?: SameaData | undefined; sameaGroupDel?: SameaData | undefined
}
export interface ClassfRuntime {
  runSamea: (input: SameaInput, onEvent: (event: NodeRunEvent) => void) => Promise<SameaResult>
  runCrashu: (input: CrashuInput, onEvent: (event: NodeRunEvent) => void) => Promise<CrashuResult>
  runMigratef: (input: MigratefInput, onEvent: (event: NodeRunEvent) => void) => Promise<MigratefResult>
  readClipboardPaths: () => Promise<string[]>
  pathInfo: (path: string) => Promise<ClassfPathInfo>; listDir: (path: string) => Promise<ClassfDirEntry[]>; join: (...parts: string[]) => string; dirname: (path: string) => string; basename: (path: string) => string; relative: (from: string, to: string) => string
}
export type ClassfResult = NodeRunResult<ClassfData>

const DEFAULT_CRASHU_SOURCE_PATH = "E:\\1Hub\\EH\\1EHV"
const DEFAULT_CRASHU_THRESHOLD = 0.8

/**
 * Derived from the user's 2026-07-28 deletion history with SameA extraction
 * and a minimum of three successful deletions. SameA labels keep their
 * brackets to prevent common author names from
 * accidentally matching unrelated groups.
 */
export const DEFAULT_CLASSF_BLACKLIST_KEYWORDS = ["[OgoG]", "[ぶたコマ300g]", "[すいせいむし]", "[ダツマ69]", "[ヤキカルビー]"]

export function normalizeClassfInput(input: ClassfInput) {
  const legacyQueues = legacyQueueSettings(input.classifyMode)
  const legacyGrouping = input.sameaGroupEnabled ?? false
  return {
    action: input.action ?? "plan", path: clean(input.path), paths: uniqueClean([input.path, ...(input.paths ?? []), ...parseList(input.listText)]), listText: input.listText ?? "",
    crashuSourcePaths: uniqueClean(input.crashuSourcePaths ?? []), crashuSimilarityThreshold: clamp01(input.crashuSimilarityThreshold ?? DEFAULT_CRASHU_THRESHOLD), targetDir: optional(input.targetDir),
    transferMode: input.transferMode ?? "move", classifyMode: input.classifyMode ?? "auto", placementMode: input.placementMode ?? "local", existingPolicy: input.existingPolicy ?? "merge", workItemMode: input.workItemMode ?? "files", dryRun: input.dryRun ?? true,
    alreadyEnabled: input.alreadyEnabled ?? legacyQueues.already, waitEnabled: input.waitEnabled ?? legacyQueues.wait, delEnabled: input.delEnabled ?? legacyQueues.del,
    blacklistKeywords: uniqueClean(input.blacklistKeywords ?? DEFAULT_CLASSF_BLACKLIST_KEYWORDS),
    sameaIgnorePathBlacklist: input.sameaIgnorePathBlacklist ?? false, sameaMinOccurrences: clampInt(input.sameaMinOccurrences ?? 1, 1, 100), sameaCentralize: input.sameaCentralize ?? false,
    sameaGroupEnabled: legacyGrouping, sameaGroupMinOccurrences: clampInt(input.sameaGroupMinOccurrences ?? 1, 1, 100), sameaGroupCentralize: input.sameaGroupCentralize ?? false,
    sameaGroupAlreadyEnabled: input.sameaGroupAlreadyEnabled ?? legacyGrouping, sameaGroupWaitEnabled: input.sameaGroupWaitEnabled ?? legacyGrouping, sameaGroupDelEnabled: input.sameaGroupDelEnabled ?? false,
  }
}

export async function runClassf(input: ClassfInput, runtime: ClassfRuntime, onEvent: (event: NodeRunEvent) => void = () => {}): Promise<ClassfResult> {
  const normalized = normalizeClassfInput(input)
  try {
    const sameaPaths = normalized.paths.length ? normalized.paths : await runtime.readClipboardPaths()
    if (!sameaPaths.length) return failure("SameA found no valid archive roots in the clipboard.", normalized)
    if (normalized.placementMode === "root" && !normalized.targetDir) return failure("Root placement requires a target directory.", normalized)
    const crashuSourcePaths = normalized.crashuSourcePaths.length ? normalized.crashuSourcePaths : [DEFAULT_CRASHU_SOURCE_PATH]
    onEvent({ type: "progress", progress: 5, message: "SameA: building the source plan.", data: { kind: "classf-stage", stage: "samea", status: "running" } satisfies ClassfProgressData })
    const sameaPlan = await runtime.runSamea({ action: "plan", paths: sameaPaths, ignorePathBlacklist: normalized.sameaIgnorePathBlacklist, minOccurrences: normalized.sameaMinOccurrences, centralize: normalized.sameaCentralize, includeDirectories: normalized.workItemMode !== "files", skipGroupedDirectories: normalized.workItemMode !== "files", dryRun: true }, (event) => forward(event, 5, 15, onEvent))
    if (!sameaPlan.success || !sameaPlan.data) return failure(sameaPlan.message, normalized, { samea: sameaPlan.data })
    const groups = sameaPlan.data.groups.filter((group) => group.status === "ready")
    let crashuData: CrashuData | undefined
    if (groups.length) {
      onEvent({ type: "progress", progress: 20, message: "CrashU: matching source folders against SameA artists.", data: { kind: "classf-stage", stage: "crashu", status: "running" } satisfies ClassfProgressData })
      const crashu = await runtime.runCrashu({ action: "scan", sourcePaths: crashuSourcePaths, targetNames: groups.map((group) => group.name), similarityThreshold: normalized.crashuSimilarityThreshold, dryRun: true }, (event) => forward(event, 20, 15, onEvent))
      if (!crashu.success || !crashu.data) return failure(crashu.message, normalized, { samea: sameaPlan.data, crashu: crashu.data })
      crashuData = crashu.data
    }

    const sourceItems = await collectInputItems(sameaPaths, normalized.workItemMode, runtime)
    const transfers = buildFileTransfers(sourceItems, sameaPaths, sameaPlan.data, crashuData, normalized, runtime)
    const baseDir = normalized.placementMode === "root" ? normalized.targetDir : inferInputBase(sameaPaths, runtime)
    onEvent({ type: "progress", progress: 35, message: "MigrateF: building the complete per-directory transfer plan.", data: { kind: "classf-stage", stage: "already", status: "running" } satisfies ClassfProgressData })
    const delPlan = await runTransferGroups(transfers.filter((item) => item.stage === "del"), "plan", normalized, runtime, (event) => forward(event, 35, 3, onEvent))
    const alreadyPlan = await runTransferGroups(transfers.filter((item) => item.stage === "already"), "plan", normalized, runtime, (event) => forward(event, 35, 5, onEvent))
    const waitPlan = await runTransferGroups(transfers.filter((item) => item.stage === "wait"), "plan", normalized, runtime, (event) => forward(event, 40, 5, onEvent))
    const items = transferItems([...delPlan.plan, ...alreadyPlan.plan, ...waitPlan.plan], transfers, sameaPaths, normalized, runtime)
    const plannedData = summarize({ ...normalized, paths: sameaPaths }, items, baseDir, { samea: sameaPlan.data, crashu: crashuData, migrateDel: delPlan.data, migrateAlready: alreadyPlan.data, migrateWait: waitPlan.data })
    onEvent({ type: "progress", progress: 45, message: `ClassF plan ready: ${plannedData.readyCount} transfer(s).`, data: { kind: "classf-plan", result: plannedData } satisfies ClassfProgressData })
    if (normalized.action === "plan" || normalized.dryRun) {
      return { success: plannedData.errorCount === 0, message: `ClassF pipeline planned ${plannedData.readyCount} transfer(s).`, data: plannedData }
    }

    const completedDel = await runTransferGroups(transfers.filter((item) => item.stage === "del"), normalized.transferMode, normalized, runtime, (event) => forwardMigrate(event, 50, 15, "del", items, runtime, onEvent))
    emitCompletedItems(completedDel.data, "del", baseDir ?? "", runtime, onEvent)
    const completedAlready = await runTransferGroups(transfers.filter((item) => item.stage === "already"), normalized.transferMode, normalized, runtime, (event) => forwardMigrate(event, 65, 15, "already", items, runtime, onEvent))
    emitCompletedItems(completedAlready.data, "already", baseDir ?? "", runtime, onEvent)
    const completedWait = await runTransferGroups(transfers.filter((item) => item.stage === "wait"), normalized.transferMode, normalized, runtime, (event) => forwardMigrate(event, 80, 10, "wait", items, runtime, onEvent))
    emitCompletedItems(completedWait.data, "wait", baseDir ?? "", runtime, onEvent)
    const grouped = hasSameaGrouping(normalized)
      ? await runPostTransferSamea(sameaPaths, transfers, normalized, runtime, onEvent)
      : {}
    const completedItems = transferItems([...completedDel.plan, ...completedAlready.plan, ...completedWait.plan], transfers, sameaPaths, normalized, runtime)
    const data = summarize({ ...normalized, paths: sameaPaths }, completedItems, baseDir, { samea: sameaPlan.data, crashu: crashuData, migrateDel: completedDel.data, migrateAlready: completedAlready.data, migrateWait: completedWait.data, ...grouped })
    return { success: data.errorCount === 0, message: `ClassF pipeline applied ${data.movedCount + data.copiedCount} transfer(s).`, data }
  } catch (error) { return failure(errorMessage(error), normalized) }
}

interface FileTransfer { sourcePath: string; targetDir: string; targetPath: string; kind: "file" | "folder"; stage: ClassfTransferStage }

type PostTransferSameaData = Pick<ClassfData, "sameaGroupAlready" | "sameaGroupWait" | "sameaGroupDel">

/**
 * Run SameA over independently enabled output stages. Local placement has
 * one directory per stage/source directory; root placement has one per stage
 * below the configured target root.
 */
async function runPostTransferSamea(
  sourcePaths: string[],
  transfers: FileTransfer[],
  input: ReturnType<typeof normalizeClassfInput>,
  runtime: ClassfRuntime,
  onEvent: (event: NodeRunEvent) => void,
): Promise<PostTransferSameaData> {
  const roots = new Map<ClassfRouteStage, Set<string>>([
    ["already", new Set<string>()],
    ["wait", new Set<string>()],
    ["del", new Set<string>()],
  ])
  if (input.placementMode === "root" && input.targetDir) {
    for (const stage of routeStages()) if (isSameaGroupEnabled(stage, input)) roots.get(stage)!.add(runtime.join(input.targetDir, stage))
  } else {
    for (const transfer of transfers) if (isSameaGroupEnabled(transfer.stage, input)) roots.get(transfer.stage)!.add(transfer.targetDir)
    const existingRoots = await findClassificationDirectories(sourcePaths, runtime)
    for (const stage of routeStages()) {
      if (isSameaGroupEnabled(stage, input)) for (const path of existingRoots.get(stage)!) roots.get(stage)!.add(path)
    }
  }

  const output: PostTransferSameaData = {}
  for (const stage of routeStages()) {
    if (!isSameaGroupEnabled(stage, input)) continue
    const paths = [] as string[]
    for (const path of roots.get(stage)!) {
      const info = await runtime.pathInfo(path)
      if (info.exists && info.isDirectory) paths.push(path)
    }
    if (!paths.length) continue
    const progress = stage === "already" ? 92 : stage === "wait" ? 95 : 98
    onEvent({ type: "progress", progress, message: `SameA: grouping ${stage} files.` })
    const result = await runtime.runSamea({
      action: "classify",
      paths,
      ignorePathBlacklist: input.sameaIgnorePathBlacklist,
      minOccurrences: input.sameaGroupMinOccurrences,
      centralize: input.sameaGroupCentralize,
      includeDirectories: input.workItemMode !== "files",
      skipGroupedDirectories: true,
      dryRun: false,
    }, (event) => forward(event, progress - 2, 2, onEvent))
    if (stage === "already") output.sameaGroupAlready = result.data
    else if (stage === "wait") output.sameaGroupWait = result.data
    else output.sameaGroupDel = result.data
    if (!result.success) onEvent({ type: "log", message: `SameA ${stage} grouping failed: ${result.message}` })
  }
  onEvent({ type: "progress", progress: 100, message: "SameA grouping completed." })
  return output
}

async function findClassificationDirectories(
  sourcePaths: string[],
  runtime: Pick<ClassfRuntime, "pathInfo" | "listDir" | "dirname" | "basename" | "join">,
): Promise<Map<ClassfRouteStage, Set<string>>> {
  const found = new Map<ClassfRouteStage, Set<string>>([
    ["already", new Set<string>()],
    ["wait", new Set<string>()],
    ["del", new Set<string>()],
  ])
  const visited = new Set<string>()
  async function visit(path: string): Promise<void> {
    const info = await runtime.pathInfo(path)
    if (!info.exists) return
    if (info.isFile) {
      for (const stage of routeStages()) found.get(stage)!.add(runtime.join(runtime.dirname(info.path), stage))
      return
    }
    if (!info.isDirectory || visited.has(normalizePath(info.path))) return
    const ownStage = classificationStage(runtime.basename(info.path))
    if (ownStage) {
      found.get(ownStage)!.add(info.path)
      return
    }
    if (isClassificationDirectory(runtime.basename(info.path))) return
    visited.add(normalizePath(info.path))
    for (const entry of await runtime.listDir(info.path)) {
      if (!entry.isDirectory) continue
      const stage = classificationStage(entry.name)
      if (stage) found.get(stage)!.add(entry.path)
      else if (!isClassificationDirectory(entry.name)) await visit(entry.path)
    }
  }
  for (const path of sourcePaths) await visit(path)
  return found
}

async function collectInputItems(paths: string[], mode: ClassfWorkItemMode, runtime: Pick<ClassfRuntime, "pathInfo" | "listDir">): Promise<ClassfDirEntry[]> {
  const items: ClassfDirEntry[] = []
  if (mode !== "files") {
    for (const path of paths) {
      const info = await runtime.pathInfo(path)
      if (!info.exists || !info.isDirectory) continue
      const entries = await runtime.listDir(info.path)
      for (const entry of selectSinglePackFolderSources(entries)) {
        if (isClassificationDirectory(entry.name) || isArtistGroupDirectory(entry.name)) continue
        items.push({ name: entry.name, path: entry.path, isFile: false, isDirectory: true })
      }
      if (mode === "mixed") {
        for (const entry of entries) if (entry.isFile && isArchiveFile(entry.name)) items.push(entry)
      }
    }
    return [...new Map(items.map((item) => [normalizePath(item.path), item])).values()]
  }
  async function visit(path: string) {
    const info = await runtime.pathInfo(path)
    if (!info.exists) return
    if (info.isFile) { items.push({ name: pathName(path), path: info.path, isFile: true, isDirectory: false }); return }
    if (!info.isDirectory) return
    for (const entry of await runtime.listDir(info.path)) {
      if (entry.isFile) items.push(entry)
      else if (entry.isDirectory && !isClassificationDirectory(entry.name)) await visit(entry.path)
    }
  }
  for (const path of paths) await visit(path)
  return [...new Map(items.map((item) => [normalizePath(item.path), item])).values()]
}

function buildFileTransfers(files: ClassfDirEntry[], roots: string[], samea: SameaData, crashu: CrashuData | undefined, input: ReturnType<typeof normalizeClassfInput>, runtime: Pick<ClassfRuntime, "join" | "dirname" | "basename" | "relative">): FileTransfer[] {
  const detected = new Map(samea.items.filter((item) => item.sourcePath).map((item) => [normalizePath(item.sourcePath), item]))
  const matchedArtists = new Set((crashu?.similarFolders ?? []).map((folder) => folder.target.toLocaleLowerCase()))
  const transfers: FileTransfer[] = []
  for (const file of files) {
    const artist = detected.get(normalizePath(file.path))?.artistName
    const stage: ClassfTransferStage = artist && matchedArtists.has(artist.toLocaleLowerCase())
      ? "already"
      : artist && isClassfBlacklistedArtist(artist, input.blacklistKeywords) ? "del" : "wait"
    if (!isQueueEnabled(stage, input)) continue
    const targetDir = input.placementMode === "local"
      ? runtime.join(runtime.dirname(file.path), stage)
      : rootTargetDirectory(file.path, roots, input.targetDir!, stage, runtime)
    transfers.push({ sourcePath: file.path, targetDir, targetPath: runtime.join(targetDir, runtime.basename(file.path)), kind: file.isDirectory ? "folder" : "file", stage })
  }
  return transfers
}

function rootTargetDirectory(file: string, roots: string[], targetRoot: string, stage: ClassfTransferStage, runtime: Pick<ClassfRuntime, "join" | "dirname" | "basename" | "relative">): string {
  const owner = owningRoot(file, roots)
  const relativeFile = owner ? runtime.relative(owner, file) : runtime.basename(file)
  const preserved = roots.length > 1 && owner ? runtime.join(runtime.basename(owner), relativeFile) : relativeFile
  const relativeDir = parentRelative(preserved)
  return relativeDir ? runtime.join(targetRoot, stage, relativeDir) : runtime.join(targetRoot, stage)
}

async function runTransferGroups(transfers: FileTransfer[], action: "plan" | ClassfTransferMode, _input: ReturnType<typeof normalizeClassfInput>, runtime: ClassfRuntime, onEvent: (event: NodeRunEvent) => void): Promise<{ plan: MigratePlanItem[]; data: MigratefData | undefined }> {
  const groups = new Map<string, FileTransfer[]>()
  for (const transfer of transfers) groups.set(transfer.targetDir, [...(groups.get(transfer.targetDir) ?? []), transfer])
  const results: MigratefData[] = []
  for (const [targetPath, group] of groups) {
    const result = await runtime.runMigratef({ action, mode: "direct", sourcePaths: group.map((item) => item.sourcePath), targetPath, dryRun: action === "plan" }, onEvent)
    if (result.data) results.push(result.data)
  }
  const data = mergeMigrateData(results)
  return { plan: data?.plan ?? [], data }
}

function mergeMigrateData(results: MigratefData[]): MigratefData | undefined {
  if (!results.length) return undefined
  return {
    plan: results.flatMap((item) => item.plan), history: results.flatMap((item) => item.history),
    migratedCount: sum(results, "migratedCount"), skippedCount: sum(results, "skippedCount"), errorCount: sum(results, "errorCount"), totalCount: sum(results, "totalCount"),
    operationId: results.map((item) => item.operationId).filter(Boolean).join(","), successCount: sum(results, "successCount"), failedCount: sum(results, "failedCount"), errors: results.flatMap((item) => item.errors),
  }
}

function transferItems(plan: MigratePlanItem[], transfers: FileTransfer[], roots: string[], input: ReturnType<typeof normalizeClassfInput>, runtime: Pick<ClassfRuntime, "basename" | "relative">): ClassfPlanItem[] {
  const bySource = new Map(transfers.map((item) => [normalizePath(item.sourcePath), item]))
  return plan.map((item) => {
    const transfer = bySource.get(normalizePath(item.sourcePath))
    const stage = transfer?.stage ?? "wait"
    return {
      sourcePath: item.sourcePath, targetPath: item.targetPath, sourceName: runtime.basename(item.sourcePath),
      targetRelative: displayTarget(item.targetPath, item.sourcePath, roots, input, runtime), kind: transfer?.kind ?? (item.kind === "directory" ? "folder" : "file"), stage,
      status: item.status === "pending" ? "ready" : item.status === "success" ? item.action === "copy" ? "copied" : "moved" : item.status === "error" ? "error" : "skipped",
      reason: item.reason,
    }
  })
}

function displayTarget(target: string, source: string, roots: string[], input: ReturnType<typeof normalizeClassfInput>, runtime: Pick<ClassfRuntime, "relative">): string {
  if (input.placementMode === "root" && input.targetDir) return runtime.relative(input.targetDir, target)
  const owner = owningRoot(source, roots)
  return owner ? runtime.relative(owner, target) : target
}

function owningRoot(path: string, roots: string[]): string | undefined {
  const normalized = normalizePath(path)
  return [...roots].sort((left, right) => right.length - left.length).find((root) => normalized === normalizePath(root) || normalized.startsWith(`${normalizePath(root).replace(/\/$/, "")}/`))
}

function inferInputBase(paths: string[], runtime: Pick<ClassfRuntime, "dirname">): string | undefined {
  if (!paths.length) return undefined
  return paths.length === 1 ? paths[0] : inferCommonParent(paths, runtime)
}

function parentRelative(path: string): string { const normalized = path.replace(/\\/g, "/"); const index = normalized.lastIndexOf("/"); return index > 0 ? normalized.slice(0, index) : "" }
function pathName(path: string): string { return path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? path }
function isClassificationDirectory(name: string): boolean { return ["already", "wait", "del"].includes(name.toLocaleLowerCase()) }
function isArtistGroupDirectory(name: string): boolean { return /^\[[^\[\]]+\]$/.test(name.trim()) }
function classificationStage(name: string): ClassfRouteStage | undefined { const normalized = name.toLocaleLowerCase(); return routeStages().find((stage) => stage === normalized) }
function routeStages(): ClassfRouteStage[] { return ["already", "wait", "del"] }
function legacyQueueSettings(classifyMode: ClassfClassifyMode | undefined): Record<ClassfRouteStage, boolean> {
  if (classifyMode === "only") return { already: true, wait: false, del: true }
  if (classifyMode === "del") return { already: false, wait: false, del: true }
  return { already: true, wait: true, del: true }
}
function isQueueEnabled(stage: ClassfRouteStage, input: ReturnType<typeof normalizeClassfInput>): boolean { return input[`${stage}Enabled`] }
function isSameaGroupEnabled(stage: ClassfRouteStage, input: ReturnType<typeof normalizeClassfInput>): boolean { return isQueueEnabled(stage, input) && input[`sameaGroup${stage[0]!.toUpperCase()}${stage.slice(1)}Enabled` as "sameaGroupAlreadyEnabled" | "sameaGroupWaitEnabled" | "sameaGroupDelEnabled"] }
function hasSameaGrouping(input: ReturnType<typeof normalizeClassfInput>): boolean { return routeStages().some((stage) => isSameaGroupEnabled(stage, input)) }
function sum(items: MigratefData[], key: "migratedCount" | "skippedCount" | "errorCount" | "totalCount" | "successCount" | "failedCount"): number { return items.reduce((total, item) => total + item[key], 0) }

export function inferCommonParent(paths: string[], runtime: Pick<ClassfRuntime, "dirname">): string | undefined { const parents = new Set(paths.map((path) => normalizePath(runtime.dirname(path)))); return parents.size === 1 ? runtime.dirname(paths[0]!) : undefined }
export async function collectWaitCandidates(baseDir: string, selected: Set<string>, runtime: Pick<ClassfRuntime, "listDir">): Promise<ClassfDirEntry[]> { return (await runtime.listDir(baseDir)).filter((entry) => !selected.has(normalizePath(entry.path)) && !isClassificationDirectory(entry.name) && (entry.isFile || entry.isDirectory)) }

function summarize(input: ReturnType<typeof normalizeClassfInput>, items: ClassfPlanItem[], baseDir: string | undefined, stages: Pick<ClassfData, "samea" | "crashu" | "migrateDel" | "migrateAlready" | "migrateWait" | "sameaGroupAlready" | "sameaGroupWait" | "sameaGroupDel"> = {}): ClassfData { const errors = items.filter((item) => item.status === "error" || item.status === "conflict").map((item) => `${item.sourcePath}: ${item.reason ?? item.status}`); const groupingErrors = [stages.sameaGroupAlready, stages.sameaGroupWait, stages.sameaGroupDel].flatMap((data) => data?.errors ?? []).map((error) => `SameA grouping: ${error}`); return { action: input.action, transferMode: input.transferMode, classifyMode: input.classifyMode, placementMode: input.placementMode, workItemMode: input.workItemMode, targetDir: input.targetDir, baseDir, items, selectedCount: input.paths.length, readyCount: items.filter((item) => item.status === "ready").length, movedCount: items.filter((item) => item.status === "moved").length, copiedCount: items.filter((item) => item.status === "copied").length, delCount: items.filter((item) => item.stage === "del").length, waitCount: items.filter((item) => item.stage === "wait").length, conflictCount: items.filter((item) => item.status === "conflict").length, errorCount: items.filter((item) => item.status === "error").length + groupingErrors.length, errors: [...errors, ...groupingErrors], ...stages } }
function failure(message: string, input: ReturnType<typeof normalizeClassfInput>, stages: Pick<ClassfData, "samea" | "crashu" | "migrateDel" | "migrateAlready" | "migrateWait" | "sameaGroupAlready" | "sameaGroupWait" | "sameaGroupDel"> = {}): ClassfResult { return { success: false, message, data: summarize(input, [{ sourcePath: "", targetPath: "", sourceName: "", targetRelative: "", kind: "file", stage: "samea", status: "error", reason: message }], undefined, stages) } }
function forward(event: NodeRunEvent, offset: number, span: number, sink: (event: NodeRunEvent) => void) { sink(event.type === "progress" ? { ...event, progress: offset + Math.round(((event.progress ?? 0) / 100) * span) } : event) }
function forwardMigrate(event: NodeRunEvent, offset: number, span: number, stage: ClassfTransferStage, planned: ClassfPlanItem[], runtime: Pick<ClassfRuntime, "basename">, sink: (event: NodeRunEvent) => void) {
  if (event.type !== "progress") return sink(event)
  const item = planned.find((candidate) => candidate.stage === stage && runtime.basename(candidate.sourcePath) === event.message)
  sink({ ...event, progress: offset + Math.round(((event.progress ?? 0) / 100) * span), data: item ? { kind: "classf-item", sourcePath: item.sourcePath, stage, status: "running" } satisfies ClassfProgressData : event.data })
}
function emitCompletedItems(data: MigratefData | undefined, stage: ClassfTransferStage, _baseDir: string, runtime: Pick<ClassfRuntime, "basename" | "relative">, sink: (event: NodeRunEvent) => void) {
  for (const item of data?.plan ?? []) {
    const status: ClassfPlanStatus = item.status === "pending" ? "ready" : item.status === "success" ? item.action === "copy" ? "copied" : "moved" : item.status === "error" ? "error" : "skipped"
    sink({ type: "log", message: `${runtime.basename(item.sourcePath)}: ${status}`, data: { kind: "classf-item", sourcePath: item.sourcePath, stage, status, reason: item.reason } satisfies ClassfProgressData })
  }
}
function parseList(value: unknown): string[] { return String(value ?? "").split(/\r?\n|,/).map(clean).filter(Boolean) }
function uniqueClean(values: Array<string | undefined>): string[] { return [...new Set(values.map(clean).filter(Boolean))] }
function clean(value: unknown): string { return String(value ?? "").trim() }
function optional(value: unknown): string | undefined { const text = clean(value); return text || undefined }
function normalizePath(path: string): string { return path.replace(/\\/g, "/").toLowerCase() }
function clamp01(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.6 }
function clampInt(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
