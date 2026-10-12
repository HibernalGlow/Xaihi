# Repacku：静默压缩、图集最小单位与顶层目录（2026-10-13）

## 改了什么

默认分析 JSON 移到扫描根同级，并在扫描和真实压缩清单里排除本目录和直接子目录的默认生成配置。
新增 `preserveRoot`，同步到节点定义、DSH `Config`、CLI、交互表单及工作台开关。
默认平铺；开启后归档内保留同名来源目录。已有扫描计划保存的选择可读回，也可显式覆盖。
已有归档先重建再替换，避免 7-Zip 更新命令留下旧目录项；失败或无产物不删除来源。
PeaZip GUI 入口直接拒绝，7-Zip 采用 `-y` 与忽略 stdin；PowerShell 非交互并通过临时布局保持路径。

## 为什么

使用者明确：`already` 是扫描根，里面的实际图集目录才是打包单位。
目标应为 `<图集名>.zip`，默认内部直接是图片，开启顶层目录时才是 `<图集名>/图片`。
生成配置不能成为下一次扫描的输入，也不能由 GUI 的确认或取消状态决定自动化结果。

用户随后报告关闭开关仍得到目录。实际运行账本 `repacku/single-pack#3/#4` 的 operation 缺少
新版 `includeRoot` 字段，确认当前宿主仍加载旧内核。构建源码并不等于现有宿主的模块缓存已更新。
在没有活动运行时重启隔离开发宿主，再经 `/xaihi/runner` 实测：关闭返回 `includeRoot:false`、
开启返回 `includeRoot:true`；对应两个归档均为 85 张图片，CRC 检查通过。
再对同一个已有目标先开启、再关闭：两次 runner 均 HTTP 200、success=true，
归档各为 85 个条目，开启时全部有图集前缀、关闭时全部无目录前缀，CRC 均通过。
确认重建替换会移除上一次结构的条目，未混入旧顶层目录。

用户这次运行后来源目录已经删除，原 ZIP 中仍有完整 85 张图片。修复前保存完整原 ZIP 到
`/var/folders/_2/2ps_d1kj7x3b9bsdvxgyr5dw0000gn/T/xaihi-repacku-repair-4yd0ro0g/original-with-root.zip`，
去掉唯一同名目录前缀后替换原卷上的 ZIP；全部 85 个文件 SHA-256 与备份一致，CRC 检查通过。
原 ZIP 之外的测试全部在临时目录，测试不删除用户来源。

## 与 DSH API 的关系及证据

`plugins/repacku/src/index.ts:157` 组合显式参数、已保存计划与 DSH 默认值；
`plugins/repacku/src/index.ts:269` 仍将 `ctx.subprocess` 接到运行时；
`plugins/repacku/src/platform.ts` 的 `runViaSubprocess` 通过 provider 的 `spawn` 和 `done` 收集结果。
没有新增子进程服务、设置存储或 GUI 自动化。危险动作仍沿用 `defineNode` 与宿主 approval。

本机真实来源：`/Volumes/BOX/1Hub/Wait/cosplay/2026-09-11/already`。
图集：`柒柒要乖哦 - 蔚蓝档案 龙华妃咲 花嫁`，85 个 AVIF。
直接运行内核与真实压缩后端的适配夹具验证了系统 7zz、PeaZip 自带 7z × 两种目录结构。
扫描仍读真实来源，仅将测试产物改写到临时目录；归档条目与来源文件列表逐项相等。
该轮来源 SHA-256 清单前后相等。另一次经真实宿主 runner 验证新版 single-pack，非模拟子进程。

```text
pnpm --filter @hibernalglow/xaihi-repacku test:unit  rc=0
Test Files 4 passed (4); Tests 59 passed (59)
Repacku Component 专项 vitest                     rc=0
Test Files 1 passed (1); Tests 14 passed (14)
pnpm --filter @hibernalglow/xaihi-repacku build    rc=0
Build complete; Rspack compiled successfully
核心 core.ts/platform.ts 专项 tsc                 rc=0
系统 7zz 与 PeaZip 自带 7z 的四个归档检查         rc=0
Everything is Ok; 85 files; 列表符合开关
pnpm check:pins                                 rc=0
check-pins self-check OK; check-pins OK
pnpm check:installable                          rc=0
check-installable self-check OK; check-installable OK
```

CLI 测试前补接已有 `packages/cli-runtime` 的本地 node_modules 链接，没有改仓库依赖声明或 lockfile。
完整包 `typecheck` rc=1，仍报已有 OpenTUI 缺失、CLI context Promise 形状及 TUI React 类型冲突；
本次核心改动专项类型检查通过，不能把完整包声明为 typecheck 通过。
全仓 brand 检查 rc=1，读数为 1161 处未点名的旧品牌，主要来自仍在搬运的文件；未改尺、未加豁免。
没有运行全仓 `pnpm test`，其它 lane 同时修改大量文件，结果无法归因本任务。

原始测试产物保留在
`/var/folders/_2/2ps_d1kj7x3b9bsdvxgyr5dw0000gn/T/xaihi-repacku-verification-hPylQ5/`；
真实宿主与当前 ZIP 修复证据在 `xaihi-repacku-repair-4yd0ro0g/`。

## 后续扩展

PeaZip 自带的本机后端已验证可用：`/Applications/PeaZip.app/Contents/MacOS/bin/7z/7z`。
可将 DSH `sevenZipPath` 指向它。PeaZip 的 GUI 过滤、预设与导出脚本不能根据少数 CLI 入口测试
就一概判为不存在；被用户取消或超时的测试也不能证明不支持删除。旧对照报告应按该范围阅读。
Windows PowerShell 当前是模拟验证，仍需 Windows 实机检查；不据本机结果推断跨平台已全部通过。
