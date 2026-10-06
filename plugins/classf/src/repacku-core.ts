/**
 * 函数垫片：classf 内核调用的那两个 Xiranite **RepackU** 纯函数。
 *
 * `core.ts:5` 从 `@xiranite/node-repacku/core` 拿的是**值**（不是类型）：
 * `collectInputItems` 用 `selectSinglePackFolderSources` 挑"单包文件夹"，
 * `mixed` 那一支用 `isArchiveFile` 认扩展名。所以这两个函数必须能跑，
 * 副本在这里，理由与缺口 **G10** 同源（见 `./crashu-core.ts` 文件头）。
 *
 * 逐条抄自基线 tag `noxide` 的 `packages/nodes/repacku/src/core.ts`，**一张表都不精简**：
 * - `DEFAULT_FILE_TYPES`（`:135-146`）：11 类。`.sha1` **同时**出现在 `text` 与 `image`
 *   里，`.nov` 在 `video`、`.bin` / `.pt` 在 `model`——`getFileType` 按
 *   `Object.entries` 的**声明顺序**返回第一个命中的类，所以 `.sha1` 算 `text` 不算 `image`。
 *   精简成"只留 archive 那一格"会让 `.sha1` / `.nov` 这类文件的判定翻面。
 * - `getFileType`（`:314-322`）：先查表，再用文件名里含 `readme` / `license` /
 *   `changelog` 兜成 `text`。
 * - `isFileInTypes`（`:324-330`）：`targetTypes` 为空 ⇒ **全真**；`getFileType` 有结论时
 *   只看它（所以名为 `README.zip` 的表内扩展……先看表，表命中就到此为止）；
 *   没结论才退化成"扩展名在不在目标类的表里"。
 * - `isArchiveFile`（`:332-334`）：`isFileInTypes(name, ["archive"])` 的一行别名。
 * - `selectSinglePackFolderSources`（`:667-673`）：只留目录，按
 *   `localeCompare(…, { numeric: true, sensitivity: "base" })` 排序——
 *   `2` 排在 `10` 前面是这一条给的，classf 的枚举顺序依赖它，不许换成 `sort()`。
 * - `getExtension`（`:850-854`）：取最后一段的最后一个点之后，小写；无点或点在最前 ⇒ 空串。
 *
 * @module xaihi-classf/repacku-core
 */

/** 上游 repacku `:135-146` 那张表，逐项原样。 */
export const DEFAULT_FILE_TYPES: Record<string, string[]> = {
  text: ['.txt', '.md', '.log', '.ini', '.cfg', '.conf', '.json', '.xml', '.yml', '.yaml', '.csv', '.convert', '.sha1'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', '.ico', '.raw', '.jxl', '.avif', '.psd', '.sha1'],
  video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.nov'],
  audio: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma', '.m4a', '.opus'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.cbz', '.cbr'],
  code: ['.py', '.js', '.html', '.css', '.java', '.c', '.cpp', '.cs', '.php', '.go', '.rs', '.rb', '.ts'],
  font: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  executable: ['.exe', '.dll', '.bat', '.sh', '.msi', '.app', '.apk'],
  model: ['.pth', '.h5', '.pb', '.onnx', '.tflite', '.mlmodel', '.pt', '.bin', '.caffemodel'],
}

/** 上游 repacku `:314-322` 逐字：表优先，命中顺序就是声明顺序。 */
export function getFileType(fileName: string): string | null {
  const extension = getExtension(fileName)
  for (const [type, extensions] of Object.entries(DEFAULT_FILE_TYPES)) {
    if (extensions.includes(extension)) return type
  }
  const lower = fileName.toLowerCase()
  if (lower.includes('readme') || lower.includes('license') || lower.includes('changelog')) return 'text'
  return null
}

/** 上游 repacku `:324-330` 逐字：空目标类 ⇒ 全真。 */
export function isFileInTypes(fileName: string, targetTypes: string[]): boolean {
  if (!targetTypes.length) return true
  const fileType = getFileType(fileName)
  if (fileType) return targetTypes.includes(fileType)
  const extension = getExtension(fileName)
  return targetTypes.some((type) => DEFAULT_FILE_TYPES[type]?.includes(extension))
}

/** 上游 repacku `:332-334` 逐字。 */
export function isArchiveFile(fileName: string): boolean {
  return isFileInTypes(fileName, ['archive'])
}

/** 上游 repacku `:667-673` 逐字：只留目录 + 数字感知排序。 */
export function selectSinglePackFolderSources(
  entries: Array<{ name: string; path: string; isDirectory: boolean }>,
): Array<{ name: string; path: string; isDirectory: boolean }> {
  return entries
    .filter((entry) => entry.isDirectory)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
}

/** 上游 repacku `:850-854` 逐字。 */
function getExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const index = base.lastIndexOf('.')
  return index > 0 ? base.slice(index).toLowerCase() : ''
}
