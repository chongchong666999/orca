# 安装 cocos-agent 即可使用 a5-game-context 命令

2026-11-11。目标：在 macOS 和 Windows 上装好 cocos-agent，任何终端、Claude Code 和 Codex 用到的 `a5-game-context` 与 `cocos-cli` 都是 cocos-agent 自带的那一份，不再单独 `npm install -g`，版本始终跟随 cocos-agent。

## 起因

同一台机器上曾经同时存在全局 npm 安装的 3.8.67 和 cocos-agent 内置的 3.8.285。poker-game-dev 插件的 MCP 和 `~/.claude` 里的 hook 都通过 PATH 查找 `a5-game-context`，插件技能会调用 `cocos-cli workflow …`，所以 cocos-agent 之外用到的一直是旧版本。

cocos-agent 自己开的终端早已把 `Resources/bin` 放在 PATH 最前（`src/main/cli/orca-cli-child-path.ts`），因此 mac 上它内部的终端一直用的是内置版本。缺的是 cocos-agent 之外的终端和工具，以及整个 Windows。

## 做法

每次正式包启动时，`registerCocosAgentIpc` 在后台调用 `registerA5GameContextCommands`（`src/main/cocos-agent/a5-game-context-commands.ts`）。开发模式不注册，避免占用正式命令。

### macOS

- 读取用户登录 shell 的 PATH（`hostShellEnvironment`），在其中按顺序找第一个用户可写的常用 bin 目录：`~/.local/bin`、`~/bin`、`/opt/homebrew/bin`、`/usr/local/bin`。
- 在该目录建 `a5-game-context`、`cocos-cli` 两个软链接，指向 `<app>/Contents/Resources/bin/` 下的启动脚本。启动脚本顺着软链接找到 app，用 app 自带的 Electron 作为 Node 运行内置包。
- 只替换 cocos-agent 自己建的链接，也就是指向某个 `.app/Contents/Resources/bin/<同名>` 的链接，app 搬家或换了副本时会自动改指当前这份。已有的其他同名命令保留不动，并写进日志。
- PATH 上更靠前的位置如果有别的 `a5-game-context`，比如旧的 npm 全局安装，日志会写明是哪个文件挡住了内置版本。
- PATH 上一个候选目录都没有时，建 `~/.local/bin`，并在登录 profile 末尾追加一次带标记的 PATH 行：zsh 写 `~/.zprofile`，bash 写 `~/.bash_profile`。
- 从 DMG 里直接运行或被 macOS 随机转移（App Translocation）时不注册，因为链接会随这个临时位置失效。

### Windows

- 新增 `resources\a5-game-context-bin`，里面只有 `a5-game-context.cmd`、`cocos-cli.cmd`，以及两个给 Git Bash 用的同名脚本（Claude Code 在 Windows 上的 Bash 工具走 Git Bash，它不会按 PATHEXT 找 `.cmd`）。两类脚本都用 app 的 `Orca.exe` 作为 Node 运行内置包，并设置 `ELECTRON_RUN_AS_NODE`、`A5_NODE_EXE`、`A5_GAME_CONTEXT_PACKAGE_ROOT`。
- 启动时把这个目录加入用户 PATH，复用 Orca 的注册表读写（`readFreshWindowsUserPathRegistry`、`writeWindowsUserPath`）。同时删掉已经不存在的旧安装目录留下的同名条目。只在确实需要修改时写一次。
- NSIS 卸载时用 Orca 已有的 `ORCA_REMOVE_USER_PATH_ENTRY` 移除这个条目（`config/nsis/orca-installer-hooks.nsh`，上游挂点 2 行）。
- 打包：`config/electron-builder.cocos-agent.cjs` 新增 `win` 段，带上 a5-game-context 包、它的 node_modules、`prepare-editor.cjs` 和这个目录；`afterPack` 按 win32-x64 的 lock 检查必需文件。安装包名为 `cocos-agent-beta-windows-setup.exe`。
- 构建：`node config/scripts/build-cocos-agent-win.mjs [--skip-typecheck] [--release]`，只能在 Windows x64 上运行。

### 一个版本

`config/scripts/import-a5-game-context.mjs` 按平台读取 lock：darwin-arm64 用 `a5-game-context.lock.json`，其他平台用 `a5-game-context.<target>.lock.json`。任何平台的 lock 版本必须与 darwin-arm64 相同，否则导入直接失败。

## 决策

| 决策                                        | 理由与取舍                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 每次启动注册，而不是在安装器里做            | DMG 没有安装步骤，启动是 mac 唯一自然的时机；每次启动还能在 app 搬家后自动修正。代价是装完要先打开一次，NSIS 安装结束默认就会启动 app。 |
| mac 用软链接放进 PATH 上已有的用户 bin 目录 | 不需要管理员密码，也不改系统文件。只有一个候选目录都不在 PATH 上时，才改登录 profile。                                                  |
| 不替换别人的命令                            | 用户自己装的同名工具可能有用；挡住内置版本时只在日志里说明。                                                                            |
| Windows 用单独的 `a5-game-context-bin` 目录 | `resources\bin` 里还有 cocos-agent 自己的 `orca`，整体放进 PATH 会和真正的 Orca 抢 `orca` 命令。                                        |
| Windows 保留 `Orca.exe` 这个可执行文件名    | `native/windows-cli-launcher` 写死了要找 `Orca.exe`，改名会让 cocos-agent 自带的 `orca` 命令失效。                                      |
| 不改 Codex 等工具的配置                     | 那是用户自己的配置；插件和 hook 走 PATH，已经覆盖。Codex 里写死旧路径的，需要用户自己改成 PATH 上的命令。                               |

## Windows 现状与阻塞

orca 侧的代码、启动脚本、打包配置和卸载清理都已完成。真正产出可用的 Windows 安装包还卡在 GitNexus 和构建环境上：

1. **没有 3.8.285 的 win32-x64 包。** 原生引擎只能在 CI 的 Windows runner 上编译（`.github/workflows/build-native-artifacts.yml`，job “Native binary (win32-x64)”）。本机 `native-engine/bin/win32-x64/a5-game-context.exe` 停在 3.8.0。
2. **在 mac 上为 Windows 打包时，脚本不校验 exe 的版本。** 打包前需要手动确认 exe 里有 `a5-game-context 3.8.285` 字样。
3. **GitNexus 编辑器官方只支持 macOS**（产品规格 D-08），Windows 上的 `editor serve/open` 从未测试过。命令行和 MCP 的图谱工具与编辑器无关。
4. **cocos-agent 的 Windows 安装包从未构建过。** 构建要在 Windows 机器上运行，并依赖 Orca 的 Windows 原生产物。

产出 Windows 包的步骤：

1. 在 3.8.285 的 GitNexus 提交上触发 `build-native-artifacts.yml`，下载 `native-engine-win32-x64`，放进 `context-engine/native-engine/bin/win32-x64/`。
2. 在 `context-engine` 目录运行 `node scripts/prepare-platform-bundle.mjs --target win32-x64`，得到 `release/a5-game-context-3.8.285-win32-x64.tgz` 及 `.sha256`。
3. 在 orca 新增 `config/cocos-agent/a5-game-context.win32-x64.lock.json`，字段与 mac 的 lock 相同，`target` 为 `win32-x64`，版本必须一致。
4. 在 Windows 上运行 `node config/scripts/build-cocos-agent-win.mjs --release`，安装后打开一次，再新开一个终端执行 `a5-game-context --version`。

## 验证

- mac 注册逻辑：临时目录中的实际软链接测试。覆盖三种情况：选 PATH 上第一个可写候选目录；替换旧 cocos-agent 的链接，保留别人的同名命令，报告挡住内置版本的文件；没有候选目录时回退到 `~/.local/bin`，并只写一次 zprofile。
- Windows PATH 逻辑：注入注册表读写的测试，确认只写一次，并删掉已卸载安装的条目。
- lock：不同平台版本不一致时拒绝导入。
- 上述三处逻辑分别撤回后，对应测试都会失败。
- Git Bash 启动脚本在模拟的安装目录中实际运行过：路径含空格也能找到 `Orca.exe`，参数和环境变量都正确，缺少 exe 时报错退出。
- `.cmd` 脚本、Windows 安装包和 NSIS 卸载清理都没有在 Windows 上运行过。
