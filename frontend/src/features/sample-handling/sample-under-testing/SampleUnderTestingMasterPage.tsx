import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import type { TestAllocationRow } from '../types'
import type { UnderTestingFormState } from './SampleUnderTestingForm'
import { SampleUnderTestingTable } from './SampleUnderTestingTable'
import { SampleUnderTestingForm } from './SampleUnderTestingForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, FileCheck } from 'lucide-react'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

export default function SampleUnderTestingMasterPage() {
  const { user, profileName, designation, profileReady } = useAuth()
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formRow, setFormRow] = useState<TestAllocationRow | null>(null)
  const [formInitial, setFormInitial] = useState<UnderTestingFormState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [testParamViewOpen, setTestParamViewOpen] = useState(false)
  const [testParamViewData, setTestParamViewData] = useState<Record<string, unknown>[]>([])
  const [testParamViewLabel, setTestParamViewLabel] = useState('')

  const [sendForReviewOpen, setSendForReviewOpen] = useState(false)
  const [sendForReviewRow, setSendForReviewRow] = useState<TestAllocationRow | null>(null)
  const [reviewDepartment, setReviewDepartment] = useState('')
  const [reviewDesignation, setReviewDesignation] = useState('')
  const [reviewEmployeeId, setReviewEmployeeId] = useState('')
  const [reviewUsers, setReviewUsers] = useState<ReviewUser[]>([])
  const [reviewUsersLoading, setReviewUsersLoading] = useState(false)
  const [reviewSubmitLoading, setReviewSubmitLoading] = useState(false)
  /** Off by default: list matches Test Allocation (all sections in active testing). Turn on to limit to Test Allocation "Select Employee" = you. */
  const [onlyMyAssignments, setOnlyMyAssignments] = useState(false)

  const loadRows = async () => {
    if (!user?.id) {
      setRows([])
      setListLoading(false)
      return
    }
    setListError(null)
    setListLoading(true)
    try {
      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select(
          'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids',
        )
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
        .select('id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation, stage')
        .in('id', sampleIds)
      if (sampleErr) throw sampleErr
      const isCodeIds = [
        ...new Set(
          (Array.isArray(sampleData) ? sampleData : [])
            .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
            .filter(Boolean),
        ),
      ] as string[]
      let isCodeMap = new Map<string, string>()
      if (isCodeIds.length > 0) {
        const { data: isCodeData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isCodeIds)
        const isCodes = Array.isArray(isCodeData) ? isCodeData : []
        isCodeMap = new Map(
          isCodes.map(
            (c: { id: string; is_number?: string; revision_year?: string | null }) => [
              c.id,
              c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
            ],
          ),
        )
      }
      const samplesMap = new Map(
        (
          Array.isArray(sampleData) ? sampleData : []
        ).map(
          (s: {
            id: string
            srf_number?: string
            date_of_sample_receiving?: string
            test_report_is_code_id?: string | null
            referback_from_allocation?: boolean | null
            stage?: string | null
          }) => [
            s.id,
            {
              srf_number: s.srf_number ?? null,
              date_of_sample_receiving: s.date_of_sample_receiving ?? null,
              isCodeId: s.test_report_is_code_id ?? null,
              isCodeLabel: s.test_report_is_code_id
                ? (isCodeMap.get(s.test_report_is_code_id) ?? null)
                : null,
              referbackFromAllocation: !!s.referback_from_allocation,
              stage: s.stage ?? null,
            },
          ],
        ),
      )
      const allocationIdBySampleAllocId = new Map<string, string>(
        testAllocs.map((t: { id: string; sample_allocation_id: string }) => [t.sample_allocation_id, t.id]),
      )

      const allocationIds = Array.from(new Set(testAllocs.map((t: { id: string }) => t.id)))
      let paramsByAllocationId = new Map<string, {
        id: string
        test_allocation_id: string
        test_parameter_id: string | null
        test_label: string
        test_start_date: string | null
        test_end_date: string | null
        results: string | null
      }[]>()
      if (allocationIds.length > 0) {
        const { data: paramData, error: paramErr } = await supabase
          .from('test_allocation_parameters')
          .select('id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results')
          .in('test_allocation_id', allocationIds)
        if (paramErr) throw paramErr
        const paramRows = Array.isArray(paramData) ? paramData : []
        const map = new Map<string, {
          id: string
          test_allocation_id: string
          test_parameter_id: string | null
          test_label: string
          test_start_date: string | null
          test_end_date: string | null
          results: string | null
        }[]>()
        for (const p of paramRows as any[]) {
          const key = (p.test_allocation_id as string) ?? ''
          if (!key) continue
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push({
            id: p.id as string,
            test_allocation_id: key,
            test_parameter_id: (p.test_parameter_id as string | null) ?? null,
            test_label: (p.test_label as string) ?? '',
            test_start_date: (p.test_start_date as string | null) ?? null,
            test_end_date: (p.test_end_date as string | null) ?? null,
            results: (p.results as string | null) ?? null,
          })
        }
        paramsByAllocationId = map
      }

      const tpIdsForLookup = new Set<string>()
      for (const t of testAllocs as { sample_allocation_id: string; test_parameter_ids?: unknown }) {
        const aid = allocationIdBySampleAllocId.get(t.sample_allocation_id)
        if (!aid) continue
        if ((paramsByAllocationId.get(aid) ?? []).length > 0) continue
        const raw = t.test_parameter_ids
        if (!Array.isArray(raw)) continue
        for (const id of raw) {
          if (typeof id === 'string' && id.trim()) tpIdsForLookup.add(id.trim())
        }
      }
      const testParamNameById = new Map<string, string>()
      if (tpIdsForLookup.size > 0) {
        const { data: tpNameRows } = await supabase
          .from('test_parameters')
          .select('id, item_name')
          .in('id', [...tpIdsForLookup])
        for (const row of Array.isArray(tpNameRows) ? tpNameRows : []) {
          const r = row as { id: string; item_name?: string | null }
          const name = (r.item_name ?? '').trim()
          testParamNameById.set(r.id, name || r.id)
        }
      }

      const list: TestAllocationRow[] = testAllocs
        .map(
          (t: {
            sample_allocation_id: string
            assigned_employee_id?: string | null
            assigned_employee_name?: string | null
            test_parameter_summary?: string | null
            test_parameter_ids?: string[] | null
          }) => {
            const a = allocMap.get(t.sample_allocation_id) as
              | {
                  id: string
                  sample_id: string
                  section_code: string
                  allocation_date: string | null
                  department: string | null
                  designation: string | null
                }
              | undefined
            if (!a) return null
            const sample = samplesMap.get(a.sample_id) as
              | (ReturnType<typeof samplesMap.get> extends Map<string, infer V> ? V : any)
              | undefined
            // Same visibility as Test Allocation: do not hide rows by sample.stage (labs often leave
            // stage ahead of workflow or use results_review while work still appears in Test Allocation).
            const allocationId = allocationIdBySampleAllocId.get(t.sample_allocation_id) as string | undefined
            const fromDb = allocationId ? paramsByAllocationId.get(allocationId) ?? [] : []
            let parameterRows = fromDb.map((p) => ({
              id: p.id,
              testAllocationId: p.test_allocation_id,
              testParameterId: p.test_parameter_id,
              testLabel: p.test_label,
              testStartDate: p.test_start_date,
              testEndDate: p.test_end_date,
              results: p.results,
            }))
            if (parameterRows.length === 0 && allocationId) {
              const summaryStr = (t.test_parameter_summary ?? '').trim()
              const ids = Array.isArray(t.test_parameter_ids)
                ? (t.test_parameter_ids as string[]).map((x) => String(x).trim()).filter(Boolean)
                : []
              let labels = summaryStr
                ? summaryStr.split(',').map((x) => x.trim()).filter(Boolean)
                : []
              if (labels.length === 0 && ids.length > 0) {
                labels = ids.map((id) => testParamNameById.get(id) ?? id)
              } else {
                for (let i = labels.length; i < ids.length; i += 1) {
                  const id = ids[i]!
                  labels.push(testParamNameById.get(id) ?? id)
                }
              }
              if (labels.length > 0) {
                parameterRows = labels.map((label, i) => ({
                  id: '',
                  testAllocationId: allocationId,
                  testParameterId: ids[i] ?? null,
                  testLabel: label,
                  testStartDate: null,
                  testEndDate: null,
                  results: null,
                }))
              }
            }
            return {
              testAllocationId: allocationId,
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
              testStartDate: null,
              results: null,
              testEndDate: null,
              parameters: parameterRows,
            }
          },
        )
        .filter((r): r is TestAllocationRow => r != null)
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load your test allocations')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id) {
      setRows([])
      return
    }
    if (!profileReady) return
    void loadRows()
  }, [user?.id, profileReady])

  const rowsForAssignmentFilter = useMemo(() => {
    if (!onlyMyAssignments || !user?.id) return rows
    return rows.filter((r) => r.assignedEmployeeId === user.id)
  }, [rows, onlyMyAssignments, user?.id])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rowsForAssignmentFilter
    return rowsForAssignmentFilter.filter(
      (r) =>
        [r.sectionCode, r.srfNumber, r.testParameterSummary, r.results]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
  }, [rowsForAssignmentFilter, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const handleEdit = (row: TestAllocationRow) => {
    setFormRow(row)
    const toDate = (v: string | null | undefined) =>
      v ? new Date(v).toISOString().slice(0, 10) : ''
    setFormInitial({
      testStartDate: toDate(row.testStartDate),
      results: row.results ?? '',
      testEndDate: toDate(row.testEndDate),
    })
    setFormOpen(true)
  }

  const handleSaveForm = (state: UnderTestingFormState) => {
    if (!formRow) return
    void (async () => {
      setSaveMessage(null)
      try {
        // Section-level fields are deprecated; per-parameter values are edited directly in the table.
        setSaveMessage('Per-parameter dates & results are edited in the table above.')
        setFormOpen(false)
        setFormRow(null)
        setFormInitial(null)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Save failed')
      }
    })()
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pagedRows.forEach((r) => (checked ? next.add(r.sampleAllocationId) : next.delete(r.sampleAllocationId)))
      return next
    })
  }

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
          `${formatSupabaseError(error)} Apply web/supabase/migrations (20260328120000, 20260329130000) in Supabase SQL if needed.`,
        )
        return
      }
      setSaveMessage(
        next
          ? 'Referred back. You can manage this in Test Allocation.'
          : 'Referback cleared.',
      )
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Referback update failed')
    }
  }

  const updateParameterField = async (
    sampleId: string,
    paramRowId: string | null,
    allocationId: string | undefined,
    field: 'test_start_date' | 'results' | 'test_end_date',
    value: string | null,
    labelForCreate?: string,
    rowCtx?: TestAllocationRow,
  ) => {
    if (!allocationId) return
    const sid = typeof sampleId === 'string' ? sampleId.trim() : ''
    if (!sid) return
    const testParameterIdForInsert =
      rowCtx?.parameters?.find((p) => p.testLabel === labelForCreate)?.testParameterId ?? null

    // Optimistically update local state so inputs stay editable while typing.
    setRows((prev) =>
      prev.map((row) => {
        if (row.testAllocationId !== allocationId) return row
        const currentParams = row.parameters ?? []
        let nextParams = currentParams.map((p) => ({ ...p }))

        if (paramRowId) {
          nextParams = nextParams.map((p) =>
            p.id === paramRowId
              ? {
                  ...p,
                  testStartDate: field === 'test_start_date' ? value : p.testStartDate,
                  testEndDate: field === 'test_end_date' ? value : p.testEndDate,
                  results: field === 'results' ? value : p.results,
                }
              : p,
          )
        } else if (labelForCreate) {
          const matchIdx = nextParams.findIndex((p) => p.testLabel === labelForCreate)
          if (matchIdx >= 0 && !nextParams[matchIdx].id) {
            nextParams = nextParams.map((p, i) =>
              i === matchIdx
                ? {
                    ...p,
                    testStartDate: field === 'test_start_date' ? value : p.testStartDate,
                    testEndDate: field === 'test_end_date' ? value : p.testEndDate,
                    results: field === 'results' ? value : p.results,
                  }
                : p,
            )
          } else {
            const newParamId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
            const base = {
              id: newParamId,
              testAllocationId: allocationId,
              testParameterId: null,
              testLabel: labelForCreate,
              testStartDate: null as string | null,
              testEndDate: null as string | null,
              results: null as string | null,
            }
            const updated = {
              ...base,
              testStartDate: field === 'test_start_date' ? value : null,
              testEndDate: field === 'test_end_date' ? value : null,
              results: field === 'results' ? value : null,
            }
            nextParams = [...nextParams, updated]
          }
        }

        return {
          ...row,
          parameters: nextParams,
        }
      }),
    )

    try {
      if (paramRowId) {
        const payload = { [field]: value || null, updated_at: new Date().toISOString() }
        const { error } = await supabase
          .from('test_allocation_parameters')
          .update(payload)
          .eq('id', paramRowId)
        if (error) throw error
      } else {
        const label = (labelForCreate ?? '').trim()
        const { data: existingRow } = await supabase
          .from('test_allocation_parameters')
          .select('id')
          .eq('test_allocation_id', allocationId)
          .eq('test_label', label)
          .maybeSingle()
        const existingId = (existingRow as { id?: string } | null)?.id
        const patch = { [field]: value || null, updated_at: new Date().toISOString() }
        if (existingId) {
          const { error } = await supabase.from('test_allocation_parameters').update(patch).eq('id', existingId)
          if (error) throw error
        } else {
          const payload: Record<string, unknown> = {
            test_allocation_id: allocationId,
            test_parameter_id: testParameterIdForInsert,
            test_label: label,
            [field]: value || null,
          }
          const { error } = await supabase.from('test_allocation_parameters').insert(payload)
          if (error) throw error
        }
      }
      const { data: stRow, error: stageReadErr } = await supabase
        .from('samples')
        .select('stage')
        .eq('id', sid)
        .maybeSingle()
      let stageSaveHint: string | null = null
      if (!stageReadErr && stRow) {
        const curSt = (stRow as { stage?: string | null }).stage
        if (curSt === 'receiving' || curSt === 'allocation' || curSt === 'test_allocation') {
          const { error: stageUpdErr } = await supabase.from('samples').update({ stage: 'under_testing' }).eq('id', sid)
          if (stageUpdErr) {
            stageSaveHint = formatSupabaseError(stageUpdErr)
            if (import.meta.env.DEV) console.warn('[SampleUnderTesting] samples stage update:', stageSaveHint)
          }
        }
      } else if (stageReadErr && import.meta.env.DEV) {
        console.warn('[SampleUnderTesting] samples stage read skipped:', stageReadErr.message)
      }
      setSaveMessage(
        stageSaveHint
          ? `Updated. Sample stage not advanced: ${stageSaveHint} (run migration 20260329130000 if enum is missing values).`
          : 'Updated.',
      )
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleUpdateStartDate = (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => {
    void updateParameterField(row.sampleId, paramRowId, row.testAllocationId, 'test_start_date', value || null, testLabel, row)
  }
  const handleUpdateResults = (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => {
    void updateParameterField(row.sampleId, paramRowId, row.testAllocationId, 'results', value, testLabel, row)
  }
  const handleUpdateEndDate = (row: TestAllocationRow, paramRowId: string | null, testLabel: string, value: string) => {
    void updateParameterField(row.sampleId, paramRowId, row.testAllocationId, 'test_end_date', value || null, testLabel, row)
  }

  const loadReviewUsers = async () => {
    setReviewUsersLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, designation, department_name, status')
        .order('full_name', { ascending: true })
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      setReviewUsers(
        rows
          .filter((u) => (u as { status?: string }).status?.toLowerCase() !== 'inactive')
          .map((u) => ({
            id: String((u as { id: string }).id),
            name: String((u as { full_name?: string }).full_name ?? ''),
            designation: String((u as { designation?: string }).designation ?? '').trim(),
            departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
          })),
      )
    } catch {
      setReviewUsers([])
    } finally {
      setReviewUsersLoading(false)
    }
  }

  const applySendForReviewRow = (row: TestAllocationRow | null) => {
    setSendForReviewRow(row)
    if (row) {
      setReviewDepartment(row.department?.trim() ?? '')
      setReviewDesignation('Technical Manager')
      setReviewEmployeeId('')
    } else {
      setReviewDepartment('')
      setReviewDesignation('')
      setReviewEmployeeId('')
    }
  }

  const openSendForReviewDialog = () => {
    applySendForReviewRow(null)
    setSendForReviewOpen(true)
    setReviewUsers([])
    void loadReviewUsers()
  }

  const sendForReviewSectionOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { sampleAllocationId: string; label: string }[] = []
    for (const r of filteredRows) {
      if (seen.has(r.sampleAllocationId)) continue
      seen.add(r.sampleAllocationId)
      const srf = r.srfNumber?.trim() || '—'
      out.push({
        sampleAllocationId: r.sampleAllocationId,
        label: `${r.sectionCode} — SRF ${srf}`,
      })
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredRows])

  const norm = (s: string) => (s ?? '').trim().toLowerCase()

  // Link to User Management: departments = stored list merged with unique from users (same as User Management)
  const reviewDepartmentOptions = useMemo(() => {
    const fromStorage: string[] = []
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.departments') : null
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) fromStorage.push(...(parsed.filter((v) => typeof v === 'string') as string[]))
      }
    } catch {
      /* ignore */
    }
    const fromUsers = reviewUsers.map((u) => u.departmentName).filter((d) => d && d.trim())
    const merged = Array.from(new Set([...fromStorage, ...fromUsers]))
      .map((d) => d.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    return merged
  }, [reviewUsers])

  // Filter designations by selected department (from User Management table / designationByDepartment when available)
  const reviewDesignationOptions = useMemo(() => {
    if (!reviewDepartment) return []
    const deptNorm = norm(reviewDepartment)
    // Match designationByDepartment key by normalized department name
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.designationByDepartment') : null
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>
        if (parsed && typeof parsed === 'object') {
          const key = Object.keys(parsed).find((k) => norm(k) === deptNorm)
          if (key && Array.isArray(parsed[key]))
            return [...parsed[key]].sort((a, b) => a.localeCompare(b))
        }
      }
    } catch {
      /* ignore */
    }
    const set = new Set(
      reviewUsers.filter((u) => norm(u.departmentName) === deptNorm).map((u) => u.designation).filter(Boolean),
    )
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [reviewUsers, reviewDepartment])

  const reviewEmployeeOptions = useMemo(() => {
    if (!reviewDepartment || !reviewDesignation || reviewUsers.length === 0) return []
    const dept = norm(reviewDepartment)
    const des = norm(reviewDesignation)
    return reviewUsers.filter(
      (u) => norm(u.departmentName) === dept && norm(u.designation) === des,
    )
  }, [reviewUsers, reviewDepartment, reviewDesignation])

  const handleSubmitSendForReview = async () => {
    if (!sendForReviewRow || !reviewEmployeeId || reviewSubmitLoading) return
    const reviewSampleId = typeof sendForReviewRow.sampleId === 'string' ? sendForReviewRow.sampleId.trim() : ''
    if (!reviewSampleId) {
      setSaveMessage('Missing sample id for send for review.')
      return
    }
    setReviewSubmitLoading(true)
    try {
      const { error } = await supabase
        .from('samples')
        .update({
          stage: 'results_review',
          results_reviewer_id: reviewEmployeeId,
        })
        .eq('id', reviewSampleId)
      if (error) throw error
      // Verify reviewer was stored (RLS or triggers might strip it otherwise)
      const { data: check } = await supabase
        .from('samples')
        .select('stage, results_reviewer_id')
        .eq('id', reviewSampleId)
        .maybeSingle()
      const checked = (check as { stage?: string | null; results_reviewer_id?: string | null } | null) ?? null
      const stored = checked?.results_reviewer_id ?? null
      const stage = checked?.stage ?? null
      if (stored !== reviewEmployeeId || stage !== 'results_review') {
        setSaveMessage(
          'Send for review partially applied. Please check RLS/permissions for samples update (stage/results_reviewer_id).',
        )
      } else {
        setSaveMessage('Sent for review.')
      }
      setSendForReviewOpen(false)
      applySendForReviewRow(null)
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Send for review failed')
    } finally {
      setReviewSubmitLoading(false)
    }
  }

  const handleViewTestParameter = async (row: TestAllocationRow, testLabel: string) => {
    setTestParamViewLabel(testLabel)
    setTestParamViewOpen(true)
    setTestParamViewData([])
    const label = testLabel.trim()
    try {
      // Prefer allocation's test parameter ID so we show the exact record (e.g. allocation-specific Specific Requirement).
      const summaryLabels = (row.testParameterSummary ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const ids = row.testParameterIds ?? []
      const index = summaryLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase())
      const allocationTestParamId = index >= 0 && ids[index] ? ids[index] : null

      if (allocationTestParamId) {
        const { data, error } = await supabase
          .from('test_parameters')
          .select('*')
          .eq('id', allocationTestParamId)
          .maybeSingle()
        if (error) throw error
        setTestParamViewData(data ? [data] : [])
      } else {
        const { data, error } = await supabase
          .from('test_parameters')
          .select('*')
          .ilike('item_name', `%${label}%`)
          .limit(5)
        if (error) throw error
        setTestParamViewData(Array.isArray(data) ? data : [])
      }
    } catch {
      setTestParamViewData([])
    }
  }

  const displayName = profileName || user?.email || 'User'
  const displayDesignation = designation?.trim() ? designation : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="text-2xl font-semibold text-foreground whitespace-nowrap">
            Sample Under Testing
          </h1>
          <div className="md:w-[40%]">
            <Input
              placeholder="Search section, SRF, results..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-28">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 / page</SelectItem>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground shrink-0">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={onlyMyAssignments}
              onChange={(e) => {
                setOnlyMyAssignments(e.target.checked)
                setPage(1)
              }}
              aria-label="Only my assignments"
            />
            <span>Only my assignments</span>
          </label>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={listLoading || filteredRows.length === 0}
            onClick={() => openSendForReviewDialog()}
            aria-label="Send result for review"
          >
            <FileCheck size={16} aria-hidden />
            Send result for review
          </Button>
        </div>
        <p className="text-sm text-muted-foreground shrink-0">
          Logged in as: <span className="font-medium text-foreground">{displayName}</span>
          {displayDesignation !== '—' && (
            <>
              {' · '}
              <span className="font-medium text-foreground">{displayDesignation}</span>
            </>
          )}
        </p>
      </div>

      <SampleUnderTestingTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        emptyStateMessage={
          onlyMyAssignments
            ? 'No sections have you as Select Employee in Test Allocation. Turn off “Only my assignments” to see all active testing work, or ask your manager to assign you.'
            : 'No test allocation rows returned (same source as Test Allocation). If Test Allocation shows sections, check the red error above or Supabase RLS on test_allocations / sample_allocations.'
        }
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onUpdateStartDate={handleUpdateStartDate}
        onUpdateResults={handleUpdateResults}
        onUpdateEndDate={handleUpdateEndDate}
        onToggleReferback={handleToggleReferback}
        onViewTestParameter={handleViewTestParameter}
      />

      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2" />
          <div className="flex items-center gap-2">
            {saveMessage && <p className="text-sm text-emerald-700">{saveMessage}</p>}
            <span className="text-xs text-muted-foreground">
              Page {page} / {pageCount} · {filteredRows.length} allocation(s)
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || listLoading}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormRow(null)
            setFormInitial(null)
          }
          setFormOpen(open)
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Test Start Date, Results & Test End Date</DialogTitle>
          </DialogHeader>
          {formRow && formInitial && (
            <SampleUnderTestingForm
              row={formRow}
              initial={formInitial}
              onSave={handleSaveForm}
              onClose={() => {
                setFormOpen(false)
                setFormRow(null)
                setFormInitial(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={testParamViewOpen} onOpenChange={setTestParamViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="text-lg">Test Parameter: {testParamViewLabel || '—'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-5 pr-1">
            {testParamViewData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No matching test parameter found in Test Parameter directory.</p>
            ) : (
              testParamViewData.map((tp, idx) => {
                const fmt = (v: unknown) => (v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '—')
                const conformity = String(tp.conformity ?? '').trim()
                return (
                  <Card key={(tp.id as string) ?? idx} className="overflow-hidden border-border shadow-sm">
                    <CardHeader className="py-4 px-5 bg-primary/5 border-b border-border">
                      <CardTitle className="text-base font-semibold text-foreground">{fmt(tp.item_name)}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span>IS Code: <span className="font-medium text-foreground">{fmt(tp.is_code_label)}</span></span>
                        <span className="text-border">|</span>
                        <span>Method: <span className="font-medium text-foreground">{fmt(tp.test_method)}</span></span>
                        <span className="text-border">|</span>
                        <span>Clause {fmt(tp.clause_no)} · Unit: {fmt(tp.unit_value)}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5 pt-4">
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requirements</h4>
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 space-y-1.5 text-sm">
                          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
                            <span className="text-muted-foreground">Specific Requirement</span>
                            <span className="whitespace-pre-wrap font-medium">{fmt(tp.specific_requirement)}</span>
                            <span className="text-muted-foreground">Acceptance Criteria</span>
                            <span>{fmt(tp.acceptance_criteria)}</span>
                          </div>
                        </div>
                      </section>
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Uncertainty & Conformity</h4>
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground mr-1">Uncertainty (MU):</span>
                            <span className="font-medium">{fmt(tp.uncertainty_mu)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Conformity:</span>
                            <Badge variant={conformity === 'Yes' ? 'success' : 'outline'} className="text-xs">
                              {conformity || '—'}
                            </Badge>
                          </div>
                        </div>
                      </section>
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Testing Conditions</h4>
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">Temperature</span>
                            <span className="font-medium">{fmt(tp.temperature_of_test)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Humidity</span>
                            <span className="font-medium">{fmt(tp.humidity_of_test)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Time</span>
                            <span className="font-medium">{fmt(tp.testing_time)}</span>
                          </div>
                        </div>
                      </section>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sendForReviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            applySendForReviewRow(null)
            setReviewUsersLoading(false)
          }
          setSendForReviewOpen(open)
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Result for Review</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmitSendForReview()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="review-section">Section code</Label>
              <Select
                value={sendForReviewRow?.sampleAllocationId ?? ''}
                onValueChange={(v) => {
                  if (!v) {
                    applySendForReviewRow(null)
                    return
                  }
                  const row = filteredRows.find((r) => r.sampleAllocationId === v) ?? null
                  applySendForReviewRow(row)
                }}
              >
                <SelectTrigger id="review-section" aria-label="Select section code">
                  <SelectValue placeholder="Select section (SRF)…" />
                </SelectTrigger>
                <SelectContent>
                  {sendForReviewSectionOptions.map((opt) => (
                    <SelectItem key={opt.sampleAllocationId} value={opt.sampleAllocationId}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sendForReviewSectionOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No sections in the current list. Adjust search or filters.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-department">Department</Label>
              <Select
                value={reviewDepartment}
                onValueChange={(v) => {
                  setReviewDepartment(v)
                  setReviewDesignation('')
                  setReviewEmployeeId('')
                }}
                disabled={!sendForReviewRow}
              >
                <SelectTrigger id="review-department" aria-label="Select department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {reviewDepartmentOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-designation">Designation</Label>
              <Select
                value={reviewDesignation}
                onValueChange={(v) => {
                  setReviewDesignation(v)
                  setReviewEmployeeId('')
                }}
                disabled={!sendForReviewRow || !reviewDepartment}
              >
                <SelectTrigger id="review-designation" aria-label="Select designation">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {reviewDesignationOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-employee">Name of Employee</Label>
              <Select
                value={reviewEmployeeId}
                onValueChange={setReviewEmployeeId}
                disabled={
                  !sendForReviewRow || !reviewDesignation || reviewUsersLoading || reviewUsers.length === 0
                }
              >
                <SelectTrigger id="review-employee" aria-label="Select employee">
                  <SelectValue
                    placeholder={
                      reviewUsersLoading
                        ? 'Loading users…'
                        : reviewUsers.length === 0
                          ? 'No users found in User Management'
                          : reviewEmployeeOptions.length === 0
                            ? 'No employee for this department & designation'
                            : 'Select employee'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {reviewEmployeeOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendForReviewOpen(false)}
                disabled={reviewSubmitLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!sendForReviewRow || !reviewEmployeeId || reviewSubmitLoading}
              >
                {reviewSubmitLoading ? 'Sending…' : 'Send for Review'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
