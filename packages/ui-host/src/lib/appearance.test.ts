// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

import { afterEach, describe, expect, test } from "vitest"
import {
  AESTIVUS_THEME_NAME_BY_PRESET,
  applyCustomTheme,
  applyThemePreset,
  mirrorAestivusThemeStorage,
  parseImportedThemeJson,
  presetThemeRootClass,
  THEME_DESIGN_RECIPES,
  THEME_PRESET_OPTIONS,
  THEME_PRESET_DEFAULT_MODE,
  THEME_STYLE_PROFILES,
} from "./appearance"
import { applyFontPreset, FONT_PRESETS } from "./appearance-fonts"

afterEach(() => {
  document.documentElement.removeAttribute("class")
  document.documentElement.removeAttribute("data-app-theme")
  document.documentElement.removeAttribute("data-theme-family")
  document.documentElement.removeAttribute("data-theme-density")
  document.documentElement.removeAttribute("data-theme-radius")
  document.documentElement.removeAttribute("data-theme-border")
  document.documentElement.removeAttribute("data-theme-motion")
  document.documentElement.removeAttribute("data-theme-surface")
  document.documentElement.removeAttribute("data-theme-depth")
  document.documentElement.removeAttribute("data-theme-node-interior")
  document.documentElement.removeAttribute("data-custom-theme")
  document.documentElement.removeAttribute("data-custom-theme-name")
  document.documentElement.removeAttribute("data-theme-visual-source")
  document.documentElement.removeAttribute("data-font-preset")
  document.documentElement.removeAttribute("data-custom-font")
  document.documentElement.removeAttribute("style")
  localStorage.clear()
})

describe("appearance bridge", () => {
  test("defines Wuling as a light jade industrial preset", () => {
    expect(THEME_PRESET_DEFAULT_MODE.wuling).toBe("light")
    expect(THEME_DESIGN_RECIPES.wuling).toMatchObject({
      fontPreset: "industrial",
      bgMode: "grid",
      grainEnabled: false,
      grainIntensity: 0,
      actionGlow: false,
      cardElevation: false,
    })
    expect(FONT_PRESETS.some((preset) => preset.key === "industrial")).toBe(true)
    expect(THEME_STYLE_PROFILES.wuling).toMatchObject({
      family: "jade-industrial",
      border: "outlined",
      nodeInterior: "ledger-panels",
    })
  })


  test("the shared preset list carries only Wuling after the presets/design-language merge", () => {
    // 2026-10-05：其余 16 套内置预设整批出局（它们本来就是在模仿「高级主题那个样子」）。
    // 这一条同时是「别又悄悄加回来」的门禁：名单必须恰好是 wuling。
    expect(THEME_PRESET_OPTIONS.map((preset) => preset.key)).toEqual(["wuling"])
    for (const preset of THEME_PRESET_OPTIONS) {
      expect(THEME_DESIGN_RECIPES[preset.key], `${preset.key} 没有设计配方`).toBeDefined()
      expect(THEME_STYLE_PROFILES[preset.key], `${preset.key} 没有风格画像`).toBeDefined()
      expect(AESTIVUS_THEME_NAME_BY_PRESET[preset.key], `${preset.key} 没有 aestivus 镜像名`).toBeTruthy()
      expect(THEME_PRESET_DEFAULT_MODE[preset.key], `${preset.key} 没有默认明暗档`).toBeTruthy()
      // 色板与标签必须一一对应：少一个标签，界面上就是一个裸 key。
      expect(preset.palette.length).toBeGreaterThan(1)
      expect(preset.paletteLabelKeys.length, `${preset.key} 的色板标签数没和色板对齐`).toBe(preset.palette.length)
      expect(preset.source.title.length, `${preset.key} 的来源标题是空的`).toBeGreaterThan(0)
    }
  })

  test("the root class the app writes has a stylesheet, and no stylesheet is orphaned", () => {
    // 「删了一半」是这批预设出路的真实故障模式，两条各封一个方向：
    //  1. 生产代码里的类名没有对应的 CSS——`WorkspaceLayout` 与 `FloatingComponentWindow` 曾各自手抄
    //     `theme === "endfield" ? "theme-endfield"`，而 `endfield.css` 已经不在盘上了；类名照写，
    //     样式一个都没有，界面静默变成「没有主题」。
    //  2. 盘上的调色板文件没有被任何预设引用——留着就是没人能选中的死 CSS。
    // 两边都由盘上的事实现算，不靠我记住有哪几个名字。
    const dir = resolve(import.meta.dirname, "../styles/themes")
    const files = readdirSync(dir).filter((name) => name.endsWith(".css"))
    // 只有「带 `.theme-<名字>` 身份块并声明 --background」的文件才算调色板。`base.css` 是 2026-10-05
    // 从被删的 spatial.css 里救出来的**兜底层**（bare `:root`），它没有预设身份、也不该出现在预设名单里。
    const paletteFiles = files
      .filter((name) => {
        // 注释里的 `.theme-wuling` 不算身份块，所以先剥掉注释再判（base.css 的出处说明里就写着它）。
        const css = readFileSync(resolve(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
        return /--background:/.test(css) && /\.theme-[a-z0-9-]+\s*[,{]/.test(css)
      })
      .map((name) => name.replace(/\.css$/, ""))
      .sort()
    const presetKeys = THEME_PRESET_OPTIONS.map((preset) => preset.key)

    for (const key of presetKeys) {
      const rootClass = presetThemeRootClass(key)
      expect(files, `${key} 写出的根类 ${rootClass} 没有对应的 CSS 文件`)
        .toContain(`${rootClass.replace(/^theme-/, "")}.css`)
    }
    expect(paletteFiles, "盘上有调色板文件不在预设名单里").toEqual([...presetKeys].sort())

    // 尺子本身要能红：类名与文件对不上必须是可发现的（这里用假名字走同一条差集）。
    const planted = ["wuling", "endfield"]
    expect(planted.filter((name) => !files.includes(`${name}.css`))).toEqual(["endfield"])
  })

  test("applyThemePreset writes the root class and dataset, and clears a stale retired class", () => {
    const root = document.documentElement
    // 退役预设的 class 可能留在 DOM 上（旧会话/旧持久化），必须被清掉：留着就是半套样式。
    root.classList.add("theme-spatial")
    applyThemePreset("wuling")

    expect(root.dataset.appTheme).toBe("wuling")
    expect(root.dataset.themeFamily).toBe("jade-industrial")
    expect(root.dataset.themeDensity).toBeTruthy()
    expect(root.classList.contains("theme-wuling")).toBe(true)
    expect(root.classList.contains("theme-spatial"), "退役预设的 class 没被清掉").toBe(false)
  })

  test("mirrors the active preset and imported themes to aestivus-compatible storage", () => {
    const themes = parseImportedThemeJson(JSON.stringify([
      { name: "Imported", cssVars: { light: { background: "oklch(1 0 0)" }, dark: { background: "oklch(0.2 0 0)" } } },
      { name: "Second", cssVars: { light: { background: "oklch(0.9 0 0)" }, dark: { background: "oklch(0.1 0 0)" } } },
    ]))

    mirrorAestivusThemeStorage("wuling", "system", themes, themes[1])
    expect(localStorage.getItem("theme-name")).toBe("Second")
    expect(localStorage.getItem("theme-mode")).toBe("system")
    expect(JSON.parse(localStorage.getItem("custom-themes") ?? "[]").map((item: { name: string }) => item.name))
      .toEqual(["Imported", "Second"])

    // 没选自定义主题时，镜像的是预设自己的名字（不是随便一个字符串）。
    mirrorAestivusThemeStorage("wuling", "dark")
    expect(localStorage.getItem("theme-name")).toBe(AESTIVUS_THEME_NAME_BY_PRESET.wuling)
    expect(localStorage.getItem("theme-mode")).toBe("dark")
  })


  test("applies every built-in theme root class", () => {
    for (const preset of THEME_PRESET_OPTIONS) {
      applyThemePreset(preset.key)
      const profile = THEME_STYLE_PROFILES[preset.key]

      expect(document.documentElement.dataset.appTheme).toBe(preset.key)
      expect(document.documentElement.dataset.themeFamily).toBe(profile.family)
      expect(document.documentElement.dataset.themeDensity).toBe(profile.density)
      expect(document.documentElement.dataset.themeRadius).toBe(profile.radius)
      expect(document.documentElement.dataset.themeBorder).toBe(profile.border)
      expect(document.documentElement.dataset.themeMotion).toBe(profile.motion)
      expect(document.documentElement.dataset.themeSurface).toBe(profile.surface)
      expect(document.documentElement.dataset.themeDepth).toBe(profile.depth)
      expect(document.documentElement.dataset.themeNodeInterior).toBe(profile.nodeInterior)
      expect(document.documentElement.classList.contains(`theme-${preset.key}`)).toBe(true)
    }
  })

  test("keeps aestivus-compatible storage and font variables in sync", () => {
    applyFontPreset("aestivus")
    mirrorAestivusThemeStorage("wuling", "dark")

    expect(document.documentElement.getAttribute("data-custom-font")).toBe("enabled")
    expect(document.documentElement.style.getPropertyValue("--font-custom-sans")).toContain("LXGW WenKai")
    expect(localStorage.getItem("theme-name")).toBe("Wuling")
    expect(localStorage.getItem("theme-mode")).toBe("dark")
  })

  test("parses tweakcn-style theme JSON and normalizes CSS variable keys", () => {
    const themes = parseImportedThemeJson(JSON.stringify({
      name: "Slate Import",
      description: "Imported from tweakcn",
      cssVars: {
        theme: { radius: "0.5rem" },
        light: {
          "--background": "oklch(1 0 0)",
          primary: "oklch(0.5 0.12 250)",
        },
        dark: {
          background: "oklch(0.15 0 0)",
        },
      },
    }))

    expect(themes).toEqual([{
      name: "Slate Import",
      description: "Imported from tweakcn",
      cssVars: {
        theme: { radius: "0.5rem" },
        light: {
          background: "oklch(1 0 0)",
          primary: "oklch(0.5 0.12 250)",
        },
        dark: {
          background: "oklch(0.15 0 0)",
        },
      },
    }])
  })

  test("parses theme.json arrays as a full imported theme library", () => {
    const themes = parseImportedThemeJson(JSON.stringify([
      {
        name: "perpetuity",
        cssVars: {
          light: { background: "oklch(0.9491 0.0085 197.0126)", primary: "oklch(0.5624 0.0947 203.2755)" },
          dark: { background: "oklch(0.2068 0.0247 224.4533)", primary: "oklch(0.8520 0.1269 195.0354)" },
        },
      },
      {
        name: "amethyst-haze",
        cssVars: {
          light: { background: "oklch(0.9777 0.0041 301.4256)", primary: "oklch(0.6104 0.0767 299.7335)" },
          dark: { background: "oklch(0.2166 0.0215 292.8474)", primary: "oklch(0.7058 0.0777 302.0489)" },
        },
      },
    ]))

    expect(themes).toHaveLength(2)
    expect(themes.map((theme) => theme.name)).toEqual(["perpetuity", "amethyst-haze"])
  })

  test("parses registry-wrapped and keyed theme libraries", () => {
    const registryThemes = parseImportedThemeJson(JSON.stringify({
      items: [
        {
          name: "tweakcn-slate",
          type: "registry:theme",
          cssVars: {
            light: { background: "oklch(0.98 0 0)", primary: "oklch(0.52 0.15 250)" },
            dark: { background: "oklch(0.18 0 0)", primary: "oklch(0.74 0.13 250)" },
          },
        },
      ],
    }))

    expect(registryThemes.map((theme) => theme.name)).toEqual(["tweakcn-slate"])
    expect(registryThemes[0].cssVars.light.primary).toBe("oklch(0.52 0.15 250)")

    const keyedThemes = parseImportedThemeJson(JSON.stringify({
      perpetuity: {
        cssVars: {
          light: { background: "oklch(0.9491 0.0085 197.0126)" },
          dark: { background: "oklch(0.2068 0.0247 224.4533)" },
        },
      },
    }))

    expect(keyedThemes.map((theme) => theme.name)).toEqual(["perpetuity"])
    expect(keyedThemes[0].cssVars.dark?.background).toBe("oklch(0.2068 0.0247 224.4533)")
  })

  test("parses aestivus-style theme JSON", () => {
    const [theme] = parseImportedThemeJson(JSON.stringify({
      name: "Aestivus Import",
      colors: {
        light: { background: "oklch(0.98 0 0)" },
        dark: { background: "oklch(0.18 0 0)" },
      },
    }))

    expect(theme.cssVars.light.background).toBe("oklch(0.98 0 0)")
    expect(theme.cssVars.dark?.background).toBe("oklch(0.18 0 0)")
  })

  test("applies imported theme variables and clears them when disabled", () => {
    const [theme] = parseImportedThemeJson(JSON.stringify({
      name: "Imported",
      cssVars: {
        light: {
          "--background": "oklch(0.99 0 0)",
          primary: "oklch(0.55 0.16 240)",
        },
        dark: {
          background: "oklch(0.2 0 0)",
          primary: "oklch(0.75 0.13 240)",
        },
      },
    }))

    applyThemePreset("wuling")
    expect(document.documentElement.classList.contains("theme-wuling")).toBe(true)

    applyCustomTheme(theme, "light")

    expect(document.documentElement.getAttribute("data-custom-theme")).toBe("enabled")
    expect(document.documentElement.getAttribute("data-theme-visual-source")).toBe("custom")
    expect(document.documentElement.dataset.customThemeName).toBe("Imported")
    expect(document.documentElement.classList.contains("theme-wuling")).toBe(false)
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("oklch(0.99 0 0)")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("oklch(0.55 0.16 240)")
    expect(document.documentElement.style.getPropertyValue("--popover")).toContain("oklch(0.99 0 0)")
    expect(document.documentElement.style.getPropertyValue("--ws-canvas")).toBe("oklch(0.99 0 0)")
    expect(document.documentElement.style.getPropertyValue("--ws-accent-glow")).toContain("oklch(0.55 0.16 240)")
    expect(document.documentElement.style.getPropertyValue("--node-surface-bg")).toBe("oklch(0.99 0 0)")
    expect(document.documentElement.style.getPropertyValue("--node-chrome-accent")).toBe("oklch(0.55 0.16 240)")
    expect(document.documentElement.style.getPropertyValue("--node-chrome-bg")).toContain("oklch(0.55 0.16 240)")

    applyCustomTheme(theme, "dark")

    expect(document.documentElement.style.getPropertyValue("--background")).toBe("oklch(0.2 0 0)")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("oklch(0.75 0.13 240)")
    expect(document.documentElement.style.getPropertyValue("--ws-canvas")).toBe("oklch(0.2 0 0)")
    expect(document.documentElement.style.getPropertyValue("--node-chrome-accent")).toBe("oklch(0.75 0.13 240)")

    applyCustomTheme(null, "light")

    expect(document.documentElement.getAttribute("data-custom-theme")).toBeNull()
    expect(document.documentElement.getAttribute("data-custom-theme-name")).toBeNull()
    expect(document.documentElement.getAttribute("data-theme-visual-source")).toBeNull()
    expect(document.documentElement.classList.contains("theme-wuling")).toBe(true)
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--ws-canvas")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--node-surface-bg")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--node-chrome-accent")).toBe("")
  })

  test("normalizes tweakcn hsl channel colors on import", () => {
    const [theme] = parseImportedThemeJson(JSON.stringify({
      name: "TweakCN",
      cssVars: {
        light: {
          background: "0 0% 100%",
          foreground: "240 10% 3.9%",
          primary: "262.1 83.3% 57.8%",
          border: "240 5.9% 90%",
        },
      },
    }))

    expect(theme.cssVars.light.background).toBe("hsl(0 0% 100%)")
    expect(theme.cssVars.light.foreground).toBe("hsl(240 10% 3.9%)")
    expect(theme.cssVars.light.primary).toBe("hsl(262.1 83.3% 57.8%)")
    expect(theme.cssVars.light.border).toBe("hsl(240 5.9% 90%)")
  })

})
