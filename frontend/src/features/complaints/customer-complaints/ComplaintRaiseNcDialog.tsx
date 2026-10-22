import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { insertNcRecord, suggestNcId } from '@/features/nonconforming-work/records/raiseNcRecord'
import { NC_RISK_LEVELS, type NcRiskLevel } from '@/features/nonconforming-work/records/types'
import { formatDateTimeDisplay, formatSupabaseError } from '../shared'
import type { ComplaintRow } from './types'

const NC_RECORDS_PATH = '/nonconforming-work/records'

/**
 * "Raise NC" for a complaint (ISO/IEC 17025 7.9 -> 7.10 / 8.7): creates an
 * Open nonconforming work record prefilled from the complaint and links it on
 * customer_complaints.nc_record_id. The corrective action is then tracked on
 * the NC in the CAPA register.
 */
export function ComplaintRaiseNcDialog({
  complaint,
  onClose,
  onLinked,
}: {
  complaint: ComplaintRow | null
  onClose: () => void
  onLinked: (complaintId: string, nc: { id: string; nc_id: string }) => void
}) {
  const { user, profileName } = useAuth()
  const [ncId, setNcId] = useState('')
  const [description, setDescription] = useState('')
  const [risk, setRisk] = useState<NcRiskLevel>('Medium')
  const [capaRequired, setCapaRequired] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!complaint) return
    let cancelled = false
    setDone(null)
    setError(null)
    setRisk('Medium')
    setCapaRequired(true)
    const who = [complaint.complainant_name, complaint.complainant_org].filter((v) => v && v.trim()).join(', ')
    setDescription(
      `Customer complaint ${complaint.complaint_id} (${formatDateTimeDisplay(complaint.received_at)}${who ? `, ${who}` : ''}): ${complaint.description}`.trim(),
    )
    setNcId('')
    void suggestNcId()
      .then((id) => {
        if (!cancelled) setNcId(id)
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not suggest an NC number: ${formatSupabaseError(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [complaint])

  const create = async () => {
    if (!complaint || busy || !ncId || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await insertNcRecord(ncId, {
        detected_at: new Date().toISOString(),
        reported_by_employee_id: user?.id ?? null,
        reported_by_name: profileName || user?.email || null,
        source_area: 'Other',
        equipment_or_activity: `Customer complaint ${complaint.complaint_id}${complaint.related_activity ? ` — ${complaint.related_activity}` : ''}`,
        description: description.trim(),
        risk_level: risk,
        acceptability_decision: 'pending',
        status: capaRequired ? 'CAPA Required' : 'Open',
        corrective_action_required: capaRequired,
        created_by: user?.id ?? null,
      })
      const { error: linkErr } = await supabase
        .from('customer_complaints')
        .update({ nc_record_id: created.id })
        .eq('id', complaint.id)
      if (linkErr) {
        throw new Error(`NC ${created.nc_id} was created but could not be linked to the complaint: ${formatSupabaseError(linkErr)}`)
      }
      setNcId(created.nc_id)
      setDone(created.nc_id)
      onLinked(complaint.id, created)
    } catch (err) {
      setError(err instanceof Error ? err.message : formatSupabaseError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={complaint !== null} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Raise nonconforming work from complaint</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              Creates an NC record for {complaint?.complaint_id ?? 'this complaint'} and links it to the complaint (7.9 → 7.10).
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          {done ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-emerald-700">NC {done} created and linked to the complaint.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild className={limsOutlineBtnClass} variant="outline">
                  <Link to={NC_RECORDS_PATH}>Open Nonconforming Work Records</Link>
                </Button>
                <Button className={limsPrimaryBtnClass} onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>NC ID</Label>
                  <div className="flex h-9 items-center border border-stone-400 bg-stone-100 px-2 font-mono text-sm">
                    {ncId || <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cc-nc-risk">Risk level</Label>
                  <select
                    id="cc-nc-risk"
                    value={risk}
                    onChange={(e) => setRisk(e.target.value as NcRiskLevel)}
                    className="h-9 w-full rounded-none border border-stone-400 bg-white px-2 text-sm"
                  >
                    {NC_RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-nc-desc">Description</Label>
                <Textarea
                  id="cc-nc-desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-none border-stone-500 bg-white text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  checked={capaRequired}
                  onChange={(e) => setCapaRequired(e.target.checked)}
                  className="h-4 w-4 rounded-none border-stone-500"
                />
                Corrective action required (tracked in the CAPA register)
              </label>
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  className={limsPrimaryBtnClass}
                  onClick={() => void create()}
                  disabled={busy || !ncId || !description.trim()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create NC
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
