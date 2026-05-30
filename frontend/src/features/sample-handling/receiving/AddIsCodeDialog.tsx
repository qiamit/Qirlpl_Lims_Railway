import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { emptyIsCodeForm, type IsCodeForm } from '@/features/masters/is-codes/types'
import { IsCodesForm } from '@/features/masters/is-codes/IsCodesForm'

export function AddIsCodeDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (id: string) => void
}) {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [form, setForm] = useState<IsCodeForm>(emptyIsCodeForm)
  const [aspects, setAspects] = useState<Array<{ id: string; label: string }>>([{ id: 'default-spec', label: 'Specification' }])
  const [aspectDialogOpen, setAspectDialogOpen] = useState(false)
  const [newAspect, setNewAspect] = useState('')

  useEffect(() => {
    if (!open) return
    const load = async () => {
      try {
        const { data, error } = await supabase.from('is_codes').select('aspect')
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const uniq = new Map<string, { id: string; label: string }>()
        list.forEach((r: { aspect?: string }) => {
          const a = (r.aspect ?? 'Specification').trim()
          if (a && !uniq.has(a.toLowerCase())) uniq.set(a.toLowerCase(), { id: `aspect-${a}`, label: a })
        })
        setAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
      } catch {
        setAspects([{ id: 'default-spec', label: 'Specification' }])
      }
    }
    load()
  }, [open])

  const onAddAspect = async () => {
    const name = newAspect.trim()
    if (!name) return
    setAspects((prev) => {
      const merged = [...prev, { id: `new-${name}`, label: name }]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
    })
    setForm((prev) => ({ ...prev, aspect: name }))
    setNewAspect('')
    setAspectDialogOpen(false)
  }
  const onDeleteAspect = () => {}
  const onPickFiles = () => {}
  const onOpenFiles = () => {}

  const handleSave = async () => {
    setSaveMessage(null)
    setSaveLoading(true)
    try {
      const payload = {
        is_number: form.isNumber.trim(),
        revision_year: form.revisionYear.trim() || null,
        reaffirmation_year: form.reaffirmationYear.trim() || null,
        amendment_number: form.amendmentNumber.trim() || null,
        title: form.title.trim(),
        aspect: form.aspect,
        testing_charges: form.testingCharges ? Number(form.testingCharges) : null,
        remarks: form.remarks.trim() || null,
      }
      const { data, error } = await supabase.from('is_codes').insert(payload).select('id').single()
      if (error) throw error
      const id = (data as { id: string } | null)?.id
      if (id) {
        onSaved(id)
        onOpenChange(false)
        setForm(emptyIsCodeForm())
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save IS Code')
    } finally {
      setSaveLoading(false)
    }
  }

  const canSave = form.isNumber.trim().length > 0 && form.title.trim().length > 0 && !saveLoading

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[66vw] max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add new IS Code (same as IS Code Directory form)</DialogTitle>
        </DialogHeader>
        {saveMessage && <p className="text-sm text-destructive">{saveMessage}</p>}
        <div className="max-h-[70vh] overflow-y-auto pr-2">
          <IsCodesForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            onClear={() => setForm(emptyIsCodeForm())}
            onPickFiles={onPickFiles}
            onOpenFiles={onOpenFiles}
            aspectOptions={aspects}
            aspectDialogOpen={aspectDialogOpen}
            setAspectDialogOpen={setAspectDialogOpen}
            newAspect={newAspect}
            setNewAspect={setNewAspect}
            onAddAspect={onAddAspect}
            onDeleteAspect={onDeleteAspect}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || saveLoading}>{saveLoading ? 'Saving…' : 'Save IS Code'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
