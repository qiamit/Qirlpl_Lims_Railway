/* Applies the saved app theme before the app renders (no flash of the wrong
 * theme). Loaded synchronously from <head> in index.html. It lives in a file,
 * not an inline <script>, so the Content-Security-Policy can drop
 * script-src 'unsafe-inline' (security plan S-19). Keep the behaviour in step
 * with src/lib/appTheme.ts. */
;(function () {
  try {
    var key = 'qirlpl.appTheme'
    var pref = localStorage.getItem(key) || 'light'
    var builtins = {
      light: 1,
      dark: 1,
      system: 1,
      ocean: 1,
      forest: 1,
      steel: 1,
      copper: 1,
      teal: 1,
      rose: 1,
    }
    var isCustom = pref.indexOf('custom_') === 0
    if (!builtins[pref] && !isCustom) pref = 'light'
    var resolved = pref
    if (pref === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    document.documentElement.setAttribute('data-app-theme-pref', pref)
    if (isCustom) {
      document.documentElement.setAttribute('data-app-theme', 'custom')
      document.documentElement.setAttribute('data-custom-theme-id', pref)
      try {
        var list = JSON.parse(localStorage.getItem('qirlpl.customThemes') || '[]')
        var found = Array.isArray(list)
          ? list.find(function (t) { return t && t.id === pref })
          : null
        if (found && found.mode === 'dark') document.documentElement.classList.add('dark')
        else document.documentElement.classList.remove('dark')
      } catch (e2) {
        document.documentElement.classList.remove('dark')
      }
    } else {
      document.documentElement.setAttribute('data-app-theme', resolved)
      document.documentElement.removeAttribute('data-custom-theme-id')
      if (resolved === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    }
  } catch (e) {}
})()
