# cocos-agent 0.1.0 内置编辑器验收

2026-11-06，本机 Apple Silicon macOS。交付目标是打开本地 Cocos 2.4.13 项目即可编辑、保存和预览；全局命令安装与外部 MCP 配置后置。仅本地提交与出包，未 push、未发布 npm。

## 实现

- 内置 GitNexus 3.8.271，提交 `5d7911f01`。锁定 tarball sha256：`e58df66838af4cdf631a96ac17c817bc8d043a8b98c9afa311fbe31449732513`。
- 应用包含前端、原生服务、平台依赖、Cocos SDK 和 TypeScript 离线编译器。构建后检查平台依赖条目，避免 electron-builder 默认过滤掉包内 node_modules。
- 首次打开前自动注册 SDK；已有同版本外部 SDK 时按包哈希找到内置 SDK；再次打开复用已有缓存。
- 启动器使用应用自带 Electron Node。原生主程序清除继承的 Node 模式，只有明确的 Node 工作进程重新设置；Creator 构建进程不继承该模式。
- 编辑器不显示通用浏览器地址栏；设置与启动提示不要求先安装全局 CLI。

## 实包观察

真实 `.app`、隔离 HOME/用户配置、系统 PATH，`ORCA_BACKGROUND_LAUNCH=1`。通过 Playwright CDP 操作隐藏窗口，主进程确认 `BrowserWindow.isVisible()` 为 false。测试项目为带空格路径的普通文件夹，无 Git，包含 Prefab、场景、TypeScript 组件和本地插件；不修改用户业务项目。

| 场景                        | 结果                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| 添加 Cocos Folder Workspace | 自动显示 Cocos Creator 标签，资源列表含场景、脚本和 Prefab                           |
| 打开场景和 Prefab           | `__a5Editor.ready=true`，Scene 面板 `sceneReady=true`                                |
| 编辑与保存                  | 通过属性输入的 ArrowUp 把 Prefab Position.X 从 0 改为 1，点击 Save，文件中的数值为 1 |
| 游戏预览                    | Play 成功，canvas 848×646，真实脚本输出 `embedded compiler ready`                    |
| 插件                        | 消息调用回报 Electron 43.8.6、Node 24.22.1、Node 模式 1                              |
| 重复打开                    | Go to Cocos Creator 复用一个编辑器标签                                               |
| 停止/再次打开               | Stop 后服务列表为空，再选择项目启动新服务                                            |
| 关闭标签                    | 服务保留，重新打开工作区复用服务                                                     |
| 普通文件夹                  | 自动打开终端，不启动另一个编辑器服务                                                 |
| 切换/退出                   | 切回 Cocos 项目正常；调用真实 app.quit 后应用退出、编辑器服务地址不可达              |
| SDK 冲突/重复初始化         | 同版本外部条目保留，内置哈希匹配，重复准备不重新解包预览文件                         |

首个有效场景的编辑器计时日志为 1.5 秒（非应用冷启动性能基准）：文档 0.11 秒、面板 0.01 秒、场景请求 0.56 秒、页面 0.79 秒；Node 编译 1 个脚本。尚无受控的大型项目冷启动、常驻内存和长时间稳定性基准。

## 离线与 Creator 隔离

独立运行 app 内 CLI/Node 服务，使用全新 HOME 和项目副本；限制仅施加到 CLI 工作进程，不包裹 Electron GUI。禁止外网，禁止读取 `/Applications/Cocos`、`/Applications/CocosCreator`、用户旧缓存、GitNexus 源目录和系统 Node。准备 SDK、场景 Play 编译与插件消息均成功。

`source.json` 明确记录 TypeScript 来源为 app 内 `vendor/typescript-4.1.3.tgz`，sha256 `5bd3602e2c79c8b3c878cdaa68cc3dafd064e1c25397c742fb71ea6760f272ef`。因此普通 GUI 验收中曾使用本机 Creator 的 TypeScript 缓存，不被误写成离线证明；离线结论来自这次单独的空缓存隔离运行。

## 崩溃原因与修复

用户截图对应验收时额外使用的 `sandbox-exec` GUI 包装器。Chromium 在该进程约束里无法初始化自己的沙盒，日志出现 `sandbox initialization failed: Operation not permitted`，随后 GPU/renderer 退出并触发三次恢复对话框。停止该测试实例并去掉包装器后，正常隐藏应用完成了上述操作；没有关闭 Chromium 自身的沙盒。

增加后台启动保护：恢复失败只写日志，不弹原生对话框打断桌面。对应回归先红后绿，正常用户模式的对话框保持原行为。此修复不宣称能消除所有 GPU/驱动崩溃。

## 检查与独立审核

- Orca 全部 TypeScript 项目检查通过；相关 7 个文件 66 个测试通过；启动引导现有 17 个测试通过。
- 变更文件 oxlint/oxfmt、差异空白检查及相对 `7ac13b5296ab` 的代码质量检查通过。全分支 `check:changed` 相对 origin/main 展开到 35945 个文件，包含已有 Cocos 转型/设计系统/英文文案问题，相关测试范围过大后停止；不声明全分支门禁通过。
- GitNexus release 编译通过，JS 单元 248、集成 91 通过。原生常规测试 1672 通过、12 忽略；两个历史资源审查门禁仍失败：Cargo.lock 指纹和版本 3.8.267 的收据在本轮前已落后于 HEAD 3.8.270。未改写收据。
- Paseo `codex/gpt-6.1-sol` high 独立审核通过。打包审核曾指出 dmg 命名与同版本 SDK 选择问题，均已修正复审；Node 工作进程正向证据缺口由离线实包验收关闭；后台弹窗保护和启动 CLI 提示补充复审均 PASS。

## 证据与未覆盖项

本机证据目录：`/tmp/cocos-agent-validation.0KZmJT/`。主要文件：`offline-proof.py`、`offline-proof.log`、`offline-proof-2/result.json`、`game-preview.png`、`prefab-edit-save.png`、各构建与测试日志。截图来自隐藏 CDP 页面；Prefab 截图为 1762×1660 物理像素，设备缩放 2。日志可能包含本地服务会话地址，外发前应脱敏。

最终 release 包及重启恢复结果在完成构建后追加。另一台 Mac 的安装/Gatekeeper、原生可见窗口/Dock/关于面板、10 分钟空闲退出、大型业务工程长期运行未执行。mac x64、Windows、Linux、远程 Cocos 服务不在本轮 v0.1 arm64 交付范围。
