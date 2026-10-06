/**
 * 读取层：把"翻一个日志目录里的 JSONL"这件事交给 DSH 的文件缝。
 *
 * 这里不自己 `node:fs.readdir` / `createReadStream`：上游 `platform.ts` 那份就是这么干的
 * （`<noxide>/packages/nodes/logx/src/platform.ts:1-12` → `@xiranite/logging/node` 的
 * `readLogDirectory`，`packages/logging/src/node.ts:163-182`），而 Xaihi 侧读写文件的缝是
 * `ctx.fs`（`docs/service-mapping.md`「文件与目录操作 ⇒ 不搬基础件」；
 * 判据是 `desktop/dsh/docs/subsystems/filesystem.md` 第 5 行自述的 `ctx.fs` + `FsTarget` 身份模型）。
 * 走这条缝换来三件本包写不出来的东西：目标身份（`targetKey` 不许解析）、后端可能是远端
 * 执行世界、以及 `fs-observation-policy` 那套读前观察。
 *
 * `core.ts` 只认 `LogxRuntime.read`，所以内核不必知道读取走的是哪条缝——这一点与
 * `plugins/recycleu/src/exec.ts` 对 `ctx.subprocess` 的处理是同一个形状。
 *
 * 两处上游做得到、这里做不到的，都记成缺口而不是绕过去（详见 `docs/service-mapping.md`）：
 * 1. **`.jsonl.gz` 轮转文件读不了**。上游对 `*.jsonl.gz` 或带 gzip 头的文件走
 *    `createGunzip`（`node.ts:169-171`），而 `ctx.fs` 只暴露解码后的文本
 *    （`readText` / `streamText`）与原始字节（`readBytes`），没有解压这一层。
 *    这里把它们列进 `files` 却**不解析**，并在 `issues` 里点名原因，绝不静默跳过。
 * 2. **没有 mtime 可排**。上游按修改时间排（`node.ts:157-160`），而 `FsInfo` /
 *    `FsDirEntry` 只给 `type` / `size` / `version`（`packages/fs/fs/src/types.ts:76-114`）。
 *    这里用 `listDir` 承诺的稳定名序。事件顺序不受影响——`core.ts` 之后总是按
 *    `timestamp` 重排（`logging.ts` 的 `queryLogs`），受影响的只有 `files` 列表的展示顺序。
 *
 * @module xaihi-logx/fs
 */

import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { LogEnvelope } from './logging.ts'
import { parseLogJsonl } from './logging.ts'
import type { LogxReadResult, LogxRuntime } from './core.ts'

/** 一行都读不出来时进 `issues` 的 code；上游那两个 code 之外新增，且必须在界面上说清。 */
const GZIP_CODE = 'unreadable-gzip'

/**
 * @param fs - DSH 的 `ctx.fs`。
 * @param cwd - 相对路径的基准；`resolve` 按 `opts.cwd` 的规则走。
 */
export function createFsLogxRuntime (fs: FileSystem, cwd: string): LogxRuntime {
  return {
    async read (input: { directory?: string }): Promise<LogxReadResult> {
      // 目录从哪来是接线方的事（`src/index.ts` 的 `Config.logDir`）：
      // 按 `docs/adr/0013-config-goes-through-dsh-settings.md`，这里不许有"环境变量/默认路径"兜底。
      const directory = input.directory?.trim() ?? ''
      if (directory === '') throw new Error('logx: 没有日志目录（Config.logDir 未配置），拒绝猜一个位置')
      const events: LogEnvelope[] = []
      const files: string[] = []
      const issues: LogxReadResult['issues'] = []

      const dirTarget = await fs.resolve(directory, { cwd })
      let entries
      try {
        entries = await fs.listDir(dirTarget)
      } catch (error) {
        // 目录不存在/不是目录要说得出原因，不能读成"0 个事件"（那会被当成查询成功）。
        const message = error instanceof Error ? error.message : String(error)
        return { directory: dirTarget.displayPath, events, files, issues: [{ file: directory, lineNumber: 0, code: 'unreadable-directory', message }] }
      }

      for (const entry of entries) {
        if (entry.type !== 'file') continue
        if (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.jsonl.gz')) continue
        files.push(entry.target.displayPath)

        if (entry.name.endsWith('.gz')) {
          issues.push({
            file: entry.target.displayPath,
            lineNumber: 0,
            code: GZIP_CODE,
            message: 'rotated gzip log: ctx.fs has no decompression seam, so this file is listed but not parsed',
          })
          continue
        }

        const text = await fs.readText(entry.target)
        const parsed = parseLogJsonl(text)
        events.push(...parsed.events)
        for (const issue of parsed.issues) {
          issues.push({ file: entry.target.displayPath, lineNumber: issue.lineNumber, code: issue.code, message: issue.message })
        }
      }

      // 上游返回的 `issues` 会把内部 `raw` 字段剥掉（`platform.ts:9`），这里也从一开始就不带它。
      return { directory: dirTarget.displayPath, events, files, issues }
    },
  }
}
