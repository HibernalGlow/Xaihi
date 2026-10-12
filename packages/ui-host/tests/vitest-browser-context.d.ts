/**
 * `@vitest/browser/context` 的最小类型面，只够浏览器尺里那一处像素回读用。
 *
 * 为什么不直接加依赖：`@vitest/browser` 此刻只是 `vitest` / `@vitest/browser-playwright` 的传递
 * 依赖，本包没有直接声明它；而 `pnpm-lock.yaml` 现在正躺在另一条 lane 的未提交桶里，加一条依赖会
 * 重写整份锁档。签名按 vitest 4.1 的 `BrowserPage.screenshot` / `UserEvent.click` 抄，只声明用到的那两个
 * 成员——真的把 `@vitest/browser` 写进 devDependencies 时，这个文件应当整份删掉。
 */
declare module '@vitest/browser/context' {
  /** 元素截图；`save: false` 时不落盘，直接回 base64 字符串。 */
  export const page: { screenshot(options: { element: Element; save: false }): Promise<string> }
  /** 走浏览器自己的指针事件（Radix 菜单项只认真的 pointer 序列）。 */
  export const userEvent: { click(element: Element): Promise<void> }
}
