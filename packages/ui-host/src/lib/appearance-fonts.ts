/**
 * 字体预设 —— 一份词表、一次落盘。
 *
 * 从 `@/lib/appearance` 拆出：那边是 1300+ 行的历史债务文件（AGENTS.md 单文件上限），
 * 而这一块的边界是清楚的（预设表 + 按 key 查表 + 写 document root 的 CSS 变量）。
 * 族名顺序是产品行为，不是排版：见 FONT_PRESETS 里 aestivus 那条的注释。
 */
import type { AppFontPreset } from "@/types/workspace"

export interface FontPresetOption {
  key: AppFontPreset
  label: string
  description: string
  sans: string
  mono: string
}

export const FONT_PRESETS: FontPresetOption[] = [
  {
    key: "xiranite",
    label: "Xiranite",
    description: "Inter UI with JetBrains Mono code surfaces.",
    sans: "\"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "system",
    label: "System",
    description: "Native platform UI fonts with stable monospace fallback.",
    sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    mono: "ui-monospace, \"Cascadia Mono\", \"Segoe UI Mono\", monospace",
  },
  {
    key: "aestivus",
    label: "LXGW WenKai Screen",
    description: "霞鹜文楷 屏幕阅读版 for UI text, JetBrains Mono with a same-family monospace fallback for technical fields.",
    // 中英文族名都要列：本机装着的是「霞鹜文楷 屏幕阅读版」，CoreText 两个名字都可能命中；
    // GB Screen 兜在最后，缺字才轮到它（它的 CJK 覆盖更全）。
    sans: "\"LXGW WenKai Screen\", \"霞鹜文楷 屏幕阅读版\", \"Inter\", \"LXGW WenKai GB Screen\", ui-sans-serif, system-ui, sans-serif",
    // MD3 的 label/body 角色解析到 --font-app-mono（lib/design-theme/md3/mapper.ts），
    // 所以等宽这一路必须也带上霞鹜文楷，否则切到这个预设在 M3 皮肤下看不出差别。
    mono: "\"JetBrains Mono\", \"LXGW WenKai Mono Screen\", ui-monospace, monospace",
  },
  {
    key: "industrial",
    label: "Industrial",
    description: "Hanken Grotesk UI with JetBrains Mono labels for jade industrial workspaces.",
    sans: "\"Hanken Grotesk\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "display",
    label: "Display",
    description: "Wide editorial display treatment for cinematic, image-led interfaces.",
    sans: "\"Space Grotesk\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "editorial",
    label: "Editorial",
    description: "Serif-led rhythm for gallery and long-form workspace surfaces.",
    sans: "\"Fraunces\", Georgia, Cambria, \"Times New Roman\", serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "poster",
    label: "Poster",
    description: "Narrow grotesk UI with high-contrast editorial headings supplied by the theme.",
    sans: "\"Inter Tight\", \"Arial Narrow\", \"Helvetica Neue\", Arial, sans-serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "terminal",
    label: "Terminal",
    description: "Inter UI with Menlo-style technical labels for modular terminal layouts.",
    sans: "\"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "Menlo, Monaco, Consolas, \"Courier New\", ui-monospace, monospace",
  },
  {
    key: "machina",
    label: "Machina",
    description: "Squared agency display typography with a restrained grotesk utility face.",
    sans: "\"NeueMachina\", \"Space Grotesk\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"Source Code Pro\", \"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "sketch",
    label: "Sketch",
    description: "Hand-drawn Excalidraw-style text with a clean technical fallback.",
    sans: "\"Excalifont\", \"Xiaolai\", \"Comic Sans MS\", \"Assistant\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "workshop",
    label: "Workshop",
    description: "Rounded component-workshop typography inspired by Storybook docs and addon panels.",
    sans: "\"Nunito Sans\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"SFMono-Regular\", \"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "canvas",
    label: "Canvas",
    description: "Work Sans-led interface typography for design-canvas and inspector surfaces.",
    sans: "\"Work Sans\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
    mono: "\"JetBrains Mono\", \"SFMono-Regular\", ui-monospace, monospace",
  },
  {
    key: "serif",
    label: "Serif",
    description: "Reading-friendly serif text while keeping code monospace.",
    sans: "ui-serif, Georgia, Cambria, \"Times New Roman\", serif",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
  {
    key: "mono",
    label: "Mono UI",
    description: "Monospace everywhere for dense operational workspaces.",
    sans: "\"JetBrains Mono\", ui-monospace, monospace",
    mono: "\"JetBrains Mono\", ui-monospace, monospace",
  },
]

/** 按 key 查找字体预设，找不到回退到第一个（xiranite 默认）。 */
export function getFontPresetOption(fontPreset: AppFontPreset): FontPresetOption {
  return FONT_PRESETS.find((preset) => preset.key === fontPreset) ?? FONT_PRESETS[0]
}

/**
 * 把字体预设应用到 document root。
 *
 * 写入两组 CSS 变量：
 * - --font-app-sans / --font-app-mono：当前生效的字体栈
 * - --font-custom-sans / --font-custom-mono：自定义字体覆盖（非 xiranite 预设时启用）
 *
 * 同时设置 data-font-preset 与 data-custom-font 属性，供 CSS 选择器区分。
 */
export function applyFontPreset(fontPreset: AppFontPreset): void {
  if (typeof document === "undefined") return

  const root = document.documentElement
  const preset = getFontPresetOption(fontPreset)
  root.dataset.fontPreset = preset.key
  root.style.setProperty("--font-app-sans", preset.sans)
  root.style.setProperty("--font-app-mono", preset.mono)

  if (preset.key === "xiranite") {
    root.removeAttribute("data-custom-font")
    root.style.removeProperty("--font-custom-sans")
    root.style.removeProperty("--font-custom-mono")
    return
  }

  root.setAttribute("data-custom-font", "enabled")
  root.style.setProperty("--font-custom-sans", preset.sans)
  root.style.setProperty("--font-custom-mono", preset.mono)
}
