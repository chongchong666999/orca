# a5-game-context 编辑器实例预算

状态：长期设计稿，2026-11-06。2026-11-07 已实现 Orca 本地实例表上限 3、按激活顺序回收干净空闲实例及页面资源释放，见 [实现记录](desktop-runtime-2026-11-07.md)。跨进程管理器、租约、远程预算与完整内存基准仍是后续设计；3 是可控实例数量，不是内存硬上限。

实施顺序以 [产品总方案](ai-cocos-product-plan.md)为准：先交付 AI 与人同页观察和 UI 修改，再测完整进程树内存。回收的首个切片仅管理 Orca 自己拥有的实例；本文跨进程管理器、租约和全局计数保留为后续参考，不是原型前置条件。

## 产品设想，测量后确定默认值

试行设想为每台执行主机最多保留 **3 个受管 Cocos 编辑器实例**，正式默认值待内存与恢复耗时测量。按该配置打开第 4 个项目时，回收最近最少使用、当前可安全回收的实例，再打开新项目。项目仍在侧栏，标签位置和打开的文档仍保留；返回时按需恢复。

这里的“关闭”是停止项目的编辑器服务、关联预览及渲染页面，不是删除工作区、关闭 AI 终端或丢弃文件。上限约束的是运行实例，不是用户可以添加的项目数量。与项目绑定的 AI 会话继续存在，下一次编辑器操作重新取得实例租约。

这能降低闲置实例的内存占用，但不是 3 个实例就必然低内存：大型项目的缓存、脚本进程、Chromium/GPU 和运行中的游戏仍可能占用较多内存。不能承诺 Rust 保证无卡顿，验收要测整个进程树。

## 2026-11-06 实现基线

静态核对：Orca `5b89b9279b1`、GitNexus `5d7911f017` / a5-game-context 3.8.271。

- Orca `src/main/cocos-agent/cocos-editor-service.ts`：按规范化项目目录复用实例，每个项目串行 open/stop；退出时只主动停止 `startedByApp` 的服务。目前没有跨项目数量上限。
- GitNexus `context-engine/native-engine/src/editor/project_ops.rs`：项目锁、运行实例记录与复用。
- `editor/server.rs`：支持空闲退出和 `/shutdown`；停止时清理编译池、effect 编译器、构建和设备服务。
- `editor/protocol.rs`：共享文档，断开最后一个客户端后保留脏文档。这个内存状态不等于可跨进程恢复的草稿。
- `editor/mcp.rs`：Agent 可以连接已有服务，也可以在自己进程中启动服务。因此只限制 Orca 的 Map，不能实现主机上所有服务的全局上限。
- `runtime/preview_cache.rs`：单进程预览缓存已有 `MAX_PROJECTS=4`、默认估算保留预算 768 MiB，使用中的超大项目可超出预算。它回收缓存条目，不代表停止 4 个编辑器，也不包含全部浏览器内存。后续测量分别报告缓存与实例，不能混为一个上限。

## 归属和计数

实例键为 `(executionHostId, canonicalProjectRoot)`，worktree 的不同目录分别计数；普通文件夹也适用。Windows 规范路径大小写规则由执行端处理，客户端不得自行 lowercase。SSH/远程主机各自计数，不消耗本机的 3 个槽位。

默认预算管理范围为同一用户、同一执行主机上，由新的 a5 实例管理器创建或明确移交的服务。Orca、CLI、MCP 共用该管理器。外部 Creator、旧版本服务和其他工具启动的未移交服务仅显示“外部实例”，不自动停止，也不虚称计入受控总量。自动接管不得仅凭 PID/端口相同。

`starting`、`ready`、`suspending` 都占槽；确认服务及受管子进程退出后才释放。`suspended` 不占槽。全局启动/淘汰队列串行分配槽位，A/B 两个并发 open 不能同时越过上限。管理器重启时用服务实例 ID、启动时间、认证握手核对，不盲信磁盘运行记录。

## 淘汰规则

1. 同项目已运行：复用，不占新槽；同项目启动中：合并请求。
2. 有空槽：启动；否则在候选中按 `lastUsedAt` 升序选择。
3. 当前正在看的项目、固定保留的项目、有未保存/冲突文档、正在导入/保存/构建/调试、持有有效写操作租约的实例都不可直接淘汰。
4. 后台且无运行任务的干净实例可回收。Play 正在运行的实例默认视为 busy，不因缺少点击就停止。
5. 全部不可回收：返回 `INSTANCE_CAPACITY_BLOCKED`，列出原因，提供“保存并暂停”“停止预览并暂停”“选择关闭项目”。不能悄悄丢弃内容，也不能先启动第 4 个再设法关闭旧实例。

`lastUsedAt` 只由用户激活项目/编辑器和 Agent 的实际操作更新。心跳、状态轮询、截图订阅的保活不能无限延长 LRU。Agent 多步任务可以持有短租约（建议 30 秒、每 10 秒续约，均为待调优初值），取消/断线后过期释放；禁止无限永久租约。人类的未保存状态不靠租约存续，始终受到保护。

## 暂停与恢复

安全第一阶段：只自动暂停干净且空闲的实例。持久草稿/撤销栈恢复未实现前，脏文档只允许用户保存或明确丢弃后暂停。

暂停顺序：标记 `suspending` → 拒绝新写入 → 再次核对 busy/dirty/租约 → 记录文档路径、选择、视口和面板布局 → 通知客户端停止重连 → 停止 Play 和子任务 → 认证 shutdown → 确认退出 → 释放槽位 → 标记 `suspended`。中途有新操作则取消暂停或返回可重试状态；禁止把已被淘汰的实例重新计为 ready。

Orca 将对应 WebView 导航到轻量的暂停占位页/释放 guest，显示“此项目已暂停以节省内存，打开时恢复”。只关 Rust 服务而让旧页面、WebGL 和预览继续运行不算验收通过。其他实例、其他标签的浏览器和 AI PTY 不受影响。

返回时重新取得槽位和实例 generation，读取当前磁盘，再恢复文档、选择和视口；旧端口、token、docId、运行 ID 都不复用。分支切换或文件消失时展示明确原因，不能拿旧缓存覆盖新文件。未来草稿恢复必须同时核对基线文件哈希，冲突时由用户选择。

shutdown 超时保持占槽和 `suspending/error`，提供重试；第一阶段不自动强杀。用户明确强制停止时，仍只处理管理器证明归属的进程树。两个 App 窗口必须共享同一预算，不能各自启动 3 个。

## 建议接口（未实现）

统一采用 [API 标准](cocos-web-api-standard.md) 的 envelope。

| 方法                              | 输入                                            | 输出                                                                                                                |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `instance.list`                   | hostId、cursor?                                 | 实例键、state、generation、lastUsedAt、busyReasons、dirtyDocumentCount、pinned、owned；可选进程树内存样本及采样时间 |
| `instance.ensure`                 | projectRoot、requestId、reason                  | instanceId/generation、reused、evictedInstanceId?；满额返回 blockers                                                |
| `instance.suspend`                | instanceId/generation、dirtyPolicy=`refuse`     | operationId；结束事件后确认释放槽位                                                                                 |
| `instance.resume`                 | projectRoot                                     | 与 ensure 相同，附恢复结果                                                                                          |
| `instance.pin`                    | instanceId/generation、pinned                   | 更新状态；pin 不能绕过上限                                                                                          |
| `instance.setBudget`              | hostId、maxRunning（整数 1–8）                  | 新预算、超预算待回收列表；下调不强杀 busy 实例                                                                      |
| `lease.acquire / renew / release` | instanceId/generation、purpose、ttlMs / leaseId | 租约到期时间；不等同文件写锁                                                                                        |

事件：`instance.starting/ready/suspending/suspended/failed`、`instance.capacityBlocked`、`lease.expired`。事件缺口必须重新 list，不凭旧事件恢复状态。

## 验收与交付顺序

- 打开 A/B/C，再激活 A，打开 D：只回收 B；运行槽位始终不超过 3，A/C 不重载。
- B 脏、C 正在 Play：不回收它们；无可回收实例时拒绝 D 并说明原因，磁盘及编辑内存不丢失。
- 同时打开 D/E、多窗口、CLI+Orca 并发：预算仍不超；外部实例不被杀。
- 返回 B：新 generation，选择与视口恢复，旧请求被拒绝；分支切换后的内容正确。
- 记录启动前、三项目稳态、淘汰后 10/30 秒的总 RSS/PSS（按平台可用值），分别列出 Rust、Node workers、浏览器/GPU、Play；报告下降量，不先承诺固定节省比例。
- 验证 macOS/Windows/Linux 的进程回收、SSH 断线及普通文件夹；隐藏后台测试不抢用户焦点。

先实现共享归属/计数/干净实例 LRU，再接入 Orca 暂停页面，最后考虑草稿检查点、内存软预算和后台预览自动休眠。本轮只有设计文档。
