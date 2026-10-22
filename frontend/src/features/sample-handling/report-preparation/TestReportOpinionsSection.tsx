import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useReasonForChange } from '@/hooks/useReasonForChange'
import { checkAuthorization, gateAuthorization, type AuthorizationCheckResult } from '@/lib/authorizationCheck'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import { REPORT_PART_HEADING_CLASS, REPORT_PART_OUTER_CLASS } from './reportPartUiClasses'
import { fetchSampleOpinions, OPINIONS_HEADING, type SampleOpinionsState } from './reportOpinions'

/**
 * Opinions and interpretations (ISO/IEC 17025 7.8.7) for the report being
 * prepared. Saved straight to the sample; printed in Part C. Hidden until
 * migration 20261029100300 is applied. Writing is checked against the
 * Authorization Matrix ('give_opinion'): warn while the matrix is not in use,
 * blocked when it is (the Laboratory Director may override with a reason).
 */
export function TestReportOpinionsSection({
  sampleId,
  srfNumber,
  disabled,
}: {
  sampleId: string | null
  srfNumber?: string | null
  disabled?: boolean
}) {
  const { user, profileName, designation } = useAuth()
  const askReason = useReasonForChange()
  const actorIsDirector = isLaboratoryDirector(designation)
  const [state, setState] = useState<SampleOpinionsState | null>(null)
  const [text, setText] = useState('')
  const [basis, setBasis] = useState('')
  const [auth, setAuth] = useState<AuthorizationCheckResult>({ state: 'off' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async (id: string) => {
    const next = await fetchSampleOpinions(id)
    setState(next)
    setText(next.opinions?.text ?? '')
    setBasis(next.opinions?.basis ?? '')
  }, [])

  useEffect(() => {
    setState(null)
    setMessage(null)
    if (!sampleId) return
    void load(sampleId)
  }, [sampleId, load])

  useEffect(() => {
    if (!state?.available || !user?.id) return
    let cancelled = false
    void checkAuthorization({ userId: user.id, activity: 'give_opinion' }).then((r) => {
      if (!cancelled) setAuth(r)
    })
    return () => {
      cancelled = true
    }
  }, [state?.available, user?.id])

  if (!sampleId || !state?.available) return null

  const savedText = state.opinions?.text ?? ''
  const savedBasis = state.opinions?.basis ?? ''
  const dirty = text.trim() !== savedText.trim() || basis.trim() !== savedBasis.trim()
  const blocked = auth.state === 'unauthorized' && auth.enforced && !actorIsDirector
  const missingBasis = text.trim().length > 0 && !basis.trim()

  const save = async () => {
    if (!sampleId || saving || !dirty || missingBasis) return
    setSaving(true)
    setMessage(null)
    try {
      const gate = await gateAuthorization(askReason, {
        userId: user?.id,
        activity: 'give_opinion',
        personName: profileName || user?.email || null,
        actorIsDirector,
        recordTable: 'samples',
        recordId: sampleId,
        recordLabel: srfNumber ? `SRF ${srfNumber}` : null,
      })
      if (!gate.proceed) {
        if (gate.message) setMessage({ tone: 'error', text: gate.message })
        return
      }
      const { error } = await supabase
        .from('samples')
        .update({ opinions_text: text.trim() || null, opinions_basis: basis.trim() || null })
        .eq('id', sampleId)
      if (error) throw error
      await gate.record(sampleId)
      await load(sampleId)
      setMessage({ tone: 'ok', text: 'Opinions and interpretations saved.' })
    } catch (err) {
      setMessage({ tone: 'error', text: (err as { message?: string })?.message || 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'w-full resize-y rounded-none border-stone-400 bg-white text-sm focus-visible:ring-1 focus-visible:ring-amber-500/40'

  return (
    <section className={REPORT_PART_OUTER_CLASS} aria-labelledby="tr-opinions-heading">
      <h3 id="tr-opinions-heading" className={REPORT_PART_HEADING_CLASS}>
        {OPINIONS_HEADING} (ISO/IEC 17025 7.8.7)
      </h3>
      <p className="mb-2 text-xs text-stone-600">
        Optional. Printed in Part C under &ldquo;{OPINIONS_HEADING}&rdquo;, clearly separate from the results. Only a
        person authorized for opinions should write them; state the basis.
      </p>
      {auth.state === 'unauthorized' ? (
        <p
          className={cn(
            'mb-2 border px-2 py-1 text-xs',
            blocked ? 'border-red-700/40 bg-red-50 text-red-900' : 'border-amber-600/40 bg-amber-50 text-amber-900',
          )}
        >
          {blocked
            ? 'You are not on the Authorization Matrix to give opinions and interpretations. Ask the Quality Manager, or the Laboratory Director to write them.'
            : auth.enforced
              ? 'You are not on the Authorization Matrix for opinions; as Laboratory Director you may override with a reason.'
              : 'The Authorization Matrix is not in use for opinions yet: you will be asked for a reason, which is recorded.'}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="tr-opinions-text" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Opinions / interpretations
          </label>
          <Textarea
            id="tr-opinions-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || saving || blocked}
            placeholder="e.g. Based on the results, the concrete is suitable for RCC work as per IS 456."
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="tr-opinions-basis" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Basis {text.trim() ? '*' : ''}
          </label>
          <Textarea
            id="tr-opinions-basis"
            rows={4}
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            disabled={disabled || saving || blocked}
            placeholder="e.g. Part C results compared with IS 456:2000 Table 5; customer's intended use stated on the SRF."
            className={fieldClass}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-600">
          {state.opinions?.byName
            ? `Last written by ${state.opinions.byName}${state.opinions.at ? `, ${formatDateTime(state.opinions.at)}` : ''}`
            : 'Not written yet.'}
          {dirty ? <span className="ml-2 font-semibold text-amber-800">Unsaved changes: save before issuing.</span> : null}
        </p>
        <div className="flex items-center gap-2">
          {message ? (
            <span className={cn('text-xs', message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700')}>{message.text}</span>
          ) : missingBasis ? (
            <span className="text-xs text-red-700">State the basis of the opinion.</span>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={limsPrimaryBtnClass}
            onClick={() => void save()}
            disabled={disabled || saving || blocked || !dirty || missingBasis}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save opinions
          </Button>
        </div>
      </div>
    </section>
  )
}
