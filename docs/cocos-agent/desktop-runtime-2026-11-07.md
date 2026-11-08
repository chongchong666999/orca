# 启动身份、安装包与编辑器生命周期

2026-11-07。本轮对应四个实际问题：反复要求登录钥匙串密码、解压后超过 2GB、Play 仅在小面板显示，以及多项目常驻占用内存。macOS Apple Silicon 本地 release，初次交付内置 a5-game-context 3.8.273；后续重启修复为 3.8.275，见文末。没有发布公共版本。

## 启动密码

系统 `securityd` 日志确认弹窗针对 `cocos-agent Safe Storage`，当前运行路径在旧 DMG 内。历史访问规则绑定了多个不同的 ad-hoc `cdhash`，重新构建不能继承上一包的钥匙串身份。更换 Bundle ID 解决不了这个共用钥匙串项目的访问问题。

新包使用固定标识 `com.a5labs.cocos-agent.internal` 和免费、持久的自签名证书。产品名及用户数据目录仍是 cocos-agent。构建机自动准备独立签名钥匙串，在签名期间临时加入查找列表，签名结束撤回；不安装系统信任根，不删除用户凭据，不关闭 safeStorage 加密，不购买 Apple 开发者账号。

构建身份保存在 `~/Library/Application Support/cocos-agent-build/signing/`，目录权限 0700，配置与随机密码 0600。该目录不进入仓库或安装包。后续构建必须保留同一身份；换构建机应通过公司安全渠道迁移这份材料，不能公开分发私钥。身份文件损坏时构建失败，避免悄悄生成另一个身份导致反复授权。

验证使用单独临时钥匙串：第一个签名程序创建合成凭据，修改代码并重新编译、以同一证书签名后，第二个程序在 `SecKeychainSetUserInteractionAllowed(false)` 下成功读取，两个状态均为 0；临时钥匙串随即删除。它只验证普通代码身份 ACL，未覆盖现代钥匙串的 partition 检查，因此不能用它证明实际 Electron 升级后永久免授权。未操作用户真实凭据。

迁移旧 ad-hoc 安装时，普通应用 ACL 和 partition 可能分别要求“始终允许”；后续重新签名的内部安装包也可能再请求授权。第一次文稿授权需要用户确认。另一台 Mac 的 Gatekeeper 手动放行及公司设备策略依然适用。没有声称完成用户真实凭据的“授权 → 重启 → 再升级”验收。

原理依据：[Apple 对代码身份、指定要求和钥匙串访问的说明](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/AboutCS/AboutCS.html)。自签名满足内部身份连续性，不等于 Developer ID 或公证分发。

## 包体

旧 app.asar 误收进开发目录，单个 `.context-engine/native-engine.lbug` 占 1,280,540,672 字节，索引 state 占 119,283,579 字节，另有类型检查及测试缓存。主要膨胀来自这些开发数据。

打包排除 `.context-engine`、`.cache`、`.tmp`、`.anti-slop-plugin`、`test-results`、`playwright-report` 和开发用 `.mcp.json`，并在 afterPack 读取实际 asar 目录检查；任一项再次进入包就中止构建。项目索引同时加入 Git 忽略规则。内置编辑器、原生引擎、SDK、CLI 与原有终端能力保留。

## Play

点击 Play 同步创建独立浏览器窗口，异步完成准备后导航到运行地址；Orca 复用既有浏览器弹窗宿主，独立 Web 使用当前浏览器的新窗口/标签。不是打开已安装的原生 Cocos Creator，也不是启动系统默认浏览器的独立进程。

ready/log/error 消息核对来源窗口、origin 和 runId；收到实际 canvas ready 后才标记 running。Refresh 复用窗口并替换运行，Stop、关窗、取消准备和编辑器断开清理对应运行。弹窗被浏览器策略阻止时回退 Game Preview 面板，不丢掉 Play 功能。Prefab 编辑截图与游戏运行画面继续区分。

本轮不包含浏览器目的地选择菜单、宿主浏览器标签模式或远程主机隧道。这些保留在 [长期预览设计](browser-preview-design.md)。

## 多项目与内存

Orca 的本地已接入编辑器表最多 3 个，跨项目启动/停止串行化。打开第 4 个项目之前，按最近激活顺序寻找应用自己启动、干净且空闲的实例；先确认关闭，再启动新的。外部服务不被自动终止。

服务提供鉴权 `GET /editor/lifecycle`。真正关闭时再使用 `POST /shutdown?onlyIdle=1`，在服务端活动锁内检查，避免“刚查完空闲，另一个请求开始写入”的竞态。脏文档、Play、构建和正在执行的操作阻止回收；状态未知、鉴权失败、关闭未确认也不当作释放成功。所有候选受保护时提示容量不足，不偷偷开第 4 个。

回收释放实际浏览器 guest 和编辑器场景 iframe/canvas，标签及 Prefab 路径保留为暂停态。选择该项目时按需恢复，不由后台自动刷新重新拉起，AI 终端进程不被终止。

恢复后沿用同一 `cocos-view`，等页面注册再原子更新已有终端绑定。MCP 清除旧实例的连接和文档缓存；持有旧版本的修改返回 `EDITOR_INSTANCE_CHANGED`，重新调用 `editor_context` 后继续。旧版本中尚无稳定 viewId 的历史终端需要新建一次会话。明确连接拒绝的死记录释放名额，网络超时不冒充进程退出。

3 是本轮实例数量限制，不是总内存硬上限。a5 单进程缓存的 4 项目/估算 768MiB 预算是另一层；Chromium/GPU、AI 终端及大型项目仍会消耗内存。跨应用全局预算和大型真实项目进程树基准尚未交付，不能以 Rust 或实例数量推导“绝不卡顿”。

## 已完成的专项验证

- 签名：两个不同构建共享指定要求，并在禁止弹窗条件下读取同一合成钥匙串项目。
- Play：真实后台 Chrome 跑通 ready、刷新、关窗、内嵌回退、运行时拒绝回收、空闲回收和 iframe/canvas 释放。
- 服务：release 模式鉴权、脏文档、活动锁并发和运行时目录清理测试通过。
- Orca：初轮 4 文件 18 项生命周期/并发/恢复测试通过；补充绑定恢复和死记录处理后，3 文件 21 项测试、完整类型检查和 scoped lint 通过。
- MCP：保持同一真实 MCP 进程，在旧服务仍可响应时替换绑定，验证旧写入拒绝和新实例上下文读取；原有修改、截图、保存及冲突流程通过无界面 Chrome 验证。

所有运行验证使用隔离测试项目或隐藏浏览器，没有修改用户 WPTG 项目，也没有抢占桌面焦点。

## 首次 3.8.273 交付产物与边界

构建 `1.4.214-local.1794003980019.d156c8576139`，包含 Orca `d156c8576139` 与 GitNexus `902e1a5fb` 之后本轮工作区修改。仅 macOS ARM64。

| 项目                              | 实测                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| 旧应用普通文件总字节              | 2,283,967,588                                                                              |
| 新应用普通文件总字节              | 847,407,161，减少 62.9%                                                                    |
| 新应用磁盘分配量（本机 `du -sk`） | 880,240 KiB，约 901MB，随文件系统而变                                                      |
| app.asar                          | 1,445,005,533 → 8,341,240 字节                                                             |
| DMG                               | 328,239,544 字节                                                                           |
| ZIP                               | 333,931,961 字节                                                                           |
| 内置 a5-game-context              | 3.8.273；平台包 SHA-256 `780e5eb02d277e1116e816dbb6b6520d2e95afb748bdef00ee0dbfdbd03648e8` |

安装包位于仓库 `dist/`：

- `cocos-agent-1.4.214-local.1794003980019.d156c8576139-arm64.dmg`，SHA-256 `111658b3c7f8fbb0d2e2fd8994401c884e5c861cff4cbea9b29ba7b96824f43c`。
- `cocos-agent-1.4.214-local.1794003980019.d156c8576139-arm64.zip`，SHA-256 `8f3727b242c21dc384a3e9d663371bbaacfbce4014f2cff9f7372b9b9bfc2079`。

实际 .app 和只读挂载 DMG 内的 .app 均通过深度严格签名检查；指定要求包含固定 Bundle ID 和同一证书 leaf。DMG 校验、ZIP 完整性、两个散列检查通过，验证挂载已正常卸载。签名临时查找列表已恢复，只留下原有 login/openvpn 钥匙串条目。

最终 Orca 定向回归为 5 文件 25 项全部通过。实际包内 MCP 启动器另外通过真实 stdio + 无界面 Chrome 的 Prefab 修改、截图、保存、冲突和同进程重新绑定验证。打包钩子验证原生终端 host 完成 PTY 收发。当前没有执行可见 Orca 桌面、多大型 WPTG 项目总内存或另一台 Mac 权限升级验收。

新版已复制并校验到 `/Applications/cocos-agent.app`，没有自动启动。先结束旧版任务并退出 DMG 中的旧版，再从应用程序目录启动新版；首次迁移遇到系统钥匙串确认时选择“始终允许”。旧版本尚无稳定 viewId 的终端需新建一次 Claude/Codex 会话。

日志：`/tmp/cocos-273-release-build.log`、`/tmp/cocos-273-tests-final.log`、`/tmp/cocos-273-packaged-mcp.log`、`/tmp/gitnexus-browser-play.log`。没有提交、推送、公开发布或停止用户旧版会话。

## 后续：同包密码验收与跨应用重启恢复

用户报告 7.55.53 每次启动都要求密码后，分别核对真实 securityd 记录与隔离 Electron 43.8.6：07:57 普通应用权限点了 Allow，随后 partition 权限才点 Always Allow；08:03 的下一进程再次请求普通应用权限，08:03:57 选择 Always Allow。用户随后实际退出并重开同一安装包，明确确认不再弹窗。这是用户执行的同包重启验收，不能冒充已验证未来升级免授权。

使用现代 v512 隔离钥匙串、合成数据及禁用交互的真实 Electron 测试：同包重启和复制改名通过；同证书重签后 CDHash 改变，partition 检查拒绝；仅补齐该合成项的授权后再次两次启动通过。构建时即使禁用 timestamp，CMS signingTime 仍使嵌套库文件哈希变化，逐层影响顶层 CDHash；普通启动不会重签。保留现有签名和加密，不加入生产 ACL 修改工具，不读取、删除或重置用户凭据。

对应实现依据：[Apple partition 身份选择](https://github.com/apple-oss-distributions/Security/blob/main/securityd/src/clientid.cpp)、[Apple ACL 校验](https://github.com/apple-oss-distributions/Security/blob/main/securityd/src/acls.cpp)。脱敏证据 `/tmp/cocos-electron-keychain-proof/evidence.json`；隔离进程、应用和钥匙串已清理。

AI 断连另有独立原因：旧终端保存 50557 端口，重启后界面服务已换到 53421；旧 MCP 仍来自先前 DMG，内存注册表在 Orca 退出后丢失，恢复标签又产生新的 viewId。只修复同一次应用运行中的暂停恢复不足以覆盖这个问题。

新实现把 project/workspace/view 所属关系持久化，跨进程从私有 session 目录重新发现；原页面身份和当前文档随标签恢复。macOS/Linux 的会话配置使用 userData 中固定启动器，应用启动和新建会话时更新到当前内置二进制，不依赖 PATH 或旧 DMG。Windows 保留现有直接可执行入口，本轮只交付 macOS ARM64。

MCP 继续核对项目、实例及页面身份，但兼容性改为协议 6 与 context/versioned-write/strict-capture 能力检查，不再因补丁号不同拒绝。上下文同时返回 mcpVersion/editorVersion；旧写入前提不能跨新实例复用。没有 workspaceId 的旧 272 会话不自动猜归属，需要一次性新建侧栏 Claude/Codex 会话。

已通过真实 stdio 验证：3.8.275 MCP 连接用户当前 3.8.273 编辑器并读取 Lobby.fire；此外使用该已运行实例执行 editor_open，打开用户请求的 Lobby.fire，状态为 dirty=false，没有新起替代服务或写项目文件。该验证发生在用户随后重启之前，不表示之后旧 272 会话已被热升级。

恢复失败后可通过重新选中编辑器、菜单入口或错误提示里的重试按钮重新绑定；不靠后台循环无限重开。恢复中关闭文档会保留空文档，不把之前捕获的路径重新带回来。绑定发现带 workspaceId 与既有 viewId，支持同项目多个页面精确恢复；新建会话未指定页面时仍拒绝歧义。旧配置提示每个项目每次应用运行仅出现一次。

最终源码检查：Orca 6 文件 33 项专项回归、完整类型检查、scoped lint、格式及 diff 检查通过；Rust 的补丁兼容与多页归属回归均先失败后通过，真实 stdio/Chrome 编辑保存流程通过。没有运行可见 Orca 桌面自动化、全仓所有测试或大型多项目内存基准。日志 `/tmp/cocos-recovery-followup-final-tests.log`、`/tmp/cocos-recovery-followup-final-tc.log`、`/tmp/cocos-binding-compat-green.log`、`/tmp/cocos-binding-view-green.log`、`/tmp/cocos-275-mcp-tests.log`。

### 3.8.275 最终安装包

构建 `1.4.214-local.1794007377240.d156c8576139` 已复制到 `/Applications/cocos-agent.app`，实际目标目录和源目录都通过深度严格签名校验；安装后的启动器报告 a5-game-context 3.8.275。未自动启动或覆盖正在使用的 `/Applications/cocos-agent 7.55.53.app`。

- 应用普通文件总大小 847,344,657 字节，app.asar 8,342,975 字节。
- DMG：`cocos-agent-1.4.214-local.1794007377240.d156c8576139-arm64.dmg`，328,269,812 字节，SHA-256 `21037c540e3a984af5d445eb20ead2fbb39febd832e667a02179fc436fc4e209`。
- ZIP：`cocos-agent-1.4.214-local.1794007377240.d156c8576139-arm64.zip`，333,913,666 字节，SHA-256 `936e016c900b82c954b1bf6b2f5450e4c8c87810faceddf90bd7ae9fcac2550d`。
- 内置平台包 SHA-256 `7dc8569133922803ba3f454052f9c69dcfa1e7f9a9502b85b9fabfc30dad9661`。

最终包内真实 MCP + 隔离 Chrome 的编辑、截图、保存、冲突及重新绑定验证通过（2 项测试，包括 HTTP 请求回归）；DMG 校验、ZIP 完整性、产物散列检查通过。日志 `/tmp/cocos-275-release-final.log`、`/tmp/cocos-275-packaged-mcp-final.log`、`/tmp/cocos-275-dmg-verify.log`、`/tmp/cocos-275-zip-verify.log`。中间构建的 DMG/ZIP 已清理，保留当前交付与前一版本回退包。

使用时退出旧 app，从 `/Applications/cocos-agent.app` 启动，再在右侧新建一次 Claude/Codex 会话。新安装包首次仍可能需要系统授权；同一包后续启动不需要反复授权的结论来自用户实际复测，不外推到未来重签更新。没有提交或推送。

## 页面恢复白屏修复

原恢复路径先销毁保留标签的 webview，再更新 URL；页面挂载 effect 不因 URL 改变而重新执行，因而页面被移除后不会重新创建。现在只更新现有页面 URL，让浏览器自身的导航逻辑切换到新服务；真正回收或关闭时仍释放 webview。

隔离 Cocos 2.4 项目使用后台 Orca 启动、连接真实打包的 a5-game-context 编辑器、退出应用、再启动并恢复原有 viewId；新端口的编辑器页面包含节点面板，并从隐藏 renderer 使用 CDP 截图确认工具栏、节点树、资源面板显示。单元回归先失败后通过，专项 9 项、完整类型检查、scoped lint 通过。该测试使用隔离项目，不代表已经在用户 WPTG 项目手动复验。首轮隔离测试因 Electron 包装器启动超时失败，改为使用包内原生二进制并显式指定包资源后通过；中间调试版本的截图检查未能取得结果，不计通过；最终改用 Playwright CDP 截图。

修复版 `1.4.214-local.1794008940775.d156c8576139` 已安装到 `/Applications/cocos-agent.app`，完整签名校验通过；DMG `cocos-agent-1.4.214-local.1794008940775.d156c8576139-arm64.dmg`，SHA-256 `dfb46fdfc9bfa8b6c0951c2bb29bb0435c8698baaed1c70ab79b980105251845`。用户授权后关闭了旧应用进程。日志 `/tmp/cocos-white-unit-red.log`、`/tmp/cocos-white-unit-green.log`、`/tmp/cocos-white-restart-visual.log`、`/tmp/cocos-white-release.log`。
