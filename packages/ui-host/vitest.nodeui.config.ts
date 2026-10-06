import base from './vitest.config'

/**
 * 节点界面那一族测试的配置文件：`src/nodes/**` 全部上游测试。
 *
 * 为什么不并进 `vitest.config.ts`：那份是**门禁**（`test:unit` 里必须绿的那 38 个文件），
 * 而节点测试这一族现在仍有一批跑不起来——其中一部分是**上游自己就红**的
 * （`docs/port/ui-tests-283-triage.md` 里 `upstream-red` 那一档，实跑上游同一条命令复核过）。
 * 把它们塞进门禁会让 `test:unit` 长期红，而那条红会把别的 lane 的回归一起淹掉。
 * 所以这一族单独有一条命令，红多少是看得见的数，逐档往下压：
 *
 *   pnpm --filter @hibernalglow/xaihi-ui-host exec vitest run -c vitest.nodeui.config.ts
 *
 * 减法跑（证 `setupFiles` 那条 i18n 起手真的在起作用，不是装饰品）：
 *
 *   XAIHI_UI_WITHOUT_SETUP=1 pnpm --filter @hibernalglow/xaihi-ui-host exec vitest run -c vitest.nodeui.config.ts
 *
 * `resolve.alias` / `environment` / webstorage 那条起手都沿用基础配置那份 ⇒
 * 两处用的是同一套规则，不在这里养第二套（任务 #25 的口径）。
 * `setupFiles` 是**整值覆盖**不是深合并（DSH 的 config 分层同一条规矩），
 * 所以下面必须把基础配置那份 webstorage 起手一起写上，只加 i18n 那一条。
 */
const WITH_SETUP = process.env.XAIHI_UI_WITHOUT_SETUP !== '1'

export default {
  ...base,
  test: {
    ...base.test,
    include: ['src/nodes/**/*.test.ts', 'src/nodes/**/*.test.tsx'],
    setupFiles: WITH_SETUP
      ? ['src/test/setup-webstorage.ts', 'src/test/setup-i18n.ts']
      : ['src/test/setup-webstorage.ts'],
  },
}
