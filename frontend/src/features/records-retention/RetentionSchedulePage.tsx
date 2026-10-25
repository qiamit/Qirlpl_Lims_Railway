import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { csvCell } from '@/lib/csv'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  fetchRetentionCounts,
  fetchRetentionRules,
  formatYears,
  isRetentionMissingError,
  MIN_RETENTION_YEARS,
  retentionCsv,
  retentionErrorText,
  updateRetentionRule,
  type RetentionCount,
  type RetentionRule,
} from './retention'

const th =
  'border border-stone-300 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-amber-100'
const td = 'border border-stone-200 px-2 py-1.5 align-top text-[13px]'

function canEditSchedule(designation: string, departmentName: string): boolean {
  const d = designation.trim().toLowerCase()
  return d === 'laboratory director' || (d === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')
}

function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

type EditForm = {
  years: string
  starts: string
  legal: string
  disposal: string
  owner: string
  remarks: string
  active: boolean
}

/**
 * Records retention schedule (ISO/IEC 17025 8.4.2) with, per rule, how many
 * records in the LIMS are past their retention period. Read-only counts:
 * disposal stays a deliberate, recorded decision outside this page.
 */
export default function RetentionSchedulePage() {
  const { designation, departmentName } = useAuth()
  const canEdit = canEditSchedule(designation, departmentName)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [rules, setRules] = useState<RetentionRule[]>([])
  const [counts, setCounts] = useState<Map<string, RetentionCount>>(new Map())
  const [loading, setLoading] = useState(true)
  const [countsLoading, setCountsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<RetentionRule | null>(null)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadCounts = useCallback(async () => {
    setCountsLoading(true)
    try {
      setCounts(await fetchRetentionCounts())
    } catch (err) {
      setError(`Could not count records: ${retentionErrorText(err)}`)
    } finally {
      setCountsLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRules(await fetchRetentionRules())
      setAvailable(true)
      void loadCounts()
    } catch (err) {
      if (isRetentionMissingError(err as { code?: string; message?: string })) setAvailable(false)
      else setError(retentionErrorText(err))
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [loadCounts])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => (showInactive ? rules : rules.filter((r) => r.active)), [rules, showInactive])
  const pastRules = shown.filter((r) => (counts.get(r.id)?.past_retention_count ?? 0) > 0)
  const pastTotal = pastRules.reduce((n, r) => n + (counts.get(r.id)?.past_retention_count ?? 0), 0)

  const openEdit = (r: RetentionRule) => {
    setEditing(r)
    setFormError(null)
    setForm({
      years: String(r.retention_years),
      starts: r.retention_starts ?? '',
      legal: r.legal_basis ?? '',
      disposal: r.disposal_method ?? '',
      owner: r.owner ?? '',
      remarks: r.remarks ?? '',
      active: r.active,
    })
  }

  const save = async () => {
    if (!editing || !form) return
    const years = Number(form.years)
    if (!Number.isFinite(years) || years < MIN_RETENTION_YEARS || years > 100) {
      setFormError(`Retention must be at least ${MIN_RETENTION_YEARS} years (lab policy) and at most 100 years.`)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await updateRetentionRule(editing.id, {
        retention_years: years,
        retention_starts: form.starts.trim() || 'Date of the record',
        legal_basis: form.legal.trim() || null,
        disposal_method: form.disposal.trim() || null,
        owner: form.owner.trim() || null,
        remarks: form.remarks.trim() || null,
        active: form.active,
      })
      setEditing(null)
      setForm(null)
      setMessage(`Retention rule "${editing.record_type}" saved.`)
      await load()
    } catch (err) {
      setFormError(retentionErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const header = [csvCell('Records retention schedule (ISO/IEC 17025 8.4.2)'), csvCell(new Date().toISOString().slice(0, 10))].join(',')
    const blob = new Blob(['﻿', `${header}\n${retentionCsv(shown, counts)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `records-retention-schedule-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={limsPageShellClass}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">ISO/IEC 17025 · 8.4.2</p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">Records retention schedule</h1>
              <p className="text-[11px] text-stone-300">
                How long each kind of record is kept, why, and who disposes of it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs text-stone-200">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
                onClick={exportCsv}
                disabled={!available || shown.length === 0}
              >
                <Download size={14} /> CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading || countsLoading ? 'animate-spin' : undefined} /> Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {available === false ? (
        <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">The retention schedule is not set up on this database yet.</p>
          <p className="mt-1 text-[13px]">
            Ask the administrator to apply migration <code>20261028100000_document_control_and_retention.sql</code>.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border border-red-600/50 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="border border-emerald-600/50 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          {message}
        </p>
      ) : null}

      {available ? (
        <div className="flex flex-wrap items-start gap-2 border-2 border-stone-500 bg-[#fffcf7] px-3 py-2 text-[13px] text-stone-800">
          {pastRules.length ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          ) : null}
          <p className="min-w-0 flex-1">
            {countsLoading
              ? 'Counting records…'
              : pastRules.length
                ? `${pastTotal} record(s) in ${pastRules.length} categor${pastRules.length === 1 ? 'y is' : 'ies are'} past retention.`
                : 'No LIMS records are past their retention period.'}{' '}
            Nothing is deleted automatically. Before disposal the record owner checks for legal holds, open
            complaints or appeals, and the Quality Manager approves and records the disposal. Deleted records
            stay in the Recycle Bin and are counted here until purged.
          </p>
        </div>
      ) : null}

      {available !== false ? (
        <section className={cn(limsPanelClass, 'overflow-x-auto bg-white')}>
          {loading ? (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-600">No retention rules.</p>
          ) : (
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Record type</th>
                  <th className={th}>Retention</th>
                  <th className={th}>Legal / normative basis</th>
                  <th className={th}>Disposal</th>
                  <th className={th}>Owner</th>
                  <th className={cn(th, 'text-right')}>Held</th>
                  <th className={cn(th, 'text-right')}>Past retention</th>
                  {canEdit ? <th className={th}><span className="sr-only">Edit</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const c = counts.get(r.id)
                  const past = c?.past_retention_count ?? 0
                  return (
                    <tr key={r.id} className={cn(!r.active && 'opacity-60', past > 0 && 'bg-amber-50/60')}>
                      <td className={td}>
                        <p className="font-semibold text-stone-900">{r.record_type}</p>
                        <p className="text-[11px] text-stone-500">
                          {r.clause ? `Clause ${r.clause}` : null}
                          {r.table_name ? ` · LIMS: ${r.table_name}` : ' · Paper / external'}
                          {!r.active ? ' · inactive' : ''}
                        </p>
                        {r.remarks ? <p className="mt-0.5 text-[12px] italic text-stone-600">{r.remarks}</p> : null}
                      </td>
                      <td className={cn(td, 'min-w-[150px]')}>
                        <p className="font-semibold">{formatYears(r.retention_years)}</p>
                        <p className="text-[11px] text-stone-600">from {r.retention_starts}</p>
                      </td>
                      <td className={cn(td, 'min-w-[200px] text-[12px]')}>{r.legal_basis || '—'}</td>
                      <td className={cn(td, 'min-w-[180px] text-[12px]')}>{r.disposal_method || '—'}</td>
                      <td className={cn(td, 'whitespace-nowrap')}>{r.owner || '—'}</td>
                      <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>
                        {c?.tracked ? (
                          <>
                            {c.total_count ?? 0}
                            {c.oldest_record ? (
                              <p className="text-[11px] text-stone-500">oldest {formatDay(c.oldest_record)}</p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[11px] text-stone-500" title={c?.note ?? undefined}>
                            {countsLoading && !c ? '…' : c?.note ? 'n/a' : '—'}
                          </span>
                        )}
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>
                        {c?.tracked ? (
                          <span className={cn(past > 0 ? 'font-bold text-amber-800' : 'text-stone-500')}>
                            {past}
                            {c.cutoff ? (
                              <p className="text-[11px] font-normal text-stone-500">before {formatDay(c.cutoff)}</p>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-500">{c?.note ?? '—'}</span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className={cn(td, 'text-center')}>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            aria-label={`Edit ${r.record_type}`}
                            title="Edit rule"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil size={15} />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setForm(null)
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-h-[92vh] w-[calc(100vw-1rem)] max-w-xl gap-0 p-0')}
        >
          <div className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="relative min-w-0 flex-1 text-left">
              <DialogTitle className="truncate text-base font-semibold text-white">
                Retention · {editing?.record_type}
              </DialogTitle>
            </DialogHeader>
            <DialogClose
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border !border-red-600 !bg-red-600 !text-white"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
            </DialogClose>
          </div>
          {form ? (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-stone-50 px-4 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="ret-years">Years</Label>
                  <Input
                    id="ret-years"
                    type="number"
                    step="0.5"
                    min={MIN_RETENTION_YEARS}
                    max={100}
                    className={limsFieldClass}
                    value={form.years}
                    onChange={(e) => setForm({ ...form, years: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-starts">Retention starts from</Label>
                  <Input
                    id="ret-starts"
                    className={limsFieldClass}
                    value={form.starts}
                    onChange={(e) => setForm({ ...form, starts: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ret-legal">Legal / normative basis</Label>
                <Textarea
                  id="ret-legal"
                  className={cn(limsFieldClass, 'min-h-[60px]')}
                  value={form.legal}
                  onChange={(e) => setForm({ ...form, legal: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ret-disposal">Disposal method</Label>
                <Textarea
                  id="ret-disposal"
                  className={cn(limsFieldClass, 'min-h-[60px]')}
                  value={form.disposal}
                  onChange={(e) => setForm({ ...form, disposal: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ret-owner">Owner</Label>
                  <Input
                    id="ret-owner"
                    className={limsFieldClass}
                    value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  />
                </div>
                <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Rule in use
                </label>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ret-remarks">Remarks</Label>
                <Textarea
                  id="ret-remarks"
                  className={cn(limsFieldClass, 'min-h-[48px]')}
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </div>
              {formError ? (
                <p role="alert" className="border border-red-600/50 bg-red-50 px-3 py-2 text-[13px] text-red-900">
                  {formError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t-2 border-stone-500 bg-stone-50 px-4 py-3">
            <Button type="button" className={cn('h-9', limsPrimaryBtnClass)} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Save rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
