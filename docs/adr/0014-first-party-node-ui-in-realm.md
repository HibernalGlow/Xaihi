# ADR-0014 一方节点界面走"现 realm 注册表"渲染，MF2 remote 只留给第三方

- 状态：接受（实现由 `webui-node-mount` 这一刀在落，见 §后果 的"未闭合"）
- 日期：2026-10-07
- 相关：`docs/adr/0006-ui-source-is-xiranite.md`、`docs/adr/0007-component-placement.md` 决定 4、
  `docs/adr/0008-shared-ui-package-and-l4-boundary.md`、`docs/adr/0009-plugin-ui-react-ownership.md`、
  `docs/adr/0002-self-contained-plugin-packages.md`、`docs/stages/step-4-ui-port.md` §10

## 背景

批次 E/F 把 Xiranite 的节点界面逐个搬进 `packages/ui-host/src/nodes/<id>/`，并由
`scripts/gen-node-registry.mjs` 生成 `packageModules.generated.ts`
（`PACKAGE_MODULES` / `NODE_MANIFESTS` / `packageModuleLoaders` / `nodeHelpLoaders`，现有 12 条）。
2026-10-07 实测两件事：

1. `rg 'PACKAGE_MODULES|packageModuleLoaders|NODE_MANIFESTS' packages/ui-host/src/client` ⇒ **零消费者**；
2. 构建产物 `packages/ui-host/lib/client.js` 里找不到任何一份节点界面的字符串
   （取 `src/nodes/sleept/Component.tsx` 的中文串 `上次任务失败` 做字面命中 ⇒ 0），
   `nodes/<id>/entry` 这类动态装载串也 ⇒ 0。

而外壳 `src/client/workspace.tsx` 的 `PanelFallback` 走的是**另一条路**：
从 Core 的 `/xaihi/manifest.json` 取面板清单，经 `UIModuleLoader.load({remote, exportName})`
（`src/client/loader/remote-modules.ts`）装载各插件自带的 MF2 remote。
⇒ 树里同时存在两条"节点界面怎么上屏"的路线，而**一方节点的界面两条都不接**：
搬进来了、类型过了、注册了，屏上没有。

## 决定

**一方（本仓 `plugins/*`）节点的界面走"现 realm 注册表"渲染；MF2 remote 那条路保持原样，
只服务第三方贡献的面板。** 具体三条：

1. 注册表是 `PACKAGE_MODULES` 那一份生成物，外壳把它并进入口清单；选中一方条目时经
   `packageModuleLoaders[id]()` 装载并渲染（异步边界由我们自己扛，见下条）。
2. 装载面**不许用 Suspense**：DSH 的 `renderSlot` 是唯一渲染形式且没有按条目懒加载
   （`packages/client/web-react/README.md:19`，ADR-0001/0009 已引过），所以加载态、
   每条独立的错误边界、以及"过期在飞的装载不许盖住新选择"这三件事必须在 Xaihi 自己这一层做出来。
3. 界面调动作只走 `/operations` 那条语义（上游 `host.runner.run ?? host.actions.run`），
   在本仓映射到 `runCommand`；**兑现不了的调用一律点名拒绝**（缺哪条缝写在哪），
   不许静默 no-op、不许假成功——同 `docs/adr/0011`（可见退化）与 `docs/service-mapping.md` §缺口台账的口径。

## 为什么不是"每个插件自己把界面打成 MF2 remote"

搬运粒度决定的，不是口味：一份搬进来的 `Component.tsx` 依赖

- `@/components/ui/*`、`@/nodes/shared/api`、Tailwind 工具类（这批东西在 `packages/ui-host`，
  是被搬运的 657 份文件的一部分，判据见 `docs/port/xiranite-ui.json`）；
- `@xiranite/node-<id>/core` 这类边，由 `packages/ui-host/build-aliases.mjs` 从 `plugins/*/src/`
  现读自动解析（表里 24 条），解析层在**工作台这一侧**。

要在插件包里渲染同一份界面，就得把整棵搬运树在每个插件里内联一遍（12 份 ×657 文件），
并且插件包会因此依赖仓内包——正是 ADR-0002 禁止的形状（profile 解析不了 `workspace:*`）。
MF2 `shared`（ADR-0008 定的路 C）能共享 React 与 UI 原语，但共享不了"`@/` 这套别名解析"，
那是构建期的事，不是运行期能补的。

## 后果

- 外壳多一类入口来源；`contribution.id` 在两路之间**撞名要可见并测出来**，不许后写覆盖前写。
- `packageModules.generated.ts` 从"只有测试读"变成运行时真依赖；它的
  `--check`（`scripts/gen-node-registry.mjs --check`）因此成为上屏判据的一部分。
- 产物体积会涨：一方界面第一次真的进 `lib/client.js`。判据不是"构建 rc=0"，
  而是**字面命中**（上面那条 `上次任务失败` 的 grep 必须从 0 变成非 0），
  这条已被写进 `webui-node-mount` 那一刀的验收里。
- **未闭合（这一版没做的）**：
  1. 顶栏那一条真正该换成上游 `WorkspaceLayout`，现在仍是 `ShellFallback`；
     拦路是 `components/views/settings/RuntimeSection.tsx:21` 那条
     `./NodeMemoryProtectionSettings` 的悬空 import 与它背后的后端控制层（ADR-0013 判定不搬）。
     谁接 settings 子树、或把它从 TopBar 的导入图里切掉，是并发 lane 的那一刀。
  2. 节点动作到 `runCommand` 的映射需要 Core 那侧有一个稳定的命令名；今天能兑现多少
     由 `docs/service-mapping.md` 的 G1/G2/G6 决定，兑现不了的部分必须继续点名拒绝。
  3. 一方条目与 `contributes.panels` 的清单**归谁**还没定：现在两处都能声明同一个节点的面板。
     定不下来就先以"注册表赢、remote 缺席不算错"实现，并把这条留在本文档里。
