import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SECTION_CODE_LENGTH,
  sanitizeSectionCodeInput,
} from '@/features/sample-handling/allocation/sectionCode'
import { updateReportSectionCode } from './reportResultRows'

export type ReportSectionCodeEditTarget = {
  sectionCode: string
  sampleAllocationId: string
  testAllocationId: string
}

export function ReportSectionCodeEditDialog({
  open,
  onOpenChange,
  sampleId,
  target,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  target: ReportSectionCodeEditTarget | null
  onSaved: (oldCode: string, newCode: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !target) return
    setValue(sanitizeSectionCodeInput(target.sectionCode === '—' ? '' : target.sectionCode))
    setError(null)
  }, [open, target])

  const handleSave = () => {
    if (!target || !sampleId?.trim()) return
    void (async () => {
      setSaving(true)
      setError(null)
      try {
        const newCode = await updateReportSectionCode({
          sampleId,
          sampleAllocationId: target.sampleAllocationId,
          testAllocationId: target.testAllocationId,
          currentSectionCode: target.sectionCode,
          newSectionCode: value,
        })
        onSaved(target.sectionCode, newCode)
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update section code.')
      } finally {
        setSaving(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Section Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Update only the section code number. Other section details are unchanged.
          </p>
          <div className="space-y-2">
            <Label htmlFor="report-section-code">Section Code</Label>
            <Input
              id="report-section-code"
              value={value}
              onChange={(e) => setValue(sanitizeSectionCodeInput(e.target.value))}
              maxLength={SECTION_CODE_LENGTH}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-wide"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Alphanumeric, up to {SECTION_CODE_LENGTH} characters.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !value.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
