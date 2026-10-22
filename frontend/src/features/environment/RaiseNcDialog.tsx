import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { fetchDeletedKeys } from '@/lib/softDelete'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import { nextNcId, NC_RISK_LEVELS, type NcRiskLevel, type NcWorkRecordRow } from '@/features/nonconforming-work/records/types'
import { EnvSelect, Field, MessageLine } from './EnvironmentUi'
import { envErrorText, NC_RECORDS_PATH, ncDescriptionFor, type EnvironmentReading, type LabArea } from './shared'

/** Next NCW-YYYY-NNNN, skipping numbers of live and deleted NC records. */
async function suggestNcId(): Promise<string> {
  const prefix = `NCW-${new Date().getFullYear()}-`
  const [{ data, error }, deleted] = await Promise.all([
    supabase.from('nc_work_records').select('nc_id').like('nc_id', `${prefix}%`),
    fetchDeletedKeys('nc_work_records', 'nc_id'),
  ])
  if (error) throw error
  return nextNcId((data ?? []) as NcWorkRecordRow[], deleted)
}

function bumpNcId(id: string): string {
  const m = id.match(/^(.*-)(\d+)$/)
  if (!m) return id
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`
}

/**
 * "Raise NC" for an out-of-limit reading (ISO/IEC 17025 6.3.3 -> 7.10):
 * creates an Open nonconforming work record prefilled with the area, reading
 * and limits, then links it back on environment_readings.nc_record_id.
 */
export function RaiseNcDialog({
  reading,
  area,
  loggerLabel,
  onClose,
  onLinked,
}: {
  reading: EnvironmentReading | null
  area: LabArea | null
  loggerLabel?: string
  onClose: () => void
  onLinked: (readingId: string, nc: { id: string; nc_id: string }) => void
}) {
  const { user, profileName } = useAuth()
  const [ncId, setNcId] = useState('')
  const [description, setDescription] = useState('')
  const [actions, setActions] = useState('')
  const [risk, setRisk] = useState<NcRiskLevel>('Medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!reading) return
    let cancelled = false
    setDone(null)
    setError(null)
    setActions('')
    setRisk('Medium')
    setDescription(ncDescriptionFor(reading, area, formatDateTime(reading.recorded_at)))
    setNcId('')
    void suggestNcId()
      .then((id) => {
        if (!cancelled) setNcId(id)
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not suggest an NC number: ${envErrorText(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [reading, area])

  const create = async () => {
    if (!reading || busy || !ncId || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const where = area ? `${area.code} — ${area.name}` : reading.limit_snapshot?.area_code ?? ''
      let id = ncId
      let created: { id: string; nc_id: string } | null = null
      for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
        const { data, error: insErr } = await supabase
          .from('nc_work_records')
          .insert({
            nc_id: id,
            detected_at: reading.recorded_at,
            reported_by_employee_id: user?.id ?? null,
            reported_by_name: profileName || user?.email || null,
            source_area: 'Other',
            equipment_or_activity: `Environmental conditions — ${where}${loggerLabel ? ` (logger ${loggerLabel})` : ''}`,
            description: description.trim(),
            risk_level: risk,
            actions_taken: actions.trim() || null,
            acceptability_decision: 'pending',
            status: 'Open',
            corrective_action_required: false,
            created_by: user?.id ?? null,
          })
          .select('id, nc_id')
          .single()
        if (insErr) {
          // Number taken meanwhile (or held by a deleted record): try the next one.
          if (insErr.code === '23505') {
            id = bumpNcId(id)
            continue
          }
          throw insErr
        }
        created = data as { id: string; nc_id: string }
      }
      if (!created) throw new Error('Could not find a free NC number. Open Nonconforming Work Records and add it there.')
      const { error: linkErr } = await supabase
        .from('environment_readings')
        .update({ nc_record_id: created.id })
        .eq('id', reading.id)
      if (linkErr) {
        throw new Error(`NC ${created.nc_id} was created but could not be linked to the reading: ${envErrorText(linkErr)}`)
      }
      setNcId(created.nc_id)
      setDone(created.nc_id)
      onLinked(reading.id, created)
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={reading !== null} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Raise nonconforming work (7.10)</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              Creates an Open NC record for this out-of-limit reading and links it to the reading.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          {done ? (
            <div className="space-y-3">
              <MessageLine tone="ok" text={`NC ${done} created and linked to the reading.`} />
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
                <Field label="NC ID">
                  <div className="flex h-10 items-center border border-stone-400 bg-stone-100 px-2 font-mono text-sm sm:h-8">
                    {ncId || <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </Field>
                <Field label="Risk level" htmlFor="nc-risk">
                  <EnvSelect id="nc-risk" value={risk} onChange={(v) => setRisk(v as NcRiskLevel)}>
                    {NC_RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
              </div>
              <Field label="Description" htmlFor="nc-desc">
                <Textarea
                  id="nc-desc"
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-none border-stone-500 bg-white text-base sm:text-sm"
                />
              </Field>
              <Field label="Immediate action taken (optional)" htmlFor="nc-actions">
                <Textarea
                  id="nc-actions"
                  rows={2}
                  value={actions}
                  placeholder="e.g. AC serviced, testing in the area stopped until conditions recovered"
                  onChange={(e) => setActions(e.target.value)}
                  className="rounded-none border-stone-500 bg-white text-base sm:text-sm"
                />
              </Field>
              <MessageLine tone="error" text={error} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button className={limsPrimaryBtnClass} onClick={() => void create()} disabled={busy || !ncId || !description.trim()}>
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
