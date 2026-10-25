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
import { cn } from '@/lib/utils'
import { nextNcId, NC_RISK_LEVELS, type NcRiskLevel, type NcWorkRecordRow } from '@/features/nonconforming-work/records/types'
import { EnvSelect, Field, MessageLine } from '@/features/environment/EnvironmentUi'
import { envErrorText, NC_RECORDS_PATH } from '@/features/environment/shared'

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

export type RaiseNcRequest = {
  /** Shown under the dialog title. */
  subtitle: string
  description: string
  equipmentOrActivity: string
  sourceArea: 'Testing' | 'Calibration' | 'Sample Handling' | 'Other'
  detectedAt: string
  defaultRisk?: NcRiskLevel
  actionsPlaceholder?: string
}

export type CreatedNc = { id: string; nc_id: string }

/**
 * "Raise NC" (ISO/IEC 17025 7.10), same approach as the environment page:
 * creates an Open nonconforming work record prefilled from the request, then
 * calls `link` so the caller stores nc_record_id on its own row. When linking
 * fails (e.g. the link column is not on this database yet) the NC stays and
 * the message says so.
 */
export function RaiseNcRecordDialog({
  request,
  onClose,
  link,
}: {
  request: RaiseNcRequest | null
  onClose: () => void
  /** Store the link; return a message to show instead of "linked" (or null). */
  link: (nc: CreatedNc) => Promise<string | null>
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
    if (!request) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setDone(null)
      setError(null)
      setActions('')
      setRisk(request.defaultRisk ?? 'Medium')
      setDescription(request.description)
      setNcId('')
    })
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
  }, [request])

  const create = async () => {
    if (!request || busy || !ncId || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      let id = ncId
      let created: CreatedNc | null = null
      for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
        const { data, error: insErr } = await supabase
          .from('nc_work_records')
          .insert({
            nc_id: id,
            detected_at: request.detectedAt,
            reported_by_employee_id: user?.id ?? null,
            reported_by_name: profileName || user?.email || null,
            source_area: request.sourceArea,
            equipment_or_activity: request.equipmentOrActivity,
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
          if (insErr.code === '23505') {
            id = bumpNcId(id)
            continue
          }
          throw insErr
        }
        created = data as CreatedNc
      }
      if (!created) throw new Error('Could not find a free NC number. Open Nonconforming Work Records and add it there.')
      setNcId(created.nc_id)
      let note: string | null = null
      try {
        note = await link(created)
      } catch (err) {
        note = `NC ${created.nc_id} was created but could not be linked: ${envErrorText(err)}`
      }
      setDone(note ?? `NC ${created.nc_id} created and linked.`)
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Raise nonconforming work (7.10)</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">{request?.subtitle ?? ''}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          {done ? (
            <div className="space-y-3">
              <MessageLine tone={/could not|not linked|not stored/i.test(done) ? 'info' : 'ok'} text={done} />
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
                <Field label="Risk level" htmlFor="rnc-risk">
                  <EnvSelect id="rnc-risk" value={risk} onChange={(v) => setRisk(v as NcRiskLevel)}>
                    {NC_RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
              </div>
              <Field label="Description" htmlFor="rnc-desc">
                <Textarea
                  id="rnc-desc"
                  rows={7}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-none border-stone-500 bg-white text-base sm:text-sm"
                />
              </Field>
              <Field label="Immediate action taken (optional)" htmlFor="rnc-actions">
                <Textarea
                  id="rnc-actions"
                  rows={2}
                  value={actions}
                  placeholder={request?.actionsPlaceholder ?? 'e.g. testing stopped, results since the last good check held'}
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
