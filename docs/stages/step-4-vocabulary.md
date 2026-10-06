# 阶段报告：节点词表对齐到真源（`xaihi.node/v1` 能吃下上游 27 份定义）

对应计划里那条"词表真源"的口径（用户 2026-10-06 定）：
`<Xiranite>/node-definitions/*.json` + `<Xiranite>/packages/node-definitions/src/contract.ts`
是节点定义词表的真源，**不是**我早先手挑的 `xaihi.node/v1` 子集。

## 一、改了什么

- `scripts/check-vocab.mjs`：把 27 份上游定义**喂进我们自己的 `validateNodeDefinition`**，
  读数=放过几份；`--self-check` 是阳性对照（8 类坏定义必须全被拒、真定义必须被放过）；
  `docs/port/vocab-baseline.json` 是棘轮基线（`pass` 不许降、错误类只许减不许增）。
- `packages/node-sdk/src/node.ts`：字段规则改成上游的 **`GuardedRule`** 形状
  （`rules[] = [{ rule: {type,…}, when? }]`），并补上游在管的四件事：
  `select` 必须有选项、`range` 只属于 number 且 `min ≤ max`、
  `default` 是"恰好 text/number/boolean 取一"的标量且要与 `kind` 相符、
  `when` 必须是 `CONDITION_KINDS` 之一。
- `packages/node-sdk/src/define-node.ts`：参数表的 `required` 判定读 `entry.rule.type`，
  并且**带 `when` 的规则不算必填**。
- 迁移：8 份 `plugins/*/package.json` 里 33 个字段的 rules 数组、脚手架模板、SDK 测试夹具。
- `package.json`：`check:vocab` 与 `check:vendored` 接进根 `test` 链（各自带 `--self-check`）。

## 二、读数（都是实测）

```
改之前：check-vocab: 上游定义 27 份，我们的校验器放过 0 份，被拒 110 条错误 / 27 个节点
        27  fields[0].rules[0].type is not in required, nonBlank, integerAtLeast, …
改之后：check-vocab: 上游定义 27 份，我们的校验器放过 27 份，被拒 0 条错误 / 0 个节点
        基线 pass=27/27 → 现在 27/27；消失的错误类 0，新增 0        check-vocab OK   rc=0
$ node scripts/check-vocab.mjs --self-check
check-vocab --self-check OK（8 类坏定义全被拒，好定义被放过）        rc=0
```

枚举面本来就是齐的（`RULE_KINDS`/`TEST_KINDS`/`CONDITION_KINDS`/`DANGER_KINDS`/`TRANSFORMS`
逐条对过上游 `contract.ts:17-30`）——**漂的是形状不是词表**。
上游 27 份定义里 110 条规则全在 `rules[]` 这一层，所以一个形状差了 27/27。

## 三、为什么这样设计

1. **判据用数据，不用我的看法。** "词表对齐"如果写成"我看了 contract 觉得够"，
   下一次迁移新节点时没人知道还差什么。喂 27 份真定义是零解释空间的读数。
2. **形状之争让路给真源。** 我摊平那一层是为了少写嵌套（`rules:[{type}]`），
   代价是"能吃上游定义"这件事只是口号；而且真到迁移时每个节点都要在 manifest 与
   工具之间做一次人工形状转换——那才是贵的那一份。
3. **基线不是免罪符。** 现在 `pass=27/27`，基线就把这个数钉住；
   以后有人放宽或改坏，`check-vocab` 会因"错误类新增"或"份数下降"红。
   上游那份 contract 还有 `dashboard`、`custom` 规则的细则、`rejectExtraKeys` 等检查
   我们**故意没搬**（`dashboard` 属于上游工作台自己的取数面板，Xaihi 侧字段可见性由
   `inputBindings`/条件求值器给），这类"没搬"要成为被点名的决定，不是静默缺失。

## 四、并发写带来的一个假故障（值得记）

同一时刻 `pnpm -r run build` 报 `plugins/linedup build: Failed`，
但单独跑 `tsdown`（rc=0，8 文件）与 `rspack build`（rc=0）都过 —— 因为递归构建进行时
批次 E 的子任务正在往插件目录写源文件。这正是"构建在跑时别写构建输入"那一类，
递归构建的读数在并发窗口里不可归因；判据要回到**单包隔离跑**。

## 五、后续扩展

- 词表再长（例如要接 `dashboard`）：先加 `check-vocab` 的一条真定义夹具用例，
  让它先红，再动 `node.ts`；不要反过来。
- 五个上游检查尚未落地：`rules[].when` 的条件求值目前只用于字段可见性，
  规则级 `when` 的求值要等 `defineNode` 的参数校验接线；`custom` 规则要求节点导出函数，
  与 `danger.pluginExport` 同一形状，可复用那条路径。
