import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'

type ParameterViewRow = {
  id: string
  testName: string
  unit: string
  specifiedRequirement: string
  uncertainty: string
  underAccreditation: string
}

type SectionParamRef = {
  testParameterId: string | null
  testLabel: string
  sectionSpec: string | null
}

type TestParamMeta = {
  id: string
  label: string
  unitValue: string | null
  uncertaintyMu: string | null
  specificRequirement: string | null
  underAccreditation: string
}

const fmt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')
const IS_CODE_FILES_BUCKET = 'is-code-files'
const normLabel = (v: string) => v.trim().toLowerCase()

type ParamViewSortKey =
  | 'testName'
  | 'unit'
  | 'specifiedRequirement'
  | 'uncertainty'
  | 'underAccreditation'

const PARAM_VIEW_SORT_LABELS: Record<ParamViewSortKey, string> = {
  testName: 'Test Name',
  unit: 'Unit',
  specifiedRequirement: 'Specified Requirement',
  uncertainty: 'Uncertainty of Measurement',
  underAccreditation: 'Under Accreditation',
}

function sortValueForCompare(value: string): string {
  const v = value.trim()
  if (!v || v === '—') return ''
  return v.toLowerCase()
}

function sortParamViewRows(
  rows: ParameterViewRow[],
  sortKey: ParamViewSortKey,
  sortDir: 'asc' | 'desc',
): ParameterViewRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValueForCompare(a[sortKey])
    const bv = sortValueForCompare(b[sortKey])
    const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
    if (cmp !== 0) return cmp * dir
    return a.testName.localeCompare(b.testName, undefined, { sensitivity: 'base' }) * dir
  })
}

function SortableParamHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align = 'center',
}: {
  label: string
  columnKey: ParamViewSortKey
  sortKey: ParamViewSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: ParamViewSortKey) => void
  align?: 'left' | 'center'
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const justify = align === 'left' ? 'justify-start' : 'justify-center'

  return (
    <th className="p-2 text-xs font-medium leading-snug">
      <button
        type="button"
        className={`inline-flex w-full items-center gap-1 hover:text-foreground transition-colors ${justify} ${align === 'left' ? 'text-left' : 'text-center'}`}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </th>
  )
}

async function getSignedUrlForIsCodeFile(storagePath: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase.storage.from(IS_CODE_FILES_BUCKET).createSignedUrl(storagePath, 60 * 10)
    if (error) throw error
    return data?.signedUrl
  } catch {
    return undefined
  }
}

function accrLabelFromIds(
  accrIds: string[] | null,
  bodies: Array<{ id: string; name: string }>,
): string {
  if (!Array.isArray(accrIds) || accrIds.length === 0) return 'Not Accredited'
  const names = accrIds
    .map((id) => bodies.find((b) => b.id === id)?.name)
    .filter(Boolean) as string[]
  return names.length > 0 ? names.join(', ') : 'Not Accredited'
}

async function fetchTestParamMetaByIds(ids: string[]): Promise<Map<string, TestParamMeta>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return new Map()

  const [{ data: tpData, error: tpErr }, { data: abData }] = await Promise.all([
    supabase
      .from('test_parameters')
      .select('id, item_name, specific_requirement, under_accreditation_ids, unit_value, uncertainty_mu')
      .in('id', unique),
    supabase.from('accreditation_bodies').select('id, name'),
  ])
  if (tpErr) throw tpErr

  const bodies = Array.isArray(abData) ? abData : []
  const map = new Map<string, TestParamMeta>()
  for (const tp of Array.isArray(tpData) ? tpData : []) {
    const r = tp as {
      id: string
      item_name?: string | null
      specific_requirement?: string | null
      under_accreditation_ids?: string[] | null
      unit_value?: string | null
      uncertainty_mu?: string | null
    }
    map.set(r.id, {
      id: r.id,
      label: (r.item_name ?? r.id).trim(),
      unitValue: r.unit_value ?? null,
      uncertaintyMu: r.uncertainty_mu ?? null,
      specificRequirement: r.specific_requirement ?? null,
      underAccreditation: accrLabelFromIds(r.under_accreditation_ids ?? null, bodies),
    })
  }
  return map
}

async function resolveTestParameterIdByLabel(
  label: string,
  isCodeId: string | null,
): Promise<string | null> {
  const trimmed = label.trim()
  if (!trimmed) return null
  let query = supabase.from('test_parameters').select('id, item_name').ilike('item_name', trimmed)
  if (isCodeId) query = query.eq('is_code_id', isCodeId)
  const { data, error } = await query.limit(20)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  const target = normLabel(trimmed)
  const exact = rows.find((r) => normLabel(String((r as { item_name?: string }).item_name ?? '')) === target)
  return String((exact ?? rows[0] as { id?: string } | undefined)?.id ?? '').trim() || null
}

async function loadSectionParamRefs(row: TestAllocationRow): Promise<SectionParamRef[]> {
  const refs: SectionParamRef[] = []

  if (row.testAllocationId) {
    const { data: paramRows, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select('test_parameter_id, test_label, specific_requirement')
      .eq('test_allocation_id', row.testAllocationId)
      .order('test_label', { ascending: true })
    if (paramErr) throw paramErr
    for (const p of Array.isArray(paramRows) ? paramRows : []) {
      refs.push({
        testParameterId: String((p as { test_parameter_id?: string | null }).test_parameter_id ?? '').trim() || null,
        testLabel: String((p as { test_label?: string | null }).test_label ?? '').trim(),
        sectionSpec: String((p as { specific_requirement?: string | null }).specific_requirement ?? '').trim() || null,
      })
    }
  }

  if (refs.length > 0) return refs

  const ids = [...(row.testParameterIds ?? [])].map((id) => String(id).trim()).filter(Boolean)
  if (ids.length > 0) {
    return ids.map((id) => ({
      testParameterId: id,
      testLabel: '',
      sectionSpec: null,
    }))
  }

  const summaryLabels = (row.testParameterSummary ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return summaryLabels.map((label) => ({
    testParameterId: null,
    testLabel: label,
    sectionSpec: null,
  }))
}

function buildViewRows(
  refs: SectionParamRef[],
  metaById: Map<string, TestParamMeta>,
): ParameterViewRow[] {
  return refs.map((ref, index) => {
    const tpId = ref.testParameterId ?? `unlinked-${index}`
    const meta = ref.testParameterId ? metaById.get(ref.testParameterId) : undefined
    const testName = ref.testLabel.trim() || meta?.label || tpId
    const specifiedRequirement =
      ref.sectionSpec?.trim() || meta?.specificRequirement?.trim() || '—'
    return {
      id: tpId,
      testName,
      unit: fmt(meta?.unitValue),
      specifiedRequirement: specifiedRequirement || '—',
      uncertainty: fmt(meta?.uncertaintyMu),
      underAccreditation: meta?.underAccreditation ?? '—',
    }
  })
}

export function TestAllocationParametersViewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: TestAllocationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parameters, setParameters] = useState<ParameterViewRow[]>([])
  const [sortKey, setSortKey] = useState<ParamViewSortKey>('testName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedParameters = useMemo(
    () => sortParamViewRows(parameters, sortKey, sortDir),
    [parameters, sortKey, sortDir],
  )

  const handleSort = (key: ParamViewSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
  const [sampleDetailsLoading, setSampleDetailsLoading] = useState(false)
  const [sampleDetailsError, setSampleDetailsError] = useState<string | null>(null)
  const [sampleDetails, setSampleDetails] = useState<{
    sample_description: string | null
    sample_declaration: string | null
    any_other_information: string | null
  } | null>(null)

  useEffect(() => {
    if (!open || !row) {
      setParameters([])
      setError(null)
      if (!open) {
        setSortKey('testName')
        setSortDir('asc')
      }
      return
    }

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const refs = await loadSectionParamRefs(row)
        const isCodeId = row.isCodeId?.trim() || null

        const resolvedRefs: SectionParamRef[] = []
        for (const ref of refs) {
          if (ref.testParameterId) {
            resolvedRefs.push(ref)
            continue
          }
          const label = ref.testLabel.trim()
          if (!label) continue
          const id = await resolveTestParameterIdByLabel(label, isCodeId)
          resolvedRefs.push({ ...ref, testParameterId: id })
        }

        const ids = resolvedRefs
          .map((r) => r.testParameterId)
          .filter((id): id is string => Boolean(id?.trim()))
        const metaById = await fetchTestParamMetaByIds(ids)
        setParameters(buildViewRows(resolvedRefs, metaById))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test parameters')
        setParameters([])
      } finally {
        setLoading(false)
      }
    })()
  }, [open, row])

  const openSampleDetails = async () => {
    if (!row?.sampleId) return
    setSampleDetailsOpen(true)
    setSampleDetailsError(null)
    setSampleDetails(null)
    setSampleDetailsLoading(true)
    try {
      const { data, error: sampleError } = await supabase
        .from('samples')
        .select('sample_description, sample_declaration, any_other_information')
        .eq('id', row.sampleId)
        .single()
      if (sampleError) throw sampleError
      const d = data as {
        sample_description?: string | null
        sample_declaration?: string | null
        any_other_information?: string | null
      }
      setSampleDetails({
        sample_description: d.sample_description ?? null,
        sample_declaration: d.sample_declaration ?? null,
        any_other_information: d.any_other_information ?? null,
      })
    } catch (err) {
      setSampleDetailsError(err instanceof Error ? err.message : 'Failed to load sample details')
    } finally {
      setSampleDetailsLoading(false)
    }
  }

  const openViewFilesWindow = async () => {
    if (!row?.isCodeId || !row.isCodeLabel) return
    const win = window.open('', '_blank', 'width=700,height=500')
    if (!win) return
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(row.isCodeLabel)}</div><div class="muted">Loading…</div></body></html>`,
    )
    win.document.close()

    const { data: fileList, error: filesErr } = await supabase
      .from('is_code_files')
      .select('id, file_name, storage_path')
      .eq('is_code_id', row.isCodeId)
      .order('created_at', { ascending: false })
    if (filesErr) {
      win.document.open()
      win.document.write(
        `<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title></head><body><h1>IS Code Files</h1><p>Failed to load files.</p></body></html>`,
      )
      win.document.close()
      return
    }
    const list = Array.isArray(fileList) ? fileList : []
    const withUrls: { file_name: string; url?: string }[] = []
    for (const f of list) {
      const url = await getSignedUrlForIsCodeFile((f as { storage_path: string }).storage_path)
      withUrls.push({ file_name: (f as { file_name: string }).file_name, url })
    }
    const items =
      withUrls.length === 0
        ? '<div class="empty">No files in IS Code directory for this code.</div>'
        : withUrls
            .map(
              (f) =>
                `<div class="row"><span class="name">${esc(f.file_name)}</span>${f.url ? `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noreferrer">View</a>` : '<span class="muted">—</span>'}</div>`,
            )
            .join('')
    win.document.open()
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(row.isCodeLabel)}</div>${items}</body></html>`,
    )
    win.document.close()
  }

  const sectionLabel = row
    ? [
        `Section ${row.sectionCode}`,
        row.department?.trim() ? `Dept. ${row.department.trim()}` : null,
        row.srfNumber?.trim() ? row.srfNumber.trim() : null,
      ]
        .filter(Boolean)
        .join(' — ')
    : 'Test Parameters'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(96vw,72rem)] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b border-border pb-3 shrink-0">
            <DialogTitle className="text-lg">Test Parameters — {sectionLabel}</DialogTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void openSampleDetails()}>
                <FileText className="mr-1 h-4 w-4" />
                View Sample Details
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openViewFilesWindow()}
                disabled={!row?.isCodeId}
                title={row?.isCodeId ? `View files for ${row.isCodeLabel ?? 'IS Code'}` : 'No IS Code on this section'}
              >
                <FolderOpen className="mr-1 h-4 w-4" />
                View Files
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto pt-2">
            {loading ? (
              <p className="text-sm text-muted-foreground py-4">Loading test parameters…</p>
            ) : error ? (
              <p className="text-sm text-destructive py-4">{error}</p>
            ) : parameters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No test parameters allotted for this section yet.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full table-fixed text-sm border-collapse">
                  <colgroup>
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[36%]" />
                    <col className="w-[16%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <SortableParamHeader
                        label={PARAM_VIEW_SORT_LABELS.testName}
                        columnKey="testName"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="left"
                      />
                      <SortableParamHeader
                        label={PARAM_VIEW_SORT_LABELS.unit}
                        columnKey="unit"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableParamHeader
                        label={PARAM_VIEW_SORT_LABELS.specifiedRequirement}
                        columnKey="specifiedRequirement"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableParamHeader
                        label={PARAM_VIEW_SORT_LABELS.uncertainty}
                        columnKey="uncertainty"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableParamHeader
                        label={PARAM_VIEW_SORT_LABELS.underAccreditation}
                        columnKey="underAccreditation"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedParameters.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="p-2 align-top text-left text-xs font-medium leading-snug break-words">
                          {p.testName}
                        </td>
                        <td className="p-2 align-top text-center text-xs text-muted-foreground leading-snug break-words">
                          {p.unit}
                        </td>
                        <td className="p-2 align-top text-center text-xs text-muted-foreground leading-snug break-words whitespace-pre-wrap">
                          {p.specifiedRequirement}
                        </td>
                        <td className="p-2 align-top text-center text-xs text-muted-foreground leading-snug break-words whitespace-pre-wrap">
                          {p.uncertainty}
                        </td>
                        <td className="p-2 align-top text-center text-xs leading-snug break-words">
                          {p.underAccreditation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sampleDetailsOpen} onOpenChange={setSampleDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sample Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sampleDetailsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {sampleDetailsError && <p className="text-sm text-destructive">{sampleDetailsError}</p>}
            {!sampleDetailsLoading && !sampleDetailsError && sampleDetails && (
              <div className="grid gap-4 text-sm">
                <div className="space-y-2">
                  <h5 className="font-medium text-foreground">Sample Description &amp; Sample Declaration</h5>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-baseline">
                    <span className="text-muted-foreground">Sample Description</span>
                    <span className="whitespace-pre-wrap">{fmt(sampleDetails.sample_description)}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                    <span className="text-muted-foreground pt-0.5">Sample Declaration</span>
                    <span className="whitespace-pre-wrap">{fmt(sampleDetails.sample_declaration)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium text-foreground">Any Other Information</h5>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                    <span className="text-muted-foreground pt-0.5">Details</span>
                    <span className="whitespace-pre-wrap">{fmt(sampleDetails.any_other_information)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
