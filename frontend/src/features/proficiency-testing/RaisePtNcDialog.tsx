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
import { cn, formatDate } from '@/lib/utils'
import { nextNcId, NC_RISK_LEVELS, type NcRiskLevel, type NcWorkRecordRow } from '@/features/nonconforming-work/records/types'
import { EnvSelect, Field, MessageLine } from '@/features/environment/EnvironmentUi'
import { NC_RECORDS_PATH, PT_PERFORMANCE_LABEL, fmtScore, fmtValue, participationDate, ptErrorText, type PtParticipation } from './ptShared'

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

function ptNcDescription(p: PtParticipation): string {
  const where = [p.discipline, p.sub_discipline].filter(Boolean).join(' › ')
  const scores = [
    p.z_score !== null ? `z = ${fmtScore(p.z_score)}` : null,
    p.en_score !== null ? `En = ${fmtScore(p.en_score)}` : null,
    p.zeta_score !== null ? `zeta = ${fmtScore(p.zeta_score)}` : null,
  ].filter(Boolean)
  const lines = [
    `${p.performance ? PT_PERFORMANCE_LABEL[p.performance] : 'Unsatisfactory'} proficiency testing result (ISO/IEC 17025 7.7.2 / 7.7.3).`,
    `Scheme ${p.scheme_name || '—'}, round ${p.round_code || '—'}, provider ${p.provider_name || '—'}, reported ${formatDate(participationDate(p))}.`,
    `${where ? `${where}: ` : ''}${p.parameter}${p.method ? ` by ${p.method}` : ''}.`,
    `Lab result ${fmtValue(p.lab_result)} ${p.unit ?? ''}, assigned value ${fmtValue(p.assigned_value)} ${p.unit ?? ''}${
      p.sd_for_pt !== null ? `, SD for PT ${fmtValue(p.sd_for_pt)}` : ''
    }.`.replace(/\s+,/g, ','),
  ]
  if (scores.length) lines.push(`Scores: ${scores.join(', ')}.`)
  if (p.analyst_name) lines.push(`Analyst: ${p.analyst_name}.`)
  lines.push('Investigate root cause; review results reported for customers since the last satisfactory PT (7.10.1).')
  return lines.join('\n')
}

/**
 * "Raise NC" for an unsatisfactory (or questionable) PT result: creates an
 * Open nonconforming work record and links it on pt_participations.nc_record_id.
 */
export function RaisePtNcDialog({
  participation,
  onClose,
  onLinked,
}: {
  participation: PtParticipation | null
  onClose: () => void
  onLinked: (id: string, nc: { id: string; nc_id: string }) => void
}) {
  const { user, profileName } = useAuth()
  const [ncId, setNcId] = useState('')
  const [description, setDescription] = useState('')
  const [actions, setActions] = useState('')
  const [risk, setRisk] = useState<NcRiskLevel>('High')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!participation) return
    let cancelled = false
    setDone(null)
    setError(null)
    setActions('')
    setRisk(participation.performance === 'unsatisfactory' ? 'High' : 'Medium')
    setDescription(ptNcDescription(participation))
    setNcId('')
    void suggestNcId()
      .then((id) => {
        if (!cancelled) setNcId(id)
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not suggest an NC number: ${ptErrorText(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [participation])

  const create = async () => {
    const p = participation
    if (!p || busy || !ncId || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      let id = ncId
      let created: { id: string; nc_id: string } | null = null
      for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
        const { data, error: insErr } = await supabase
          .from('nc_work_records')
          .insert({
            nc_id: id,
            detected_at: p.reported_on ? `${p.reported_on}T12:00:00` : new Date().toISOString(),
            reported_by_employee_id: user?.id ?? null,
            reported_by_name: profileName || user?.email || null,
            source_area: p.scope_kind === 'calibration' ? 'Calibration' : 'Testing',
            equipment_or_activity: `Proficiency testing — ${p.scheme_name || p.provider_name || 'PT'}${p.round_code ? ` round ${p.round_code}` : ''} · ${p.parameter}`,
            description: description.trim(),
            risk_level: risk,
            actions_taken: actions.trim() || null,
            acceptability_decision: 'pending',
            status: 'Open',
            corrective_action_required: true,
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
        created = data as { id: string; nc_id: string }
      }
      if (!created) throw new Error('Could not find a free NC number. Open Nonconforming Work Records and add it there.')
      const { error: linkErr } = await supabase.from('pt_participations').update({ nc_record_id: created.id }).eq('id', p.id)
      if (linkErr) {
        throw new Error(`NC ${created.nc_id} was created but could not be linked to the PT result: ${ptErrorText(linkErr)}`)
      }
      setNcId(created.nc_id)
      setDone(created.nc_id)
      onLinked(p.id, created)
    } catch (err) {
      setError(ptErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={participation !== null} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-xl flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Raise nonconforming work (7.10)</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              Creates an Open NC record for this PT result and links it. Corrective action is marked as required.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="max-h-[75vh] min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          {done ? (
            <div className="space-y-3">
              <MessageLine tone="ok" text={`NC ${done} created and linked to the PT result.`} />
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
                <Field label="Risk level" htmlFor="pt-nc-risk">
                  <EnvSelect id="pt-nc-risk" value={risk} onChange={(v) => setRisk(v as NcRiskLevel)}>
                    {NC_RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
              </div>
              <Field label="Description" htmlFor="pt-nc-desc">
                <Textarea
                  id="pt-nc-desc"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-none border-stone-500 bg-white text-base sm:text-sm"
                />
              </Field>
              <Field label="Immediate action taken (optional)" htmlFor="pt-nc-actions">
                <Textarea
                  id="pt-nc-actions"
                  rows={2}
                  value={actions}
                  placeholder="e.g. Reporting of this parameter stopped pending investigation"
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
