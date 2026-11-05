import { toast } from 'sonner'
import type {
  CocosAgentPreloadApi,
  CocosProjectDetection
} from '../../../shared/cocos-agent/cocos-editor-types'
import {
  getWorktreeExecutionHostId,
  isLocalExecutionHost,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { useAppStore, type AppState } from '@/store'
import { getWorktreeMapFromState } from '@/store/selectors'
import {
  resolveQualifiedIndexedFolderWorkspace,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'
import {
  findIndexedRepoOwner,
  findIndexedWorktreeOwnerForHost,
  resolveIndexedWorktreeOwner
} from '@/lib/worktree-runtime-owner-index'
import { holdEmptyWorkspaceDefaultSurfaceForLaunch } from '@/lib/empty-workspace-default-surface-claims'
import type { InitialTerminalOptions } from '@/lib/worktree-activation-store-contract'
import { ensureWorktreeHasInitialTerminal } from '@/lib/worktree-initial-terminal-seeding'

const EDITOR_TAB_TITLE = 'Cocos Creator'

// Why: renderer modules also load in node test environments, where there is no window.
function cocosAgentApi(): CocosAgentPreloadApi | undefined {
  return typeof window === 'undefined' ? undefined : window.cocosAgent
}

const detectionByPath = new Map<string, CocosProjectDetection>()
const pendingDetectionByPath = new Map<string, Promise<CocosProjectDetection>>()
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

function preferredHostId(
  state: AppState,
  worktreeId: string,
  executionHostId: ExecutionHostId | undefined
): ExecutionHostId | undefined {
  if (executionHostId) {
    return executionHostId
  }
  return state.activeWorktreeId === worktreeId
    ? (state.activeWorkspaceExecutionHostId ?? undefined)
    : undefined
}

/** The workspace folder when it resolves unambiguously to this machine; the editor service reads local disks only. */
function localWorkspacePath(
  state: AppState,
  worktreeId: string,
  executionHostId: ExecutionHostId | undefined
): string | null {
  const hostId = preferredHostId(state, worktreeId, executionHostId)
  const parsed = parseWorkspaceKey(worktreeId)
  if (parsed?.type === 'folder') {
    // Why: folders inherit SSH/runtime hosts from their project group, which the row itself may not carry.
    const folder = resolveQualifiedIndexedFolderWorkspace(state, parsed.folderWorkspaceId, hostId)
    return folder.kind === 'selected' && isLocalExecutionHost(folder.value.hostId)
      ? folder.value.workspace.folderPath
      : null
  }
  const worktrees = selectWorktreesByRepo(state)
  const worktree = hostId
    ? findIndexedWorktreeOwnerForHost(worktrees, worktreeId, hostId)
    : resolveIndexedWorktreeOwner(worktrees, worktreeId).kind === 'resolved'
      ? (getWorktreeMapFromState(state).get(worktreeId) ?? null)
      : null
  if (!worktree) {
    return null
  }
  const repo = worktree.hostId ? undefined : findIndexedRepoOwner(state.repos, worktree.repoId)
  if (!worktree.hostId && !repo) {
    return null
  }
  return isLocalExecutionHost(getWorktreeExecutionHostId(worktree, repo ?? undefined))
    ? worktree.path
    : null
}

function detectCocosProject(projectPath: string): Promise<CocosProjectDetection> {
  const pending = pendingDetectionByPath.get(projectPath)
  if (pending) {
    return pending
  }
  const notCocos: CocosProjectDetection = { kind: 'not-cocos' }
  const detection = (cocosAgentApi()?.detectProject(projectPath) ?? Promise.resolve(notCocos))
    .catch(() => notCocos)
    .then((result) => {
      detectionByPath.set(projectPath, result)
      pendingDetectionByPath.delete(projectPath)
      return result
    })
  pendingDetectionByPath.set(projectPath, detection)
  return detection
}

// Why: the GitNexus editor implements Creator 2.4; a project.json without a version is an old 2.x project.
function isSupportedCreatorVersion(version: string | null): boolean {
  return version === null || version.startsWith('2.')
}

/** True while the workspace still resolves to the same local folder the async work started for. */
function stillOwnsWorkspace(
  worktreeId: string,
  projectPath: string,
  opts: InitialTerminalOptions | undefined
): boolean {
  return (
    localWorkspacePath(useAppStore.getState(), worktreeId, opts?.executionHostId) === projectPath
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

function openEditorTab(
  worktreeId: string,
  projectPath: string,
  opts: InitialTerminalOptions | undefined
): void {
  const api = cocosAgentApi()
  if (!api) {
    return
  }
  const release = holdEmptyWorkspaceDefaultSurfaceForLaunch(worktreeId)
  void api
    .openEditor({ projectPath })
    .catch((error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : String(error)
    }))
    .then((result) => {
      release()
      if (!stillOwnsWorkspace(worktreeId, projectPath, opts)) {
        return
      }
      if (result.ok) {
        const state = useAppStore.getState()
        // Why: a surface the user opened while the editor started keeps focus; the editor joins beside it.
        const userOpenedSurface = (state.unifiedTabsByWorktree[worktreeId] ?? []).length > 0
        state.createBrowserTab(worktreeId, result.url, {
          title: EDITOR_TAB_TITLE,
          activate: !userOpenedSurface
        })
        return
      }
      toast.error('Could not open the Cocos Creator editor', { description: result.message })
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
  const projectPath = localWorkspacePath(useAppStore.getState(), worktreeId, opts?.executionHostId)
  if (!projectPath) {
    return false
  }
  const detection = detectionByPath.get(projectPath)
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
      `cocos-agent opens its editor for Cocos Creator 2.4 projects; this project uses ${detection.creatorVersion}.`
    )
    return false
  }
  openEditorTab(worktreeId, projectPath, opts)
  return true
}
