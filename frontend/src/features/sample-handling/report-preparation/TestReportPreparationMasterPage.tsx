import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Printer, Save, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react'

type ListRow = {
  id: string
  srfNumber: string | null
  dateReceiving: string | null
  clientName: string | null
  isCodeLabel: string | null
  reportNumber: string | null
  draftNotes: string | null
}

type ParamLine = {
  sectionCode: string
  department: string | null
  testLabel: string
  testStartDate: string | null
  testEndDate: string | null
  results: string | null
}

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 10) : '—'

function buildPrintDocument(opts: {
  labName: string
  srf: string
  client: string
  isStandard: string
  dateReceiving: string
  reportNumber: string
  notes: string
  lines: ParamLine[]
}) {
  const rows = opts.lines
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.sectionCode)}</td>
        <td>${escapeHtml(l.department ?? '—')}</td>
        <td>${escapeHtml(l.testLabel)}</td>
        <td>${escapeHtml(fmtDate(l.testStartDate))}</td>
        <td>${escapeHtml(fmtDate(l.testEndDate))}</td>
        <td>${escapeHtml(l.results ?? '—')}</td>
      </tr>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Test report draft — ${escapeHtml(opts.srf)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}
  th{background:#f8fafc;font-weight:600}
  .meta{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:12px;margin-bottom:16px}
  .k{color:#64748b}
  .notes{white-space:pre-wrap;border:1px solid #e2e8f0;padding:10px;border-radius:8px;background:#fafafa;margin-top:12px;font-size:12px}
</style></head><body>
  <h1>Test report — draft (Clause 7.8)</h1>
  <div class="sub">${escapeHtml(opts.labName)} · ISO/IEC 17025:2017</div>
  <div class="meta">
    <span class="k">SRF</span><span>${escapeHtml(opts.srf)}</span>
    <span class="k">Client</span><span>${escapeHtml(opts.client)}</span>
    <span class="k">Report as per IS</span><span>${escapeHtml(opts.isStandard)}</span>
    <span class="k">Date of receiving</span><span>${escapeHtml(opts.dateReceiving)}</span>
    <span class="k">Report no. (draft)</span><span>${escapeHtml(opts.reportNumber || '—')}</span>
  </div>
  <table><thead><tr>
    <th>Section</th><th>Department</th><th>Test parameter</th><th>Start</th><th>End</th><th>Results</th>
  </tr></thead><tbody>${rows}</tbody></table>
  ${opts.notes.trim() ? `<div class="notes"><strong>Preparation notes</strong><br/>${escapeHtml(opts.notes)}</div>` : ''}
</body></html>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function TestReportPreparationMasterPage() {
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [active, setActive] = useState<ListRow | null>(null)
  const [reportNumber, setReportNumber] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [paramLines, setParamLines] = useState<ParamLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [issueLoading, setIssueLoading] = useState(false)

  const labName = useMemo(() => {
    if (typeof window === 'undefined') return 'Laboratory'
    return window.localStorage.getItem('labSettings.labName') || 'Quality International Research & Laboratories Pvt. Ltd.'
  }, [])

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data, error: qErr } = await supabase
        .from('samples')
        .select(
          'id, srf_number, date_of_sample_receiving, test_report_is_code_id, test_report_number, test_report_draft_notes, clients(company_name)',
        )
        .eq('stage', 'report_preparation')
        .order('updated_at', { ascending: false })
      if (qErr) throw qErr
      const list = Array.isArray(data) ? data : []
      const isIds = [
        ...new Set(
          list
            .map((r: { test_report_is_code_id?: string | null }) => r.test_report_is_code_id)
            .filter(Boolean),
        ),
      ] as string[]
      let isMap = new Map<string, string>()
      if (isIds.length > 0) {
        const { data: isData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isIds)
        for (const c of Array.isArray(isData) ? isData : []) {
          const row = c as { id: string; is_number?: string; revision_year?: string | null }
          const label = row.revision_year
            ? `${row.is_number ?? ''} : ${row.revision_year}`
            : (row.is_number ?? row.id)
          isMap.set(row.id, label)
        }
      }
      setRows(
        list.map((r: Record<string, unknown>) => {
          const clients = r.clients as { company_name?: string } | null
          const isId = r.test_report_is_code_id as string | null
          return {
            id: r.id as string,
            srfNumber: (r.srf_number as string) ?? null,
            dateReceiving: (r.date_of_sample_receiving as string) ?? null,
            clientName: clients?.company_name ?? null,
            isCodeLabel: isId ? (isMap.get(isId) ?? null) : null,
            reportNumber: (r.test_report_number as string) ?? null,
            draftNotes: (r.test_report_draft_notes as string) ?? null,
          }
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load samples')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const loadDetail = async (sampleId: string) => {
    setDetailLoading(true)
    setParamLines([])
    try {
      const { data: allocs, error: aErr } = await supabase
        .from('sample_allocations')
        .select('id, section_code, department')
        .eq('sample_id', sampleId)
      if (aErr) throw aErr
      const allocList = Array.isArray(allocs) ? allocs : []
      if (allocList.length === 0) {
        setParamLines([])
        return
      }
      const allocIds = allocList.map((a: { id: string }) => a.id)
      const { data: tas, error: tErr } = await supabase
        .from('test_allocations')
        .select('id, sample_allocation_id')
        .in('sample_allocation_id', allocIds)
      if (tErr) throw tErr
      const taList = Array.isArray(tas) ? tas : []
      const taIds = taList.map((t: { id: string }) => t.id)
      const allocById = new Map(
        allocList.map((a: { id: string; section_code: string; department: string | null }) => [
          a.id,
          { sectionCode: a.section_code, department: a.department },
        ]),
      )
      let params: Array<{
        test_allocation_id: string
        test_label: string
        test_start_date: string | null
        test_end_date: string | null
        results: string | null
      }> = []
      if (taIds.length > 0) {
        const { data: pr, error: pErr } = await supabase
          .from('test_allocation_parameters')
          .select('test_allocation_id, test_label, test_start_date, test_end_date, results')
          .in('test_allocation_id', taIds)
        if (pErr) throw pErr
        params = Array.isArray(pr) ? (pr as typeof params) : []
      }
      const taToAlloc = new Map(
        taList.map((t: { id: string; sample_allocation_id: string }) => [t.id, t.sample_allocation_id]),
      )
      const lines: ParamLine[] = params.map((p) => {
        const allocId = taToAlloc.get(p.test_allocation_id)
        const sec = allocId ? allocById.get(allocId) : undefined
        return {
          sectionCode: sec?.sectionCode ?? '—',
          department: sec?.department ?? null,
          testLabel: p.test_label ?? '—',
          testStartDate: p.test_start_date,
          testEndDate: p.test_end_date,
          results: p.results,
        }
      })
      setParamLines(lines)
    } catch {
      setParamLines([])
    } finally {
      setDetailLoading(false)
    }
  }

  const openPrepare = (r: ListRow) => {
    setActive(r)
    setReportNumber(r.reportNumber ?? '')
    setDraftNotes(r.draftNotes ?? '')
    setDialogOpen(true)
    setSaveMessage(null)
    void loadDetail(r.id)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.srfNumber, r.clientName, r.isCodeLabel, r.reportNumber].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const handleSaveDraft = async () => {
    if (!active) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { error: uErr } = await supabase
        .from('samples')
        .update({
          test_report_number: reportNumber.trim() || null,
          test_report_draft_notes: draftNotes.trim() || null,
        })
        .eq('id', active.id)
      if (uErr) throw uErr
      setSaveMessage('Draft saved.')
      await loadList()
    } catch (e) {
      setSaveMessage(
        e instanceof Error
          ? `${e.message} If columns are missing, run the migration: web/supabase/migrations/20260327120000_samples_report_preparation.sql`
          : 'Save failed',
      )
    } finally {
      setSaveLoading(false)
    }
  }

  const printDraft = () => {
    if (!active) return
    const html = buildPrintDocument({
      labName,
      srf: active.srfNumber ?? active.id,
      client: active.clientName ?? '—',
      isStandard: active.isCodeLabel ?? '—',
      dateReceiving: fmtDate(active.dateReceiving),
      reportNumber: reportNumber.trim(),
      notes: draftNotes,
      lines: paramLines,
    })
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      document.body.removeChild(iframe)
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(() => {
          try {
            document.body.removeChild(iframe)
          } catch {
            /* ignore */
          }
        }, 500)
      }
    }
  }

  const handleIssueReport = async () => {
    if (!active) return
    if (!window.confirm('Issue this test report and move the SRF to Completed Results?')) return
    setIssueLoading(true)
    setSaveMessage(null)
    try {
      const { error: uErr } = await supabase
        .from('samples')
        .update({
          stage: 'completed',
          test_report_number: reportNumber.trim() || null,
          test_report_draft_notes: draftNotes.trim() || null,
          test_report_issued_at: new Date().toISOString(),
        })
        .eq('id', active.id)
      if (uErr) throw uErr
      setDialogOpen(false)
      setActive(null)
      await loadList()
      setSaveMessage('Test report issued. SRF moved to Completed Results.')
    } catch (e) {
      setSaveMessage(
        e instanceof Error
          ? `${e.message} If columns are missing, run the migration file in Supabase SQL editor.`
          : 'Issue failed',
      )
    } finally {
      setIssueLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Test Report Preparation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ISO/IEC 17025:2017 — Clause 7.8 · Consolidate reviewed results and issue the test report
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">SRFs ready for reporting</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search SRF, client, IS…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                <option value="5">5 / page</option>
                <option value="10">10 / page</option>
                <option value="20">20 / page</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          {saveMessage && !dialogOpen && (
            <p className="text-sm text-success mb-3">{saveMessage}</p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground py-6">Loading…</p>
          ) : paged.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              No samples in test report preparation. Approve results from Results Under Review first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">SRF</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">IS (report basis)</TableHead>
                  <TableHead className="text-xs">Receiving date</TableHead>
                  <TableHead className="text-xs">Draft report no.</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{fmt(r.srfNumber)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.clientName)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.isCodeLabel)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.dateReceiving)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.reportNumber)}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => openPrepare(r)}>
                        <FileText size={14} className="mr-1" />
                        Prepare
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && paged.length > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="text-xs text-muted-foreground">
                Page {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setActive(null)
          setDialogOpen(o)
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test report — {active ? fmt(active.srfNumber) : '—'}</DialogTitle>
          </DialogHeader>

          {active && (
            <div className="space-y-4">
              {saveMessage && dialogOpen && (
                <p className="text-sm text-muted-foreground">{saveMessage}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tr-num">Test report number</Label>
                  <Input
                    id="tr-num"
                    value={reportNumber}
                    onChange={(e) => setReportNumber(e.target.value)}
                    placeholder="e.g. QI/TR/250327-01"
                  />
                </div>
                <div className="space-y-2 text-sm text-muted-foreground sm:pt-8">
                  <p>
                    <span className="font-medium text-foreground">Client:</span> {fmt(active.clientName)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">IS:</span> {fmt(active.isCodeLabel)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-notes">Preparation notes (internal)</Label>
                <Textarea
                  id="tr-notes"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes for the authorised signatory / report template"
                />
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Results summary (from technical records)
                </h4>
                {detailLoading ? (
                  <p className="text-sm text-muted-foreground">Loading parameters…</p>
                ) : paramLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No parameter rows linked to this SRF.</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Section</TableHead>
                          <TableHead className="text-xs">Dept</TableHead>
                          <TableHead className="text-xs">Parameter</TableHead>
                          <TableHead className="text-xs">Start</TableHead>
                          <TableHead className="text-xs">End</TableHead>
                          <TableHead className="text-xs">Results</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paramLines.map((l, i) => (
                          <TableRow key={`${l.sectionCode}-${l.testLabel}-${i}`}>
                            <TableCell className="text-xs">{l.sectionCode}</TableCell>
                            <TableCell className="text-xs">{fmt(l.department)}</TableCell>
                            <TableCell className="text-xs">{l.testLabel}</TableCell>
                            <TableCell className="text-xs">{fmtDate(l.testStartDate)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(l.testEndDate)}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate" title={l.results ?? ''}>
                              {fmt(l.results)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={printDraft} disabled={!active || detailLoading}>
              <Printer size={16} className="mr-2" />
              Print draft
            </Button>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={!active || saveLoading}>
                <Save size={16} className="mr-2" />
                {saveLoading ? 'Saving…' : 'Save draft'}
              </Button>
              <Button type="button" onClick={handleIssueReport} disabled={!active || issueLoading}>
                <CheckCircle size={16} className="mr-2" />
                {issueLoading ? 'Issuing…' : 'Issue test report'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
