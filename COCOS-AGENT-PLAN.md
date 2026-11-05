# cocos-agent v0.1.0 路线（按 loop 逐步执行）

2026-11-05 制定，同日确认 D1–D6。涉及两个仓库：

- **cocos-agent**：`/Users/free/Documents/work/orca`，分支 `dev/0.1.0`
- **GitNexus**：`/Users/free/Documents/work/GitNexus`，分支 `feature/node-editor-view`。a5-game-context、Web 编辑器、cocos-cli 都在这个仓库

## v0.1.0 目标（仅 mac arm64，本地测试）

1. 在 cocos-agent 里打开 Cocos 2.4.13 项目时，自动打开这个项目的 Web 编辑器标签，编辑器路径就是项目路径。打开其他项目时，保持默认的终端。
2. a5-game-context 内置在 app 里。app 内的终端直接就能用；设置里有一个「全局安装」按钮，效果等同以前的 `npm i -g` 再执行 `setup`。
3. 本地出 mac release 包（dmg 和 zip），ad-hoc 签名。

## 现状（2026-11-05 核实）

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

设置 → 全局安装 → /usr/local/bin/{a5-game-context,cocos-cli} 链接到 app 内的启动脚本
               + 注册 SDK + setup（hooks、skills、MCP）+ claude mcp add
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
| D5  | 编辑器用什么跑 Node      | Electron 充当 Node；S1.2 验证不通过时再改成打包独立 Node                                                                              |
| D6  | cocos-agent 的代码放在哪 | `origin` = `git@github.com-chongchong666999:chongchong666999/orca.git`。loop 只在本地 commit，**push 要你明确说**。release 包本地分发 |

## 步骤总表

状态：`待做` / `进行中` / `待你验证` / `完成` / `阻塞`。

「执行」一列：**我**＝在会话里写代码并验证；**你**＝需要在沙箱外操作（启动 GUI app、编译 Rust、需要管理员权限的命令），我会给出具体命令；**我+你**＝我写代码并做沙箱里能做的验证，剩下的验证你来跑。

| ID   | 步骤                                                 | 仓库        | 依赖             | 执行  | 状态 |
| ---- | ---------------------------------------------------- | ----------- | ---------------- | ----- | ---- |
| S0.1 | 调试包冒烟测试                                       | cocos-agent | —                | 你    | 待做 |
| S1.1 | 重新编译 mac 原生二进制                              | GitNexus    | —                | 你    | 待做 |
| S1.2 | 验证 Electron 充当 Node 能跑编辑器                   | GitNexus    | S1.1             | 我+你 | 待做 |
| S1.3 | 离线首开：内置 TypeScript 4.1.3                      | GitNexus    | S1.1             | 我+你 | 待做 |
| S1.4 | `setup` 能指定 hook 用的 Node                        | GitNexus    | S1.1             | 我+你 | 待做 |
| S1.5 | 本地出 mac 包（tarball + sha256）                    | GitNexus    | S1.2、S1.3、S1.4 | 我+你 | 待做 |
| S2.1 | 导入并校验 a5-game-context 包的脚本                  | cocos-agent | S1.5             | 我    | 待做 |
| S2.2 | 启动脚本 `a5-game-context`、`cocos-cli`              | cocos-agent | S2.1             | 我    | 待做 |
| S2.3 | 把包打进 .app，app 内终端可用                        | cocos-agent | S2.2             | 我+你 | 待做 |
| S3.1 | 主进程编辑器服务（检测、打开、停止）                 | cocos-agent | —                | 我+你 | 待做 |
| S3.2 | 打开 Cocos 项目时自动开编辑器标签                    | cocos-agent | S3.1             | 我+你 | 待做 |
| S3.3 | 「+」菜单加「Cocos Creator」（新建或切换到已有标签） | cocos-agent | S3.2             | 我+你 | 待做 |
| S3.4 | 编辑器生命周期（关标签、切项目、退出 app）           | cocos-agent | S3.2             | 我+你 | 待做 |
| S4.1 | 全局安装器（链接、SDK、setup、MCP）                  | cocos-agent | S2.3、S1.4       | 我+你 | 待做 |
| S4.2 | 检测旧的 npm 全局安装                                | cocos-agent | S4.1             | 我    | 待做 |
| S4.3 | 设置页入口，并隐藏 Orca 原有的「安装 orca 命令」     | cocos-agent | S4.2             | 我+你 | 待做 |
| S5.1 | 版本号和「关于」页                                   | cocos-agent | —                | 我+你 | 待做 |
| S5.2 | ad-hoc 签名和首次打开说明                            | cocos-agent | S2.3             | 我    | 待做 |
| S5.3 | release 构建脚本（dmg、zip、sha256）                 | cocos-agent | S5.1、S5.2       | 我+你 | 待做 |
| S5.4 | 在干净环境验收                                       | —           | S5.3             | 你    | 待做 |
| S5.5 | 本地出 v0.1.0 包，写发布说明                         | cocos-agent | S5.4             | 我+你 | 待做 |

S3.1 用开发版的 a5-game-context 就能写，端到端验证等 S1.1 编完再做；所以 S3 可以和 P1 并行推进。

## 等你操作

loop 不会因为这些步骤停下，会先做其他能做的步骤。做完了告诉我结果（贴输出即可）。

- **S0.1**：在你自己的终端执行 `open /Users/free/Documents/work/orca/dist/mac-arm64/cocos-agent.app`，按下面 S0.1 的完成标准检查。
- **S1.1**：`cd /Users/free/Documents/work/GitNexus/context-engine && npm run build:native`，然后执行 `native-engine/bin/darwin-arm64/a5-game-context --version`，贴输出。

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

沙箱里编不了 Rust，所以 Rust 改动的流程是：我写代码 → Codex 审核 → 你执行编译和测试命令 → 通过后我再提交。没编译过的 Rust 代码不提交。

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

**S1.4 hook 不依赖系统 Node**：现在 `setup` 写进 `~/.claude/settings.json` 的命令是 `node "<hook>"`（`native-engine/src/main.rs:924-990`），没装 Node 的同事会失败。增加 `--node <路径>` 参数，cocos-agent 安装时传 app 的启动脚本。

- 完成标准：指定 `--node` 后写进去的命令能用；不指定时行为不变；有对应测试。

**S1.5 本地出 mac 包**：基于 `pack:offline`，产出 `a5-game-context-<版本>-darwin-arm64.tgz` 和 `.sha256`，只包含 arm64 二进制，放在 GitNexus 仓库里一个被 git 忽略的目录（例如 `context-engine/release/`）。

- 完成标准：解压到临时目录后，`--version` 输出期望版本，并按 S1.2 的方法验证编辑器能启动。

### P2 a5-game-context 内置到 cocos-agent

**S2.1 导入并校验包的脚本**：新增 `config/cocos-agent/a5-game-context.lock.json`（记录版本、文件名、sha256）和 `config/scripts/fetch-a5-game-context.mjs`。

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
  - `src/main/startup/main-process-ready-runtime.ts`：加 1 行注册；
  - `src/preload/index.ts`：加 1 行引入。
- 完成标准：
  - 我：node 侧类型检查通过；解析和进程调用的逻辑有必要的测试（遵守 AGENTS.md 的测试规则）；
  - 你（S1.1 之后）：在 dev 实例里通过 IPC 对 wptg-client 调 open，能拿到 URL。

**S3.2 打开项目时自动开编辑器**：

- 渲染进程在加载仓库时异步检测并缓存「是否 Cocos 项目」；
- 在 `src/renderer/src/lib/worktree-initial-terminal-seeding.ts` 第 254 行之前加大约 4 行：
  - Cocos 2.4.x 项目 → 新文件 `openCocosEditorInEmptyWorkspace`：先建一个占位的浏览器标签，拿到 URL 后再设置进去；
  - 3.x 项目 → 打开终端，并提示「暂时只支持 2.4.13」；
  - 其他项目 → 走原来的逻辑。
- 完成标准：
  - 我：web 侧类型检查通过；
  - 你：dev 实例里添加 wptg-client 后，第一个标签是编辑器，并且打开的是这个项目；添加普通仓库后，第一个标签是终端。

**S3.3 「+」菜单项「Cocos Creator」**：参照移动模拟器，项目里已有编辑器标签时显示「切换到 Cocos Creator」。子菜单里提供「停止编辑器」。

- 上游改动：`tab-create-menu-options.ts`、`use-tab-bar-create-menu-controller.ts`，各改几行。
- 完成标准：同一个项目第二次点，回到原来的标签；停止后再点，会重新启动。

**S3.4 编辑器生命周期**：

- 关掉标签后编辑器继续运行，没有连接 600 秒后自己退出；
- 在项目之间切换不会重启编辑器；
- 退出 app 时，对本次 app 启动的编辑器发 `/shutdown`。这个监听写在新文件里，用 `app.on('will-quit')` 注册。
- 完成标准：按清单手动验证；`~/.context-engine/editor/running/` 里的记录和实际进程一致。

### P4 全局安装（等同 npm -g）

**S4.1 全局安装器**：新增 `src/main/cocos-agent/a5-game-context-global-install.ts`。

- 复用 `runMacPrivilegedCommand`，把 `/usr/local/bin/{a5-game-context,cocos-cli}` 链接到 app 内的启动脚本；
- 注册 SDK：做 postinstall 做的事，把 gcdb 解压到 `~/.context-engine/sdk`，并更新 registry.json；
- 执行 `a5-game-context setup --node <启动脚本>`：安装 hooks、skills、Cursor MCP；
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

- **S5.1 版本号和「关于」页**：按 D4 实现。
- **S5.2 ad-hoc 签名和首次打开说明**：.app 和内置的 a5-game-context 原生二进制、dylib 都用 ad-hoc 签名，`codesign --verify --deep` 通过；在 `COCOS-AGENT.md` 写首次打开的方法（右键选「打开」，或 `xattr -dr com.apple.quarantine /Applications/cocos-agent.app`）。
- **S5.3 release 构建脚本**：`build-cocos-agent-mac.mjs --release`，产出 arm64 的 dmg、zip 和 sha256。
- **S5.4 在干净环境验收**：找另一台 Mac，或者新建一个系统用户：
  - 走一遍：安装 → 打开 wptg-client → 编辑器出现 → 全局安装 → 在 Claude 里能用 MCP → 卸载；
  - 记录首次打开耗时和内存占用。
- **S5.5 本地出包**：写发布说明，更新 `COCOS-AGENT.md`。是否 push 到 `origin`、是否建 GitHub release，到时由你决定。

### v0.1 之后（不在这一轮 loop 里）

- cocos-agent 自己的更新源；
- 限制同时运行的编辑器数量，后台编辑器自动休眠；
- 编辑器标签隐藏地址栏；
- 支持 Cocos 3.x；
- 用 loop 定期同步上游，并报告冲突；
- 剩下的 Orca 文案。

## Codex 审核（每一步都做）

每个步骤在我自己的验证通过之后、提交之前，交给 Codex（`gpt-6.1-terra`，推理档位 `max`）通过 Paseo 审核一次。

**做法**

1. 把这一步的改动按文件名 `git add`（新文件也要加），让 `git diff --cached` 就是完整的改动。
2. 在后台执行下面的命令，等完成通知，不轮询：

```sh
/Applications/Paseo.app/Contents/Resources/bin/paseo --host 127.0.0.1:6767 run \
  --provider codex/gpt-6.1-terra --thinking max \
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
- 改完重新跑我的验证，再审核一轮。第二轮仍有 high，就把步骤标成「阻塞」，停下来问你。
- 在执行记录里记下 Paseo agent ID、结论和处理情况。之后要看完整意见：`paseo --host 127.0.0.1:6767 logs <agent ID>`。

**Codex 审核不能代替人工审核**（公司 AI 代码政策第 6 条）。loop 的提交都只在本地，push 之前由你看过 `git log -p`。

## Loop 执行规则

启动命令：`/loop 按 COCOS-AGENT-PLAN.md 的「Loop 执行规则」做下一步`

1. 读本文件。先处理你已经回报结果的步骤（「等你操作」里的，以及「待你验证」的）：通过就改成「完成」并补提交，不通过就修。
2. 从步骤总表里取第一个可以做的步骤，把它改成「进行中」。可以做是指：
   - 状态是「待做」；
   - 「执行」一列里有「我」；
   - 依赖都是「完成」或「待你验证」。只有「你」的步骤不会挡住 loop，写进「等你操作」就行。
3. 按「步骤详情」去做。改到上游文件时，同步更新 `COCOS-AGENT.md` 的登记表。
4. 按完成标准做我能做的验证，再做 Codex 审核，然后在对应仓库的分支上 commit（不 push），在执行记录里追加一行：
   - 剩下的验证都由我做完 → 状态改成「完成」；
   - 还有要你跑的验证 → 状态改成「待你验证」，把命令写进「等你操作」；
   - Rust 改动没编译过之前不提交，状态改成「待你验证」，把编译和测试命令写进「等你操作」。
   - 验证不通过就修了再验证；同一个步骤连续两次不通过，就改成「阻塞」，停下来。
5. 遇到下面任何一种情况，停下来问你，并给出可以直接执行的命令：
   - 没有可以做的步骤，只剩等你操作的；
   - 要改登记表以外的上游文件；
   - 结果和本计划的假设不一致。
6. 每一轮只做一个步骤。结束时汇报：做了什么、验证和审核的结果、等你操作的事项、下一步是什么。
7. 提交时按文件名暂存，不要提交 cocos-agent 仓库根目录的 `.context-engine/`，也不要提交 GitNexus 里不属于本计划的未跟踪文件。

## 执行记录

| 日期 | 步骤 | 结果 | Codex 审核 | 提交 |
| ---- | ---- | ---- | ---------- | ---- |
