# cocos-agent 分支说明

cocos-agent 基于 [Orca](https://github.com/stablyai/orca)（MIT 协议，保留原版权声明）。分支 `dev/0.1.0` 从 Orca `main` 切出，并会定期同步上游。

## 改动原则：尽量少碰上游文件

- 品牌和打包相关的设置都放在**新文件**里。上游不会有同名文件，所以同步时不会冲突。
- 必须改上游文件时，只改一行常量或一行代码，不移动代码。
- 每改一处上游文件，都要登记在下面的表里。同步出现冲突时，先查这张表。

### 新增文件（不会冲突）

| 文件                                            | 作用                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config/electron-builder.cocos-agent.cjs`       | 在 Orca 打包配置的基础上，改 appId、产品名、用户数据目录名和 URL scheme                                                                                                                    |
| `config/scripts/build-cocos-agent-mac.mjs`      | 本机调试包：不签名，只打本机 CPU 架构，只生成 .app，不出 dmg                                                                                                                               |
| `src/main/updater/cocos-agent-updater-setup.ts` | 关闭自动更新（Orca 的更新源写死为 stablyai/orca）                                                                                                                                          |
| `src/shared/cocos-agent-brand.ts`               | i18next 后置处理器，把界面和菜单翻译里的 `Orca` 统一替换成 `cocos-agent`                                                                                                                   |
| `resources/icon-source/cocos-agent-1024.png`    | 1024×1024 透明背景的图标原图                                                                                                                                                               |
| `COCOS-AGENT.md`                                | 本文件（上游 `.gitignore` 忽略了 `docs/`，所以放在根目录）                                                                                                                                 |
| `COCOS-AGENT-PLAN.md`                           | v0.1.0 路线和 loop 执行规则                                                                                                                                                                |
| `src/main/cocos-agent/`                         | 主进程 Cocos 编辑器服务：检测项目、调用 `a5-game-context editor open`、停止编辑器、退出 app 时停止本次启动的编辑器，以及对应的 IPC                                                         |
| `src/shared/cocos-agent/`                       | 主进程和渲染进程共用的类型、IPC 通道名、cocos-agent 自己的版本号 `COCOS_AGENT_VERSION`                                                                                                     |
| `src/preload/cocos-agent-preload.ts`            | 单独暴露 `window.cocosAgent`，不改上游的 `PreloadApi`                                                                                                                                      |
| `src/renderer/src/cocos-agent/`                 | 渲染进程：Cocos 项目检测（按主机解析本地路径）、编辑器标签的打开/切换/停止、重启后恢复的编辑器标签换成可用的、空工作区的首个界面、「+」菜单的 Cocos Creator 项、`window.cocosAgent` 的类型 |

### 改动的上游文件（可能冲突）

| 文件                                                                              | 改动                                                                                                                                                                                           | 冲突时                                                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/main/startup/dev-instance-identity.ts`                                       | 常量 `BASE_APP_NAME`、`BASE_APP_USER_MODEL_ID`                                                                                                                                                 | 保留上游的其他改动，把这两个常量改回 cocos-agent 的值                                        |
| `src/renderer/index.html`                                                         | `<title>`                                                                                                                                                                                      | 同上                                                                                         |
| `src/main/updater/updater-service.ts`                                             | `new UpdaterSetup()` 换成 `new CocosAgentUpdaterSetup()`，并调整 import                                                                                                                        | 保留上游改动，重新换成 `CocosAgentUpdaterSetup`                                              |
| `src/shared/orca-i18n-instance.ts`                                                | 注册 `cocosAgentBrandPostProcessor` 并启用 `postProcess`                                                                                                                                       | 保留上游改动，重新挂上后置处理器                                                             |
| `src/main/startup/main-process-ipc-bootstrap.ts`                                  | 引入并在 `registerMainProcessIpcHandlers()` 开头调用 `registerCocosAgentIpc()`，共 2 行（原先放在 `main-process-ready-runtime.ts`，会让 mock 了 electron 的上游启动测试失败，S5.1 时挪到这里） | 保留上游改动，重新加上这 2 行                                                                |
| `src/main/startup/gpu-lifecycle.ts`                                               | 引入 `COCOS_AGENT_VERSION`，「关于」面板的 `appVersion` 改用它，共 2 行（mac 上括号里仍显示 Orca 的构建号）                                                                                    | 保留上游改动，重新改这 1 行并加 import                                                       |
| `src/preload/index.ts`                                                            | `import './cocos-agent-preload'`，1 行                                                                                                                                                         | 保留上游改动，重新加上这 1 行                                                                |
| `src/renderer/src/lib/worktree-initial-terminal-seeding.ts`                       | 引入 `openCocosEditorInEmptyWorkspace`，并在默认 agent 聊天之前加 3 行判断，共 4 行                                                                                                            | 保留上游改动，重新加上这 4 行；位置要在 `applyDefaultTerminalTabs` 之后、默认 agent 聊天之前 |
| `src/renderer/src/components/tab-bar/tab-bar-static-create-menu.tsx`              | 引入 `CocosEditorMenuItems`，在两种菜单顺序里各插 1 行（「New Browser Tab」之后），共 3 行                                                                                                     | 保留上游改动，重新加上这 3 行                                                                |
| `resources/darwin/bin/orca`                                                       | `ELECTRON=` 一行：从 Info.plist 读取可执行文件名，不再写死 `MacOS/Orca`                                                                                                                        | 保留读取 Info.plist 的写法                                                                   |
| `resources/build/icon.{icns,png}`、`resources/icon.png`、`resources/icon-dev.png` | 换成 cocos-agent 图标（源图 `resources/icon-source/cocos-agent-1024.png`）                                                                                                                     | 二进制冲突直接用我们的版本：`git checkout --ours <文件>`                                     |

上游如果改了 `UpdaterSetup` 中被覆盖的两个方法（`runBackgroundUpdateCheck`、`checkForUpdatesFromMenu`），`override` 会让类型检查报错，按报错调整即可。

## 打调试包

需要 Node 24、pnpm（用 corepack 启用 `package.json` 中 `packageManager` 指定的版本）、Xcode。

```sh
pnpm install
pnpm -C mobile install --frozen-lockfile                         # 构建会打包手机 web 端，缺依赖会失败
node config/scripts/build-cocos-agent-mac.mjs                    # 含类型检查
node config/scripts/build-cocos-agent-mac.mjs --skip-typecheck   # 更快
```

产物在 `dist/mac-<arch>/cocos-agent.app`。用户数据在 `~/Library/Application Support/cocos-agent`，终端 daemon、socket 和 launchd 任务都根据这个目录区分，和 Orca 正式版互不影响。

只改界面时不用打包，直接 `pnpm dev`。开发模式下 app 里没有内置的 a5-game-context，用环境变量指定一个能用的版本：`A5_GAME_CONTEXT_BIN=<GitNexus>/context-engine/native-engine/bin/darwin-arm64/a5-game-context pnpm dev`。

**不要给 `mac.executableName` 设值**：electron-builder 会同时用它给 .app 命名。设成 `Orca` 会打出一个 `Orca.app`，拖进「应用程序」时会覆盖正式版。

## 和 Orca 正式版同时运行时的已知问题

以下问题暂未处理，0.1.0 调试阶段先规避：

- **不要在 cocos-agent 里点「安装命令行工具」**：它会把 `/usr/local/bin/orca` 改成指向 cocos-agent。
- **不要在 cocos-agent 里重置「电脑操控（Computer Use）」权限**：辅助程序的 bundle id 仍是 `com.stablyai.orca.computer-use`，重置会同时清掉正式版的辅助功能和录屏授权。
- **`~/.orca` 两边共用**：快捷键、agent hook 脚本、部分 API key 都在这里。加密的 key 两边互相解不开，在 cocos-agent 里保存会覆盖正式版那份。
- **手机配对端口 6768**：谁先启动谁占用。cocos-agent 开着时重启正式版，正式版会换端口，已配对的手机要重新连接。
- **两边合计最多 256 个终端**。
- **设置里可选的「水彩 / 蓝色」备选图标、Windows 的 `icon.ico`、Computer Use 辅助程序的图标**还是 Orca 的。之后单独处理。

## 同步上游

- `origin`：`chongchong666999/orca`，cocos-agent 自己的代码推到这里。
- `upstream`：`stablyai/orca`，只用来拉上游代码。

```sh
git config rerere.enabled true   # 只需一次：记住冲突的解法，下次自动套用
git fetch upstream
git switch dev/0.1.0
git merge upstream/main
```

用 merge，不用 rebase：分支推到公司仓库后还有其他人在用，rebase 会改写历史。合并之后，对照上表检查每处改动是否还在。
