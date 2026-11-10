/** The commands of the bundled a5-game-context package that tools outside cocos-agent call by name. */
export const A5_GAME_CONTEXT_COMMANDS = ['a5-game-context', 'cocos-cli'] as const

export type A5GameContextCommandRegistration = {
  /** Where the commands now live, or null when nothing could be registered. */
  directory: string | null
  linked: string[]
  /** Names left alone because a command that is not cocos-agent's already has them there. */
  kept: string[]
  /** Name → the file PATH finds first instead of ours. */
  shadowedBy: Record<string, string>
  /** The login profile that got the PATH line for `directory`. */
  profile: string | null
}
