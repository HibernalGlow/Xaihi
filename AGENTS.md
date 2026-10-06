# Xaihi agent instructions

Xaihi 是跑在 DeepSeek Harness（DSH）上的**工作台扩展框架 + 领域节点生态**。它不是独立应用，
也不是 DSH 的分叉。以下规则每次进来都要遵守；出处写在括号里，冲突时以 ADR 正文为准。

## 品牌：自称一律 Xaihi（`docs/adr/0010-brand-is-xaihi.md`）

- **会随代码活下去的称呼全部是 Xaihi**：npm 包名与 scope、`bin` 名、CSS 类名前缀、`data-*` 属性、
  DSH storage domain 与 `/xaihi/*` 路由、`globalThis.__XAIHI__`、临时目录前缀、错误与日志文案、
  i18n 里使用者读到的句子。
- **`Xiranite` 只在 prose 的"出处位"允许存在**：ADR、阶段报告、技能、对照表、`CONTEXT.md` 词条里
  那些"这一条是从哪搬来"。删它们等于烧掉搬运的账本。
- 尺是 `node scripts/check-brand.mjs`（剥掉注释之后再找旧品牌）。**不要给它加白名单，不要靠 skip 变绿。**
  必须保留旧标识符时（例如为了读旧数据），那要成为 ADR-0010 里一条被逐地点名的决定，而不是门禁里的一行例外。
- 搬运批次落地时**顺手改名，与消费者同批**（CSS 类名要连着 JSX/测试一起动；改一半比不改更糟）。
  跨语言的格式判别符与落盘文件名属于"改名 = 数据迁移"，动之前先问使用者。

## 搬运，不发明（ADR-0006）

- 工作台 UI、每个节点自己的 UI、CLI 面、TUI 面都**早已在 `<Xiranite>` 里写好**。动词是移植与接线，
  不是设计；"我重写一版更干净"不是理由。
- 共享形状只从 `<Xiranite>/src/nodes/shared/` 搬，不在本仓另立一套"通用组件"包。
- UI 层契约以上游的 `AppNodeEntry` / `HeadlessNodePackage` 为准，本仓的 `PanelProps` 是它的子集，
  要补齐而不是并列第二套。
- 六套设计语言（`native|md3|mondrian|wuling|swiss|lonestar`）里 **`md3` 只是其中一套，不是默认值**；
  把一个候选提成默认等于替使用者做了选择。

## 不碰 DSH 的三样东西

- **不 fork DSH、不复制它的运行时、不重建它已经提供的能力。** 设计落到 DSH 支持不了的地方 ⇒
  **提 proposal**（`docs/upstream-proposals.md`），不许绕过缺口自己长一条通路，更不许伪造它没给的数据
  （例：0.2.0-rc.2 的插件客户端拿不到 `agentId`，实测十个服务名全 `absent` ⇒ 那就是 proposal P1，
  不是自己造一个）。
- 版本闸门：所有 `@deepseek-ai/dsh*` 必须精确 `0.2.0-rc.2`（`check:pins`；npm 上若干包的 `latest`
  标签停在 `0.0.1-rc.1`，裸 `pnpm add` 会把整个生态悄悄降到不存在的 API 世代）。
- 装进 profile 的包不许引用 `@hibernalglow/*`（profile 解析不了仓内包，ADR-0002；`check:installable`）。
- **上一条的"自己长通路"禁令只对本仓有效，但它的例外不在本仓里。** 官方桌面端给不了的原生能力
  （原生多窗口、自己的文档窗）由**同级独立仓 `Xaihi-Desktop`** 持 vendor + `patches/dsh/` 实现；
  **本仓仍然不 vendor、不 patch、不引 Electron**（判据与数字见 `docs/adr/0011-*.md`）。
  壳仓 vendor 的上游 commit 必须与 `check:pins` 同档，不一致要成为 ADR-0011 里被点名的追加决定。
- **降级铁律**（ADR-0011 决定 4）：任何只有自家壳才支持的能力，bundle 侧必须探测 → 退化 →
  **退化状态在界面上读得回来**。官方桌面端与 `dsh web` 下可以功能退化，不许崩、不许静默、
  更不许伪造。一个节点若只能在自家壳里工作且没有可见退化，就是违反了这条，按违反处理。

## 宿主隔离与实机

- 一切 `dsh` 调用走脚本：`pnpm host` / `host:headless` / `plugin:add` / `plugin:install` / `profile:dump`，
  它们已经把 `DSH_HOME=$PWD/../.scratch/dsh-xaihi-home` 与端口 `3199` 烧进去了，**不要手敲裸 `dsh`**。
- **profile 不隔离会话**：DSH 的会话按 cwd 落在 `$DSH_HOME/sessions/<cwd-slug>/`。换 profile 不换会话库。
- 真睡/休眠这类破坏性动作**必须当场取得授权**才跑；能测的替代判据（关屏、进屏保、`HibernateCount`）先用。
- 开发宿主与日常宿主必须是不同 `DSH_HOME`——测试对话不许出现在使用者正常界面里。

## 门禁与证据

- 现有门禁：`check:pins`、`check:skills`、`check:installable`（都带 `--self-check`），已接在根 `test` 与 CI。
  `check:brand` 已经能跑、也能证伪，但**故意还没接线**（判据与接线时机见上一条与 ADR-0010）——看见它不在
  CI 里不要去"补上"，那会把红线画在别人正在重写的搬运文件上。
- **每条尺必须配阳性对照**："关掉防御就变红"的用例；没有正控的判据视为不存在。期望值不许通过再调一次
  被测函数得到。
- 报告里的事次要带 **rc + 真实输出**，不许写"应该能跑"。区分「做了」与「实机验过」；只在一条腿上编译过的
  断言要写成 compile-verified only。
- 阶段交付的四段式（改了什么 / 为什么 / 与 DSH API 的关系带 `file:line` / 后续扩展）落在 `docs/stages/`；
  决策落 `docs/adr/`；领域词落 `CONTEXT.md`。

## 版本控制与并发

- 写操作一律走 GitButler：`but diff` → `but commit -b <branch> -m "<msg>" <id>…`。**禁止**
  `git add/commit/push/checkout/stash`，**禁止裸 `but discard`**（它会把别的 lane 未提交的活儿一起清掉）。
  回退只用 `but undo`。
- **本仓经常有另一个 agent / lane 同时在写**（实测：同一把品牌尺在几分钟内读数 134 → 504 → 757，
  增量全是别人刚落的搬运产物）。未提交区里不是你这个任务的文件 ⇒ 不碰、不重命名、不"顺手格式化"。
  只提交自己拥有的文件；同一文件混着别人的 hunk 时按 hunk 级挑，并在提交前重新 `but diff` 核对归属。
- 别人在飞的时段里**全仓 `pnpm test` 的结果不可归因**（它会把正在被改写的搬运文件一起编进来）。
  验证只跑自己那一档：`pnpm --filter <你的包> test:unit` 加对应的 `check:*`，并把没跑的部分写出来。
- 提交信息用简体中文（跟本仓 `git log` 一致），**不加任何 AI 署名或 Co-Authored-By**。
- `examples/dsh-plugin-template/` 是参照物，不是待改代码。
