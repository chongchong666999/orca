# cocos-agent v0.1.0：内置 GitNexus Cocos Web 编辑器

2026-11-05 制定，同日确认 D1–D6；2026-11-06 用户调整优先级并授权继续实现：先交付安装后打开项目即可使用的内置编辑器，全局安装和外部 MCP 配置后置。涉及两个仓库：

- **cocos-agent**：`/Users/free/Documents/work/orca`，分支 `dev/0.1.0`
- **GitNexus**：`/Users/free/Documents/work/GitNexus`，分支 `feature/node-editor-view`。a5-game-context、Web 编辑器、cocos-cli 都在这个仓库

## 后续工作台阶段（2026-11-06 新增）

用户已确认内置编辑器体验，当前优先交付右侧终端。第一版侧栏预览方案经用户实测退回；修订为独立终端入口、完整 TerminalPane 与持久化侧栏归属，恢复原智能体入口。新方案入口见 [工作台设计与交付目录](docs/cocos-agent/README.md)。

| 范围                | 本轮交付                                                                                   | 状态                         |
| ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| 右侧终端            | 默认右侧，+ 选择普通终端或已配置 AI Agent；会话切换、输入、关闭，中央 Cocos 编辑器持续可见 | 修复完成，专项与实包验证通过 |
| 最多 3 个编辑器实例 | 每主机预算、LRU、脏文档/预览/任务保护、暂停恢复与内存验收方案                              | 仅文档，后续开发             |
| Play 浏览器预览     | Orca 独立浏览器标签；独立 Web 编辑器默认系统浏览器；就绪回执及停止规则                     | 仅文档，后续开发             |
| Cocos Web API v1    | 对照 cocos-cli headless 和 Rust Hub，设计统一 CLI/MCP/Web 契约、完整方法目录与视觉验证流程 | 仅文档，后续开发             |

本轮不修改 a5-game-context 的实例回收、Play 或自动化实现，也不恢复原生 Creator IPC 依赖。全局安装和外部 MCP 配置继续后置。Rust 不是零卡顿保证；切分支体验需要合并文件事件、增量更新与渲染任务隔离，后续以真实项目测量验收。

## v0.1.0 目标（仅 mac arm64，本地测试）

1. 在 cocos-agent 里打开 Cocos 2.4.13 项目时，自动打开这个项目的 Web 编辑器标签，编辑器路径就是项目路径。打开其他项目时，保持默认的终端。
2. GitNexus 的编辑器页面、原生服务、编译依赖和 Cocos SDK 全部随 app 安装；首次打开自动离线准备 SDK，不依赖开发目录、全局 npm 安装或系统 Node。app 内终端使用内置命令。
3. 在打包后的 app 中完成项目打开、场景/Prefab 编辑、保存、预览及重启恢复验收，再本地产出 ad-hoc 签名的 mac arm64 dmg、zip 和 sha256。
4. 全局命令安装、旧 npm 安装检测、外部 Claude hooks/skills/MCP 配置移到后续里程碑，不作为本轮验收前提。

### 本轮执行顺序与验收边界（2026-11-06）

- 先收尾 S1.7、S2.2，再完成 S2.3 内置打包和 S2.4 首开初始化；复用 GitNexus 已有 Web 编辑器及 Orca 浏览器标签。
- S3 验收以打包 app 为准：在独立用户配置、空 SDK 缓存和无系统 Node 的环境中，打开本地 Cocos 2.4.13 项目，编辑并保存临时项目副本，预览，关闭与重开；普通项目和 Folder Workspace 也要验证。
- 原生窗口保持隐藏，以 `ORCA_BACKGROUND_LAUNCH=1` 和 Playwright CDP 验证，固定 viewport/state；不操作用户正在使用的 Orca、Paseo 或 Creator。
- 当前会话可在本机编译和执行验证；旧记录中的“沙箱编不了”是当时的环境限制。实施、构建和验收持续推进，独立审核仍按下文执行。
- 只在本地提交和出包；D1、D6 的不发布 npm、不 push 边界继续有效。

## 初始基线（2026-11-05 历史快照；当前进度见步骤总表和执行记录）

| 项目                         | 状态                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cocos-agent                  | `dev/0.1.0` 已有 3 个提交：打包身份、图标、界面文案；`dist/mac-arm64/cocos-agent.app` 调试包已打出                                                                                                           |
| Web 编辑器                   | 只在 GitNexus 的 `feature/node-editor-view` 分支上（3.8.267）。该分支领先 `main` 232 个提交、落后 58 个，从未发布过                                                                                          |
| mac 原生二进制               | 打包用的 `native-engine/bin/darwin-arm64/a5-game-context` 是 3.8.230（10-24）。`native-engine/target/release/` 里的是 3.8.267，但编译于 11-04 22:53，早于分支最新提交（11-05 05:43）。**发布前必须重新编译** |
| 已全局安装的 a5-game-context | 3.8.66（nvm），没有 `editor` 命令，也不带 `editor-web/`                                                                                                                                                      |
| 沙箱能做的验证               | cocos-agent：`tsc` 类型检查可以跑（node 侧约 90 秒）。GitNexus：沙箱里没有 crate 缓存，**编不了 Rust**，Rust 的编译和测试要你来跑                                                                            |

## 整体架构

```
cocos-agent.app/Contents/Resources/
├── a5-game-context/                  GitNexus 分支打出的 mac 包，固定版本，用 sha256 校验
└── bin/a5-game-context、bin/cocos-cli  启动脚本，用 app 自带的 Electron 充当 Node
      ↑ 打包后，app 内所有终端和 Agent 的 PATH 都会优先包含 Resources/bin，不用改代码

打开工作区 → 判断是否 Cocos 项目（有 project.json 文件和 assets/ 目录）
  ├─ 是 → 主进程执行 `a5-game-context editor open --project <工作区路径>`
  │       → 拿到 {"url": ...?token=…} → 在浏览器标签里打开（每个项目只开一个）
  └─ 否 → 和原来一样，打开终端

首次打开编辑器 → 自动注册包内 Cocos SDK → editor open → 应用内编辑、保存、预览

后续里程碑：设置 → 全局安装命令 + setup（hooks、skills、MCP）+ claude mcp add
```

**关键取舍**

1. **直接调用 GitNexus 已有的 `editor open` 命令，cocos-agent 不自己管理编辑器进程。** 这个命令已经处理好了：每个项目只起一个服务，有进程锁和运行记录（`~/.context-engine/editor/running/`），没有连接时会自己退出（idle-exit）。这样 app、命令行和 MCP 共用同一个编辑器实例，cocos-agent 要写的代码最少。依据：`native-engine/src/editor/project_ops.rs:402-457`、`server.rs:2311-2395`。
2. **用 Electron 充当 Node，不另外打包 Node**（D5）。设置 `ELECTRON_RUN_AS_NODE=1` 和 `A5_NODE_EXE`，能省大约 100MB。S1.2 验证；验证不通过再回来改 D5。
3. **继续用覆盖层**：新增的打包资源写在 `config/electron-builder.cocos-agent.cjs` 里，上游文件总共只改约 5 处、十来行，每处都登记在 `COCOS-AGENT.md`。
4. **GitNexus 的改动都在 `feature/node-editor-view` 上做**，给 cocos-agent 用的包也从这个分支本地打（D1）。

## 决定（2026-11-05 已确认）

| #   | 决定                     | 结论                                                                                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | GitNexus 包怎么发布      | 从分支本地打 mac tarball 和 sha256，放在本机。**不上 GitHub，不发 npm**，不影响现在用 npm 安装的同事                                  |
| D2  | mac 签名                 | ad-hoc 签名，附首次打开说明（右键选「打开」，或去掉隔离属性）                                                                         |
| D3  | CPU 架构                 | 只出 arm64                                                                                                                            |
| D4  | 版本号                   | app 内部版本继续用 Orca 的版本号（守护进程、CLI 的兼容检查都依赖它），「关于」里另外显示 cocos-agent 0.1.0                            |
| D5  | 编辑器用什么跑 Node      | Electron 充当 Node；S1.2 已验证通过（2026-11-06）                                                                                     |
| D6  | cocos-agent 的代码放在哪 | `origin` = `git@github.com-chongchong666999:chongchong666999/orca.git`。loop 只在本地 commit，**push 要你明确说**。release 包本地分发 |

2026-11-06 D2 补充：公司内部继续使用无证书 ad-hoc 包；每次打包独立系统权限标识，避免新旧包争用同一文件夹授权。首次打开按系统“仍要打开”确认，新构建需分别授权。安装说明以 [权限记录](docs/cocos-agent/macos-internal-distribution-2026-11-06.md) 为准。

## 步骤总表

状态：`待做` / `进行中` / `待你验证` / `完成` / `阻塞` / `v0.1 不做`。

「执行」一列保留历史分工。2026-11-06 你授权继续完成剩余工作后，本机编译、后台应用验证、独立审核和本地出包都由我完成；另一台 Mac 的真实安装和原生可见窗口验收仍单独标明，不能用后台测试冒充。

当前会话可以直接构建和运行后台应用。独立代码审核继续使用 Paseo 的 `codex/gpt-6.1-sol`（high，`full-access`）；本轮把相互依赖的 S2.2–S2.4 与 S5.2–S5.3 作为一个内置应用交付审核，记录各项验证证据。

| ID   | 步骤                                                 | 仓库        | 依赖             | 执行  | 状态                      |
| ---- | ---------------------------------------------------- | ----------- | ---------------- | ----- | ------------------------- |
| S0.1 | 调试包冒烟测试                                       | cocos-agent | —                | 你    | 完成                      |
| S1.1 | 重新编译 mac 原生二进制                              | GitNexus    | —                | 你    | 完成                      |
| S1.2 | 验证 Electron 充当 Node 能跑编辑器                   | GitNexus    | S1.1             | 我+你 | 完成                      |
| S1.3 | 离线首开：内置 TypeScript 4.1.3                      | GitNexus    | S1.1             | 我+你 | 完成                      |
| S1.4 | `setup` 能指定 hook 用的 Node                        | GitNexus    | S1.1             | 我+你 | v0.1 不做                 |
| S1.6 | `editor open --project` 不带文档时打开项目           | GitNexus    | S1.1             | 我+你 | 完成                      |
| S1.5 | 本地出 mac 包（tarball + sha256）                    | GitNexus    | S1.2、S1.3、S1.6 | 我+你 | 完成                      |
| S1.7 | Creator 等子进程不继承 `ELECTRON_RUN_AS_NODE`        | GitNexus    | S1.5             | 我    | 完成                      |
| S2.1 | 导入并校验 a5-game-context 包的脚本                  | cocos-agent | S1.5             | 我    | 完成                      |
| S2.2 | 启动脚本 `a5-game-context`、`cocos-cli`              | cocos-agent | S2.1             | 我    | 完成                      |
| S2.3 | 把包打进 .app，app 内终端可用                        | cocos-agent | S2.2、S1.7       | 我    | 完成                      |
| S2.4 | 首次打开编辑器前注册内置 Cocos SDK                   | cocos-agent | S2.3             | 我    | 完成                      |
| S3.1 | 主进程编辑器服务（检测、打开、停止）                 | cocos-agent | —                | 我+你 | 完成                      |
| S3.2 | 打开 Cocos 项目时自动开编辑器标签                    | cocos-agent | S3.1             | 我    | 完成                      |
| S3.3 | 「+」菜单加「Cocos Creator」（新建或切换到已有标签） | cocos-agent | S3.2             | 我+你 | 完成                      |
| S3.4 | 编辑器生命周期（关标签、切项目、退出 app）           | cocos-agent | S3.2             | 我    | 本机短时验收完成          |
| S4.1 | 全局安装器（链接、SDK、setup、MCP）                  | cocos-agent | S2.3             | 我+你 | v0.1 不做                 |
| S4.2 | 检测旧的 npm 全局安装                                | cocos-agent | S4.1             | 我    | v0.1 不做                 |
| S4.3 | 全局安装设置页入口                                   | cocos-agent | S4.2             | 我+你 | v0.1 不做                 |
| S5.1 | 版本号和「关于」页                                   | cocos-agent | —                | 我    | 实现完成；原生外观未验    |
| S5.2 | ad-hoc 签名和首次打开说明                            | cocos-agent | S2.3             | 我    | 完成                      |
| S5.3 | release 构建脚本（dmg、zip、sha256）                 | cocos-agent | S5.1、S5.2       | 我    | 完成                      |
| S5.4 | 在干净环境验收                                       | —           | S5.3             | 我    | 本机通过；另一台 Mac 未验 |
| S5.5 | 本地出 v0.1.0 包，写发布说明                         | cocos-agent | S5.4             | 我    | 完成                      |

S1–S3 的本机集成和 S5 本地出包已完成；原生可见窗口与另一台机器安装的未覆盖项保留在验收记录中。

## 自动验收与保留项

本轮由我完成本机后台验收，不再要求用户先安装全局命令或手工跑开发服务。结果与限制见 [验收记录](docs/cocos-agent/acceptance-2026-11-06.md)。

- 已验证：空 SDK 首开、项目自动进入编辑器、Prefab 编辑保存、场景渲染、游戏预览、插件、菜单复用/停止、关闭标签保留服务、普通 Folder Workspace 终端、切换项目、退出清理。
- 最终包已验证重启后旧标签被替换为一个可用的新标签，全新配置首开与预览通过；本地 dmg、zip 和 sha256 已生成并校验。
- 原生可见窗口、Dock 和「关于」面板人眼检查，以及另一台 Mac 的 Gatekeeper/安装体验仍未执行；不为这些检查激活用户桌面上的窗口，也不把后台验收冒充另一台机器验证。
- 10 分钟空闲退出和大型业务项目长时间稳定性不是本轮短时冒烟的覆盖范围。

## 步骤详情

### P0 基线

**S0.1 调试包冒烟测试**：打开 `dist/mac-arm64/cocos-agent.app`，和 Orca 正式版同时开着。

- 完成标准：
  - 菜单、窗口标题、Dock 显示的都是 cocos-agent；
  - 生成了 `~/Library/Application Support/cocos-agent`；
  - app 内终端执行 `orca --version` 能输出版本；
  - 「检查更新」显示已是最新；
  - Orca 正式版的终端没有受影响。

### P1 GitNexus（`feature/node-editor-view`）

改 GitNexus 时，遵守它自己的 `AGENTS.md` / `CLAUDE.md`，包括每个提交都要升版本号。仓库里不属于本计划的未跟踪文件不要提交。

Rust 改动在本机编译和测试，独立 Codex 审核后本地提交；没编译过的 Rust 代码不提交。只有实际遇到执行环境限制时才安排执行 agent，不把历史沙箱限制当作当前阻塞。

**S1.1 重新编译 mac 原生二进制**：`cd context-engine && npm run build:native`（需要 Rust 工具链和网络，会下载 crate）。

- 完成标准：`native-engine/bin/darwin-arm64/a5-game-context --version` 输出 3.8.267 或更高；二进制的修改时间晚于分支最新提交。

**S1.2 验证 Electron 充当 Node**：用 cocos-agent 的 Electron（`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`）跑编辑器：设置 `ELECTRON_RUN_AS_NODE=1`、`A5_NODE_EXE`、`A5_NODE_BINARY`，执行 `editor serve --project <wptg-client> --ready-file <临时文件>`。

- 完成标准：
  - 输出 ready JSON；
  - `GET /project/info` 返回的是这个项目的根目录；
  - 打开一个 prefab，不出现编译错误（编译进程池正常工作）。
- 失败时：如果是 GitNexus 启动子进程时丢了环境变量，就在 GitNexus 里修；如果是根本性的问题，停下来和你重新定 D5。

**S1.3 离线首开**：现在首次运行要从 Creator 或 npmjs 下载 TypeScript 4.1.3（`runtime/preview_compiler.rs:76,117-200`）。改成把它打进包里，或者允许用环境变量指定目录。

- 完成标准：用一个空的临时 `~/.context-engine`、在不联网的情况下，首次打开 wptg-client 成功。

**S1.4 hook 不依赖系统 Node（v0.1 不做，2026-11-06 你定）**：同事机器上本来就有 Node（以前就是 `npm -g` 安装），cocos-agent 里编辑器和编译进程池已经用 Electron，只剩 Claude hook 依赖 `node`，为它处理 Windows 的 hook shell 不划算。代码留在 GitNexus 的 git stash（"cocos-agent S1.4 setup --node (3.8.270), pending user decision"），需要时 `git stash list` 找到后 `git stash show -p` 查看。原设想：现在 `setup` 写进 `~/.claude/settings.json` 的命令是 `node "<hook>"`（`native-engine/src/main.rs:924-990`），没装 Node 的同事会失败。增加 `--node <路径>` 参数，cocos-agent 安装时传 app 的启动脚本。

- 完成标准：指定 `--node` 后写进去的命令能用；不指定时行为不变；有对应测试。

**S1.6 `editor open` 不带文档时打开项目**（2026-11-05 做 S3.1 时发现）：现在 `editor open` 必须带一个 prefab 或 scene 参数（`editor/server.rs` 的 `open_cli`），否则只打印用法。cocos-agent 打开项目时没有指定文档。改成：给了 `--project`、没给文档时，直接返回 `start_editor` 的页面地址，输出 `{"event":"open","url","project","doc":null,"running"}`。`start_editor` 本身已经支持不带文档，改动只在参数解析。

- 完成标准：`editor open --project <wptg-client>` 输出带 token 的页面地址；带文档时行为不变；`EDITOR_USAGE` 同步更新；有对应测试。

**S1.5 本地出 mac 包**：基于 `pack:offline`，产出 `a5-game-context-<版本>-darwin-arm64.tgz` 和 `.sha256`，只包含 arm64 二进制，放在 GitNexus 仓库里一个被 git 忽略的目录（例如 `context-engine/release/`）。

- 实际做法（2026-11-06）：`pack:offline` 会把 `node_modules` 里旧的平台包原样打进去（本机是 10-16 的二进制），还要求全部三个平台，所以新增 `npm run pack:platform`（GitNexus `scripts/prepare-platform-bundle.mjs`）：用本次编译的二进制替换平台包、只校验目标平台、按 npm 的 os/cpu 规则删掉别的平台、检查必需条目和二进制版本。产物 `context-engine/release/a5-game-context-<版本>-darwin-arm64.tgz` + `.sha256`（git 忽略）。

- 完成标准：解压到临时目录后，`--version` 输出期望版本，并按 S1.2 的方法验证编辑器能启动。

**S1.7 Creator 等子进程不继承 `ELECTRON_RUN_AS_NODE`**（2026-11-06 S2.2 审核发现）：cocos-agent 的启动脚本设 `ELECTRON_RUN_AS_NODE=1`，让 app 自带的 Electron 充当 Node，GitNexus 会把它原样传给所有子进程。编辑器「构建」面板用继承的环境启动 Cocos Creator（`editor/builder.rs` 的 `spawn`），Creator 2.4 是 Electron 应用，会以 Node 模式启动，构建和编译都会失败；用外部程序打开文件（`editor/assets.rs`）也有同样的问题。

- 做法：原生二进制启动时把 `ELECTRON_RUN_AS_NODE` 从自己的环境里去掉；只给它用 `A5_NODE_EXE` 或 `A5_NODE_BINARY` 启动的 Node 进程（编译进程池、插件宿主、`creator_node`、`effect_compiler`、`engine_compile`）显式设 `ELECTRON_RUN_AS_NODE=1`（真正的 Node 会忽略这个变量）。改完重新打 3.8.271 的包，更新 `config/cocos-agent/a5-game-context.lock.json`。
- 完成标准：有对应测试；按 S1.2 的方法用 Electron 充当 Node 时，编辑器编译正常；在 cocos-agent 启动的编辑器里，构建面板能正常启动 Creator（由执行人验证）。

### P2 a5-game-context 内置到 cocos-agent

**S2.1 导入并校验包的脚本**：新增 `config/cocos-agent/a5-game-context.lock.json`（记录版本、文件名、sha256）和 `config/scripts/import-a5-game-context.mjs`（原计划叫 fetch；按 D1 只导入本地包，不下载）。

- 包的来源：默认 `../GitNexus/context-engine/release/<文件名>`，可以用环境变量 `A5_GAME_CONTEXT_TARBALL` 指定别的路径。v0.1 不做网络下载（D1）。
- 解压到 `resources/cocos-agent/a5-game-context/`。在 `resources/cocos-agent/` 下新建 `.gitignore`，避免改上游的 `.gitignore`。
- 完成标准：sha256 不一致时报错退出；重复执行时，已解压且版本一致就跳过。

**S2.2 启动脚本**：新增 `resources/cocos-agent/bin/a5-game-context` 和 `cocos-cli`，写法参照 `resources/darwin/bin/orca`：

- 从 Info.plist 读取可执行文件名；
- 设置 `ELECTRON_RUN_AS_NODE=1`、`A5_NODE_EXE`、`A5_NODE_BINARY`、`A5_GAME_CONTEXT_PACKAGE_ROOT`。
- 完成标准：用 symlink 调用时也能找到 app 路径；`bash -n` 检查通过。

**S2.3 把包打进 .app**：

- 覆盖层的 `mac.extraResources` 追加两项：包 → `a5-game-context/`，启动脚本 → `bin/`；
- `build-cocos-agent-mac.mjs` 打包前先执行导入脚本；
- 原生二进制和 dylib 用 ad-hoc 签名。
- 完成标准：
  - `cocos-agent.app/Contents/Resources/bin/a5-game-context --version` 输出正确；
  - app 内终端执行 `which a5-game-context`，指向 app 内的启动脚本。

**S2.4 首次打开编辑器前注册内置 Cocos SDK**（2026-11-06 S1.3 实测时发现）：编辑器编译脚本要用已注册的 Cocos 2.4.13 SDK（`~/.context-engine/sdk/registry.json` 里的条目和解压出的预览引擎），这一步原本由 npm 的 postinstall（`scripts/install-cocos-cli-bin.cjs` 的 `registerBundledSdks`）完成。cocos-agent 内置的包不走 npm 安装，没装过 a5-game-context 的同事第一次自动开编辑器会编译失败（`os error 2`）。

- 做法：主进程编辑器服务在执行 `editor open` 之前，检查 registry 里有没有 kind=cocos、version=2.4.13、cachePath 存在的条目；没有就用 Electron（`ELECTRON_RUN_AS_NODE=1`）执行内置包的 `scripts/install-cocos-cli-bin.cjs`（不设 `npm_config_prefix`，只注册 SDK，不联网），每次 app 启动最多做一次。
- 完成标准：空 HOME 的机器上第一次打开 wptg-client，编辑器能编译脚本；已注册过的机器不重复注册。

### P3 打开 Cocos 项目时自动开编辑器

**S3.1 主进程编辑器服务**：新增 `src/main/cocos-agent/`。

- 功能：
  - `detect(path)`：有 project.json 文件、有 assets 目录，并读出 project.json 里的版本；
  - `open(path, doc?)`：执行 `editor open --project`，解析返回的 JSON；
  - `stop(path)`：调用 `POST /shutdown?token=`；
  - `list()`。
- 用 IPC 暴露给渲染进程，preload 放在新文件里。
- 开发模式（`pnpm dev`）用环境变量 `A5_GAME_CONTEXT_BIN` 指定 a5-game-context。
- 上游改动：
  - `src/main/startup/main-process-ready-runtime.ts`：加 1 行注册（S5.1 时挪到 `main-process-ipc-bootstrap.ts`，见 COCOS-AGENT.md）；
  - `src/preload/index.ts`：加 1 行引入。
- 完成标准：
  - 我：node 侧类型检查通过；解析和进程调用的逻辑有必要的测试（遵守 AGENTS.md 的测试规则）；
  - 你（S1.1 之后）：在 dev 实例里通过 IPC 对 wptg-client 调 open，能拿到 URL。

**S3.2 打开项目时自动开编辑器**：

- 实际做法（2026-11-05，和最初设想有出入）：
  - 挂点：`worktree-initial-terminal-seeding.ts` 在默认终端模板之后、默认 agent 聊天之前调用 `openCocosEditorInEmptyWorkspace`（上游 4 行）。只要是空的本地工作区要生成首个界面、没有显式启动任务，就生效，不限于「用户主动打开」，所以「添加项目」入口也会开编辑器。
  - 是否 Cocos 项目在第一次用到时检测，按路径缓存。检测和启动编辑器期间用现有的 `holdEmptyWorkspaceDefaultSurfaceForLaunch` 占住首个界面，不建占位标签；拿到 URL 后再建浏览器标签。期间用户自己开了别的界面，编辑器标签照样建，但不抢焦点；工作区被移除或换了主机就放弃。
  - Cocos 2.x（或 project.json 没写版本）→ 编辑器；3.x → 提示只支持 2.4，走原逻辑；其他项目 → 原逻辑。
  - 编辑器启动失败 → 提示错误，回到原来的终端或默认聊天；30 秒内这个工作区不再自动重试。
  - 只对本地工作区生效；SSH、远程主机、web 客户端都不受影响。提示文案暂时是英文，没有加 i18n key（避免改上游语言文件）。
- 完成标准：
  - 我：web 侧类型检查通过；
  - 你：dev 实例里添加 wptg-client 后，第一个标签是编辑器，并且打开的是这个项目；添加普通仓库后，第一个标签是终端。

**S3.3 「+」菜单项「Cocos Creator」**：参照移动模拟器，项目里已有编辑器标签时显示「切换到 Cocos Creator」。子菜单里提供「停止编辑器」。

- 上游改动（实际）：`tab-bar-static-create-menu.tsx` 共 3 行。计划里的 `tab-create-menu-options.ts`、`use-tab-bar-create-menu-controller.ts` 只管菜单搜索结果，没有改，所以菜单里搜索时找不到这一项。
- 实际做法：只在本地 Cocos 2.x 工作区显示。有本次会话打开的编辑器标签时显示「Go to Cocos Creator」和「Stop Cocos Creator」，否则显示「Cocos Creator」。自动打开和菜单点击共用同一个进行中的请求，不会出现重复标签。停止成功会关闭标签。重启 app 后恢复的旧编辑器标签不算「已有」（S3.4 处理）。
- 完成标准：同一个项目第二次点，回到原来的标签；停止后再点，会重新启动。

**S3.4 编辑器生命周期**：

- 关掉标签后编辑器继续运行，没有连接 600 秒后自己退出；
- 在项目之间切换不会重启编辑器；
- 退出 app 时，对本次 app 启动的编辑器发 `/shutdown`。这个监听写在新文件里，用 `app.on('will-quit')` 注册。
- 实际做法（2026-11-06）：
  - 关标签、切项目：GitNexus 和现有标签模型本来如此，没有写代码。
  - 退出：`cocos-editor-quit.ts` 第一次 will-quit 时调用 `shutdownForQuit()`，直接 POST，不排队、不阻塞 Orca 的退出流程；之后的打开一律拒绝；退出时还在启动的编辑器启动完成后立刻停掉；app 已经退出时仍在启动的，由 GitNexus 无连接 600 秒自退兜底。
  - 重启后恢复的编辑器标签：cocos-agent 打开的编辑器标签地址带 `cocos-agent=editor` 标记。工作区变成当前工作区时，如果有带标记的旧标签，就启动或复用编辑器：地址相同就接管，否则先开新标签再关旧标签；只有旧标签原本是焦点才激活新标签；用户在这期间关掉了旧标签就不再新建。每个工作区每次会话只处理一次。「+」菜单对恢复的标签也显示「Go to Cocos Creator」。
- 完成标准：按清单手动验证；`~/.context-engine/editor/running/` 里的记录和实际进程一致。

### P4 后续里程碑：全局安装与外部 MCP（本轮不执行）

以下设计保留备查；SDK 首开初始化已归入 S2.4，不依赖全局安装。隐藏原有“安装 orca 命令”入口随本轮打包完成，避免覆盖正式版命令。

**S4.1 全局安装器**：新增 `src/main/cocos-agent/a5-game-context-global-install.ts`。

- 复用 `runMacPrivilegedCommand`，把 `/usr/local/bin/{a5-game-context,cocos-cli}` 链接到 app 内的启动脚本；
- 注册 SDK：做 postinstall 做的事，把 gcdb 解压到 `~/.context-engine/sdk`，并更新 registry.json；
- 执行 `a5-game-context setup`：安装 hooks、skills、Cursor MCP。hook 照旧用 PATH 上的 `node`；登录 shell 里找不到 `node` 时改用 `setup` 不装 hook 的方式（或装完提示），并在界面上说明「没有 Node，Claude Code 的图谱提示不可用，其他功能正常」；
- 机器上有 `claude` 时，执行 `claude mcp add -s user a5-game-context -- a5-game-context mcp`；
- 卸载时只删除指向本 app 的链接。
- 完成标准：
  - 在 app 外新开的 Terminal 里，`a5-game-context --version` 输出内置版本；
  - `claude mcp list` 里有 a5-game-context；
  - 卸载后恢复原样。

**S4.2 检测旧的 npm 全局安装**：在登录 shell 里执行 `which -a a5-game-context`，找出 nvm 或 npm 装的旧版本（例如 3.8.66），显示哪一个实际生效，并给出卸载旧版本的命令。

- 完成标准：在本机能识别出 nvm 下的 3.8.66，并说明它会盖过 `/usr/local/bin` 里的链接。

**S4.3 设置页入口**：新增设置区块组件，在 `GeneralPane.tsx` 里挂上，大约 1 行。同时隐藏 Orca 原有的「安装 orca 命令行」，避免把 `/usr/local/bin/orca` 改成指向 cocos-agent。

- 完成标准：截图确认；安装、卸载流程都能走通。

### P5 本地出 v0.1.0（mac arm64）

- **S5.1 版本号和「关于」页**：按 D4 实现。实际做法：`src/shared/cocos-agent/cocos-agent-version.ts` 定义 `COCOS_AGENT_VERSION = '0.1.0'`；`gpu-lifecycle.ts` 里「关于」面板的 `appVersion` 改用它（上游 1 行），mac 上显示「Version 0.1.0 (Orca 构建号)」。设置页「更新」里的 Current version 仍是 Orca 内部版本（上游测试断言了原文，D4 也只要求「关于」）。验证：你打开 cocos-agent → 菜单「关于 cocos-agent」，看到 0.1.0。
- **S5.2 ad-hoc 签名和首次打开说明**：.app 和内置的 a5-game-context 原生二进制、dylib 都用 ad-hoc 签名，`codesign --verify --deep` 通过；在 `COCOS-AGENT.md` 写首次打开的方法（右键选「打开」，或 `xattr -dr com.apple.quarantine /Applications/cocos-agent.app`）。
- **S5.3 release 构建脚本**：`build-cocos-agent-mac.mjs --release`，产出 arm64 的 dmg、zip 和 sha256。
- **S5.4 在干净环境验收**：使用打包后的 app、隔离 HOME/用户配置、空 SDK 缓存和不含 Node 的 PATH；另一台 Mac 或新系统用户验证是进一步的真实安装证据：
  - 走一遍：解包/安装 → 打开临时 Cocos 项目副本 → 自动准备 SDK → 编辑场景/Prefab → 保存落盘 → 预览 → 退出 → 重开恢复；不设置开发用二进制路径，不执行全局安装或外部 MCP 配置；
  - 检查普通项目、Folder Workspace、重复打开、关标签、切项目、停止和退出；测试用项目副本保护原项目；
  - 记录首次打开耗时、内存占用、viewport/state、截图和错误日志，区分自动验证与尚未执行的另一台机器安装。
- **S5.5 本地出包**：写发布说明，更新 `COCOS-AGENT.md`。是否 push 到 `origin`、是否建 GitHub release，到时由你决定。

### v0.1 之后（不在这一轮 loop 里）

- cocos-agent 自己的更新源；
- 限制同时运行的编辑器数量，后台编辑器自动休眠；
- 编辑器标签隐藏地址栏；
- 支持 Cocos 3.x；
- 用 loop 定期同步上游，并报告冲突；
- 剩下的 Orca 文案。

## Codex 审核（每一步都做）

每个步骤在我自己的验证通过之后、提交之前，交给 Codex（`gpt-6.1-sol`，推理档位 `high`，`full-access` 模式，2026-11-05 你改定；原先的 `gpt-6.1-terra` `max` 两次都没出结果）通过 Paseo 审核一次。

**做法**

1. 把这一步的改动按文件名 `git add`（新文件也要加），让 `git diff --cached` 就是完整的改动。
2. 在后台执行下面的命令，等完成通知，不轮询：

```sh
/Applications/Paseo.app/Contents/Resources/bin/paseo --host 127.0.0.1:6767 run \
  --provider codex/gpt-6.1-sol --thinking high --mode full-access \
  --cwd <仓库路径> --title "cocos-agent review <步骤ID>" \
  --label project=cocos-agent --label step=<步骤ID> \
  --wait-timeout 60m --json \
  --output-schema '{"type":"object","additionalProperties":false,"required":["verdict","summary","findings"],"properties":{"verdict":{"type":"string","enum":["pass","changes_requested"]},"summary":{"type":"string"},"findings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["severity","file","line","issue","suggestion"],"properties":{"severity":{"type":"string","enum":["high","medium","low"]},"file":{"type":"string"},"line":{"type":"integer"},"issue":{"type":"string"},"suggestion":{"type":"string"}}}}}}' \
  "<审核提示>"
```

**审核提示**（替换尖括号里的内容）：

> 你是 cocos-agent v0.1.0 计划的代码审核人。只读审核：不要修改、新建或删除文件，不要 git add 或 commit，不要联网，不要构建或启动应用；可以读文件，可以运行 git diff、git log、rg 之类的只读命令。
>
> 审核对象：`<仓库路径>` 里已暂存的改动（`git diff --cached`），对应计划步骤 `<步骤ID>`。计划在 `/Users/free/Documents/work/orca/COCOS-AGENT-PLAN.md`，看该步骤的详情，以及「整体架构」「关键取舍」「决定」三节。仓库规则看该仓库的 AGENTS.md / CLAUDE.md；cocos-agent 仓库另外看 COCOS-AGENT.md（尽量少改上游文件，改了要登记）。<这一步我自己验证了什么、哪些没法验证>
>
> 请检查：1. 是否达成该步骤的完成标准，有没有漏做或多做；2. 正确性：bug、边界情况、错误处理、竞态，非 mac 平台是否安全退化；3. 安全：命令注入、路径处理、提权命令、token 泄露；4. 与上游的冲突面：上游文件的改动是否最小、是否已登记；5. 是否复用了已有代码，是否符合仓库规则（命名、注释、测试策略）。只报有依据的问题，写明文件和行号。没有问题就返回 pass。

**处理结果**

- 我逐条判断，不照单全收。high 和 medium：改，或者在执行记录里写明不改的理由；low：顺手能改就改。
- 改完重新跑我的验证，再审核一轮。第二轮仍有 high，就把步骤标成「阻塞」，停下来问你。第二轮只剩 medium 或 low 时，改完再做一轮只看这次修复的收口审核，然后无论结果如何都结束审核：有 high 就阻塞，其余记入执行记录。
- 在执行记录里记下 Paseo agent ID、结论和处理情况。之后要看完整意见：`paseo --host 127.0.0.1:6767 logs <agent ID>`。
- `full-access` 是你指定的；审核人仍然按提示词只读，不改文件、不提交。
- 卡住的判断：codex 的会话记录（`~/.codex/sessions/<日期>/rollout-*-<thread>.jsonl`）超过 15 分钟没有新输出，就 `paseo stop` 加 `paseo archive`，重跑一次；重跑还卡住，就停下来告诉你。审核被你在 Paseo 里取消时，不自动重跑，先问你。

**Codex 审核不能代替人工审核**（公司 AI 代码政策第 6 条）。loop 的提交都只在本地，push 之前由你看过 `git log -p`。

## Loop 执行规则

启动命令：`/loop 按 COCOS-AGENT-PLAN.md 的「Loop 执行规则」做下一步`

1. 以 2026-11-06 的最新授权为准：先完成内置编辑器交付，相关实现、问题修复、后台验证、独立审核和本地提交连续推进。
2. 相互依赖的打包与初始化步骤可以合并验收；遇到失败先定位、修复和复验，不因失败次数或新增必要的上游挂点自动停工。
3. 改到上游文件时同步登记 `COCOS-AGENT.md`；保留已有本地修改，不夹带其他项目或索引文件。
4. 使用真实打包应用和临时项目副本验证。所有测试窗口后台运行；不能安全完成的原生可见窗口/另一台机器检查如实列为未覆盖。
5. 验证和独立审核后本地 commit、出包；不 push、不发布 npm、不创建 GitHub release。全局命令安装和外部 MCP 留给后续里程碑。
6. 执行记录写观察到的结果、证据路径和未覆盖项；不以更新历史审查收据掩盖失败，也不把增量检查称作全分支门禁通过。
7. 提交时按文件名暂存，不要提交 cocos-agent 仓库根目录的 `.context-engine/`，也不要提交 GitNexus 里不属于本计划的未跟踪文件。

## 执行记录

### 2026-11-06 内置应用交付收口

- GitNexus `5d7911f01`（3.8.271），Orca 实现提交 `7b9f96fd126c`，均仅本地提交。
- S1.7、S2.2–S2.4、S3.2–S3.4 本机短时验收、S5.2–S5.5 本地出包完成；S4 全局安装/外部 MCP 保持后置。
- 最终应用构建号 `1.4.214-local.1793950875656.7b9f96fd126c`。DMG/ZIP 位于 `dist/`，签名深度校验、SHA-256、DMG 校验及 ZIP 完整性检查通过。
- 最终隐藏窗口 1440×900、DPR 2：已有配置重启恢复、全新配置自动准备 SDK、Play、内置终端命令及退出服务清理通过。另有禁止读取本机 Creator/旧缓存及外网的 CLI 隔离编译证据。
- 验收包装器导致的 Chromium 启动崩溃已定位并去除；后台恢复失败不再弹原生对话框。独立复审 PASS。
- 详细测试数量、历史门禁失败、可见窗口/另一台 Mac 未覆盖项、产物哈希均见 [验收记录](docs/cocos-agent/acceptance-2026-11-06.md)。下表保留早期历史状态。

| 日期       | 步骤             | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Codex 审核                                                                                                                                                                                                                                                                                                                      | 提交                            |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 2026-11-05 | S3.1             | 待你验证。新增 `src/main/cocos-agent/`（检测、`editor open`、停止、IPC）、`src/preload/cocos-agent-preload.ts`、`src/shared/cocos-agent/`；上游改 3 行。node 侧 tsc、oxlint、oxfmt 通过，8 个测试通过。发现 `editor open` 必须带文档，新增 S1.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 先用 terra max 跑了两次都没出结果（本机 Codex 代理 127.0.0.1:17841 没开；第二次在 Paseo 被取消），改用 sol high full-access。第 1 轮 `8461f660`：2 条 medium（stop 先删记录；open 与 stop 不串行），已改。第 2 轮 `e520cb03`：1 条 medium（端口超时仍算停止成功），已改。第 3 轮 `2316470b`：pass                               | 见本行所在提交                  |
| 2026-11-05 | S3.2             | 待你验证。新增 `src/renderer/src/cocos-agent/`（首个界面挂点、本地路径按主机解析、检测缓存、失败冷却）；上游 `worktree-initial-terminal-seeding.ts` 4 行。web 侧 tsc、oxlint 三套配置、oxfmt 通过；相关 33 个现有测试通过（中途修了 node 测试环境没有 window 导致的 10 个失败）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | sol high full-access。第 1 轮 `1edd3227`：1 high（添加项目入口不触发）+ 2 medium（异步完成不校验所有权；文件夹工作区漏了继承的主机），已改。第 2 轮 `bf94ceda`：1 medium（失败标记只跳过一次，回退链会重启编辑器），已改为 30 秒冷却。第 3 轮 `4ae3d591`：pass                                                                  | 见本行所在提交                  |
| 2026-11-05 | S3.2 补提交      | 上游 `.gitignore` 忽略 `src/**/*.d.ts`，`window.cocosAgent` 的类型声明没进上一个提交，干净 checkout 会类型检查失败。改为 `src/renderer/src/cocos-agent/cocos-agent-window-types.ts`，内容不变；web 侧 tsc、oxlint 通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 纯文件改名，未单独审核                                                                                                                                                                                                                                                                                                          | 见本行所在提交                  |
| 2026-11-06 | S3.3             | 待你验证。新增 `CocosEditorMenuItems.tsx`、`cocos-editor-tabs.ts`、`cocos-workspace-project.ts`（S3.2 的渲染进程代码拆分后共用）；上游 `tab-bar-static-create-menu.tsx` 3 行（计划写的是另外两个文件，见 S3.3 详情）。web 侧 tsc、oxlint 三套配置、oxfmt 通过；tab-bar 与首个界面相关 87 个测试文件、809 个测试通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | sol high full-access。第 1 轮 `f321c625`：1 medium（打开请求没合并，并发会建重复标签），已改。第 2 轮 `d91a2cc7`：pass                                                                                                                                                                                                          | 见本行所在提交                  |
| 2026-11-06 | S3.4             | 待你验证。新增 `src/main/cocos-agent/cocos-editor-quit.ts`、`src/renderer/src/cocos-agent/cocos-editor-tab-refresh.ts`；service 增加 `shutdownForQuit`；编辑器标签地址加 `cocos-agent=editor` 标记，恢复的旧标签自动换成可用的；没有新的上游改动。node 与 web 侧 tsc、oxlint 三套配置、oxfmt 通过；新增 2 个测试；90 个测试文件、819 个测试通过（中途修了测试替身缺 `window.setTimeout`、缺 `browserTabsByWorktree` 引起的 12 个失败）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | sol high full-access。第 1 轮 `6ca95892`：4 medium（关唯一旧标签回欢迎页；焦点判断用错字段；用户关掉旧标签后仍新建；退出漏掉启动中的编辑器、停止排在打开后面），已改。第 2 轮 `3435d3ac`：pass                                                                                                                                  | 见本行所在提交                  |
| 2026-11-06 | S5.1             | 待你验证。新增 `COCOS_AGENT_VERSION`；`gpu-lifecycle.ts` 的「关于」面板改用它（上游 1 行）。另修 S3.1 回归：IPC 注册从 `main-process-ready-runtime.ts` 挪到 `main-process-ipc-bootstrap.ts`，上游启动测试恢复通过。node 侧 tsc、oxlint、oxfmt 通过；main/startup、menu、preload、cocos-agent、updater 共 1352 个测试通过，5 个失败均为沙箱禁止写 /tmp 的 updater 测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | sol high full-access。第 1 轮 `a7b44146`：pass                                                                                                                                                                                                                                                                                  | 见本行所在提交                  |
| 2026-11-06 | S1.1             | 完成。Paseo Gemini（`ea3ca1eb`）执行 `npm run build:native`：二进制 3.8.267，修改时间 11-06 08:01，晚于分支最新提交；`editor-web/dist` 早于最新 editor-web 提交，已用 `npm run build:editor` 重建。顺带验证 `editor open --project wptg-client <prefab>`：319 ms 返回 `{event, url, project, doc, running}`，`/shutdown` 后端口关闭、running 记录清掉，wptg-client 的 git status 前后一致。我抽查了版本、修改时间和 GitNexus 工作区，结果一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                               | 无代码改动                      |
| 2026-11-06 | S0.1             | 完成。Paseo Gemini（`c0ce61a9`）用 Node 24（nvm v24.22.2，只在命令里临时指定）重打调试包，后台启动并通过 CDP 检查：Info.plist 为 cocos-agent / com.a5labs.cocos-agent；生成 `~/Library/Application Support/cocos-agent`；窗口标题 cocos-agent；内置 `orca --version` 输出 1.4.214-local…；检查更新为 not-available；Orca 正式版 PID 463 不变，cocos-agent 没打开 orca 的数据目录。菜单栏和 Dock 名称按 CFBundleName 推断，没有截图。我复核了 Info.plist                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                               | 无代码改动                      |
| 2026-11-06 | S5.1 验证        | 部分完成：Gemini 解包 app.asar 确认主进程把 0.1.0 传给 `setAboutPanelOptions` 的 applicationVersion；原生「关于」面板读不到，等你看一眼                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                               | —                               |
| 2026-11-06 | S1.6             | 待你验证（剩用新二进制在 wptg-client 上实测）。GitNexus `feature/node-editor-view` 提交 `92598f529`（3.8.268）：`editor open --project` 不带文档时启动或复用编辑器，返回 `doc:null`、url 不带 `doc=`；`EDITOR_USAGE`、集成测试、CLI 技能文档、dev-log 同步更新，版本号 5 个文件同步。Paseo Gemini（`1c1d31e3`）跑 `cargo test`：集成测试 1 通过、`editor::server` 单元测试 14 通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | sol high full-access。第 1 轮 `074032b1`：代码无问题，1 low（CLI 技能文档没同步），已补并 `sync:skills`，文档改动未再审                                                                                                                                                                                                         | GitNexus `92598f529`（未 push） |
| 2026-11-06 | S1.3             | 待你验证（剩重新编译后，在断网、空 HOME 下首开 wptg-client）。GitNexus 提交 `c255e77ea`（3.8.269）：编译器来源顺序为 缓存 → 本机 Creator → 包内 `vendor/typescript-4.1.3.tgz` → npm，包内 tarball 按 npm integrity 校验，坏了直接报错；`npm run vendor:typescript` 下载并校验（git 忽略）；`pack:offline` 打包前执行它，并把它列为离线包必需条目。Paseo Gemini（`81ffe621`）：集成测试 10、单元测试 6、S1.6 回归 1 全过；tarball 10185695 字节，integrity 一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | sol high full-access。第 1 轮 `7ebdcca1`：1 high（没接入打包，干净检出会漏掉），已改。第 2 轮 `20b470f5`：pass                                                                                                                                                                                                                  | GitNexus `c255e77ea`（未 push） |
| 2026-11-06 | S1.2             | 完成，D5 成立。Paseo Gemini（`b5daf903`）：`env -i` 精简 PATH（没有 node）+ `ELECTRON_RUN_AS_NODE=1`、`A5_NODE_EXE`、`A5_NODE_BINARY` 指向 cocos-agent 的 Electron（Node 24.22.1），`editor serve` 1 秒内 ready；`/project/info` 返回 wptg-client 根目录；WebSocket 打开 SplashPage.prefab 得到 snapshot；强制全量重编 2380 个脚本无错误，编译进程池 4 个子进程都是 Electron；`/shutdown` 后进程和 running 记录清理干净；wptg-client git status 前后一致。GitNexus 启动子进程不清环境变量，S2.2 启动脚本要同时设这三个变量                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                               | 无代码改动                      |
| 2026-11-06 | S1.4             | 阻塞，等你决定。代码改好（`setup --node`，3.8.270），Gemini 测试 3+1 通过（含 Unix 下用 `sh -c` 实际执行的防注入测试），但第 2 轮审核仍有 1 high：Windows 上 Claude Code 用 Git Bash/PowerShell 跑 hook，双引号不安全、PowerShell 缺 `&`。我的建议是 v0.1 不做 S1.4（同事已有 Node；cocos-agent 里编辑器和编译进程池已经用 Electron，只有 Claude hook 依赖 node）。改动先 `git stash` 到 GitNexus 的 `stash@{0}`（"cocos-agent S1.4 setup --node (3.8.270), pending user decision"），补丁在 scratchpad `S1.4-setup-node.patch`                                                                                                                                                                                                                                                                                                                                                                                                | sol high full-access。第 1 轮 `51f31c5a`：1 high（$()/反引号注入）、1 medium（Windows 测试）、1 low（中央指南）已改。第 2 轮 `255ee046`：1 high（Windows shell）                                                                                                                                                                | 未提交                          |
| 2026-11-06 | S1.4             | v0.1 不做（你定）。理由：同事已有 Node，只有 Claude hook 依赖它。GitNexus 工作区不含这次改动，代码存档在 stash（"cocos-agent S1.4 setup --node (3.8.270), pending user decision"）；S1.5、S4.1 去掉对 S1.4 的依赖，S4.1 改为照旧 `setup`、没有 node 时提示                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                               | 未提交                          |
| 2026-11-06 | S1.6             | 完成。Paseo Gemini（`f91b0c33`）用 3.8.269 重编后实测：`editor open --project wptg-client`（不带文档）498 ms，返回 `doc:null`、url 带 token 且不含 `doc=`；`/shutdown` 后端口拒绝连接；wptg-client git status 前后一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                               | GitNexus `92598f529`            |
| 2026-11-06 | S1.3 实测 1      | 未通过，但不是 S1.3 本身的问题：空 HOME 下没有注册 Cocos SDK（`~/.context-engine/sdk/registry.json`），全量编译在 `preview::bundled_engine` 读 registry 时报 `os error 2`，没走到 TypeScript。真实机器装包后由 postinstall 注册 SDK；cocos-agent 内置包不走 postinstall，新增 S2.4。S1.3 改为先在临时 HOME 里注册 SDK 再离线首开，重测中                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                               | —                               |
| 2026-11-06 | S1.3 实测 2      | 完成。Paseo Gemini（`a0356dd1`）：临时空 HOME + 断网代理，先用 Electron 跑 `install-cocos-cli-bin.cjs` 注册内置 SDK（886 ms，离线），再 `editor serve` 打开 SplashPage、强制全量编译 2380 个脚本，无错误；TypeScript 来源为本机 Creator 的 app.asar（`creator-asar:`），没有联网下载。包内 `vendor/typescript-4.1.3.tgz` 这条路径本机走不到（装了 Creator），由单元测试覆盖，S5.4 在干净环境再实测。也验证了 S2.4 的做法可行                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                               | GitNexus `c255e77ea`            |
| 2026-11-06 | S3.1–S3.4 端到端 | Paseo Gemini（`cc8838fd`）在 dev 实例里跑到 S3.4 第 d 步时配额用完（约 4 天后重置），没写出最终报告；证据来自它留下的截图和我用 CDP 补做的检查。S3.1 完成（打开、停止、列表在后面的界面流程里都用到，`listEditors` 我用 CDP 调过）；S3.2：wptg-client 首个标签是加载好的「Cocos Creator」编辑器、GitNexus 首个标签是终端（截图），没装 a5-game-context 时只提示一次这一条还没测；S3.3 完成：「+」菜单有 Go to / Stop、Stop 后标签关闭并恢复为「Cocos Creator」、GitNexus 的菜单没有这两项（截图）；S3.4：重启后切到 wptg-client，恢复的标签换成新编辑器（端口 59032，带 `cocos-agent=editor`，只有一个编辑器标签，截图 scratchpad `s34d-after-switch.png`），用 CDP 正常退出 dev 实例后编辑器端口关闭、running 记录清掉；关标签后编辑器继续运行、切项目不重载这两条的输出没能取回。另见：编辑器控制台提示预览端口 7456 被占用，是本机 Cocos Creator 和 11-04 遗留的 a5-game-context 进程（PID 66180）占着，与 cocos-agent 无关 | —                                                                                                                                                                                                                                                                                                                               | 无代码改动                      |
| 2026-11-06 | S1.5             | 完成。GitNexus 提交 `1ff5dec9d`（3.8.270）：`npm run pack:platform`。Paseo Codex 执行（`codex/gpt-6.1-sol`）：重编 3.8.270，打出 `release/a5-game-context-3.8.270-darwin-arm64.tgz`（70.9 MB，解开 176 MB，sha256 `5c06ea3b8e6a68879402c2365c6fc97f2a267a25276b475373c5d35888cf5f26`，我复核一致），只有 arm64 原生包；Electron 跑包内 CLI 正常；空 HOME + 断网：包内脚本注册 SDK 1.1 s、`editor open --project` 0.58 s、全量编译 2380 个脚本成功、清理干净；两个仓库 git status 前后一致                                                                                                                                                                                                                                                                                                                                                                                                                                      | sol high。第 1 轮 `b695d73c`：2 medium（prepack 校验全部平台；必需条目缺 cocos-cli、resvg）+ 1 low（os/cpu 规则）已改。第 2 轮 `c78a77e1`：pass                                                                                                                                                                                 | GitNexus `1ff5dec9d`（未 push） |
| 2026-11-06 | S2.1             | 完成。新增 `config/cocos-agent/a5-game-context.lock.json`（3.8.270 darwin-arm64，sha256 `5c06ea3b…`）、`config/scripts/import-a5-game-context.mjs`（及测试）、`resources/cocos-agent/.gitignore`。sha256 或版本不一致报错；已导入且标记、版本、九个必需条目都在就跳过，缺任一项或 JSON 损坏就重新导入；在同级目录解包后整体替换，失败时还原旧包；跨进程锁，崩溃留下的锁只报告、不接管。oxlint、oxfmt 通过，5 个测试通过；真实 3.8.270 包里的九个必需条目我逐个核对过，都在。沙箱里解不开真实包（包内有 `.idea` 目录，沙箱禁止创建），真实导入随 S2.3 由执行人跑                                                                                                                                                                                                                                                                                                                                                                | sol high。第 1 轮 `63c0b246`：2 medium（跳过时只看标记文件；替换没有回滚）已改。第 2 轮 `767b6450`：3 medium（必需条目缺 cocos-cli；没有互斥；已装包的 JSON 损坏时直接抛错）已改。收口轮 `8531ddec`：1 medium（锁目录在写入 owner 之前会被当成死锁接管）已改为锁带着 owner 原子出现、不自动接管、只由持有者释放，按规则不再审核 | 见本行所在提交                  |
