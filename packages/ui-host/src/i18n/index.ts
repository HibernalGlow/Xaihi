/**
 * i18n 初始化与语言切换。
 *
 * 基于 i18next + react-i18next，按 namespace（common/topbar/settings/...）
 * 拆分资源，懒加载对应语言的 locale JSON。
 *
 * 资源加载策略：
 *  - 默认语言资源在 init 阶段同步加载；
 *  - 非默认语言在 init 完成后异步预加载 en 作为 fallback；
 *  - `module` namespace 会与 node 包（如 sleept）自带的 locale 资源合并。
 */
import i18n, { type ResourceLanguage } from "i18next"
import { initReactI18next } from "react-i18next"

export type Language = "en" | "zh"

export const LANGUAGES: { key: Language; label: string; nativeLabel: string }[] = [
  { key: "en", label: "English", nativeLabel: "English" },
  { key: "zh", label: "Chinese (Simplified)", nativeLabel: "中文（简体）" },
]

const STORAGE_KEY = "i18n.lang"
/** 命名空间列表：每个对应 locale JSON 中的一个顶层 key。 */
const NS_KEYS = ["common", "topbar", "settings", "registry", "overlay", "view", "module"] as const

const localeLoaders: Record<Language, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("./locales/en.json"),
  zh: () => import("./locales/zh.json"),
}

/** i18n 初始化 Promise（防止重复初始化）。 */
let initPromise: Promise<typeof i18n> | null = null

/**
 * 探测初始语言。
 *
 * 优先级：localStorage > navigator.language > "en"。
 * SSR 环境直接返回 "en"。
 */
function detectInitialLanguage(): Language {
  if (typeof window === "undefined") return "en"

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "en" || stored === "zh") return stored

  const nav = window.navigator.language?.toLowerCase() ?? ""
  return nav.startsWith("zh") ? "zh" : "en"
}

/**
 * 加载指定语言的资源包。
 *
 * 已加载则跳过；否则按 NS_KEYS 顺序逐个 addResourceBundle。
 * 宿主在这里不 import 任何节点包：节点文案由该节点自己的 chunk 贡献。
 * 曾经的 `mergePackageNodeLocales` 会把 `@xiranite/node-sleept/i18n` 注入 `module:nodes.sleept`，
 * 而节点 UI 读的是扁平的 `module:sleept.*`（`useNodeI18n` 的 `${nodeId}.${key}` 形状），
 * 全仓没有读者，却让 28/30 个节点入口闭包各拖进一个外来节点包——ADR-0069 §Standalone 的串节点债。
 */
async function loadLanguageResource(lang: Language): Promise<void> {
  if (i18n.hasResourceBundle(lang, "common")) return

  const locale = (await localeLoaders[lang]()).default
  for (const ns of NS_KEYS) {
    i18n.addResourceBundle(lang, ns, locale[ns] as ResourceLanguage, true, true)
  }
}


/**
 * 初始化 i18n（幂等）。
 *
 * - 注册 react-i18next；
 * - 设置默认语言、fallback、namespace；
 * - 加载初始语言资源；
 * - 监听 languageChanged 事件，持久化语言到 localStorage 并同步 <html lang>；
 * - 非英文初始语言会异步预加载英文资源作为 fallback。
 */
export function initI18n(initialLanguage = detectInitialLanguage()): Promise<typeof i18n> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    i18n.use(initReactI18next)

    await i18n.init({
      lng: initialLanguage,
      fallbackLng: "en",
      defaultNS: "common",
      ns: NS_KEYS as unknown as string[],
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
    })

    await loadLanguageResource(initialLanguage)
    if (i18n.language !== initialLanguage) await i18n.changeLanguage(initialLanguage)

    i18n.on("languageChanged", (lng) => {
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, lng)
      if (typeof document !== "undefined") document.documentElement.lang = lng
    })
    if (typeof document !== "undefined") document.documentElement.lang = i18n.language

    if (initialLanguage !== "en") void loadLanguageResource("en")

    return i18n
  })()

  return initPromise
}

/** 切换语言：确保 i18n 已初始化，加载目标语言资源，再调用 changeLanguage。 */
export async function changeLanguage(lang: Language) {
  await initI18n()
  await loadLanguageResource(lang)
  return i18n.changeLanguage(lang)
}

/** 获取当前语言（仅区分 zh 与 en，其他一律视为 en）。 */
export function getCurrentLanguage(): Language {
  const cur = i18n.language
  return cur?.startsWith("zh") ? "zh" : "en"
}

export default i18n
