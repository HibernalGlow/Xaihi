/**
 * `formatters` —— 展示层格式化函数的统一入口。
 *
 * MD3E 节点工作台（findz / kisaki）按这个路径取格式化函数；实现仍住在
 * `lib/format.ts`，这里只做转发，避免两套口径各写一份。
 */
export { formatBytes, formatDate } from "./format"
