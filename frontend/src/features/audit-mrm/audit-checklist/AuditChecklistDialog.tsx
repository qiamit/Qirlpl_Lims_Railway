import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChecklistTableRow, type PolishField } from './ChecklistTableRow'
import { ISO_17025_AUDIT_CLAUSES } from './iso17025Clauses'
import {
  auditTypeLabel,
  formatProposedRange,
  isItemAnswered,
  normalizeConformity,
  type AuditChecklistItemRow,
  type AuditPlanRow,
  type ConformityValue,
} from './types'

const AUTOSAVE_DEBOUNCE_MS = 650

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const POLISH_MESSAGES: Record<PolishField, string> = {
  remark:
    'Polish the following audit observation into clear, professional English suitable for an ISO/IEC 17025 internal audit checklist. Keep the original meaning and facts. Do not invent findings. Return only the polished observation text — no quotes, labels, or explanation.',
  non_conformity:
    'Polish the following audit non-conformity into clear, professional English suitable for an ISO/IEC 17025 internal audit checklist. Keep the original meaning and facts. Do not invent findings or change the severity. Return only the polished non-conformity text — no quotes, labels, or explanation.',
}

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

/** Strip fences/quotes so polished text can drop straight into the textarea. */
function extractPolishedText(reply: string): string {
  let text = reply.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:\w+)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim()
  }
  return text
}

function buildPolishContext(item: AuditChecklistItemRow, field: PolishField, draft: string): string {
  const lines = [
    `Clause No: ${item.clause_no}`,
    `Clause Description: ${item.clause_matter}`,
    `Conformity: ${item.conformity || '(none)'}`,
  ]
  if (field === 'non_conformity') {
    lines.push(`Observation: ${item.remark.trim() || '(none)'}`)
  }
  lines.push('', field === 'remark' ? 'Current Observation:' : 'Current Non Conformity:', draft)
  return lines.join('\n')
}

function mapItem(raw: Record<string, unknown>): AuditChecklistItemRow {
  return {
    id: String(raw.id),
    audit_plan_id: String(raw.audit_plan_id),
    clause_no: String(raw.clause_no ?? ''),
    clause_matter: String(raw.clause_matter ?? ''),
    conformity: normalizeConformity(raw.conformity),
    remark: String(raw.remark ?? ''),
    non_conformity: String(raw.non_conformity ?? ''),
    sort_order: Number(raw.sort_order ?? 0) || 0,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function AuditChecklistDialog({
  open,
  onOpenChange,
  plan,
  onProgressChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: AuditPlanRow | null
  onProgressChange?: (planId: string, answered: number, total: number) => void
}) {
  const [items, setItems] = useState<AuditChecklistItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [polishingKey, setPolishingKey] = useState<string | null>(null)

  const itemsRef = useRef(items)
  itemsRef.current = items

  const polishingKeyRef = useRef(polishingKey)
  polishingKeyRef.current = polishingKey

  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  const pendingTimers = useRef<Map<string, number>>(new Map())
  const savedClearTimer = useRef<number | null>(null)

  const clearPendingTimers = useCallback(() => {
    for (const t of pendingTimers.current.values()) window.clearTimeout(t)
    pendingTimers.current.clear()
    if (savedClearTimer.current != null) {
      window.clearTimeout(savedClearTimer.current)
      savedClearTimer.current = null
    }
  }, [])

  const reportProgress = useCallback(
    (list: AuditChecklistItemRow[]) => {
      if (!plan) return
      const answered = list.filter(isItemAnswered).length
      onProgressChange?.(plan.id, answered, list.length)
    },
    [onProgressChange, plan],
  )

  const persistItem = useCallback(
    async (item: AuditChecklistItemRow) => {
      setSaveStatus('saving')
      setSaveError(null)
      try {
        const payload = {
          id: item.id,
          audit_plan_id: item.audit_plan_id,
          clause_no: item.clause_no,
          clause_matter: item.clause_matter,
          conformity: item.conformity,
          remark: item.remark,
          non_conformity: item.conformity === 'no' ? item.non_conformity : '',
          sort_order: item.sort_order,
        }

        const { error } = await supabase.from('audit_checklist_items').upsert(payload, { onConflict: 'id' })
        if (error) throw error

        reportProgress(itemsRef.current)
        setSaveStatus('saved')
        if (savedClearTimer.current != null) window.clearTimeout(savedClearTimer.current)
        savedClearTimer.current = window.setTimeout(() => {
          setSaveStatus((s) => (s === 'saved' ? 'idle' : s))
        }, 1600)
      } catch (err) {
        setSaveStatus('error')
        setSaveError(formatSupabaseError(err))
      }
    },
    [reportProgress],
  )

  const scheduleSave = useCallback(
    (itemId: string) => {
      const existing = pendingTimers.current.get(itemId)
      if (existing != null) window.clearTimeout(existing)
      const timer = window.setTimeout(() => {
        pendingTimers.current.delete(itemId)
        const latest = itemsRef.current.find((i) => i.id === itemId)
        if (latest) void persistItem(latest)
      }, AUTOSAVE_DEBOUNCE_MS)
      pendingTimers.current.set(itemId, timer)
    },
    [persistItem],
  )

  const loadOrSeed = useCallback(
    async (planId: string) => {
      setLoading(true)
      setLoadError(null)
      setSaveStatus('idle')
      setSaveError(null)
      try {
        const { data, error } = await supabase
          .from('audit_checklist_items')
          .select('*')
          .eq('audit_plan_id', planId)
          .order('sort_order', { ascending: true })
        if (error) throw error

        let list = (Array.isArray(data) ? data : []).map((r) => mapItem(r as Record<string, unknown>))

        if (list.length === 0) {
          const seed = ISO_17025_AUDIT_CLAUSES.map((c, index) => ({
            audit_plan_id: planId,
            clause_no: c.clauseNo,
            clause_matter: c.clauseMatter,
            conformity: 'yes' as const,
            remark: '',
            non_conformity: '',
            sort_order: index + 1,
          }))
          const { data: inserted, error: insertError } = await supabase
            .from('audit_checklist_items')
            .insert(seed)
            .select('*')
          if (insertError) throw insertError
          list = (Array.isArray(inserted) ? inserted : []).map((r) => mapItem(r as Record<string, unknown>))
          list.sort((a, b) => a.sort_order - b.sort_order)
        } else {
          // Empty/null conformity → default Yes (do not overwrite saved no/na)
          const emptyIds = list.filter((i) => i.conformity === '').map((i) => i.id)
          if (emptyIds.length > 0) {
            list = list.map((i) => (i.conformity === '' ? { ...i, conformity: 'yes' as const } : i))
            const { error: defaultError } = await supabase
              .from('audit_checklist_items')
              .update({ conformity: 'yes' })
              .in('id', emptyIds)
            if (defaultError) throw defaultError
          }
        }

        setItems(list)
        reportProgress(list)
      } catch (err) {
        setLoadError(formatSupabaseError(err))
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [reportProgress],
  )

  useEffect(() => {
    if (!open || !plan) {
      clearPendingTimers()
      setItems([])
      setFilter('')
      setSelectedIds(new Set())
      setPolishingKey(null)
      return
    }
    setSelectedIds(new Set())
    void loadOrSeed(plan.id)
    return () => {
      clearPendingTimers()
    }
  }, [open, plan, loadOrSeed, clearPendingTimers])

  const updateItem = useCallback(
    (
      id: string,
      patch: Partial<Pick<AuditChecklistItemRow, 'conformity' | 'remark' | 'non_conformity'>>,
      opts?: { reportProgress?: boolean },
    ) => {
      setItems((prev) => {
        const next = prev.map((item) => {
          if (item.id !== id) return item
          const merged = { ...item, ...patch }
          if (patch.conformity !== undefined && patch.conformity !== 'no') {
            merged.non_conformity = ''
          }
          return merged
        })
        // Typing commits should not poke parent progress every keystroke (causes lag).
        if (opts?.reportProgress !== false) {
          reportProgress(next)
        }
        return next
      })
      scheduleSave(id)
    },
    [reportProgress, scheduleSave],
  )

  const onConformityChange = useCallback(
    (id: string, value: ConformityValue) => {
      updateItem(id, { conformity: value })
    },
    [updateItem],
  )

  const onRemarkCommit = useCallback(
    (id: string, next: string) => {
      const current = itemsRef.current.find((i) => i.id === id)
      if (current && current.remark === next) return
      // Keep ref in sync immediately so AI polish after flush sees the draft.
      itemsRef.current = itemsRef.current.map((i) => (i.id === id ? { ...i, remark: next } : i))
      updateItem(id, { remark: next }, { reportProgress: false })
    },
    [updateItem],
  )

  const onNonConformityCommit = useCallback(
    (id: string, next: string) => {
      const current = itemsRef.current.find((i) => i.id === id)
      if (current && current.non_conformity === next) return
      itemsRef.current = itemsRef.current.map((i) =>
        i.id === id ? { ...i, non_conformity: next } : i,
      )
      updateItem(id, { non_conformity: next }, { reportProgress: false })
    },
    [updateItem],
  )

  const polishField = useCallback(
    async (item: AuditChecklistItemRow, field: PolishField) => {
      // Use refs so we don't re-create this callback (and remount rows) on every save/polish flip.
      if (polishingKeyRef.current || saveStatusRef.current === 'saving') return

      const latest = itemsRef.current.find((i) => i.id === item.id) ?? item
      const draft = (field === 'remark' ? latest.remark : latest.non_conformity).trim()
      if (!draft) return

      const key = `${latest.id}:${field}`
      setPolishingKey(key)
      setSaveError(null)
      try {
        const { reply } = await sendQiAssistantMessage({
          page: 'audit-mrm/audit-checklist',
          message: POLISH_MESSAGES[field],
          context: buildPolishContext(latest, field, draft),
          activeRecordId: latest.id,
          activeRecordTable: 'audit_checklist_items',
          history: [],
        })
        const polished = extractPolishedText(reply)
        if (!polished) throw new Error('QI Assistant returned empty text.')
        updateItem(latest.id, field === 'remark' ? { remark: polished } : { non_conformity: polished })
      } catch (err) {
        setSaveStatus('error')
        const fallback =
          field === 'remark' ? 'Failed to polish observation.' : 'Failed to polish non-conformity.'
        setSaveError(err instanceof Error ? err.message : fallback)
      } finally {
        setPolishingKey(null)
      }
    },
    [updateItem],
  )

  const polishLocked = polishingKey != null

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => {
      const hay = [i.clause_no, i.clause_matter, i.remark, i.non_conformity, i.conformity].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [items, filter])

  const allChecked = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id))
  const someChecked = filteredItems.some((i) => selectedIds.has(i.id))

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllFiltered = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const item of filteredItems) {
          if (checked) next.add(item.id)
          else next.delete(item.id)
        }
        return next
      })
    },
    [filteredItems],
  )

  const answeredCount = useMemo(() => items.filter(isItemAnswered).length, [items])

  const statusLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(45,212,191,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.35) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Audit Checklist · ISO/IEC 17025:2017
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {plan ? plan.audit_id : 'Audit Checklist'}
              </DialogTitle>
              {plan ? (
                <p className="text-sm text-slate-300">
                  {auditTypeLabel(plan.audit_type)} · {formatProposedRange(plan.proposed_from, plan.proposed_to)} ·{' '}
                  {answeredCount}/{items.length || ISO_17025_AUDIT_CLAUSES.length} answered
                  {statusLabel ? (
                    <span
                      className={
                        saveStatus === 'error'
                          ? ' ml-2 text-rose-300'
                          : saveStatus === 'saved'
                            ? ' ml-2 text-teal-300'
                            : ' ml-2 text-slate-400'
                      }
                    >
                      · {statusLabel}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[#fafbfc] px-3 py-3 sm:px-5 sm:py-4">
          {(loadError || saveError) && (
            <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {loadError || saveError}
            </p>
          )}

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="checklist-filter" className="sr-only">
              Filter clauses
            </Label>
            <input
              id="checklist-filter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by clause no or description…"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm sm:max-w-sm"
              aria-label="Filter clauses"
            />
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading checklist…</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
              <Table className="min-w-[1100px] border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="sticky top-0 z-10 w-12 bg-muted/50 text-center text-xs">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allChecked && someChecked
                        }}
                        onChange={(e) => toggleAllFiltered(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[88px] bg-muted/50 text-xs">Clause No</TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[240px] bg-muted/50 text-xs">Description</TableHead>
                    <TableHead className="sticky top-0 z-10 w-[110px] bg-muted/50 text-center text-xs">
                      Conformity
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[220px] bg-muted/50 text-center text-xs">
                      Observation
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[220px] bg-muted/50 text-center text-xs">
                      Non Conformity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const rowPolish =
                      polishingKey?.startsWith(`${item.id}:`) ?
                        (polishingKey.slice(item.id.length + 1) as PolishField)
                      : null

                    return (
                      <ChecklistTableRow
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        polishingField={rowPolish}
                        polishLocked={polishLocked}
                        onToggle={toggleRow}
                        onConformityChange={onConformityChange}
                        onRemarkCommit={onRemarkCommit}
                        onNonConformityCommit={onNonConformityCommit}
                        onPolish={polishField}
                      />
                    )
                  })}
                </TableBody>
              </Table>
              {filteredItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No clauses match the filter.</p>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
