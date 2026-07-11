import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { deriveIqcPlanStatus } from './iqcPlanStatus'
import type { IqcPlanForm, IqcPlanRow, IqcPlanStatus } from './types'

function mapRow(r: Record<string, unknown>): IqcPlanRow {
  const storedStatus = (r.status as IqcPlanStatus) ?? 'planned'
  const lastDone = (r.last_done as string) ?? null
  const nextDue = (r.next_due as string) ?? null

  return {
    id: r.id as string,
    checkName: (r.check_name as string) ?? '',
    checkTypeSlug: (r.check_type_slug as string) ?? null,
    frequency: (r.frequency as string) ?? '',
    acceptanceCriteria: (r.acceptance_criteria as string) ?? null,
    lastDone,
    nextDue,
    status: deriveIqcPlanStatus({ nextDue, lastDone, storedStatus }),
    remarks: (r.remarks as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  }
}

function toDbPayload(form: IqcPlanForm): Record<string, unknown> {
  const lastDone = form.lastDone.trim() || null
  const nextDue = form.nextDue.trim() || null
  const storedStatus = form.status

  return {
    check_name: form.checkName.trim(),
    check_type_slug: form.checkTypeSlug.trim() || null,
    frequency: form.frequency.trim(),
    acceptance_criteria: form.acceptanceCriteria.trim() || null,
    last_done: lastDone,
    next_due: nextDue,
    status: deriveIqcPlanStatus({
      nextDue,
      lastDone,
      storedStatus,
    }),
    remarks: form.remarks.trim() || null,
  }
}

export async function fetchIqcPlanAcceptanceCriteriaByCheckTypeSlug(
  checkTypeSlug: string,
): Promise<string | null> {
  const slug = checkTypeSlug.trim()
  if (!slug) return null

  const { data, error } = await supabase
    .from('iqc_plan_items')
    .select('acceptance_criteria')
    .eq('check_type_slug', slug)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(formatSupabaseError(error))

  const criteria = (data?.[0] as { acceptance_criteria?: string | null } | undefined)
    ?.acceptance_criteria
  return criteria?.trim() || null
}

export async function fetchIqcPlanItems(): Promise<IqcPlanRow[]> {
  const { data, error } = await supabase
    .from('iqc_plan_items')
    .select('*')
    .order('check_name', { ascending: true })

  if (error) throw new Error(formatSupabaseError(error))
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function createIqcPlanItem(form: IqcPlanForm): Promise<IqcPlanRow> {
  const { data, error } = await supabase
    .from('iqc_plan_items')
    .insert(toDbPayload(form))
    .select('*')
    .single()

  if (error) throw new Error(formatSupabaseError(error))
  return mapRow(data as Record<string, unknown>)
}

export async function updateIqcPlanItem(id: string, form: IqcPlanForm): Promise<IqcPlanRow> {
  const { data, error } = await supabase
    .from('iqc_plan_items')
    .update(toDbPayload(form))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(formatSupabaseError(error))
  return mapRow(data as Record<string, unknown>)
}

export async function deleteIqcPlanItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('iqc_plan_items').delete().in('id', ids)
  if (error) throw new Error(formatSupabaseError(error))
}
