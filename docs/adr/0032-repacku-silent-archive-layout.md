# ADR-0032：Repacku 的无头归档与顶层目录选择

日期：2026-10-13。状态：按使用者本次要求实施。

Repacku 沿用移植的扫描预设，最小单位是内部实际图集。`already/图集/图片` 的输出是
`already/图集.zip`。压缩包名称与内部是否保留同名目录是两个独立选择。

1. 新增 `preserveRoot`，默认 false；关闭时图片直接在归档根，开启时保留图集目录。
   `full`、配置压缩、`single-pack`、`gallery-pack` 均传到后端 `includeRoot`。
   已有计划的保存值在没有显式覆盖时保留；旧计划缺少字段时默认平铺。
2. 默认分析产物改放扫描根同级，文件名仍为 `<扫描根名>_config.json`。本目录及直接子目录的
   默认生成配置名在扫描和压缩清单里排除；普通 JSON 文件仍可打包。
3. 保留扫描、决策与清理逻辑，压缩使用 DSH `ctx.subprocess` 的 7-Zip 后端，添加 `-y`。
   不启动 PeaZip GUI；可复用 PeaZip 自带的 7z 可执行文件。`preserveRoot` 默认值声明在
   节点 `Config`，读取仍走 DSH settings，分析 JSON 是既有扫描计划数据。
4. 7-Zip `a` 更新已有 ZIP 时会保留旧条目，因此已有目标先在同卷临时目录重建，产物非空且
   后端成功后再替换，失败保留旧归档和来源。避免切换结构时保留旧目录项。
5. Windows PowerShell 兜底使用临时文件布局，保持根目录和嵌套相对路径。该分支有额外复制成本；
   当前只完成模拟验证，不宣称 Windows 实机通过。

实机证据与限制见 `docs/stages/repacku-silent-gallery-2026-10-13.md`。
