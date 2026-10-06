/**
 * 测试环境的 i18n 起手：逐字取自 `noxide` 基线的 `src/test/setup-i18n.ts`，
 * 上游把它挂在 `vite.config.ts:356` 的 `test.setupFiles` 上。
 *
 * 为什么必须有它：搬来的节点测试里有一大批断言读的是**中文文案**与 role 名称，
 * 而 `initI18n()` 没跑过的时候 i18next 还没注册资源，症状是"文本对不上 / 找不到 role"，
 * 离原因很远。`docs/port/ui-tests-283-triage.md` 量的 283 条里有 92 条落在这件事上。
 * 本仓之前没带这份文件 ⇒ 那一层的失败一直被判成"搬运坏了"，其实是缺这一行起手。
 *
 * @module xaihi-ui-test-setup
 */
import i18n, { initI18n } from "@/i18n"

await initI18n("zh")
await i18n.changeLanguage("zh")
