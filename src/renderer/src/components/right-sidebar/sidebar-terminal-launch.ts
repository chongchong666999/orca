import { useAppStore } from '@/store'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { resolveWorktreeOperationRouteResult } from '@/lib/worktree-operation-route'
import { isWebClientLocation } from '@/lib/web-client-location'
import { createWebRuntimeSessionTerminalResult } from '@/runtime/web-runtime-terminal-create-operation'
import { startStoppedWslHostForUserAct } from '@/lib/wsl-host-user-start'
import { toWebTerminalSurfaceTabId } from '../../../../shared/workspace-layout/terminal-surface-id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import {
  agentPickerLaunchInputs,
  type AgentPickerDraft,
  type AgentPickerEntry
} from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewTabAgentMenuRow } from '../../../../shared/agent-launch/picker/agent-launch-picker-rows'

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
  const route =
    parseWorkspaceKey(worktreeId)?.type === 'folder'
      ? null
      : resolveWorktreeOperationRouteResult(state, worktreeId)
  if (route && route.kind !== 'resolved') {
    return null
  }
  const environmentId = route
    ? route.route.runtimeEnvironmentId
    : runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId)
  const groupId = state.activeGroupIdByWorktree[worktreeId]
  if (environmentId) {
    if (!(await startStoppedWslHostForUserAct(environmentId))) {
      return null
    }
    const result = await createWebRuntimeSessionTerminalResult({
      worktreeId,
      environmentId,
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
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent: row.agent,
    ...(draft ? agentPickerLaunchInputs(draft, entry) : {}),
    ...(draft?.prompt ? { prompt: draft.prompt } : {}),
    worktreeId,
    groupId: useAppStore.getState().activeGroupIdByWorktree[worktreeId],
    selectedExecutionHostId: row.executionHostId,
    requestedSurface: 'terminal',
    activate: false
  })
  if (!result) {
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
