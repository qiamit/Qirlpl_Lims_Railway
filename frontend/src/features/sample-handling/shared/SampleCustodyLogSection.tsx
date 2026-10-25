import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import { getSampleWorkflowStatusLabel } from '@/features/sample-handling/sampleWorkflowStatus'
import type { SampleStage } from '@/features/sample-handling/types'

/**
 * Sample custody log (ISO/IEC 17025 7.4): one entry per stage change, written
 * by the database (migration 20261029100300) with who handed the sample on.
 * The next holder can acknowledge receipt once. Hidden before the migration.
 */
type CustodyEntry = {
  id: string
  fromStage: string | null
  toStage: string
  handedByName: string | null
  handedBy: string | null
  receivedByName: string | null
  receivedAt: string | null
  at: string
  remarks: string | null
}

const stageLabel = (stage: string | null) =>
  stage
    ? getSampleWorkflowStatusLabel({ stage: stage as SampleStage, sample_receiving_status: null, status: null })
    : '—'

function mapEntry(r: Record<string, unknown>): CustodyEntry {
  return {
    id: String(r.id),
    fromStage: (r.from_stage as string | null) ?? null,
    toStage: String(r.to_stage ?? ''),
    handedBy: (r.handed_by as string | null) ?? null,
    handedByName: (r.handed_by_name as string | null) ?? null,
    receivedByName: (r.received_by_name as string | null) ?? null,
    receivedAt: (r.received_at as string | null) ?? null,
    at: String(r.at ?? ''),
    remarks: (r.remarks as string | null) ?? null,
  }
}

export function SampleCustodyLogSection({ sampleId }: { sampleId: string | null }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<CustodyEntry[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    try {
      const { data, error: err } = await supabase
        .from('sample_custody_log')
        .select('*')
        .eq('sample_id', id)
        .order('at', { ascending: true })
      // Table missing (migration not applied) or not readable: hide the section.
      if (err) {
        setEntries(null)
        return
      }
      setEntries(((data ?? []) as Array<Record<string, unknown>>).map(mapEntry))
    } catch {
      setEntries(null)
    }
  }, [])

  useEffect(() => {
    setEntries(null)
    setError(null)
    if (sampleId) void load(sampleId)
  }, [sampleId, load])

  if (!sampleId || entries === null) return null

  const acknowledge = async (entry: CustodyEntry) => {
    const remarks = window.prompt(`Acknowledge receipt (${stageLabel(entry.toStage)}). Remarks (optional):`, '')
    if (remarks === null) return
    setBusyId(entry.id)
    setError(null)
    try {
      // received_by / received_at are set by the database from the signed-in user.
      const { error: err } = await supabase
        .from('sample_custody_log')
        .update({ received_by: user?.id ?? null, remarks: remarks.trim() || null })
        .eq('id', entry.id)
      if (err) throw err
      await load(sampleId)
    } catch (err) {
      setError((err as { message?: string })?.message || 'Could not acknowledge.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="overflow-hidden border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/15 xl:col-span-2">
      <div className="border-b border-stone-500 bg-stone-800 px-4 py-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">Custody Log (ISO/IEC 17025 7.4)</h4>
      </div>
      <div className="bg-[#f7f3eb] p-3">
        {entries.length === 0 ? (
          <p className="text-sm text-stone-500">No hand-overs recorded yet (logging starts once the custody log is enabled).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-stone-800 text-[10.5px] uppercase tracking-wide text-amber-200">
                  <th className="border border-stone-700 px-2 py-1">When</th>
                  <th className="border border-stone-700 px-2 py-1">From → To</th>
                  <th className="border border-stone-700 px-2 py-1">Handed over by</th>
                  <th className="border border-stone-700 px-2 py-1">Received by</th>
                  <th className="border border-stone-700 px-2 py-1">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} className={cn(i % 2 === 0 ? 'bg-white' : 'bg-[#fffcf7]')}>
                    <td className="border border-stone-300 px-2 py-1 whitespace-nowrap">{formatDateTime(e.at)}</td>
                    <td className="border border-stone-300 px-2 py-1">
                      {e.fromStage ? `${stageLabel(e.fromStage)} → ` : ''}
                      <span className="font-semibold">{stageLabel(e.toStage)}</span>
                    </td>
                    <td className="border border-stone-300 px-2 py-1">{e.handedByName || '—'}</td>
                    <td className="border border-stone-300 px-2 py-1">
                      {e.receivedByName ? (
                        <>
                          {e.receivedByName}
                          {e.receivedAt ? <span className="block text-stone-500">{formatDateTime(e.receivedAt)}</span> : null}
                        </>
                      ) : e.handedBy && e.handedBy === user?.id ? (
                        <span className="text-stone-500">Awaiting receipt</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'h-6 px-2 text-[11px]')}
                          disabled={busyId !== null}
                          onClick={() => void acknowledge(e)}
                        >
                          {busyId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Acknowledge receipt
                        </Button>
                      )}
                    </td>
                    <td className="border border-stone-300 px-2 py-1">{e.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  )
}
