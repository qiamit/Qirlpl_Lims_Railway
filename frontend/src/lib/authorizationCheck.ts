import { toast } from 'sonner'
import type { AskReason } from '@/hooks/useReasonForChange'
import { supabase } from '@/lib/supabaseClient'

/**
 * ISO/IEC 17025 6.2.5 f / 6.2.6: check a person against the Authorization
 * Matrix (personnel_authorizations, migration 20261027100400) before they are
 * assigned to a lab activity.
 *
 * Rules
 *   - Migration not applied, RPC error or no person chosen: no check at all.
 *   - Person authorized: go ahead silently.
 *   - Not authorized and the matrix is NOT in use for that activity yet (no
 *     active grant of that activity for anyone): warn and ask for a reason;
 *     anyone may continue. The reason goes to authorization_exceptions ('warn').
 *   - Not authorized and the matrix IS in use for that activity: blocked.
 *     Only the Laboratory Director may override, with a reason
 *     (authorization_exceptions 'override').
 */

export type AuthorizationActivity =
  | 'perform_test'
  | 'review_results'
  | 'sign_report'
  | 'give_opinion'
  | 'calibrate'
  | 'sign_certificate'
  | 'develop_method'
  | 'validate_method'

export const AUTHORIZATION_ACTIVITIES: ReadonlyArray<{
  value: AuthorizationActivity
  label: string
  short: string
  /** Verb phrase for messages: "is not authorized to …". */
  verb: string
}> = [
  { value: 'perform_test', label: 'Perform tests', short: 'Test', verb: 'perform' },
  { value: 'review_results', label: 'Review results', short: 'Review', verb: 'review results of' },
  { value: 'sign_report', label: 'Sign test reports', short: 'Sign rpt', verb: 'sign test reports for' },
  { value: 'give_opinion', label: 'Opinions & interpretations', short: 'Opinion', verb: 'give opinions on' },
  { value: 'calibrate', label: 'Perform calibrations', short: 'Calibrate', verb: 'calibrate' },
  { value: 'sign_certificate', label: 'Sign calibration certificates', short: 'Sign cert', verb: 'sign calibration certificates for' },
  { value: 'develop_method', label: 'Develop / modify methods', short: 'Develop', verb: 'develop methods for' },
  { value: 'validate_method', label: 'Validate / verify methods', short: 'Validate', verb: 'validate methods for' },
]

export function authorizationActivityLabel(activity: string): string {
  return AUTHORIZATION_ACTIVITIES.find((a) => a.value === activity)?.label ?? activity
}

export type AuthorizationCheckResult =
  | { state: 'off' }
  | { state: 'authorized'; enforced: boolean }
  | {
      state: 'unauthorized'
      enforced: boolean
      holdsActivity: boolean
      missingTestParameterIds: string[]
      missingCalibrationScopeIds: string[]
    }

export type AuthorizationCheckInput = {
  userId: string | null | undefined
  activity: AuthorizationActivity
  testParameterIds?: ReadonlyArray<string | null | undefined>
  calibrationScopeIds?: ReadonlyArray<string | null | undefined>
  /** yyyy-mm-dd; default today (database date). */
  on?: string | null
}

function cleanIds(ids: ReadonlyArray<string | null | undefined> | undefined): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return [...new Set((ids ?? []).map((v) => String(v ?? '').trim()).filter((v) => uuid.test(v)))]
}

function isMissingRpc(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST202' || err.code === '42883' || err.code === '42P01' || err.code === 'PGRST205') return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    (msg.includes('app_authorization_check') || msg.includes('personnel_authorizations')) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  )
}

/** Never throws; 'off' whenever the check cannot be made. */
export async function checkAuthorization(input: AuthorizationCheckInput): Promise<AuthorizationCheckResult> {
  const userId = String(input.userId ?? '').trim()
  if (!userId) return { state: 'off' }
  try {
    const { data, error } = await supabase.rpc('app_authorization_check', {
      p_user: userId,
      p_activity: input.activity,
      p_test_parameter_ids: cleanIds(input.testParameterIds),
      p_calibration_scope_ids: cleanIds(input.calibrationScopeIds),
      ...(input.on ? { p_on: input.on } : {}),
    })
    if (error) {
      if (!isMissingRpc(error)) console.warn('[authorizationCheck] check skipped', error)
      return { state: 'off' }
    }
    const j = (data ?? null) as {
      enforced?: boolean
      authorized?: boolean
      holds_activity?: boolean
      missing_test_parameter_ids?: string[]
      missing_calibration_scope_ids?: string[]
    } | null
    if (!j || typeof j !== 'object') return { state: 'off' }
    const enforced = j.enforced === true
    if (j.authorized === true) return { state: 'authorized', enforced }
    return {
      state: 'unauthorized',
      enforced,
      holdsActivity: j.holds_activity === true,
      missingTestParameterIds: Array.isArray(j.missing_test_parameter_ids) ? j.missing_test_parameter_ids : [],
      missingCalibrationScopeIds: Array.isArray(j.missing_calibration_scope_ids) ? j.missing_calibration_scope_ids : [],
    }
  } catch (err) {
    console.warn('[authorizationCheck] check skipped', err)
    return { state: 'off' }
  }
}

async function labelsFor(
  testParameterIds: string[],
  scopeIds: string[],
  known: Record<string, string> | undefined,
): Promise<string[]> {
  const out = new Map<string, string>()
  const needTp = testParameterIds.filter((id) => !known?.[id])
  const needCs = scopeIds.filter((id) => !known?.[id])
  for (const id of [...testParameterIds, ...scopeIds]) if (known?.[id]) out.set(id, known[id])
  try {
    if (needTp.length) {
      const { data } = await supabase.from('test_parameters').select('id, item_name').in('id', needTp)
      for (const r of (data ?? []) as Array<{ id: string; item_name: string | null }>) {
        out.set(r.id, (r.item_name ?? '').trim() || r.id)
      }
    }
    if (needCs.length) {
      const { data } = await supabase.from('calibration_nabl_scope').select('id, s_no, measurand').in('id', needCs)
      for (const r of (data ?? []) as Array<{ id: string; s_no: number | null; measurand: string | null }>) {
        out.set(r.id, `${r.s_no ?? ''} ${(r.measurand ?? '').trim()}`.trim() || r.id)
      }
    }
  } catch {
    /* labels are cosmetic */
  }
  return [...testParameterIds, ...scopeIds].map((id) => out.get(id) ?? 'unknown line')
}

export type AuthorizationGate =
  | {
      proceed: true
      /** Call after the save succeeded; records the exception (if any). Never throws. */
      record: (recordId?: string | null) => Promise<void>
    }
  | {
      proceed: false
      /** null = the user cancelled the reason dialog. */
      message: string | null
    }

export type AuthorizationGateInput = AuthorizationCheckInput & {
  personName?: string | null
  /** Laboratory Director may override a block. */
  actorIsDirector: boolean
  /** Names for parameter / scope ids (looked up when missing). */
  targetLabels?: Record<string, string>
  /** Where the assignment is saved, for the exception log. */
  recordTable?: string
  recordId?: string | null
  recordLabel?: string | null
}

const NOOP_GATE: AuthorizationGate = { proceed: true, record: async () => {} }

/**
 * Check, then warn / block / let the Director override as described above.
 * Use with useReasonForChange():
 *
 *   const gate = await gateAuthorization(askReason, { userId, activity: 'perform_test', ... })
 *   if (!gate.proceed) { if (gate.message) showError(gate.message); return }
 *   await save()
 *   await gate.record(savedId)
 */
export async function gateAuthorization(ask: AskReason, input: AuthorizationGateInput): Promise<AuthorizationGate> {
  const result = await checkAuthorization(input)
  if (result.state !== 'unauthorized') return NOOP_GATE

  const activity = AUTHORIZATION_ACTIVITIES.find((a) => a.value === input.activity)
  const person = (input.personName ?? '').trim() || 'This person'
  const missingLabels = await labelsFor(
    result.missingTestParameterIds,
    result.missingCalibrationScopeIds,
    input.targetLabels,
  )
  const what = missingLabels.length ? missingLabels.join(', ') : 'any scope'
  const verb = activity?.verb ?? input.activity
  const sentence = `${person} is not on the Authorization Matrix to ${verb} ${what}.`

  if (result.enforced && !input.actorIsDirector) {
    return {
      proceed: false,
      message: `${sentence} Ask the Quality Manager to update the Authorization Matrix, or the Laboratory Director to override.`,
    }
  }

  const mode: 'warn' | 'override' = result.enforced ? 'override' : 'warn'
  const reason = await ask(
    mode === 'override'
      ? {
          title: 'Override authorization (Laboratory Director)',
          recordLabel: input.recordLabel ? `${input.recordLabel} · ${activity?.label ?? input.activity}` : activity?.label,
          description: `${sentence} Overriding is recorded with your reason (ISO/IEC 17025 6.2.6).`,
          confirmLabel: 'Override',
          quickPicks: ['Authorization renewal in progress', 'Under direct supervision', 'Urgent job; authorized person on leave'],
        }
      : {
          title: 'Not on the Authorization Matrix',
          recordLabel: input.recordLabel ? `${input.recordLabel} · ${activity?.label ?? input.activity}` : activity?.label,
          description: `${sentence} The matrix is not in use for this activity yet, so you may continue; your reason is recorded for the Quality Manager.`,
          confirmLabel: 'Continue',
          quickPicks: ['Authorization matrix being prepared', 'Under supervision', 'Only competent person available'],
        },
  )
  if (!reason) return { proceed: false, message: null }

  return {
    proceed: true,
    record: async (recordId?: string | null) => {
      try {
        const { error } = await supabase.from('authorization_exceptions').insert({
          activity: input.activity,
          user_id: String(input.userId ?? '').trim() || null,
          user_name: (input.personName ?? '').trim() || null,
          test_parameter_ids: result.missingTestParameterIds,
          calibration_scope_ids: result.missingCalibrationScopeIds,
          mode,
          reason,
          record_table: input.recordTable ?? null,
          record_id: String(recordId ?? input.recordId ?? '').trim() || null,
          record_label: (input.recordLabel ?? '').trim() || null,
        })
        if (error) throw error
      } catch (err) {
        console.warn('[authorizationCheck] exception not recorded', err)
        toast.warning('Saved, but the authorization exception could not be recorded.', {
          description: err instanceof Error ? err.message : (err as { message?: string })?.message,
        })
      }
    },
  }
}
