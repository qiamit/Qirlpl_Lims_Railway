import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { cn, formatDate } from '@/lib/utils'
import { EnvSelect, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { IndicativeBadge } from '../MetallographyUi'
import { localIsoDate, metallographyErrorText, updateMethod } from '../metallographyApi'
import { ANALYSIS_KIND_LABEL, type MethodVerificationOption, type ParameterMethod } from '../types'

function ReportableBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
      <CheckCircle2 className="h-3 w-3" /> Reportable
    </span>
  )
}

function normRef(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Does the record cover this method (app_metallography_verification_covers)?
 * Same test parameter, or no parameter and the same method reference as the
 * method's standard (case and spacing ignored).
 */
function recordCovers(o: MethodVerificationOption, m: ParameterMethod): boolean {
  if (o.testParameterId) return o.testParameterId === m.testParameterId
  return normRef(m.standardRef) !== '' && normRef(o.methodReference) === normRef(m.standardRef)
}

/** Why a linked record does not make the method reportable (same rule as SQL). */
function notReportableText(o: MethodVerificationOption | undefined, m: ParameterMethod): string {
  if (!o) return 'No method validation record linked.'
  const why: string[] = []
  if (!recordCovers(o, m)) why.push('record is for another parameter or method')
  if (o.status !== 'approved') why.push(`status ${o.status || 'not set'}`)
  if (o.conclusion !== 'fit_for_purpose' && o.conclusion !== 'conditional') why.push(`conclusion ${o.conclusion || 'not set'}`)
  if (o.validUntil && o.validUntil < localIsoDate()) why.push(`expired ${formatDate(o.validUntil)}`)
  return why.length ? `Not reportable: ${why.join(', ')}.` : ''
}

/**
 * S5 Method validation tab: link each mapped method to its method
 * validation / verification record. Without an approved, in-date record the
 * results are Indicative and Non NABL.
 */
export function MethodValidationTab({
  methods,
  options,
  parameterName,
  canManage,
  onChanged,
  onError,
}: {
  methods: ParameterMethod[]
  options: MethodVerificationOption[]
  parameterName: (testParameterId: string) => string
  canManage: boolean
  onChanged: (m: ParameterMethod, message: string) => void
  onError: (text: string) => void
}) {
  const askReason = useReasonForChange()
  const [savingId, setSavingId] = useState<string | null>(null)
  const optionById = new Map(options.map((o) => [o.id, o]))

  /** Records of this parameter, or with no parameter and this method's standard (the database refuses others). */
  const optionsFor = (m: ParameterMethod) => options.filter((o) => recordCovers(o, m) || o.id === m.methodVerificationId)

  const link = async (m: ParameterMethod, value: string) => {
    const next = value || null
    if (next === m.methodVerificationId) return
    const name = parameterName(m.testParameterId)
    let reason: string | null = null
    if (m.methodVerificationId) {
      reason = await askReason({
        title: `Reason for changing the validation record of ${name}`,
        recordLabel: `${name} · ${ANALYSIS_KIND_LABEL[m.analysisKind]}`,
        description: 'New analyses use the new link; analyses already started keep their Indicative flag.',
        confirmLabel: 'Save',
        quickPicks: ['Revalidated', 'Wrong record linked', 'Record withdrawn'],
      })
      if (!reason) return
    }
    setSavingId(m.id)
    try {
      const saved = await updateMethod(m.id, { methodVerificationId: next })
      if (reason) await recordReason('metallography_parameter_methods', m.id, reason)
      onChanged(saved, `${name}: validation record ${next ? 'linked' : 'removed'}.`)
    } catch (err) {
      onError(metallographyErrorText(err))
    } finally {
      setSavingId(null)
    }
  }

  const statusCell = (m: ParameterMethod) => {
    const o = m.methodVerificationId ? optionById.get(m.methodVerificationId) : undefined
    if (o?.reportable && recordCovers(o, m)) return <ReportableBadge />
    return (
      <div className="space-y-0.5">
        <IndicativeBadge />
        <p className="text-[11px] text-stone-600">{notReportableText(o, m)}</p>
      </div>
    )
  }

  const select = (m: ParameterMethod) => (
    <div className="flex items-center gap-1.5">
      <EnvSelect
        ariaLabel={`Validation record for ${parameterName(m.testParameterId)}`}
        value={m.methodVerificationId ?? ''}
        onChange={(v) => void link(m, v)}
        disabled={!canManage || savingId === m.id}
      >
        <option value="">None (Indicative)</option>
        {optionsFor(m).map((o) => (
          <option key={o.id} value={o.id}>
            {o.recordNo} · {o.methodReference || '—'}
            {o.reportable ? '' : ' (not reportable)'}
          </option>
        ))}
      </EnvSelect>
      {savingId === m.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-stone-600">
        A method is reportable when its record is approved, concluded fit for purpose (or conditional) and in date. Until
        then results are marked Indicative and Non NABL.{' '}
        <Link to="/quality/method-verifications" className="inline-flex items-center gap-1 font-semibold text-amber-800 underline">
          Method Verifications <ExternalLink className="h-3 w-3" />
        </Link>
      </p>

      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {methods.map((m) => (
          <div key={m.id} className="space-y-2 border border-stone-400 bg-white p-2.5">
            <div>
              <p className="font-semibold text-stone-900">{parameterName(m.testParameterId)}</p>
              <p className="text-[12px] text-stone-600">
                {ANALYSIS_KIND_LABEL[m.analysisKind]} · {m.standardRef}
                {m.active ? '' : ' · inactive'}
              </p>
            </div>
            {select(m)}
            {statusCell(m)}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={envThClass}>Test parameter</th>
              <th className={envThClass}>Kind</th>
              <th className={envThClass}>Standard</th>
              <th className={cn(envThClass, 'w-[22rem]')}>Method validation record</th>
              <th className={envThClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m, i) => (
              <tr key={m.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                <td className={cn(envTdClass, 'font-semibold')}>
                  {parameterName(m.testParameterId)}
                  {m.active ? null : <span className="ml-1 text-[11px] font-normal text-stone-500">(inactive)</span>}
                </td>
                <td className={envTdClass}>{ANALYSIS_KIND_LABEL[m.analysisKind]}</td>
                <td className={envTdClass}>{m.standardRef}</td>
                <td className={envTdClass}>{select(m)}</td>
                <td className={envTdClass}>{statusCell(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {methods.length === 0 ? (
        <p className="p-4 text-center text-[13px] text-stone-600">No test parameter is mapped yet (Test parameters tab).</p>
      ) : null}
    </div>
  )
}
