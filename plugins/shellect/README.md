# Shellect

Shellect 是 Xaihi 的 Cordis 标准服务、系统文件动作管理节点和 npm CLI。无需安装 Electron 桌面端：把 npm 包装进 DSH 命令行宿主，其他插件通过 `ctx.inject` 注册动作，系统菜单调用同一个服务。

## npm 与系统入口

发布包包含后端服务、前端管理面板、`shellect` CLI 和自己的原生适配器资源；没有仓库路径、私有 SDK 运行依赖或第二个 DSH runtime。动作提供者仍需在 DSH CLI/web 宿主里启用并保持宿主运行。当前不会在菜单点击时自动启动宿主。

```sh
npm install -g @hibernalglow/xaihi-shellect
shellect --help
shellect menu install --output /absolute/persistent/menu-dir --endpoint http://127.0.0.1:3199
shellect catalog --platform darwin --endpoint http://127.0.0.1:3199
```

上面的安装包版本以实际发布为准；本仓目前为 `0.0.0`，可先 `pnpm --filter @hibernalglow/xaihi-shellect pack`，再安装生成的 tgz。本仓测试宿主只用 `pnpm plugin:add file:/absolute/path/to/Xaihi/plugins/shellect`，不手敲裸 dsh。

`menu export` 只导出；`menu install` 经 DSH 标准设置保存明确的目录与 endpoint，再进行用户级注册；`menu uninstall --endpoint URL` 清除该 profile 的安装绑定并撤下入口。离线 Windows 卸载加 `--source` 指向保留的导出目录；在线卸载使用 `--endpoint` 清除 DSH 安装绑定。macOS 安装后资源复制进 `~/Library/Services/Xaihi Menu Services.app`，不需要保留导出目录；Windows/Linux 入口引用导出目录，必须保留。CLI 安装后，注册和配置变更会自动同步。更新只替换识别为本项目的入口，其他用户菜单不动。离线 `menu uninstall` 只撤产物，需在 DSH 设置清除 nativeMenu 绑定以防宿主再次注册。

- Windows：HKCU Explorer 菜单，单选；Windows 11 可能在“显示更多选项”里。
- macOS：Finder Services，npm 包携带 ARM64 / x86_64 预编译服务入口，要求 macOS 14+。源码出口可用 Swift 编译。Intel 目前只编译验证。
- Linux：Nautilus scripts / Dolphin services，系统需提供 zenity 或 kdialog；其他文件管理器显示安装能力限制。

系统菜单显示各提供者的动作名称，例如 Finder 的“Xaihi · 解散文件夹”。点击即传 `dissolvef.direct` 进入预演确认；没有 Shellect 总入口或二次选择框。Windows 使用用户级菜单组（组名称可配置）与逐动作子项；Nautilus 的 Xaihi 脚本组与 Dolphin 的逐动作服务也使用提供者名称。动作排序用于生成声明，最终显示顺序受文件管理器影响。

## 节点与配置

工作台的 Shellect 节点提供 Windows/macOS/Linux 三个平台的动作目录：平台启用、Windows 菜单组名称、动作显示开关、动作名称和排序；提供者卸载后仍可管理保存的配置。数据全部来自 DSH 标准设置 `Config.platforms` 与 `Config.nativeMenu`；自定义 UI 用于显示运行中的动作注册与提供者状态，这些不是自动配置页能表达的静态字段。标准自动配置页继续可用。

保存携带 `expectedRevision`，只用 `ctx.settings.mutate` path ops；不创建额外配置文件。冲突显示旧版本/当前版本并读回最新值，CLI 返回结构化 `status: conflict`、退出码 2。平台配置变化会使旧预演票据失效。

```sh
shellect configure --platform win32 --id dissolvef.direct --enabled false --expected-revision 0 --endpoint http://127.0.0.1:3199
shellect reset --platform win32 --id dissolvef.direct --expected-revision 1 --endpoint http://127.0.0.1:3199
```

DSH 内嵌工作台通过现有消息桥转发 `settings/document-updated` 后回读，无新 SSE。独立 HTTP 文档和旧面板载体未提供通知时，界面会显示“外部修改后请刷新”，保留手动刷新按钮，不假装订阅成功。注册/卸载提供者后可刷新界面目录；已配置本机菜单会自动同步。管理界面显示未安装/同步中/已安装/错误，并可手动重试同步。

## 提供动作

服务名 `xaihiShellect`。SDK 用于开发并内联进提供者发布包，不能留作 profile 的私有运行依赖。

```ts
import type { Context } from '@deepseek-ai/cordis'
import { SHELLECT_SERVICE, type ShellectService } from '@hibernalglow/xaihi-sdk'
export function apply(ctx: Context) {
  ctx.inject([SHELLECT_SERVICE], scoped => {
    const shellect = scoped.get(SHELLECT_SERVICE) as ShellectService
    return shellect.register({
      id: 'demo.inspect', nodeId: 'demo', title: '查看选中目录',
      selection: 'directories', mutates: false,
      platforms: ['win32', 'darwin', 'linux'],
      preview: async paths => ({ success: true, message: `查看 ${paths.length} 个目录` }),
      execute: async paths => ({ success: true, message: paths.join('\n') }),
    })
  })
}
```

返回解除登记函数，使登记随 Cordis fiber 释放；旧 disposer 不会误删同 ID 的新提供者。提供者应保证 preview 无副作用，服务不能替第三方代码保证这一点。执行既有节点使用 `xaihiNodeRegistry.run`，沿用账本与结果。

## 原生协议

复用 DSH `webServer.register` 的 `/xaihi/shellect/actions`：GET 读取有效动作；POST `prepare` 验证本地绝对路径/选择类型/父子重叠，返回五分钟一次性 ticket；确认后 POST `execute` 重验提供者、平台配置和路径，串行执行。`mutates:true` 动作原生确认框默认取消。

POST 带 `Content-Type: application/json`、`x-xaihi-menu: 1`；平台头 `x-xaihi-platform`。只接受 loopback peer/Host，拒绝 Origin/Fetch Metadata，64 KiB 请求上限，不开放浏览器 CORS 写入。空/非 JSON 响应会说明具体 URL 与 HTTP 状态。headless 无 webServer 时保留 Cordis 服务，不自建服务器。ticket 上限 256，队列只约束本服务调用，不给外部写入提供文件锁。

源码原生入口位于 `desktop/system-menu`，构建时把自有资源装进 `lib/native`；npm 产物不引用 `desktop/`。macOS 包发布前需在 macOS 构建并确认两个架构的 helper 都在 tgz 中。
