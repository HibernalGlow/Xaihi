/**
 * 类名合并工具。
 *
 * 项目内统一的 className 拼接函数：先用 clsx 处理条件类名与数组，
 * 再用 tailwind-merge 解决 Tailwind 类名冲突（如 `px-2 px-4` → `px-4`）。
 * 所有组件应通过 `cn(...)` 拼接类名，避免直接字符串拼接导致冲突类同时生效。
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并类名，自动解决 Tailwind 冲突。
 *
 * @param inputs 任意数量的类名（支持字符串、条件对象、数组）
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
