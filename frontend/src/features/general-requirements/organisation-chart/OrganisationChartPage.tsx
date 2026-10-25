import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Printer, RefreshCw, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { errorText, isMissingTableError } from '@/lib/missingSchema'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { printViaIframe } from '../shared'
import {
  buildOrgChartPrintHtml,
  buildOrgTree,
  descendantIds,
  normalizePosition,
  orgGaps,
  personName,
  type OrgNode,
  type OrgPerson,
  type OrgPosition,
} from './orgChart'

type Draft = {
  title: string
  department: string
  holder: string
  deputy: string
  reportsTo: string
  responsibilities: string
  authority: string
  keyPersonnel: boolean
  sortOrder: string
  active: boolean
}

const emptyDraft = (): Draft => ({
  title: '',
  department: '',
  holder: '',
  deputy: '',
  reportsTo: '',
  responsibilities: '',
  authority: '',
  keyPersonnel: false,
  sortOrder: '0',
  active: true,
})

const toDraft = (p: OrgPosition): Draft => ({
  title: p.title,
  department: p.department ?? '',
  holder: p.holder_user_id ?? '',
  deputy: p.deputy_user_id ?? '',
  reportsTo: p.reports_to ?? '',
  responsibilities: p.responsibilities ?? '',
  authority: p.authority ?? '',
  keyPersonnel: p.key_personnel,
  sortOrder: String(p.sort_order),
  active: p.active,
})

function NodeCard({
  node,
  people,
  collapsed,
  onToggle,
  onEdit,
  onDelete,
}: {
  node: OrgNode
  people: Map<string, OrgPerson>
  collapsed: Set<string>
  onToggle: (id: string) => void
  onEdit: (p: OrgPosition) => void
  onDelete: (p: OrgPosition) => void
}) {
  const p = node.position
  const isCollapsed = collapsed.has(p.id)
  const holder = personName(people, p.holder_user_id)
  const deputy = personName(people, p.deputy_user_id)
  return (
    <li className="relative">
      <div
        className={cn(
          'inline-flex min-w-[16rem] max-w-full items-start gap-2 border bg-white px-3 py-2 shadow-sm',
          p.key_personnel ? 'border-2 border-amber-600' : 'border-stone-400',
          !p.active && 'opacity-60',
        )}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            className="mt-0.5 text-stone-500 hover:text-stone-800"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={() => onToggle(p.id)}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-stone-900">{p.title}</span>
            {p.key_personnel ? (
              <span className="bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">Key</span>
            ) : null}
            {!p.active ? <span className="text-[10px] uppercase text-stone-500">(inactive)</span> : null}
          </div>
          <div className={cn('text-sm', holder ? 'text-stone-700' : 'italic text-red-700')}>{holder || 'Vacant'}</div>
          <div className={cn('text-xs', deputy ? 'text-stone-500' : p.key_personnel ? 'text-amber-800' : 'text-stone-400')}>
            Deputy: {deputy || (p.key_personnel ? 'not appointed' : '—')}
          </div>
          {p.department ? <div className="text-xs text-stone-500">{p.department}</div> : null}
          {p.responsibilities ? (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-stone-600" title={p.responsibilities}>
              {p.responsibilities}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Edit position"
            onClick={() => onEdit(p)}>
            <Pencil size={13} />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 text-red-700" aria-label="Delete position"
            onClick={() => onDelete(p)}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      {node.children.length > 0 && !isCollapsed ? (
        <ul className="ml-6 mt-2 space-y-2 border-l border-stone-400 pl-4">
          {node.children.map((c) => (
            <NodeCard key={c.position.id} node={c} people={people} collapsed={collapsed} onToggle={onToggle}
              onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Organisation chart with deputies (ISO/IEC 17025 5.5, 6.2; gap P3-3).
 * Proposed route: /general-requirements/organisation-chart.
 */
export default function OrganisationChartPage() {
  const [positions, setPositions] = useState<OrgPosition[]>([])
  const [people, setPeople] = useState<OrgPerson[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [posRes, peopleRes] = await Promise.all([
        supabase.from('org_positions').select('*').order('sort_order', { ascending: true }),
        supabase.from('user_profiles').select('id, full_name, designation, status').order('full_name', { ascending: true }),
      ])
      if (posRes.error) {
        if (isMissingTableError(posRes.error)) {
          setAvailable(false)
          setPositions([])
          return
        }
        throw posRes.error
      }
      setAvailable(true)
      setPositions((posRes.data ?? []).map((r) => normalizePosition(r as Record<string, unknown>)))
      if (!peopleRes.error) {
        setPeople(
          ((peopleRes.data ?? []) as Array<Record<string, unknown>>).map((u) => ({
            id: String(u.id),
            full_name: u.full_name == null ? null : String(u.full_name),
            designation: u.designation == null ? null : String(u.designation),
            status: u.status == null ? 'Active' : String(u.status),
          })),
        )
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const visible = useMemo(() => positions.filter((p) => showInactive || p.active), [positions, showInactive])
  const tree = useMemo(() => buildOrgTree(visible), [visible])
  const gaps = useMemo(() => orgGaps(positions), [positions])
  const managerOptions = useMemo(() => {
    const blocked = editingId ? descendantIds(positions, editingId) : new Set<string>()
    return positions.filter((p) => !blocked.has(p.id)).sort((a, b) => a.title.localeCompare(b.title))
  }, [positions, editingId])
  const activePeople = useMemo(
    () => people.filter((p) => String(p.status ?? '').toLowerCase() !== 'inactive'),
    [people],
  )

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startNew = (reportsTo?: string) => {
    setEditingId(null)
    setDraft({ ...emptyDraft(), reportsTo: reportsTo ?? '' })
    setMessage(null)
  }

  const startEdit = (p: OrgPosition) => {
    setEditingId(p.id)
    setDraft(toDraft(p))
    setMessage(null)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim()) {
      setMessage('Position title is required.')
      return
    }
    if (draft.holder && draft.holder === draft.deputy) {
      setMessage('The deputy must be a different person from the holder.')
      return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      title: draft.title.trim(),
      department: draft.department.trim() || null,
      holder_user_id: draft.holder || null,
      deputy_user_id: draft.deputy || null,
      reports_to: draft.reportsTo || null,
      responsibilities: draft.responsibilities.trim() || null,
      authority: draft.authority.trim() || null,
      key_personnel: draft.keyPersonnel,
      sort_order: Number.parseInt(draft.sortOrder, 10) || 0,
      active: draft.active,
    }
    try {
      const res = editingId
        ? await supabase.from('org_positions').update(payload).eq('id', editingId).select('id')
        : await supabase.from('org_positions').insert(payload).select('id')
      if (res.error) throw res.error
      if (!res.data || res.data.length === 0) {
        throw new Error('Not saved: only the Laboratory Director or Quality Manager can change the organisation chart.')
      }
      setDraft(null)
      setEditingId(null)
      await load()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: OrgPosition) => {
    const below = positions.filter((x) => x.reports_to === p.id).length
    const note = below ? `\n${below} position(s) reporting to it will move to the top level.` : ''
    if (!window.confirm(`Delete the position "${p.title}"?${note}`)) return
    setMessage(null)
    const { data, error: delErr } = await supabase.from('org_positions').delete().eq('id', p.id).select('id')
    if (delErr) {
      setMessage(errorText(delErr))
      return
    }
    if (!data || data.length === 0) {
      setMessage('Not deleted: only the Laboratory Director or Quality Manager can change the organisation chart.')
      return
    }
    await load()
  }

  const print = () => {
    printViaIframe(
      buildOrgChartPrintHtml(tree, peopleById, {
        printedOn: formatDate(new Date().toISOString()),
      }),
    )
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <div className={cn(limsPageShellClass, 'space-y-4')}>
      <div className={limsPanelClass}>
        <div className={cn(limsDarkBarClass, 'px-4 py-3')}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <div className="relative flex flex-wrap items-center gap-2">
            <Users size={18} className="text-amber-300" />
            <h1 className="text-lg font-semibold text-white">Organisation Chart</h1>
            <span className="text-xs text-stone-300">ISO/IEC 17025 5.5 · key personnel and deputies (6.2)</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs text-stone-200">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
              <Button type="button" className={cn(limsDarkBarBtnClass, 'gap-1.5 px-3')} onClick={() => void load()}
                disabled={loading}>
                <RefreshCw size={14} /> Refresh
              </Button>
              <Button type="button" className={cn(limsDarkBarBtnClass, 'gap-1.5 px-3')} onClick={print}
                disabled={!available || positions.length === 0}>
                <Printer size={14} /> Print
              </Button>
              <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={() => startNew()}
                disabled={!available}>
                <Plus size={14} /> Add Position
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 bg-card p-4">
          {!available ? (
            <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The organisation chart is not set up on the database yet (migration 20261031100000_p3_good_practice.sql).
            </p>
          ) : null}
          {error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          {message && !draft ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p>
          ) : null}
          {available && (gaps.noDeputy.length > 0 || gaps.vacant.length > 0) ? (
            <div className="border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {gaps.noDeputy.length > 0 ? (
                <p>Key positions without a deputy: {gaps.noDeputy.map((p) => p.title).join(', ')}.</p>
              ) : null}
              {gaps.vacant.length > 0 ? <p>Vacant positions: {gaps.vacant.map((p) => p.title).join(', ')}.</p> : null}
            </div>
          ) : null}
          {loading ? <p className="text-sm text-stone-600">Loading…</p> : null}
          {available && !loading && tree.length === 0 ? (
            <p className="text-sm text-stone-600">No positions yet. Start with the top position (e.g. Laboratory Director).</p>
          ) : null}
          <ul className="space-y-2 overflow-x-auto">
            {tree.map((n) => (
              <NodeCard key={n.position.id} node={n} people={peopleById} collapsed={collapsed} onToggle={toggle}
                onEdit={startEdit} onDelete={(p) => void remove(p)} />
            ))}
          </ul>
        </div>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) { setDraft(null); setEditingId(null) } }}>
        <DialogContent persistOnFocusLoss aria-describedby={undefined}
          className={cn(limsDialogClass, 'flex w-[min(100%-1.5rem,44rem)] max-w-none flex-col')}>
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {editingId ? 'Edit Position' : 'Add Position'}
              </DialogTitle>
            </DialogHeader>
          </div>
          {draft ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white p-4">
              {message ? (
                <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="org-title">Position title</Label>
                  <Input id="org-title" className={limsFieldClass} value={draft.title}
                    onChange={(e) => set({ title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-holder">Holder</Label>
                  <select id="org-holder" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.holder}
                    onChange={(e) => set({ holder: e.target.value })}>
                    <option value="">Vacant</option>
                    {activePeople.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.id}{u.designation ? ` — ${u.designation}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-deputy">Deputy</Label>
                  <select id="org-deputy" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.deputy}
                    onChange={(e) => set({ deputy: e.target.value })}>
                    <option value="">None</option>
                    {activePeople.filter((u) => u.id !== draft.holder).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.id}{u.designation ? ` — ${u.designation}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-reports">Reports to</Label>
                  <select id="org-reports" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.reportsTo}
                    onChange={(e) => set({ reportsTo: e.target.value })}>
                    <option value="">— (top of the chart)</option>
                    {managerOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-dept">Department</Label>
                  <Input id="org-dept" className={limsFieldClass} value={draft.department}
                    onChange={(e) => set({ department: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="org-resp">Responsibilities</Label>
                  <Textarea id="org-resp" rows={3} value={draft.responsibilities}
                    onChange={(e) => set({ responsibilities: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="org-auth">Authority</Label>
                  <Textarea id="org-auth" rows={2} value={draft.authority}
                    onChange={(e) => set({ authority: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-order">Order</Label>
                  <Input id="org-order" inputMode="numeric" className={limsFieldClass} value={draft.sortOrder}
                    onChange={(e) => set({ sortOrder: e.target.value.replace(/[^0-9-]/g, '') })} />
                </div>
                <div className="flex flex-col justify-end gap-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.keyPersonnel} onChange={(e) => set({ keyPersonnel: e.target.checked })} />
                    Key personnel (needs a deputy)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
                    Active
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-stone-300 pt-3">
                <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={saving}
                  onClick={() => { setDraft(null); setEditingId(null) }}>
                  Cancel
                </Button>
                <Button type="button" className={limsPrimaryBtnClass} disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
