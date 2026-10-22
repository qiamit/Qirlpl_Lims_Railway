/* "Try again" on the offline page; a file rather than an inline onclick so the
 * Content-Security-Policy can drop script-src 'unsafe-inline'. */
;(function () {
  var button = document.getElementById('offline-retry')
  if (button) {
    button.addEventListener('click', function () {
      location.reload()
    })
  }
})()
