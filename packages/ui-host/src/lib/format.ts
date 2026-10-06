/**
 * 日期格式化工具。
 *
 * 基于 Intl.DateTimeFormat 实现，默认 en-US 区域与 long month + numeric day +
 * numeric year 格式。解析失败时返回空字符串而非抛错，便于 UI 安全使用。
 */
export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch (_err) {
    return "";
  }
}

/**
 * 字节数格式化（1024 进制，B/KB/MB/GB）。
 *
 * 放在共享 lib 是因为多处界面只需要同一本尺；节点包里各自实现的同名函数
 * （findz/kisaki）属于节点私有展示层，不在这里合并。
 */
export function formatBytes(bytes: number): string {
  const value = Number.isFinite(bytes) ? Math.max(0, Math.trunc(bytes)) : 0
  if (value < 1024) return `${value} B`
  const units = ["KB", "MB", "GB"] as const
  let scaled = value / 1024
  let unitIndex = 0
  while (unitIndex < units.length - 1 && scaled >= 1024) {
    scaled /= 1024
    unitIndex += 1
  }
  const digits = scaled >= 100 ? 0 : 1
  return `${scaled.toFixed(digits)} ${units[unitIndex]}`
}
