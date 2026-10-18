#!/usr/bin/env node
/**
 * scripts/check-components-overlap.mjs
 *
 * 节点与界面组件互相遮盖（Overlap / Collision）检查脚本。
 * 依据 ADR-0034（容器级自适应体系）与 ADR-0010（品牌一律 Xaihi）。
 *
 * 检查内容：
 * 1. 验证组件重叠检测算法核心逻辑与阳性对照（component-overlap-detector.spec.tsx）；
 * 2. 遍历全节点生态，在多种极端宽高矩阵（tall-narrow, short-wide, square, workspace, compact, portrait 等）
 *    与布局形态（Full, Compact, Collapsed）下进行无互相遮盖断言（nodes-overlap-check.spec.tsx）；
 * 3. 运行 Chromium 真机排版相交碰撞扫描（nodes-overlap.browser.test.tsx）。
 */

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

console.log("\x1b[36m%s\x1b[0m", "=== Xaihi 组件防互相遮盖与全节点多尺寸布局检查 ===")
console.log("依据: ADR-0034 (容器级自适应) & 矩阵检查\n")

// 步骤 1：运行组件重叠检测算法及阳性对照
console.log("[1/3] 运行重叠检测核心算法与阳性对照...")
const unitResult = spawnSync(
  "pnpm",
  [
    "--filter",
    "@hibernalglow/xaihi-ui",
    "test:unit",
    "tests/component-overlap-detector.spec.tsx",
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  },
)

if (unitResult.status !== 0) {
  console.error("\x1b[31m%s\x1b[0m", "❌ 步骤 1 失败：重叠检测算法单元测试未通过。")
  process.exit(unitResult.status ?? 1)
}

// 步骤 2：全节点跨宽高与多布局形态防遮盖矩阵验证
console.log("\n[2/3] 运行全节点跨宽高与布局形式防遮盖矩阵扫描 (44 项用例)...")
const matrixResult = spawnSync(
  "pnpm",
  [
    "--filter",
    "@hibernalglow/xaihi-ui",
    "test:unit",
    "tests/nodes-overlap-check.spec.tsx",
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  },
)

if (matrixResult.status !== 0) {
  console.error("\x1b[31m%s\x1b[0m", "❌ 步骤 2 失败：全节点尺寸布局矩阵扫描检出组件遮盖违规。")
  process.exit(matrixResult.status ?? 1)
}

// 步骤 3：Chromium 真机浏览器物理排版相交碰撞扫描
console.log("\n[3/3] 运行 Chromium 真机物理排版相交碰撞扫描 (13 项真机用例)...")
const browserResult = spawnSync(
  "pnpm",
  [
    "--filter",
    "@hibernalglow/xaihi-ui",
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.overlap.browser.config.mjs",
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  },
)

if (browserResult.status !== 0) {
  console.error("\x1b[31m%s\x1b[0m", "❌ 步骤 3 失败：Chromium 真机环境检出组件物理相交遮盖。")
  process.exit(browserResult.status ?? 1)
}

console.log("\n\x1b[32m%s\x1b[0m", "✅ 全节点多尺寸与布局形态下组件无互相遮盖检查通过！(rc=0)")
process.exit(0)
