import { durableWriteTempPath, writeFileDurableIfCurrent } from '../filesystem/durable-file-write'

export function publishCocosAgentFile(
  file: string,
  contents: string,
  mode: number,
  isCurrent: () => boolean = () => true
): Promise<boolean> {
  return writeFileDurableIfCurrent(durableWriteTempPath(file), file, contents, isCurrent, mode)
}
