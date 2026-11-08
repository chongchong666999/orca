# 92 项目编辑器恢复验收

2026-11-08。已构建并安装 macOS arm64 本地 release；未提交、未推送。

## 修复

- 内置引擎从安装版 3.8.275 更新为 3.8.279，并固定平台包哈希。复用 GitNexus 工作区已有的真实项目 Profile 读取和编辑器内部消息隔离修复：前者处理 `LanguageData.js` 的 `data` 错误，后者阻止编辑器消息进入项目 `NativeEvent.webCcjsCallback`，避免 `isJSONString` 错误。没有修改 AsiaPoker 业务源码或屏蔽其错误日志。
- 在 renderer 入口显式安装编辑器恢复订阅；恢复判定也覆盖项目归属信息迟于选中页加载的情况。继续复用已有文档路径、viewId 和服务绑定更新逻辑。
- 修复 beta 包的 `CFBundleName` 与可执行文件、Helper 名称不一致造成的 `Unable to find helper app` 启动崩溃。

## 安装与真实验收

- 安装位置：`/Applications/cocos-agent-beta.app`。
- 原安装备份：`/Applications/cocos-agent.previous-20261108.app`。
- 版本：`1.4.214-local.1794094603077.d156c8576139`；内置 `a5-game-context 3.8.279`。
- DMG：`dist/cocos-agent-beta-1.4.214-local.1794094603077.d156c8576139-arm64.dmg`。
- 对实际安装应用使用后台 Electron/CDP 验收，不激活或显示窗口。真实用户配置中的 AsiaPoker 自动恢复至 `assets/bundles/texas-common/prefabs/actionReview/ActionReviewTip.prefab`。
- 两次独立启动均有节点树、编辑器画面、`__a5Editor.ready=true` 和场景运行时；退出后服务端口从 56588 更新到 56845，不再沿用失效的旧端口。
- 两次场景运行时的 `__a5PrefabPreview.scriptErrors` 均为空。此前另外用 3.8.279 打开真实 `spine_fold.prefab`，页面异常及目标 Console 错误也为空。
- Profile / 内部消息隔离浏览器回归通过；初次定向 Orca 检查 52 项通过，最终恢复相关检查 9 项通过。打包类型检查通过，最终安装包严格签名校验通过。

证据目录：`/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-08-asia-recovery/`，包含安装版两次启动结果、隐藏窗口截图和最终构建日志。

## 边界

隔离 E2E fixture 的第二次启动丢失了全部工作区状态，未通过，不能算作恢复成功的证据；以上恢复结论来自真实安装版和真实用户配置。没有执行全量 CI、全场景或游戏 Play 验收，也没有验证所有平台。安装包包含两个仓库已有工作区修改，不是干净提交产物。

项目原有组件声明警告仍显示。旧终端守护进程可能提示安装来源变化；本次保留已有终端会话，没有为了消除提示终止它们。钥匙串与签名授权策略未做额外变更。
