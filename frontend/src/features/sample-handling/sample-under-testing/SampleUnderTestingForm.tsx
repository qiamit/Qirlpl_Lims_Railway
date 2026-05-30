import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { TestAllocationRow } from '../types'

export type UnderTestingFormState = {
  testStartDate: string
  results: string
  testEndDate: string
}

export function SampleUnderTestingForm({
  row,
  initial,
  onSave,
  onClose,
}: {
  row: TestAllocationRow
  initial: UnderTestingFormState
  onSave: (state: UnderTestingFormState) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<UnderTestingFormState>(initial)

  useEffect(() => {
    setForm(initial)
  }, [initial])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  const toDateInput = (v: string | null | undefined) =>
    v ? new Date(v).toISOString().slice(0, 10) : ''

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-muted-foreground mb-2">
        Section: <span className="font-medium text-foreground">{row.sectionCode}</span>
        {row.srfNumber && ` · SRF: ${row.srfNumber}`}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="under-testing-start">Test Start Date</Label>
        <Input
          id="under-testing-start"
          type="date"
          value={form.testStartDate || toDateInput(row.testStartDate)}
          onChange={(e) => setForm((f) => ({ ...f, testStartDate: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="under-testing-results">Results</Label>
        <Textarea
          id="under-testing-results"
          rows={4}
          placeholder="Enter test results..."
          value={form.results}
          onChange={(e) => setForm((f) => ({ ...f, results: e.target.value }))}
          className="resize-y"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="under-testing-end">Test End Date</Label>
        <Input
          id="under-testing-end"
          type="date"
          value={form.testEndDate || toDateInput(row.testEndDate)}
          onChange={(e) => setForm((f) => ({ ...f, testEndDate: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
