/**
 * Metallography analysis worker (design 3.1 item 2). Module worker loaded by
 * engines/runEngine.ts with
 *   new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
 * CSP `worker-src 'self'` already allows it.
 *
 * Receives an EngineRequest, runs the engine, posts one EngineResponse with
 * the same id. Errors become { ok: false, error } (never an unhandled throw).
 * Phase 1: ring edge detection only; ring maths is cheap and runs inline.
 */
import { detectRing } from './ringTest/detectRing'
import type { EngineRequest, EngineResponse } from './types'

/** The worker global, typed without the WebWorker lib (tsconfig.app uses DOM). */
type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null
  postMessage: (message: EngineResponse) => void
}

const scope = self as unknown as WorkerScope

function handle(req: EngineRequest): EngineResponse {
  try {
    switch (req.type) {
      case 'detectRing':
        return { id: req.id, ok: true, type: 'detectRing', result: detectRing(req.image, req.opts) }
      default:
        return { id: (req as { id: string }).id, ok: false, error: 'Unknown analysis request.' }
    }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : 'The analysis failed.' }
  }
}

scope.onmessage = (event) => {
  const req = event.data
  if (!req || typeof req !== 'object' || typeof req.id !== 'string') return
  scope.postMessage(handle(req))
}
