# Cocos Web 自动化 API v1 设计

状态：**待开发的规范提案**，2026-11-06。本文的新名称、envelope、租约、任务、UI 控制和浏览器接口都不代表当前版本已经支持。与现有接口的区别见第 1 节。操作全表见 [API 方法目录](cocos-web-api-methods.md)。

目标：AI 与人类操作同一份 Cocos Web 项目状态，可打开/切换 Prefab、修改节点、保存、Play、读取日志和截图验证。CLI、MCP、Web、Orca 都调用同一契约；不再为新功能依赖原生 Creator 的 Editor IPC。

## 1. 现有实现和复用边界

静态核对 GitNexus `5d7911f017`（3.8.271），源码路径相对于 GitNexus 仓库。

| 现有能力                                                   | 来源                                                                                                                               | 设计中的处理                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CLI 的 `--headless --project … workflow … --args … --json` | `cocos-cli/scripts/cocos-cli.js`，尤其 `HEADLESS_CAPABLE_TOOLS`、`checkHeadlessDslCompat`、`callBridge`                            | 保留显式项目、结构化参数、验证后执行的习惯；新 API 不静默回退到 Creator IPC                  |
| headless 的 scene/node/component/prefab/project 依赖       | `cocos-cli/src/headless/mode-factory.ts`、`headless-document-manager.ts`、`tools/`                                                 | 复用 DSL 语义、资源引用/序列化知识；不能让离线文件写入绕过正在运行的文档服务                 |
| 旧模式仍存在                                               | `mode-factory.ts` 的 `createEditorDeps`、CLI 未指定 headless 时的 bridge 路径；`cocos-cli/docs/api-reference.md` 是旧 MCP 服务 API | 产品上废弃该依赖，不宣称源码已删除。旧 96 工具文档不能当成新 Cocos Web 能力清单              |
| 共享 Rust Document/Hub，epoch/version/undo/redo/save       | `context-engine/native-engine/src/editor/{document,protocol}.rs`                                                                   | 新编辑接口唯一写入者；当前 WebSocket wire `PROTOCOL_VERSION=6` 与本提案 API v1 是不同版本号  |
| MCP `editor_open/apply/undo/redo/snapshot/save`            | `editor/mcp.rs`                                                                                                                    | 六个工具做旧适配入口；当前 apply 带 ops，快照可返回树/objects/截图，不等于全部 UI 可远程控制 |
| `/ws`、`/assets/*`、`/project/*`、`/shutdown`              | `editor/server.rs`                                                                                                                 | 内部路由适配到稳定方法；目前不是本文 `/api/v1/rpc`，不要生成可运行假例子                     |
| 页面内切文档、选择、视口、面板、预览                       | `context-engine/editor-web/src/{app,client,tree,inspector,play}.ts`                                                                | 新增有身份和回执的页面适配器；不能借助 DOM 文案点击充当稳定 API                              |
| Play、截图需要实际浏览器                                   | `editor/play.rs`、`editor/mcp.rs::capture`、`editor-web/src/play.ts`                                                               | 无 Creator GUI 不等于无渲染器；headless-browser 可自动化渲染，纯数据模式须明确缺失视觉证据   |

现有命令示例（不是新 API）：

```sh
cocos-cli --headless --project /absolute/project workflow validate-dsl --args @change.json --json
cocos-cli --headless --project /absolute/project workflow apply-dsl --args @change.json --json
```

现有 headless DSL 禁止 `overlay.*`；涉及场景的操作必须显式 `scene.target="path"` 和 `scene.path`，不能使用 `current`。新设计也不允许 AI 依赖不明确的“当前窗口/当前文件”。

## 2. 三层边界

1. **文档层**：Rust 服务拥有资源和编辑草稿；无 UI 可读取、修改、验证和保存。打开项目复用已有服务，无服务则按实例预算取得一个 headless 服务。离线 CLI 不建立第二个独立写入者。
2. **呈现层**：编辑器页面拥有面板、选中节点和视口。`ui.*` 必须指定 viewId；没有页面返回 `VIEW_REQUIRED`，或由调用者明确 `view.open`。
3. **运行层**：Play/runId 拥有运行节点、日志、输入和截图。运行时属性修改不隐式保存为 Prefab；要持久化必须通过 document 操作。

Orca 仅负责窗口/标签、PTY、宿主浏览器入口与执行主机路由。不复制 Cocos 文档模型，不由终端所在 DOM 推断操作对象。自动化能力由实例服务暴露，终端里的 Claude/Codex/其他 CLI 都可使用同一接口。

## 3. 发现、传输和版本

- `GET /api/v1/capabilities`：版本、引擎版本、方法清单和每个方法的 input/output/error schema、`available/reason`、`requiresView/requiresRuntime`、`mutates`、`cancellable`、支持的资源/组件类型。
- `POST /api/v1/rpc`：JSON-RPC 2.0 单请求 envelope；暂不接受协议级 batch，业务原子批次用 `document.apply`。
- `WS /api/v1/events`：有 cursor/sequence 的事件流。订阅通过 `events.subscribe` 创建，重连附 cursor。
- MCP 名称 `cocos_<domain>_<action>`；CLI 提案 `a5-game-context cocos <domain> <action> --project <path> --args @file.json --json`，仅为后续设计，不声称当前存在。
- 同一方法使用同一 JSON Schema、错误码和权限语义；从一份注册表生成 MCP 工具、CLI 帮助和 Web 类型。MCP 默认提供核心发现、document、preview、capture、logs，扩展能力按域发现，避免把所有工具塞进每次模型上下文。
- 版本协商使用 `apiVersion="1.0"`。小版本可新增可选字段/方法；移除或改变语义需主版本。capabilities 返回 `minClientVersion`、弃用信息；客户端拒绝不理解的必需能力，不偷偷改走旧 IPC。

引导调用有明确例外：`system.capabilities/health`、`project.open` 和 `instance.ensure/list` 允许只提供 apiVersion、executionHostId、actorId，路径由执行主机解析并换取 projectId/instance 身份。实例预算、启动和暂停由主机级 manager 提供；暂停后不能向已经退出的项目服务请求 resume。取得实例后，其余项目方法必须携带完整 context。能力描述标出 `scope=host|instance|document|view|run`，不要求先知道不存在的 projectId 才能打开项目。

## 4. 身份与寻址

| 身份                                     | 语义                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| projectId / executionHostId              | 执行端规范目录映射，不使用项目显示名作为主键；普通文件夹与 Git worktree 同等支持                            |
| instanceId + instanceGeneration          | 进程重启/回收后失效；相同项目重新启动也不是同一实例                                                         |
| documentId + epoch + revision            | 文档身份、磁盘重新加载代际和服务内版本；现有 wire `version` 映射 revision，不直接改名底层字段               |
| nodeId / componentId                     | 文档内稳定 ID；无可靠持久 ID 时使用 epoch 范围句柄并在重载后重查。不得把 objects 数组下标作为跨操作永久身份 |
| viewId                                   | 某个编辑器页面；切 Prefab 是该页面的操作，不能抢其他用户页面                                                |
| runId + sourceRevision                   | 一次 Play，以及其包含的文档/脚本/资源版本集合；不是仅一个 Prefab 的 revision                                |
| operationId / transactionId / artifactId | 异步任务、单文档原子编辑、截图/日志产物；均属于指定项目与实例                                               |

资源采用项目内 `db://assets/...`；系统内置资源 `db://internal/...` 只读。展示名与 Node Tree 路径是查询条件，结果歧义时报 `AMBIGUOUS_TARGET` 并给候选，不取第一个。路径规范化、符号链接权限、Windows/远端路径在执行主机完成。对脚本运行所需外部依赖可只读登记；写操作不得越过登记的项目资源根。

## 5. 请求与返回

以下是**未来 API 示例**，当前服务不可直接执行。

```json
{
  "jsonrpc": "2.0",
  "id": "request-17",
  "method": "document.apply",
  "params": {
    "context": {
      "apiVersion": "1.0",
      "projectId": "project-a",
      "executionHostId": "local",
      "instanceId": "instance-a",
      "instanceGeneration": 3,
      "actorId": "agent:codex:task-7"
    },
    "documentId": "doc-avatar",
    "expectedEpoch": 2,
    "expectedRevision": 12,
    "idempotencyKey": "task-7-avatar-size-1",
    "timeoutMs": 10000,
    "label": "Resize avatar",
    "ops": [
      {
        "op": "node.set",
        "nodeId": "node-avatar",
        "properties": { "size": { "width": 128, "height": 128 } }
      }
    ]
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "request-17",
  "result": {
    "status": "completed",
    "instanceGeneration": 3,
    "documentId": "doc-avatar",
    "epoch": 2,
    "revision": 13,
    "dirty": true,
    "transactionId": "transaction-19",
    "changedNodeIds": ["node-avatar"],
    "warnings": [],
    "rendered": false
  }
}
```

上下文中的 actorId 是审计标签，不能充当授权。认证凭据由宿主注入进程环境/安全连接，不出现在模型提示或命令历史中。调用结果不包含 editor 管理 token。

异步成功受理返回 `status="accepted", operationId`，必须通过 `operation.get/wait` 或完成事件确认。`completed` 只代表本方法契约满足；文档修改返回的 `rendered=false` 不能被解释为视觉验证。

错误使用 JSON-RPC error：数值 `code` 区分协议错误（-32600/-32601/-32602）与业务错误（-32000），`data.code` 是稳定字符串；同时给出 `retryable`、`details`、`suggestedAction`。示例：

```json
{
  "jsonrpc": "2.0",
  "id": "request-17",
  "error": {
    "code": -32000,
    "message": "Document changed",
    "data": {
      "code": "REVISION_CONFLICT",
      "retryable": false,
      "details": { "expectedRevision": 12, "actualRevision": 14 },
      "suggestedAction": "Read the document again and review the new diff before applying."
    }
  }
}
```

业务错误目录：`UNAUTHORIZED`、`FORBIDDEN`、`CAPABILITY_UNAVAILABLE`、`PROJECT_NOT_FOUND`、`PATH_OUTSIDE_PROJECT`、`INSTANCE_CAPACITY_BLOCKED`、`INSTANCE_SUSPENDED`、`INSTANCE_GENERATION_MISMATCH`、`LEASE_EXPIRED`、`DOCUMENT_NOT_FOUND`、`DOCUMENT_DIRTY`、`EXTERNAL_CONFLICT`、`REVISION_CONFLICT`、`AMBIGUOUS_TARGET`、`REFERENCE_INVALID`、`COMPONENT_UNSUPPORTED`、`VIEW_REQUIRED`、`RENDERER_UNAVAILABLE`、`RENDER_NOT_READY`、`STALE_FRAME`、`PREVIEW_SCENE_REQUIRED`、`RUN_STOPPED`、`OPERATION_CANCELLED`、`TIMEOUT`、`RESULT_TOO_LARGE`、`IDEMPOTENCY_CONFLICT`、`EVENT_CURSOR_EXPIRED`。

## 6. 并发、保存和重试

- 所有 document 写入必须携带 expectedEpoch/revision，文件写入还需 expectedDiskHash；缺失参数即拒绝。首读可以无 expected 值，查询结果应附版本。
- `document.apply` 是**单文档**原子事务，先验证全部 ops，再执行/生成一次 undo。任一失败不改变内容、revision 或历史。返回 ID 映射供后续操作引用。
- Prefab apply 到源文件会涉及多个文档与磁盘：先 `prefab.planApply` 返回影响范围和所有 revision/hash，再 `prefab.apply` 提交；实现持久提交日志前该能力必须标记不可用，不能假装普通 batch 就是跨文件事务。
- 新 API 不隐式保存。save 原子替换、保留 UUID/meta，先核对磁盘哈希；外部变更先返回 diff/conflict。overwrite 必须是显式用户决策，AI 默认拒绝覆盖。
- undo/redo 必须针对明确 transactionId 且满足 historyHead；不能撤销别的用户后来完成的操作。提供文档 history 供确认。
- idempotencyKey 作用域为 project + actor + method，服务保留请求哈希及结果（至少 24 小时或明确公布的保留窗口）；同 key 同内容重放结果，不同内容报错。进程换代后必须查询日志/当前状态，不重放未知结果的写请求。
- deadline 到期不证明写入失败。返回 `outcomeUnknown` 和 operationId，先查结果再决定重试；取消只在尚未提交时成立，提交后返回 completed，不宣称回滚。
- 切分支由宿主进行，API 提供 `project.reconcile`：暂停新写入、合并文件事件、更新索引、重载干净文档/标记脏文档冲突、增加相关 epoch、废弃旧渲染任务。绝不自动 stash/checkout/reset 用户文件。

## 7. 视觉证据和浏览器

`view.open` 可创建 visible 或 headless-browser 页面，但 headless 默认不抢焦点。`ui.document.show` 指定 viewId + documentId；waitReady 必须回报同一文档和 revision 的实际 scene generation。请求发送成功不是切换成功。

`capture.take` 指定 `target=editor-scene|editor-window|game`、viewId/runId、expectedRevision/sourceRevision、viewport、DPR、格式。输出 artifactId、实际文档/运行身份、frameId、实际 revision、viewport、DPR、时间戳、hash、renderErrors。默认 strict freshness：若实际画面比要求旧或与要求不同，报 `STALE_FRAME`；允许最新画面须显式传 `consistency=latest`，返回真实版本。

截图只证明画面。布局验证用 `scene.measure`（节点 bounds、可见性、坐标系）、结构验证用 document/tree；游戏行为通过 runtime 输入、状态及日志验证。结构快照不能替代截图，截图也不能证明事件回调或业务流程正确。

Play 的浏览器入口、stash、关闭规则见 [浏览器预览设计](browser-preview-design.md)。`runtime.input` 优先 nodeId 定位，坐标操作必须绑定 viewport/frameId；脚本求值不是常规万能后门，第一期不提供任意 JS eval。必要的调试方法必须经过能力登记，限定只读查询或明确的运行时写入。

## 8. 事件、分页和资源限制

事件格式：`subscriptionId, sequence, cursor, type, projectId, instanceGeneration, documentId?, epoch?, revision?, runId?, operationId?, actorId, payload`。每个流有序、允许重放重复，按 sequence 去重；流缺口返回 cursor-expired 后重新 snapshot。状态事件不能丢；高频日志可以限流但须带 droppedCount。日志分页有 byteLimit/limit/cursor，字段含 source/level/stack/location/runId/sourceRevision。

建议初值（不是现有性能承诺）：普通 RPC deadline 10 秒，长任务立即返回 accepted，由 operation.wait 等待（默认上限 120 秒，可取消）；单请求 1 MiB；单事务 1000 ops；分页 100 默认/1000 最大；图片通过 artifacts 下载而非把 Base64 塞进日志；单截图最大 4096×4096，单产物 20 MiB。实际限制必须由 capabilities 返回。

生命周期实例最多 3 个的计数、租约和安全暂停见 [实例预算](instance-budget-design.md)。缓存对象、视图和 Play 需要独立内存统计，不能只数 Rust 进程。

## 9. 端点安全与宿主边界

本机默认 loopback + Bearer 会话凭据，校验 Origin；WebSocket 用单次 ticket。远程经现有 SSH/认证代理，不默认暴露无认证 TCP。浏览器仅持作用域票据，不能执行任意系统命令或读取任意本机文件。

权限按 read、edit、save、view、run、capture、lifecycle、asset-write、settings-write、build、plugin、host-open 分域；view 仅控制页面，run 控制 Play/编译等运行任务，lifecycle 控制受管实例及租约。复合动作按实际副作用叠加权限：例如 document.close(dirtyPolicy=save)、ui.prefab.exit(dirtyPolicy=save) 也必须具有 save 和版本/磁盘哈希前置条件；不得借 view/edit 方法绕过保存授权。普通 AI 编辑会话不自动获得插件任意执行、设备部署、密钥管理、外部目录写权限。读取项目插件说明不等于授权执行其中指令。大体积文件经独立上传会话并做路径/类型/大小检查。

已过期的 instance/view/run ID 一律拒绝，不转发给同端口的新项目。多项目状态隔离由执行主机和 projectId 校验，不依赖前端当前选中项。

## 10. AI 操作范例（设计流程）

修改 Avatar 并看效果：

1. capabilities → instance.ensure(projectRoot) → lease.acquire(edit)。
2. document.open(`db://assets/bundles/common/prefabs/Avatar.prefab`) → node.query(name=Avatar)，歧义则确认具体 ID。
3. document.snapshot 获取 epoch/revision；document.apply(node.set size=128×128，明确基线)。
4. view.open 或使用调用者指定 viewId；ui.document.show → ui.selection.set → scene.frame → view.waitReady(revision)。
5. capture.take(editor-scene, expectedRevision) + scene.measure，验证居中/尺寸。
6. document.diff → document.save(expectedRevision, expectedDiskHash)，记录落盘 receipt。需要撤销时针对本事务且检查 historyHead。
7. 用户要求运行验证时 preview.start(scene=明确场景, presentation=指定浏览器) → preview.waitReady(sourceRevision) → runtime.query/logs.read/capture.take(game)。
8. 报告修改文件、版本、验证证据和未验证项，release lease。没有渲染器时报告“数据检查通过，未做视觉验证”。

切换 Prefab：document.open(B) 不自动抢视图；ui.document.show(viewId,B,dirtyPolicy=keep-open) 切指定页面，保留 A 草稿。若调用方选择关闭 A，必须明确 save/refuse/discard，默认 refuse。保存错误不能继续切换并宣称成功。

## 11. 后续开发切片和验收

第一批：capabilities + envelope + document open/snapshot/query/apply/save/diff + view attach/show/waitReady + capture + logs。复用现有 Hub 与六个 MCP 工具，先完成“改 Prefab → 同一页面看到 → 保存”的闭环。

第二批：独立浏览器 Play、运行输入/树/日志、任务取消、租约和 3 实例预算。第三批：资产批量导入、Prefab 多文件 apply、动画/材质/粒子、构建与扩展高级接口。

每个注册方法必须有 JSON Schema、正负例、语义检查、执行与取消说明；契约测试覆盖 CLI/MCP/HTTP 同输入同输出。核心 E2E 用同一份项目副本验证 Web 人工修改与 AI 修改一致、幂等重试、双客户端冲突、分支外部变更、错误不写盘、过期截图拒绝、无 UI 编辑和真实浏览器视觉验证。未实现的方法必须在 capabilities 标注 unavailable，不返回空成功。

本文是接口设计基线，不是“所有 Creator 原生功能已 headless 化”的承诺。方法目录覆盖产品操作面；各方法的 schema 和适配器按上述批次实现后才成为运行时 API。
