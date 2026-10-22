/**
 * Append-only maintenance / intermediate check registers (ISO/IEC 17025
 * 6.4.10, 6.4.13; migration 20261031100100_equipment_history_tables.sql).
 *
 * The history dialogs read the register rows of the equipment and merge them
 * with the JSONB history held by the form:
 *   - a register entry that matches a JSONB entry is shown from the JSONB (so
 *     the Laboratory Director can still correct it there);
 *   - a register entry missing from the JSONB is shown read-only ("register");
 *   - an entry the Director removed or replaced (equipment_history_changes) is
 *     not shown (it stays in the register and the change log);
 *   - JSONB entries not yet saved are shown as before.
 * Before the migration (tables missing) the dialogs show the JSONB only.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { isMissingTableError } from './equipmentAcceptance'
import { parseMaintenanceHistoryFromDb, type MaintenanceHistoryRecord } from './maintenanceHistory'
import {
  parseIntermediateCheckHistoryFromDb,
  type IntermediateCheckHistoryRecord,
} from './intermediateCheckHistory'

export type EquipmentHistorySourceTable = 'equipment_master' | 'equipment_for_calibration' | 'iqc_masters'

/** Which equipment the history belongs to: the row id, or its asset code. */
export type EquipmentHistorySource = {
  table: EquipmentHistorySourceTable
  id?: string | null
  assetCode?: string | null
}

export type EquipmentHistoryKind = 'maintenance' | 'intermediate_check'

type RegisterRow = {
  id: string
  entry_key: string
  entry_id: string | null
  entry: unknown
  created_at: string
}

export type RegisterEntry<T> = { record: T; entryId: string | null }

/** null = registers not on this database (or no source): use the JSONB only. */
type LoadedRegister = { entries: Array<{ entryId: string | null; entry: unknown; registerId: string }> } | null

const REGISTER_TABLE: Record<EquipmentHistoryKind, string> = {
  maintenance: 'equipment_maintenance_events',
  intermediate_check: 'equipment_intermediate_checks',
}

async function resolveSourceId(source: EquipmentHistorySource): Promise<string | null> {
  if (source.id?.trim()) return source.id.trim()
  const code = source.assetCode?.trim()
  if (!code) return null
  const { data, error } = await supabase.from(source.table).select('id').eq('asset_code', code).limit(1)
  if (error || !data || data.length === 0) return null
  return String((data[0] as { id: string }).id)
}

async function loadRegister(
  kind: EquipmentHistoryKind,
  source: EquipmentHistorySource,
): Promise<LoadedRegister> {
  const table = REGISTER_TABLE[kind]
  const sourceId = await resolveSourceId(source)
  if (!sourceId) {
    // Unsaved equipment: still tell the caller whether the registers exist.
    const probe = await supabase.from(table).select('id').limit(0)
    if (probe.error && isMissingTableError(probe.error, table)) return null
    return { entries: [] }
  }
  const { data, error } = await supabase
    .from(table)
    .select('id, entry_key, entry_id, entry, created_at')
    .eq('source_table', source.table)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: true })
  if (error) {
    if (!isMissingTableError(error, table)) console.warn(`Could not load ${table}:`, error)
    return null
  }
  const hidden = new Set<string>()
  const changes = await supabase
    .from('equipment_history_changes')
    .select('entry_key, action, seq')
    .eq('source_table', source.table)
    .eq('source_id', sourceId)
    .eq('history_kind', kind)
    .order('seq', { ascending: true })
  if (!changes.error) {
    const last = new Map<string, string>()
    for (const c of (changes.data ?? []) as Array<{ entry_key: string; action: string }>) {
      last.set(c.entry_key, c.action)
    }
    for (const [key, action] of last) if (action === 'removed' || action === 'modified') hidden.add(key)
  }
  return {
    entries: ((data ?? []) as RegisterRow[])
      .filter((r) => !hidden.has(r.entry_key))
      .map((r) => ({ entryId: r.entry_id, entry: r.entry, registerId: r.id })),
  }
}

function maintenanceSignature(r: MaintenanceHistoryRecord): string {
  return JSON.stringify([r.conductedOn, r.doneBy, r.doneByName, r.nextDueDate, r.checklist])
}

function intermediateSignature(r: IntermediateCheckHistoryRecord): string {
  return JSON.stringify([r.conductedOn, r.doneBy, r.doneByName, r.status, r.resultSummary, r.readings])
}

/**
 * JSONB records first (unchanged order), then register entries that are not
 * in the JSONB. readOnlyIds = ids of the register-only records.
 */
export function mergeHistoryWithRegister<T extends { id: string }>(
  jsonb: T[],
  register: Array<RegisterEntry<T>> | null,
  signature: (r: T) => string,
): { records: T[]; readOnlyIds: Set<string> } {
  const readOnlyIds = new Set<string>()
  if (!register) return { records: jsonb, readOnlyIds }
  const used = new Set<number>()
  const extra: T[] = []
  for (const { record, entryId } of register) {
    let idx = entryId ? jsonb.findIndex((j, i) => !used.has(i) && j.id === entryId) : -1
    if (idx < 0) {
      const sig = signature(record)
      idx = jsonb.findIndex((j, i) => !used.has(i) && signature(j) === sig)
    }
    if (idx >= 0) {
      used.add(idx)
    } else {
      extra.push(record)
      readOnlyIds.add(record.id)
    }
  }
  return { records: [...jsonb, ...extra], readOnlyIds }
}

function useRegister(kind: EquipmentHistoryKind, source: EquipmentHistorySource | undefined, enabled: boolean) {
  const [loaded, setLoaded] = useState<LoadedRegister>(null)
  const table = source?.table
  const id = source?.id ?? ''
  const assetCode = source?.assetCode ?? ''
  useEffect(() => {
    if (!enabled || !table) return
    let cancelled = false
    void loadRegister(kind, { table, id, assetCode })
      .then((res) => {
        if (!cancelled) setLoaded(res)
      })
      .catch(() => {
        if (!cancelled) setLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [kind, table, id, assetCode, enabled])
  return enabled && table ? loaded : null
}

/** Maintenance history for a dialog: JSONB merged with the register (when present). */
export function useMaintenanceHistoryWithRegister(
  history: MaintenanceHistoryRecord[],
  source: EquipmentHistorySource | undefined,
  enabled: boolean,
) {
  const loaded = useRegister('maintenance', source, enabled)
  return useMemo(() => {
    const register = loaded
      ? loaded.entries.flatMap(({ entry, entryId, registerId }) =>
          parseMaintenanceHistoryFromDb([entry]).map((record) => ({
            record: { ...record, id: `register:${registerId}` },
            entryId,
          })),
        )
      : null
    const merged = mergeHistoryWithRegister(history, register, maintenanceSignature)
    return { ...merged, registerActive: loaded !== null }
  }, [history, loaded])
}

/** Intermediate check history for a dialog: JSONB merged with the register (when present). */
export function useIntermediateCheckHistoryWithRegister(
  history: IntermediateCheckHistoryRecord[],
  source: EquipmentHistorySource | undefined,
  enabled: boolean,
) {
  const loaded = useRegister('intermediate_check', source, enabled)
  return useMemo(() => {
    const register = loaded
      ? loaded.entries.flatMap(({ entry, entryId, registerId }) =>
          parseIntermediateCheckHistoryFromDb([entry]).map((record) => ({
            record: { ...record, id: `register:${registerId}` },
            entryId,
          })),
        )
      : null
    const merged = mergeHistoryWithRegister(history, register, intermediateSignature)
    return { ...merged, registerActive: loaded !== null }
  }, [history, loaded])
}
