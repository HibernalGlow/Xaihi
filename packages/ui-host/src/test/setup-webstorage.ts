/**
 * 把 `localStorage` 装回测试宿主——补的是**运行时**那个洞，不是某个测试的毛病。
 *
 * 为什么必须在这里装：Node 26 自带一个实验性 `localStorage` 全局，没给
 * `--localstorage-file` 时它是"一读就告警、值永远 undefined"的访问器；happy-dom 20.14.5
 * 自己那份 `Storage`（`node_modules/happy-dom/lib/storage/Storage.d.ts` 里 `class Storage`）
 * 因此装不上去。实测同一份 `tests/localstorage-env.spec.ts`：
 * 默认 3 条全红（`window.localStorage` 是 undefined），
 * 进程带 `--no-experimental-webstorage` 时 3 条全绿。
 *
 * 为什么不能把那个 flag 写进 `vitest.config.ts`：试过 `poolOptions.threads.execArgv`，
 * 那 3 条照红——Worker 的 `execArgv` 只收受限的一小撮选项，进程级 V8/Node 开关不在里面
 * （`node --no-experimental-webstorage -e …` 只在进程启动时生效）。环境变量
 * `NODE_OPTIONS` 能生效，但要所有人记住；写进包脚本得改 `packages/ui-host/package.json`。
 * 所以这里用**同一个实现**补：装的就是 happy-dom 的 `Storage`，不是自造的影子对象。
 *
 * 想验这条不是装饰品：`XAIHI_UI_STORAGE_SHIM=0` 跑一次，那 3 条必须红。
 */
import { Storage } from 'happy-dom'

if (process.env.XAIHI_UI_STORAGE_SHIM !== '0') {
  const storage = new Storage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
    enumerable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new Storage(),
    writable: true,
    configurable: true,
    enumerable: true,
  })
}
