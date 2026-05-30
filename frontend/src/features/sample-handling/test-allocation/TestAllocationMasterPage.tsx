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

type UserFromApi = { id: string; name: string; designation: string; departmentName: string }

export default function TestAllocationMasterPage() {
  const { session } = useAuth()
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [employeeFilterId, setEmployeeFilterId] = useState<string>('')

  const [formOpen, setFormOpen] = useState(false)
  const [formRow, setFormRow] = useState<TestAllocationRow | null>(null)
  const [form, setForm] = useState<TestAllocationFormState | null>(null)
  const [availableSections, setAvailableSections] = useState<TestAllocationRow[]>([])
  const [availableSectionsLoading, setAvailableSectionsLoading] = useState(false)

  const [testParamOptions, setTestParamOptions] = useState<Array<{ id: string; label: string }>>([])
  const [users, setUsers] = useState<UserFromApi[]>([])

  const loadUsers = async () => {
    const { data: { session: latestSession } } = await supabase.auth.getSession()
    const accessToken = latestSession?.access_token ?? session?.access_token
    if (!accessToken) return
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users`
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'x-user-jwt': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const payload = (await response.json().catch(() => null)) as unknown
    if (!response.ok) return
    const list = typeof payload === 'object' && payload && 'users' in payload
      ? ((payload as { users?: unknown }).users as unknown)
      : []
    const arr = Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []
    setUsers(
      arr.map((u) => ({
        id: String(u.id ?? ''),
        name: String(u.full_name ?? u.email ?? ''),
        designation: String((u as { designation?: unknown }).designation ?? '').trim(),
        departmentName: String((u as { department_name?: unknown }).department_name ?? '').trim(),
      })),
    )
  }

  const [designationsByDepartmentFromTestParams, setDesignationsByDepartmentFromTestParams] = useState<Record<string, string[]>>({})

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
    const byDept: Record<string, Set<string>> = {}
    for (const r of rows) {
      const dept = r.department?.trim()
      const des = r.designation?.trim()
      if (dept && des) {
        if (!byDept[dept]) byDept[dept] = new Set()
        byDept[dept].add(des)
      }
    }
    const result: Record<string, string[]> = {}
    for (const [dept, set] of Object.entries(byDept)) {
      result[dept] = Array.from(set).sort((a, b) => a.localeCompare(b))
    }
    setDesignationsByDepartmentFromTestParams(result)
  }

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select('id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_start_date, results, test_end_date')
        .order('created_at', { ascending: false })
      if (taErr) throw taErr
      const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
      if (testAllocs.length === 0) {
        setRows([])
        return
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
          testParameterIds: Array.isArray(t.test_parameter_ids) ? t.test_parameter_ids : [],
          assignedEmployeeId: t.assigned_employee_id ?? null,
          assignedEmployeeName: t.assigned_employee_name ?? null,
          referbackFromAllocation: sample?.referbackFromAllocation ?? false,
          testStartDate: (t as { test_start_date?: string | null }).test_start_date ?? null,
          results: (t as { results?: string | null }).results ?? null,
          testEndDate: (t as { test_end_date?: string | null }).test_end_date ?? null,
        }
      }).filter((r): r is TestAllocationRow => r != null)
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

  const filteredRows = useMemo(() => {
    let list = rows
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
  }, [rows, search, employeeFilterId])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const designationOptionsForForm = useMemo(() => {
    if (!formRow?.department) return []
    return designationsByDepartmentFromTestParams[formRow.department] ?? []
  }, [formRow?.department, designationsByDepartmentFromTestParams])

  const employeesFilteredForRow = useMemo(() => {
    const dept = (formRow?.department ?? '').trim()
    const des = (form?.designation ?? formRow?.designation ?? '').trim()
    const list = users.filter((u) => {
      const uDept = u.departmentName.trim()
      const uDes = u.designation.trim()
      const deptMatch = !dept || uDept.toLowerCase() === dept.toLowerCase()
      const desLower = des.toLowerCase()
      const uDesLower = uDes.toLowerCase()
      const desMatch =
        !des ||
        uDesLower === desLower ||
        uDesLower.includes(desLower) ||
        desLower.includes(uDesLower)
      return deptMatch && desMatch
    })
    return list.map((u) => ({
      id: u.id,
      name: u.name,
      department: u.departmentName,
      designation: u.designation,
    }))
  }, [users, formRow?.department, formRow?.designation, form?.designation])

  const handleToggleReferback = async (row: TestAllocationRow) => {
    try {
      const next = !row.referbackFromAllocation
      const sid = typeof row.sampleId === 'string' ? row.sampleId.trim() : ''
      if (!sid) {
        setSaveMessage('Missing sample id for this row.')
        return
      }
      const { error } = await supabase.from('samples').update({ referback_from_allocation: next }).eq('id', sid)
      if (error) {
        setSaveMessage(
          `${formatSupabaseError(error)} Apply migrations in web/supabase/migrations (referback column + stage enum: 20260328120000, 20260329130000).`,
        )
        return
      }
      setSaveMessage(
        next
          ? 'Referred back. Sample Allocation edit is now unlocked for this SRF.'
          : 'Referback cleared. Sample Allocation edit is locked again for this SRF.',
      )
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Referback update failed')
    }
  }

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

  const handleAddTestParameter = (row: TestAllocationRow) => {
    setFormRow(row)
    void loadUsers()
    setForm({
      sampleAllocationId: row.sampleAllocationId,
      sectionCode: row.sectionCode,
      department: row.department,
      designation: row.designation,
      testParameterIds: row.testParameterIds ?? [],
      testParameterSummary: row.testParameterSummary ?? '',
      assignedEmployeeId: row.assignedEmployeeId ?? '',
      assignedEmployeeName: row.assignedEmployeeName ?? '',
    })
    setFormOpen(true)
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
    if (!form) return
    void (async () => {
      setSaveMessage(null)
      try {
        const payload = {
          sample_allocation_id: form.sampleAllocationId,
          assigned_employee_id: form.assignedEmployeeId || null,
          assigned_employee_name: form.assignedEmployeeName?.trim() || null,
          test_parameter_summary: form.testParameterSummary?.trim() || null,
          updated_at: new Date().toISOString(),
        }
        const { data, error } = await supabase
          .from('test_allocations')
          .upsert(payload, {
            onConflict: 'sample_allocation_id',
          })
          .select('id')
        if (error) throw error
        const allocRow = Array.isArray(data) && data.length > 0 ? (data[0] as { id: string }) : null
        const allocationId = allocRow?.id
        if (allocationId) {
          await supabase.from('test_allocation_parameters').delete().eq('test_allocation_id', allocationId)
          const ids = form.testParameterIds ?? []
          if (ids.length > 0) {
            const labelById = new Map(testParamOptions.map((o) => [o.id, o.label ?? o.id]))
            const rowsToInsert = ids.map((id) => ({
              test_allocation_id: allocationId,
              test_parameter_id: id,
              test_label: labelById.get(id) ?? id,
              test_start_date: null,
              test_end_date: null,
              results: null,
            }))
            const { error: paramErr } = await supabase.from('test_allocation_parameters').insert(rowsToInsert)
            if (paramErr) throw paramErr
          }
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
            await supabase.from('samples').update({ stage: 'test_allocation' }).eq('id', sampleIdForStage)
          }
        }
        setSaveMessage('Test allocation saved.')
        setFormOpen(false)
        setFormRow(null)
        setForm(null)
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Save failed')
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
        onToggleReferback={handleToggleReferback}
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
      />

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormRow(null); setForm(null); } setFormOpen(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formRow ? 'Edit Test Parameter' : 'Add Test Parameter'}</DialogTitle>
          </DialogHeader>
          {!formRow ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a section to add test parameters and assign an employee.</p>
              {availableSectionsLoading ? (
                <p className="text-sm">Loading sections…</p>
              ) : availableSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No section available. All sections from Sample Allocation already have test allocation, or there are no sections yet.</p>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Section</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      const row = availableSections.find((r) => r.sampleAllocationId === id)
                      if (row) handleSelectSectionForAdd(row)
                    }}
                    value=""
                  >
                    <option value="">Choose section…</option>
                    {availableSections.map((r) => (
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
              onClose={() => {
                setFormOpen(false)
                setFormRow(null)
                setForm(null)
              }}
              testParamOptions={testParamOptions}
              employeesFiltered={employeesFilteredForRow}
              designationOptions={designationOptionsForForm}
              onTestParameterUpdated={loadTestParams}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
