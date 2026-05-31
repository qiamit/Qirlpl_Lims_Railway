import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SampleHandlingDeleteButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="destructive"
      disabled={disabled}
      onClick={onClick}
      aria-label="Delete selected"
    >
      <Trash2 size={16} /> Delete
    </Button>
  )
}
