/**
 * Fetch rows for many parent IDs via `.in()`, chunked so PostgREST's default
 * max-rows (~1000) does not drop parameters for later allocations.
 */
export async function fetchByIdChunks<T>(
  ids: string[],
  chunkSize: number,
  fetchChunk: (chunkIds: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const size = Math.max(1, chunkSize)
  const out: T[] = []
  for (let i = 0; i < unique.length; i += size) {
    const chunk = unique.slice(i, i + size)
    const rows = await fetchChunk(chunk)
    out.push(...rows)
  }
  return out
}
