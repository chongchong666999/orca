import {
  isPosixStartupShell,
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from './tui-agent-startup-shell'

/** Splice only a direct executable command whose parsed spans preserve shell semantics. */
export function insertAgentStartupArgs(
  command: string,
  executable: 'claude' | 'codex',
  args: readonly string[],
  shell: AgentStartupShell
): string | null {
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return null
  }
  const index = parsed.tokens.findIndex(
    (token, at) =>
      !(
        (isPosixStartupShell(shell) && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) ||
        (shell === 'powershell' && at === 0 && token === '&')
      )
  )
  const basename = parsed.tokens[index]?.split(/[\\/]/).pop() ?? ''
  if (!new RegExp(`^${executable}(\\.(exe|cmd|bat|ps1))?$`, 'i').test(basename)) {
    return null
  }
  for (let i = 0; i <= parsed.tokens.length; i++) {
    const start = i === 0 ? 0 : parsed.spans[i - 1].end
    const end = i === parsed.tokens.length ? command.length : parsed.spans[i].start
    if (!/^[ \t]*$/.test(command.slice(start, end))) {
      return null
    }
    if (
      i < parsed.tokens.length &&
      parsed.spans[i].divergesFromShell &&
      !(shell === 'powershell' && i === 0 && parsed.tokens[i] === '&')
    ) {
      return null
    }
  }
  const end = parsed.spans[index].end
  return `${command.slice(0, end)} ${args.map((arg) => quoteStartupArg(arg, shell)).join(' ')}${command.slice(end)}`
}
