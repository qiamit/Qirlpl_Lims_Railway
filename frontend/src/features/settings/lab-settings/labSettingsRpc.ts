/**
 * Lab Settings writes go through RPCs (security plan S-16,
 * 20261029100100_user_admin_lab_settings.sql):
 *   save_lab_settings(p)            Laboratory Director only, core fields.
 *   save_report_templates(key, p)   any known staff, template JSON only.
 * After that migration, direct UPDATE of lab_settings is Director only. Until
 * it is applied the RPCs do not exist, so callers fall back to the old direct
 * write.
 */
import { supabase } from '@/lib/supabaseClient'
import { sanitizeTemplateJson, stripMarkup } from '@/lib/sanitizeHtml'

export type LabTemplateSettingKey = 'report_scope_templates' | 'print_settings' | 'document_templates'

type RpcError = { code?: string; message?: string; details?: string; hint?: string } | null

/** True when PostgREST says the function is not on the database (migration not applied). */
export function isMissingRpcError(error: RpcError): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    text.includes('could not find the function') ||
    (text.includes('function') && text.includes('does not exist'))
  )
}

function toError(error: NonNullable<RpcError>, fallback: string): Error {
  return new Error(error.message || fallback)
}

/** Core Lab Settings fields; text values are stripped of markup first. */
export async function saveLabSettingsCore(
  partial: Record<string, unknown>,
  fallback: (payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(partial)) {
    payload[k] = typeof v === 'string' ? stripMarkup(v) : v
  }
  const { error } = await supabase.rpc('save_lab_settings', { p: payload })
  if (!error) return
  if (isMissingRpcError(error)) {
    await fallback(payload)
    return
  }
  throw toError(error, 'Unable to save Lab Settings.')
}

/**
 * Template JSON (report scope bindings, print settings, finance document
 * templates). Markup is stripped from every string before saving.
 * Returns the saved document.
 */
export async function saveLabTemplateSetting<T>(
  key: LabTemplateSettingKey,
  value: T,
  fallback: (clean: T) => Promise<T>,
): Promise<T> {
  const clean = sanitizeTemplateJson(value)
  const { data, error } = await supabase.rpc('save_report_templates', { p_key: key, p: clean })
  if (!error) return (data ?? clean) as T
  if (isMissingRpcError(error)) return fallback(clean)
  throw toError(error, 'Unable to save template settings.')
}
