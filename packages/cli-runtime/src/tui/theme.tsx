import * as React from "react"

export interface TerminalTheme {
  name: string
  colors: {
    primary: string
    foreground: string
    mutedForeground: string
    border: string
    focusRing: string
    success: string
    warning: string
    error: string
  }
}

type Palette = Omit<TerminalTheme["colors"], "focusRing"> & { focusRing?: string }

// Generated from the local termcn OpenTUI registry snapshot. Keep this data
// renderer-neutral: importing registry UI source here would pull optional
// native/terminal-only dependencies into consumers of the safe terminal API.
const termcnPalettes: readonly [string, Palette][] = [
  ["default", { primary: "#7C3AED", foreground: "#FFFFFF", mutedForeground: "#9CA3AF", border: "#4B5563", focusRing: "#8B5CF6", success: "#10B981", warning: "#F59E0B", error: "#EF4444" }],
  ["nord", { primary: "#88C0D0", foreground: "#ECEFF4", mutedForeground: "#4C566A", border: "#4C566A", focusRing: "#88C0D0", success: "#A3BE8C", warning: "#EBCB8B", error: "#BF616A" }],
  ["dracula", { primary: "#BD93F9", foreground: "#F8F8F2", mutedForeground: "#6272A4", border: "#6272A4", focusRing: "#BD93F9", success: "#50FA7B", warning: "#F1FA8C", error: "#FF5555" }],
  ["high-contrast", { primary: "#FFFFFF", foreground: "#FFFFFF", mutedForeground: "#CCCCCC", border: "#FFFFFF", focusRing: "#FFFF00", success: "#00FF00", warning: "#FFFF00", error: "#FF4444" }],
  ["high-contrast-light", { primary: "#000000", foreground: "#000000", mutedForeground: "#444444", border: "#000000", focusRing: "#0000CC", success: "#006600", warning: "#884400", error: "#CC0000" }],
  ["catppuccin", { primary: "#CBA6F7", foreground: "#CDD6F4", mutedForeground: "#6C7086", border: "#45475A", focusRing: "#CBA6F7", success: "#A6E3A1", warning: "#F9E2AF", error: "#F38BA8" }],
  ["catppuccin-frappe", { primary: "#8da4e2", foreground: "#c6d0f5", mutedForeground: "#949cb8", border: "#949cb8", focusRing: "#ca9ee6", success: "#a6d189", warning: "#e5c890", error: "#e78284" }],
  ["catppuccin-macchiato", { primary: "#8aadf4", foreground: "#cad3f5", mutedForeground: "#939ab7", border: "#939ab7", focusRing: "#c6a0f6", success: "#a6da95", warning: "#eed49f", error: "#ed8796" }],
  ["monokai", { primary: "#A6E22E", foreground: "#F8F8F2", mutedForeground: "#75715E", border: "#75715E", focusRing: "#A6E22E", success: "#A6E22E", warning: "#E6DB74", error: "#F92672" }],
  ["one-dark", { primary: "#61AFEF", foreground: "#ABB2BF", mutedForeground: "#5C6370", border: "#4B5263", focusRing: "#61AFEF", success: "#98C379", warning: "#E5C07B", error: "#E06C75" }],
  ["onedarkpro", { primary: "#61afef", foreground: "#abb2bf", mutedForeground: "#5c6370", border: "#5c6370", focusRing: "#c678dd", success: "#98c379", warning: "#e5c07b", error: "#e06c75" }],
  ["solarized", { primary: "#268BD2", foreground: "#839496", mutedForeground: "#586E75", border: "#586E75", focusRing: "#268BD2", success: "#859900", warning: "#B58900", error: "#DC322F" }],
  ["tokyo-night", { primary: "#7AA2F7", foreground: "#C0CAF5", mutedForeground: "#565F89", border: "#3B4261", focusRing: "#7AA2F7", success: "#9ECE6A", warning: "#E0AF68", error: "#F7768E" }],
  ["amoled", { primary: "#b388ff", foreground: "#ffffff", mutedForeground: "#888888", border: "#555555", focusRing: "#b388ff", success: "#00ff88", warning: "#ffea00", error: "#ff1744" }],
  ["aura", { primary: "#a277ff", foreground: "#edecee", mutedForeground: "#6d6a7e", border: "#6d6a7e", focusRing: "#a277ff", success: "#61ffca", warning: "#ffca85", error: "#ff6767" }],
  ["ayu", { primary: "#3fb7e3", foreground: "#d6dae0", mutedForeground: "#5a6673", border: "#5a6673", focusRing: "#3fb7e3", success: "#78d05c", warning: "#e4a75c", error: "#f58572" }],
  ["carbonfox", { primary: "#33b1ff", foreground: "#f2f4f8", mutedForeground: "#6f6f6f", border: "#6f6f6f", focusRing: "#be95ff", success: "#42be65", warning: "#f1c21b", error: "#ff8389" }],
  ["cobalt2", { primary: "#0088ff", foreground: "#ffffff", mutedForeground: "#adb7c9", border: "#0088ff", focusRing: "#2affdf", success: "#9eff80", warning: "#ffc600", error: "#ff0088" }],
  ["cursor", { primary: "#88c0d0", foreground: "#e4e4e4", mutedForeground: "#e4e4e45e", border: "#e4e4e45e", focusRing: "#82d2ce", success: "#3fa266", warning: "#f1b467", error: "#e34671" }],
  ["everforest", { primary: "#a7c080", foreground: "#d3c6aa", mutedForeground: "#7a8478", border: "#7a8478", focusRing: "#d699b6", success: "#a7c080", warning: "#e69875", error: "#e67e80" }],
  ["flexoki", { primary: "#da702c", foreground: "#cecdc3", mutedForeground: "#6f6e69", border: "#6f6e69", focusRing: "#879a39", success: "#879a39", warning: "#da702c", error: "#d14d41" }],
  ["github", { primary: "#58a6ff", foreground: "#c9d1d9", mutedForeground: "#8b949e", border: "#30363d", focusRing: "#58a6ff", success: "#3fb950", warning: "#e3b341", error: "#f85149" }],
  ["gruvbox", { primary: "#83a598", foreground: "#ebdbb2", mutedForeground: "#928374", border: "#928374", focusRing: "#fb4934", success: "#b8bb26", warning: "#fabd2f", error: "#fb4934" }],
  ["kanagawa", { primary: "#7e9cd8", foreground: "#dcd7ba", mutedForeground: "#727169", border: "#727169", focusRing: "#957fbb", success: "#98bb6c", warning: "#d7a657", error: "#e82424" }],
  ["lucent-orng", { primary: "#ec5b2b", foreground: "#eeeeee", mutedForeground: "#808080", border: "#808080", focusRing: "#ec5b2b", success: "#6ba1e6", warning: "#ec5b2b", error: "#e06c75" }],
  ["material", { primary: "#82aaff", foreground: "#eeffff", mutedForeground: "#546e7a", border: "#546e7a", focusRing: "#c792ea", success: "#c3e88d", warning: "#ffcb6b", error: "#f07178" }],
  ["matrix", { primary: "#2eff6a", foreground: "#62ff94", mutedForeground: "#8ca391", border: "#8ca391", focusRing: "#c770ff", success: "#62ff94", warning: "#e6ff57", error: "#ff4b4b" }],
  ["mercury", { primary: "#8da4f5", foreground: "#dddde5", mutedForeground: "#9d9da8", border: "#9d9da8", focusRing: "#8da4f5", success: "#77c599", warning: "#fc9b6f", error: "#fc92b4" }],
  ["nightowl", { primary: "#82aaff", foreground: "#d6deeb", mutedForeground: "#637777", border: "#637777", focusRing: "#c792ea", success: "#c5e478", warning: "#ecc48d", error: "#ef5350" }],
  ["oc-2", { primary: "#fab283", foreground: "#f1ece8", mutedForeground: "#707070", border: "#282828", focusRing: "#edb2f1", success: "#12c905", warning: "#fcd53a", error: "#fc533a" }],
  ["opencode", { primary: "#fab283", foreground: "#eeeeee", mutedForeground: "#808080", border: "#808080", focusRing: "#9d7cd8", success: "#7fd88f", warning: "#f5a742", error: "#e06c75" }],
  ["orng", { primary: "#ec5b2b", foreground: "#eeeeee", mutedForeground: "#808080", border: "#808080", focusRing: "#ec5b2b", success: "#6ba1e6", warning: "#ec5b2b", error: "#e06c75" }],
  ["osaka-jade", { primary: "#2dd5b7", foreground: "#c1c497", mutedForeground: "#53685b", border: "#53685b", focusRing: "#2dd5b7", success: "#549e6a", warning: "#e5c736", error: "#ff5345" }],
  ["palenight", { primary: "#82aaff", foreground: "#a6accd", mutedForeground: "#676e95", border: "#676e95", focusRing: "#c792ea", success: "#c3e88d", warning: "#ffcb6b", error: "#f07178" }],
  ["rosepine", { primary: "#9ccfd8", foreground: "#e0def4", mutedForeground: "#6e6a86", border: "#6e6a86", focusRing: "#31748f", success: "#31748f", warning: "#f6c177", error: "#eb6f92" }],
  ["shadesofpurple", { primary: "#c792ff", foreground: "#f5f0ff", mutedForeground: "#b362ff", border: "#b362ff", focusRing: "#c792ff", success: "#7be0b0", warning: "#ffd580", error: "#ff7ac6" }],
  ["synthwave84", { primary: "#36f9f6", foreground: "#ffffff", mutedForeground: "#848bbd", border: "#848bbd", focusRing: "#ff7edb", success: "#72f1b8", warning: "#fede5d", error: "#fe4450" }],
  ["vercel", { primary: "#0070f3", foreground: "#ededed", mutedForeground: "#878787", border: "#454545", focusRing: "#f75590", success: "#46a758", warning: "#ffb224", error: "#e5484d" }],
  ["vesper", { primary: "#ffc799", foreground: "#ffffff", mutedForeground: "#8b8b8b", border: "#8b8b8b", focusRing: "#a0a0a0", success: "#99ffe4", warning: "#ffc799", error: "#ff8080" }],
  ["zenburn", { primary: "#8cd0d3", foreground: "#dcdccc", mutedForeground: "#9f9f9f", border: "#9f9f9f", focusRing: "#f0dfaf", success: "#7f9f7f", warning: "#f0dfaf", error: "#cc9393" }],
]

function asTheme([name, colors]: readonly [string, Palette]): TerminalTheme {
  return { name, colors: { ...colors, focusRing: colors.focusRing ?? colors.primary } }
}

const importedTermcnThemes = termcnPalettes.map(asTheme)
export const nordTerminalTheme = importedTermcnThemes.find((theme) => theme.name === "nord")!
// Compatibility export: the identifier remains available, but global fallback is Nord.
export const defaultTerminalTheme = nordTerminalTheme

const terminalThemes = new Map(importedTermcnThemes.map((theme) => [theme.name, theme]))

export function registerTerminalTheme(theme: TerminalTheme): void {
  terminalThemes.set(theme.name.toLowerCase(), theme)
}

export function resolveTerminalTheme(name?: string): TerminalTheme {
  return terminalThemes.get(name?.toLowerCase() ?? "nord") ?? nordTerminalTheme
}

export function listTerminalThemes(): readonly string[] {
  return [...terminalThemes.keys()]
}

const ThemeContext = React.createContext<TerminalTheme>(nordTerminalTheme)

export function TerminalThemeProvider({ children, theme = nordTerminalTheme }: { children: React.ReactNode; theme?: TerminalTheme }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTerminalTheme(): TerminalTheme {
  return React.useContext(ThemeContext)
}
