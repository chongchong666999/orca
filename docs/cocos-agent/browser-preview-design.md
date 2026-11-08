# Play 浏览器预览体验

状态：长期设计稿，2026-11-06。2026-11-07 已实现第一步：同步打开独立浏览器窗口，支持 ready、日志、停止、刷新、关窗清理及弹窗受阻时内嵌回退，见 [实现记录](desktop-runtime-2026-11-07.md)。在 Orca 使用现有浏览器弹窗宿主；下文的应用内标签、系统浏览器选择、预览票据和远程支持仍是后续设计。

实施顺序后置于 [产品总方案](ai-cocos-product-plan.md)的同页观察和 UI 修改闭环。第一批可沿用当前 Prefab Scene 的截图通道，不等待独立浏览器 Play 改版；本文是后续专项设计。

## 2026-11-06 基线

GitNexus `5d7911f017`，`context-engine/editor-web/src/play.ts` 的 `mountPlay`：点击 Play 后 POST `/project/play`，拿到运行地址，在 Game Preview 面板创建 iframe；通过 `a5-play` 消息接收 ready/log/error。服务端 `editor/play.rs` 用 session/runId 管理游戏运行；`status` 返回 booting 并不意味着画面已就绪。

当前场景（包含编辑中的未保存内容）和 Prefab 返回栈中的场景可以形成 stash 参与 Play；其他场景从磁盘读取。预览依赖浏览器执行引擎和脚本。headless 文档编辑本身不会产生可验证画面。

## 目标流程

点击 Play 就能看到浏览器中的游戏，不需要用户复制 URL 或寻找编辑器底部面板。

- 独立 Cocos Web：默认打开**系统浏览器的新标签**。
- 内置于 Orca：默认打开**Orca 的独立浏览器标签**，右侧 AI 终端保持可用；该标签是完整游戏视口，不是编辑器内的小 iframe。
- Play 旁的小菜单可选“应用内浏览器 / 系统浏览器 / 内嵌 Game Preview”，记住每个项目的选择。独立 Web 未连接 Orca 时不提供应用内选项。
- 普通点击为 start/stop，重复 start 聚焦已有预览，不新建重复运行；Refresh 明确重新启动游戏，不能描述为保留游戏状态的热更新。
- 打开 Prefab 时不把 Prefab 当 scene 跑。默认使用明确的 previewScene；没有场景时要求选择。Prefab 的编辑画面通过 Scene capture 查看，Play 验证它在游戏中的运行效果。

Orca 中“打开浏览器”由宿主桥处理：只接受当前编辑器实例返回、验证归属的 http(s) 预览地址；远端 loopback 先经过现有隧道/代理，不把服务器 localhost 当作用户电脑 localhost。绝不把 editor 管理 token 放进公开预览链接。

## 生命周期与反馈

`idle → preparing → openingBrowser → booting → running → stopping → stopped`，任一步都可以 `failed`。`running` 必须来自目标 runId 的浏览器 ready 回执，且 canvas 非零；请求 HTTP 200 只是准备成功。

浏览器模式不能沿用 `window.parent.postMessage` 作为唯一状态通道。新增受限预览会话通道（WebSocket + 短期 preview ticket），上报 runId、instanceGeneration、sourceRevision、日志序号和画面状态。票据仅能连接指定运行，不可编辑资源/启动构建。URL 初始票据交换后移除；日志/截图索引不存秘密。

浏览器弹窗必须在用户点击时先同步创建占位页，异步准备完成再导航；弹窗被拦截时保留“打开预览”按钮及可复制的受限链接。禁止不断自动重试打开窗口。后台自动化使用隐藏受控浏览器，不打开系统浏览器、不抢焦点。

Play 启动超过 1 秒显示阶段，30 秒仍未 ready 显示“仍在加载，查看日志”，并可取消。超时不是停止成功；取消需撤销同一 operation/runId，迟到成功也应停止那个已取消的运行。

新运行 ready 前可以保留旧截图作为明确标注的“上一运行”，不得作为新运行结果。刷新导致 runId 改变，旧日志、截图和输入不允许串到新运行。

## 关闭和未保存内容

- 关闭预览标签：释放该浏览器的租约；最后一个客户端离开后短宽限期（建议 10 秒）停止受管运行。网络掉线和刷新在宽限期内可恢复。
- 关闭编辑器标签：不立即杀死仍有浏览器租约的运行。用户 Stop、实例回收、应用退出则统一停止它们。
- 外部系统浏览器标签不由 Orca 强制关闭；服务停止后显示“预览已停止”，不无限转圈。
- 开始前说明运行来源：`source=working-copy` 或 `disk`，列出包含的脏文档 revision。默认延续现有 stash 语义，不为了 Play 自动保存项目。
- 分支/脚本/资源变化批量合并后触发一次重新准备；新变更撤销旧准备结果。游戏正在关键调试时可关闭自动刷新。

## 与 AI 的接口

`preview.start` 显式指定 `presentation=workspace-browser|system-browser|embedded|headless-browser|none`。默认值由交互入口选取，AI 必须传值；`none` 只准备服务，不宣称已渲染。`preview.open` 把已有 runId 展示到指定宿主，避免重复编译。其余 `preview.waitReady/status/refresh/stop`、`runtime.tree/query/input`、`capture.take`、`logs.read/subscribe` 见 [API 标准](cocos-web-api-standard.md)。

AI 修改后应：保存或标注工作副本 revision → start/refresh → waitReady(expectedSourceRevision) → 读取运行日志与节点 → 截图 → 对照要求。不能用编辑器 Scene 截图冒充实际 Play，也不能用旧运行截图证明新修改。

## 验收

1. 场景和 Prefab 两种入口，首次 Play 一次点击打开正确浏览器；第二次不会重复启动。
2. Orca 里切换预览后 AI 终端会话/输入不丢；系统浏览器模式仍可读取日志、停止、刷新。
3. 弹窗拦截、端口占用、启动失败、旧回执、关闭窗口、网络恢复、远程端口映射都有明确结果。
4. 源码改变后截图、日志、节点树均属于同一 runId + sourceRevision；未保存场景 Play 不写磁盘。
5. 实例上限回收不遗漏浏览器/Play 的内存；运行中的预览依照预算文档标为 busy。

后续开发先补脱离 iframe 的回执/租约通道，再接宿主浏览器入口，最后接 AI 观察与调试。仅打开一个 URL 不算这个需求完成。
