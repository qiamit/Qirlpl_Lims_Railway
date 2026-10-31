/**
 * Runs a metallography engine in the analysis worker and resolves with its
 * response (design 3.1 item 2).
 *
 * One module worker is shared by the page and started on first use. Requests
 * are matched by id, so several can be in flight. A worker crash or a
 * timeout stops the worker and rejects every pending request; the next call
 * starts a fresh worker.
 *
 * The image is copied to the worker (structured clone), not transferred, so
 * the caller's GrayImage stays usable.
 */
import type { EngineRequest, EngineResponse } from './types'

type OkResponse = EngineResponse & { ok: true }

type Pending = {
  resolve: (res: OkResponse) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

/** A detection on a 25 MP image takes a few seconds; anything far beyond that is a hang. */
const ENGINE_TIMEOUT_MS = 120_000

let worker: Worker | null = null
const pending = new Map<string, Pending>()
let seq = 0

function nextId(): string {
  seq += 1
  return `mg-${Date.now().toString(36)}-${seq}`
}

function failAll(message: string): void {
  for (const [id, p] of pending) {
    if (p.timer) clearTimeout(p.timer)
    pending.delete(id)
    p.reject(new Error(message))
  }
}

function getWorker(): Worker {
  if (worker) return worker
  if (typeof Worker === 'undefined') throw new Error('This browser cannot run the image analysis (no Web Worker support).')
  const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (event: MessageEvent<EngineResponse>) => {
    const res = event.data
    const p = res && pending.get(res.id)
    if (!p) return
    pending.delete(res.id)
    if (p.timer) clearTimeout(p.timer)
    if (res.ok) p.resolve(res)
    else p.reject(new Error(res.error || 'The analysis failed.'))
  }
  w.onerror = (event: ErrorEvent) => {
    event.preventDefault()
    w.terminate()
    if (worker === w) worker = null
    failAll(event.message ? `The image analysis stopped: ${event.message}` : 'The image analysis stopped unexpectedly.')
  }
  w.onmessageerror = () => {
    failAll('The image analysis returned data that could not be read.')
  }
  worker = w
  return w
}

/**
 * Sends one request to the analysis worker. Resolves with the ok response;
 * rejects with an Error (plain-English message) when the engine reports a
 * problem, the worker fails or it does not answer within 2 minutes.
 */
export function runEngine(req: Omit<EngineRequest, 'id'>): Promise<OkResponse> {
  return new Promise<OkResponse>((resolve, reject) => {
    let w: Worker
    try {
      w = getWorker()
    } catch (err) {
      reject(err instanceof Error ? err : new Error('The image analysis could not start.'))
      return
    }
    const id = nextId()
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      const message = 'The image analysis took too long. Try a smaller image.'
      reject(new Error(message))
      // The worker may still be stuck in that computation: stop it so later
      // requests start a fresh worker instead of queueing behind it.
      if (worker === w) {
        w.terminate()
        worker = null
        failAll(message)
      }
    }, ENGINE_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      w.postMessage({ ...req, id } as EngineRequest)
    } catch (err) {
      pending.delete(id)
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error('The image could not be sent for analysis.'))
    }
  })
}

/** Stops the shared worker (e.g. on sign-out); pending requests are rejected. */
export function stopEngineWorker(): void {
  if (!worker) return
  worker.terminate()
  worker = null
  failAll('The image analysis was stopped.')
}
