# SPEC — Creator parity follow-up and cocos-agent-beta

- Date: 2026-11-07.
- Tier: 3 for concurrent preview routing; Tier 2 for editor compatibility/layout fixes.
- Spec approval: not obtained (autonomous continuation requested); review this contract alongside the evidence.
- Workspaces: existing dedicated `codex/creator-parity-fixes-20261107` branches in `/Users/free/Documents/work/orca` and `/Users/free/Documents/work/GitNexus`. Do not create/switch branches or touch the AsiaPoker working tree. Existing changes are preserved and included in the requested delivery; pre-task path inventories are recorded separately.
- Setup: installed Node 24.22.2, existing pnpm/npm/Cargo, Vitest and Playwright; no new dependencies. Run apps hidden with `ORCA_BACKGROUND_LAUNCH=1`; do not stop user applications or take their ports.
- Git: review, validate and commit the previous implementation plus these follow-ups to both existing branches, then push normally to Orca `origin` and GitNexus `github`; no force push, hooks bypass, public release/tag or npm publication. Run Orca `pnpm check:changed` before each push and disclose existing baseline failures.
- Evidence artifacts: this spec; `docs/cocos-agent/creator-parity-beta-evidence-2026-11-07.md`; focused regression tests alongside the owning runtime/editor/preview modules; a persisted validation entry point under `config/scripts/`. Final evidence names exact tests, commands, source commits and package hashes, and explicitly distinguishes skipped/unavailable layers.

## Failure model

- Selecting B while A starts must not let A's late callback replace B's route: overlapping activation regression.
- Switching the editor must not redirect a running A preview to B: project-specific browser destinations and assets remain pinned.
- Unavailable/closed projects, occupied 7456 and startup/quit races must not silently route to another project or kill an external service: real HTTP lifecycle/conflict tests.
- Internal scene messages must not invoke the project's global web/native callback; unrelated project messages must continue working: execute actual runtime scripts with a business message listener.
- Profile compatibility must not allow arbitrary filesystem access or mutate project settings just by opening a prefab: profile scope/readonly regression.

## Acceptance scenarios

1. **Project profile in scene scripts.** Given AsiaPoker-style `Editor.Profile.load('profile://project/i18n.json', callback)` and `{default_language:'sc'}`, scene-script loading provides a profile with that data without unsupported API or undefined-profile errors; missing/error profiles follow the Creator error contract rather than fabricating translation data.
2. **Scene transport isolation.** Given a project listener registered with `window.addEventListener('message', ...)`, editor open/query/layout/plugin messages reach the editor runtime but not that listener; unrelated project messages still reach it. No project-specific NativeEvent special case or eager game initialization.
3. **Narrow toolbar.** Given an editor width reduced by the right terminal sidebar, Play and its HotUpdate scene selector remain one usable row without overlap/clipping or a broken wrapped control; test actual bounding boxes/screenshots at explicit widths, not CSS spellings.
4. **Current-project preview entry.** With A and B editors running, new `http://localhost:7456/` preview requests resolve to the currently selected Cocos project. Selecting B changes subsequent requests only. The selected project's own preview server remains the authority for game startup and assets.
5. **Pinned running preview.** A browser already playing A keeps A after selecting B, including subsequent asset/device requests and reloads of its project-specific URL. Do not replace an existing Play window on workspace selection.
6. **Router lifecycle and errors.** No selected/live project returns an explicit unavailable response; port conflict is reported without stopping or moving the external owner. The application releases only its own listener on quit. Stale asynchronous selection results cannot win over a newer selection.
7. **Beta package identity.** Build macOS arm64 `cocos-agent-beta.app`, with beta-named DMG/ZIP and checksums, containing the newly built Cocos Web. Preserve persistent signing identity and existing user-data location; do not silently install/launch or overwrite the running app. Verify signature, archive integrity, package exclusions and bundled binary version.
8. **Previous work retained.** Existing unsaved-close protection, page/MCP restoration, lifecycle limits, signing/package filtering and Creator parity fixes stay included; add no unrelated game changes. Existing tests are not removed, skipped or weakened to get green.

## Verification plan

- Run focused tests RED before each implementation; retain test names and failure evidence.
- Run editor-web suite, relevant Rust runtime/editor/device suites and Orca Cocos service/renderer/preview tests; run broader unit/integration/native commands as resources allow, report blockers exactly.
- Typecheck, scoped lint/format, diff/secret review, shuffled/repeated concurrency tests; execute real HTTP routing and hidden browser rendering.
- Exercise deliberate wrong-selection/missing-filter mutants against owning tests; report mutation and changed-line coverage limits honestly if tools cannot cover the complete cross-language change.
- Rebuild native/platform package; pin its version/hash in Orca; build beta only after source validation. Do not publish upstream or npm.

## Revisions

- Initial contract written before new implementation. The initial Orca gate exposed existing assertion/style, runtime-import, localization and ratchet failures; keep the baseline log and fix touched-code defects without raising baselines or weakening checks.
