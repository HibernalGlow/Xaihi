---
name: xaihi-plugin-development
description: Use when creating or changing a Xaihi node package under plugins/*, when wiring a node action, when a package must be installable into a DSH profile, or when a plugin fails to load in the host. Keywords: 节点包, cordis.patch.yml, defineNode, plugin add, 装载失败, 危险闸门.
---

# 写一个 Xaihi 节点包

## 起手只有一条路

```bash
node packages/create-xaihi-plugin/lib/index.js <name> --node-id <id> \
  --title-zh 中文名 --title-en "English" --dir plugins/<name>
```

不要手抄别的包。脚手架生成 18 个文件：贡献清单与节点定义、自带的 `cordis.patch.yml`、宿主半边
`src/index.ts`、`frontend/` 的 UI 产物、起步测试（`tests/core.spec.ts`：定义合法性与当前内核行为
各一颗钉子），**外加终端面**——`src/cli.ts`、`src/help.ts`、
`src/cli-support.ts`、`tests/cli.spec.ts`、`vitest.config.ts`，连着 `package.json` 的 `bin` 与
`./cli`、`./help` 两条 subpath 和 tsdown 的三入口。聚合 CLI 按 `{包名}/cli` 取 `cli`、
按 `{包名}/help` 取 `help`（`packages/cli/src/index.ts`），少一条腿的症状是"节点在列表里但跑不起来"。

`src/cli-support.ts` 是读 `plugins/linedup/src/cli-support.ts` 再生成的，只差 `@module` 那一行：
`node scripts/check-vendored.mjs` 对这些 vendored 拷贝逐字节比对，手抄一份就是多一处漂移源。
终端面生成出来是**响亮拒绝**那一档：动作的接线只在宿主进程里（DSH 的 `tools` 服务 +
xaihi-core 的 `OPERATIONS_SERVICE` 账本），bin 里跑一律退出码 2 并点名缺的那条服务；
`src/help.ts` 也只从 `package.json#xaihi.node` 推导，不抄第二份文案。内核搬进 `src/core.ts`
之后，在 `runHostedAction` 里点亮这一条。

## 一个包必须同时是三样东西

1. **DSH bundle**：`package.json#dsh.bundle.patch` 指向自带的 `cordis.patch.yml`，里面插入自己那一行（`id` 与 `xaihi.id` 一致、`name` 是包 specifier）。插件即 bundle 行——没有这行，宿主装不了它。
2. **Xaihi 节点**：`package.json#xaihi` 是 `xaihi.manifest/1` 贡献清单 + `xaihi.node/v1` 定义。定义只有一份真源：`src/index.ts` 用 `createRequire(import.meta.url)('../package.json')` 读自己的清单，不许再抄一份常量。
3. **自带 UI 产物**：`frontend/` 经 rspack 出 `dist/remoteEntry.js` + 同级 chunk。`files` 白名单必须含 `lib/**` 与 `dist/**`（漏掉 chunk 的症状是"failed to import"）。

## 动作接线

```ts
const node = defineNode(ctx, {
  definition,
  journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,  // 必须每次现取
  handlers: { async status({ inputs, run }) { run.resultView(payload); return text } },
})
```

- 工具名是 `<nodeId>_<actionId>`，模型面与清单面同源。
- 危险动作只在定义里声明（`danger.actionIn` 等），`defineNode` 把它变成 DSH 的 `ask`。**不要自己实现确认框或权限系统。**
- `journal` 缺席时进度上报是无操作，节点必须能脱离 xaihi-core 单独装。
- `defineNode` 返回的 `node.invoke` **不过** `tools/pre-execute`：命令 / UI 这类非模型入口必须先问 `dangerFor`，危险动作直接拒绝。

## 装进宿主验证（每一步都要 rc）

```bash
pnpm -r run build && pnpm test
pnpm plugin:add "file:$PWD/plugins/<name>"
pnpm profile:dump | grep <name>          # 行是否合入
pnpm host &  curl -s localhost:3199/xaihi/debug.json?token=... 
```

`debug.json` 读回三件事：`located`（清单被拒的原因，fail-loud 不静默）、`services`（可选服务在不在）、`commands`（节点的宿主半边跑没跑完——命令注册在 apply 最后一步）。

## 装不上时先查这三条

- profile 的 pnpm 配置：`nodeLinker: hoisted`、`autoInstallPeers: false`，且 `pnpm-workspace.yaml` 里的 `allowBuilds:` 占位文本必须填 `true`/`false`（只有这个文件生效，根 `package.json` 的 `pnpm.onlyBuiltDependencies` 会被静默忽略），否则 `ERR_PNPM_IGNORED_BUILDS`。
- `workspace:*` 依赖装不进 profile：仓内 SDK 一律构建期内联（见 `docs/adr/0002-self-contained-plugin-packages.md`）。
- 搬动过 profile 目录：`node_modules/.modules.yaml` 记的是相对 `file:` 路径，必须删 `node_modules` 重装，症状是 `ERR_PNPM_FS_PACKLIST_IO`。
