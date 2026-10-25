/**
 * PostgREST / Postgres errors that mean "this migration is not applied yet".
 * Screens use them to hide new sections and to retry saves without new
 * columns, so they behave as before until the migration runs.
 */

type PgLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined

function text(e: NonNullable<PgLikeError>): string {
  return `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase()
}

/** Table / view is missing (42P01, PGRST205). */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as NonNullable<PgLikeError>
  const code = String(e.code ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  const t = text(e)
  return (t.includes('relation') && t.includes('does not exist')) || t.includes('could not find the table')
}

/** A column in the select or payload is missing (PGRST204, 42703). */
export function isMissingColumnErr(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as NonNullable<PgLikeError>
  const code = String(e.code ?? '')
  if (code === 'PGRST204' || code === '42703') return true
  const t = text(e)
  return t.includes('column') && (t.includes('schema cache') || t.includes('does not exist'))
}

/** RPC function is missing (PGRST202, 42883). */
export function isMissingFunctionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as NonNullable<PgLikeError>
  const code = String(e.code ?? '')
  if (code === 'PGRST202' || code === '42883') return true
  const t = text(e)
  return t.includes('could not find the function') || (t.includes('function') && t.includes('does not exist'))
}

/** Any of the above. */
export function isMissingSchemaError(err: unknown): boolean {
  return isMissingTableError(err) || isMissingColumnErr(err) || isMissingFunctionError(err)
}

/** Readable message from a Supabase / Postgres error. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as NonNullable<PgLikeError>
  return [e.message, e.details, e.hint].filter(Boolean).join(' | ') || 'Unknown error'
}
