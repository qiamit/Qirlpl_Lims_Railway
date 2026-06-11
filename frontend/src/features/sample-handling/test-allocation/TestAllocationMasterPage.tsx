import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import type { TestAllocationRow } from '../types'
import type { TestAllocationFormState } from './TestAllocationForm'
import { TestAllocationHeaderBar } from './TestAllocationHeaderBar'
import { TestAllocationTable } from './TestAllocationTable'
import { TestAllocationFooterBar } from './TestAllocationFooterBar'
import { TestAllocationForm } from './TestAllocationForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  deleteTestAllocationsForSampleAllocations,
  referbackSectionToSampleReceiving,
} from '../referbackFlow'
import { canDeleteSampleHandlingRecords, isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteTestAllocationsForSections,
} from '@/features/sample-handling/shared/deleteSampleRecords'

type UserFromApi = { id: string; name: string; designation: string; departmentName: string }

const normUserField = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

export default function TestAllocationMasterPage() {
  const { session, departmentName, designation } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [employeeFilterId, setEmployeeFilterId] = useState<string>('')

  const [formOpen, setFormOpen] = useState(false)
  const [formRow, setFormRow] = useState<TestAllocationRow | null>(null)
  const [form, setForm] = useState<TestAllocationFormState | null>(null)
  const [availableSections, setAvailableSections] = useState<TestAllocationRow[]>([])
  const [availableSectionsLoading, setAvailableSectionsLoading] = useState(false)

  const [testParamOptions, setTestParamOptions] = useState<Array<{ id: string; label: string }>>([])
  const [users, setUsers] = useState<UserFromApi[]>([])

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, designation, department_name, status')
      .order('full_name', { ascending: true })
    if (error) return
    const rows = Array.isArray(data) ? data : []
    setUsers(
      rows
        .filter((u) => normUserField((u as { status?: string }).status) !== 'inactive')
        .map((u) => ({
          id: String((u as { id: string }).id),
          name:
            String((u as { full_name?: string }).full_name ?? '').trim() ||
            String((u as { id: string }).id),
          designation: String((u as { designation?: string }).designation ?? '').trim(),
          departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
        })),
    )
  }

  const loadTestParams = async () => {
    const [{ data, error }, { data: abData }] = await Promise.all([
      supabase
        .from('test_parameters')
        .select('id, item_name, specific_requirement, under_accreditation_ids, department, designation, is_code_id')
        .order('item_name', { ascending: true }),
      supabase.from('accreditation_bodies').select('id, name').order('name', { ascending: true }),
    ])
    if (error || !Array.isArray(data)) return
    const accreditationBodies = (Array.isArray(abData) ? abData : []) as Array<{ id: string; name: string }>
    const rows = data as Array<{
      id: string
      item_name: string | null
      specific_requirement: string | null
      under_accreditation_ids: string[] | null
      department: string | null
      designation: string | null
      is_code_id: string | null
    }>
    const underAccrLabel = (ids: string[] | null) => {
      if (!Array.isArray(ids) || ids.length === 0) return 'Not Accredited'
      const names = ids
        .map((id) => accreditationBodies.find((b) => b.id === id)?.name)
        .filter(Boolean) as string[]
      return names.length > 0 ? names.join(', ') : 'Not Accredited'
    }
    setTestParamOptions(
      rows.map((r) => ({
        id: r.id,
        label: r.item_name ?? r.id,
        specificRequirement: r.specific_requirement ?? '',
        underAccreditation: underAccrLabel(r.under_accreditation_ids ?? null),
        isCodeId: r.is_code_id ?? null,
        department: r.department ?? null,
      })),
    )
  }

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select(
          'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_start_date, results, test_end_date, sent_for_testing',
        )
        .order('created_at', { ascending: false })
      if (taErr) throw taErr
      const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
      if (testAllocs.length === 0) {
        setRows([])
        return
      }
      const testAllocationIds = testAllocs.map((t: { id: string }) => t.id)
      const paramIdsByAllocation = new Map<string, string[]>()
      if (testAllocationIds.length > 0) {
        const { data: paramData } = await supabase
          .from('test_allocation_parameters')
          .select('test_allocation_id, test_parameter_id')
          .in('test_allocation_id', testAllocationIds)
        for (const p of Array.isArray(paramData) ? paramData : []) {
          const taId = (p as { test_allocation_id: string }).test_allocation_id
          const tpId = (p as { test_parameter_id: string | null }).test_parameter_id
          if (!taId || !tpId) continue
          const list = paramIdsByAllocation.get(taId) ?? []
          list.push(tpId)
          paramIdsByAllocation.set(taId, list)
        }
      }
      const allocIds = testAllocs.map((t: { sample_allocation_id: string }) => t.sample_allocation_id)
      const { data: allocData, error: allocErr } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation')
        .in('id', allocIds)
      if (allocErr) throw allocErr
      const allocations = Array.isArray(allocData) ? allocData : []
      const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))
      const sampleIds = [...new Set(allocations.map((a: { sample_id: string }) => a.sample_id))]
      const { data: sampleData, error: sampleErr } = await supabase
        .from('samples')
        .select('id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation')
        .in('id', sampleIds)
      if (sampleErr) throw sampleErr
      const isCodeIds = [...new Set(
        (Array.isArray(sampleData) ? sampleData : [])
          .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
          .filter(Boolean),
      )] as string[]
      let isCodeMap = new Map<string, string>()
      if (isCodeIds.length > 0) {
        const { data: isCodeData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isCodeIds)
        const isCodes = Array.isArray(isCodeData) ? isCodeData : []
        isCodeMap = new Map(
          isCodes.map((c: { id: string; is_number?: string; revision_year?: string | null }) => [
            c.id,
            c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
          ]),
        )
      }
      const samplesMap = new Map(
        (Array.isArray(sampleData) ? sampleData : []).map((s: { id: string; srf_number?: string; date_of_sample_receiving?: string; test_report_is_code_id?: string | null; referback_from_allocation?: boolean | null }) => [
          s.id,
          {
            srf_number: s.srf_number ?? null,
            date_of_sample_receiving: s.date_of_sample_receiving ?? null,
            isCodeId: s.test_report_is_code_id ?? null,
            isCodeLabel: s.test_report_is_code_id ? (isCodeMap.get(s.test_report_is_code_id) ?? null) : null,
            referbackFromAllocation: !!s.referback_from_allocation,
          },
        ]),
      )
      const list: TestAllocationRow[] = testAllocs.map((t: {
        id: string
        sample_allocation_id: string
        assigned_employee_id?: string | null
        assigned_employee_name?: string | null
        test_parameter_summary?: string | null
        test_parameter_ids?: string[] | null
        test_start_date?: string | null
        results?: string | null
        test_end_date?: string | null
        sent_for_testing?: boolean | null
      }) => {
        const a = allocMap.get(t.sample_allocation_id) as {
          id: string
          sample_id: string
          section_code: string
          allocation_date: string | null
          department: string | null
          designation: string | null
        } | undefined
        if (!a) return null
        const sample = samplesMap.get(a.sample_id)
        return {
          testAllocationId: t.id,
          sampleAllocationId: a.id,
          sampleId: a.sample_id,
          sectionCode: a.section_code,
          isCodeId: sample?.isCodeId ?? null,
          isCodeLabel: sample?.isCodeLabel ?? null,
          srfNumber: sample?.srf_number ?? null,
          allocationDate: a.allocation_date ?? sample?.date_of_sample_receiving ?? null,
          department: a.department ?? null,
          designation: a.designation ?? null,
          testParameterSummary: t.test_parameter_summary ?? null,
          testParameterIds: paramIdsByAllocation.get(t.id) ?? (Array.isArray(t.test_parameter_ids) ? t.test_parameter_ids : []),
          assignedEmployeeId: t.assigned_employee_id ?? null,
          assignedEmployeeName: t.assigned_employee_name ?? null,
          referbackFromAllocation: sample?.referbackFromAllocation ?? false,
          sentForTesting: !!t.sent_for_testing,
          testStartDate: (t as { test_start_date?: string | null }).test_start_date ?? null,
          results: (t as { results?: string | null }).results ?? null,
          testEndDate: (t as { test_end_date?: string | null }).test_end_date ?? null,
        }
      })
        .filter((r): r is TestAllocationRow => r != null)
        // Sections sent to Sample Under Testing are hidden; refer-back sets sent_for_testing false.
        .filter((r) => !r.sentForTesting)
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load test allocations')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [session])

  useEffect(() => {
    if (!formOpen) return
    void loadUsers()
  }, [formOpen])

  const loadAvailableSections = async () => {
    setAvailableSectionsLoading(true)
    try {
      const { data: taData } = await supabase.from('test_allocations').select('sample_allocation_id')
      const withTest = new Set(
        (Array.isArray(taData) ? taData : []).map((t: { sample_allocation_id: string }) => t.sample_allocation_id),
      )
      const { data: allocData, error } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation')
        .order('allocation_date', { ascending: false })
      if (error || !Array.isArray(allocData)) {
        setAvailableSections([])
        return
      }
      const withoutTest = allocData.filter((a: { id: string }) => !withTest.has(a.id))
      if (withoutTest.length === 0) {
        setAvailableSections([])
        return
      }
      const sampleIds = [...new Set(withoutTest.map((a: { sample_id: string }) => a.sample_id))]
      const { data: sampleData } = await supabase
        .from('samples')
        .select('id, srf_number, date_of_sample_receiving, test_report_is_code_id')
        .in('id', sampleIds)
      const isCodeIds = [...new Set(
        (Array.isArray(sampleData) ? sampleData : [])
          .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
          .filter(Boolean),
      )] as string[]
      let isCodeMap = new Map<string, string>()
      if (isCodeIds.length > 0) {
        const { data: isCodeData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isCodeIds)
        const isCodes = Array.isArray(isCodeData) ? isCodeData : []
        isCodeMap = new Map(
          isCodes.map((c: { id: string; is_number?: string; revision_year?: string | null }) => [
            c.id,
            c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
          ]),
        )
      }
      const samplesMap = new Map(
        (Array.isArray(sampleData) ? sampleData : []).map((s: { id: string; srf_number?: string; date_of_sample_receiving?: string; test_report_is_code_id?: string | null }) => [
          s.id,
          {
            srf_number: s.srf_number ?? null,
            date_of_sample_receiving: s.date_of_sample_receiving ?? null,
            isCodeId: s.test_report_is_code_id ?? null,
            isCodeLabel: s.test_report_is_code_id ? (isCodeMap.get(s.test_report_is_code_id) ?? null) : null,
          },
        ]),
      )
      const list: TestAllocationRow[] = withoutTest.map((a: {
        id: string
        sample_id: string
        section_code: string
        allocation_date: string | null
        department: string | null
        designation: string | null
      }) => {
        const sample = samplesMap.get(a.sample_id)
        return {
          sampleAllocationId: a.id,
          sampleId: a.sample_id,
          sectionCode: a.section_code,
          isCodeId: sample?.isCodeId ?? null,
          isCodeLabel: sample?.isCodeLabel ?? null,
          srfNumber: sample?.srf_number ?? null,
          allocationDate: a.allocation_date ?? sample?.date_of_sample_receiving ?? null,
          department: a.department ?? null,
          designation: a.designation ?? null,
          testParameterSummary: null,
          testParameterIds: [],
          assignedEmployeeId: null,
          assignedEmployeeName: null,
        }
      })
      setAvailableSections(list)
    } finally {
      setAvailableSectionsLoading(false)
    }
  }

  useEffect(() => {
    void loadTestParams()
    void loadRows()
  }, [])

  const departmentScopedRows = useMemo(() => {
    const dept = departmentName.trim()
    if (!dept || isLaboratoryDirector(designation)) return rows
    const deptNorm = normUserField(dept)
    return rows.filter((r) => normUserField(r.department) === deptNorm)
  }, [rows, departmentName, designation])

  const filteredRows = useMemo(() => {
    let list = departmentScopedRows
    if (employeeFilterId) {
      list = list.filter((r) => r.assignedEmployeeId === employeeFilterId)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          [r.sectionCode, r.srfNumber, r.department, r.designation, r.testParameterSummary, r.assignedEmployeeName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
    }
    return list
  }, [departmentScopedRows, search, employeeFilterId])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const designationOptionsForForm = useMemo(() => {
    const dept = (formRow?.department ?? '').trim()
    if (!dept) return []
    const deptNorm = normUserField(dept)
    try {
      const raw =
        typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.designationByDepartment') : null
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>
        if (parsed && typeof parsed === 'object') {
          const key = Object.keys(parsed).find((k) => normUserField(k) === deptNorm)
          if (key && Array.isArray(parsed[key])) {
            return [...parsed[key]].sort((a, b) => a.localeCompare(b))
          }
        }
      }
    } catch {
      /* ignore */
    }
    const set = new Set(
      users
        .filter((u) => normUserField(u.departmentName) === deptNorm)
        .map((u) => u.designation)
        .filter(Boolean),
    )
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [formRow?.department, users])

  const employeesFilteredForRow = useMemo(() => {
    const dept = normUserField(formRow?.department ?? '')
    const des = normUserField(form?.designation ?? '')
    if (!dept || !des) return []
    return users
      .filter((u) => normUserField(u.departmentName) === dept && normUserField(u.designation) === des)
      .map((u) => ({
        id: u.id,
        name: u.name,
        department: u.departmentName,
        designation: u.designation,
      }))
  }, [users, formRow?.department, form?.designation])

  const departmentFilteredAvailableSections = useMemo(() => {
    const dept = departmentName.trim()
    if (!dept || isLaboratoryDirector(designation)) return availableSections
    const deptNorm = normUserField(dept)
    return availableSections.filter((r) => normUserField(r.department) === deptNorm)
  }, [availableSections, departmentName, designation])

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = (checked: boolean) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      pagedRows.forEach((r) => (checked ? n.add(r.sampleAllocationId) : n.delete(r.sampleAllocationId)))
      return n
    })

  const loadSectionSpecOverrides = async (testAllocationId: string): Promise<Record<string, string>> => {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select('test_parameter_id, specific_requirement')
      .eq('test_allocation_id', testAllocationId)
    if (error) throw error
    const out: Record<string, string> = {}
    for (const row of Array.isArray(data) ? data : []) {
      const tpId = (row as { test_parameter_id?: string | null }).test_parameter_id
      const spec = String((row as { specific_requirement?: string | null }).specific_requirement ?? '').trim()
      if (tpId && spec) out[tpId] = spec
    }
    return out
  }

  const handleAddTestParameter = (row: TestAllocationRow) => {
    setFormRow(row)
    void loadUsers()
    const deptNorm = normUserField(row.department ?? '')
    const rowDes = (row.designation ?? '').trim()
    const matchedDes =
      rowDes &&
      users.find(
        (u) =>
          normUserField(u.departmentName) === deptNorm &&
          normUserField(u.designation) === normUserField(rowDes),
      )?.designation
    void (async () => {
      const sectionSpecOverrides = row.testAllocationId
        ? await loadSectionSpecOverrides(row.testAllocationId)
        : {}
      setForm({
        sampleAllocationId: row.sampleAllocationId,
        sectionCode: row.sectionCode,
        department: row.department,
        designation: matchedDes ?? rowDes ?? null,
        testParameterIds: row.testParameterIds ?? [],
        testParameterSummary: row.testParameterSummary ?? '',
        assignedEmployeeId: row.assignedEmployeeId ?? '',
        assignedEmployeeName: row.assignedEmployeeName ?? '',
        sectionSpecOverrides,
      })
      setFormOpen(true)
    })()
  }

  const handleOpenAddDialog = () => {
    setFormRow(null)
    setForm(null)
    setFormOpen(true)
    void loadAvailableSections()
  }

  const handleSelectSectionForAdd = (row: TestAllocationRow) => {
    handleAddTestParameter(row)
  }

  const handleSaveForm = () => {
    if (!form || !formRow) return
    void (async () => {
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        if (!form.sampleAllocationId) {
          setSaveMessage('Select a section before saving.')
          return
        }
        if (!formRow.sampleId) {
          setSaveMessage('Sample is missing for this section.')
          return
        }

        const payload = {
          sample_allocation_id: form.sampleAllocationId,
          sample_id: formRow.sampleId,
          section_code: formRow.sectionCode ?? form.sectionCode,
          is_code_id: formRow.isCodeId ?? null,
          is_code_label: formRow.isCodeLabel ?? null,
          srf_number: formRow.srfNumber ?? null,
          allocation_date: formRow.allocationDate ?? null,
          department: form.department ?? formRow.department ?? null,
          designation: form.designation ?? formRow.designation ?? null,
          assigned_employee_id: form.assignedEmployeeId || null,
          assigned_employee_name: form.assignedEmployeeName?.trim() || null,
          test_parameter_summary: form.testParameterSummary?.trim() || null,
          test_parameter_ids: form.testParameterIds ?? [],
        }

        let allocationId = formRow.testAllocationId ?? null

        if (allocationId) {
          const { error } = await supabase.from('test_allocations').update(payload).eq('id', allocationId)
          if (error) throw error
        } else {
          const { data: existing } = await supabase
            .from('test_allocations')
            .select('id')
            .eq('sample_allocation_id', form.sampleAllocationId)
            .maybeSingle()
          if (existing?.id) {
            allocationId = String(existing.id)
            const { error } = await supabase.from('test_allocations').update(payload).eq('id', allocationId)
            if (error) throw error
          } else {
            const { data: inserted, error } = await supabase
              .from('test_allocations')
              .insert(payload)
              .select('id')
              .single()
            if (error) throw error
            allocationId = (inserted as { id: string } | null)?.id ?? null
          }
        }

        if (!allocationId) {
          setSaveMessage('Could not save test allocation.')
          return
        }

        const { data: existingParamRows } = await supabase
          .from('test_allocation_parameters')
          .select(
            'test_parameter_id, test_label, test_start_date, test_end_date, results, specific_requirement, results_reviewer_id, results_reviewer_name, report_remark',
          )
          .eq('test_allocation_id', allocationId)
        const existingByTpId = new Map(
          (Array.isArray(existingParamRows) ? existingParamRows : []).map((r) => [
            String((r as { test_parameter_id?: string | null }).test_parameter_id ?? ''),
            r as Record<string, unknown>,
          ]),
        )

        await supabase.from('test_allocation_parameters').delete().eq('test_allocation_id', allocationId)
        const ids = form.testParameterIds ?? []
        if (ids.length > 0) {
          const labelById = new Map(testParamOptions.map((o) => [o.id, o.label ?? o.id]))
          const rowsToInsert = ids.map((id) => {
            const prev = existingByTpId.get(id)
            const sectionOverride = form.sectionSpecOverrides[id]?.trim()
            return {
              test_allocation_id: allocationId,
              test_parameter_id: id,
              test_label: labelById.get(id) ?? id,
              specific_requirement:
                sectionOverride ||
                (typeof prev?.specific_requirement === 'string' ? prev.specific_requirement : null) ||
                null,
              test_start_date: (prev?.test_start_date as string | null | undefined) ?? null,
              test_end_date: (prev?.test_end_date as string | null | undefined) ?? null,
              results: (prev?.results as string | null | undefined) ?? null,
              results_reviewer_id: (prev?.results_reviewer_id as string | null | undefined) ?? null,
              results_reviewer_name: (prev?.results_reviewer_name as string | null | undefined) ?? null,
              report_remark: (prev?.report_remark as string | null | undefined) ?? null,
            }
          })
          const { error: paramErr } = await supabase.from('test_allocation_parameters').insert(rowsToInsert)
          if (paramErr) throw paramErr
        }

        const { data: sampleAllocForStage } = await supabase
          .from('sample_allocations')
          .select('sample_id')
          .eq('id', form.sampleAllocationId)
          .maybeSingle()
        const sampleIdForStage = (sampleAllocForStage as { sample_id?: string } | null)?.sample_id
        if (sampleIdForStage) {
          const { data: stRow } = await supabase.from('samples').select('stage').eq('id', sampleIdForStage).maybeSingle()
          const st = (stRow as { stage?: string | null } | null)?.stage
          if (!st || st === 'receiving' || st === 'allocation' || st === 'test_allocation') {
            const { error: stageErr } = await supabase
              .from('samples')
              .update({ stage: 'test_allocation' })
              .eq('id', sampleIdForStage)
            if (stageErr) throw stageErr
          }
        }

        setSaveMessage('Test allocation saved.')
        setFormOpen(false)
        setFormRow(null)
        setForm(null)
        await loadRows()
      } catch (err) {
        setSaveMessage(
          err && typeof err === 'object' && 'message' in err
            ? formatSupabaseError(err as { message?: string; details?: string; hint?: string; code?: string })
            : err instanceof Error
              ? err.message
              : 'Save failed',
        )
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSendForTesting = async (row: TestAllocationRow) => {
    try {
      const testAllocationId = row.testAllocationId?.trim()
      if (!testAllocationId) {
        setSaveMessage('Save test parameters for this section before sending for testing.')
        return
      }
      const summary = (row.testParameterSummary ?? '').trim()
      if (!summary) {
        setSaveMessage('Assign at least one test parameter before Send for Testing.')
        return
      }
      if (!row.assignedEmployeeId?.trim() && !row.assignedEmployeeName?.trim()) {
        setSaveMessage('Select an employee before Send for Testing.')
        return
      }

      const { error } = await supabase
        .from('test_allocations')
        .update({ sent_for_testing: true })
        .eq('id', testAllocationId)
      if (error) {
        setSaveMessage(formatSupabaseError(error))
        return
      }

      const sampleId = row.sampleId?.trim()
      if (sampleId) {
        await supabase.from('samples').update({ stage: 'under_testing' }).eq('id', sampleId)
      }

      setSaveMessage(`Section ${row.sectionCode} sent for testing.`)
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Send for testing failed')
    }
  }

  const handleReferbackToReceiving = async (row: TestAllocationRow) => {
    const sampleId = row.sampleId?.trim()
    const section = row.sectionCode?.trim() || 'this section'
    if (!sampleId || !row.sampleAllocationId?.trim()) {
      setSaveMessage('Missing section data for refer back.')
      return
    }
    if (
      !window.confirm(
        `Refer back section ${section} to Sample Receiving?\n\nTest parameters and this section code will be removed from allocation. If this is the last section on the SRF, the record will unlock in Sample Receiving for editing.`,
      )
    ) {
      return
    }
    try {
      const result = await referbackSectionToSampleReceiving(row.sampleAllocationId, sampleId)
      if (result === 'receiving') {
        setSaveMessage(
          `Section ${section} removed. SRF referred back to Sample Receiving — edit unlocked there.`,
        )
      } else {
        setSaveMessage(
          `Section ${section} removed from allocation. Other sections for this SRF remain in Sample Allocation.`,
        )
      }
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Refer back to Sample Receiving failed')
    }
  }

  const handleReferback = async (row: TestAllocationRow) => {
    try {
      const sampleId = row.sampleId?.trim()
      if (!sampleId) {
        setSaveMessage('Missing sample id.')
        return
      }
      const section = row.sectionCode?.trim() || 'this section'
      if (
        !window.confirm(
          `Refer back section ${section} to Sample Allocation?\n\nTest parameters for this section will be removed; the section code stays in Sample Allocation for re-assignment.`,
        )
      ) {
        return
      }
      await deleteTestAllocationsForSampleAllocations([row.sampleAllocationId])

      const { data: sampleAllocRows } = await supabase
        .from('sample_allocations')
        .select('id')
        .eq('sample_id', sampleId)
      const allocIds = (Array.isArray(sampleAllocRows) ? sampleAllocRows : [])
        .map((r) => String((r as { id?: unknown }).id ?? '').trim())
        .filter(Boolean)

      let remainingCount = 0
      if (allocIds.length > 0) {
        const { data: remainingTa } = await supabase
          .from('test_allocations')
          .select('id')
          .in('sample_allocation_id', allocIds)
        remainingCount = Array.isArray(remainingTa) ? remainingTa.length : 0
      }

      if (remainingCount === 0) {
        const { error } = await supabase
          .from('samples')
          .update({ referback_from_allocation: true })
          .eq('id', sampleId)
        if (error) {
          setSaveMessage(formatSupabaseError(error))
          return
        }
        setSaveMessage('Referred back to Sample Allocation. Edit unlocked there for this SRF.')
      } else {
        setSaveMessage('Section referred back. Other sections for this SRF remain in Test Allocation.')
      }
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Referback failed')
    }
  }

  const handleDeleteSelected = () => {
    const allocIds = Array.from(selectedIds)
    if (!confirmDestructiveDelete(allocIds.length, 'test allocation section')) return
    void (async () => {
      setListLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteTestAllocationsForSections(allocIds)
        setSelectedIds(new Set())
        setSaveMessage(`Deleted ${count} test allocation section(s).`)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setListLoading(false)
      }
    })()
  }

  return (
    <div className="p-6 space-y-5">
      <TestAllocationHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(s) => {
          setPageSize(s)
          setPage(1)
        }}
        onAddTestParameter={handleOpenAddDialog}
        employeeOptions={users.map((u) => ({ id: u.id, name: u.name }))}
        selectedEmployeeId={employeeFilterId || 'all'}
        onEmployeeFilterChange={setEmployeeFilterId}
      />

      <TestAllocationTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onAddTestParameter={handleAddTestParameter}
        onReferback={handleReferback}
        onReferbackToReceiving={handleReferbackToReceiving}
        onSendForTesting={handleSendForTesting}
        onAssistantDataChanged={() => {
          void loadRows()
          void loadTestParams()
        }}
      />

      <TestAllocationFooterBar
        page={page}
        pageCount={pageCount}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJump={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n > 0) setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          setJumpTo('')
        }}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
        selectedCount={selectedIds.size}
        saveMessage={saveMessage}
        loading={listLoading}
        showDelete={showDelete}
        onDeleteSelected={handleDeleteSelected}
      />

      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setFormRow(null)
          setForm(null)
          setSaveMessage(null)
        }
        setFormOpen(open)
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formRow ? 'Edit Test Parameter' : 'Add Test Parameter'}</DialogTitle>
          </DialogHeader>
          {saveMessage && (
            <p className={`text-sm ${saveMessage === 'Test allocation saved.' ? 'text-green-600' : 'text-destructive'}`}>
              {saveMessage}
            </p>
          )}
          {!formRow ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a section to add test parameters and assign an employee.</p>
              {availableSectionsLoading ? (
                <p className="text-sm">Loading sections…</p>
              ) : departmentFilteredAvailableSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {availableSections.length > 0 && departmentName.trim()
                    ? `No sections for your department (${departmentName.trim()}). Only section codes allocated to your department in Sample Allocation are shown here.`
                    : 'No section available. All sections from Sample Allocation already have test allocation, or there are no sections yet.'}
                </p>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Section</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      const row = departmentFilteredAvailableSections.find((r) => r.sampleAllocationId === id)
                      if (row) handleSelectSectionForAdd(row)
                    }}
                    value=""
                  >
                    <option value="">Choose section…</option>
                    {departmentFilteredAvailableSections.map((r) => (
                      <option key={r.sampleAllocationId} value={r.sampleAllocationId}>
                        {r.sectionCode} — {r.srfNumber ?? '-'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : form && (
            <TestAllocationForm
              row={formRow}
              form={form}
              onChange={setForm}
              onSave={handleSaveForm}
              saveLoading={saveLoading}
              onClose={() => {
                setFormOpen(false)
                setFormRow(null)
                setForm(null)
              }}
              testParamOptions={testParamOptions}
              employeesFiltered={employeesFilteredForRow}
              designationOptions={designationOptionsForForm}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
