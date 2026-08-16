import { Construction, Truck } from 'lucide-react'

/** Shared placeholder shell for Externally Providers modules (ISO 17025 §6.6). */
export function ExternallyProvidersModulePlaceholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
          <Truck size={28} className="text-amber-800" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Externally Providers · ISO 17025 §6.6
          </p>
        </div>
        <p className="text-sm text-muted-foreground/80">{description}</p>
        <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Construction size={14} aria-hidden />
          Module active — screens under development
        </div>
      </div>
    </div>
  )
}
