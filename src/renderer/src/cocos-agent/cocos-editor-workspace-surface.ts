import { toast } from 'sonner'
import { cocosText } from './cocos-text'
import { useAppStore } from '@/store'
import { holdEmptyWorkspaceDefaultSurfaceForLaunch } from '@/lib/empty-workspace-default-surface-claims'
import type { InitialTerminalOptions } from '@/lib/worktree-activation-store-contract'
import { ensureWorktreeHasInitialTerminal } from '@/lib/worktree-initial-terminal-seeding'
import {
  cocosAgentApi,
  detectCocosProject,
  getCachedCocosDetection,
  isSupportedCreatorVersion,
  localCocosWorkspacePath
} from './cocos-workspace-project'
import { openCocosEditorTab } from './cocos-editor-tabs'

// Why: the whole fallback chain after a failure (default chat, then its shell fallback) re-enters the seeder.
const EDITOR_FAILURE_COOLDOWN_MS = 30_000
/** When each workspace's editor last failed to open; seeds within the cooldown fall through to the usual surface. */
const editorFailedAtByWorkspace = new Map<string, number>()

function editorRecentlyFailed(worktreeId: string): boolean {
  const failedAt = editorFailedAtByWorkspace.get(worktreeId)
  if (failedAt === undefined) {
    return false
  }
  if (Date.now() - failedAt < EDITOR_FAILURE_COOLDOWN_MS) {
    return true
  }
  editorFailedAtByWorkspace.delete(worktreeId)
  return false
}

/** True while the workspace still resolves to the same local folder the async work started for. */
function stillOwnsWorkspace(
  worktreeId: string,
  projectPath: string,
  opts: InitialTerminalOptions | undefined
): boolean {
  return (
    localCocosWorkspacePath(useAppStore.getState(), worktreeId, opts?.executionHostId) ===
    projectPath
  )
}

// Why: no explicit launch work reaches this seeder, so a re-seed needs only the workspace and its options.
function seedAgain(worktreeId: string, opts: InitialTerminalOptions | undefined): void {
  ensureWorktreeHasInitialTerminal(
    useAppStore.getState(),
    worktreeId,
    undefined,
    undefined,
    undefined,
    undefined,
    opts
  )
}

function openEditorAsFirstSurface(
  worktreeId: string,
  projectPath: string,
  opts: InitialTerminalOptions | undefined
): void {
  const release = holdEmptyWorkspaceDefaultSurfaceForLaunch(worktreeId)
  void openCocosEditorTab(worktreeId, projectPath, {
    executionHostId: opts?.executionHostId,
    focus: 'user-surface'
  }).then((outcome) => {
    release()
    if (outcome.kind !== 'failed') {
      return
    }
    toast.error(cocosText('editor.errors.open', 'Could not open the Cocos Creator editor'), {
      description: outcome.message
    })
    editorFailedAtByWorkspace.set(worktreeId, Date.now())
    seedAgain(worktreeId, opts)
  })
}

/**
 * The default first surface of an empty local Cocos Creator 2.x workspace: its GitNexus editor in a browser tab.
 * False leaves the usual seeding alone; true means the editor (or, after a failure, a re-seed) fills it later.
 */
export function openCocosEditorInEmptyWorkspace(
  worktreeId: string,
  opts: InitialTerminalOptions | undefined,
  hasExplicitLaunchWork: boolean
): boolean {
  if (
    !cocosAgentApi() ||
    opts?.activateCreatedTabs === false ||
    hasExplicitLaunchWork ||
    editorRecentlyFailed(worktreeId)
  ) {
    return false
  }
  const projectPath = localCocosWorkspacePath(
    useAppStore.getState(),
    worktreeId,
    opts?.executionHostId
  )
  if (!projectPath) {
    return false
  }
  const detection = getCachedCocosDetection(projectPath)
  if (!detection) {
    // Why: detection is an IPC round trip; holding the surface keeps other seeders from adding a shell meanwhile.
    const release = holdEmptyWorkspaceDefaultSurfaceForLaunch(worktreeId)
    void detectCocosProject(projectPath).then(() => {
      release()
      if (stillOwnsWorkspace(worktreeId, projectPath, opts)) {
        seedAgain(worktreeId, opts)
      }
    })
    return true
  }
  if (detection.kind !== 'cocos') {
    return false
  }
  if (!isSupportedCreatorVersion(detection.creatorVersion)) {
    toast.info(
      cocosText(
        'editor.errors.unsupportedVersion',
        'cocos-agent opens its editor for Cocos Creator 2.4 projects; this project uses {{version}}.',
        { version: detection.creatorVersion }
      )
    )
    return false
  }
  openEditorAsFirstSurface(worktreeId, projectPath, opts)
  return true
}
