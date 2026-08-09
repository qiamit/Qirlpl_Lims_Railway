import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ManagementDocumentRow } from './types'
import {
  createEmptySection,
  parseDraftContent,
  serializeDraftContent,
  type DraftSectionLevel,
} from './draftDocumentModel'
import { DraftSectionRichEditor } from './DraftSectionRichEditor'

type FormBlock = {
  key: string
  level: DraftSectionLevel
  sectionNo: string
  title: string
  body: string
}

function newBlockKey(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const emptyBlock = (): FormBlock => ({
  key: newBlockKey(),
  level: 1,
  sectionNo: '',
  title: '',
  body: '',
})

function LevelSelect({
  id,
  value,
  onChange,
  label,
}: {
  id: string
  value: DraftSectionLevel
  onChange: (v: DraftSectionLevel) => void
  label: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as DraftSectionLevel)}
      >
        <option value={1}>Level 1</option>
        <option value={2}>Level 2</option>
        <option value={3}>Level 3</option>
        <option value={4}>Level 4</option>
      </select>
    </div>
  )
}

export function ManagementDocumentDraftDialog({
  open,
  row,
  saving,
  message,
  onOpenChange,
  onSave,
}: {
  open: boolean
  row: ManagementDocumentRow | null
  saving: boolean
  message: string | null
  onOpenChange: (open: boolean) => void
  onSave: (content: string) => void | Promise<void>
}) {
  const [formBlocks, setFormBlocks] = useState<FormBlock[]>([emptyBlock()])
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) return
    const doc = parseDraftContent(row.draft_content)
    if (doc.sections.length > 0) {
      setFormBlocks(
        doc.sections.map((s) => ({
          key: newBlockKey(),
          level: s.level,
          sectionNo: s.sectionNo,
          title: s.title,
          body: s.body,
        })),
      )
    } else {
      setFormBlocks([emptyBlock()])
    }
    setFormError(null)
  }, [open, row])

  const updateFormBlock = (key: string, patch: Partial<FormBlock>) => {
    setFormBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  }

  const handleAddFormBlock = () => {
    setFormBlocks((prev) => [...prev, emptyBlock()])
  }

  const handleDeleteFormBlock = (key: string) => {
    setFormBlocks((prev) => {
      if (prev.length <= 1) return [emptyBlock()]
      return prev.filter((b) => b.key !== key)
    })
  }

  const handleSaveAndClose = () => {
    const invalid = formBlocks.some((b) => !b.title.trim() && !b.sectionNo.trim())
    if (invalid) {
      setFormError('Each section needs Section No or Section Title.')
      return
    }

    const nextSections = formBlocks.map((b) =>
      createEmptySection({
        level: b.level,
        sectionNo: b.sectionNo.trim(),
        title: b.title.trim() || 'Untitled',
        body: b.body,
      }),
    )

    setFormError(null)
    void onSave(serializeDraftContent({ version: 1, sections: nextSections }))
  }

  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          'fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none',
          'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:rounded-none',
          '[&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100',
        )}
      >
        <div className="relative shrink-0 bg-slate-900 px-5 py-4 text-white sm:px-6">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <DialogHeader className="text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                Document Drafting
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {row.doc_number}
              </DialogTitle>
              <p className="text-sm text-slate-300">{row.title}</p>
            </DialogHeader>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-slate-500 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={handleAddFormBlock}
              aria-label="Add section"
            >
              <Plus size={14} />
              Add Section
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fafbfc]">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4 md:p-5">
            {formBlocks.map((block, index) => (
              <div
                key={block.key}
                className={cn(
                  'flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 p-4 shadow-sm sm:p-5',
                  formBlocks.length === 1 ? 'min-h-[55vh]' : '',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Section {formBlocks.length > 1 ? index + 1 : ''}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteFormBlock(block.key)}
                    aria-label={`Delete section ${index + 1}`}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <LevelSelect
                    id={`draft-section-level-${block.key}`}
                    label="Level of Section"
                    value={block.level}
                    onChange={(level) => updateFormBlock(block.key, { level })}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`draft-section-no-${block.key}`}>Section No</Label>
                    <Input
                      id={`draft-section-no-${block.key}`}
                      value={block.sectionNo}
                      onChange={(e) => updateFormBlock(block.key, { sectionNo: e.target.value })}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`draft-section-title-${block.key}`}>Section Title</Label>
                    <Input
                      id={`draft-section-title-${block.key}`}
                      value={block.title}
                      onChange={(e) => updateFormBlock(block.key, { title: e.target.value })}
                      placeholder="e.g. Scope"
                    />
                  </div>
                </div>
                <DraftSectionRichEditor
                  id={`draft-section-text-${block.key}`}
                  label="Section Text"
                  value={block.body}
                  onChange={(body) => updateFormBlock(block.key, { body })}
                  placeholder="Write section content…"
                  fillHeight={formBlocks.length === 1}
                  minHeightClass="min-h-[200px] sm:min-h-[260px]"
                  aiContext={`Document ${row.doc_number}: ${row.title}. Section ${block.sectionNo} ${block.title}`.trim()}
                />
              </div>
            ))}

            {formError ? <p className="shrink-0 text-sm text-destructive">{formError}</p> : null}
            {message ? <p className="shrink-0 text-sm text-destructive">{message}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white px-5 py-3 sm:px-6">
          <Button type="button" size="sm" disabled={saving} onClick={handleSaveAndClose}>
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
