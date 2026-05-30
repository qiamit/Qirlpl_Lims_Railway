import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import { ResultsUnderReviewTable } from './ResultsUnderReviewTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function ResultsUnderReviewMasterPage() {
  const { user, profileName, designation } = useAuth()
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [testParamViewOpen, setTestParamViewOpen] = useState(false)
  const [testParamViewData, setTestParamViewData] = useState<Record<string, unknown>[]>([])
  const [testParamViewLabel, setTestParamViewLabel] = useState('')

  const loadRows = async () => {
    if (!user?.id) {
      setRows([])
      setListLoading(false)
      return
    }
    setListError(null)
    setListLoading(true)
    try {
      // Samples in review for this login user only (set from Sample Under Testing via results_reviewer_id).
      // Do NOT filter by sample_allocations.department/designation vs user_profiles — those describe the testing
      // section (technician context), not the reviewer's org row, and would hide every row for managers/reviewers.
      const { data: sampleRows, error: sampleErr } = await supabase
        .from('samples')
        .select('id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation')
        .eq('stage', 'results_review')
        .eq('results_reviewer_id', user.id)
        .order('created_at', { ascending: false })
      if (sampleErr) throw sampleErr
      const samples = Array.isArray(sampleRows) ? sampleRows : []

      if (samples.length === 0) {
        setRows([])
        return
      }
      const sampleIds = samples.map((s: { id: string }) => s.id)
      const { data: allocData, error: allocErr } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation')
        .in('sample_id', sampleIds)
      if (allocErr) throw allocErr
      const allocations = Array.isArray(allocData) ? allocData : []
      const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))
      const allocIds = allocations.map((a: { id: string }) => a.id)
      if (allocIds.length === 0) {
        setRows([])
        return
      }
      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select(
          'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary',
        )
        .in('sample_allocation_id', allocIds)
        .order('created_at', { ascending: false })
      if (taErr) throw taErr
      const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
      const isCodeIds = [
        ...new Set(
          samples
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
        samples.map(
          (s: {
            id: string
            srf_number?: string
            date_of_sample_receiving?: string
            test_report_is_code_id?: string | null
            referback_from_allocation?: boolean | null
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
            },
          ],
        ),
      )
      const allocationIds = [...new Set(testAllocs.map((t: { id: string }) => t.id))]
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

      const list: TestAllocationRow[] = testAllocs
        .map(
          (t: {
            id: string
            sample_allocation_id: string
            assigned_employee_id?: string | null
            assigned_employee_name?: string | null
            test_parameter_summary?: string | null
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
            const sample = samplesMap.get(a.sample_id)
            const params = paramsByAllocationId.get(t.id) ?? []
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
              testParameterIds: [],
              assignedEmployeeId: t.assigned_employee_id ?? null,
              assignedEmployeeName: t.assigned_employee_name ?? null,
              referbackFromAllocation: sample?.referbackFromAllocation ?? false,
              testStartDate: null,
              results: null,
              testEndDate: null,
              parameters: params.map((p) => ({
                id: p.id,
                testAllocationId: p.test_allocation_id,
                testParameterId: p.test_parameter_id,
                testLabel: p.test_label,
                testStartDate: p.test_start_date,
                testEndDate: p.test_end_date,
                results: p.results,
              })),
            }
          },
        )
        .filter((r): r is TestAllocationRow => r != null)
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load results for review')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [user?.id])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        [r.sectionCode, r.srfNumber, r.testParameterSummary, r.results]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const handleViewTestParameter = async (row: TestAllocationRow, testLabel: string) => {
    setTestParamViewLabel(testLabel)
    setTestParamViewOpen(true)
    setTestParamViewData([])
    const label = testLabel.trim()
    try {
      let allocationTestParamId: string | null = null
      if (Array.isArray(row.parameters) && row.parameters.length > 0) {
        const match = row.parameters.find((p) => p.testLabel.trim().toLowerCase() === label.toLowerCase())
        allocationTestParamId = match?.testParameterId ?? null
      }
      if (!allocationTestParamId) {
        const summaryLabels = (row.testParameterSummary ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        const ids = row.testParameterIds ?? []
        const index = summaryLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase())
        allocationTestParamId = index >= 0 && ids[index] ? ids[index] : null
      }
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

  const handleApproveForTestReport = async (row: TestAllocationRow) => {
    try {
      const { error } = await supabase
        .from('samples')
        .update({ stage: 'report_preparation' })
        .eq('id', row.sampleId)
      if (error) throw error
      setSaveMessage('Approved for test report preparation (Clause 7.8).')
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to approve for test report')
    }
  }

  const displayName = profileName || user?.email || 'User'
  const displayDesignation = designation?.trim() ? designation : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="text-2xl font-semibold text-foreground whitespace-nowrap">
            Results Under Review
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

      <ResultsUnderReviewTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        onApproveForTestReport={handleApproveForTestReport}
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
    </div>
  )
}
