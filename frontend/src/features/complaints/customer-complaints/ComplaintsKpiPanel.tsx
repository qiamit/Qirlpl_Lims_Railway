import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react'
import { MiniTrendBars } from '@/components/lims/MiniTrendBars'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { isMissingColumnErr } from '@/lib/missingSchema'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  computeComplaintKpis,
  computeSatisfactionKpis,
  lastMonths,
  type ComplaintKpiInput,
  type FeedbackKpiInput,
} from './complaintKpis'

const STORAGE_KEY = 'complaints.kpiPanel.open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[9rem] border border-stone-300 bg-stone-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-xl font-bold tabular-nums text-stone-900">{value}</div>
      {hint ? <div className="text-[11px] text-stone-500">{hint}</div> : null}
    </div>
  )
}

/**
 * KPI panel for the complaints register (ISO/IEC 17025 7.9, 8.6; gap P3-6):
 * complaints per month, average days to acknowledge / close, satisfaction
 * trend from customer feedback. Read-only; uses the existing tables.
 */
export function ComplaintsKpiPanel() {
  const [open, setOpen] = useState(readOpen)
  const [complaints, setComplaints] = useState<ComplaintKpiInput[]>([])
  const [feedback, setFeedback] = useState<FeedbackKpiInput[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    void (async () => {
      const cRes = await supabase
        .from('customer_complaints')
        .select('received_at, acknowledged_at, closed_at, status')
      let fRes = await supabase.from('customer_feedback').select('received_at, feedback_type, satisfaction_rating')
      if (fRes.error && isMissingColumnErr(fRes.error)) {
        fRes = (await supabase.from('customer_feedback').select('received_at, feedback_type')) as typeof fRes
      }
      if (cancelled) return
      setComplaints(cRes.error ? [] : ((cRes.data ?? []) as ComplaintKpiInput[]))
      setFeedback(fRes.error ? [] : ((fRes.data ?? []) as FeedbackKpiInput[]))
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [open, loaded])

  const months = useMemo(() => lastMonths(12), [])
  const ck = useMemo(() => computeComplaintKpis(complaints, months), [complaints, months])
  const sk = useMemo(() => computeSatisfactionKpis(feedback, months), [feedback, months])
  const days = (v: number | null) => (v === null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)} d`)
  const satFmt = (v: number) => (sk.basis === 'rating' ? `${v.toFixed(1)} / 5` : `${Math.round(v)} %`)

  return (
    <section className="mx-auto w-full max-w-[1600px] px-3 pt-3 sm:px-4" aria-label="Complaint KPIs">
      <div className={cn(limsPanelClass, 'bg-card')}>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <BarChart3 size={15} className="text-amber-700" />
          <span className="text-sm font-semibold text-stone-900">Complaint &amp; satisfaction KPIs</span>
          <span className="text-xs text-stone-500">last 12 months · ISO/IEC 17025 7.9, 8.6 (input to management review)</span>
        </button>
        {open ? (
          <div className="space-y-3 border-t border-stone-300 px-3 py-3">
            {!loaded ? <p className="text-sm text-stone-600">Loading…</p> : null}
            {loaded ? (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <Tile label="Complaints" value={String(ck.total)} hint={`${ck.open} open now`} />
                  <Tile label="Avg. to acknowledge" value={days(ck.avgDaysToAcknowledge)}
                    hint={`${ck.acknowledgedCount} acknowledged`} />
                  <Tile label="Avg. to close" value={days(ck.avgDaysToClose)} hint={`${ck.closedCount} closed`} />
                  <Tile
                    label={sk.basis === 'rating' ? 'Avg. satisfaction' : 'Praise share'}
                    value={sk.overall === null ? '—' : satFmt(sk.overall)}
                    hint={sk.basis === 'praise_ratio' ? 'Praise ÷ (Praise + Concern)' : sk.basis === 'rating' ? 'Rating 1 – 5' : 'No feedback yet'}
                  />
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Complaints per month</div>
                    <MiniTrendBars
                      ariaLabel="Complaints received per month, last 12 months"
                      points={months.map((m, i) => ({ label: m.label, value: ck.complaintsPerMonth[i] }))}
                      height={56}
                      formatValue={(v) => String(Math.round(v))}
                    />
                  </div>
                  {sk.basis !== 'none' ? (
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {sk.basis === 'rating' ? 'Avg. satisfaction per month' : 'Praise share per month'}
                      </div>
                      <MiniTrendBars
                        ariaLabel={sk.basis === 'rating' ? 'Average satisfaction rating per month' : 'Share of praise in feedback per month'}
                        points={months.map((m, i) => ({
                          label: m.label,
                          value: sk.perMonth[i],
                          note: sk.counts[i] ? `${sk.counts[i]} response${sk.counts[i] === 1 ? '' : 's'}` : undefined,
                        }))}
                        height={56}
                        formatValue={satFmt}
                      />
                    </div>
                  ) : null}
                </div>
                <button type="button" className="text-xs font-medium text-amber-800 hover:underline"
                  onClick={() => setShowTable((s) => !s)}>
                  {showTable ? 'Hide table' : 'Show as table'}
                </button>
                {showTable ? (
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-xs">
                      <thead>
                        <tr className="bg-stone-800 text-[10px] uppercase tracking-wide text-amber-200">
                          <th className="px-2 py-1 text-left">Month</th>
                          <th className="px-2 py-1 text-right">Complaints</th>
                          <th className="px-2 py-1 text-right">{sk.basis === 'rating' ? 'Avg. rating' : 'Praise %'}</th>
                          <th className="px-2 py-1 text-right">Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m, i) => (
                          <tr key={m.key} className="border-t border-stone-200">
                            <td className="px-2 py-0.5">{m.label}</td>
                            <td className="px-2 py-0.5 text-right tabular-nums">{ck.complaintsPerMonth[i]}</td>
                            <td className="px-2 py-0.5 text-right tabular-nums">
                              {sk.perMonth[i] === null ? '—' : satFmt(sk.perMonth[i] as number)}
                            </td>
                            <td className="px-2 py-0.5 text-right tabular-nums">{sk.counts[i]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
