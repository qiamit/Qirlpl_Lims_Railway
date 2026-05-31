import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { deleteAiSkill, fetchAiSkills, upsertAiSkill } from './aiSettingsApi'
import { emptyAiSkillForm, type AiSkillForm, type AiSkillRow } from './types'

function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

export function AiSkillsPanel() {
  const [rows, setRows] = useState<AiSkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AiSkillForm>(emptyAiSkillForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchAiSkills())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditId(null)
    setForm(emptyAiSkillForm())
    setDialogOpen(true)
  }

  const openEdit = (row: AiSkillRow) => {
    setEditId(row.id)
    setForm({
      name: row.name,
      description: row.description ?? '',
      instructions: row.instructions,
      triggerKeywords: (row.trigger_keywords ?? []).join(', '),
      isEnabled: row.is_enabled,
      sortOrder: row.sort_order,
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        if (!form.name.trim()) throw new Error('Skill name is required')
        if (!form.instructions.trim()) throw new Error('Instructions are required')

        await upsertAiSkill(
          {
            name: form.name.trim(),
            description: form.description.trim() || null,
            instructions: form.instructions.trim(),
            trigger_keywords: parseKeywords(form.triggerKeywords),
            is_enabled: form.isEnabled,
            sort_order: form.sortOrder,
          },
          editId,
        )

        setMessage('Skill saved.')
        setDialogOpen(false)
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save skill')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (row: AiSkillRow) => {
    if (!window.confirm(`Delete skill "${row.name}"?`)) return
    void (async () => {
      try {
        await deleteAiSkill(row.id)
        setMessage('Skill deleted.')
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to delete skill')
      }
    })()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Skills are reusable instruction sets (like Cursor skills) the AI can follow for LIMS tasks.
        </p>
        <Button type="button" size="sm" className="gap-2 shrink-0" onClick={openCreate}>
          <Plus size={14} />
          Add Skill
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className={message.toLowerCase().includes('unable') || message.toLowerCase().includes('required') ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading skills…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No skills yet. Add skills for report drafting, ISO compliance checks, sample summaries, etc.
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-center">Keywords</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                    {r.description || '—'}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {(r.trigger_keywords ?? []).length > 0
                      ? (r.trigger_keywords ?? []).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.is_enabled ? 'default' : 'outline'}>
                      {r.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label="Edit skill" onClick={() => openEdit(r)}>
                        <Pencil size={16} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Delete skill" onClick={() => handleDelete(r)}>
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Skill' : 'Add Skill'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="skill-name">Skill name</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. ISO Report Review"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-desc">Short description</Label>
              <Input
                id="skill-desc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="When to use this skill"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-keywords">Trigger keywords (comma-separated)</Label>
              <Input
                id="skill-keywords"
                value={form.triggerKeywords}
                onChange={(e) => setForm((p) => ({ ...p, triggerKeywords: e.target.value }))}
                placeholder="report, NABL, certificate"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-instructions">Instructions (markdown)</Label>
              <Textarea
                id="skill-instructions"
                className="min-h-[200px] font-mono text-xs"
                value={form.instructions}
                onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
                placeholder="Step-by-step rules the AI must follow…"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm((p) => ({ ...p, isEnabled: e.target.checked }))}
                />
                Enabled
              </label>
              <div className="flex items-center gap-2 text-sm">
                <Label htmlFor="skill-order" className="shrink-0">
                  Sort order
                </Label>
                <Input
                  id="skill-order"
                  type="number"
                  className="w-20"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
