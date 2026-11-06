# M0：同一编辑器中的 AI 修改闭环

开始日期：2026-11-06，交付日期：2026-11-07。目标平台：macOS Apple Silicon。本地 a5-game-context 版本：3.8.272；仅构建本机 release，没有发布 npm、Git tag 或远程版本。

## 使用方式

安装本轮 cocos-agent 后，重新打开项目，在右侧终端的 + 中新建 Claude 或 Codex 会话。可以直接让它“读取我当前选中的节点，调整它的位置，查看修改后的画面并保存”。已有终端需要重新创建，才能获得本轮连接配置。

Orca 使用安装包内的 a5-game-context 启动 `cocos-editor` MCP，配置只包含编辑器的七个工具。配置按终端会话存放，不修改用户全局 Claude/Codex 配置，也不替换已有其他 MCP。普通 Shell、其他 Agent、远程主机和 WSL 不注入本地地址。

## 实际接口

| 调用                          | 当前行为                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor_context`              | 默认取得当前 Prefab/场景路径、文档 epoch/version/diskHash、选中节点、选中及顶层节点的世界包围盒、视口、最近五条错误和实际 Scene PNG。自动加入当前共享文档。 |
| `editor_snapshot`             | 获取共享文档树；`objects:true` 可读序列化对象与组件下标，`screenshot:false` 可省略图片。绑定模式的截图必须来自指定页面、指定文档和版本。                    |
| `editor_open`                 | 在绑定的同一页面切换显式路径；有未保存内容时拒绝切换。页面尚未完成切换返回 pending，不能假装已经打开。                                                      |
| `editor_apply`                | 复用现有原子 batch、预演与同步 Prefab 保护。用 `setProp` 改属性、`bindRef` 改引用；必须提供 `expectedEpoch`、`expectedVersion`。结构操作后须重读下标。      |
| `editor_undo` / `editor_redo` | 撤销/重做一个编辑组，同样要求刚读取的 epoch/version。                                                                                                       |
| `editor_save`                 | 必须额外提供 `expectedDiskHash`；基线或磁盘文件变化时拒绝覆盖。沿用现有保存格式和原子文件替换。                                                             |

这是产品方案中当前上下文、严格截图、document.apply/save 的第一批映射；没有新增第二套通用 API 服务。原来的未绑定工具保留兼容路径。批量跨文件 Prefab Apply/Revert、Play 和实例回收不在这批范围内。

## 同一实例和新鲜度

- 编辑器每次启动生成独立 instanceId；页面每次加载生成 viewId。页面在已有 WebSocket 上报文档、选择和视口，关闭连接立即移除状态。
- Orca 标签 URL 带工作区标识。启动终端时必须唯一定位该工作区的页面；找不到、多个页面或旧服务不支持时明确报错。
- 会话配置固定程序绝对路径、项目、服务地址、instanceId、viewId。MCP 首次连接验证项目、服务实例、协议和程序版本。失败不会寻找 PATH 程序，也不会另起编辑器。
- 截图回执携带 instanceId、viewId、epoch、version、时间和 `kind:editor`。文档、选择、视口在捕获中变化，或场景尚未画到指定版本时返回错误；移动/缩放视口还在等待布局时也不返回旧几何数据。
- 服务端在应用写入的同一文档锁内确认指定页面仍在跟随目标文档，随后校验版本，防止 AI 向用户已经离开的文档写入。
- 页面刷新或服务重启后，需要新建终端重新绑定。MCP 自身断开重连仍读取该会话固定配置。原会话不会静默改连其他实例。
- 上下文默认不返回整棵树或编译诊断全文：最多 64 个几何节点、五条错误，每条最多 500 字符，提供截断标识。错误范围是本页面会话；世界坐标 Y 向上，屏幕坐标是 Y 向下的 CSS 像素。
- 连接 token 只写在当前用户可读的会话配置中，绑定模式工具结果不返回 token 或带 token 的 URL。

## 验证与交付

验证使用隔离的临时项目和无界面 Chrome，未修改用户 WPTG 项目，未打开或切换用户桌面窗口。测试图片为 Scene canvas，不包含编辑器菜单和 gizmo；它与选中节点、视口和世界包围盒共同构成证据，不代表 Play 或游戏业务验收。

可复现的核心用例是 GitNexus `context-engine/native-engine/tests/editor_bound_context.rs`：设置 `EDITOR_E2E=1` 后运行真实 MCP stdio 子进程 + WebSocket + Cocos 渲染页面，Chrome 视口 1440×900、DPR 2。覆盖选中节点、修改文字/位置、修改 Button 节点引用、PNG 回看、保存回读，以及缺少版本、过期版本、外部磁盘冲突、错误实例、页面关闭、同页切换文档和拒绝修改已离开的文档。

本轮验证结果：

- Orca 类型检查与完整桌面构建通过；相关六个测试文件 39 项通过。最终调整 Claude 参数后，两个启动测试文件 11 项再次通过；修改文件的格式、静态检查通过。
- 本机 Claude 2.1.319 验证了 `--mcp-config=<路径>` 不会吞掉后续位置参数；Codex `mcp get cocos-editor --json` 正确读取会话级程序、参数和绑定文件配置，未写用户配置、未调用模型。
- GitNexus JS 单元 248 项、集成 91 项通过；原生全量分两段执行，共 1674 项通过、12 项忽略、2 项历史凭证门禁失败。另显式启用浏览器验证，相关 16 项通过。
- 两个失败是 `resource_review_foundation::capability_ledger_has_no_unclassified_entries` 的旧源码哈希，以及 `resource_review_gates::resource_review_contracts::cap21::tests::unit_integration_native` 的旧 3.8.267 收据。核对发现本轮开始的 HEAD 3.8.271 已与凭证不符，11 月 6 日原有开发日志也记录了这两个失败。本轮未篡改历史凭证，也不宣称全量回归全绿。
- 原生测试使用包内的 LadybugDB FTS 扩展目录，避免上游扩展下载地址 404；没有修改数据库代码。

实际测试同时发现并修复一个保存状态问题：AI 保存成功后，服务端现在向跟随页面发送 `documentSaved`，清除匹配版本的脏标记，因而可以继续切换 Prefab，同时保留当前选择。

安装包内实际 launcher 回报 `a5-game-context 3.8.272`，以它启动的真实 MCP 通过同一核心浏览器用例。此用例的服务端是同源码 Rust 测试 fixture；包内 212 个编辑器页面文件与测试版本逐文件哈希相同。安装包内终端宿主的 PTY 自检和 macOS 签名完整性校验通过。

证据：[回执](evidence/m0-2026-11-06/receipt.json)、[修改前 PNG](evidence/m0-2026-11-06/before.png)、[修改后 PNG](evidence/m0-2026-11-06/after.png)。文字从 BEFORE 变为 AFTER，子节点 X 变为 80，Button target 保存为该子节点引用；截图与磁盘数值分别验证。

本地安装包位于 Orca `dist/`：

- `cocos-agent-1.4.214-local.1793977277057.6abc0603e495-arm64.dmg`，SHA-256 `fa6e3e47d7b93af4fab2d68b1cb1df3264e06becde844d0ada6bea7f45024d09`。
- 同名 `.zip`，SHA-256 `54bbb96bd654a7690717a0cdefa9e0e4644b3c8cb010d02e334f8f063a69dba0`。
- 内置引擎包 `a5-game-context-3.8.272-darwin-arm64.tgz`，SHA-256 `894fa8f989eb448070bf4eee367a3ee0f6250762f76d48055c80049310143e29`。

沿用现有内部 ad-hoc 分发方式；未替换用户正在运行的 `/Applications/cocos-agent.app`，未提交或 push。安装后退出旧版再启动，重新打开项目并新建右侧 Claude/Codex 终端。页面刷新或编辑器重启后同样需新建会话。磁盘空间足够，本轮没有执行清理。

Claude/Codex 的配置注入在 Orca 启动层验证；本轮没有让真实云端模型自动规划一次美术稿任务，也没有以此声称完成用户桌面人工验收。参考图自动比较、复杂业务绑定验证、多项目性能、浏览器 Play、实例预算和其他平台仍是后续工作。
