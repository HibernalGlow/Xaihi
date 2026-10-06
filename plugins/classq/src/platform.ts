/**
 * classq 的 `ClassqRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/classq/src/platform.ts`（34 行），只改了 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `samea` / `dissolvef` 同写法）。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：与 `docs/adr/0003-migrated-node-file-state.md`
 * 决定 1 判的是同一件事——`ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明
 * `FsTarget`、禁止解析、禁止假设本地绝对路径，而这个内核要 `join`/`dirname`/`relative` 的
 * 路径算术和 `rename`/`cp`。权限边界靠动作分级：`classify` + `dryRun=false` 在
 * `package.json#xaihi.node.danger`（`all` 两条谓词）里被判为危险，经 `defineNode` 变成
 * DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：classq 全程不调用外部程序（对照
 * `plugins/sleept/src/exec.ts` 那种"必须走宿主子进程缝"的情形）。
 * 本节点也不写任何"自己的账本/配置目录"，所以没有 `samea` 之外那道路径闸门
 * （对照 `dissolvef` 的 `historyPath`）：它的产物就是移动/复制文件本身。
 *
 * 枚举/改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 用 **`stat`**（跟随符号链接），且**不 `resolve()`**：返回的就是传进来的路径；
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是
 *   file 也不是 directory，内核那里被静默跳过；顺序 = OS 返回顺序，不排序；
 * - `ensureDir` 是 `mkdir(recursive)`，由 `runClassq` 在每次搬运前对**目标的父目录**发一次；
 * - `transfer` 两条腿：**`copy` 用 `cp({recursive:true, errorOnExist:true, force:false})`**
 *   ⇒ 目标已存在时抛错而不是覆盖；**`move` 用 `rename`** ⇒ **跨卷会 EXDEV 抛出**，
 *   上游没有退路，这里也不加（加了就和上游行为不同；dissolvef 那份有 cp+rm 兜底，
 *   是它自己的内核，不是这份）。
 *
 * @module xaihi-classq/platform
 */

import { cp, mkdir, readdir, rename, stat } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import type { ClassqRuntime, ClassqTransferMode } from "./core.ts"

export function createNodeClassqRuntime(): ClassqRuntime {
  return {
    pathInfo: async (path) => {
      try {
        const info = await stat(path)
        return { path, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() }
      } catch {
        return { path, exists: false, isFile: false, isDirectory: false }
      }
    },
    listDir: async (path) => {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({ name: entry.name, path: join(path, entry.name), isFile: entry.isFile(), isDirectory: entry.isDirectory() }))
    },
    ensureDir: async (path) => {
      await mkdir(path, { recursive: true })
    },
    transfer: async (source, target, mode: ClassqTransferMode) => {
      if (mode === "copy") {
        await cp(source, target, { recursive: true, errorOnExist: true, force: false })
        return
      }
      await rename(source, target)
    },
    join,
    dirname,
    basename,
    relative,
  }
}
