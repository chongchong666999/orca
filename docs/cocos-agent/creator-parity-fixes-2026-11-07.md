# Creator 对照缺陷修复：实施记录

2026-11-07。状态：9 项实现完成，定向回归通过，macOS arm64 release 已生成；未安装、未提交、未推送。对应 [9 项审计清单](creator-parity-audit-2026-11-07.md)。

## 工作分支与范围

Orca 从 `dev/0.1.0`、GitNexus 从 `feature/node-editor-view` 分别创建 `codex/creator-parity-fixes-20261107`。保留原工作区已有修改，没有重置、提交或推送。基线与修改前补丁存放于 `/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/`；最终包从当前工作区构建，不能声称只含干净 HEAD。

## 修复清单

| 编号 | 本轮行为                                                                                                                                                            | 主要文件                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| F01  | Stop/Quit 先提交输入框草稿，再检查全部脏文档；保存／取消／放弃三选一；确认期间版本变化、磁盘冲突拒绝关闭。普通关闭可清理正在运行的 Play，自动回收仍拒绝脏或忙实例。 | Orca `cocos-editor-close.ts`、`cocos-editor-quit.ts`、`cocos-editor-service.ts`；native `shutdown.rs`、`protocol.rs`、`server.rs` |
| F02  | 多行输入在 Save/Undo/Redo 与关闭前提交，等待中文输入完成和异步 setter；文档切换后不把延迟保存发给新文档。                                                           | Web `client.ts`、`components.ts`、`inspector.ts`                                                                                  |
| F03  | 节点拖放携带项目、文档、epoch、稳定身份；按当前对象图解析引用并带版本，拒绝跨文档、裸下标和错误组件类型。                                                           | Web `node-reference.ts`、`tree.ts`、`components.ts`；native `protocol.rs`                                                         |
| F04  | 数组新增项由声明类型初始化；数值 0、引用 null、枚举首项、普通对象构造默认值，保留原元素与一次撤销事务。                                                             | Web `components.ts`；native `document.rs`、`protocol.rs`、`editor-runtime.html`                                                   |
| F05  | 编辑器模式允许缺失同步源降级显示，并保留磁盘 UUID/同步信息；正常兄弟节点继续加载，Play/构建不会因此自动获得同样容错。                                               | native `preview.rs`、`editor-runtime.html`                                                                                        |
| F06  | Play 选择以 current／UUID 表达，固定场景不跟随页面切换；资源变化刷新候选，重命名保持身份，删除后提示不可用。                                                        | Web `play.ts`                                                                                                                     |
| F07  | 组件声明的局部范围参与点选、框选及轮廓；不改节点 contentSize、Rect 控制器或 AI 节点包围盒。                                                                         | native `editor-runtime.html`；Web `camera.ts`、`scene.ts`                                                                         |
| F08  | 资源搜索按请求身份接收结果、错误与 loading；清空、刷新及销毁使旧请求失效。                                                                                          | Web `assets.ts`、`app.ts`                                                                                                         |
| F09  | Play 错误保留 stack/message，支持跨窗口 Error 与循环对象，限制单条长度，保留原 console 调用。                                                                       | native `play-editor-bridge.js`                                                                                                    |

## 关闭保护的边界

生命周期端点返回文档状态的 revision。关闭时在同一活动锁内核对 revision 与 dirty；保存复用既有 expectedEpoch/version/diskHash 防护。保存多个文件不是跨文件原子事务：若前一个已保存、后一个冲突，服务保持运行并提示处理冲突；下一次保存使用新请求身份，后续修改不会命中旧成功回执。无人连接的脏文档也不再被普通空闲超时自动丢弃。

尚未 Apply 的资源导入设置要求用户先 Apply 或 Revert，避免把“场景已保存”误当作“所有资源设置已保存”。保存失败或确认期间有新修改时不强制退出。外部启动的服务不由 Orca 终止。

## 验证与交付

### 验证口径

| 覆盖项   | 已执行的验证                                                                                                                                           | 仍不包含的证明                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| F01、F02 | 后端脏文档拒绝、版本冲突、磁盘冲突、部分保存后重试；Orca Stop／Quit 调用链测试；真实无头 Chrome 保持多行文本焦点，提交后关闭服务、重开并核对文本与画面 | 本轮没有操作 Orca 的系统保存对话框；中文输入法由组件事件测试覆盖，未在真实输入法中输入 |
| F03      | 跨文档／过期身份拒绝、同文档引用、组件类型校验的组件和协议测试                                                                                         | 尚未做两个实际窗口之间的鼠标拖放                                                       |
| F04      | 类型元数据、空数组、数值／引用／普通类默认值及对象图结构测试                                                                                           | 尚未逐个实际项目自定义类型对拍                                                         |
| F05      | 原生导入与运行时测试；真实 Chrome 覆盖源文件与 meta 同缺、meta 残留、精简实例，验证健康节点编辑保存、引用保留、源恢复后重开                            | 不推断所有损坏文件可恢复，不修改磁盘 UUID 来隐藏问题                                   |
| F06      | 列表增删／重命名／current 与固定场景测试；真实 Chrome 打开 Play、刷新、关闭与服务停止                                                                  | 不等于真实 WPTG 游戏全流程验收                                                         |
| F07      | 组件边界、变换、禁用条件与拾取／框选的运行时和模块测试                                                                                                 | 没有与原版 Creator 做逐像素或复杂组件视觉对拍                                          |
| F08      | 并发请求逆序返回、清空、错误、销毁测试                                                                                                                 | 没有真实远端网络延迟验收                                                               |
| F09      | 执行真实桥接源码，验证 Error、跨窗口 Error、循环值、长度限制和原 console 调用                                                                          | 尚未在 WPTG 真实游戏里触发 Promise 拒绝                                                |

真实浏览器使用隔离小工程和无头 Chrome，固定视口，不读取或改写用户的 WPTG 项目。另跑现有绑定 MCP 闭环：读取当前文档与选择、修改、取得同版本截图与数值、保存，避免只证明页面本身能操作。

第一次真实 F05 验证暴露出“场景已能加载但缺失源提示未出现”，因此 VM 通过没有直接算最终通过；保留失败日志，并以修复后的真实引擎结果为准。三种真实引擎场景已通过。

截图和日志存于 [fixed 证据目录](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/fixed/)。其中 `before.png`／`after.png` 来自 MCP 修改闭环，`close-reopened.png` 展示关闭重开后的中文多行文本。它们不是原版 Creator 截图，也不是本轮 Orca 全应用重启截图。

### 最终定向检查

- Web：21 个文件、236 项通过；运行时专项 4 个文件、10 项通过。这两组有重叠，不相加作为唯一用例数。F05 最终 VM 专项另为 4/4。
- Rust release：`editor_bound_context`、`editor_browser_play`、`editor_close`、`editor_protocol`、`editor_server`、`editor_structure` 共 80 项通过。显式设置 `EDITOR_E2E=1`，其中包括 5 个真实浏览器行为用例和 3 个 HTTP 传输辅助用例；没有把默认跳过 E2E 算作浏览器通过。
- Importer：缺失引用、冻结实例、覆盖导入与重新导入、循环引用四项定向回归通过。
- Orca：服务／退出相关 19 项通过；`tc:node`、相关代码格式与 lint、`build:desktop` 通过。没有对本轮原生保存弹窗做可见桌面测试，也未重复之前已记录的整应用白屏重启验收。
- `git diff --check` 通过；构建中现存 Rust 未使用项警告仍存在，没有声称全仓零警告或全量 CI 通过。

前述测试证明修复覆盖到的输入和时序。数组类型默认值依赖属性类型元数据；旧的、不带 `element` 的 `resizeArray` wire 调用仍保留兼容路径，外部调用者需要使用新类型参数才能取得同样默认值语义。

### 产物

- [DMG 安装包](/Users/free/Documents/work/orca/dist/cocos-agent-1.4.214-local.1794018702277.d156c8576139-arm64.dmg)：328,318,362 bytes（约 313 MiB）。
- [ZIP 包](/Users/free/Documents/work/orca/dist/cocos-agent-1.4.214-local.1794018702277.d156c8576139-arm64.zip)：333,957,547 bytes（约 318 MiB）。
- [应用目录](/Users/free/Documents/work/orca/dist/mac-arm64/cocos-agent.app)：版本 `1.4.214-local.1794018702277.d156c8576139`，磁盘占用 879,360 KiB（约 859 MiB）。
- 内置 `a5-game-context 3.8.276`，平台包 SHA-256：`0e3be5a3b18a285efe0c79b4f6a3ac0278ea45803a0ce84eb384d6531359870e`。
- DMG SHA-256：`64144ee5ff1273e5a3d81274141182c4cf22c2335c94068a4dee35f5bd292ded`。
- ZIP SHA-256：`6785497cf22976987454b9c88f60ecd191e60d2665a832886652d5199a422364`。

`codesign --verify --deep --strict`、固定内部身份检查、终端宿主实际 PTY 验证均通过。最后另用包内 `Contents/Resources/bin/a5-game-context` 执行现有真实 MCP + 无头 Chrome 闭环，1/1 通过：读取绑定上下文、修改、同版本截图、保存与冲突保护。该测试不是云端 Claude／Codex 模型自主生成 UI，也没有启动 Orca 可见窗口。

完整身份见 [artifact-identity.json](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/fixed/artifact-identity.json)，本轮 76 个当前工作区实现文件指纹见 [source-manifest.json](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/fixed/source-manifest.json)，日志见 [logs](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/fixed/logs/)。只生成 macOS arm64 release，未公开发布。当前运行中的 `/Applications/cocos-agent.app` 保持原安装，本轮没有后台替换它；新包需正常退出旧应用后安装。

## 磁盘与剩余验收

清理了 GitNexus `target/debug/incremental` 约 11 GB，保留源码、依赖与 release 产物；后续只构建 macOS arm64 release。没有修改真实钥匙串，也没有扩大签名权限。

真实 WPTG 大型项目、多项目总内存、原版 Creator 全界面对拍、Windows/Linux、远程宿主和手机端仍需独立验收；本轮不承诺与 Creator 完全等价，也不以 Rust 推断无卡顿。
