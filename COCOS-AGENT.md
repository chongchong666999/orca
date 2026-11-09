# cocos-agent 分支说明

cocos-agent 基于 [Orca](https://github.com/stablyai/orca)（MIT 协议，保留原版权声明）。分支 `dev/0.1.0` 从 Orca `main` 切出，并会定期同步上游。

## 改动原则：尽量少碰上游文件

- 品牌和打包相关的设置都放在**新文件**里。上游不会有同名文件，所以同步时不会冲突。
- 上游文件**只追加，不修改、不搬动**：挂点只能是「加一行 import + 加一处调用」或「在上游语句之后追加一步」。需要上游逻辑的通用版本时，复制到自有目录并登记为镜像，上游原文件保持原样。
- 挂点形状以 diff 最小为准，不以逻辑最小为准：隐藏一个组件用组件替换（改一个标签名），不要把整段 JSX 包一层；改启动命令在上游算完之后追加，不要改它的表达式。
- 与 Cocos 无关的修复不留在 fork 里：作为独立提交标记 `upstream-candidate`，向 stablyai/orca 提 PR，上游合入后在下一轮同步中删除。
- 界面文案放在 `src/shared/cocos-agent/i18n/`，运行时挂到 `cocosAgent` 命名空间（`cocosText` / `cocosTextMain`），不写进上游的 `locales/*.json`。
- 每改一处上游文件，都要登记在 `config/cocos-agent/upstream-touch-points.json`。`pnpm check:changed` 会把 `upstream-base.json` 记录的上游提交与当前树比对，未登记或已不再改动的文件都会失败；下表由它生成。设计背景见 [低冲突同步 RFC](docs/specs/upstream-sync-conflict-reduction/upstream-sync-conflict-reduction-rfc.md)。

### 新增文件（不会冲突）

| 文件                                                          | 作用                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/electron-builder.cocos-agent.cjs`                     | 在 Orca 打包配置的基础上，改 appId、产品名、用户数据目录名和 URL scheme                                                                                                                                                                  |
| `config/scripts/build-cocos-agent-mac.mjs`                    | 校验并导入内置包，构建 arm64 的 ad-hoc 签名应用；`--release` 另产出 dmg、zip 和 sha256，跳过全局开发命令安装                                                                                                                             |
| `config/cocos-agent/a5-game-context.lock.json`                | 内置的 a5-game-context 包：版本、文件名、sha256、来源提交                                                                                                                                                                                |
| `config/scripts/import-a5-game-context.mjs`（及 `.test.mjs`） | 校验 sha256 和版本后，把包解到 `resources/cocos-agent/a5-game-context/`；默认从 `../GitNexus/context-engine/release/` 找，`A5_GAME_CONTEXT_TARBALL` 可指定                                                                               |
| `resources/cocos-agent/.gitignore`                            | 忽略解出来的包，不改上游的 `.gitignore`                                                                                                                                                                                                  |
| `resources/cocos-agent/bin/a5-game-context`、`cocos-cli`      | 启动脚本：从 symlink 找到 app，用 app 自带的 Electron 当 Node 运行内置包的 CLI，并设 `ELECTRON_RUN_AS_NODE`、`A5_NODE_EXE`、`A5_NODE_BINARY`、`A5_GAME_CONTEXT_PACKAGE_ROOT`                                                             |
| `src/main/updater/cocos-agent-updater-setup.ts`               | 关闭自动更新（Orca 的更新源写死为 stablyai/orca）                                                                                                                                                                                        |
| `src/shared/cocos-agent-brand.ts`                             | i18next 后置处理器，把界面和菜单翻译里的 `Orca` 统一替换成 `cocos-agent`                                                                                                                                                                 |
| `resources/icon-source/cocos-agent-1024.png`                  | 1024×1024 透明背景的图标原图                                                                                                                                                                                                             |
| `COCOS-AGENT.md`                                              | 本文件（上游 `.gitignore` 忽略了 `docs/`，所以放在根目录）                                                                                                                                                                               |
| `COCOS-AGENT-PLAN.md`                                         | v0.1.0 路线和 loop 执行规则                                                                                                                                                                                                              |
| `src/main/cocos-agent/`                                       | 主进程 Cocos 编辑器服务：检测项目、调用 `a5-game-context editor open`、停止编辑器、退出 app 时停止本次启动的编辑器，以及对应的 IPC                                                                                                       |
| `src/shared/cocos-agent/`                                     | 主进程和渲染进程共用的类型、IPC 通道名、cocos-agent 自己的版本号 `COCOS_AGENT_VERSION`                                                                                                                                                   |
| `src/preload/cocos-agent-preload.ts`                          | 单独暴露 `window.cocosAgent`，不改上游的 `PreloadApi`                                                                                                                                                                                    |
| `src/renderer/src/cocos-agent/`                               | 渲染进程：Cocos 项目检测（按主机解析本地路径）、编辑器标签的打开/切换/停止、重启后恢复的编辑器标签换成可用的、空工作区的首个界面、「+」菜单的 Cocos Creator 项、`window.cocosAgent` 的类型、侧栏终端的 store slice 与持久化、`cocosText` |
| `src/shared/cocos-agent/i18n/`、`cocos-agent-i18n.ts`         | cocos-agent 自己的词条（en / zh / zh-Hant）和把它们挂到 `cocosAgent` 命名空间的 i18next 模块                                                                                                                                             |
| `src/main/cocos-agent/sidebar-terminal-store.ts`              | 侧栏终端归属的持久化文件 `userData/cocos-agent/sidebar-terminals.json`；首次运行把右侧栏默认到「终端」、宽 420                                                                                                                           |
| `config/cocos-agent/upstream-base.json`                       | 上次合入的上游提交、内置 cocos 包版本、验证记录                                                                                                                                                                                          |
| `config/cocos-agent/upstream-touch-points.json`               | 改动过的上游文件登记表（机读）                                                                                                                                                                                                           |
| `config/scripts/cocos-agent/check-upstream-touch-points.mjs`  | 校验登记表与实际改动一致，`--write-doc` 生成下表                                                                                                                                                                                         |

### 改动的上游文件（可能冲突）

<!-- touch-points:start -->

<!-- prettier-ignore-start -->
| 文件 | 类型 | 改动 | 冲突时 |
| --- | --- | --- | --- |
| `.gitattributes` | 品牌 | 品牌二进制文件 merge=ours，共 6 行追加 | 保留上游改动，重新追加这几行 |
| `.gitignore` | 品牌 | 忽略 /.context-engine/；docs/cocos-agent、docs/specs 白名单，共 5 行追加 | 保留上游改动，重新追加这几行 |
| `config/packaged-runtime-node-modules.cjs` | 待回馈上游 | 用 Node 的 isBuiltin 识别 node:sqlite 等内置模块 | 上游若已改用 isBuiltin 则取上游版本 |
| `config/scripts/check-changed-selection.mjs` | 挂点 | VERIFY_CHECKS 增加 cocos-agent upstream touch points 一项（6 行） | 保留上游改动，重新加上这一项 |
| `config/scripts/check-changed.mjs` | 待回馈上游 | --maxWorkers 限制并发（3 行） | 保留上游改动，重新加上并发上限；上游若已支持则取上游 |
| `config/scripts/electron-builder-runtime-resources.test.mjs` | 待回馈上游 | 随 isBuiltin 修复：断言 node:sqlite 不被当成缺失依赖 | 随 packaged-runtime-node-modules.cjs 处理 |
| `config/scripts/install-dev-cli.mjs` | 待回馈上游 | ORCA_SKIP_DEV_CLI_INSTALL=1 时跳过（4 行） | 保留上游改动，重新加上这 4 行 |
| `resources/build/icon.icns` | 品牌 | cocos-agent 图标 | merge=ours 自动取我方；否则 git checkout --ours |
| `resources/build/icon.png` | 品牌 | cocos-agent 图标 | merge=ours 自动取我方；否则 git checkout --ours |
| `resources/darwin/bin/orca` | 待回馈上游 | ELECTRON= 从 Info.plist 读可执行文件名（1 行） | 保留读取 Info.plist 的写法 |
| `resources/icon-dev.png` | 品牌 | cocos-agent 图标 | merge=ours 自动取我方；否则 git checkout --ours |
| `resources/icon.png` | 品牌 | cocos-agent 图标 | merge=ours 自动取我方；否则 git checkout --ours |
| `src/main/ipc/pty/spawn-options-assembly.ts` | 挂点 | import + 在 pluginDir 之前给 openCodeLaunch.command 注入 Cocos MCP（10 行追加，不改上游行） | 保留上游改动，把这段追加放回 env 之后、pluginDir 之前 |
| `src/main/persistence/applying-settings/ui-selection-normalization.ts` | 枚举 | normalizeRightSidebarTab 接受 'terminal'（1 行） | 保留上游改动，重新加上这一行 |
| `src/main/runtime/agent-session/records/agent-session-record-rows.ts` | 待回馈上游 | SQLite 返回含 NUL 的 operation_key 会被截断：按 BLOB 读取并核对 | 上游若已修则取上游版本 |
| `src/main/runtime/agent-session/records/agent-session-record-store-test-harness.ts` | 待回馈上游 | 随 operation_key 修复调整测试夹具 | 随 agent-session-record-rows.ts 处理 |
| `src/main/runtime/runtime-agent-sender-history-triggers.ts` | 待回馈上游 | 触发器内不写 temp. 前缀（3 行） | 上游若已修则取上游版本 |
| `src/main/startup/dev-instance-identity.ts` | 品牌 | BASE_APP_NAME、BASE_APP_USER_MODEL_ID（2 行） | 保留上游其他改动，把这两个常量改回 cocos-agent 的值 |
| `src/main/startup/gpu-lifecycle.ts` | 挂点 | import COCOS_AGENT_VERSION；关于面板 appVersion 改用它（2 行） | 保留上游改动，重新改这 1 行并加 import |
| `src/main/startup/main-process-ipc-bootstrap.ts` | 挂点 | import + registerCocosAgentIpc()（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/main/startup/main-window-actions-quit-and-stop-all-sessions.test.ts` | 待回馈上游 | 后台启动时不弹恢复对话框的测试 | 随 main-window-actions.ts 处理 |
| `src/main/startup/main-window-actions.ts` | 待回馈上游 | isBackgroundLaunch() 时恢复失败只写日志，不弹原生对话框（8 行） | 保留上游改动，重新加上这段早退 |
| `src/main/updater/updater-service.ts` | 挂点 | new UpdaterSetup() 换成 new CocosAgentUpdaterSetup() 并调整 import | 保留上游改动，重新换成 CocosAgentUpdaterSetup |
| `src/preload/index.ts` | 挂点 | import './cocos-agent-preload'（1 行） | 保留上游改动，重新加上这 1 行 |
| `src/renderer/index.html` | 品牌 | <title> | 保留上游其他改动，标题改回 cocos-agent |
| `src/renderer/src/app-shell/use-onboarding-and-feature-tips.ts` | 挂点 | 有 cocos-agent preload 时跳过全局 CLI 安装探测与引导 | 保留上游改动，重新加上条件 |
| `src/renderer/src/components/browser-pane/assemble-chrome/browser-page-chrome-header.tsx` | 挂点 | import + const Toolbar 组件替换：Cocos 编辑器页不渲染浏览器工具栏（4 行） | 保留上游改动，重新加上 Toolbar 常量并把标签改回 <Toolbar |
| `src/renderer/src/components/browser-pane/assemble-chrome/browser-workspace-pane.tsx` | 挂点 | import + useCocosEditorSuspended：暂停的编辑器显示恢复视图（7 行） | 保留上游改动，重新加上 hook 与早退 |
| `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx` | 挂点 | lazy import + effectiveTab === 'terminal' 渲染 SidebarTerminalPanel（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts` | 挂点 | import + 活动栏增加 terminal 项（8 行） | 保留上游改动，重新加上这一项 |
| `src/renderer/src/components/settings/general/GeneralPane.tsx` | 挂点 | 有 cocos-agent preload 时隐藏原版 CLI 安装入口（1 行） | 保留上游改动，重新加上条件 |
| `src/renderer/src/components/tab-bar/tab-bar-static-create-menu.tsx` | 挂点 | import + 两种菜单顺序各插 1 行 CocosEditorMenuItems（3 行） | 保留上游改动，重新加上这 3 行（New Browser Tab 之后） |
| `src/renderer/src/components/tab-bar/use-tab-bar-item-projection.ts` | 挂点 | import + useCentralTerminalTabs：标签栏只投影中央终端（4 行） | 保留上游改动，重新加上 hook 并让 terminalMap/terminalIds 用 centralTabs |
| `src/renderer/src/components/terminal-pane/TerminalOverlaySlot.tsx` | 挂点 | inline 模式：侧栏内渲染、焦点归属、关闭时保留工作区选择（第二阶段改为 portal） | 保留上游改动，重新加上 inline 分支 |
| `src/renderer/src/components/terminal-pane/TerminalPaneOverlayLayer.tsx` | 挂点 | import + useCentralTerminalTabs：冷停与渲染只看中央终端（4 行） | 保留上游改动，重新加上 hook 并把两处 terminalTabs 换成 centralTerminalTabs |
| `src/renderer/src/components/terminal/terminal-tab-bulk-actions.ts` | 挂点 | import + 两处 currentTabs 改用 selectCentralTerminalTabs（3 行） | 保留上游改动，重新换成 selectCentralTerminalTabs |
| `src/renderer/src/components/TerminalLegacyTerminalPanes.tsx` | 挂点 | import + useLegacyPaneSidebarState()：侧栏持有的 tab 不渲染，侧栏聚焦时中央不 active | 保留上游改动，重新加上 hook 调用、map 内的早退和 isActive 包装 |
| `src/renderer/src/lib/worktree-initial-terminal-seeding.ts` | 挂点 | import + 默认 agent 聊天之前 3 行判断 openCocosEditorInEmptyWorkspace | 保留上游改动，重新加上这 4 行；位置在 applyDefaultTerminalTabs 之后、默认 agent 聊天之前 |
| `src/renderer/src/main.tsx` | 挂点 | import + installCocosAgentRenderer()（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/runtime/web-runtime-terminal-create-operation.ts` | 挂点 | 抽出 createWebRuntimeTerminalForHost（显式 environmentId），上游函数改为委托；纯插入 7 行 | 保留上游改动，重新插入这个导出函数并让上游函数委托给它；侧栏终端必须走它，否则 focus-read ratchet 会把侧栏启动算作读取默认主机 |
| `src/renderer/src/store/index.ts` | 挂点 | import + ...createSidebarTerminalSlice(...a)（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/store/right-sidebar-route.ts` | 枚举 | normalizeRightSidebarRoute 接受 'terminal'（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/slices/store-test-helpers.ts` | 挂点 | import + ...createSidebarTerminalSlice(...a)（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/store/slices/tabs/tabs-focus-actions.ts` | 挂点 | import + routeTerminalTabToSidebarState 早退（5 行） | 保留上游改动，重新加上 found 之后的早退 |
| `src/renderer/src/store/slices/worktrees/session/worktree-identity-rename-state.ts` | 挂点 | WORKTREE_ID_KEYED_MAP_KEYS 加 sidebarTerminalSessionsByWorktree（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/slices/worktrees/teardown/worktree-purge-state.ts` | 挂点 | 清理时 omitByWorktree(sidebarTerminalSessionsByWorktree)（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/terminals/terminal-tab-close.ts` | 挂点 | import + ...sidebarSessionsAfterTabClosed(s, closedWorktreeId, tabId)（2 行） | 保留上游改动，重新加上这一行展开 |
| `src/renderer/src/store/terminals/terminal-tab-navigation.ts` | 挂点 | import + setActiveTab 开头 routeTerminalTabToSidebar 早退（4 行） | 保留上游改动，重新加上早退 |
| `src/renderer/src/store/types.ts` | 挂点 | import + AppState 交叉 SidebarTerminalSlice（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/shared/orca-i18n-instance.ts` | 挂点 | import + .use(cocosAgentBrandPostProcessor).use(cocosAgentI18nModule) + postProcess（4 行） | 保留上游改动，重新挂上两个模块和 postProcess |
| `src/shared/rpc-contract/client-ui-params.ts` | 枚举 | STATIC_RIGHT_SIDEBAR_TABS 加 'terminal'（1 行） | 保留上游改动，重新加上这一行 |
| `src/shared/ui-chrome-types.ts` | 枚举 | RightSidebarTab 加 'terminal'（1 行） | 保留上游改动，重新加上这一行 |

共 52 个上游文件。由 `node config/scripts/cocos-agent/check-upstream-touch-points.mjs --write-doc` 生成，请改 `config/cocos-agent/upstream-touch-points.json`。

自有文件中复制自上游的逻辑（上游改了来源时要对比）：

| 自有文件 | 镜像自 | 说明 |
| --- | --- | --- |
| `src/shared/agent-launch/startup/insert-agent-startup-args.ts` | `src/shared/claude-agent-view-launch.ts` | 通用化的启动参数插入（claude/codex），上游修改 withClaudeAgentViewPlugin 的 tokenization 时同步 |
<!-- prettier-ignore-end -->

<!-- touch-points:end -->

上游如果改了 `UpdaterSetup` 中被覆盖的两个方法（`runBackgroundUpdateCheck`、`checkForUpdatesFromMenu`），`override` 会让类型检查报错，按报错调整即可。`TerminalOverlaySlot.tsx` 的 inline 分支是目前最大的一处挂点，第二阶段计划改用上游的终端 portal 机制（见 RFC）。

## 打调试包

2026-11-06 调整：v0.1 先交付内置 GitNexus Cocos Web 编辑器，安装后打开本地 Cocos 2.4.13 项目即可编辑、保存和预览。全局命令安装及外部 MCP 配置后置。构建会先校验并导入锁定的离线包，SDK 在首次打开编辑器前自动从包内注册。

本轮新增 `resources/cocos-agent/prepare-editor.cjs`（复用 GitNexus SDK 注册器，仅初始化 SDK）和 `src/main/cocos-agent/cocos-editor-sdk.ts`（并发首开共用初始化、失败可重试）。

本轮验收与已知限制见 [2026-11-06 内置编辑器验收](docs/cocos-agent/acceptance-2026-11-06.md)。内置 GitNexus 版本以 `config/cocos-agent/a5-game-context.lock.json` 为准。

### 右侧终端阶段（2026-11-06）

设计与交付入口见 [工作台目录](docs/cocos-agent/README.md)。新增 `SidebarTerminalPanel.tsx`、`SidebarTerminalCreateMenu.tsx`、`sidebar-terminal-launch.ts`，都位于 `src/renderer/src/components/right-sidebar/`。

侧栏归属存在 cocos-agent 自己的文件里（`src/main/cocos-agent/sidebar-terminal-store.ts`），不进上游的 UI 持久化 schema；web 客户端没有 preload，归属在那里不持久化，终端回到中央标签栏显示。上游里的挂点见上表。

本地 0.1.0 包已生成：`dist/cocos-agent-1.4.214-local.1793950875656.7b9f96fd126c-arm64.dmg`，另有同名 zip 和各自的 `.sha256`。代码来自 `7b9f96fd126c`；已完成本机后台首开、编辑保存、预览、退出重开和内置终端命令验证。只做 ad-hoc 签名，未公证；另一台 Mac 的实际安装仍未验收。

需要 Node 24、pnpm（用 corepack 启用 `package.json` 中 `packageManager` 指定的版本）、Xcode。

```sh
pnpm install
pnpm -C mobile install --frozen-lockfile                         # 构建会打包手机 web 端，缺依赖会失败
node config/scripts/build-cocos-agent-mac.mjs                    # 含类型检查
node config/scripts/build-cocos-agent-mac.mjs --skip-typecheck   # 更快
node config/scripts/build-cocos-agent-mac.mjs --release          # arm64 dmg、zip、sha256
```

产物在 `dist/mac-arm64/cocos-agent.app`；release 产物在 `dist/cocos-agent-<内部构建版本>-arm64.{dmg,zip}`，各带 `.sha256`。应用和内置原生程序使用 ad-hoc 签名，不需要开发者账号或证书，构建结束执行 `codesign --verify --deep --strict`。macOS 每次打包生成独立的 `com.a5labs.cocos-agent.adhoc.b<随机构建标识>`，避免新版应用和旧版保留终端共用同一个 TCC 权限记录、因不同代码哈希反复要求授权。同一安装包保留该标识；新构建需要分别授权，系统隐私设置可能出现多个同名条目。这不是跨版本免授权方案。用户数据仍在 `~/Library/Application Support/cocos-agent`，终端 daemon、socket 和 launchd 任务继续根据这个目录区分，项目、会话及设置不迁移。

本地分发首次打开：把应用复制到 Applications；若系统阻止启动，按 [Apple 的说明](https://support.apple.com/en-us/102445)在“系统设置 → 隐私与安全性 → 仍要打开”中确认。文件夹访问是另一项授权，首次访问时按需允许。旧版后台终端可能在关闭窗口后继续运行；处理旧包的授权冲突时，先结束对应终端中的任务，再从会话管理重启终端后台。不要只关闭窗口，也不要重置所有应用的系统权限。原因、验证与边界见 [macOS 内部分发权限记录](docs/cocos-agent/macos-internal-distribution-2026-11-06.md)。

只改界面时不用打包，直接 `pnpm dev`。开发模式下 app 里没有内置的 a5-game-context，用环境变量指定一个能用的版本：`A5_GAME_CONTEXT_BIN=<GitNexus>/context-engine/native-engine/bin/darwin-arm64/a5-game-context pnpm dev`。

**不要给 `mac.executableName` 设值**：electron-builder 会同时用它给 .app 命名。设成 `Orca` 会打出一个 `Orca.app`，拖进「应用程序」时会覆盖正式版。

## 和 Orca 正式版同时运行时的已知问题

以下问题暂未处理，0.1.0 调试阶段先规避：

- **全局命令安装后置**：cocos-agent 中已隐藏原版「安装命令行工具」入口；内置命令直接供 app 内使用。
- **不要在 cocos-agent 里重置「电脑操控（Computer Use）」权限**：辅助程序的 bundle id 仍是 `com.stablyai.orca.computer-use`，重置会同时清掉正式版的辅助功能和录屏授权。
- **`~/.orca` 两边共用**：快捷键、agent hook 脚本、部分 API key 都在这里。加密的 key 两边互相解不开，在 cocos-agent 里保存会覆盖正式版那份。
- **手机配对端口 6768**：谁先启动谁占用。cocos-agent 开着时重启正式版，正式版会换端口，已配对的手机要重新连接。
- **两边合计最多 256 个终端**。
- **设置里可选的「水彩 / 蓝色」备选图标、Windows 的 `icon.ico`、Computer Use 辅助程序的图标**还是 Orca 的。之后单独处理。

## 同步上游

- `origin`：`chongchong666999/orca`，cocos-agent 自己的代码推到这里。
- `upstream`：`stablyai/orca`，只用来拉上游代码。
- 基线：`config/cocos-agent/upstream-base.json` 记录上次合入的上游提交。白名单校验以它为基准。

只需一次的本机设置：

```sh
git config rerere.enabled true        # 记住冲突的解法，下次自动套用
git config merge.ours.driver true     # .gitattributes 里 merge=ours 的品牌文件自动取我方
```

每轮同步：

```sh
git fetch upstream --tags
TAG=$(git tag --list 'v*' --sort=-v:refname --merged upstream/main | head -1)   # 取最新 release；需要未发布的修复时再指定 main 上的提交
git worktree add ../orca-sync -b sync/orca-$(date +%Y%m%d) dev/0.1.1             # 独立 worktree，日常开发目录不受影响
cd ../orca-sync
git merge --no-ff "$TAG"
```

合并之后按顺序：

1. 处理冲突时先查上表的「冲突时」一列；品牌文件由 `merge=ours` 自动处理。
2. `node config/scripts/cocos-agent/check-upstream-touch-points.mjs --base "$TAG"`：没登记的上游改动、已经不需要的登记项都会报出来；上游若移动或删除了挂点所在文件，这里会先暴露。
3. `pnpm check:changed --base=dev/0.1.1 --maxWorkers=2`。
4. 专项验收：打开 Cocos 项目、右侧新建 Shell / Claude / Codex、切换工作区、收起侧栏再切会话、退出重开、编辑保存关闭、`build-cocos-agent-mac.mjs` 成包。上游改了终端休眠/恢复或 Agent 启动时再跑 `tests/e2e/cocos-sidebar-terminal.spec.ts` 与 `src/main/cocos-agent/*.test.ts`。
5. 开 PR 合回 `dev/0.1.1`，**保留 merge 祖先，不要 squash**，否则下一轮 git 认不出已合入的上游历史。
6. 更新 `upstream-base.json` 的 `upstreamSha`、`upstreamRef`、`verified`，并 `--write-doc` 刷新上表。

用 merge，不用 rebase：分支推到公司仓库后还有其他人在用，rebase 会改写历史。Orca 基线升级与内置 cocos 包升级分开交付，出问题时才分得清是宿主、接入层还是编辑器包。`upstream-candidate` 类的修复在上游合入后，同步时直接取上游版本并从登记表删除。
