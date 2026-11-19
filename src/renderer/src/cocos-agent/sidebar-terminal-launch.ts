import { useAppStore } from '@/store'
import { resolveOwner } from '@/lib/workspace/ownership/resolve-owner'
import { resolveWorktreeOperationRouteResult } from '@/lib/workspace/ownership/worktree-operation-route'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { createWebRuntimeSessionTerminalResult } from '@/runtime/hosted-terminals/creation/web-runtime-terminal-create-operation'
import { startStoppedWslHostForUserAct } from '@/runtime/hosts/wsl/wsl-host-user-start'
import { toWebTerminalSurfaceTabId } from '../../../shared/workspace-layout/terminal-surface-id'
import { parseWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { createNonSecureContextUuid } from '../../../shared/identifiers/non-secure-context-uuid'
import {
  agentPickerLaunchInputs,
  type AgentPickerDraft,
  type AgentPickerEntry
} from '../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewTabAgentMenuRow } from '../../../shared/agent-launch/picker/agent-launch-picker-rows'

function placeInSidebar(worktreeId: string, tabId: string | null): string | null {
  if (tabId) {
    useAppStore.getState().selectSidebarTerminal(worktreeId, tabId)
  }
  return tabId
}

export async function openSidebarTerminal(
  worktreeId: string,
  shell?: string
): Promise<string | null> {
  const state = useAppStore.getState()
  let environmentId: string | null
  if (parseWorkspaceKey(worktreeId)?.type === 'folder') {
    const owner = resolveOwner(state, { workspaceId: worktreeId })
    if (owner.kind !== 'resolved') {
      return null
    }
    environmentId =
      owner.owner.endpoint.kind === 'environment' ? owner.owner.endpoint.environmentId : null
  } else {
    const route = resolveWorktreeOperationRouteResult(state, worktreeId)
    if (route.kind !== 'resolved') {
      return null
    }
    environmentId = route.route.runtimeEnvironmentId
  }
  const groupId = state.activeGroupIdByWorktree[worktreeId]
  if (environmentId) {
    if (!(await startStoppedWslHostForUserAct(environmentId))) {
      return null
    }
    const result = await createWebRuntimeSessionTerminalResult({
      environmentId,
      worktreeId,
      targetGroupId: groupId,
      shell,
      activate: false,
      selectWorktree: false
    })
    return placeInSidebar(
      worktreeId,
      result.outcome.status === 'created' && result.hostTabId
        ? toWebTerminalSurfaceTabId(result.hostTabId)
        : null
    )
  }
  if (isWebClientLocation()) {
    return null
  }
  return placeInSidebar(
    worktreeId,
    state.createTab(worktreeId, groupId, shell, { activate: false }).id
  )
}

export async function openSidebarAgent(
  worktreeId: string,
  row: NewTabAgentMenuRow,
  draft?: AgentPickerDraft,
  entry?: AgentPickerEntry
): Promise<string | null> {
  const result = launchAgentInNewTabWithOutcome({
    requestId: createNonSecureContextUuid(),
    agent: row.agent,
    ...(draft ? agentPickerLaunchInputs(draft, entry) : {}),
    ...(draft?.prompt ? { prompt: draft.prompt } : {}),
    worktreeId,
    groupId: useAppStore.getState().activeGroupIdByWorktree[worktreeId],
    selectedExecutionHostId: row.executionHostId,
    requestedSurface: 'terminal',
    activate: false
  })
  if (!result || 'refused' in result) {
    return null
  }
  if (result.surface.kind === 'local-terminal') {
    return placeInSidebar(worktreeId, result.surface.tabId)
  }
  const completion = await result.terminalCompletion
  return placeInSidebar(
    worktreeId,
    completion?.outcome.status === 'created' ? (completion.tabId ?? null) : null
  )
}
