/**
 * After a deploy, a tab opened before it still asks for the old build's screen
 * files. They no longer exist (404, "Failed to fetch dynamically imported
 * module"), so the screen would stay blank. Vite reports that as
 * `vite:preloadError`; reload once to load the new build.
 *
 * A reload within the last 30 seconds means the file is missing for another
 * reason (offline, a broken deploy): then the error is left to surface instead
 * of reloading in a loop. Without sessionStorage there is no guard, so no reload.
 */
const LAST_RELOAD_KEY = 'qirlpl-stale-chunk-reload-at'
const GUARD_MS = 30_000

export function reloadOnStaleChunk() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0)
      if (Date.now() - last < GUARD_MS) return
      sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()))
    } catch {
      return
    }
    event.preventDefault()
    console.warn('[deploy] screen file from an older build is gone; reloading once')
    window.location.reload()
  })
}
