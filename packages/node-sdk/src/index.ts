/**
 * `@hibernalglow/xaihi-sdk`：插件与宿主之间的契约单一真源。
 *
 * 本包只有类型与校验器，没有运行时依赖，因此可以同时被宿主（Node）与
 * 浏览器 bundle 内联使用。
 *
 * @module xaihi-sdk
 */

export * from './manifest.ts'
export * from './node.ts'
export * from './loader.ts'
export * from './wire.ts'
