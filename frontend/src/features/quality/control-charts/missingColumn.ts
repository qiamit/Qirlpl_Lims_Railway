/** True when a column / relation is missing on this database (migration not applied). */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST204' || e.code === '42703' || e.code === 'PGRST200') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
}
