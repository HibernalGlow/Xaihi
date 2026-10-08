# ADR-0021 · 引擎跑在子进程里，能力按服务名共享（kisaki 先走通那一条）

- 状态：接受
- 日期：2026-10-09
- 相关：`docs/adr/0015-kisaki-engine-is-a-pinned-czkawka-rust-core-in-a-subprocess.md` 决定 2 与决定 5、
  `docs/adr/0004-non-js-core-delivery.md`（同一套故障半径理由与帧协议先例）、
  `docs/adr/0011-desktop-shell-…` 决定 4（退化必须可见）、`docs/adr/0020-…`（服务名跨包共享的先例）、
  阶段报告 `docs/stages/kisaki-engine-subprocess.md`

## 决定

1. **`.node` 只在子进程里装载。** 宿主进程这一侧不再 `require` 那份 addon：入口是
   `plugins/kisaki/src/engine-host.ts`（打包成 `lib/engine-host.js`），由 `ctx.subprocess` 按操作起，
   装载器与内核逻辑一行未改（它 import 的还是 `src/native/index.ts` 那一套）。
   ADR-0015 决定 2 从今天起是**已实现**，不再是"待接"。
2. **帧协议照 findz 那一套，只改必须改的一处。** 一行一个 JSON；问候是第一帧（引擎自述 `apiVersion` /
   `sourceVersion` / `capabilities` + `.node` 的实际位置）；请求带 `id`，应答带同一个 `id`；
   进度是 `{event:"progress", scanId, …}` **不是应答**。
   与 findz 的唯一实质差别就在这里：那份内核同步、FIFO 够用（`plugins/findz/src/gateway.ts:220-256`），
   引擎的扫描是长任务且要推进度，按 FIFO 交会把进度念成"下一条调用的结果"。
3. **取消与进度各走一条明确的缝。** 父侧按 200 ms 看运行是否被要求取消，看到了就发一帧 `cancel`；
   子进程把取消标志交给装载器原有的轮询（`src/native/index.ts:118-139`）。
   取消失败不改写那一趟扫描自己的结果。
4. **能力复用走服务名 `xaihiKisakiEngine`，不走 crate path 依赖、也不走插件间 import。**
   常量与契约住 `packages/node-sdk/src/engine-service.ts`——只有内联进每个包的那一份能被两侧共同引用
   （ADR-0002：装进 profile 的包不许引用 `@hibernalglow/*`；同一条理由见 `NODE_REGISTRY_SERVICE` 那段实测）。
   消费者 `connectKisakiEngine(ctx, use)`：提供方在场才跑回调，**缺席就什么都不发生**，
   由消费者那一格自己说出"没有引擎提供方"。
5. **引擎不可用不回落成宿主进程内装载。** 三种缺席都有名字：`no-subprocess`（这次装配没有那条服务）、
   `entry-missing`（找不到入口，文案与候选表同源）、以及子进程转上来的 `binding-missing` /
   `binding-load-failed` / `abi-mismatch` / `capability-missing`。
   回落等于把 napi 的 async + rayon 风险搬回使用者会话，正是决定 2 判死的那件事。
6. **CLI 与 TUI 走同一条腿。** `plugins/kisaki/src/local-subprocess.ts` 是一份按同一 handle 形状写的
   本地 provider（POSIX 走进程组、Windows 走 `taskkill /T`），因此终端面不需要第二条引擎语义。
7. **已知缺口点名，不掩盖**：`runner.getInfo` 到今天**没有生产者**——
   `createLocalRunner` 只交 `{run, cancel}`（`packages/node-sdk/src/node-registry.ts:207-212`），
   桥那侧对 `runner.getInfo` 一律回 `unavailable`（`packages/node-sdk/src/bridge-shell.ts:267`）。
   于是界面那份 `nativeCapabilities` 恒为空集（`packages/ui-host/src/nodes/kisaki/use-kisaki-workbench.ts:123-130`），
   按能力点亮的工具位永远是暗的。这一条**本批没修**，修法是把 `getInfo` 接到引擎的 `info()`
   （即这一格的服务面）上，而不是把能力表抄进节点清单当第二份真源。

## 为什么不选别的

- **继续在宿主进程里 `require`**：ADR-0015 决定 2 已经按故障半径否过一次，本批只是把它落地。
- **让第二个节点 path 依赖 `plugins/kisaki/native/core`**：注册表与 `check:installable` 都看不见这条边，
  而它会立刻把"节点各自自足"变成 monorepo 里的库依赖关系。真要 crate 级复用（不是消费能力，
  而是直接调 Rust 内部函数）时再单独裁，且必须先有一条看得见这条边的尺。
- **给每个插件各建一份 Cargo workspace**：从 crate 目录读 `cargo metadata` 实读到的是
  `target_dir=<crate>/target`，公共依赖各编一遍（基线那发 `target/` 实测 1.2 GB）。
- **把 `capabilities` 抄进节点清单**：那是第二份真源，症状是清单说有能力而引擎没有。

## 后果

- 每次真扫描多一次进程启动与一次握手；引擎活着期间那一格是**有状态**的（`status()` 是唯一读数）。
- 子进程崩了不影响宿主，但会影响**这一格**：所有在飞调用以 `host_gone` 结束，
  死讯必须带退出码与 stderr 尾巴（判据在 `plugins/kisaki/tests/engine-gateway.spec.ts`）。
- 装机形态仍缺 ADR-0015 决定 3 的平台包：入口在 `lib/`，`.node` 仍从 `native/artifacts/` 找
  （或 `XAIHI_KISAKI_NATIVE_PATH` 显式指）。`native-asset.ts:63` 那条指向姊妹仓的绝对路径回退**仍在**，
  只在 glow 这台机成立。
