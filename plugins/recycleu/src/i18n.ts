import { createI18nTranslator, type TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"

export const recycleuLocaleResources = {
  en: {
    name: "RecycleU", description: "Empty the Windows recycle bin now or on a controlled schedule.", action: "Workflow",
    actionStatus: "Environment status", actionClean: "Empty once", actionStart: "Schedule auto-clean", drive: "Drive letter",
    driveHint: "Optional. Leave empty to clean every recycle bin.", interval: "Interval (seconds)", maxCycles: "Maximum cycles",
    cycleHint: "Use 0 to keep running until cancelled.", sourceSection: "Cleanup controls", scheduleSection: "Schedule",
    dashboard: "Recycle monitor", dashboardHint: "Countdown, cleanup count, and the selected target.", statusReady: "Ready to inspect or clean.",
    intervalMinimum: "Enter an interval of at least 5 seconds.", cyclesMinimum: "Enter a whole number of zero or more.",
    previewAction: "Action: {{value}}", previewDrive: "Drive: {{value}}", previewInterval: "Every {{interval}} seconds for {{cycles}} cycle(s)",
    allDrives: "all drives", unlimited: "unlimited", dangerTitle: "Empty the recycle bin?",
    dangerBody: "This permanently empties the selected recycle bin. Windows cannot restore those files afterwards.", dangerConfirm: "Confirm cleanup",
    resultStatus: "Status: {{value}}", resultCleaned: "Clean operations: {{value}}", resultRemaining: "Next run in: {{value}}s", resultLastClean: "Last clean: {{value}}",
  },
  zh: {
    name: "RecycleU", description: "立即清空 Windows 回收站，或按受控周期自动清理。", action: "工作流",
    actionStatus: "检查状态", actionClean: "立即清空一次", actionStart: "启动自动清理", drive: "目标盘符",
    driveHint: "可选；留空表示清理全部回收站。", interval: "清理间隔（秒）", maxCycles: "最大循环次数",
    cycleHint: "设为 0 表示持续运行，直到手动取消。", sourceSection: "清理控制", scheduleSection: "周期设置",
    dashboard: "回收站监控", dashboardHint: "显示倒计时、清理次数与当前目标。", statusReady: "已就绪，可以检查或清理。",
    intervalMinimum: "清理间隔至少为 5 秒。", cyclesMinimum: "请输入大于等于 0 的整数。",
    previewAction: "操作：{{value}}", previewDrive: "目标：{{value}}", previewInterval: "每 {{interval}} 秒执行一次，共 {{cycles}} 次",
    allDrives: "全部盘符", unlimited: "无限", dangerTitle: "确认清空回收站？",
    dangerBody: "这会永久清空选定回收站，之后无法再从 Windows 恢复其中的文件。", dangerConfirm: "确认清理",
    resultStatus: "状态：{{value}}", resultCleaned: "已清理：{{value}} 次", resultRemaining: "下次运行：{{value}} 秒后", resultLastClean: "上次清理：{{value}}",
  },
} as const

export type RecycleuMessageKey = keyof typeof recycleuLocaleResources.en
export function createRecycleuTranslator(language: TerminalLanguage) {
  return createI18nTranslator<RecycleuMessageKey>(language, "recycleu", recycleuLocaleResources)
}
