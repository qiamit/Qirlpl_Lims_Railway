import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import type { SampleRow } from '../types'
import type { AllocationRow } from '../types'
import { SampleAllocationHeaderBar } from './SampleAllocationHeaderBar'
import { SampleAllocationTable } from './SampleAllocationTable'
import { SampleAllocationFooterBar } from './SampleAllocationFooterBar'
import { SampleAllocationForm, type SampleAllocationFormState } from './SampleAllocationForm'
import type { AllocationSection } from './SampleAllocationForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type AllocationRecord = {
  id: string
  sample: SampleRow
  sectionCode: string
  department: string | null
  designation: string | null
  sampleQuantity: string | null
  testParameterSummary: string | null
}


const today = () => new Date().toISOString().slice(0, 10)

const readListFromStorage = (key: string): string[] => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : []
  } catch {
    return []
  }
}

const readDesignationByDepartmentFromStorage = (): Record<string, string[]> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem('userManagement.designationByDepartment')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string[]>
    return {}
  } catch {
    return {}
  }
}

export default function SampleAllocationMasterPage() {
  const { session } = useAuth()
  const [allocationRecords, setAllocationRecords] = useState<AllocationRecord[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formIsEditMode, setFormIsEditMode] = useState(false)
  const [form, setForm] = useState<SampleAllocationFormState>({
    sampleId: '',
    srfNumber: '',
    allocationDate: today(),
    isCodeLabel: '',
    sections: [],
  })
  const [samples, setSamples] = useState<SampleRow[]>([])
  const [departments, setDepartments] = useState<string[]>(() => readListFromStorage('userManagement.departments'))
  const [designations, setDesignations] = useState<string[]>(() => {
    const fromDesignations = readListFromStorage('userManagement.designations')
    if (fromDesignations.length > 0) return fromDesignations
    return readListFromStorage('userManagement.departments')
  })
  const [isCodeOptions, setIsCodeOptions] = useState<Array<{ id: string; label: string }>>([])
  const [designationsByDepartment, setDesignationsByDepartment] = useState<Record<string, string[]>>(readDesignationByDepartmentFromStorage)

  const mapRow = (r: any): SampleRow => ({
    id: r.id,
    srf_number: r.srf_number ?? null,
    date_of_sample_receiving: r.date_of_sample_receiving ?? null,
    sample_code: r.sample_code ?? null,
    sample_qr_code: null,
    client_id: null,
    client_name: null,
    client_reference: null,
    test_report_is_code_id: r.test_report_is_code_id ?? null,
    test_report_is_code_label: null,
    description: null,
    sample_description: null,
    matrix: null,
    received_at: null,
    received_by: null,
    sample_quantity: r.sample_quantity ?? null,
    shelf_life: null,
    test_required: null,
    batch_number: null,
    date_of_manufacturing: null,
    bis_seal: null,
    io_signature: null,
    sample_declaration: null,
    any_other_information: null,
    mode_of_disposal: null,
    nature_of_sample: null,
    statement_conformity_required: null,
    witness_test_required: null,
    competent_person_available: null,
    equipment_available: null,
    can_complete_within_time: null,
    deviation_from_methods: null,
    supporting_docs_required: null,
    decision_rule_applied: null,
    testing_method_available: null,
    sampling_procedure_ref: null,
    tentative_date_required: null,
    tentative_date_by_lab: null,
    sample_receiving_status: null,
    client_references_path: null,
    collection_date: null,
    collection_location: null,
    storage_conditions: null,
    storage_location: null,
    status: null,
    stage: null,
    quantity: null,
    quantity_unit: null,
    condition_on_receipt: null,
    condition_notes: null,
    test_request_ids: [],
    referback_from_allocation: r.referback_from_allocation === true,
    created_at: undefined,
    updated_at: undefined,
  })

  const loadSamples = async (): Promise<SampleRow[]> => {
    const { data, error } = await supabase
      .from('samples')
      .select('id, srf_number, date_of_sample_receiving, sample_code, sample_quantity, test_report_is_code_id, referback_from_allocation')
      .order('created_at', { ascending: false })
    if (error || !Array.isArray(data)) return []
    return (data as any[]).map(mapRow)
  }

  const loadIsCodes = async (): Promise<Array<{ id: string; label: string }>> => {
    try {
      const { data, error } = await supabase
        .from('is_codes')
        .select('id, is_number, revision_year')
        .order('is_number', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; is_number: string; revision_year: string | null }>)
        : []
      return list.map((r) => ({
        id: r.id,
        label: r.revision_year ? `${r.is_number ?? ''} : ${r.revision_year}` : (r.is_number ?? r.id),
      }))
    } catch {
      return []
    }
  }

  const [sampleAllocationIdsWithTestAllocation, setSampleAllocationIdsWithTestAllocation] = useState<Set<string>>(() => new Set())

  const loadAllocations = async (samplesList: SampleRow[]) => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation, sample_quantity')
        .order('allocation_date', { ascending: false })
      if (error) throw error
      const list: AllocationRecord[] = (Array.isArray(data) ? data : []).map((r: any) => {
        const sample = samplesList.find((s) => s.id === r.sample_id)
        return {
          id: r.id as string,
          sample: sample ?? { ...mapRow({ id: r.sample_id }), id: r.sample_id },
          sectionCode: r.section_code as string,
          department: (r.department as string) ?? null,
          designation: (r.designation as string) ?? null,
          sampleQuantity: (r.sample_quantity as string) ?? null,
          testParameterSummary: null,
        }
      })
      setAllocationRecords(list)
      const allocIds = list.map((r) => r.id)
      if (allocIds.length > 0) {
        const { data: taData } = await supabase
          .from('test_allocations')
          .select('sample_allocation_id')
          .in('sample_allocation_id', allocIds)
        const withTest = new Set(
          (Array.isArray(taData) ? taData : []).map((t: { sample_allocation_id: string }) => t.sample_allocation_id),
        )
        setSampleAllocationIdsWithTestAllocation(withTest)
      } else {
        setSampleAllocationIdsWithTestAllocation(new Set())
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load sample allocations')
    } finally {
      setListLoading(false)
    }
  }

  const loadUserManagementOptions = async () => {
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
    const rows = typeof payload === 'object' && payload && 'users' in payload
      ? ((payload as { users?: unknown }).users as unknown)
      : []
    const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
    const mapped = list
      .map((row) => ({
        designation: String(row.designation ?? '').trim(),
        departmentName: String((row as { department_name?: unknown }).department_name ?? '').trim(),
      }))
      .filter((u) => u.designation || u.departmentName)
    const uniqueDesignations = Array.from(
      new Set(mapped.map((u) => u.designation).filter((d) => d.length > 0)),
    ).sort((a, b) => a.localeCompare(b))
    const uniqueDepartments = Array.from(
      new Set(mapped.map((u) => u.departmentName).filter((d) => d.length > 0)),
    ).sort((a, b) => a.localeCompare(b))
    const designationByDepartment: Record<string, string[]> = {}
    for (const u of mapped) {
      if (u.departmentName && u.designation) {
        if (!designationByDepartment[u.departmentName]) designationByDepartment[u.departmentName] = []
        if (!designationByDepartment[u.departmentName].includes(u.designation)) {
          designationByDepartment[u.departmentName].push(u.designation)
        }
      }
    }
    for (const k of Object.keys(designationByDepartment)) {
      designationByDepartment[k].sort((a, b) => a.localeCompare(b))
    }
    if (uniqueDesignations.length > 0) {
      setDesignations(uniqueDesignations)
      try {
        window.localStorage.setItem('userManagement.designations', JSON.stringify(uniqueDesignations))
      } catch {
        /* ignore */
      }
    }
    if (uniqueDepartments.length > 0) {
      setDepartments((prev) => {
        const merged = Array.from(new Set([...prev, ...uniqueDepartments])).sort((a, b) => a.localeCompare(b))
        try {
          window.localStorage.setItem('userManagement.departments', JSON.stringify(merged))
        } catch {
          /* ignore */
        }
        return merged
      })
    }
    if (Object.keys(designationByDepartment).length > 0) {
      setDesignationsByDepartment(designationByDepartment)
      try {
        window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    void loadUserManagementOptions()
  }, [session])

  useEffect(() => {
    void (async () => {
      const rawSamples = await loadSamples()
      const codes = await loadIsCodes()
      setIsCodeOptions(codes)
      const enriched: SampleRow[] = rawSamples.map((s) => ({
        ...s,
        test_report_is_code_label:
          codes.find((c) => c.id === s.test_report_is_code_id)?.label ?? null,
      }))
      setSamples(enriched)
      await loadAllocations(enriched)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!formOpen) return
    void loadUserManagementOptions()
  }, [formOpen])

  const rows = useMemo(() => {
    const bySample = new Map<string, AllocationRecord[]>()
    for (const rec of allocationRecords) {
      const sid = rec.sample.id
      if (!bySample.has(sid)) bySample.set(sid, [])
      bySample.get(sid)!.push(rec)
    }
    const result: AllocationRow[] = []
    bySample.forEach((recs, sampleId) => {
      const sample = recs[0]!.sample
      result.push({
        sampleId,
        sample,
        sectionCodes: recs.map((r) => r.sectionCode).filter(Boolean),
        departments: Array.from(new Set(recs.map((r) => r.department).filter(Boolean) as string[])),
        quantities: recs.map((r) => r.sampleQuantity ?? r.sample.sample_quantity ?? '').filter(Boolean),
        allocationIds: recs.map((r) => r.id),
      })
    })
    result.sort((a, b) => {
      const da = a.sample.date_of_sample_receiving ?? a.sample.collection_date ?? ''
      const db = b.sample.date_of_sample_receiving ?? b.sample.collection_date ?? ''
      return db.localeCompare(da)
    })
    return result
  }, [allocationRecords])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.sample.srf_number,
        r.sample.sample_code,
        r.sectionCodes.join(' '),
        r.departments.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const allocatedSampleIds = useMemo(
    () => new Set(allocationRecords.map((r) => r.sample.id)),
    [allocationRecords],
  )

  const sampleIdsWithTestAllocation = useMemo(() => {
    const set = new Set<string>()
    for (const rec of allocationRecords) {
      if (sampleAllocationIdsWithTestAllocation.has(rec.id)) set.add(rec.sample.id)
    }
    return set
  }, [allocationRecords, sampleAllocationIdsWithTestAllocation])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.sampleId)),
    [rows, selectedIds],
  )

  const toggleRow = (sampleId: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(sampleId)) n.delete(sampleId)
      else n.add(sampleId)
      return n
    })

  const toggleAll = (checked: boolean) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      pagedRows.forEach((r) => (checked ? n.add(r.sampleId) : n.delete(r.sampleId)))
      return n
    })

  const refreshAll = async () => {
    const rawSamples = await loadSamples()
    const codes = isCodeOptions.length > 0 ? isCodeOptions : await loadIsCodes()
    if (codes.length > 0 && isCodeOptions.length === 0) setIsCodeOptions(codes)
    const enriched: SampleRow[] = rawSamples.map((s) => ({
      ...s,
      test_report_is_code_label:
        codes.find((c) => c.id === s.test_report_is_code_id)?.label ?? null,
    }))
    setSamples(enriched)
    await loadAllocations(enriched)
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    void (async () => {
      try {
        const sampleIds = Array.from(selectedIds)
        const { error } = await supabase.from('sample_allocations').delete().in('sample_id', sampleIds)
        if (error) throw error
        setSelectedIds(new Set())
        setSaveMessage(`Deleted allocation(s) for ${sampleIds.length} SRF(s).`)
        await refreshAll()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete')
      }
    })()
  }

  const handleNew = () => {
    setFormIsEditMode(false)
    setForm({
      sampleId: '',
      srfNumber: '',
      allocationDate: today(),
      isCodeLabel: '',
      sections: [],
    })
    setFormOpen(true)
  }

  const handleSaveForm = () => {
    void (async () => {
      try {
        if (!form.sampleId || form.sections.length === 0) return
        const allocationDate = form.allocationDate || today()
        const { error: delErr } = await supabase
          .from('sample_allocations')
          .delete()
          .eq('sample_id', form.sampleId)
        if (delErr) throw delErr
        for (const sec of form.sections) {
          const code = sec.sectionCode.trim()
          if (!code) continue
          const { error: insErr } = await supabase.from('sample_allocations').insert({
            sample_id: form.sampleId,
            section_code: code,
            allocation_date: allocationDate,
            department: sec.department?.trim() || null,
            designation: sec.designation?.trim() || null,
            sample_quantity: sec.sampleQuantity?.trim() || null,
          })
          if (insErr) throw insErr
        }
        const { data: stageRow } = await supabase.from('samples').select('stage').eq('id', form.sampleId).maybeSingle()
        const curStage = (stageRow as { stage?: string | null } | null)?.stage
        if (!curStage || curStage === 'receiving' || curStage === 'allocation') {
          await supabase
            .from('samples')
            .update({ stage: 'allocation' })
            .eq('id', form.sampleId)
        }
        setSaveMessage('Allocation saved.')
        setFormOpen(false)
        await refreshAll()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save allocation')
      }
    })()
  }

  const handleEdit = async (row: AllocationRow) => {
    const { data, error } = await supabase
      .from('sample_allocations')
      .select('id, section_code, allocation_date, department, designation, sample_quantity')
      .eq('sample_id', row.sampleId)
      .order('section_code')
    if (error) {
      setSaveMessage(error.message)
      return
    }
    const sections: AllocationSection[] = (Array.isArray(data) ? data : []).map((r: any) => ({
      id: r.id,
      sectionCode: (r.section_code as string) ?? '',
      department: (r.department as string) ?? '',
      designation: (r.designation as string) ?? '',
      sampleQuantity: (r.sample_quantity as string) ?? '',
    }))
    const allocationDate =
      (Array.isArray(data) && data[0]?.allocation_date)
        ? String(data[0].allocation_date).slice(0, 10)
        : today()
    setFormIsEditMode(true)
    setForm({
      sampleId: row.sample.id,
      srfNumber: row.sample.srf_number ?? '',
      allocationDate,
      isCodeLabel:
        isCodeOptions.find((o) => o.id === row.sample.test_report_is_code_id)?.label ?? '',
      sections: sections.length ? sections : [emptySection()],
    })
    setFormOpen(true)
  }

  const emptySection = (): AllocationSection => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return { sectionCode: code, department: '', designation: '', sampleQuantity: '' }
  }

  const handleReferback = async (row: AllocationRow) => {
    try {
      const sid = typeof row.sampleId === 'string' ? row.sampleId.trim() : ''
      if (!sid) {
        setSaveMessage('Missing sample id.')
        return
      }
      const { error } = await supabase.from('samples').update({ referback_from_allocation: true }).eq('id', sid)
      if (error) {
        setSaveMessage(
          `${formatSupabaseError(error)} Apply web/supabase/migrations (20260328120000, 20260329130000) in Supabase SQL.`,
        )
        return
      }
      setSaveMessage('Referred back. Edit is now allowed for this SRF in Sample Receiving.')
      await refreshAll()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Referback failed')
    }
  }

  return (
    <div className="p-6 space-y-5">
      <SampleAllocationHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(s) => {
          setPageSize(s)
          setPage(1)
        }}
        onNew={handleNew}
      />

      <SampleAllocationTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onEdit={handleEdit}
        onReferback={handleReferback}
        sampleIdsWithTestAllocation={sampleIdsWithTestAllocation}
      />

      <SampleAllocationFooterBar
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
        onDeleteSelected={handleDeleteSelected}
        deleteDisabled={selectedRows.some((r) => sampleIdsWithTestAllocation.has(r.sampleId))}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sample Allocation</DialogTitle>
          </DialogHeader>
          <SampleAllocationForm
            form={form}
            onChange={setForm}
            onSave={handleSaveForm}
            onClose={() => setFormOpen(false)}
            samples={samples}
            departments={departments}
            designations={designations}
            designationsByDepartment={designationsByDepartment}
            isCodeOptions={isCodeOptions}
            allocatedSampleIds={allocatedSampleIds}
            lockSrfSection={formIsEditMode}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

