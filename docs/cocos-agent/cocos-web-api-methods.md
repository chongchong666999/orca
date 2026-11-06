# Cocos Web API v1 方法目录

状态：待开发设计。所有 v1 方法均为拟定契约，不是已发布端点。通用 envelope、并发、权限、错误、分页和任务规则见 [API 标准](cocos-web-api-standard.md)。

本目录是长期能力参考，不是首版待办清单。第一批按 [产品总方案](ai-cocos-product-plan.md)收敛为五项；拟新增的 `editor_context` 先组合当前页面、选择、包围盒、PNG 和少量错误，不必先拆成所有独立 v1 端点。

表中 `?` 为可选字段；ID 都是 string，revision/epoch/generation 为非负整数。`D` 表示 documentId，`V` 表示 viewId，`R` 表示 runId。每个请求均带 context；system/project.open/instance.ensure 等引导方法使用标准第 3 节的主机级 context。读写目标不能默认为人类当前文件。每个文档写方法均额外带 expectedEpoch、expectedRevision；落盘还需 expectedDiskHash。原型文档写入不强制持久 idempotencyKey，后续长任务按方法声明采用。`read` 不写项目，`edit` 修改草稿，`save` 落盘，`view` 改页面，`run` 改运行状态。

输出除表中字段外，都带 status 和 warnings；实例作用域的输出还带 instanceGeneration。长任务返回 operationId，完成后再取得表中结果。目录覆盖编辑器产品操作面；未列出的任意宿主命令/任意 JS eval 不属于公共 API。

## 服务、项目、任务

| 方法                                                | 权限             | 专用输入                                 | 结果 / 语义                                                           |
| --------------------------------------------------- | ---------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `system.capabilities`                               | read             | domains?: string[]                       | 版本、方法 schema、可用性及限制；UI/运行/SDK 前置条件分别标明         |
| `system.health`                                     | read             | —                                        | 服务、索引、编译器、渲染器分项状态，不把 alive 当 ready               |
| `project.open`                                      | read             | root: absolute path                      | projectId、引擎版本、资源根、支持能力；不打开原生 Creator             |
| `project.info`                                      | read             | —                                        | 项目配置、revision、只读原因、当前忙任务                              |
| `project.validate`                                  | read             | scope: paths[]?, checks: enum[]          | 引用、meta、脚本/组件兼容诊断，附文件位置                             |
| `project.reconcile`                                 | edit             | reason: branch-change/file-change/manual | operationId；changed paths、重新加载的文档、冲突列表、索引 generation |
| `instance.list/ensure/suspend/resume/pin/setBudget` | read / lifecycle | 见实例预算文档                           | 运行槽、回收结果、容量阻塞原因；不操作未受管服务                      |
| `lease.acquire/renew/release`                       | lifecycle        | instance、purpose、ttlMs / leaseId       | 受限租约与到期时间                                                    |
| `operation.get`                                     | read             | operationId                              | queued/running/completed/failed/cancelled、进度、结果/错误            |
| `operation.wait`                                    | read             | operationId、timeoutMs                   | 达到终态或 wait-timeout；等待超时不取消任务                           |
| `operation.cancel`                                  | 相同操作权限     | operationId、idempotencyKey              | cancelled 或 already-committed，不能隐式回滚已提交工作                |
| `events.subscribe`                                  | read             | domains、D?/V?/R?、cursor?               | subscriptionId、初始 cursor；范围随权限过滤                           |
| `events.unsubscribe`                                | read             | subscriptionId                           | 已停止；幂等                                                          |
| `artifact.get`                                      | read             | artifactId、range?                       | mime、hash、长度、bytes/受限下载地址；禁止任意本机路径下载            |
| `upload.create`                                     | asset-write      | filename、mime、size、sha256             | uploadId、受限分块地址、过期时间；只写暂存区                          |
| `upload.complete`                                   | asset-write      | uploadId、sha256                         | 验证大小/哈希后的待导入对象；不自动写入 assets                        |
| `upload.cancel`                                     | asset-write      | uploadId                                 | 幂等清理暂存文件，不能取消已经提交的资产事务                          |

## 文档与历史

| 方法                | 权限 | 专用输入                                                | 结果 / 语义                                                                          |
| ------------------- | ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `document.list`     | read | cursor?、limit?                                         | 打开的文档、路径、epoch/revision、dirty、跟随的 viewIds                              |
| `document.open`     | read | path: db URI、kind?: scene/prefab                       | D、epoch、revision、diskHash、tree 摘要；打开不抢页面                                |
| `document.snapshot` | read | D、include: tree/components/properties、depth?、cursor? | 一致版本的数据快照；不伪装截图                                                       |
| `document.validate` | read | D、checks?                                              | 序列化、引用、组件互斥/缺失、Prefab 链路诊断                                         |
| `document.diff`     | read | D、base: disk/revision、baseRevision?                   | 属性级/结构级变更、影响资产、预估保存文件                                            |
| `document.apply`    | edit | D、label、ops[]、dryRun?: boolean                       | 一次 transactionId、revision、dirty、created-ID map、effects；dryRun 不增加 revision |
| `document.save`     | save | D、expectedDiskHash                                     | 原子落盘 receipt：路径/哈希/保存版本；外部变更拒绝                                   |
| `document.reload`   | edit | D、dirtyPolicy: refuse/discard、expectedDiskHash        | 新 epoch；默认 refuse，discard 需显式授权                                            |
| `document.close`    | edit | D、dirtyPolicy: refuse/save/discard                     | 释放调用者订阅，其他客户端继续跟随；save 失败不关闭                                  |
| `history.list`      | read | D、cursor?、limit?                                      | transactionId、actor、label、revision、可撤销条件                                    |
| `history.undo`      | edit | D、transactionId、expectedHistoryHead                   | 新 revision；只撤销当前历史头，不跳过他人的操作                                      |
| `history.redo`      | edit | D、transactionId、expectedHistoryHead                   | 新 revision；存在新分支历史时拒绝                                                    |

## Node / Component / 绑定（草稿操作）

下面 edit 方法都是 `document.apply` 的单 op 便捷入口，同一验证器、同一 undo，不产生旁路写入。批次内引用新对象使用 `localId`，返回映射到稳定 ID。

| 方法 / op              | 权限 | 专用输入                                                                             | 结果 / 语义                                                                                   |
| ---------------------- | ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `node.query`           | read | D、selector: id/name/path/componentType、rootId?、cursor?                            | 候选节点 ID/路径/类型；路径歧义不自动选择                                                     |
| `node.get`             | read | D、nodeId、includeComponents?                                                        | 属性、父子、激活状态、Prefab 归属                                                             |
| `node.create`          | edit | D、parentId、name、index?、properties?、localId?                                     | nodeId；禁止覆盖同 ID                                                                         |
| `node.set`             | edit | D、nodeId、properties                                                                | 类型化 position/rotation/scale/anchor/size/color/opacity/active/group；禁止直接写内部对象索引 |
| `node.reparent`        | edit | D、nodeIds、parentId、index?、keepWorldTransform: boolean                            | 新层级及变换；拒绝环/非法根节点                                                               |
| `node.reorder`         | edit | D、nodeId、index                                                                     | 新 sibling 顺序                                                                               |
| `node.duplicate`       | edit | D、nodeIds、parentId?、index?、referencePolicy                                       | 新子树 ID 映射；内部引用重新映射，外部引用明确 keep/clear                                     |
| `node.remove`          | edit | D、nodeIds、referencePolicy: refuse/clear                                            | 删除集合、受影响引用；不隐式删除项目资产                                                      |
| `node.reset`           | edit | D、nodeIds、scope: transform/node/all                                                | 保留身份，按 Creator defaults 重置；all 需列出组件影响                                        |
| `component.types`      | read | D?、query?                                                                           | 可用类型、属性 schema、默认值、脚本 UUID、运行/编辑支持状态                                   |
| `component.list`       | read | D、nodeId                                                                            | componentId、type、enabled、missingScript                                                     |
| `component.get`        | read | D、componentId                                                                       | 可序列化字段、属性 schema、引用目标                                                           |
| `component.add`        | edit | D、nodeId、type/scriptUuid、properties?                                              | componentId；互斥渲染器/不可重复组件先拒绝                                                    |
| `component.set`        | edit | D、componentId、propertyPath、typedValue                                             | 修改后的值；区分 null、空数组、缺失值                                                         |
| `component.remove`     | edit | D、componentId、referencePolicy                                                      | 引用影响；不删除脚本文件                                                                      |
| `component.reorder`    | edit | D、componentId、index                                                                | 节点上的组件顺序                                                                              |
| `component.reset`      | edit | D、componentId                                                                       | 基于当前引擎/脚本 schema 的默认值；缺失 schema 报 unsupported                                 |
| `binding.set`          | edit | D、ownerId、propertyPath、target: node/component/asset/null                          | 强类型引用；拒绝跨文档 node/component，资产用 UUID                                            |
| `binding.list`         | read | D、ownerId?、targetId?                                                               | 引用入边/出边、悬空引用                                                                       |
| `event.bind`           | edit | D、componentId、eventProperty、targetNodeId、scriptComponentId、handler、customData? | ClickEvent 等序列化事件；验证目标组件/函数，未知不能假报成功                                  |
| `event.unbind`         | edit | D、componentId、eventProperty、bindingId                                             | 删除指定绑定，不能用不稳定数组位置猜测                                                        |
| `property.arrayResize` | edit | D、ownerId、propertyPath、length                                                     | schema 驱动默认元素；引用不填任意零值                                                         |
| `property.arraySplice` | edit | D、ownerId、propertyPath、index、deleteCount、typedValues[]                          | 完整引用重映射，一次 undo                                                                     |
| `script.describe`      | read | scriptUuid                                                                           | 组件类、可序列化字段、事件方法、编译诊断                                                      |
| `script.compile`       | run  | changedPaths?、force?: boolean                                                       | operationId、脚本 generation、诊断；不静默启用原生 Creator                                    |

TypedValue 为 JSON 原始类型或 `{kind:"vec2/vec3/quat/color/size",value:…}`、`{kind:"nodeRef/componentRef/assetRef",id:…}`；每个属性必须匹配 component schema。`propertyPath` 为 string/number segment 数组，禁止含 `__proto__` 等原型路径；未知字段拒绝，不自动添加到任意对象。

## Prefab 和 Scene

| 方法                 | 权限      | 专用输入                                                   | 结果 / 语义                                                          |
| -------------------- | --------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `prefab.create`      | save      | source D/nodeId、destination、expectedAbsent               | 新资产及 meta；需明确源 revision                                     |
| `prefab.instantiate` | edit      | D、prefabUuid、parentId、index?、transform?                | 实例根与 ID 映射，保留来源链                                         |
| `prefab.info`        | read      | D、rootNodeId                                              | source UUID/path/hash、嵌套链、override 列表                         |
| `prefab.planApply`   | read      | D、rootNodeId、overrideIds?                                | planId、受影响文件/实例、所有基线 revision/hash；不改文件            |
| `prefab.apply`       | save      | planId、expectedRevisions、idempotencyKey                  | 多文档事务 receipt；任一基线变化拒绝，不半应用                       |
| `prefab.revert`      | edit      | D、rootNodeId、overrideIds?、expectedSourceHash            | 按源恢复指定 overrides；保留其它人工修改                             |
| `prefab.unlink`      | edit      | D、rootNodeIds、recursive: boolean                         | 保留视觉对象，移除指定实例关联；范围明确                             |
| `scene.create`       | save      | destination、template、designResolution、expectedAbsent    | scene UUID/path/hash；不为临时验证自动建永久场景                     |
| `scene.list`         | read      | query?、cursor?                                            | 场景路径/UUID、startScene、预览默认值                                |
| `scene.measure`      | read/view | D、nodeIds、V、expectedRevision、space: local/world/screen | 真实布局 bounds、可见性、渲染 revision；无渲染结果时明确 unavailable |
| `scene.frame`        | view      | V、D、nodeIds?、padding?                                   | 调整编辑器视口，返回 camera/viewport 状态                            |

## 编辑器页面、选择与视口

| 方法                   | 权限      | 专用输入                                                                   | 结果 / 语义                                                    |
| ---------------------- | --------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `view.list`            | read      | —                                                                          | viewId、clientKind、D、renderedRevision、viewport、active 状态 |
| `view.open`            | view      | D?、presentation: workspace-tab/system-browser/headless-browser、viewport? | V、opening/ready 状态；不隐式打开 Creator                      |
| `view.close`           | view      | V、dirtyPolicy: keep-open/refuse                                           | 关闭指定页面；草稿跟随文档层规则                               |
| `view.waitReady`       | read      | V、D、expectedEpoch/revision、timeoutMs                                    | 实际渲染身份/scene generation，未达成超时报错                  |
| `ui.document.show`     | view      | V、D、dirtyPolicy: keep-open/refuse                                        | 指定页面切换文档/Prefab，回执含实际 D；其他页面不切换          |
| `ui.prefab.enter`      | view      | V、D、instanceRootId                                                       | 打开来源 Prefab 并建立返回栈；source 不存在时报错              |
| `ui.prefab.exit`       | view      | V、dirtyPolicy: keep-open/save/refuse                                      | 恢复原场景/选择，save 失败不退出                               |
| `ui.selection.get/set` | read/view | V / V、D、nodeIds、componentId?                                            | 当前选择、selectionRevision；验证选择属于此 D                  |
| `ui.asset.reveal`      | view      | V、assetUuid                                                               | Assets 面板定位资源，不启动外部程序                            |
| `ui.viewport.get/set`  | read/view | V / V、mode2d3d、camera、zoom、gizmo、coordinateSpace                      | 编辑器视口状态，范围 clamp 规则由 schema 定义                  |
| `ui.panel.list/show`   | read/view | V / V、panelId、visible                                                    | 层级、属性、场景、控制台等登记面板状态                         |
| `ui.layout.get/set`    | read/view | V / V、layoutId 或 layout                                                  | 当前工作台布局；不修改项目资源                                 |
| `ui.selection.inspect` | read      | V、expectedSelectionRevision?                                              | 明确绑定 D/revision 的选中对象上下文，供“发送给 AI”            |

## 游戏运行、调试和证据

| 方法                        | 权限    | 专用输入                                                                               | 结果 / 语义                                                          |
| --------------------------- | ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `preview.start`             | run     | sceneUuid/path、source: working-copy/disk、documentRevisions?、presentation、viewport? | operationId → R/sourceRevision；presentation 见浏览器文档            |
| `preview.open`              | view    | R、presentation                                                                        | 打开/聚焦已有预览，不新编译一个 run                                  |
| `preview.status`            | read    | R                                                                                      | preparing/booting/running/failed/stopped、sourceRevision、连接渲染器 |
| `preview.waitReady`         | read    | R、expectedSourceRevision、timeoutMs                                                   | canvas尺寸、frameId、readyAt；服务在监听不算游戏 ready               |
| `preview.refresh`           | run     | R、expectedSourceRevision、source                                                      | 新 operationId/runId；返回旧运行终止状态                             |
| `preview.stop`              | run     | R                                                                                      | 停止此运行，不关项目、不停止其他项目游戏；幂等                       |
| `runtime.tree`              | read    | R、rootId?、depth?、cursor?                                                            | 运行节点树及 runtimeGeneration；与编辑草稿节点不可混用               |
| `runtime.query`             | read    | R、selector、fields                                                                    | allowlist 的状态/组件属性，不执行任意 JS                             |
| `runtime.set`               | run     | R、runtimeNodeId、componentId?、property、typedValue                                   | 临时运行修改，明确 persisted=false                                   |
| `runtime.input`             | run     | R、action: click/pointer/key/text、nodeId 或 position、frameId/viewport、sequence      | 输入送达回执；业务成功要进一步 query/log/capture 验证                |
| `runtime.pause/resume/step` | run     | R、stepFrames?                                                                         | 调试时间状态；仅 capability 支持时可用，不等于 Chrome JS 断点        |
| `capture.take`              | capture | target、V/R、expectedRevision/sourceRevision、viewport、DPR、format、consistency       | artifactId/hash、画面身份/版本、frameId、renderErrors                |
| `capture.compare`           | read    | artifactId、baselineId、regions?、threshold                                            | 图片差异与参数；视觉相似不自动等于功能正确                           |
| `logs.read`                 | read    | source: editor/compiler/game/plugin、R?、level?、cursor?、limit/byteLimit              | 带来源/版本/位置的日志、nextCursor、droppedCount                     |
| `logs.subscribe`            | read    | 同 read 的过滤项                                                                       | 事件 subscriptionId，不能用清空全局日志隐藏错误                      |
| `diagnostics.list`          | read    | D?/R?/paths?、severity?                                                                | 编译、资源、运行错误；各自绑定 generation                            |

## 资源、材质、动画、设置、构建、插件

这些能力多数已有页面/内部路由，但尚未证明符合本文的公共契约。高级模块必须单独广告 capabilities；不能因为出现在菜单中就返回 available=true。

| 方法                             | 权限                | 专用输入                                                        | 结果 / 语义                                                   |
| -------------------------------- | ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `asset.search/tree/info/resolve` | read                | query/type/cursor / parentPath / UUID / UUID 或 path            | 资产、meta、类型、路径/UUID 映射；不把文件名当唯一 ID         |
| `asset.import`                   | asset-write         | uploadId、destination、conflictPolicy: refuse/rename            | 异步导入结果/meta/诊断；默认不覆盖                            |
| `asset.create`                   | asset-write         | destination、type、template/data、expectedAbsent                | 新资源 UUID/path/hash                                         |
| `asset.move/rename`              | asset-write         | UUID、destination、expectedDiskHash                             | 原子保持 meta/UUID、引用影响；不直接只改主文件名              |
| `asset.remove`                   | asset-write         | UUIDs、expectedHashes、referencePolicy: refuse                  | 依赖检查后删除；后续显式清理方案单独审批                      |
| `asset.dependencies`             | read                | UUID、direction、recursive?、cursor?                            | 引用图、缺失引用                                              |
| `asset.refresh`                  | edit                | paths?                                                          | 合并变更、索引 generation、受影响文档；复用 project reconcile |
| `asset.meta.get/set`             | read/asset-write    | UUID / UUID、schemaFields、expectedDiskHash                     | importer 配置与导入任务，拒绝任意 meta 字段                   |
| `asset.reimport`                 | run                 | UUIDs、force?                                                   | operationId、产物/hash、诊断                                  |
| `material.get/set`               | read/asset-write    | UUID / UUID、pass、property、typedValue、hash                   | effect schema 验证后的材质；shader 错误明确列出               |
| `effect.compile`                 | run                 | UUID、defines                                                   | operationId、编译诊断和产物，不写不相关材质                   |
| `atlas.preview/pack`             | read/run            | UUID、options?、expectedHash                                    | 预览 artifact/打包 receipt；preview 不写项目                  |
| `animation.get/apply`            | read/asset-write    | UUID / UUID、expectedHash、trackOps[]                           | clip schema、轨道/关键帧事务；帧率/时间单位显式               |
| `animation.preview`              | run                 | V、D、nodeId、clipUuid、timeSeconds、playing                    | 编辑器动画预览状态；不启动整场游戏                            |
| `particle.inspect/export`        | read/asset-write    | D/componentId / destination、settings、expectedAbsent           | 属性 schema / plist 等导出 receipt                            |
| `settings.get/update`            | read/settings-write | scope: project/user、section / patch、expectedHash              | 类型化配置；用户设置不自动纳入项目提交                        |
| `build.targets`                  | read                | —                                                               | 可用目标、SDK/原生 Creator 依赖与缺失原因                     |
| `build.start`                    | build               | target、config、sourcePolicy、expectedProjectRevision           | operationId、日志、产物；不能声称所有平台都不依赖 Creator     |
| `build.status/stop`              | read/build          | operationId                                                     | 状态/取消回执；构建中实例受租约保护                           |
| `device.list`                    | read                | —                                                               | 已连接预览设备与授权状态                                      |
| `device.preview`                 | run                 | deviceId、R                                                     | 受限预览连接，不顺便安装原生应用                              |
| `package.inspect/import/export`  | read/asset-write    | uploadId / planId、expectedHashes / UUIDs、options              | 文件清单和冲突计划 / 导入 receipt / 受限 artifact             |
| `plugin.list`                    | read                | —                                                               | 插件能力、版本、权限、可用性                                  |
| `plugin.invoke`                  | plugin              | pluginId、version、registeredMethod、schemaArgs、idempotencyKey | 经登记接口调用；拒绝任意 channel、任意宿主 require/eval       |
| `host.open`                      | host-open           | kind: preview/artifact/project-folder、R/artifactId             | 宿主明确执行结果；path 必须由受信任对象解析，不能任意 shell   |

## 已有 wire 操作映射与缺口

静态来源 `editor/protocol.rs::command_from_wire`，不是对全部行为的运行验收。

| v1 语义                        | 当前内部 op / 路由                                                                                                        | 需要补齐                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| node.set/component.set/binding | `setProp`、`putValue`、`bindRef`、`resizeArray`、`addObject/bindEvent`                                                    | 稳定 ID、统一属性 schema、严格基线和事件绑定身份            |
| 结构编辑                       | `addNode`、`reparent/reorder`、`removeNode/removeNodes`、`duplicateNode/duplicateNodes/pasteNode/pasteNodes`、`moveNodes` | 语义化 selector、原子事务契约和 ID 映射                     |
| 组件                           | `addComponent/removeComponent/moveComponent/resetComponent`、`resetNode/resetAll`                                         | 脚本 schema/能力发现、一致错误                              |
| Prefab                         | `instantiatePrefab`、`prefabInfo`、`prefabSync`、`prefabLink/prefabUnlink/prefabUnlinkMany`、源 apply 分支                | 显式 plan、跨文档事务与落盘恢复；不可简单改名就宣布完成     |
| 文档                           | WS open/leave/request/snapshot，MCP 六工具                                                                                | v1 envelope、epoch/revision 完整前置条件、deadline/幂等日志 |
| Play                           | `/project/scenes`、`/project/play`                                                                                        | 独立浏览器回执、run 身份、sourceRevision、取消/租约         |
| 资产                           | `/assets/tree/search/locate/operate/meta/material/effect-data/effect-shaders/atlas-preview/refresh`                       | 标准化路由、权限、哈希并发、异步任务                        |
| 项目高级功能                   | `/project/profile/compile/compile-engine/build/*/simulator/devices/package/*/plugin`                                      | 拆权限和可用能力，不把内置/原生依赖混为 headless            |
| UI 控制与证据                  | 页面 client、选择和视口逻辑；现有 MCP capture                                                                             | viewId、实际完成回执、strict freshness、统一截图/测量 API   |

## schema 交付要求

后续实现中每个方法注册必须包含：`name/version/summary/inputSchema/outputSchema/errorCodes/permissions/mutates/requiresView/requiresRuntime/cancellable/examples`。Schema 不允许未声明字段；输出可演进字段通过版本与 capabilities 协商。上传内容用绑定 uploadId 的限时 PUT 路由（支持明确 offset/hash 的分块）传输；不是把二进制塞进 RPC。未完成/未引用上传按能力声明的 TTL 清理，过期报错不能读残缺文件。

文档中的合并行（如 get/set）实现时必须拆成独立方法与 schema，不允许把任意字符串 action 丢给通用执行器。

Schema 至少覆盖：整数/枚举边界、路径/UUID互斥、selector恰一目标、Vec/Color单位、可空引用、transaction输出ID引用、不同 capture target 的身份要求、无 UI 的 VIEW_REQUIRED、所有 revision/hash 前置条件。每个写方法具有“不满足前置条件时零副作用”的契约用例；每个视觉方法具有“旧画面不可冒充本次成功”的用例。
