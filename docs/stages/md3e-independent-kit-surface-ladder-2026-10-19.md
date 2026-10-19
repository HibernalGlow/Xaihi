# 阶段报告：MD3E 独立包表面色阶契约

日期：2026-10-19。范围：补齐 `@hibernalglow/xaihi-ui-kit` 面向独立节点与 React 项目的 MD3E surface-lowest 色彩角色，并让 Shellect 使用包公开契约。

## 改了什么

- `packages/ui-kit/src/tokens.ts` 增加 `MD3E_ALIAS.surfaceLowest`，按 Xaihi MD3E、host `--md3e-*`、Material system、Xaihi alias、实测 DSH alias 的顺序解析；公开主题 token 从 21 个扩展到 22 个。
- ui-kit 的 field control 使用 surface-lowest；Shellect 的 lens bar 改用 ui-kit 导出的同一角色，不再私拼宿主变量链。
- README 补齐 surface-lowest 的独立主题示例与色阶说明。tarball verifier 检查运行时导出、CSS bridge 和 README 对全部公开 token 的覆盖。
- `tokens.spec.ts`、`distribution.spec.ts` 与 pack verifier 加入 surface-lowest 断言及通用宿主色变量隔离阳性对照。

## 为什么

Shellect 需要比普通 surface 更低的一档容器来表达输入和镜头轨道。此前包契约没有这个角色，节点只能自行拼接主题回落链，独立使用时容易与宿主耦合，也可能重新引入 Legacy 色值。

## 与 DSH API 的关系

- 本次仅扩展包内 CSS 语义角色；颜色优先读取宿主已提供的 `--md3e-*` / `--md-sys-color-*`，再回落至既有 Xaihi 与 DSH alias。没有添加配置、存储或新的宿主 API。
- 独立项目通过 `XMd3eTheme` 设置 `--xaihi-md3e-surface-lowest`；声明与样式消费见 `packages/ui-kit/src/tokens.ts:28-76`，Shellect consumer 见 `plugins/shellect/frontend/Md3eManager.tsx:24-32`。

## 验证与后续扩展

- `pnpm --filter @hibernalglow/xaihi-ui-kit test:unit` → **rc=0**，7 files / 31 tests passed。
- `pnpm --filter @hibernalglow/xaihi-ui-kit typecheck` → **rc=0**。
- `pnpm --filter @hibernalglow/xaihi-ui-kit build` → **rc=0**，生成 22-token declaration 与静态 `styles.css`。
- `pnpm --filter @hibernalglow/xaihi-ui-kit verify-pack` → **rc=0**，真实 npm tarball consumer 与类型入口通过，读回 36 个形状、CSS 67063 B；verifier 检查 README 覆盖全部公开 token。
- `pnpm --dir packages/ui-host exec vitest run -c vitest.config.ts src/nodes/shared/all-nodes-md3e-views.test.tsx src/components/workspace/WorkspaceWindowRestorer.test.tsx` → **rc=0**，2 files / 31 tests passed。
- `pnpm exec tsc --noEmit --allowImportingTsExtensions --jsx react-jsx --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck plugins/shellect/frontend/Md3eManager.tsx` → **rc=0**。
- 后续仍需继续逐类对照 Rossi / Rhythm 参考，将通用包之外的独立节点样式逐步收敛到公开原语，并做节点级浏览器视觉核验；本阶段未声称完成全部节点的视觉验收。
