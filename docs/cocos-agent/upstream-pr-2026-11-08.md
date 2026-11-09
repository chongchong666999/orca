# 面向 stablyai/orca 的修复 PR（2026-11-08）

cocos-agent 分支里与 Cocos 无关、修的是 Orca 自身问题的改动，整理为独立分支 `contrib/orca-fixes-2026-11`（基于 upstream/main `974bb4a7cab`，2026-11-04），一个 PR、每处修复一个提交，上游可整体合并也可单独 cherry-pick。上游合入后，在下一轮同步中直接取上游版本并从 `config/cocos-agent/upstream-touch-points.json` 删除对应条目。

| 提交                                                                           | 文件                                                                                                     | 修了什么                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fix(build): recognise node: builtins when verifying packaged runtime modules` | `config/packaged-runtime-node-modules.cjs`、`config/scripts/electron-builder-runtime-resources.test.mjs` | 打包依赖校验按名单识别内置模块，`node:sqlite` 等带前缀的被当成缺失依赖；改用 Node 的 `isBuiltin` |
| `feat(build): ORCA_SKIP_DEV_CLI_INSTALL=1 skips the dev CLI symlink`           | `config/scripts/install-dev-cli.mjs`                                                                     | 在装有正式版 Orca 的机器上打包另一个产品名的 app 时，不覆盖 `/usr/local/bin/orca-dev`            |
| `fix(cli): read the macOS executable name from Info.plist`                     | `resources/darwin/bin/orca`                                                                              | 启动脚本写死 `Contents/MacOS/Orca`，产品名不同时找不到可执行文件                                 |
| `fix(startup): keep renderer recovery silent during background launches`       | `src/main/startup/main-window-actions.ts` + 测试                                                         | `ORCA_BACKGROUND_LAUNCH` 的自动化验证下，渲染进程恢复耗尽时只记日志，不在用户桌面弹原生对话框    |
| `fix(runtime): preserve SQLite operation keys on reload`                       | `src/main/runtime/agent-session/records/agent-session-record-rows.ts` + 测试夹具                         | operation_key 含 NUL 分隔符，Node SQLite 返回 TEXT 时被截断；按 BLOB 读并重新推导键              |
| `fix(runtime): drop the temp. prefix inside agent sender history triggers`     | `src/main/runtime/runtime-agent-sender-history-triggers.ts`                                              | temp 触发器体内带 `temp.` 限定名在部分 SQLite 构建上失败                                         |
| `feat(check): --maxWorkers caps check:changed concurrency`                     | `config/scripts/check-changed.mjs`                                                                       | 在打包或笔记本上跑门禁时把并发压到 CPU 的三分之一以下                                            |

## 推送与开 PR

```sh
git -C /Users/free/Documents/work/orca push origin contrib/orca-fixes-2026-11
gh pr create --repo stablyai/orca --head chongchong666999:contrib/orca-fixes-2026-11 --base main \
  --title "Fixes from the cocos-agent fork: builtin detection, background launch recovery, SQLite operation keys" \
  --body-file docs/cocos-agent/upstream-pr-body.md
```

PR 正文（英文）见 `upstream-pr-body.md`。分支以 git worktree 形式位于 `$TMPDIR/orca-upstream-fixes`，推送后可 `git worktree remove` 掉。
