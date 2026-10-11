# ADR-0024 · 界面缝只认一种形状的代价：节点适配器收下"另一种名字"，动作面补齐清单

- 状态：接受（2026-10-10 使用者指令）
- 决策人：使用者、HibernalGlow
- 相关：`docs/adr/0006-ui-source-is-xiranite.md`（界面按上游搬）、`docs/adr/0013-config-goes-through-dsh-settings.md`、`docs/adr/0020-local-plugin-runner-decoupled-from-dsh-agent.md`（`/xaihi/runner` 这条缝）、`docs/adr/0023-retire-rawfilter-and-marku-drops-the-flow-workflow.md`

## 背景

2026-10-10 对 27 个节点的界面缝做了一次全量复查（5 路并行只读审计 + 逐条 `/xaihi/runner` A/B 实机对照）。结论只有一条：

**界面那一侧说的名字，与清单那一侧声明的名字，长期不是同一套。** 搬来的卡片界面（`packages/ui-host/src/nodes/<id>/`）
直接组**内核形状**发出去，而清单 `package.json#xaihi.node` 声明的是**展开后的槽名或字段 id**；
`defineNode` 的合成是 `inputs = { ...raw, ...bindInputs(definition, raw) }`，于是：

1. 缝这一层按**字段 id** 取值，界面发的**槽名**取不到 ⇒ 绑出一个空值**覆盖掉**界面真发的那一份（cleanf 的 `pathsText→paths`）；
2. 适配器那一层有的读 `inputs.<槽位>`、有的读 `args.<字段id>`、有的只认平铺槽而界面发**嵌套对象** ⇒ 值在半路丢掉；
3. 界面调的动作名，清单/handler 表里没有 ⇒ 在 `runAction` 查表那一句就被挡掉（kisaki 六个、dissolvef 的 `direct`）。

症状全都长成"界面按下去没用"，而每一侧的单元测试都是绿的——因为**没有一条用例跨过这条缝**（两侧各自拿对方当桩）。

## 决定

1. **缝这一层认两种名字**（`packages/node-sdk/src/define-node.ts` 的 `bindInputs`）：字段 id 优先；字段缺席而已给的**槽位名**存在时**原样采纳**，不再做第二次变换。同名绑定的行为一字未动（模型/工具面不受影响）。新判据 `tests/bind-inputs-slot-shape.spec.ts` 的夹具**故意做成改名绑定**，并先断言它确实是改名的。
2. **各节点适配器收下界面那一份形状，声明的那个名字仍然优先**（逐节点，都是"多认一条腿"而不是换语义）：
   - `classf`：`pathsText` / `crashuSourcesText` / `blacklistKeywordsText` 缺席时回落槽位 `paths` / `crashuSourcePaths` / `blacklistKeywords`；
   - `formatv`：`pathsText` 缺席时回落 `inputs.paths`；
   - `repacku`：收单数 `path`（**判据必须是非空数组**：`bindInputs` 总会写 `inputs.paths`，只判 `Array.isArray` 的话回退是死代码）；
   - `timeu`：`listText` 缺席时回落数组 `paths`；
   - `enginev`：`workshopPath ?? path`、嵌套 `filters` 对象、`ids` 守卫也认 `ids` 键、`wallpapers` 直通；
   - `findz`：`analyze` 也收嵌套 `analysisScope`（并把 `memberIds`/`archiveIds` 带到内核）；
   - `dissolvef`：四条模式形状都收（声明的枚举 `mode` 与内核那四个布尔），四个布尔只要出现一个就以它们为准。
3. **findz 的库 id 由界面给出**：`open_library` 要 `libraryId`（清单声明必填，插件拿它当索引文件名，节点自己的命令面 `/findz open <libraryId> <库根>` 也是这么要的）。卡片原来只发 `library:{root}` ⇒ 永远 `findz: libraryId is required`。现在卡片发 `libraryId` + `libraryRoot`，id 那一格在表头**可见可改**，默认值是根目录名洗出来的建议值——不做静默派生：不同父目录下的同名目录会撞同一个索引文件，那件事必须让使用者看得见。
4. **kisaki 的六个动作补进清单**（`rename` / `clean-exif` / `optimize-video` / `save` / `simiu-apply` / `simiu-undo`）：内核的 `KisakiAction` 九元联合、插件自己的 `tool-options` 构造器、卡片界面三处都说这九个，只有清单写着三个 ⇒ handler 表由清单推导，六个动作在到达内核之前被挡掉。**同时给这六个写盘动作挂 `danger`（`actionIn`）**：仓库口径是危险动作走 `ask`，而这份清单原来连 `delete`/`move` 都没有闸——新增能力不该再扩大"无闸写盘"的面；原有三条保持原样（那是另一件要单独拍的事）。
5. **dissolvef 的 `dissolve` 处理器把调用方的 `preview` 传下去**：原来根本不往下传 ⇒ 卡片上带着"预演"按下去照样真移动文件（内核 `core.ts:182` 本来就是 `action === "plan" || preview` 只回计划）；没有 `historyPath` 时只在**真要写盘**那一档拒绝，预演不碰文件就没有理由拒它。界面也不再发 `action:"direct"`（`direct` 是**模式**不是动作）。

## 后果

- 逐条实机读过（宿主 3199，全是只读探针；A/B 用"同一份数据换一个键名"当对照）：cleanf、classf、formatv、repacku、timeu、enginev（`path`/`wallpapers`/嵌套 `filters`，filters 用 0/1 对 1/1 的正控）、findz（`open_library` 走到索引打开、旧形状仍拒；`analyze` 的两条形状有单测 + 减法对照）、dissolvef（四个布尔与 `mode` 同值 4 ops、nested 0 ops、`dissolve`+preview 只回计划且**目录一个文件没动**）、kisaki（`save`/`simiu-undo` 回的是内核自己的话，不再是 `no handler`）。
- 门禁：`check:noderegistry`、`check:cliregistry`、`check:installable`、`check:nodebundle`（26 个节点包）、`check:cliface`、`check:tuiface`、`check:vocab`、`check:skills`、`check:pins` 全 rc=0。宿主运行时清单现读：26 个插件、无 `rawfilter`、`kisaki` 动作 9 且带 `danger`。
- 两类调用者并存这件事**只在这一层被容忍**：清单仍然是唯一真源，适配器收的另一条腿一律写成"回落"，并注明为什么（分隔符语义、内核别名链、界面形状）。

## 追加的四条（同一天，使用者"全部修复"）

6. **kisaki 的 `tool` 不再是动作选择器**：那份清单把 `tool`（11 个 czkawka 工具）标成 `isActionSelector: true`，于是 `parametersFor` 跳过它、还**注入** `args.tool = actionId` ⇒ 模型面拿到的三个工具其实带着一个假工具名。摘掉那个标记后实测 `parametersFor('scan')` 只剩 `tool` 一格、带**真的工具枚举**、动作 9 条。
7. **bandia 的 `useTrash` 生效**（**同一天该节点已退役，本条随之作废，留作历史**，见 ADR-0025）：清单没有这条字段（上游自带的分歧），而搬来的卡片有"回收站"开关并且一直在发它 ⇒ 使用者关掉它，删源仍然进回收站，界面上看不出来。适配器现在认界面那一份原始键；**清单保持上游逐字**（模型面仍看不到它，与上游一致）。这条**只做到 code-verified**：本机没有 Bandizip（那是个 Windows 工具），真删源才能验，而删源是写盘动作。
8. **dissolvef 的 `historyPath` 不再是死输入**：四个 handler 原来只读 `config.historyPath`，界面那一格填了没有任何效果。现在**运行入参优先、`Config` 兜底**（与其它节点同一条优先级）；清单里没有这条字段，所以模型面看不到它——那一刀只修界面这条路。
9. **`stop`（bandia）不动，但把理由摆出来**（**同一天该节点已退役，这条两难一起消失**，见 ADR-0025）：内核 `BandiaAction` 有 `stop`、清单没有，这是**上游自带的分歧**，本仓有两处测试 + 一处代码注释把它当决定钉着（`tests/definition.spec.ts:253`、`tests/core.spec.ts:305`、`src/index.ts:298`）。界面那个"停止"按钮因此永远回 `no handler for action "stop"`——**这是可见的拒绝、不是静默**。三条出路（删按钮 / 留按钮但把拒绝文案改成本地原因 / 把 `stop` 补进清单并改写那两条钉住分歧的测试）都要动上游保真的口径，**留给使用者拍**；本条只记录事实。

## 尾注：修的是夹具，不是被测代码

`registerWithHost` 用 cordis 正典形状（`ctx.inject` 等依赖到位）之后，一批**旧夹具**没跟上：17 个插件的 `tests/definition.spec.ts` 手搓的假 ctx 缺 `inject`，两个 ui-host 的 spec 用真 `Context` 却没把 `xaihiNodeRegistry` provide 进去。修法是补夹具（假 ctx 的回调交回 `{ get: () => undefined }`，那两个 spec 把服务 provide 进去），**一条断言都没改**。`node-sdk` 的 typecheck 红则修在被测代码的调用方：`preview` 的载荷形状由节点决定（`unknown` 是对的），假设形状的是 `define-node.ts`，所以先收窄再取 `message`。

