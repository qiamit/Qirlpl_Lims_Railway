/* Print pop-ups and print iframes load this file instead of an inline
 * window.print() script, so the Content-Security-Policy can drop
 * script-src 'unsafe-inline' (security plan S-19). Opens the print dialog once
 * the document (and its images) has loaded. */
;(function () {
  function printNow() {
    setTimeout(function () {
      try {
        window.focus()
        window.print()
      } catch (e) {}
    }, 250)
  }
  if (document.readyState === 'complete') printNow()
  else window.addEventListener('load', printNow)
})()
