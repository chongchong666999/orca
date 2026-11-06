import { memo, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../store'
import { isProvenProcessExit } from '../../../../shared/terminal/pty/lifecycle/terminal-exit-cause'
import { RetainedPaneHost } from '../tab-group/RetainedPaneHost'
import type { ActivityTerminalPortalTarget } from '../activity/activity-terminal-portal'
import TerminalPane from './TerminalPane'
import type { HiddenTerminalPrewarm } from './terminal-pane-types'
import { closeTerminalTab } from '../terminal/terminal-tab-actions'
import { shouldDeferParkedPtyExitTabClose } from './terminal-parked-tab-watchers'

type TerminalOverlaySlotProps = {
  terminalTabId: string
  terminalGeneration: number | undefined
  worktreeId: string
  worktreePath: string
  startupCwd: string | undefined
  groupId: string | undefined
  isWorktreeActive: boolean
  isVisible: boolean
  isActive: boolean
  /** Hover prewarm of a hidden reveal target. */
  hiddenPrewarm?: HiddenTerminalPrewarm | null
  /** Visible on the unfocused side of a split. */
  dimmed?: boolean
  activityTerminalPortal: ActivityTerminalPortalTarget | null
  onFocusOwningGroup: ((groupId: string) => void) | undefined
  consumeSuppressedPtyExit: (ptyId: string) => boolean
  /** Read when a close is requested; the returned reaction runs once it lands. */
  captureEmptiedReaction: () => () => void
  inline?: boolean
}

export const TerminalOverlaySlot = memo(function TerminalOverlaySlot({
  terminalTabId,
  terminalGeneration,
  worktreeId,
  worktreePath,
  startupCwd,
  groupId,
  isWorktreeActive,
  isVisible,
  isActive,
  hiddenPrewarm = null,
  dimmed = false,
  activityTerminalPortal,
  onFocusOwningGroup,
  consumeSuppressedPtyExit,
  captureEmptiedReaction,
  inline = false
}: TerminalOverlaySlotProps): React.JSX.Element {
  const sidebarFocused = useAppStore((s) => s.sidebarTerminalFocused === true)
  const active =
    (isActive || activityTerminalPortal?.active === true) &&
    (inline ? sidebarFocused : !sidebarFocused)
  const [shouldMeasureHiddenStartup, setShouldMeasureHiddenStartup] = useState(
    () => useAppStore.getState().pendingStartupByTabId[terminalTabId] !== undefined
  )
  useLayoutEffect(() => {
    if (isVisible && shouldMeasureHiddenStartup) {
      setShouldMeasureHiddenStartup(false)
    }
  }, [isVisible, shouldMeasureHiddenStartup])

  // Drop with the reveal in one render, or a later lease release re-runs resume and steals focus.
  const prewarm = isVisible || activityTerminalPortal !== null ? null : hiddenPrewarm
  const terminalPane = (
    <TerminalPane
      key={`${terminalTabId}-${terminalGeneration ?? 0}`}
      tabId={terminalTabId}
      worktreeId={worktreeId}
      cwd={startupCwd ?? worktreePath}
      isActive={active}
      // Retain TerminalPane outside reparented group subtrees to preserve TUI state; visibility still throttles hidden rendering.
      isVisible={isVisible || activityTerminalPortal !== null}
      isWorktreeActive={isWorktreeActive || activityTerminalPortal !== null}
      showSplitButton={!inline}
      isolatedPaneKey={activityTerminalPortal?.paneKey ?? null}
      measureWhileHidden={prewarm !== null}
      warmRendererWhileHidden={prewarm === 'warm'}
      onPtyExit={(ptyId, exitCode) => {
        if (consumeSuppressedPtyExit(ptyId)) {
          return
        }
        // A synthetic host-loss exit is not evidence that the user closed the tab.
        if (exitCode !== undefined && !isProvenProcessExit(exitCode)) {
          useAppStore.getState().markUnverifiedPtyLoss(terminalTabId)
          return
        }
        // Parked multi-leaf tabs have no PaneManager; defer dead-leaf handling until reveal rather than close live siblings.
        if (shouldDeferParkedPtyExitTabClose(terminalTabId, ptyId)) {
          return
        }
        closeTerminalTab(terminalTabId, {
          preserveWorktreeSelection: inline,
          reason: 'pty-exit',
          lifecyclePtyId: ptyId,
          onClosed: captureEmptiedReaction()
        })
      }}
      onCloseTab={() => {
        // Use the guarded close path so pinned terminals still require confirmation.
        closeTerminalTab(terminalTabId, {
          preserveWorktreeSelection: inline,
          onClosed: captureEmptiedReaction()
        })
      }}
    />
  )

  if (inline) {
    return <div className={isVisible ? 'absolute inset-0' : 'hidden'}>{terminalPane}</div>
  }

  if (activityTerminalPortal) {
    return createPortal(
      terminalPane,
      activityTerminalPortal.target,
      `activity-terminal-${terminalTabId}`
    )
  }

  return (
    <RetainedPaneHost
      groupId={groupId}
      isVisible={isVisible}
      measureWhileHidden={shouldMeasureHiddenStartup || prewarm !== null}
      fitTerminal
      dimmed={dimmed}
      data-terminal-overlay-tab-id={terminalTabId}
      onFocusOwningGroup={onFocusOwningGroup}
    >
      {terminalPane}
    </RetainedPaneHost>
  )
})
