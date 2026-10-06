# ADR-0005 入口 bundle 包是发布期产物，本地装机走逐行 profile

状态：接受（2026-10-06）
决策人：HibernalGlow
相关：ADR-0002（自包含与自带 patch）、`docs/roadmap.md` 的发布策略与 R9

## 背景

ADR-0002 已经记下入口包 `@hibernalglow/xaihi` 用 `file:` 装不上，原因写在 pnpm 那边：profile 目录
自己是一个 pnpm 项目，而它不在本仓的 workspace 里，所以 `dependencies` 中的 `workspace:*`
无法解析。本次在一个**干净的新 profile** 上复现，拿到权威诊断（不是复述旧结论）：

```
dsh xaihi-bundle --from-default-profile web        → profiles/xaihi-bundle/package.json 里只有
                                                     @deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app
dsh plugin --profile xaihi-bundle add file:…/packages/bundle   → rc=1
  Failed to resolve dependency tree: In …/profiles/xaihi-bundle:
  "@hibernalglow/xaihi-core@workspace:*" is in the dependencies
  but no package named "@hibernalglow/xaihi-core" is present in the workspace
diagnostics: $DSH_HOME/profiles/xaihi-bundle/.plugin-manager/logs/operation-qnYJS3/pnpm.log
```

同时量出全仓的形状：带 `dsh.bundle.patch` 的包一共 9 个，其中**只有入口包**带 `workspace:*`
运行时依赖；其余 8 个（core、ui、hello、linedup、sleept、dissolvef、findz）都是干净的，
这正是 Gate 2.1—2.5 能用 `file:` 一路装下来的原因。kit 与 sdk 在插件里是 `devDependencies`
——`file:` 安装不装依赖包的 devDeps，所以它们只在打包期内联，不参与解析。

## 决定

1. **入口包保留 `workspace:*` 依赖，不改成写死版本、也不把 core/ui 内联进来。**
   `pnpm publish` 会把 `workspace:*` 改写成真实版本号，那时依赖能从 registry 解析，
   "装一个包就得到工作台"这条路才第一次成立 ⇒ 入口包是**发布期产物**。
2. **开发期的装机口径就是口径，不假装它是入口包路径**：profile 的 `dsh.profile.bundles`
   逐行列 `@hibernalglow/xaihi-core` 与 `@hibernalglow/xaihi-ui`（现在这台隔离宿主里就是这两行），
   节点各自一行。
3. 新增门禁 `scripts/check-installable.mjs`（挂进根 `check:installable`、`pnpm test` 与 CI）：
   任何带 `dsh.bundle.patch` 的包都不许有 `workspace:*` 运行时依赖；例外名单里只放
   `@hibernalglow/xaihi`，**并且名单里的项若不再是 bundle 包就报错**——否则例外会烂在里面没人删。

## 后果

- 在 alpha 发布之前，任何文档与 README **不许**把 `@hibernalglow/xaihi` 写成"可安装的入口"；
  能写的只有"发布后成立"。这条判据由 roadmap R9 的触发条件守着。
- 发布时要跑一次真证明，形状已经写好（新 profile 只装入口包 ⇒ `--dump-config` 里出现
  xaihi 两行、`/xaihi/manifest.json` 返回 200、`main` 面板出现并且能 `selectPanel`）。
  没跑过就是没验过，不拿"设计如此"顶替。
- 门禁自身带 `--self-check`（workspace 依赖必须被抓、registry 版本必须被放过、例外名单必须被认），
  并对真文件做过减法跑测：往 `packages/core/package.json` 注一条 workspace 依赖 ⇒ rc=1 并点名
  `@hibernalglow/xaihi-core`，撤回后 shasum 复原（`14fc85f52cf2e5affe544842253c333816a5a744`）。
- 副作用一条：本次为取证建的 `profiles/xaihi-bundle` 是**一次性 profile**，取证后删掉，
  不留在隔离 home 里当"第 N 个开发宿主"——留着会让人以为入口包装过。
