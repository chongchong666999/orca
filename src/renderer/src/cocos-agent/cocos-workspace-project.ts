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
import type { AppState } from '@/store'
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

// Why: renderer modules also load in node test environments, where there is no window.
export function cocosAgentApi(): CocosAgentPreloadApi | undefined {
  return typeof window === 'undefined' ? undefined : window.cocosAgent
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
export function localCocosWorkspacePath(
  state: AppState,
  worktreeId: string,
  executionHostId?: ExecutionHostId
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

const detectionByPath = new Map<string, CocosProjectDetection>()
const pendingDetectionByPath = new Map<string, Promise<CocosProjectDetection>>()
const detectionListeners = new Set<() => void>()

export function getCachedCocosDetection(projectPath: string): CocosProjectDetection | undefined {
  return detectionByPath.get(projectPath)
}

export function subscribeCocosDetection(listener: () => void): () => void {
  detectionListeners.add(listener)
  return () => detectionListeners.delete(listener)
}

/** Detects once per path for the app session; concurrent callers share the IPC round trip. */
export function detectCocosProject(projectPath: string): Promise<CocosProjectDetection> {
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
      for (const listener of detectionListeners) {
        listener()
      }
      return result
    })
  pendingDetectionByPath.set(projectPath, detection)
  return detection
}

// Why: the GitNexus editor implements Creator 2.4; a project.json without a version is an old 2.x project.
export function isSupportedCreatorVersion(version: string | null): boolean {
  return version === null || version.startsWith('2.')
}
