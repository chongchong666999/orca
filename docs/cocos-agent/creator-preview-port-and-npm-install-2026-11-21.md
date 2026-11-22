# Creator 预览端口冲突与 a5-game-context 改用 npm 安装

2026-11-21。状态：已在 `dev/0.1.3` 实现（见文末"实现记录"）；GitNexus 部分在 `fix/devices-preview-port-handoff`（5.0.28）。本文记录两个问题的根因（已在本机复现）、决策和改动清单。

## 问题 1：开着 cocos-agent 时 Cocos Creator 无法预览

### 现象

在 cocos-agent 里打开 Cocos 项目并点过预览后，Cocos Creator 2.4.13 的浏览器预览打不开自己的项目：跳到 cocos-agent 的项目，或显示 503 "Select an available Cocos project in cocos-agent-beta"。+ 菜单里已有的"停止 Cocos Creator"也救不回来。

### 根因

这是端口占用，但不会报错。

1. **orca 的预览入口一直占着 7456。** `src/main/cocos-agent/cocos-preview-router.ts` 的 `CocosPreviewRouter` 实现了 [Creator 对等规格](creator-parity-beta-spec-2026-11-07.md) 第 4 条"当前项目预览入口"：`localhost:7456` 的请求转到 cocos-agent 当前选中的项目。
   - 第一次打开 Cocos 项目时，`cocos-editor-service.ts` 的 `openEditor` 调用 `preview.start()`，绑定 `127.0.0.1:7456` 和 `::1:7456`。
   - 只有退出 app 时（`shutdownForQuit`）才释放。单个项目的"停止 Cocos Creator"只停编辑器服务，不关这个入口，所以停了以后 Creator 仍然预览不了。
2. **Creator 不会发现冲突。** Creator 的预览服务是 `server.listen(7456)`，不带 host，监听的是 `::` 通配地址（REA 恢复源码 `editor/lib/preview-server/index.ccc.js` 的 `_listenByPort`）。它只在收到 EADDRINUSE 或 EACCES 时才把端口 +1。
   - macOS 允许通配地址和具体的回环地址共用同一个端口，所以 Creator 的 `listen` 照样成功，控制台显示 `preview server running at http://localhost:7456`。
   - Creator 点预览打开 `http://localhost:7456`（`app-ipc.ccc.js` 的 `app:play-on-device`）。本机回环连接优先交给绑定地址更具体的 socket，也就是 orca 的入口。
   - 入口里"7456 被占用"的提示（`EADDRINUSE` 分支）在 macOS 上永远不会触发。
3. **次要：GitNexus 设备预览服务也会和 Creator 共用端口。**
   - `editor serve` 启动时就开设备预览服务（`native-engine/src/editor/server.rs` 的 `Devices::start`，`device_preview: true`），按项目的 `preview-port`（默认 7456）往上找空端口。
   - `devices.rs` 的 `bind` 只监听 `0.0.0.0`；之前对 `127.0.0.1` 的试绑在闭包结束时就释放了。
   - 现在因为 orca 入口先占了回环 7456，它通常落在 7457。去掉入口以后，它会拿到 7456 并和 Creator 共用：`127.0.0.1` 去 cocos-agent，`::1` 去 Creator，浏览器走哪个取决于 localhost 的解析顺序。

### 复现

在 macOS 上用 Node 模拟三方的监听方式（orca 入口：`127.0.0.1` 和 `::1` 两个 `ipv6Only` 监听；GitNexus：`0.0.0.0`；Creator：`listen(port)`），然后分别请求 `127.0.0.1`、`::1`、`localhost`：

| 场景 | 后启动的一方 `listen` | 127.0.0.1 | ::1 | localhost |
|---|---|---|---|---|
| orca 入口先启动，Creator 后启动 | 成功 | 入口 | 入口 | 入口 |
| Creator 先启动，orca 入口后启动 | 成功 | 入口 | 入口 | 入口 |
| GitNexus `0.0.0.0` 先启动，Creator 后启动 | 成功 | GitNexus | Creator | Creator |
| Creator 先启动，GitNexus 后启动 | `0.0.0.0` 报 EADDRINUSE，GitNexus 自动 +1 | Creator | Creator | Creator |
| GitNexus `0.0.0.0` 关闭后（Creator 不重启） | — | Creator | Creator | Creator |
| 先用双栈 `[::]`（`ipv6Only: false`）监听，Creator 后启动 | **EADDRINUSE**，Creator 自动 +1 | — | — | — |

结论：

- 释放端口后，已经在运行的 Creator 立刻恢复，不用重启。
- 用双栈 `[::]` 独占监听，可以让后启动的 Creator 拿到真正的 EADDRINUSE，走它自己的 +1 逻辑。

复现脚本（`node probe.mjs`）：

```js
import http from 'node:http'
const P = 17456
const srv = (name) => http.createServer((_, res) => { res.setHeader('connection', 'close'); res.end(name) })
const listen = (s, opts) => new Promise((r) => { s.once('error', (e) => r(e.code)); s.listen(opts, () => r('ok')) })
const get = (host) => new Promise((r) => {
  http.get({ host, port: P, agent: false }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => r(b)) })
    .on('error', (e) => r(e.code))
})
console.log('router 127.0.0.1', await listen(srv('orca-router'), { host: '127.0.0.1', port: P, ipv6Only: true }))
console.log('router ::1', await listen(srv('orca-router'), { host: '::1', port: P, ipv6Only: true }))
console.log('creator listen(port)', await listen(srv('creator'), { port: P }))
console.log(await get('127.0.0.1'), await get('::1'), await get('localhost'))
process.exit(0)
```

### 决策

**P1 新增"停止所有 Cocos 服务"。** 这是手动把项目交还给 Creator 的办法，也用于释放资源。

UI 稿：<https://claude.ai/artifact/XLqMWfByKz8r58frpnv7dV>（私有链接，分享前只有作者能打开），共 4 个画板：+ 菜单、确认框、停止后的标签页和提示、a5-game-context 安装提示。

- **入口：**
  - + 菜单里现有"停止 Cocos Creator"（`src/renderer/src/cocos-agent/CocosEditorMenuItems.tsx`）的下方，文案"停止所有 Cocos 服务…"，右侧用弱化文字显示"3 个运行中"。省略号表示会先弹确认框。
  - "停止 Cocos Creator"保留，只停当前工作区；当前工作区没有编辑器时只显示"停止所有"。
  - 命令面板。
  - 只要有任何 Cocos 服务在运行就显示，不限当前工作区；一个都没有时两项都不显示。
- **确认框**（`Dialog`，阻塞决策）：
  - 每行一个服务：项目名、谁打开的（cocos-agent / Claude 会话 / 命令行）、路径（等宽字体）、预览端口、未保存文档数。
  - 有未保存文档：按钮依次为"取消"（ghost）、"不保存并停止"（outline）、"保存并停止"（primary）。没有未保存文档：只有"取消"和"停止全部"。
  - 底部说明：由 Claude 会话打开的服务也会停；会话本身和它的 MCP 不受影响。
- **停止后：**
  - 标签页显示"编辑器服务已停止 / 项目已交还给 Cocos Creator"，按钮"恢复 Cocos Creator"。复用 `CocosEditorSuspendedView`，只按停止原因换文案（现有文案"已暂停以释放内存"不适用）。
  - 右下角 toast："已停止 3 个 Cocos 服务"，说明"资源同步和预览端口都已释放，Cocos Creator 无需重启"，带"重新打开 <当前项目>"按钮。
- **主进程新增 `CocosEditorService.stopAll()`，通过新 IPC `cocosAgent:stopAllServices` 调用。** 它按顺序做四件事：
  1. 关闭预览入口，释放 7456。
  2. 逐个停止这次会话启动的编辑器服务，复用 `stopEditor` 和现有的 `prepareClose`：有未保存的文档时照现有流程问"保存 / 放弃"，用户选"取消"就整体中止，已停的不回滚。
  3. 停止 Agent 或 CLI 启动的编辑器服务（`startedByApp: false`，以及 `~/.context-engine/editor/running/*.json` 里还活着的）。确认框先列出数量和项目，确认后向它们的 shutdown 地址发停止请求。
  4. 渲染进程里对应的标签页进入现有的 `CocosEditorSuspendedView`，点"重新打开"按正常流程重启服务。
- **不停的：** Agent 会话里的 `a5-game-context mcp` 进程。它们走 stdio，不占端口，属于各自的会话。
- **为什么包括 Agent 启动的服务：** 编辑器服务会同步 asset-db、写 `.meta`。和 Creator 同时开着同一个项目时本来就会竞争，"交还给 Creator"必须全部停掉。

**P2 去掉 7456 上的"当前项目预览入口"，7456 归 Creator。**

- 删除 `CocosPreviewRouter`，以及它在 `cocos-editor-service.ts`、`cocos-editor-service-deps.ts`、`cocos-editor-service-instance.ts` 里的调用。删除 `previewWarning` 提示（`cocos-editor-tabs.ts`、`editor.previewEntryUnavailable` 文案）和对应测试。
- 这一条取代对等规格第 4 条。原因：它要求占用 Creator 的固定地址，和"Creator 照常可用"冲突，而且在 macOS 上没法可靠检测冲突。
- 不能反过来让 Creator 换端口，因为 99 的项目把 `localhost:7456` 写死了：
  - electron-framework 的预览模式从 `DefaultMainConfig.ts` 的 `previewModeURL: 'http://localhost:7456'` 加载游戏（`UrlBuilderService.ts`）。
  - wptg-client 的 `npm run dev` 监听脚本 `tools/compile.js` 通过 `http://localhost:7456/update-db` 让 Creator 重新编译。被入口截走时，这个请求会被转到 cocos-agent，Creator 不再自动重编。
  - 团队的技能和文档（performance-lab-smoke、adb + CDP 真机调试等）也都按 `localhost:7456` 写。
- cocos-agent 的 Play 本来就打开项目自己的设备预览端口（`POST /project/devices {op: play}` 返回的地址），不依赖这个入口。Agent 需要预览地址时读 `GET /project/devices` 的 `port`。

**P3 GitNexus 设备预览服务（`native-engine/src/editor/devices.rs`）不抢 Creator 的端口，并且独占监听。**

- **端口选择：** 从项目 `preview-port` 的下一个端口开始找（默认 7457 起），项目配置的端口留给 Creator。Project Settings 改了 `preview-port` 时（`listen`）同样从新值 +1 开始。工具栏照常显示实际地址和二维码。
- **监听方式：** 先用双栈 `[::]`（`IPV6_V6ONLY = 0`，用 `socket2` 设置）。机器没有 IPv6 时（EAFNOSUPPORT、EADDRNOTAVAIL）退回 `0.0.0.0`。这样后来的 Creator 在同一端口上一定会收到 EADDRINUSE，并自动 +1。
- **localhost 兜底：** 保留对 `127.0.0.1` 的试绑，防止已有进程专门监听回环地址时把 localhost 截走。
- **发布：** 按 GitNexus 规则 bump 补丁版本、写 dev-log，然后 orca 更新 `config/cocos-agent/a5-game-context.lock.json`。

不做：

- 不改成第一次预览时才启动设备预览服务。有了 P3，提前占的端口已经不会和 Creator 冲突。
- 不检测 Creator 进程。

### 验收

- **Creator 先启动，再在 cocos-agent 打开同一项目并预览：** Creator 的预览仍打开自己的项目，cocos-agent 的预览在 7457（或更高端口）。
- **cocos-agent 先启动并预览，再启动 Creator：** Creator 拿到 7456，预览正常；Creator 控制台不出现端口自动递增的警告。
- **两个 Creator 加 cocos-agent 同时运行：** 每个都有自己的端口，没有共用端口的情况（用 `lsof -nP -iTCP:7456-7460 -sTCP:LISTEN` 核对）。
- **"停止所有 Cocos 服务"：**
  - 有未保存的场景时先询问；选"取消"后服务保持不变。
  - 停止后 `~/.context-engine/editor/running/` 为空。
  - 7456 和 7457 上只剩 Creator 的监听。
  - Creator 不用重启就能预览。
  - 标签页显示"已停止"，点"重新打开"可以恢复。
- 上面的复现脚本加上双栈一行，作为 GitNexus 单元测试（只在 macOS 上跑）：先用双栈监听，再 `listen(port)`，必须得到 EADDRINUSE。

## 问题 2：a5-game-context 新旧版本交替

### 现状（2026-11-21 本机核对）

cocos-agent 现在没有走 npm 安装。

- **app 用的是内置的一份。** 它把锁定的包（当前 5.0.22）解包在 `Resources/a5-game-context`。编辑器服务和注入给 Agent 的 `cocos-editor` MCP 一直用这份：正式包的 `resolveA5GameContextBinary` 不看 PATH。
- **命令链接只在空位时才建。** 每次启动时，app 只在 `~/.local/bin` 等目录里没有同名链接、或链接本来就是它建的时候，才链到自己的这份（[命令注册记录](a5-game-context-commands-2026-11-11.md)）。

本机同时有 4 份：

| 位置 | 版本 | 来源 |
|---|---|---|
| nvm v16.20.2 全局 | 3.3.23 | 早期 npm 安装 |
| nvm v22.22.3 全局 | 3.8.67 | 早期 npm 安装 |
| nvm v22.23.4 全局（默认 Node） | 5.0.27 | poker-game-dev 插件提示的 `npm install -g @a5labs-prime/a5-game-context --@a5labs-prime:registry=https://npm.pkg.github.com`（`hooks/toolchain.json` 锁定 5.0.27） |
| cocos-agent app 内置 | 5.0.22 | `config/cocos-agent/a5-game-context.lock.json` |

`~/.local/bin` 和 `/opt/homebrew/bin` 里的 `a5-game-context`、`cocos-cli` 都链到 nvm v22.23.4 的那份。这是别人建的链接，app 不覆盖。

结果：

- 从 cocos-agent 启动的 Claude 会话里，插件的 MCP 是 5.0.27，`cocos-editor` MCP 是 5.0.22。
- 终端里的 `a5-game-context` 是哪个版本，取决于最后是谁写的链接。
- 两边共用 `~/.context-engine`（`registry.json`、`sdk/`、`editor/running/`、`editor-cache/`）。npm 包的 postinstall（`scripts/install-cocos-cli-bin.cjs`）和 app 的 `prepare-editor.cjs` 都会注册各自的 SDK，互相覆盖。

### 安装时机：为什么不放在安装器里

a5-game-context 以后仍然随 cocos-agent 一起发（包在 app 里），问题是"什么时候把它装成全局命令"。

- **cocos-agent 现在没有更新源。** `src/main/cocos-agent/cocos-agent-updater-setup.ts` 对检查更新一律回答"无更新"，目前靠手动装 dmg（mac）和 NSIS 安装包（Windows）。
- **mac 上没有"安装"这一步。** 拖进"应用程序"只是复制 .app；以后接上 Orca 的自动更新，也是 Squirrel.Mac（ShipIt）在退出时整体替换 .app。两种情况都不会运行任何安装脚本。
- **Windows 有安装器，但不适合在里面跑 npm。** Orca 的自动更新是下载新的 setup.exe，再用 `quitAndInstall(silent, …)` 运行它，自动更新时是静默安装。NSIS 的 `customInstall` 挂点（`config/nsis/orca-installer-hooks.nsh`）确实会执行，但那里拿不到用户登录 shell 的环境（nvm-windows、fnm 的 PATH），失败时也没有界面可以提示，还会拖慢甚至卡住静默更新。

**决定：** 两个平台统一在"每个 cocos-agent 版本第一次启动时"完成安装。mac 拖装、mac 自动替换、Windows 手动安装、Windows 静默更新，最后都会走到这一步。

- 在 app 的 userData 里记一个标记 `a5-game-context-install.json`：`{appVersion, packageVersion, method: "npm" | "bundled", installedAt}`。
- 启动时 app 版本和标记一致，并且 PATH 上的 `a5-game-context --version` 不低于锁定版本：什么也不做（只花一次读文件和一次进程调用）。
- 否则在后台执行 N2。期间打开 Cocos 项目会等安装完成，加载页显示"正在安装 a5-game-context x.y.z"这一步。

### 决策

本节取代 [命令注册记录](a5-game-context-commands-2026-11-11.md) 里"不再单独 npm 安装"的决定。原因：插件和开发者都通过 npm 升级，而且升级比 cocos-agent 发版快；app 再自带一份运行，必然出现两个版本。

**N1 只保留一份：用户登录 shell 那个 npm 下的全局 `@a5labs-prime/a5-game-context`。** 终端、poker-game-dev 插件、Claude、Codex，以及 cocos-agent 自己的编辑器服务和 `cocos-editor` MCP 都用它。

- npm 的位置用 `hostShellEnvironment()` 解析，和终端看到的一致。
- 包目录用 `npm prefix -g` 得到，版本读该目录下包的 `package.json`。

**N2 app 内置安装包，只升不降。**

- 安装源就是 app 里已经解包的 `Resources/a5-game-context` 目录，打包流程不变。命令是 `npm install -g --install-links --offline <目录>`：`--install-links` 让 npm 复制目录，而不是建一个指向 app 的软链接；依赖都打在包里，`--offline` 下不联网，也不需要 GitHub token。2026-11-22 在临时 prefix 和临时 HOME 下实测：11 秒完成，装出来的是真实拷贝，`cocos-cli` 链接和 SDK 注册都由 postinstall 完成，`a5-game-context --version` 正常。
- 每个版本第一次启动时（见上一节）：
  - 全局没有这个包，或版本低于 app 锁定的版本：后台执行上面的命令，用 toast 显示进度和结果（UI 稿画板 ④）。
  - 版本相同或更高：不动，也不弹提示。
- **`npm install -g` 实际做的事**（按 5.0.27 的包核对）：
  1. 把包解到 `<prefix>/lib/node_modules/@a5labs-prime/a5-game-context`。打进包里的依赖（`@a5labs-prime/cocos-cli`、MCP SDK、glob、ignore、yaml，以及三个平台的原生包）一起解开，不联网。
  2. 按 `package.json` 的 `bin` 建链接：`a5-game-context`、`context-engine`、`cocos-context-engine`。`cocos-cli` 不在 `bin` 里。
  3. 执行 `postinstall`（`scripts/install-cocos-cli-bin.cjs`）：建全局的 `cocos-cli` 链接，指向 `dist/cli/cocos-cli.js`（只在空位，或原来就是 @a5labs-prime 的链接时）；删掉单独装过的 `@a5labs-prime/cocos-cli` 全局包；把内置的 Cocos 2.4.13 SDK 注册到 `~/.context-engine/sdk`。
  4. 打进包里的依赖都没有自己的安装脚本，不会再执行别的东西。

  所以 `cocos-cli` 是跟着装好的，但"装好"只是建链接和注册 SDK，不会执行任何 cocos-cli 命令。app 的 `prepare-editor.cjs` 现在调用的正是同一个脚本里的 `registerBundledSdks`，改用 npm 后它就不需要了。
- **防止 postinstall 被跳过：** 用户的 npm 配置里如果有 `ignore-scripts=true`，就既没有 `cocos-cli` 也不注册 SDK。安装命令显式加 `--ignore-scripts=false`，装完检查 `cocos-cli` 能否解析、SDK 是否已注册；没有的话，用 `npm_config_global=true` 和 `npm_config_prefix=<prefix>` 再执行一次这个脚本。
- **装好后用哪个 Node 运行：** 两个 CLI 的 shebang 都是 `#!/usr/bin/env node`，所以由用户自己的 Node 运行（包要求 `>=16.20.0`），不再用 app 的 Electron。
- Windows 上调用 `npm.cmd` 必须经过 shell（新版 Node 不允许不带 shell 直接 spawn `.cmd`），用 Orca 现有的进程封装，参照 `docs/agents-md-refs/cross-platform-support.md`。
- **Windows 文件占用：** 升级前先停掉 app 自己启动的编辑器服务。如果 Agent 会话里的 `a5-game-context mcp` 还占着旧版本的原生文件，npm 会报 EBUSY 或 EPERM：本次继续用旧版本，toast 提示关闭这些会话后重启 cocos-agent，下次启动再装。mac 上替换正在使用的文件不影响已经在运行的进程，没有这个问题。
- 插件 `toolchain.json` 锁定的版本和 app 锁定的版本都只是最低要求，谁高装谁。插件从 GitHub Packages 装，app 从内置包装，装的是同一个包名、同一个目录，所以只会有一份。

**N3 兼容规则：主版本号相同就用全局那份。**

- 主版本号不同（例如全局是 6.x、app 锁定 5.x）时，不替换全局那份。cocos-agent 自己的编辑器和 MCP 改用自带的那份，保证编辑器能用；每个自带版本提示一次"a5-game-context 6.x 与这个 cocos-agent 不兼容"，设置里一直显示，直到升级 cocos-agent。（实现时调整：原方案是直接不让打开编辑器，太硬。）
- 同一主版本内，向前兼容由 GitNexus 保证。出问题就在 GitNexus 修，不靠多带一份来绕开。

**N4 不再自己注册命令。**

- 删除 macOS 的 `~/.local/bin` 链接逻辑（`a5-game-context-mac-command-links.ts`）。启动时只清理 app 以前建的链接，即指向 `.app/Contents/Resources/bin/<同名>` 的。npm 全局的 bin 目录本来就在 PATH 上。
- SDK 注册交给 npm 包自己的 postinstall。用全局那份时，跳过 `prepareBundledCocosSdk`。
- Windows 同理：改用 npm 的 `%APPDATA%\npm`，去掉 `resources\a5-game-context-bin` 的用户 PATH 条目和 NSIS 卸载挂点。Windows 其余的阻塞（CI 原生二进制、D-08）不变。

**N5 没有 npm 时退回 app 自带的运行方式。**

- 登录 shell 里找不到 `npm` 时，cocos-agent 自己的编辑器和 MCP 直接运行 app 里那份（`Resources/bin` 启动脚本，用 app 自带的 Electron 作为 Node），也就是 0.1.2 的做法，只是不再往 PATH 里建链接。
- 提示一次："未检测到 npm，使用内置 a5-game-context x.y.z"。
- 装上 Node 后，下次启动自动切换到 N2。

**N6 包体不变。** 安装源就是已经打进 app 的目录，不用另带 tgz。（原方案是改为只带 tgz，因为 `--install-links` 可以直接装目录，这一步省了。）

**N7 nvm 的限制。**

- npm 全局目录跟着 Node 版本走，app 跟随登录 shell 的默认 Node。
- 换了默认 Node 以后，新目录里没有这个包，app 会在新目录里装一份。旧 Node 下的副本不在 PATH 上，不影响使用，但要手动清理（见下文）。

### 检查流程

基本规则：全局版本低于 cocos-agent 自带的版本就安装；已经是自带版本或更高的 5.x 就不动。实际检查比只比版本号多几项，因为"版本号对了"不等于"能用"。

**什么时候检查：**

- 每个 cocos-agent 版本第一次启动时（见"安装时机"）。
- 设置里点 ↻ 随时重查。
- 打开 Cocos 项目前，如果上次结果是不可用（没装、主版本不同、命令找不到），先检查并修一次，加载页显示这一步。

**检查什么，结果怎么处理：**

| 检查结果 | 处理 |
|---|---|
| 全局没有这个包 | 安装自带版本 |
| 全局版本低于自带版本 | 安装自带版本 |
| 全局版本相同，或是更高的 5.x | 不动，不提示 |
| 全局主版本号不同（如 6.x） | 不替换全局那份；cocos-agent 内部用自带版本，提示升级 cocos-agent |
| 版本对，但 `cocos-cli` 找不到，或 SDK 没注册（postinstall 被跳过） | 补跑 `install-cocos-cli-bin.cjs` |
| PATH 上先找到的是另一份（例如 `~/.local/bin` 里指向旧副本的链接） | cocos-agent 自己以前建的链接直接删；别人建的列出来，给出删除命令 |
| 找不到 npm | 用自带版本（N5），设置里说明原因 |

**灵活的地方：**

- "更新 cocos-agent 后自动安装"开关，默认开。关掉后只提示"自带 5.0.28 比全局的新"，带"安装"按钮，不自动改动全局。适合想自己用 npm 管版本的人。
- ⋯ 菜单里的"重新安装自带版本"：全局那份坏了或太新出问题时，用它回到 cocos-agent 测过的版本。这是唯一会降级的操作，先弹确认。
- 列出机器上不在 PATH 上的其他副本（例如旧 nvm 版本里的 3.8.67、3.3.23），给出一键复制的清理命令，不自动删。

**失败时：**

- toast 只说结果，带"查看详情"按钮，跳到设置里的 Cocos 命令行工具。
- 设置里显示常驻的错误块（样式规范：需要用户阅读、复制、重试的错误放在页面里，不只靠 toast）。错误块包括：
  - 一句话原因，由 npm 错误码翻译：EACCES 权限不够、EBUSY/EPERM 文件被占用、ENOENT 找不到 npm、ENOSPC 磁盘满；其他情况显示 npm 的最后一行输出。
  - 手动命令。EACCES 时带 `sudo`，路径用 app 里 `Resources/a5-game-context` 的实际位置。
  - 按钮"复制命令""打开安装日志""重试"。原方案里的"在终端中运行"没有做：侧栏终端只有"启动时执行命令"的接口，没有"只填入、不执行"的接口，而 `sudo` 这类命令必须由用户自己执行。
- 完整的 npm 输出写进 `<userData>/logs/a5-game-context-install.log`，"查看安装日志"打开它。

### 设置面板：放在哪里、怎么不和 Orca 冲突

UI 稿：画板 ⑤（正常）和 ⑥（安装失败）。

- **位置：设置 ▸ 通用，Orca"命令行"分区原来的位置。** Orca 在这里放的是注册 `orca` 命令的 `CliSection`，cocos-agent 构建本来就把它隐藏了（`GeneralPane.tsx` 的 `!desktopProduct && …`，已登记在 `upstream-touch-points.json`）。改成 cocos-agent 构建在这一格渲染自己的 `CocosToolchainSection`：
  - 仍是同一个挂点、同一行，不新增上游文件。
  - 登记项的说明改为"Cocos 桌面用 Cocos 命令行工具分区替换上游 CLI 安装项"。
  - 两种命令其实是同一类东西（让终端能用某个命令），放在同一个位置，用户不用重新学。
- **新代码只放在 cocos-agent 自己的目录：** 组件放 `src/renderer/src/cocos-agent/settings/`，检查和安装逻辑放 `src/main/cocos-agent/`，IPC 走现有的 `COCOS_AGENT_IPC`。
- **复用 Orca 的组件和样式：** `SettingsGroup`、`Label`、`Switch`、`Button`、`Tooltip`、sonner toast，行高、字号、间距照 `docs/STYLEGUIDE.md` 的设置页规范，和 `CliSection` 的写法一致（↻ 图标按钮、"命令路径：`<code>`"、琥珀色警告文字）。
- **设置搜索：** 提供 cocos 自己的搜索词（a5-game-context、cocos-cli、npm、命令行），接到 `GeneralPane` 已有的搜索判断上，同在那一个挂点里。
- **开关状态不写进 Orca 的 `GlobalSettings`。** 加字段要改上游的设置结构，所以存在 cocos-agent 自己的文件里，和安装标记放在一起（`a5-game-context-install.json` 的 `autoInstall`）。
- **"停止所有 Cocos 服务"同理：** 菜单项加在 cocos-agent 自己的 `CocosEditorMenuItems.tsx`，确认框是 cocos-agent 的组件，用 Orca 的 `Dialog`，不碰上游菜单。

### 改动清单（orca，已实现）

- 打包（`import-a5-game-context.mjs`、`electron-builder.cocos-agent.cjs`）不变。
- 主进程（`src/main/cocos-agent/`）：
  - `a5-game-context-toolchain.ts`：检查、安装、自动安装开关、安装日志、全局那份的启动脚本。
  - `a5-game-context-toolchain-probe.ts`：从登录 shell 的 PATH 找 npm 和 node、读全局版本、检查 cocos-cli 和 SDK、找其他副本。
  - `a5-game-context-install-failure.ts`：把 npm 输出归类成权限、文件占用、磁盘满、超时。
  - `a5-game-context-toolchain-instance.ts`：单例和状态推送。
  - `a5-game-context-legacy-registration.ts`：删除 0.1.2 及更早版本自己建的 PATH 链接和 Windows PATH 条目。`a5-game-context-windows-user-path.ts` 改为只做删除。
  - 删除 `a5-game-context-commands.ts`、`a5-game-context-command-registration.ts`、`a5-game-context-mac-command-links.ts` 及其测试。`Resources/bin` 启动脚本保留，作为 N5 的退回路径。
  - `a5-game-context-binary.ts`：解析顺序为开发用的环境变量覆盖 → npm 全局那份（状态为 ready 时）→ app 自带的那份。
  - `cocos-editor-running-services.ts`：列出运行中的编辑器服务（app 打开的，加上 GitNexus 运行记录里还在响应的）。
  - `cocos-editor-service.ts`：新增 `stopAll`；删除 `CocosPreviewRouter` 及其测试。`cocos-editor-close.ts`：抽出 `readCocosEditorLifecycleState`，关闭流程支持预设的"保存/不保存"。
- 渲染进程（`src/renderer/src/cocos-agent/`）：
  - `CocosStopAllDialog.tsx`、`cocos-agent-overlay-root.tsx`：确认框挂在 cocos-agent 自己的 React 根上，不需要上游组件来承载。
  - `CocosEditorMenuItems.tsx`：+ 菜单新增一项，非 Cocos 工作区也会显示。
  - `cocos-editor-tabs.ts`、`cocos-editor-tab-state.ts`、`CocosEditorSuspendedView.tsx`：交还后的标签页保持停止，不会自动重启，并显示交还文案。
  - `settings/CocosToolchainSection.tsx`、`a5-game-context-toolchain-copy.ts`、`a5-game-context-toolchain-notices.ts`：设置分区、文案、toast。
- 上游挂点：`GeneralPane.tsx` 在原来的 `CliSection` 之后加 1 行和 1 个 import；顺手补登记了 dev/0.1.2 遗留的 `package.json`（`cocos:check` 脚本）。两处都写进了 `config/scripts/cocos-agent/check.mjs` 的挂点清单。
- `src/shared/cocos-agent/i18n/`：补齐 11 种语言（见"多语言"）。
- `COCOS_AGENT_VERSION` 改为 0.1.3，`COCOS-AGENT.md` 的同步步骤改指 `dev/0.1.3`。

### 验收

- **全新机器（有 Node）：** 首次启动后 `npm ls -g @a5labs-prime/a5-game-context` 显示 app 锁定的版本；`which -a a5-game-context` 只指向 npm 的 bin 目录。
- **全局版本更高（例如 5.0.27 对 app 的 5.0.22）：** 启动后版本不变。编辑器服务进程和 `cocos-editor` MCP 的 `--version` 都是 5.0.27。
- **全局版本更低：** 启动后升级到 app 锁定的版本。
- **没有 npm：** 走 N5，编辑器正常打开，并且提示过一次。
- **主版本号不同：** 打开编辑器时给出升级提示，不启动第二份。
- **单一版本：** 同一个 Claude 会话里，插件 MCP 和 `cocos-editor` MCP 的版本一致。

### 本机一次性清理（实现并安装新版后执行）

```bash
nvm exec 16.20.2 npm rm -g @a5labs-prime/a5-game-context
nvm exec 22.22.3 npm rm -g @a5labs-prime/a5-game-context
rm ~/.local/bin/{a5-game-context,cocos-cli} /opt/homebrew/bin/{a5-game-context,cocos-cli}
which -a a5-game-context   # 只剩 ~/.nvm/versions/node/v22.23.4/bin/a5-game-context
```

## 多语言

两个功能新增的文案（菜单项、确认框、停止后的提示、设置分区、安装 toast、npm 错误原因）都要跟 Orca 支持的语言配套。

**现状：**

- Orca 本体有 11 种界面语言：en、zh、zh-Hant、ja、ko、de、es、fr、pt、ru、tr（`src/renderer/src/i18n/locales/`）。
- cocos-agent 的文案在自己的 `cocosAgent` 命名空间（`src/shared/cocos-agent/cocos-agent-i18n.ts`），不改 Orca 的语言包，所以合并上游时不冲突。但这里目前只有 en（37 条）、zh（32 条）、zh-Hant（22 条），其他 8 种语言全部回退成英文，连 zh 和 zh-Hant 都有缺。

**决定：**

- **补齐 11 种语言。** 在 `CATALOGS` 里加上另外 8 种语言的文件，新文案和现有 37 条一起补全，zh、zh-Hant 缺的也补上。否则德语或日语用户会看到一半是本地语言、一半是英文的 Cocos 界面。
- **仍只写 `cocosAgent` 命名空间，不碰 Orca 的 `locales/*.json`。** 代码里通过 `cocosText(key, fallback)` 或 `cocosAgentKey()` 取文案，不能直接写 `t('cocosAgent:…')`，否则过不了本地化提取的检查。
- **数量用 i18next 的复数形式**（`count` 加 `_one`、`_other` 等后缀），例如"3 个运行中"、"2 个文档未保存"。俄语有 one/few/many 三种形式，规则和 Orca 自己的 `locale-plural-forms.mjs` 一致。
- **不翻译的内容：** a5-game-context、cocos-cli、npm、Cocos Creator、cocos-agent 等名称；命令、路径、端口号（等宽字体显示）；npm 的原始输出（写进日志，界面只显示翻译后的原因）。
- **品牌：** Orca 的 `brandCatalogStore` 会把 Orca 语言包里的"Orca"替换成产品名，但会跳过 `cocosAgent` 命名空间，所以这里的文案直接写 cocos-agent 的产品名。
- **随 Orca 的界面语言切换：** 和现有 Cocos 菜单一样，用 `useUiLanguageRevision()`，切换语言不用重启。
- **布局要撑得住长文本：** 德语、俄语通常比中文长 30%～60%。
  - 菜单项文字过长时截断加省略号，右侧数量不换行。
  - 确认框里服务来源的标签和底部按钮允许换行。
  - 设置行沿用 Orca 的弹性布局。
  - UI 稿画板 ①② 的 Tweaks 里可以切换中/英/德/日查看效果。
- **翻译怎么来：** 先由我起草 8 种语言，术语对照 Orca 自己语言包里的现成译法（如"设置""终端""智能体"在各语言里的用词），保证和周围的 Orca 界面一致；ja/ko 参照 Orca 的 `locale-ja-*`、`locale-ko-*` 用词修正表。
- **检查：** 实现时用一次性脚本核对每种语言的键和 en 一致，并在 de/ja 下截图看菜单、确认框和设置页。按仓库规则不提交测试文案的测试。

## 交付

- **orca：** P1、P2，以及 N1 到 N7，在 `dev/0.1.2` 上合成一个 PR。
- **GitNexus：** P3 出一个补丁版本，orca 的 lock 跟着更新。

## 风险

| 风险 | 处理 |
|---|---|
| 同一主版本内，更新的全局版本改了 `editor open` 的输出或 MCP 绑定协议 | 在 GitNexus 修；N3 只拦主版本号不同的情况 |
| 用户的 npm 全局目录需要 sudo（系统自带 Node） | 安装失败时 toast 给出手动命令，这次启动按 N5 运行 |
| 双栈 `[::]` 在个别网络配置下不可用 | 退回 `0.0.0.0`，行为和现在一样 |

## 实现记录（2026-11-22）

**已验证：**

- macOS 端口行为：用 Node 和 Rust 小程序复现了截流，并确认双栈 `[::]` 能让 Creator 的 `listen(port)` 得到 EADDRINUSE（见"复现"）。
- GitNexus `devices.rs`：把改动的三个函数单独抽出来，用 `rustc` 编译，正式和测试两种配置都开 `-D warnings`；正式配置下实际运行，结果落在 Creator 端口 +1、监听在 `[::]`。
- npm 安装方式：`npm install -g --install-links --offline <app 里的目录>` 在临时 prefix 下 11 秒装好，命令可以运行，postinstall 建了 `cocos-cli` 链接、注册了 SDK。
- 多语言：11 种语言各 110 条，用脚本核对过键和 `{{占位符}}` 与英文一致。
- 上游挂点：`check-upstream-touch-points.mjs` 通过（56 个挂点，对照 880b55e0552）。

**没能在沙箱里做，需要在你的终端做：**

1. 依赖：本机 `~/Library/pnpm/store` 已被清空，所有 orca 工作区的 `node_modules` 都是断的，沙箱里又连不上 npm 仓库。先 `pnpm install`，再跑 `pnpm tc`、相关单测和 `pnpm check:changed`。
2. Rust：`~/.cargo/registry` 也被清空了。在 GitNexus 工作区 `.claude/worktrees/preview-port/context-engine/native-engine` 先 `cargo fetch`，再 `cargo test --offline --lib -- editor::devices`。
3. 发布 5.0.28：GitNexus 分支 `fix/devices-preview-port-handoff` 先合并远端最新的 main（本地只有 5.0.26，5.0.27 在远端），再按现有流程 `build:native` + `pack:platform`，然后更新 orca 的 `config/cocos-agent/a5-game-context.lock.json`。0.1.3 在锁定版本升级之前，只有 orca 这一半改动生效：7456 入口已去掉，但设备预览服务仍可能占用 7456。
4. 真机验收：照"验收"两节在装好的 cocos-agent 上走一遍，包括 Creator 先开和后开两种顺序、停止所有服务，以及 a5-game-context 的几种状态（可以临时改名全局目录来模拟"未安装"）。
