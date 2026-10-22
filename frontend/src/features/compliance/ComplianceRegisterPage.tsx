import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'

export type ComplianceRegisterConfig = {
  moduleKey: string
  title: string
  description: string
  personLabel: string
}

type RegisterRow = {
  id: string
  reference_no: string
  title: string
  person_name: string
  status: string
  due_on: string | null
  notes: string
}

const STATUSES = ['Draft', 'Active', 'Closed'] as const

function emptyForm(): RegisterRow {
  return {
    id: '',
    reference_no: '',
    title: '',
    person_name: '',
    status: 'Draft',
    due_on: '',
    notes: '',
  }
}

export function ComplianceRegisterPage({ config }: { config: ComplianceRegisterConfig }) {
  const [rows, setRows] = useState<RegisterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<RegisterRow>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('compliance_registers')
      .select('id, reference_no, title, person_name, status, due_on, notes')
      .eq('module_key', config.moduleKey)
      .order('updated_at', { ascending: false })
    if (queryError) {
      setError(queryError.message)
      setRows([])
    } else {
      setError(null)
      setRows(
        (Array.isArray(data) ? data : []).map((row) => ({
          id: String(row.id),
          reference_no: String(row.reference_no ?? ''),
          title: String(row.title ?? ''),
          person_name: String(row.person_name ?? ''),
          status: String(row.status ?? 'Draft'),
          due_on: row.due_on ? String(row.due_on).slice(0, 10) : '',
          notes: String(row.notes ?? ''),
        })),
      )
    }
    setLoading(false)
  }, [config.moduleKey])

  useEffect(() => {
    let cancelled = false
    void load().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      `${row.reference_no} ${row.title} ${row.person_name} ${row.status} ${row.notes}`
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const openNew = () => {
    setForm(emptyForm())
    setMessage(null)
    setOpen(true)
  }

  const openEdit = (row: RegisterRow) => {
    setForm(row)
    setMessage(null)
    setOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      setMessage('Title is required.')
      return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      module_key: config.moduleKey,
      reference_no: form.reference_no.trim(),
      title: form.title.trim(),
      person_name: form.person_name.trim(),
      status: form.status || 'Draft',
      due_on: form.due_on || null,
      notes: form.notes.trim(),
    }
    const query = form.id
      ? supabase.from('compliance_registers').update(payload).eq('id', form.id)
      : supabase.from('compliance_registers').insert(payload)
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setMessage(saveError.message)
      return
    }
    setOpen(false)
    setMessage('Saved.')
    await load()
  }

  const removeSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} record(s)?`)) return
    const { error: deleteError } = await supabase.from('compliance_registers').delete().in('id', ids)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelected(new Set())
    setMessage(`Deleted ${ids.length} record(s).`)
    await load()
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-stone-900">{config.title}</h1>
          <p className="max-w-3xl text-sm text-stone-600">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label={`Search ${config.title}`}
            className="w-full sm:w-48"
          />
          <Button type="button" onClick={openNew}>
            Add record
          </Button>
          <Button type="button" variant="outline" onClick={() => void removeSelected()} disabled={selected.size === 0}>
            Delete selected
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-stone-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Reference</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>{config.personLabel}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6}>Loading records…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No records yet. Add the first one for this register.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title}`}
                      checked={selected.has(row.id)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(row.id)) next.delete(row.id)
                          else next.add(row.id)
                          return next
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell>{row.reference_no || '—'}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.person_name || '—'}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.due_on || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? `Edit ${config.title}` : `Add ${config.title}`}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="reg-ref">Reference</Label>
              <Input
                id="reg-ref"
                value={form.reference_no}
                onChange={(event) => setForm((prev) => ({ ...prev, reference_no: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reg-title">Title</Label>
              <Input
                id="reg-title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reg-person">{config.personLabel}</Label>
              <Input
                id="reg-person"
                value={form.person_name}
                onChange={(event) => setForm((prev) => ({ ...prev, person_name: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="reg-status">Status</Label>
                <select
                  id="reg-status"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reg-due">Due date</Label>
                <Input
                  id="reg-due"
                  type="date"
                  value={form.due_on ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, due_on: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reg-notes">Notes</Label>
              <textarea
                id="reg-notes"
                className="min-h-24 rounded-md border border-input px-3 py-2 text-sm"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            {message && open ? <p className="text-sm text-red-700">{message}</p> : null}
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
