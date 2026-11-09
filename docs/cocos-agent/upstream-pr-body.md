We maintain a fork of Orca (an internal Cocos Creator workbench) and keep the fork's changes to upstream files to a minimum. These seven commits are fixes to Orca itself that we found while packaging and running the fork; none of them depend on anything fork-specific. Each commit is self-contained, so cherry-picking a subset works too.

- **Packaged runtime module check** — `config/packaged-runtime-node-modules.cjs` listed builtins by name, so `node:sqlite` read as a missing dependency. Uses Node's `isBuiltin`, which knows every prefix form; the existing test now covers a `node:` specifier.
- **`ORCA_SKIP_DEV_CLI_INSTALL=1`** — lets a build on a machine that already has Orca skip replacing `/usr/local/bin/orca-dev`.
- **macOS launcher** — `resources/darwin/bin/orca` reads `CFBundleExecutable` from `Info.plist` instead of hard-coding `Contents/MacOS/Orca`.
- **Background launch** — with `ORCA_BACKGROUND_LAUNCH`, an exhausted renderer recovery logs instead of presenting the native dialog (the automation that launched the app has no desktop to answer it on). Interactive launches are unchanged; a test covers the background case.
- **SQLite operation keys** — the agent-session operation key contains a NUL separator, which Node's SQLite truncates when returned as TEXT, so operations were dropped on reload. Read the key as BLOB and re-derive it from the row; rows whose stored key no longer matches are skipped.
- **Agent sender history triggers** — the `temp.` qualifier inside temp trigger bodies fails on SQLite builds that reject schema-qualified names there; unqualified names resolve in the temp schema anyway.
- **`check:changed --maxWorkers`** — caps the gate's concurrency for laptops and machines that are packaging at the same time.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
