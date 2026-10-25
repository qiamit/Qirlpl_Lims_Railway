import { fetchDeletedKeys } from '@/lib/softDelete'
import { supabase } from '@/lib/supabaseClient'
import { nextNcId, type NcWorkRecordRow } from './types'

/** Next NCW-YYYY-NNNN, skipping numbers of live and deleted NC records. */
export async function suggestNcId(): Promise<string> {
  const prefix = `NCW-${new Date().getFullYear()}-`
  const [{ data, error }, deleted] = await Promise.all([
    supabase.from('nc_work_records').select('nc_id').like('nc_id', `${prefix}%`),
    fetchDeletedKeys('nc_work_records', 'nc_id'),
  ])
  if (error) throw error
  return nextNcId((data ?? []) as NcWorkRecordRow[], deleted)
}

function bumpNcId(id: string): string {
  const m = id.match(/^(.*-)(\d+)$/)
  if (!m) return id
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`
}

/**
 * Inserts an NC work record, moving to the next number when the suggested one
 * was taken meanwhile (or is held by a deleted record).
 */
export async function insertNcRecord(
  ncId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; nc_id: string }> {
  let id = ncId
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from('nc_work_records')
      .insert({ ...payload, nc_id: id })
      .select('id, nc_id')
      .single()
    if (!error) return data as { id: string; nc_id: string }
    if (error.code === '23505') {
      id = bumpNcId(id)
      continue
    }
    throw error
  }
  throw new Error('Could not find a free NC number. Open Nonconforming Work Records and add it there.')
}
