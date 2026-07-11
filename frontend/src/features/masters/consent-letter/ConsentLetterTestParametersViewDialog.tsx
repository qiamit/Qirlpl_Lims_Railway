import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ConsentLetterListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function ConsentLetterTestParametersViewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: ConsentLetterListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const names = row?.testParameterNames ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Parameters</DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {fmt(row.consentLetterNo)} · {fmt(row.isCodeLabel)}
            </p>
            {names.length === 0 ? (
              <p className="text-muted-foreground">No test parameters recorded.</p>
            ) : (
              <ol className="list-decimal space-y-1.5 pl-5">
                {names.map((name) => (
                  <li key={name} className="break-words">
                    {name}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
