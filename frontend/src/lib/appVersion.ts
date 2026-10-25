/**
 * Version (build id) of the running LIMS, for change control and validation
 * records (ISO/IEC 17025 7.11.2).
 *
 * VITE_APP_VERSION wins when it is set at build time (for example "1.4.0").
 * Otherwise the short git commit injected by vite.config.ts (__APP_COMMIT__).
 */

declare const __APP_COMMIT__: string | undefined
declare const __APP_BUILT_AT__: string | undefined

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Short git commit of this build, or 'unknown'. */
export const APP_COMMIT: string =
  (typeof __APP_COMMIT__ !== 'undefined' ? clean(__APP_COMMIT__) : '') || 'unknown'

/** ISO time the bundle was built, or null (dev server / tests). */
export const APP_BUILT_AT: string | null =
  (typeof __APP_BUILT_AT__ !== 'undefined' ? clean(__APP_BUILT_AT__) : '') || null

/** The version to record: VITE_APP_VERSION, else the commit. */
export const APP_VERSION: string = clean(import.meta.env.VITE_APP_VERSION) || APP_COMMIT

/** "1.4.0 (a46340b)" or "a46340b". */
export function appVersionLabel(): string {
  return APP_VERSION !== APP_COMMIT && APP_COMMIT !== 'unknown' ? `${APP_VERSION} (${APP_COMMIT})` : APP_VERSION
}

/** Commit when it looks like a git sha (for the commit_sha columns), else null. */
export function appCommitSha(): string | null {
  return /^[0-9a-f]{7,40}$/.test(APP_COMMIT) ? APP_COMMIT : null
}
