import { supabase } from '@/lib/supabaseClient'
import { PHYSICAL_CONDITIONS } from './types'

export type PhysicalConditionOptionRow = {
  id: string
  name: string
  created_at?: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let cache: PhysicalConditionOptionRow[] | null = null
let inflight: Promise<PhysicalConditionOptionRow[]> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

function sortRows(rows: PhysicalConditionOptionRow[]): PhysicalConditionOptionRow[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export function subscribePhysicalConditions(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCachedPhysicalConditions(): PhysicalConditionOptionRow[] {
  return cache ?? []
}

export async function loadPhysicalConditions(force = false): Promise<PhysicalConditionOptionRow[]> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    const { data, error } = await supabase
      .from('physical_condition_options')
      .select('id, name, created_at')
      .order('name', { ascending: true })

    if (error) throw error
    const rows = Array.isArray(data) ? (data as PhysicalConditionOptionRow[]) : []
    cache =
      rows.length > 0
        ? rows
        : PHYSICAL_CONDITIONS.map((name) => ({ id: `local-${name}`, name }))
    inflight = null
    notify()
    return cache
  })()

  return inflight
}

export async function addPhysicalCondition(name: string): Promise<PhysicalConditionOptionRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Physical condition is required')

  const { data, error } = await supabase
    .from('physical_condition_options')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as PhysicalConditionOptionRow
  cache = sortRows([...(cache ?? []).filter((c) => !c.id.startsWith('local-')), row])
  notify()
  return row
}

export async function updatePhysicalCondition(
  id: string,
  name: string,
): Promise<PhysicalConditionOptionRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Physical condition is required')
  if (id.startsWith('local-')) {
    return addPhysicalCondition(trimmed)
  }

  const { data, error } = await supabase
    .from('physical_condition_options')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as PhysicalConditionOptionRow
  cache = sortRows((cache ?? []).map((c) => (c.id === id ? row : c)))
  notify()
  return row
}

export async function deletePhysicalCondition(id: string): Promise<string | undefined> {
  const removed = cache?.find((c) => c.id === id)
  if (id.startsWith('local-')) {
    cache = (cache ?? []).filter((c) => c.id !== id)
    notify()
    return removed?.name
  }

  const { error } = await supabase.from('physical_condition_options').delete().eq('id', id)
  if (error) throw error
  cache = (cache ?? []).filter((c) => c.id !== id)
  notify()
  return removed?.name
}
