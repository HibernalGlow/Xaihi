# ADR-0002 可安装的插件包必须自包含且自带 patch

状态：接受（2026-10-06）
决策人：HibernalGlow

## 背景

DSH 的 profile 是一个独立的 pnpm 项目（`$DSH_HOME/profiles/<name>`，`nodeLinker: hoisted`、`autoInstallPeers: false`）。实测两条：

1. `dsh plugin --profile xaihi add file:…/packages/bundle` 直接失败：
   `Failed to resolve dependency: "@hibernalglow/xaihi-core@workspace:*" is in the dependencies but no package named "@hibernalglow/xaihi-core" is present in the workspace`。
2. 桌面端 Plugins 页只管理声明了 `dsh.bundle` 的包："a dependency without a bundle patch is refused before it installs"。

另外 pnpm 会执行被装包的 `prepare`，而 `prepare` 需要的构建工具链在 devDependencies 里 ⇒ 在 profile 侧解析 `workspace:*` 的 devDependency 同样会炸。

## 决定

1. **每个要装进 profile 的包都是 bundle**：自带 `package.json#dsh.bundle.patch` 与一行 `cordis.patch.yml`，行 `name` 用裸包名（client-modules 靠它挂浏览器半边）。
2. **仓内包只在构建期存在**：`@hibernalglow/xaihi-sdk` 只作 devDependency，并被显式 `noExternal` 内联进产物；产物里不许出现 `@hibernalglow/`（`packages/core/tests/bundle.spec.ts` 守）。
3. **不设 `prepare`**：本阶段本地开发装的是工作树副本，`lib/` 与 `dist/` 由 `pnpm -r run build` 现生成并随 `files` 一起复制。将来发布 npm 时改用 `prepack`，避免在他人 profile 里跑构建。
4. `@hibernalglow/xaihi`（入口 bundle）保留 `workspace:*` 依赖不本地安装：它只在发布时由 pnpm 自动改写成真实版本，届时"一个包装齐工作台"才是用户路径。

## 后果

- 正面：与 DSH 的分发单位一致（一个包 = 一行 = 一个可开关单元）；节点装卸不影响工作台其余部分（Gate 2.6 实测）；不会出现"本地能跑、装了就不行"的版本错配。
- 代价：SDK 类型被内联进每个宿主半边，包体略大；同一 SDK 的多份内联副本要求它保持纯类型 + 纯函数（已在包注释里写明）；本地开发必须先 build 再 install（CI 顺序已固化）。
