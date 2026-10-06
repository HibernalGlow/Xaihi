/**
 * `@hibernalglow/xaihi-ui` 的宿主半边。
 *
 * 它不注册任何能力：存在只为让 loader 有一行 `name` 等于本包名的插件行，
 * client-modules 按这个 specifier 挂载浏览器半边（"attaches a package's browser
 * half to the Loader row whose specifier is the bare package name"），关掉该行即
 * 卸载整个工作台。因此这里刻意不声明 Config —— 没有浏览器侧真读到的配置项，
 * 就不制造看起来能调的开关。
 *
 * @module xaihi-ui
 */

export const name = '@hibernalglow/xaihi-ui'

/** 无服务依赖：宿主半边只是一行占位，装载顺序由行本身的声明决定。 */
export const inject: string[] = []

export function apply(): void {}
