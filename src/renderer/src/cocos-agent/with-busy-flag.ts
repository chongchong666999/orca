/** Holds `setBusy(true)` until `action` settles; kept out of components so React Compiler can compile them. */
export async function withBusyFlag<T>(
  setBusy: (busy: boolean) => void,
  action: () => Promise<T>
): Promise<T> {
  setBusy(true)
  try {
    return await action()
  } finally {
    setBusy(false)
  }
}
