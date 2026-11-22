import { expect, it, vi } from 'vitest'
import { removeWindowsA5GameContextPathEntries } from './a5-game-context-windows-user-path'

it('removes every cocos-agent launcher folder from the user PATH and leaves the rest', async () => {
  const installed =
    'C:\\Users\\me\\AppData\\Local\\Programs\\cocos-agent-beta\\resources\\a5-game-context-bin'
  const older = 'D:\\old\\cocos-agent-beta\\resources\\a5-game-context-bin\\'
  let userPath = `C:\\Windows;${older};C:\\Users\\me\\AppData\\Roaming\\npm;${installed}`
  const writeUserPath = vi.fn(async (value: string) => {
    userPath = value
  })
  const input = {
    readUserPath: async () => ({ state: 'success' as const, value: userPath, expandable: false }),
    writeUserPath
  }

  await removeWindowsA5GameContextPathEntries(input)
  await removeWindowsA5GameContextPathEntries(input)

  expect(writeUserPath).toHaveBeenCalledTimes(1)
  expect(userPath).toBe('C:\\Windows;C:\\Users\\me\\AppData\\Roaming\\npm')
})
