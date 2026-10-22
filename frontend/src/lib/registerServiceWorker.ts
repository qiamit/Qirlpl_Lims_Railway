import { toast } from 'sonner'

/**
 * Registers `/sw.js` in production builds so the app is installable as a PWA.
 * When a new deploy is waiting, offers a one-click reload instead of switching
 * versions under an open form.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  let updateAccepted = false

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        const promptUpdate = (worker: ServiceWorker) => {
          toast('A new version of QIRLPL LIMS is available.', {
            duration: Infinity,
            action: {
              label: 'Reload',
              onClick: () => {
                updateAccepted = true
                worker.postMessage({ type: 'SKIP_WAITING' })
              },
            },
          })
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting)
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(worker)
            }
          })
        })

        // Long-lived tabs: look for a new deploy every hour.
        window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
      })
      .catch((error) => console.warn('[pwa] service worker registration failed', error))

    // The first install also fires controllerchange (clients.claim); only an
    // update replacing an existing worker, or one the user accepted, reloads.
    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if ((!hadController && !updateAccepted) || reloading) return
      reloading = true
      window.location.reload()
    })
  })
}
