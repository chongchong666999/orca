import { insertAgentStartupArgs } from './agent-launch/startup/insert-agent-startup-args'
import type { AgentStartupShell } from './agent-launch/startup/tui-agent-startup-shell'

export function withClaudeAgentViewPlugin(
  command: string,
  root: string,
  shell: AgentStartupShell
): string {
  return insertAgentStartupArgs(command, 'claude', ['--plugin-dir', root], shell) ?? command
}
