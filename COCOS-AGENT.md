# cocos-agent 分支说明

cocos-agent 基于 [Orca](https://github.com/stablyai/orca)（MIT 协议，保留原版权声明）。分支 `dev/0.1.0` 从 Orca `main` 切出，并会定期同步上游。

## 改动原则：尽量少碰上游文件

Cocos 桌面打包通过 `config/build-plugins/cocos-desktop-brand.ts` 注入产品名、徽标、应用图标和 GitHub 仓库。构建时把上游的 `resources/logo.svg` 指到 `resources/cocos-agent/logo.svg`，把 `resources/icon*.png` 指到 `config/cocos-agent/app-icon.png`，上游文件保持原样，运行时重绘的 Dock 和窗口图标因此也是 Cocos 的。这张 PNG 放在 `resources/` 外：打包时 `resources/cocos-agent` 不进 app.asar，放在外面才会由 electron-vite 复制进 `out/main`。上游的 Star 查询、写入和浏览器入口共用 `desktop-product.ts`。更新上游时若新增 Star 入口，复用同一个仓库地址。静态品牌文案（含设置里的「账户」入口名称）由 Cocos 的 i18n hook `cocosBrandText` 按 key 替换。

- Cocos 编辑器面板、右侧终端、会话持久化和 MCP 配置放在 Cocos 自有模块。独立安装包的图标、身份和更新策略由打包配置及包内资源决定。
- 上游文件只保留宿主挂点。优先用现有注册、路由和生命周期接口；避免改默认行为、搬动上游代码或复制整份实现。必须镜像的小段代码在登记表标出来源。
- 同步时以新 Orca 的接口和行为为基准，在对应的新入口接回 Cocos。与 Cocos 无关的修复单独提交给 stablyai/orca。
- 界面文案放在 `src/shared/cocos-agent/i18n/`，运行时挂到 `cocosAgent` 命名空间（`cocosText` / `cocosTextMain`），不写进上游的 `locales/*.json`。
- 每改一处上游文件，都要登记在 `config/cocos-agent/upstream-touch-points.json`。`pnpm check:changed` 会把 `upstream-base.json` 记录的上游提交与当前树比对，未登记或已不再改动的文件都会失败；下表由它生成。设计背景见 [低冲突同步 RFC](docs/specs/upstream-sync-conflict-reduction/upstream-sync-conflict-reduction-rfc.md)。

### 新增文件（不会冲突）

| 文件                                                                          | 作用                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config/electron-builder.cocos-agent.cjs`                                     | 在 Orca 打包配置的基础上，改 appId、产品名、用户数据目录名和 URL scheme                                                                                                                                                                                                                    |
| `config/scripts/build-cocos-agent-mac.mjs`                                    | 校验并导入内置包，构建 arm64 的 ad-hoc 签名应用；`--release` 另产出 dmg、zip 和 sha256，跳过全局开发命令安装                                                                                                                                                                               |
| `config/cocos-agent/a5-game-context.lock.json`                                | 内置的 a5-game-context 包：版本、文件名、sha256、来源提交                                                                                                                                                                                                                                  |
| `config/scripts/import-a5-game-context.mjs`（及 `.test.mjs`）                 | 校验 sha256 和版本后，把包解到 `resources/cocos-agent/a5-game-context/`；默认从 `../GitNexus/context-engine/release/` 找，`A5_GAME_CONTEXT_TARBALL` 可指定                                                                                                                                 |
| `resources/cocos-agent/.gitignore`                                            | 忽略解出来的包，不改上游的 `.gitignore`                                                                                                                                                                                                                                                    |
| `resources/cocos-agent/bin/a5-game-context`、`cocos-cli`                      | 启动脚本：从 symlink 找到 app，用 app 自带的 Electron 当 Node 运行内置包的 CLI，并设 `ELECTRON_RUN_AS_NODE`、`A5_NODE_EXE`、`A5_NODE_BINARY`、`A5_GAME_CONTEXT_PACKAGE_ROOT`                                                                                                               |
| `src/main/cocos-agent/cocos-agent-package.ts`、`cocos-agent-updater-setup.ts` | 根据独立安装包的可执行文件名隔离应用身份和更新源                                                                                                                                                                                                                                           |
| `resources/cocos-agent/icons/`                                                | 仅 Cocos 安装包使用的图标                                                                                                                                                                                                                                                                  |
| `resources/icon-source/cocos-agent-1024.png`                                  | 1024×1024 透明背景的图标原图                                                                                                                                                                                                                                                               |
| `COCOS-AGENT.md`                                                              | 本文件（上游 `.gitignore` 忽略了 `docs/`，所以放在根目录）                                                                                                                                                                                                                                 |
| `COCOS-AGENT-PLAN.md`                                                         | v0.1.0 路线和 loop 执行规则                                                                                                                                                                                                                                                                |
| `src/main/cocos-agent/`                                                       | 主进程 Cocos 编辑器服务：检测项目、调用 `a5-game-context editor open`、停止编辑器、退出 app 时停止本次启动的编辑器，以及对应的 IPC                                                                                                                                                         |
| `src/shared/cocos-agent/`                                                     | 主进程和渲染进程共用的类型、IPC 通道名、cocos-agent 自己的版本号 `COCOS_AGENT_VERSION`                                                                                                                                                                                                     |
| `src/preload/cocos-agent-preload.ts`                                          | 单独暴露 `window.cocosAgent`，不改上游的 `PreloadApi`                                                                                                                                                                                                                                      |
| `src/renderer/src/cocos-agent/`                                               | 渲染进程：Cocos 项目检测（按主机解析本地路径）、编辑器标签的打开/切换/停止、重启后恢复的编辑器标签换成可用的、编辑器服务空闲退出后标签自动重开、空工作区的首个界面、「+」菜单和左侧栏第一项的 Cocos Creator 入口、`window.cocosAgent` 的类型、侧栏终端的 store slice 与持久化、`cocosText` |
| `src/shared/cocos-agent/i18n/`、`cocos-agent-i18n.ts`                         | cocos-agent 自己的词条（en / zh / zh-Hant）和把它们挂到 `cocosAgent` 命名空间的 i18next 模块                                                                                                                                                                                               |
| `src/main/cocos-agent/sidebar-terminal-store.ts`                              | 侧栏终端归属的持久化文件 `userData/cocos-agent/sidebar-terminals.json`；Cocos 安装包首次运行时把右侧栏默认到「终端」、宽 420                                                                                                                                                               |
| `config/cocos-agent/upstream-base.json`                                       | 上次合入的上游提交、内置 cocos 包版本、验证记录                                                                                                                                                                                                                                            |
| `config/cocos-agent/upstream-touch-points.json`                               | 改动过的上游文件登记表（机读）                                                                                                                                                                                                                                                             |
| `config/scripts/cocos-agent/check-upstream-touch-points.mjs`                  | 校验登记表与实际改动一致，`--write-doc` 生成下表                                                                                                                                                                                                                                           |

### 改动的上游文件（可能冲突）

<!-- touch-points:start -->

<!-- prettier-ignore-start -->
| 文件 | 类型 | 改动 | 冲突时 |
| --- | --- | --- | --- |
| `.gitignore` | 挂点 | 忽略本地 Cocos 索引，并允许跟踪 Cocos 文档 | 保留上游规则，重新加入 Cocos 的忽略和文档例外 |
| `config/nsis/orca-installer-hooks.nsh` | 挂点 | 卸载时移除 cocos-agent 的 a5-game-context 命令目录（resources\a5-game-context-bin）的用户 PATH 条目，共 2 行追加 | 保留上游改动，重新追加这两行 |
| `config/scripts/development/setup/install-dev-cli.mjs` | 挂点 | Cocos 打包可跳过全局开发 CLI 安装 | 优先使用上游的跳过选项 |
| `config/scripts/preflight/changed-checks/check-changed-selection.mjs` | 挂点 | VERIFY_CHECKS 增加 cocos-agent upstream touch points 一项（6 行） | 保留上游改动，重新加上这一项 |
| `electron.vite.config.ts` | 挂点 | 注册 Cocos 桌面构建的产品配置、图标和窗口标题 | 在主进程和渲染进程的插件列表接回构建 hook |
| `native/windows-cli-launcher/src/main.rs` | 挂点 | CLI 支持 Cocos 打包后的应用可执行文件名 | 保留上游的 Windows 启动逻辑，复用上游提供的可执行文件解析 |
| `resources/darwin/bin/orca` | 挂点 | 默认 Orca 可执行文件不存在时，从应用 Info.plist 取实际文件名 | 保留上游 CLI 分流逻辑，仅保留 Cocos 包所需的文件名解析 |
| `src/main/github/client/fetch/orca-star.ts` | 挂点 | Star 查询和写入使用产品仓库 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/main/ipc/pty/spawn/spawn-options-assembly.ts` | 挂点 | 在本机 Agent 启动命令上追加当前 Cocos 编辑器的 MCP 配置 | 保留上游启动策略，在 Claude 的 plugin-dir 参数处理前接回 Cocos 参数 |
| `src/main/persistence/applying-settings/ui-selection-normalization.ts` | 枚举 | normalizeRightSidebarTab 接受 'terminal'（1 行） | 保留上游改动，重新加上这一行 |
| `src/main/startup/main-process-ipc-bootstrap.ts` | 挂点 | import + registerCocosAgentIpc()（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/main/startup/main-process-preflight.ts` | 挂点 | 识别 Cocos 安装包的启动程序，保留它的应用身份 | 保留上游初始化和用户数据逻辑，仅包装最终身份值 |
| `src/main/updater/updater-service.ts` | 挂点 | 独立 Cocos 安装包隔离 Orca 更新源，其他启动沿用 Orca 更新行为 | 保留上游更新服务，只接回打包判断 |
| `src/preload/index.ts` | 挂点 | import './cocos-agent-preload'（1 行） | 保留上游改动，重新加上这 1 行 |
| `src/renderer/src/components/browser-pane/assemble-chrome/browser-page-chrome-header.tsx` | 挂点 | import + const Toolbar 组件替换：Cocos 编辑器页不渲染浏览器工具栏（4 行） | 保留上游改动，重新加上 Toolbar 常量并把标签改回 <Toolbar |
| `src/renderer/src/components/browser-pane/assemble-chrome/browser-workspace-pane.tsx` | 挂点 | import + useCocosEditorTabView/useCocosEditorCover：编辑器启动中显示 Creator 灰屏、暂停或未运行时显示恢复视图、页面加载完成前用灰屏盖住（19 行） | 保留上游改动，重新加上两个 hook、两处早退和末尾的覆盖层 |
| `src/renderer/src/components/browser-pane/describe-page/browser-page-types.ts` | 挂点 | 提交 Cocos 页内地址时可保留加载状态 | 如上游已有对应选项则复用 |
| `src/renderer/src/components/browser-pane/host-guest/lifecycle/browser-page-webview-navigation-handlers.ts` | 挂点 | 同一个 Cocos 编辑器的页内文档切换保留当前加载状态 | 不改变普通浏览器导航，跟随上游加载所有权逻辑 |
| `src/renderer/src/components/onboarding/landing/Landing.tsx` | 挂点 | GitHub 入口读取产品仓库地址 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/renderer/src/components/right-sidebar/activity-bar/use-right-sidebar-activity-items.ts` | 挂点 | 注册 Cocos 自有的右侧终端入口 | 保留上游活动栏的过滤和排序，接回 Cocos 入口 |
| `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx` | 挂点 | lazy import + effectiveTab === 'terminal' 渲染 SidebarTerminalPanel（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/components/settings/general/GeneralSupportSection.tsx` | 挂点 | GitHub 入口读取产品仓库地址 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/renderer/src/components/sidebar/chrome/SidebarNav.tsx` | 挂点 | 挂载 Cocos Creator 入口 | 保留上游导航结构，在其中接回组件 |
| `src/renderer/src/components/sidebar/chrome/SidebarSettingsHelpMenu.tsx` | 挂点 | GitHub 入口读取产品仓库地址 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/renderer/src/components/star-nag/StarNagCard.tsx` | 挂点 | GitHub 入口读取产品仓库地址 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/renderer/src/components/star-nag/StarNagToastHost.tsx` | 挂点 | GitHub 入口读取产品仓库地址 | 沿用上游交互流程，将仓库来源接到共享产品配置 |
| `src/renderer/src/components/tab-bar/create-menu/tab-bar-static-create-menu.tsx` | 挂点 | 将 Cocos Creator 的打开、跳转和停止加入上游新建菜单模型 | 保留上游的菜单排序和自定义，合入 Cocos 菜单项 |
| `src/renderer/src/components/tab-bar/model/use-tab-bar-item-projection.ts` | 挂点 | import + useCentralTerminalTabs：标签栏只投影中央终端（4 行） | 保留上游改动，重新加上 hook 并让 terminalMap/terminalIds 用 centralTabs |
| `src/renderer/src/components/terminal-pane/mounting/TerminalOverlaySlot.tsx` | 挂点 | 复用上游终端挂载和关闭流程，将 Cocos 侧栏的可见性、焦点和布局作为参数 | 保留上游的退出原因、终端生命周期和 Activity portal |
| `src/renderer/src/components/terminal-pane/mounting/TerminalPaneOverlayLayer.tsx` | 挂点 | import + useCentralTerminalTabs：冷停与渲染只看中央终端（4 行） | 保留上游改动，重新加上 hook 并把两处 terminalTabs 换成 centralTerminalTabs |
| `src/renderer/src/components/terminal/tab-lifecycle/terminal-tab-bulk-actions.ts` | 挂点 | 关闭其他中央终端时略过 Cocos 侧栏终端 | 保留上游关闭路由和确认策略，只更换终端列表的来源 |
| `src/renderer/src/components/terminal/workbench/TerminalLegacyTerminalPanes.tsx` | 挂点 | import + useLegacyPaneSidebarState()：侧栏持有的 tab 不渲染，侧栏聚焦时中央不 active | 保留上游改动，重新加上 hook 调用、map 内的早退和 isActive 包装 |
| `src/renderer/src/components/terminal/workspace-mounting/use-terminal-startup-activation.ts` | 挂点 | 空本机 Cocos 工作区先尝试编辑器，再走上游的默认终端 | 保留上游的空工作区与恢复判定 |
| `src/renderer/src/lib/workspace/activation/initial-surface/worktree-initial-terminal-seeding.ts` | 挂点 | import + 默认 agent 聊天之前 3 行判断 openCocosEditorInEmptyWorkspace | 保留上游改动，重新加上这 4 行；位置在 applyDefaultTerminalTabs 之后、默认 agent 聊天之前 |
| `src/renderer/src/main.tsx` | 挂点 | import + installCocosAgentRenderer()（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/store/index.ts` | 挂点 | import + ...createSidebarTerminalSlice(...a)（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/store/slices/browser/browser-slice-contract.ts` | 挂点 | 提供保留加载状态的选项 | 如上游已有对应选项则复用 |
| `src/renderer/src/store/slices/browser/pages/browser-page-state-actions.ts` | 挂点 | 保留加载时沿用当前 loading 和加载所有者 | 保留上游加载所有权和普通导航处理 |
| `src/renderer/src/store/slices/right-sidebar/right-sidebar-route.ts` | 枚举 | normalizeRightSidebarRoute 接受 'terminal'（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/slices/tabs/tabs-focus-actions.ts` | 挂点 | import + routeTerminalTabToSidebarState 早退（5 行） | 保留上游改动，重新加上 found 之后的早退 |
| `src/renderer/src/store/slices/worktrees/session/worktree-identity-rename-state.ts` | 挂点 | WORKTREE_ID_KEYED_MAP_KEYS 加 sidebarTerminalSessionsByWorktree（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/slices/worktrees/teardown/worktree-purge-state.ts` | 挂点 | 清理时 omitByWorktree(sidebarTerminalSessionsByWorktree)（1 行） | 保留上游改动，重新加上这一行 |
| `src/renderer/src/store/terminals/retirement/terminal-tab-close.ts` | 挂点 | import + ...sidebarSessionsAfterTabClosed(s, closedWorktreeId, tabId)（2 行） | 保留上游改动，重新加上这一行展开 |
| `src/renderer/src/store/terminals/tabs/terminal-tab-navigation.ts` | 挂点 | import + setActiveTab 开头 routeTerminalTabToSidebar 早退（4 行） | 保留上游改动，重新加上早退 |
| `src/renderer/src/store/testing/app-store-test-fixture.ts` | 挂点 | import + ...createSidebarTerminalSlice(...a)（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/renderer/src/store/types.ts` | 挂点 | import + AppState 交叉 SidebarTerminalSlice（2 行） | 保留上游改动，重新加上这 2 行 |
| `src/shared/i18n/orca-i18n-instance.ts` | 挂点 | 附加 cocosAgent 语言命名空间与静态品牌文案 hook | 保留上游翻译加载与所有原有文案 |
| `src/shared/ui-chrome/ui-chrome-types.ts` | 枚举 | 共享侧栏标签列表接受 terminal，RPC 直接读此列表 | 只添加 terminal 枚举值 |

共 48 个上游文件。由 `node config/scripts/cocos-agent/check-upstream-touch-points.mjs --write-doc` 生成，请改 `config/cocos-agent/upstream-touch-points.json`。

自有文件中复制自上游的逻辑（上游改了来源时要对比）：

| 自有文件 | 镜像自 | 说明 |
| --- | --- | --- |
| `src/shared/agent-launch/startup/insert-agent-startup-args.ts` | `src/shared/agent-hook-listener/providers/claude/view/claude-agent-view-launch.ts` | 通用化的启动参数插入（claude/codex），上游修改 withClaudeAgentViewPlugin 的 tokenization 时同步 |
<!-- prettier-ignore-end -->

<!-- touch-points:end -->

上游如果改了 `UpdaterSetup` 中被覆盖的两个方法（`runBackgroundUpdateCheck`、`checkForUpdatesFromMenu`），`override` 会让类型检查报错，按报错调整即可。`TerminalOverlaySlot.tsx` 的 inline 分支是目前最大的一处挂点，第二阶段计划改用上游的终端 portal 机制（见 RFC）。

## 打调试包

2026-11-06 调整：v0.1 先交付内置 GitNexus Cocos Web 编辑器，安装后打开本地 Cocos 2.4.13 项目即可编辑、保存和预览。全局命令安装及外部 MCP 配置后置。构建会先校验并导入锁定的离线包，SDK 在首次打开编辑器前自动从包内注册。

本轮新增 `resources/cocos-agent/prepare-editor.cjs`（复用 GitNexus SDK 注册器，仅初始化 SDK）和 `src/main/cocos-agent/cocos-editor-sdk.ts`（并发首开共用初始化、失败可重试）。

本轮验收与已知限制见 [2026-11-06 内置编辑器验收](docs/cocos-agent/acceptance-2026-11-06.md)。内置 GitNexus 版本以 `config/cocos-agent/a5-game-context.lock.json` 为准。

### 右侧终端阶段（2026-11-06）

设计与交付入口见 [工作台目录](docs/cocos-agent/README.md)。右侧终端的面板、创建菜单和启动适配都位于 `src/renderer/src/cocos-agent/`。

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

产物在 `dist/mac-arm64/cocos-agent-beta.app`。Release 包以 `cocos-agent-beta-<Cocos 版本>-<日期>-<时分>-<提交>-arm64` 命名，生成 DMG、ZIP 和各自的 SHA-256。Cocos 版本取自 `src/shared/cocos-agent/cocos-agent-version.ts`，应用内部版本继续供 Orca 的 daemon 和 CLI 做协议检查。macOS 内部包使用稳定的 `com.a5labs.cocos-agent.internal` 身份和本机内部证书，构建脚本会校验签名。用户数据目录是 `~/Library/Application Support/cocos-agent`。

本地分发首次打开：把应用复制到 Applications；若系统阻止启动，按 [Apple 的说明](https://support.apple.com/en-us/102445)在“系统设置 → 隐私与安全性 → 仍要打开”中确认。文件夹访问是另一项授权，首次访问时按需允许。旧版后台终端可能在关闭窗口后继续运行；处理旧包的授权冲突时，先结束对应终端中的任务，再从会话管理重启终端后台。不要只关闭窗口，也不要重置所有应用的系统权限。原因、验证与边界见 [macOS 内部分发权限记录](docs/cocos-agent/macos-internal-distribution-2026-11-06.md)。

只改界面时不用打包，直接 `pnpm dev`。开发模式下 app 里没有内置的 a5-game-context，用环境变量指定一个能用的版本：`A5_GAME_CONTEXT_BIN=<GitNexus>/context-engine/native-engine/bin/darwin-arm64/a5-game-context pnpm dev`。

**不要给 `mac.executableName` 设值**：electron-builder 会同时用它给 .app 命名。设成 `Orca` 会打出一个 `Orca.app`，拖进「应用程序」时会覆盖正式版。

## 和 Orca 正式版同时运行时的已知问题

以下问题暂未处理，0.1.0 调试阶段先规避：

- **命令行工具**：Cocos 安装包同时提供 a5-game-context 和 cocos-cli。Orca 原有 CLI 设置和入口沿用上游。
- **不要在 cocos-agent 里重置「电脑操控（Computer Use）」权限**：辅助程序的 bundle id 仍是 `com.stablyai.orca.computer-use`，重置会同时清掉正式版的辅助功能和录屏授权。
- **`~/.orca` 两边共用**：快捷键、agent hook 脚本、部分 API key 都在这里。加密的 key 两边互相解不开，在 cocos-agent 里保存会覆盖正式版那份。
- **手机配对端口 6768**：谁先启动谁占用。cocos-agent 开着时重启正式版，正式版会换端口，已配对的手机要重新连接。
- **两边合计最多 256 个终端**。
- **设置里可选的「水彩 / 蓝色」备选图标、Windows 的 `icon.ico`、Computer Use 辅助程序的图标**还是 Orca 的。之后单独处理。

## 同步上游

- `cocos-agent`：A5 仓库。`main` 跟随 Orca 上游，Cocos 开发在 `dev/0.1.2`。
- `upstream`：`stablyai/orca`，只用来拉上游代码。
- 基线：`config/cocos-agent/upstream-base.json` 记录上次合入的上游提交。登记表以它为基准。

每轮同步：

```sh
git fetch --no-tags cocos-agent main dev/0.1.2
git merge-tree --write-tree --name-only cocos-agent/dev/0.1.2 cocos-agent/main
git worktree add ../orca-sync -b codex/cocos-sync cocos-agent/dev/0.1.2
git -C ../orca-sync merge --no-ff --no-commit cocos-agent/main
```

合并之后按顺序：

1. 先确认上游是重命名、删除还是替换了入口。以新文件为底，只接回登记表里实际需要的 Cocos 调用。优先保留新 Orca 的终端生命周期、工作区和自动化逻辑。
2. 更新 `upstream-base.json` 的提交，并按实际差异更新登记表。运行 `node config/scripts/cocos-agent/check-upstream-touch-points.mjs --write-doc`。
3. 提交合并后，运行 `pnpm check:changed --base=cocos-agent/main --maxWorkers=2`，检查整个 Cocos 层相对新基线的差异。
4. 专项验收：打开 Cocos 项目、右侧新建 Shell / Claude / Codex、切换工作区、收起侧栏再切会话、退出重开、编辑保存关闭、`build-cocos-agent-mac.mjs` 成包。上游改了终端休眠/恢复或 Agent 启动时再跑 `tests/e2e/cocos-sidebar-terminal.spec.ts` 与 `src/main/cocos-agent/*.test.ts`。
5. 开 PR 合回 `dev/0.1.2`，**保留 merge 祖先，不要 squash**，否则下一轮 git 认不出已合入的上游历史。

用 merge 保留共享分支的祖先关系。Orca 基线升级与内置 Cocos 包升级分开交付。继续收缩挂点时，优先评估用上游的终端 portal 统一中央与右栏的挂载，并验证终端切换和重启恢复，再删去两套挂载路径之间的特判。
