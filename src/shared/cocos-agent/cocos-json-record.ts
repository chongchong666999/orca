/** A parsed JSON object (not an array or null) whose fields are still unchecked. */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
