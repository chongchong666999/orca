import { expect, it, vi } from 'vitest'
import { addWindowsA5GameContextPathEntry } from './a5-game-context-windows-user-path'

it('adds this install to the user PATH once and drops the folders of installs that are gone', async () => {
  const installed =
    'C:\\Users\\me\\AppData\\Local\\Programs\\cocos-agent-beta\\resources\\a5-game-context-bin'
  const removed = 'D:\\old\\cocos-agent-beta\\resources\\a5-game-context-bin'
  let userPath = `C:\\Windows;${removed};C:\\Users\\me\\bin`
  const writeUserPath = vi.fn(async (value: string) => {
    userPath = value
  })
  const input = {
    directory: installed,
    readUserPath: async () => ({ state: 'success' as const, value: userPath, expandable: false }),
    writeUserPath,
    exists: (directory: string) => directory !== removed
  }

  await addWindowsA5GameContextPathEntry(input)
  await addWindowsA5GameContextPathEntry(input)

  expect(writeUserPath).toHaveBeenCalledTimes(1)
  expect(userPath).toBe(`C:\\Windows;C:\\Users\\me\\bin;${installed}`)
})
