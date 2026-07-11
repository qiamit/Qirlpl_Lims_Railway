import { supabase } from '@/lib/supabaseClient'

export function formatIsCodeLabel(
  isNumber?: string | null,
  revisionYear?: string | null,
): string | null {
  const num = isNumber?.trim()
  if (!num) return null
  const year = revisionYear?.trim()
  return year ? `${num} : ${year}` : num
}

export async function fetchIsCodeLabelMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map

  const { data } = await supabase
    .from('is_codes')
    .select('id, is_number, revision_year')
    .in('id', ids)

  for (const row of Array.isArray(data) ? data : []) {
    const r = row as { id: string; is_number?: string; revision_year?: string | null }
    const label = formatIsCodeLabel(r.is_number, r.revision_year)
    if (label) map.set(r.id, label)
  }

  return map
}
