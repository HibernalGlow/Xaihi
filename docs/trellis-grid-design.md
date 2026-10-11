# Trellis：卡片视图的第五种子布局

状态：用户已确认推荐方案，实施中；运行证据见后续阶段报告。
日期：2026-10-11。

## 用户已经明确的目标

把 DanFessler/trellis 接到第一个卡片视图的子布局里，成为第五种。保留它的分形布局特点与 Focus、Free Zoom 两种导航模式，参考官网 examples，认真打磨真实工作台使用体验。

来源：
- https://github.com/DanFessler/trellis
- https://trellisui.com/#examples

这次是用户明确要求的新增集成。既有四种布局继续沿用从 Xiranite 移植的实现，节点内容与共享 UI 继续遵守 ADR-0006；Trellis 负责新增的递归布局与导航，不重写节点面。

## 上游已核对的接口与许可

本轮直接读取 GitHub 原始 README、包声明、概念文档与 API 文档，并访问官网。核对时 main 的

| 已读到的能力 | 上游证据（以下路径均属于该 commit） | 集成选择 |
| --- | --- | --- |
| core 与 React 包都声明 0.3.0；React peer 为 >=18.3 | `packages/core/package.json`、`packages/react/package.json` | 当前 ui-host 为 React 18.3；安装前另核实 npm 产物，精确锁定 core/adapter 同档版本 |
| `navigation` 接受 false / focus / free，默认 focus；可运行时切换 | `docs/react-api.md:55`、`:79` | 使用原库两模式，不另造相机引擎 |
| View 是稳定实例，Panel 是标签组，Split 是带比例的递归横/纵分割 | `docs/concepts.md:29`、`:39`、`:45` | 每个实际 componentId 对应一个 View；采用原生 Panel/Split，不预设自定义文件夹模型 |
| 同轴嵌套 Split 会被归一化，单子节点 Split 会塌缩 | `docs/concepts.md:51` | 不能把 Split id 当永久命名文件夹或业务身份；保存视角用官方 framing 的面板引用 |
| 移动、换标签、悬浮、隐藏和缩放时内容保持挂载 | `docs/concepts.md:37` | 复用稳定 View 承载 ModuleRenderer，并对真实节点编辑状态做浏览器验证 |
| 有悬浮/停靠/隐藏/恢复；悬浮可禁用，overlay 与 stage 有不同相机语义 | `docs/concepts.md:80`；`docs/core-api.md:143` | 画布内悬浮和 Xaihi 的原生独立窗口明确区分，不能相互冒充 |
| 层级导航、前进/后退、总览、精确回程、保存视角 | `docs/core-api.md:154-164` | 优先使用 navigation.frame/toggle/back/forward/overview/stepOut/stepIn/framings |
| 受控布局 `document / onDocumentChange`；`getDocument()` 包括导航状态 | `docs/react-api.md:70-71`；`docs/core-api.md:170` | 不传 storageKey；提交后的布局变化经 DSH 持久化，不逐动画帧写入 |
| Free Zoom 手势所有权可选 content / exclusive / workspace；scaling 可控制缩小后是否交互 | `docs/concepts.md:22-25` | 为带自有缩放的节点指定 exclusive；默认内容滚动归内容，业务手势与画布导航分开 |
| minSize 在 free 下默认 480×320；面板小于屏幕 160×64 会显示图标概览 | `docs/concepts.md:22`、`:43` | 原库已经有缩小行为；先整合该行为，状态摘要作为 Xaihi 的补充 |
| motion 支持 system / full / reduced；可以配置 keymap、tokens 和 detail | `docs/react-api.md:56-65` | 对接既有主题与 reduced motion；不要复制官网皮肤 |

上游原文地址：
- https://github.com/DanFessler/trellis/tree/9d1da36b602888d80223f2b1e042251a243f9012
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/docs/react-api.md
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/docs/core-api.md
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/docs/concepts.md

许可属于采用这个依赖的实际条件。`LICENSE.md` 将非商业用途列为免费，商业项目要求相应授权；非商业许可还要求分发时保留许可证与出处，且不允许给衍生版本换一种许可。商业用途的适用条件以原文为准，不在这里推断 Xaihi 的最终用途。当前只进行阅读与设计，没有下载依赖、分发库或购买授权。

许可原文：
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/LICENSE.md
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/LICENSE-NONCOMMERCIAL.md
- https://github.com/DanFessler/trellis/blob/9d1da36b602888d80223f2b1e042251a243f9012/LICENSE-COMMERCIAL.md

## 仓内事实与接缝

以下是本轮读到的源码事实，不是运行结果。

| 事实 | 当前源码位置 | 接线要求 |
| --- | --- | --- |
| 用户说的第一个 grid 模式对应 `viewMode = cards` | `packages/ui-host/src/components/workspace/TopBar.tsx:86` | 在这个入口里增加第五种子布局 |
| 四种子布局为 grid / stack / split / focus | `packages/ui-host/src/types/workspace.ts:13`；`TopBar.tsx:94` | 增加 `trellis`；保留已有含义 |
| 卡片渲染经 computeLayout 取得绝对几何 | `packages/ui-host/src/components/workspace/CardView.tsx:138` | Trellis 使用自己的布局容器，不能落入旧 focus 的兜底算法 |
| 卡片的聚焦与退出会直接切换到旧 focus / grid | `packages/ui-host/src/components/workspace/ComponentCard.tsx:73` | Trellis 中的导航留在 Trellis 内；全屏退出回到原导航位置 |
| 两份校验集合都只接受四种值 | `packages/ui-host/src/components/workspace/AppConfigSync.tsx:84`；`packages/ui-host/src/store/workspaceContext.tsx:55` | 同批补齐同步、清洗、QA 入口与恢复 |
| workspace 目前只保存 flowCanvas / flowCamera 等，没有递归分组树 | `packages/ui-host/src/types/workspace.ts:76`；`packages/shared/src/index.ts:5` | 新增可选 Trellis 数据结构，旧数据没有字段时正常初始化 |
| DTO 映射与 hydrate 都显式逐字段复制 | `packages/ui-host/src/store/workspaceContext.tsx:89`；`packages/ui-host/src/store/workspace/backendSlice.ts:36` | 新字段必须从写入到读回全链路覆盖 |
| 多工作空间已经退役 | `docs/adr/0019-single-workspace-collapse.md`；`backendSlice.ts:27` | 分形容器是当前工作台内的分组，不复活顶层 workspace 注册表 |
| 工作台快照当前经 state.getData / state.patchData 桥读写 | `packages/ui-host/src/store/workspaceContext.tsx:153`、`:174` | 区分现有实现和 ADR 规定；不可未经审查把新增布局数据继续塞进配置 |
| core 当前的 nodeState 是 volatile 字符串字典 | `packages/core/src/index.ts:75`、`:173` | 新增耐久布局数据按 ADR-0013 走 DSH storage domain，不能拿现有字段的存在当作新增配置存储的理由 |

并行工作情况：本轮已用 `but diff --json` 读到其他 lane 正在修改 `AppConfigSync.tsx`、两份 i18n、AppMenuRoot、WorkspaceSection 等文件。实施前重新核对 hunk 归属，只改本任务部分。

## 建议的产品形状（尚待确认）

入口：卡片 → 网格 / 瀑布流 / 分屏 / 聚焦 / **分形（Trellis）**。

选中分形后，出现这个布局自己的 **层级聚焦（Focus） / 自由缩放（Free Zoom）** 切换。现有“聚焦”仍是四种旧布局之一；二者的状态分别保存。

建议首次进入用 Focus，随后记住用户选择。两种导航共享同一棵容器树，切换导航不新建组件，不复制节点运行状态。

建议采用原库的 View / Panel / Split 模型，以当前工作台为根：

```text
当前工作台（Split）
├── 标签组（Panel）
│   ├── 节点实例 A（View）
│   └── 节点实例 B（View）
└── 嵌套分割（Split）
    ├── 节点实例 C 所在的 Panel
    └── 节点实例 D 所在的 Panel
```

叶子只引用稳定的 componentId；组件的实际数据、运行状态与独立窗口归属仍由现有组件模型维护。新增卡片的投放位置在标签组方案确认后再细化。标签拆分、布局重组不删除节点实例；关闭节点走既有实例生命周期和关闭确认规则。用户是否需要给布局容器另起名字，留到原生结构确认后的下一轮，不先新建文件夹系统。

不根据运行状态自动重排树。手工组织的空间结构应稳定；运行、进度、错误提示继续使用现有节点状态面。

## 要打磨的真实交互

- Focus 中通过容器和面包屑逐层进入、返回；Free Zoom 中平移缩放，提供回到全局、适配内容、定位当前节点的可见操作。
- 分组、嵌套、重排、拆组与尺寸调整必须操作真实组件实例，不能只有示例卡片或截图。
- 建议在近处保留可操作的真实节点面板，远处只显示名称、类型、运行状态等摘要；切换详情不能重启任务或丢弃尚未提交的编辑。
- 普通滚轮优先滚动面板内容。画布导航使用明确的背景、手柄或导航手势；文本选择、输入框、表格滚动、拖动文件不能触发画布移动。
- 卡片标题栏与容器边界承接布局拖拽，节点内容区域继续承接业务操作。模块库投放与树内拖拽分别识别，禁止自己拖入自己或后代形成环。
- Focus / Free Zoom 切换、缩放、重排、调整视口期间，组件 id 保持稳定；真实 DOM 是否需要重挂载、离屏面板如何保留状态，要通过原库实际 API 与浏览器测试证明。
- 全屏退出回到之前的模式与位置；Escape 按当前状态逐层处理，并尊重菜单、对话框和编辑控件已消费的事件。
- 窄窗口、长中文标题、嵌套很深、空分组、空工作台、节点卸载、窗口归属变化都要有可读状态。
- 颜色、字体、边框、控件和动画消费既有主题；不引入默认 md3，不将官网示例配色硬编码成新的全局设计语言。
- 提供触摸和键盘可达的导航按钮；支持 reduced motion；焦点与当前路径必须能被读回。

## 数据、DSH 与宿主边界

布局文档（LayoutDocument）、分割比例、标签组合、需要恢复的导航位置属于工作台耐久数据。建议声明一个以 `xaihi_` 开头的 DSH storage domain；具体命名与桥方法在实现设计中确定，不建本地 Trellis 配置文件、独立 HTTP 后端或新的 SSE。

默认导航方式、动画等真正的配置偏好走 DSH 标准 settings：声明 Schema，读 describe，写携带 expectedRevision，订阅 settings/document-updated；冲突呈现版本与重读操作。新增布局树不能放进 localStorage 冒充已持久化。

当前工作台快照的 state.* 桥与 core nodeState settings 落点是既存事实；新增数据接入前需审查 storage domain 的可用 API、桥的真实能力和可移植性。DSH 支持不了的通路提出 proposal；不复制宿主运行时，不伪造能力。

Trellis 基础布局应能在官方桌面端与 dsh web 使用。任何能力依赖自家 desktop 壳时必须探测并可见降级。只通过仓内 host 脚本使用隔离 DSH_HOME 与 3199 端口进行实机验证。

## 实现顺序与验收设计

1. 核对上游库版本、许可证、React 兼容和 Focus / Free Zoom 的公开 API，记录来源。直接集成真实库；若必须移植特定源码，记录原 commit、许可和本地补丁。
2. 接第五种布局入口、类型、导航模式、状态校验和中英标签；按模式懒加载。
3. 接组件实例引用与分组树；落实结构编辑和输入手势边界；完成模式切换与全屏回程。
4. 接 DSH 的耐久数据读写与真实配置偏好，覆盖旧快照、坏数据、节点删除和恢复。
5. 针对真实节点做浏览器验收，再补报告：改了什么 / 为什么 / DSH API file:line / 后续扩展。

后续测试只跑 ui-host 与实际涉及的包，不跑不可归因的全仓 pnpm test。断言使用固定预期、配阳性对照。

| 必须证明的行为 | 有意义的反例 |
| --- | --- |
| 第五项能进入 Trellis，切 Focus / Free Zoom 仍是同一批节点实例 | 去掉新布局路由，测试应检测到旧 focus 兜底或缺失入口 |
| 分组/移动/拆组不丢实例且不产生环 | 注入重复 id 或祖先成为子孙，必须拒绝或明确修复 |
| 布局、分割比例与导航状态能读回 | 删掉 DTO / hydrate 的任一字段映射，round-trip 应变红 |
| 面板内输入、滚动和文本选择可用 | 用真实嵌套滚动与输入控件；画布手势错误截获时应变红 |
| 切导航、重排或缩放不重启节点，不丢编辑状态 | 组件计数与真实输入值验证；仅观察截图不成立 |
| 全屏返回原位置，导航和焦点可读 | 清空返回状态，回程断言应变红 |
| 官方桌面与 web 的能力降级可读 | 撤掉原生能力后，界面必须读到退化原因 |

## 已确认决定（2026-10-11）

Q1：是否允许把多张节点卡片合成标签组？建议允许，采用原库 Panel 标签组与 Split 递归分割，首次进入每张当前卡片各占一个 Panel，由用户拖动组合，不自动替用户分类。

Q2：首次进入 Trellis 用 Focus 还是 Free Zoom？建议 Focus 首次进入，并记住之后的切换选择。

Q3：Free Zoom 中的节点是否直接可操作？建议达到可读尺寸后直接操作真实面板，缩得很远时显示摘要；画布缩放和平移走明确手势，普通滚轮优先给面板内容。

Q4：Xaihi 预计怎样使用或分发，是否能够采用上游这种非商业免费、商业另行授权的库？建议先明确用途及许可条件，再确定依赖采用方式；不默认为已经拥有商业授权，也不自行改许可。

用户已确认全部按推荐实现，个人免费非商业用途。采用 Q1–Q3 推荐，Q4 按非商业许可接入，保留原文许可和归属。核心与 React 适配器均锁定 npm 已发布 0.3.0。后面的草稿验证是实施前记录，最终实施证据见阶段报告。

## 本轮验证记录

仅完成仓内源码研究、上游原文核对与设计草稿；未添加依赖，未改变产品代码，未启动宿主，未跑构建或产品测试。任何库的运行体验、性能与兼容性都不标记为已验证。

文档检查（Python 校验引用的源文件存在、围栏闭合和第一轮问题齐全）rc=0，真实输出：

```text
PASS: 10 local source paths exist; fenced blocks balanced; Q1-Q4 present; upstream source commit recorded; draft explicitly unimplemented
```
