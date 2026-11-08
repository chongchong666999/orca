# Cocos Web 对照 Creator 2.4.13：缺陷与修复清单

日期：2026-11-07。本文保留修复前的审计基线与证据；修复进度及最终验证见 [实施记录](creator-parity-fixes-2026-11-07.md)。

本轮发现 9 项值得修复的问题：3 项 P1、6 项 P2。优先处理“关闭丢改动、文本未提交就保存、节点引用错绑”，然后处理数组默认值、缺失 Prefab 容错和预览调试。产品已经具备可用的编辑主流程，下一步应先保证修改和保存可靠。

本次使用既有 REA 恢复资料逐条核对当前实现，并做了两个隔离探针：安装包服务的修改／关闭／重开，以及当前 Play 日志桥的 Error 转发。没有启动原版 Creator 做界面逐项对拍，也没有重新跑完整 WPTG 验收；源码确认与运行证据分别标注。

## 1. 基线与证据口径

| 对象       | 本次基线                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| Orca       | `d156c85761395a42dfb9402541d273d35a6cddc9` 加当前未提交修改                 |
| GitNexus   | `902e1a5fbfe9a3687b2a17079fd54d2c71e96784` 加当前未提交修改                 |
| 已安装应用 | `/Applications/cocos-agent.app`，`1.4.214-local.1794008940775.d156c8576139` |
| 内置服务   | `a5-game-context 3.8.275`，macOS arm64                                      |
| 官方对照   | 本机 Creator 2.4.13 引擎源码、既有 REA 恢复的编辑器代码、官方 2.4 文档      |

安装包与 GitNexus 当前 `editor-web/dist` 的 `editor.js`、`editor.css`、`index.html`、`creator-panel.js` 四项 SHA-256 相同。这能确认所查前端产物一致；**不能把未提交源码等同于一个可由 HEAD 单独重建的版本**。内置二进制及产物完整身份见 [identity.json](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/identity.json)，本轮引用文件的指纹见 [source-manifest.json](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/source-manifest.json)。

REA 资料不是只有截图：归档含 867 个恢复的非空 JavaScript 载荷、24 个核心可读文件，覆盖属性设置、场景保存、资源列表、拾取等行为。本次以这些实现作为对照依据；恢复完整性和语法验证不等于编辑器整体兼容性验收。见 [资料索引](/Users/free/Documents/work/doc/cocos-creator-rebuild/README.md) 与 [恢复验证边界](/Users/free/Documents/work/doc/cocos-creator-rebuild/core-loader-breakthrough.zh-CN.md)。本轮没有重新执行二进制解密或反编译，也不把恢复代码复制进产品。

证据类型：

- **服务实测＋源码链**：安装包二进制在临时工程复现；对应宿主调用链已核对。不是点击完整应用界面的端到端实测。
- **隔离脚本实测**：执行当前模块源码，验证模块行为；不是实际游戏运行验收。
- **源码确认**：触发条件、调用链和官方差异成立；尚待界面复现。
- **待验证／范围缺口**：不能直接算作已确认 bug，更不能算已通过。

P1 表示可能丢失编辑结果或保存错误引用，应该优先修复；P2 表示正常操作在特定输入或时序下失效。本清单不是所有功能的完整缺陷数，也不计算“兼容率”。

## 2. 修复总表

| ID  | 优先级 | 问题                                       | 证据             | 修复归属                     |
| --- | ------ | ------------------------------------------ | ---------------- | ---------------------------- |
| F01 | P1     | 普通 Stop／退出路径未保护未保存文档        | 服务实测＋源码链 | Orca 生命周期、Rust 关闭协议 |
| F02 | P1     | 多行文本保持焦点时，Cmd+S 保存旧值         | 源码确认         | Web Inspector、提交队列      |
| F03 | P1     | 跨文档拖放节点可能绑定同序号的错误节点     | 源码确认         | Web 拖放协议、引用校验       |
| F04 | P2     | 数组扩容复制末项，新增值不符合字段类型     | 服务实测＋源码链 | Rust 文档操作、属性类型描述  |
| F05 | P2     | 同步 Prefab 源缺失会阻断整个文档的画面加载 | 源码确认         | Rust 导入、编辑器运行时      |
| F06 | P2     | Play 场景列表与资源重命名／增删脱节        | 源码确认         | Web Play、场景身份           |
| F07 | P2     | Scene 拾取和轮廓遗漏组件自定义边界         | 源码确认         | 运行时布局、Web Scene        |
| F08 | P2     | 并发资源搜索会混入过期结果                 | 源码确认         | Web Assets                   |
| F09 | P2     | Play 的 Error／Promise 拒绝转发成 `{}`     | 隔离脚本实测     | Play 日志桥                  |

## 3. 逐项问题与修复要求

### F01｜普通停止和退出可能丢失未保存改动

**触发：**项目编辑器由 Orca 启动，修改场景／Prefab 后不保存，执行 Stop Cocos Creator，或应用退出后走到编辑器服务清理阶段。此项不是“关闭一个标签必然丢失”，也不涉及强行终止外部工具拥有的服务。

当前源码链：

- [stopCocosEditor](/Users/free/Documents/work/orca/src/renderer/src/cocos-agent/cocos-editor-tabs.ts:258) 直接调用停止服务，再关闭标签；没有保存／放弃／取消决策。
- [stopEditor](/Users/free/Documents/work/orca/src/main/cocos-agent/cocos-editor-service.ts:252) 默认 `onlyIdle=false`；自动回收使用的未保存保护没有覆盖普通 Stop。
- [退出钩子](/Users/free/Documents/work/orca/src/main/cocos-agent/cocos-editor-quit.ts:12) 调用 [shutdownForQuit](/Users/free/Documents/work/orca/src/main/cocos-agent/cocos-editor-service.ts:99)，对应用自己启动的服务发送普通关闭请求。
- [服务关闭入口](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/editor/server.rs:468) 只在 `onlyIdle` 模式拒绝 dirty／busy，普通请求直接结束服务。

原版 Creator 的 [confirmClose／close](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/readable-core/editor/page/scene-utils/edit-mode/modes/scene.ccc.js:46) 对 dirty 场景提供保存、取消、不保存，保存完成后再关闭。

**已安装服务实测：**临时 Prefab 根名称从 `Before` 改成 `UnsavedChange`，确认 `dirty=true`；带 `onlyIdle=1` 的关闭返回 `409 EDITOR_NOT_IDLE`；普通关闭返回 200、进程正常退出；重开仍是磁盘上的 `Before`，未保存修改消失。见 [原始结果](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/dirty-shutdown-result.json)。这证明协议行为和宿主调用风险，尚未做完整 GUI 退出复现。

**修复方案：**

1. 将 Stop 和正常退出接入同一套“提交当前输入 → 查询 dirty → 保存／放弃／取消”的流程；确认发生在页面与服务拆除之前。
2. 保存失败、磁盘冲突或用户取消时中止关闭；多个项目逐一处理或汇总处理，不能因为其中一个已保存就关闭全部。
3. 后端普通关闭默认拒绝 dirty；只有用户明确放弃后才允许带显式放弃语义的请求。关闭前再次检查版本，避免确认期间新增修改被静默丢弃。
4. 保留已有服务归属判断、自动回收的 dirty／busy 保护和并发启停串行化。不能为解决本项而随意结束外部服务。

**验收：**脏场景、脏 Prefab、两个项目同时脏分别覆盖保存／取消／放弃；保存失败不退出；取消后画面、Undo 和原服务保留；确认期间新增修改要再次处理；重新启动后磁盘内容与用户决策一致。

### F02｜多行文本未失焦时，保存命令漏掉最新输入

**触发：**编辑 Label 等多行字段，光标仍在文本框里，直接按 Cmd+S。

[全局保存快捷键](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/shell.ts:417) 会执行 Save；[提交前钩子](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/inspector.ts:121) 只对 `HTMLInputElement` 失焦，漏掉 `textarea`。而 [多行字段](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/components.ts:644) 仅在 `change` 时写入文档。于是保存请求读到的是旧字段值，框里的新文本还没有进入文档。控件还显示 Cmd/Ctrl+Enter 提示，但这里没有对应处理。

原版 [text-area](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor-framework/lib/renderer/ui/elements/text-area.ccc.js:1) 的 `_onInputChange` 更新内部值并发出 change，不能只以最终失焦作为唯一提交入口。

**修复方案：**扩展已有草稿提交机制，使 input、textarea 和对应自定义控件统一提交；复用现有命令队列，等待提交完成再 Save。处理中文输入法组合输入，补齐提示的 Cmd/Ctrl+Enter，避免一个输入被重复提交。保存完成的状态应代表屏幕中已确认的输入已落盘。

**验收：**输入中文、英文及换行，保持焦点直接保存；检查磁盘、重开文本和画面一致；组合输入未结束时不截断字符；Undo/Redo 正常；按钮保存和快捷键保存行为一致。当前为源码确认，未做浏览器键盘实测。

### F03｜节点拖放缺少文档身份，可能错绑引用

**触发：**同一项目打开 A、B 两个编辑页面，把 A 的节点拖入 B 的 Node／Component 引用槽；B 恰好也存在同数组序号的对象。

[Tree 拖拽载荷](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/tree.ts:351) 只发送数组下标字符串；[接收端](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/components.ts:168) 转为整数，[绑定逻辑](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/components.ts:631) 将它当成目标文档中的对象。源文档身份已丢失，服务即使验证“目标存在”，也无法识别它不是用户拖来的那个节点。

原版 [引用设置](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/readable-core/editor/page/scene-utils/set-property-by-path.ccc.js:48) 通过实例身份找到对象，并执行 `validateSceneReference`，不把文件数组位置当全局身份。

**修复方案：**节点拖放载荷携带项目、文档、epoch、稳定节点身份；仅允许合法同文档引用，结构变化后按身份重新解析当前下标。组件槽同时验证实际组件类型。旧的裸下标载荷不能在跨页面场景中默认信任；沿用既有 Prefab 边界保护。

**验收：**A/B 中同序号不同名节点跨页拖放被拒绝、文档不变脏；同页拖放成功；拖拽期间增删节点导致下标变化时不会错绑；错误组件类型被拒绝；保存重开检查真实目标身份，而不是只看槽里的显示名。当前为源码确认，尚未实际跨窗口拖放。

### F04｜数组扩容应按类型补默认值，当前却复制最后一项

**触发：**将已有数值、资源、Node／Component 引用数组的长度从 1 增加到 2。

[数组长度控件](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/components.ts:695) 调用通用扩容；[ResizeArray](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/editor/document.rs:734) 对普通末项直接复制，对 `__id__` 创建清空字段的新对象。空 EventHandler 数组有局部特殊处理，不能覆盖其他字段类型。

原版 [数组默认值生成](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/readable-core/editor/page/scene-utils/set-property-by-path.ccc.js:59) 按元素类型初始化：数字为 0，布尔为 false，字符串为空，资源／Node／Component 为 null，普通类按构造函数产生默认对象。

**已安装服务实测：**数字 `[7]` 扩容得到 `[7,7]`；资源 `[U]` 得到 `[U,U]`。见 [原始结果的 arrays 字段](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/dirty-shutdown-result.json)。Node／Component 新对象分支本次只查源码，未实际验证其全部后续校验。

**修复方案：**复用属性类型描述和默认对象生成能力，让扩容显式获得合法元素默认值；后端校验类型，停止从末项猜类型。保留一次扩容对应一次 Undo 的语义，空数组与非空数组一致。

**验收：**分别得到 `[7,0]`、`[U,null]`、`[N,null]`；引用数组扩容不增加孤立节点／组件；枚举、普通类、EventHandler、空数组有正确默认值；缩容和 Undo/Redo 后对象图仍合法，保存重开一致。

### F05｜同步 Prefab 源丢失不应阻断整个场景

**触发：**场景或 Prefab 内含自动同步实例，实例源 UUID 指向已经缺失的 Prefab。常见于切分支、资源被移动时 meta 未保留，或拷贝不完整。

[Importer](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/runtime/preview.rs:1046) 将同步源排除在缺失资源容错之外，抛出 `PREVIEW_ASSET_MISSING`；[编辑器场景打开](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/runtime/editor_runtime.rs:578) 传播错误，正常兄弟节点也无法完成该文档的画面加载。

本机 Creator 的 [syncWithPrefab](/Applications/Cocos/Creator/2.4.13/CocosCreator.app/Contents/Resources/engine/cocos2d/core/utils/prefab-helper.js:53) 在源缺失时警告并标记节点，然后返回，不使整个场景退出加载。此差异在 [历史记录](/Users/free/Documents/work/GitNexus/docs/dev-log/2026-11-04.md:80) 已出现，本轮重新检查了当前失败分支。

**修复方案：**编辑器模式对缺失同步源降级显示，保留实例根与可恢复的原始引用，提供定位和修复入口；其他节点照常加载。运行时为显示而清除的 `_prefab` 不能直接回写为文件事实。缺失的子树不能凭空还原，也不能静默展开成一份不完整 Prefab。是否阻止 Play／构建单独定义，不能把编辑器容错变成发布容错。

**验收：**隔离项目移走同步源后，正常节点仍显示、可选中和修改；缺失实例有明确标记；无操作保存不抹掉原始引用；恢复源后重开恢复同步；真正损坏的文档仍报明确错误。本项为源码确认，未启动实际引擎复现。

### F06｜Play 场景候选与资源变化不同步

**触发：**编辑器打开后新增、删除或重命名 `.fire`；尤其是当前选中的 Play 场景被重命名但 UUID 保持不变。

[Play 初始化](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/play.ts:102) 只取一次列表，option 使用路径；[资源事件处理](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/play.ts:87) 只尝试重启游戏，不协调列表和路径。[后端场景查找](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/editor/play.rs:61) 使用最新清单，旧路径可能得到 `Scene not found`。

原版 [启动场景配置](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor/lib/windows/static/script/launch.ccc.js:114) 区分固定 UUID 与 `current`，[资源事件监听](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor/lib/windows/static/script/launch.ccc.js:292) 更新候选。当前 Web 初始化还优先选择已打开文档，可能盖过项目配置的固定启动场景。

**修复方案：**以 `current | scene UUID` 表达预览选择，启动时解析路径；资产事件更新候选，按 UUID 保持固定选择，删除后明确提示不可用。只有选中 current 时才跟随当前编辑场景；**不能无条件让固定场景跟着编辑页面跳转**。当前 Prefab 不是可运行场景时，要明确沿用哪一个场景。

**验收：**新增立即可选，重命名保留同一场景，删除不继续提交旧路径；Play 运行中和停止时都验证；固定 B、编辑 A 时仍预览 B；current 从 A 切到 B 后预览 B；外部文件变化无需刷新整页。本项为源码确认。

### F07｜组件自定义范围没有参与 Scene 拾取和轮廓

**触发：**节点的 contentSize 为 0 或小于实际组件图形，组件通过 `_getLocalBounds` 声明了额外可选范围。

[运行时 obbOf／layout](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/runtime/editor-runtime.html:268) 仅产生节点 contentSize 的边界；[拾取](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/camera.ts:56) 与 [轮廓](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/scene.ts:296) 使用这些数据，遗漏组件声明的范围。

原版 [Component 接口](/Applications/Cocos/Creator/2.4.13/CocosCreator.app/Contents/Resources/engine/cocos2d/core/components/CCComponent.js:436) 说明此边界用于编辑器拾取；恢复的 [2D 选择工具](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor/builtin/scene/panel/tools/select/2d.ccc.js:1) 和 [node-gizmo](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor/page/gizmos/2d/elements/node-gizmo.ccc.js:1) 包含组件边界处理。

**修复方案：**在布局协议中区分节点尺寸与用于编辑器拾取的组件边界，遵循原版参与条件和优先顺序，经节点矩阵变换后传给 Scene。不能为扩大点击区而修改节点真实尺寸；禁用、隐藏、锁定、层级和多组件重叠要保持一致。

**验收：**构造零尺寸节点，组件声明局部矩形 `(10,10,100,60)`，点击其内部可选中；旋转、缩放、负缩放和多个组件分别检查拾取与轮廓；禁用和锁定符合原版规则；框选和 F 聚焦另行核对。本项为源码确认，没有视觉对拍。

### F08｜连续搜索会把过期结果追加到新查询

**触发：**提交查询 A，尚未返回就提交 B；A、B 以不同顺序返回，或等待期间清空搜索。

[runSearch](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/assets.ts:301) 在请求前清空结果，返回后无条件 append；没有校验当前查询身份。两个请求均可向同一个列表写入，旧请求的 finally 也可提前关闭新请求的加载状态。原版 [Assets 搜索组件](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor/builtin/assets/panel/component/search.ccc.js:1) 使用 `_searchID` 排除过期结果。

**修复方案：**每轮搜索递增请求序号，只有最后一轮可以替换结果、错误和加载状态；清空、刷新、销毁均使旧请求失效。可取消旧网络请求，但取消不能替代身份检查。

**验收：**人为延迟 A 800ms、B 50ms，仅显示 B；反向时序同样正确；清空后旧结果不重新出现；同一个关键词连续刷新无重复项；关闭页面后没有异步回写。本项为源码确认，尚未注入真实网络延迟复现。

### F09｜Play 错误对象转发后只剩 `{}`

**触发：**游戏调用 `console.error(new Error('message'))`，或 Promise 以 Error 对象拒绝且未处理。

[Play bridge](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/runtime/play-editor-bridge.js:7) 对非字符串使用 JSON.stringify，Error 的 message／stack 通常不是可枚举属性，转发后为 `{}`；unhandledrejection 使用相同格式器。原始浏览器 console 仍会收到 Error，损失发生在转发到编辑器这一段。

隔离执行当前桥接源码，两种输入均转发为 `{}`，而原 console 仍收到 `Error: PARITY_CONSOLE_ERROR`。见 [实测结果](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/play-console-result.json)。原版 [renderer console](/Users/free/Documents/work/doc/cocos-creator-rebuild/artifacts/2026-10-09-core-pass-2/recovered-ccc-final/editor-framework/lib/renderer/console.ccc.js:1) 保留错误信息；Web 自己的 [captureConsole](/Users/free/Documents/work/GitNexus/context-engine/editor-web/src/console.ts:168) 已有优先 stack／message 的实现，两个入口规则不一致。

**修复方案：**统一 Error 格式化规则，保留有长度限制的消息和堆栈，兼容跨 realm 的错误对象、字符串拒绝、普通对象和循环引用；继续调用原 console，不增加无限日志缓冲。

**验收：**实际 Play 的 Console 能看到 Error 消息和关键堆栈；Promise 拒绝不再只显示 `{}`；字符串、普通对象和循环对象仍可输出；超长日志截断但保留关键内容。当前只有模块实测，实际 Play 集成待验收。

## 4. 已修过的事项与不能混算的范围

| 范围                                                                | 本轮判断                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧 G13c 的树行宽度、重命名焦点、3D 按钮状态、状态栏覆盖、缺失资源槽 | 后续代码和记录已有修复，不能原封不动再列为当前 bug。参见 [G13c 后续修复](/Users/free/Documents/work/GitNexus/docs/dev-log/2026-11-04.md:103)。本轮未重新做整套 UI 回归。               |
| 同步 Prefab 子树显示、dirty 场景 Play                               | 已有 G13d／G13e 实现；F05 是“同步源文件本身缺失”，不是重复报告子树显示问题。                                                                                                           |
| 属性修改触发重载造成命令慢                                          | G13g 已加入引擎节点实时更新，历史 [性能记录](/Users/free/Documents/work/GitNexus/docs/dev-log/2026-11-04.md:456) 有特定基线通过证据；不能据此保证当前所有项目、切分支都不卡。          |
| AI 不知道当前文档／选中节点                                         | 当前已有页面状态上报与截图一致性检查，参见 [M0](/Users/free/Documents/work/orca/docs/cocos-agent/m0-editor-context-2026-11-06.md)。本轮不把旧版本缺口继续报为当前缺陷。                |
| AI 修改同步 Prefab 内容被拒绝                                       | 是防止保存丢改动的保护，不能为了“AI 什么都能改”移除。应引导打开源 Prefab，或走明确的同步模式操作。                                                                                     |
| 真正的 3D 场景编辑、平台构建、模拟器                                | 仍有功能范围／原生 Creator 依赖，不能把菜单存在当成完整实现，也不能和本轮 2D 回归缺陷混算。                                                                                            |
| 最近的 Orca 重开白屏                                                | 属于宿主生命周期专项，已有 [本轮运行记录](/Users/free/Documents/work/orca/docs/cocos-agent/desktop-runtime-2026-11-07.md)。本轮没有重复执行白屏验收，不用本次服务探针证明 GUI 已通过。 |

原版 Prefab 编辑支持打开、保存、关闭及自动同步规则；自动同步存在对实例内部修改和外部引用的限制，修复时应保留这些语义。[官方 Prefab 文档](https://docs.cocos.com/creator/2.4/manual/en/asset-workflow/prefab.html)

原版 Play 可选择浏览器或模拟器；Browser 目标在浏览器中预览。当前独立预览窗口的基础实现已有，F06／F09 针对场景选择与错误反馈，不能描述成“完全没有预览”。[官方预览文档](https://docs.cocos.com/creator/2.4/manual/en/getting-started/basics/preview-build.html)

## 5. 多项目、内存与 AI 闭环的补验

当前 Orca 的本地实例预算是 3 个已接入实例，并有归属、dirty、busy 保护，见 [实例预算设计](/Users/free/Documents/work/orca/docs/cocos-agent/instance-budget-design.md)。Rust [预览缓存](/Users/free/Documents/work/GitNexus/context-engine/native-engine/src/runtime/preview_cache.rs:62) 另有最多 4 项目、默认 768 MiB 的估算保留预算；这是进程内缓存口径，不是整个应用的内存硬上限，当前项目也可能保留超预算内容。

本轮没有测量多项目进程树内存，因此不认定有泄漏，也不宣称已解决所有内存风险。下一轮至少补以下数据：

| 场景                              | 要观察的结果                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| 顺序打开第 1／2／3／4 个项目      | Orca、各服务、场景 renderer、Play 窗口的内存与进程归属；第 4 个触发的实际处理 |
| 3 个项目都 dirty 或 busy          | 明确拒绝或提示，不丢改动；不能用强制关闭达到数量目标                          |
| 关闭 Play、切项目、恢复被回收项目 | 引用和进程及时释放；图、文档版本、AI 绑定仍属于同一实例                       |
| 连续打开 20 个 Prefab，再重复一轮 | 内存是否趋于稳定；截图和节点引用是否来自当前文档                              |
| 外部批量文件变化／切分支          | UI 仍能交互；资源索引刷新可观察；dirty 文档冲突不会被覆盖                     |

AI 验收只需先围绕一个短闭环：**读当前文档和选中节点 → 修改文本／布局／合法节点引用 → 获取同版本图与数值 → 保存 → 重开核对**。将 F02、F03、F04、F09 纳入这条路径，避免“接口成功但输入未提交／引用错绑／错误被吞”。不用先扩大 API 方法数量。

## 6. 实施顺序与完成标准

| 批次            | 内容                    | 完成门槛                                                   |
| --------------- | ----------------------- | ---------------------------------------------------------- |
| A：保护编辑成果 | F01、F02、F03           | 不静默丢输入，不保存错引用；Save／Undo／退出／重开能闭环   |
| B：修复编辑语义 | F04、F05                | 数组类型默认值正确；坏资源局部降级，其他内容可编辑且可恢复 |
| C：修复日常反馈 | F06、F08、F09           | 场景与搜索不陈旧；AI 和人都能读到真实预览错误              |
| D：交互一致性   | F07，加多项目与性能补验 | 组件拾取对齐，测出内存和延迟边界，不以语言实现推断性能     |

每项关闭条件：先在私有小工程复现，再修改拥有该行为的单一层；必要时加能在撤销修复后失败的回归检查，不为常量、翻译或样式重复造测试。最后同时保留文件差异、引用目标、文档版本和画面证据。

对照原版时固定引擎版本、分辨率、DPR、场景／Prefab 和资源版本。序列化差异按节点身份与字段语义检查，不只比较显示名；画面检查不能替代磁盘保存和引用检查。Orca 界面验收遵循后台启动与隐藏 renderer 截图规则；需要真实窗口焦点的动作放到隔离显示环境。

未覆盖：本轮没有全面验收动画／Timeline、粒子、字体、Spine、扩展、跨平台与远程宿主，没有做全量图像像素一致性、正式 p95 或 WPTG 真机 Play。发现清单之外的模块保持“待验证”，不能因未发现新问题而标为通过。

## 7. 本轮产物与复现边界

- [安装包与代码身份](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/identity.json)
- [服务探针](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/probe-dirty-shutdown.cjs) ／ [数组、关闭与重开结果](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/dirty-shutdown-result.json)
- [Play 日志探针](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/probe-play-console.cjs) ／ [日志结果](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/play-console-result.json)
- [引用文件指纹](/Users/free/Documents/work/doc/cocos-creator-rebuild/work/2026-11-07-web-parity-audit/source-manifest.json)

服务探针使用自动创建的小工程，隔离 HOME／缓存／临时目录，直接启动已安装 Rust 服务，并在结束后清理自启进程和临时工程。为限定文档协议范围，设置了 `A5_EDITOR_SCENE_RUNTIME=legacy`，没有启动场景渲染器；它不证明画面正确，也没有操作真实 WPTG。数组探针初次因误等待 snapshot 超时，修正为显式重新打开取得快照后完成；该探针失误未计为产品缺陷。

审计阶段只新增评审文档、证据和索引链接。用户随后授权在新分支修复，实施与验证结果见 [修复记录](creator-parity-fixes-2026-11-07.md)；本文的源码行号和“当前”描述均指修复前基线，不能作为修复后状态。
