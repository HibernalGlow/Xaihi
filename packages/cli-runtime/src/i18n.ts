import { createInstance, type i18n } from "i18next"

export type TerminalLanguage = "en" | "zh"

export const terminalMessages = {
  en: {
    yes: "Yes",
    no: "No",
    cancel: "Cancel",
    confirm: "Confirm",
    reset: "Reset",
    back: "Back",
    quit: "Quit",
    run: "Run",
    ready: "Ready",
    starting: "Starting...",
    step: "Step {{current}}/{{total}}",
    preview: "Preview",
    running: "Running",
    rendererHelp: "{{renderer}} · Esc back · q quit",
    safeNotice: "Dry-run/safe action is enabled.",
    hazardNotice: "HAZARD: dry-run is off. The power action is real.",
    executeHint: "Start with the values above",
    editHint: "Edit the form",
    runReal: "Run real power action",
    runRealHint: "This may suspend, shut down, or restart the computer",
    runAgain: "Run another task",
    exit: "Exit",
    noFields: "This interaction has no visible fields.",
    cancelHint: "Esc requests cancellation when the workflow supports it.",
    parameters: "Parameters",
    liveStatus: "Live status",
    execution: "Execution",
    statusTab: "Status",
    logsTab: "Logs",
    emptyLogs: "Run logs will appear here.",
    mouseHelp: "Mouse first · Tab keyboard fallback · q quit",
    dryRunAction: "Start dry run",
    liveAction: "Execute now",
    stopAction: "Stop",
    resetParameters: "Reset parameters",
    confirmLiveTitle: "Confirm live execution",
    confirmLiveBody: "Dry-run is off. This power action will affect the computer.",
    confirmLiveAction: "Confirm execution",
    dismiss: "Go back",
    progress: "Progress",
    waitingForRun: "Waiting to run",
  },
  zh: {
    // cancel/confirm/reset preserve src/i18n/locales/zh.json values.
    yes: "是",
    no: "否",
    cancel: "取消",
    confirm: "确认",
    reset: "重置",
    back: "返回",
    quit: "退出",
    run: "运行",
    ready: "就绪",
    starting: "启动中...",
    step: "步骤 {{current}}/{{total}}",
    preview: "执行预览",
    running: "运行中",
    rendererHelp: "{{renderer}} · Esc 返回 · q 退出",
    safeNotice: "预演或安全操作已启用。",
    hazardNotice: "危险：预演已关闭，将真实执行电源操作。",
    executeHint: "按以上参数开始执行",
    editHint: "返回修改参数",
    runReal: "真实执行电源操作",
    runRealHint: "可能使电脑睡眠、关机或重启",
    runAgain: "继续执行其他任务",
    exit: "退出",
    noFields: "当前交互没有可显示的字段。",
    cancelHint: "工作流支持取消时，Esc 会请求停止。",
    parameters: "参数设置",
    liveStatus: "运行状态",
    execution: "执行控制",
    statusTab: "状态",
    logsTab: "日志",
    emptyLogs: "运行日志会显示在这里。",
    mouseHelp: "优先使用鼠标 · Tab 键盘导航 · q 退出",
    dryRunAction: "开始演练",
    liveAction: "开始执行",
    stopAction: "停止",
    resetParameters: "重置参数",
    confirmLiveTitle: "确认真实执行",
    confirmLiveBody: "演练模式已关闭，电源操作会真实影响当前电脑。",
    confirmLiveAction: "确认执行",
    dismiss: "返回检查",
    progress: "进度",
    waitingForRun: "等待运行",
  },
} as const

export type TerminalMessageKey = keyof typeof terminalMessages.en
export type I18nInterpolationValues = Record<string, string | number | boolean>
export type CliI18nNamespaceResources = Record<string, Record<string, string>>
export type CliI18nResources = Partial<Record<TerminalLanguage, CliI18nNamespaceResources>>

export function createCliI18n(language: TerminalLanguage, resources: CliI18nResources = {}): i18n {
  const instance = createInstance()
  const mergedResources = {
    en: { terminal: terminalMessages.en, ...resources.en },
    zh: { terminal: terminalMessages.zh, ...resources.zh },
  }
  void instance.init({
    lng: language,
    fallbackLng: "en",
    defaultNS: "terminal",
    resources: mergedResources,
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return instance
}

export function createI18nTranslator<Key extends string>(
  language: TerminalLanguage,
  namespace: string,
  resources: Record<TerminalLanguage, Record<Key, string>>,
) {
  const instance = createCliI18n(language, {
    en: { [namespace]: resources.en },
    zh: { [namespace]: resources.zh },
  })
  const fixed = instance.getFixedT(language, namespace)
  return (key: Key, values: I18nInterpolationValues = {}): string => fixed(key, values)
}

export function createTerminalTranslator(language: TerminalLanguage) {
  return createI18nTranslator(language, "terminal", terminalMessages)
}

export type TerminalTranslator = ReturnType<typeof createTerminalTranslator>

export function resolveTerminalLanguage(
  value?: string,
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): TerminalLanguage {
  const candidate = value || env.LC_ALL || env.LC_MESSAGES || env.LANG || "zh"
  return candidate.toLowerCase().startsWith("zh") ? "zh" : "en"
}
