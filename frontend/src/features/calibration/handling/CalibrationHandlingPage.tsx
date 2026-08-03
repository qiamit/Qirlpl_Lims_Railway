import { Construction, Gauge } from 'lucide-react'

/**
 * Calibration Handling — workflow hub (parallel to Sample Handling).
 * Stage pages will be added under this module as the calibration LIMS flow is built out.
 */
export default function CalibrationHandlingPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/10 ring-1 ring-teal-500/20">
          <Gauge size={28} className="text-teal-700" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">Calibration Handling</h1>
          <p className="text-sm text-muted-foreground">ISO 17025:2017 — Clause 7.7</p>
        </div>
        <p className="text-sm text-muted-foreground/80">
          This module will manage the calibration job workflow (receiving through certificate
          issue). Stages are under development.
        </p>
        <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Construction size={14} aria-hidden />
          Coming soon
        </div>
      </div>
    </div>
  )
}
