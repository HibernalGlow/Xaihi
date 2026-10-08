/**
 * 把文档侧那条运行回显在测试里默认接到**一条不响的假流**上——补的是运行时形状，不是某个测试的毛病。
 *
 * 为什么要在这里堵：`document-host` 的 `runner.run` 拿到 `onEvent` 之后会去跟运行账本
 * （`/xaihi/operations/stream`；桥是请求／应答的，过程事件过不了桥，见 `lib/nodeRunProgress.ts`）。
 * 测试宿主里既没有 `EventSource`、也没有那台宿主 HTTP 服务，于是那份兜底会退到轮询
 * `/xaihi/operations.json` —— 而 happy-dom 把相对 URL 解到 `http://localhost:3000`，
 * 于是单元判据变成一次**真网络请求**：实测 `tests/local-runner-e2e.spec.tsx` 的 sleept 那条
 * 会打一发 `ECONNREFUSED ::1:3000`（被接住、不判红，但那是测试不该有的 I/O，
 * 而且它让判据的时长取决于本机有没有东西占着 3000）。
 *
 * 补法**不是**"让文档不跟账本走"（那正是要判的那条接线），而是把**帧的来源**换成一条不响的假流：
 * 回显照建、`transport()` 照报，只是永远收不到帧。要判"帧到了必须发生什么"的判据
 * （`tests/run-progress-wiring.spec.tsx`）先 `resetDocumentRunProgressFeed()` 再装自己的假流，
 * 覆盖这一条即可 —— 那份文件也顺带说明了为什么"真连一条 SSE"量的是网络而不是这条映射。
 *
 * 想验这条不是装饰品：`XAIHI_UI_DOCUMENT_FEED=real` 跑一次
 * `npx vitest run tests/local-runner-e2e.spec.tsx`，输出里该出现那条去 `localhost:3000` 的连接失败。
 */
import { documentRunProgressFeed, resetDocumentRunProgressFeed } from '../lib/nodeRunProgress.ts'

if (process.env.XAIHI_UI_DOCUMENT_FEED !== 'real') {
  resetDocumentRunProgressFeed()
  documentRunProgressFeed({
    createSource: () => ({ addEventListener: () => {}, close: () => {}, onerror: null }),
    // 兜底那一路也堵掉：这份假流永远不会 `onerror`，但万一将来换了实现，也不该去碰真网络。
    fetchImpl: () => Promise.reject(new Error('测试里不该去问那台不存在的宿主')),
    pollMs: 3_600_000,
  })
}
