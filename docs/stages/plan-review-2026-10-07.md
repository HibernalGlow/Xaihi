# 计划复核 · 2026-10-07：批准那份计划今天有多少仍然成立

状态：审计（不改计划文件本身；取舍由使用者拍，本文件只摆读数）。
被复核的对象是批准的计划 `winter-peak-deer`（Steps 0–4、决策 D1–D14、验证方案 1–6）。
每条后面的读数都是现跑的（rc + 出处），不是回忆。

## 一、仍然成立、且已被执行的部分

| 计划里的条目 | 现测 |
|---|---|
| 硬原则：不 fork DSH / 不复制 runtime / 不自建壳与更新器与市场 | 成立，并已细化成 `AGENTS.md` 的"不碰 DSH 的三样东西"一节 |
| Step 0 骨架（workspace + 钉版 + CI 断言 `@deepseek-ai/*` == `0.2.0-rc.2`） | `check:pins` 在根 `test` 第一位，rc=0；`pnpm-workspace.yaml` 的负向条目带着"解开条件"的注释 |
| Step 2 的 Gate 2.0–2.5 | 已过（`docs/stages/step-2.md`、`step-3.md`），单 React 那条带阳性对照 |
| Step 3 SDK + 脚手架 | 已过；脚手架生成物自带两条起步测试（定义合法性 + 当前内核行为） |
| Step 4.1 对照表先行 + "任何要搬的服务先证明 DSH 没有" | `docs/service-mapping.md` 在场，G1–G13 那批缺口今天下午刚复验过（同一份文件的 §G1–G13 复验） |
| Step 4.2 只搬 operation stream + checkpoint | 已落（`step-4.md` 的"运行契约补 checkpoint 事件"与 storage domain 那一刀） |
| 验证方案第 6 条（通路证明 + 关掉一行不破外壳） | 终端面那半今天第一次由执行证明：`check:cliface` 26 个 bin 逐个 `--help` 全 rc=0 |

## 二、计划与今天的树**不一致**的六处（前四处是计划过时，后两处是仍欠的账）

1. **节点批次范围**：计划写"批次 A `linedup` → B `sleept` → C `dissolvef` → D `findz`"。
   现读台账差集：28 个 `retain-rewrite` 里本仓已成包 **27 个**，只缺 `kisaki`
   （`python3` 读 `<Xiranite>/docs/xiranite-target-node-manifest.json` vs `ls plugins/`，
   读数原样贴在 `docs/stages/step-4.md` 的"28 个 retain-rewrite 节点"那节）。
   也就是计划里的四个批次实际推到了 A–H。
2. **`docs/dsh-api-notes.md` 这个交付物不存在**，但**知识没缺**：Step 1 的 API 结论落在
   `docs/stages/step-1.md`（四段式）＋ `docs/service-mapping.md` ＋ ADR-0001/0005/0009 里。
   计划里那句"把 Step 1 结论入库成一份单独文件"没被执行，改成了按 kinds 分散——
   这一条要不要补一份索引文件，是使用者的一句话，不是我能替他定的。
3. **"明确不做：独立桌面壳"与 ADR-0011 冲突**：现在本仓真有 `desktop/` 这一层
   （`ls desktop/` ⇒ `README.md  UPSTREAM_PIN  dsh  patches  sync-dsh.mjs`，`dsh` 是上游 submodule）。
   计划的"不做"针对的是"重造一个壳"，ADR-0011 做的是"给官方壳打补丁 + 原生多窗"，
   两者不是同一件事，但**字面上打架**。要么改计划那一条的措辞，要么改 ADR-0011——
   ADR-0011 的 `:111` 已经自己交代了"标题里的 sibling vendor repo"与实际落点的差异。
4. **D6/D12 把 Material You 当"第一套风格"，这一条已被否决**：`AGENTS.md` 现在写的是
   六套设计语言（`native|md3|mondrian|wuling|swiss|lonestar`）里 **`md3` 只是其中一套，不是默认值**，
   把一个候选提成默认等于替使用者做选择。使用者后来也明确纠正过方向是"搬已写好的那套"。
   所以 D6/D12 的措辞属于**已被后续决定覆盖**，实现侧现在是设计语言驱动，不是 MD3 单线。
5. **D1 的"MF2-over-Core-route 为主"只对了一半**：第三方界面仍走 MF2；
   第一方节点界面改由 `ADR-0014` 在 Xaihi 自己的文档 realm 里同 realm 渲染
   （`src/nodes/*/entry.ts` 12 份 + 生成物 `components/modules/packageModules.generated.ts`，
   `node scripts/gen-node-registry.mjs --check` rc=0，12 目录 → 12 条注册）。
   这条是计划没预见的分叉：**载体换成了我们自己的文档产物**，不是 `lib/client.js`。
6. **验证方案第 2、3、5、6 条里"实机"那几项仍然欠着**：
   `dist-ui/` 今天来回归过又没了（并发 lane 在写 `src/document/*` 与 `rspack.document.mjs`），
   `pnpm run build:document` 现读 rc=1、3 条错全在 `src/components/views/settings/RuntimeSection.tsx`
   （那条悬空 import 归并发 lane 收），所以**"节点界面上屏"这句仍然不成立**，
   判据本身已经写好了（`scripts/check-node-face.mjs`，`--self-check` rc=0，跑 3 个夹具节点 + 空产物那条）。
   真宿主跑（`pnpm host` / `plugin:install`）今天一次都没跑 ⇒ 所有"ctx.subprocess 真兑现 /
   `ask` 批准缝"级别的断言都还是 test-double 或 compile-verified。

## 三、计划里现在**该划掉**的一条

计划的批次 D 写"findz 这才是带 Go 内核的那个，前置任务：先出 ADR『非 JS core 的交付决策』"。
那份 ADR 已经有了（`docs/adr/0004-non-js-core-delivery.md`），而 `findz` 的 Go 源码今天已经在仓里
（`native/findz-go/`，含 `analysis.go` / `database.go` / `host.go` / `ffi.go` / `protocol.go` 等，
是并发 lane 在飞的未提交区）。所以这条前置已闭合；**没闭合的是它 `bin` 还是缺**：
`gen-cli-registry` 现读 26 条里不含 `findz`（它的 `package.json` 没有 `bin`）⇒
findz 有产物、有界面入口、没有终端面。这条归那一侧，我只把读数记下来不去替他改。

## 四、结论一句话

计划的骨架（不 fork、先对照表、逐字搬、门禁带阳性对照、按阶段出四段式）今天全部还在被执行；
过时的部分是**批次范围、MD3 地位、UI 载体、桌面壳措辞、一份没建的索引文件**这五处；
真欠的账是**实机那一整档**与 `kisaki` 这最后一个节点。
