import { useState } from 'react'
import { QrCode, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { printEquipmentLabels, type EquipmentLabelItem, type EquipmentLabelLayout } from './equipmentLabels'

/**
 * "Labels" (A4 sheet, 3 x 8) and "Large label" (one per page) for the selected
 * rows (ISO/IEC 17025 6.4.8). Available to every user of the page, not only
 * the Laboratory Director.
 */
export function EquipmentLabelButtons({
  getItems,
  selectedCount,
  disabled = false,
  className,
  onError,
}: {
  /** Label data for the selected rows, built when a button is clicked. */
  getItems: () => EquipmentLabelItem[]
  selectedCount: number
  disabled?: boolean
  className?: string
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const off = disabled || busy || selectedCount === 0

  const run = (layout: EquipmentLabelLayout) => {
    const items = getItems()
    if (items.length === 0) return
    setBusy(true)
    void printEquipmentLabels(items, layout)
      .catch((err: unknown) => {
        onError?.(err instanceof Error ? err.message : 'Could not print the labels.')
      })
      .finally(() => setBusy(false))
  }

  const hint = selectedCount === 0 ? 'Select equipment rows first' : undefined
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn('gap-1', className)}
        disabled={off}
        title={hint ?? 'Status labels with QR code, A4 sheet of 3 x 8 (63.5 x 33.9 mm)'}
        onClick={() => run('sheet')}
      >
        <Tag size={14} />
        Labels
      </Button>
      <Button
        type="button"
        variant="outline"
        className={cn('gap-1', className)}
        disabled={off}
        title={hint ?? 'One large status label with QR code per selected item'}
        onClick={() => run('large')}
      >
        <QrCode size={14} />
        Large label
      </Button>
    </>
  )
}
