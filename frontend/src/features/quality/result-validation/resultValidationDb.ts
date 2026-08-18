import { fetchActiveUserProfiles } from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { checkTypeLabel } from './checkTypes'
import type {
  EquipmentOption,
  IqcOption,
  ResultValidityCheckForm,
  ResultValidityCheckRow,
  SampleOption,
  UserOption,
} from './types'
import { EQUIPMENT_KIND_TESTING } from '@/lib/equipmentKind'

function mapRow(r: Record<string, unknown>): ResultValidityCheckRow {
  return {
    id: r.id as string,
    checkRef: (r.check_ref as string) ?? '',
    checkType: r.check_type as ResultValidityCheckRow['checkType'],
    checkDate: (r.check_date as string) ?? '',
    status: r.status as ResultValidityCheckRow['status'],
    title: (r.title as string) ?? '',
    sampleId: (r.sample_id as string) ?? null,
    srfNumber: (r.srf_number as string) ?? null,
    testParameterName: (r.test_parameter_name as string) ?? null,
    equipmentId: (r.equipment_id as string) ?? null,
    equipmentLabel: (r.equipment_label as string) ?? null,
    iqcMasterId: (r.iqc_master_id as string) ?? null,
    iqcLabel: (r.iqc_label as string) ?? null,
    performedBy: (r.performed_by as string) ?? null,
    performedByName: (r.performed_by_name as string) ?? null,
    performedByDepartment: (r.performed_by_department as string) ?? null,
    performedByDesignation: (r.performed_by_designation as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedByName: (r.reviewed_by_name as string) ?? null,
    reviewedByDepartment: (r.reviewed_by_department as string) ?? null,
    reviewedByDesignation: (r.reviewed_by_designation as string) ?? null,
    predefinedCriteria: (r.predefined_criteria as string) ?? null,
    checkData: (r.check_data as ResultValidityCheckRow['checkData']) ?? {},
    conclusion: (r.conclusion as string) ?? null,
    actionTaken: (r.action_taken as string) ?? null,
    remarks: (r.remarks as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  }
}

function toDbPayload(
  form: ResultValidityCheckForm,
  userNameMap: Map<string, string>,
): Record<string, unknown> {
  return {
    check_type: form.checkType,
    check_date: form.checkDate,
    status: form.status,
    title: form.title.trim() || checkTypeLabel(form.checkType),
    sample_id: form.sampleId || null,
    srf_number: form.srfNumber.trim() || null,
    test_parameter_name: form.testParameterName.trim() || null,
    equipment_id: form.equipmentId || null,
    equipment_label: form.equipmentLabel.trim() || null,
    iqc_master_id: form.iqcMasterId || null,
    iqc_label: form.iqcLabel.trim() || null,
    performed_by: form.performedBy || null,
    performed_by_name: form.performedBy ? (userNameMap.get(form.performedBy) ?? null) : null,
    performed_by_department: form.performedByDepartment.trim() || null,
    performed_by_designation: form.performedByDesignation.trim() || null,
    reviewed_by: form.reviewedBy || null,
    reviewed_by_name: form.reviewedBy ? (userNameMap.get(form.reviewedBy) ?? null) : null,
    reviewed_by_department: form.reviewedByDepartment.trim() || null,
    reviewed_by_designation: form.reviewedByDesignation.trim() || null,
    predefined_criteria: form.predefinedCriteria.trim() || null,
    check_data: form.checkData,
    conclusion: form.conclusion.trim() || null,
    action_taken: form.actionTaken.trim() || null,
    remarks: form.remarks.trim() || null,
  }
}

export async function fetchResultValidityChecks(): Promise<ResultValidityCheckRow[]> {
  const { data, error } = await supabase
    .from('result_validity_checks')
    .select('*')
    .order('check_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(formatSupabaseError(error))
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function deleteResultValidityChecks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('result_validity_checks').delete().in('id', ids)
  if (error) throw new Error(formatSupabaseError(error))
}

async function nextCheckRef(): Promise<string> {
  const { data, error } = await supabase
    .from('lab_prefixes')
    .select('prefix, last_number')
    .eq('name', 'Result Validity Check')
    .maybeSingle()

  if (error) throw new Error(formatSupabaseError(error))

  const prefix = (data?.prefix as string) ?? 'QI/RVC-'
  const lastNumber = Number(data?.last_number ?? 0)
  const next = lastNumber + 1
  const checkRef = `${prefix}${String(next).padStart(4, '0')}`

  const { error: updErr } = await supabase
    .from('lab_prefixes')
    .update({ last_number: next })
    .eq('name', 'Result Validity Check')

  if (updErr) throw new Error(formatSupabaseError(updErr))
  return checkRef
}

export async function createResultValidityCheck(
  form: ResultValidityCheckForm,
  userNameMap: Map<string, string>,
): Promise<ResultValidityCheckRow> {
  const checkRef = await nextCheckRef()
  const payload = {
    check_ref: checkRef,
    ...toDbPayload(form, userNameMap),
  }

  const { data, error } = await supabase
    .from('result_validity_checks')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw new Error(formatSupabaseError(error))
  return mapRow(data as Record<string, unknown>)
}

export async function updateResultValidityCheck(
  id: string,
  form: ResultValidityCheckForm,
  userNameMap: Map<string, string>,
): Promise<ResultValidityCheckRow> {
  const { data, error } = await supabase
    .from('result_validity_checks')
    .update(toDbPayload(form, userNameMap))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(formatSupabaseError(error))
  return mapRow(data as Record<string, unknown>)
}

export async function fetchLookupOptions(): Promise<{
  users: UserOption[]
  equipment: EquipmentOption[]
  iqcMasters: IqcOption[]
  samples: SampleOption[]
  userNameMap: Map<string, string>
}> {
  const [equipmentRes, iqcRes, samplesRes, activeUsers] = await Promise.all([
    supabase.from('equipment_master').select('id, equipment_name, asset_code').eq('equipment_kind', EQUIPMENT_KIND_TESTING).order('equipment_name'),
    supabase.from('iqc_masters').select('id, asset_code, equipment_name').order('asset_code'),
    supabase
      .from('samples')
      .select('id, srf_number')
      .not('srf_number', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500),
    fetchActiveUserProfiles(),
  ])

  const users: UserOption[] = activeUsers.map((u) => ({
    id: u.id,
    fullName: u.name,
    departmentName: u.departmentName,
    designation: u.designation,
  }))
  const userNameMap = new Map(users.map((u) => [u.id, u.fullName]))

  const equipment = (equipmentRes.data ?? []).map((e) => ({
    id: e.id as string,
    label: `${e.equipment_name as string} (${e.asset_code as string})`,
  }))

  const iqcMasters = (iqcRes.data ?? []).map((i) => ({
    id: i.id as string,
    label: `${i.asset_code as string} — ${(i.equipment_name as string) ?? ''}`.trim(),
  }))

  const samples = (samplesRes.data ?? []).map((s) => ({
    id: s.id as string,
    srfNumber: (s.srf_number as string) ?? '',
  }))

  return { users, equipment, iqcMasters, samples, userNameMap }
}
