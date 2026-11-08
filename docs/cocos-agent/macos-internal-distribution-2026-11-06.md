# macOS 无证书内部分发与文件权限

> 2026-11-07 更新：本文记录旧方案。随机 Bundle ID 的 ad-hoc 包不能跨版本继承钥匙串访问身份，已改为免费、持久的内部自签名证书和固定标识。见 [启动、包体与预览更新](desktop-runtime-2026-11-07.md)。不需要购买 Apple 开发者账号；仍不是 Developer ID 公证分发。

2026-11-06。用户确认公司内部接受安装验证与文件访问授权，不申请或购买签名证书。继续采用打包工具自动完成的 ad-hoc 签名；Apple Silicon 运行原生代码仍需要这种最低限度的签名。

## 本次根因证据

macOS 的“允许打开应用”与“允许读取文稿”是两套检查。文件权限由 TCC 根据应用标识和代码身份识别；ad-hoc 构建的默认代码要求是该构建的 `cdhash`，无法跨构建共用。

本机三个历史包都使用 `com.a5labs.cocos-agent`，但代码要求不同：

| 内部构建                     | 主应用 cdhash                              |
| ---------------------------- | ------------------------------------------ |
| `1793950875656.7b9f96fd126c` | `ce58cd4c2810f2d4cb831d6aeb265f08c2e88e6a` |
| `1793963076678.5b89b9279b18` | `3f18bd46959e53d6f7538af259f8c706e554a4c5` |
| `1793968412079.5b89b9279b18` | `a0db494ad0c831a695211c7e498152a1875fc97f` |

22:08–22:18 的系统日志反复记录 `Failed to match existing code requirement`，服务为 `kTCCServiceSystemPolicyDocumentsFolder`，身份在第一、第三个包的 cdhash 之间交替。进程检查确认第一版的终端 daemon 仍在运行，Claude 会话又启动了第三版 app 中的 MCP。这解释了为何同一文件夹授权不断重复，而不只是升级后出现一次。

终端保留机制本来会保护尚在运行的 Shell/AI 任务。旧进程并非无条件可清理的垃圾；不能为了停止弹窗直接终止所有终端。用户手动停止新版 MCP 后，22:28 的最近三分钟日志已无相同匹配失败，旧 daemon 与 Claude 仍在。此记录只证明该观察窗口内未新增冲突，不代表以后重开旧包不会复现。

## 无证书方案

仅在 cocos-agent 的 macOS 打包配置中，为每次打包生成独立的 Bundle ID：`com.a5labs.cocos-agent.adhoc.b<随机构建标识>`。同一安装包中的标识固定，DMG 和 ZIP 装的是同一份 app；重新打包则获得新的系统权限身份。electron-builder 根据该标识生成 Electron Helpers 的标识，终端 host 仍按原有打包逻辑获取主应用标识。

应用名称、`package.json` 名称、用户数据目录和终端协议保持原值。已有项目、会话和设置不另建一份。Linux/Windows 的根 appId 仍是 `com.a5labs.cocos-agent`。没有放宽系统权限或代码身份校验，没有创建证书，也没有强制终止现存任务。

代价是新构建需要分别授权，系统隐私设置可能保留多个同名条目。这个方案解决内部构建共用权限记录的问题，不提供 Developer ID、公证或跨版本授权继承；内部包继续手动分发。将来采用证书时，需要重新决定统一的应用身份和迁移策略。

构建结束增加实际产物校验：深度签名校验通过，并确认 Info.plist 使用内部构建专用标识，防止配置被覆盖后重新产出会竞争同一权限记录的包。

## 验证范围

- 修改前：三个包的代码要求均为不同 cdhash；终端 host 均无法满足主应用的代码要求，按已有策略回退到 fork。没有绕过这项校验。
- 配置检查：两个独立打包配置实例获得不同 macOS 标识；产品名、数据目录所依据的包名、其他平台 appId、ad-hoc 和不公证策略保持一致。
- 实际 arm64 打包成功，打包钩子验证终端 host 实际完成一次 PTY 收发，深度签名检查通过。主应用、四个 Electron Helpers 和终端 host 的 Info.plist 与签名标识一致，均使用 ad-hoc 签名及此次构建的命名空间。
- DMG 校验、ZIP 完整性检查及两个 SHA-256 复核通过；只读挂载 DMG 核对后已卸载。DMG/ZIP 内的应用标识与已校验的 `.app` 一致，DMG 内主程序 cdhash 也一致。
- 本次只改打包配置和构建校验，未重复运行侧栏 UI 或全量类型检查。修改文件的 lint、format 及 `git diff --check` 通过。
- 原生系统弹窗需要用户交互，本次不在用户桌面自动启动可见窗口或点击系统授权。另一台 Mac 安装、完整“授权 → 重启 → 覆盖升级”流程仍待实际验收。

## 安装与使用

1. 将新包中的 `cocos-agent.app` 放到 Applications，后续从此处启动。
2. 系统拦截时在“系统设置 → 隐私与安全性 → 仍要打开”中确认；首次访问文稿等文件夹时按需允许。
3. 历史包仍共用旧标识。保存在旧终端中的任务结束后，使用会话管理的重启终端后台功能，或退出相关旧后台。新包不会替用户强行中止任务。
4. 公司受管电脑能否手动放行由设备策略决定。使用者无需开发者账号或签名证书。

## 本次产物与旧包清理

构建版本 `1.4.214-local.1793971831403.5b89b9279b18`，基线为 `5b89b9279b18`，包含此前侧栏修复及当前未提交的工作区修改。新 Bundle ID 是 `com.a5labs.cocos-agent.adhoc.bf94b68f456b94a768e75b5f32d62afdc`，主应用 cdhash 是 `c2ce65ac995e71b4b0448bf2464a459a4cc8cf97`。

| 文件（仓库 dist/）                                               | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `cocos-agent-1.4.214-local.1793971831403.5b89b9279b18-arm64.dmg` | `a04b3866a844475139a1b8a80254cbe22bde94fbc1f792683ca7df1bef28256b` |
| `cocos-agent-1.4.214-local.1793971831403.5b89b9279b18-arm64.zip` | `ad054e9659c9dc8b31738d3cc80a3ab6d76eb627845521745bc830a1d60d00f5` |

签名身份记录：`dist/cocos-agent-1.4.214-local.1793971831403.5b89b9279b18-privacy-identity.json`。构建、DMG、ZIP 日志分别为 `/tmp/orca-cocos-adhoc-privacy-build.log`、`/tmp/orca-cocos-adhoc-privacy-dmg.log`、`/tmp/orca-cocos-adhoc-privacy-zip.log`。

用户要求删除旧编译包后，清理 `1793948644249`、`1793950875656`、`1793963076678`、`1793968412079` 四批的 26 个安装包、校验文件、blockmap 与来源记录，共 6,731,669,533 字节。保留新包和当前 `dist/mac-arm64`。历史验收文档中的旧包路径因本次清理不再可下载。两个闲置安装盘正常卸载；`1793950875656` 的盘仍被旧 daemon/Claude 使用，系统返回资源忙，没有强制卸载或停止任务。删除文件的总大小不等于即时释放的磁盘空间，仍挂载的镜像可能继续占用空间。

清理明细在 `/tmp/orca-cocos-old-package-cleanup.json`。没有提交、推送或发布安装包。

参考：[Apple 安全打开应用说明](https://support.apple.com/en-us/102445)、[代码身份与权限](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)、[Apple Silicon 的 ad-hoc 签名要求](https://support.apple.com/en-au/guide/security/secebb113be1/web)。
