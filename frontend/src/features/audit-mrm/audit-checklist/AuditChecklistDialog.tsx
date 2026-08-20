import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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
const AI_FILL_BATCH_SIZE = 10

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const POLISH_MESSAGES: Record<PolishField, string> = {
  remark:
    'Polish the following audit observation into clear, professional English suitable for an ISO/IEC 17025 internal audit checklist. Keep the original meaning and facts. Do not invent findings. Return only the polished observation text — no quotes, labels, or explanation.',
  non_conformity:
    'Polish the following audit non-conformity into clear, professional English suitable for an ISO/IEC 17025 internal audit checklist. Keep the original meaning and facts. Do not invent findings or change the severity. Return only the polished non-conformity text — no quotes, labels, or explanation.',
}

const AI_FILL_MESSAGE = `Fill this ISO/IEC 17025:2017 internal audit checklist batch for a competent accredited laboratory that is generally conforming.

Return ONLY a JSON array (no markdown fences, no commentary) with one object per clause:
[{"clause_no":"4.1.1","conformity":"yes","remark":"...","non_conformity":""}]

Rules:
- Include every provided clause_no exactly once.
- conformity must be "yes", "no", or "na".
- Prefer "yes" with a brief professional observation (1–2 sentences) that the requirement is implemented / verified.
- Use "na" only when clearly not applicable; remark may be brief or empty.
- Use "no" sparingly; when used, provide both remark and non_conformity text.
- Do not invent specific document numbers, fake dates, or named evidence — keep observations generic but audit-ready.`

const AI_FILL_AS_NC_MESSAGE = `Fill this ISO/IEC 17025:2017 internal audit checklist batch as NON-CONFORMITIES.

Return ONLY a JSON array (no markdown fences, no commentary) with one object per clause:
[{"clause_no":"4.1.1","conformity":"no","remark":"...","non_conformity":"..."}]

Rules:
- Include every provided clause_no exactly once.
- Set conformity to "no" for EVERY clause (even if previously Yes).
- remark: brief observation describing what was reviewed / the finding context (1–2 sentences).
- non_conformity: clear non-conformity statement against the clause requirement (1–2 sentences).
- If the auditor message includes finding details, incorporate them into remark and non_conformity.
- Do not invent specific document numbers, fake dates, or named evidence — keep wording generic but audit-ready.`

/** Pull clause numbers like 4.1.1 / 7.8.2.1 from free-text AI Assistant messages. */
function extractClauseNosFromMessage(message: string): string[] {
  const matches = message.match(/\b\d+(?:\.\d+)+\b/g) ?? []
  return [...new Set(matches.map((m) => m.trim()))]
}

function resolveNcTargetsFromMessage(
  list: AuditChecklistItemRow[],
  message: string,
  selectedIds: Set<string>,
): { targets: AuditChecklistItemRow[]; unmatched: string[] } {
  const clauseNos = extractClauseNosFromMessage(message)
  if (clauseNos.length > 0) {
    const byNo = new Map(list.map((i) => [i.clause_no.trim().toLowerCase(), i]))
    const targets: AuditChecklistItemRow[] = []
    const unmatched: string[] = []
    const seen = new Set<string>()
    for (const no of clauseNos) {
      const hit = byNo.get(no.toLowerCase())
      if (!hit) {
        unmatched.push(no)
        continue
      }
      if (seen.has(hit.id)) continue
      seen.add(hit.id)
      targets.push(hit)
    }
    return { targets, unmatched }
  }
  if (selectedIds.size > 0) {
    return {
      targets: list.filter((i) => selectedIds.has(i.id)),
      unmatched: [],
    }
  }
  return { targets: [], unmatched: [] }
}

type AiFillDraft = {
  clause_no: string
  conformity: ConformityValue
  remark: string
  non_conformity: string
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

function extractJsonArray(reply: string): unknown[] {
  let text = reply.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()
  }
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('AI did not return a JSON array.')
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
  if (!Array.isArray(parsed)) throw new Error('AI response was not a JSON array.')
  return parsed
}

function parseAiFillDrafts(reply: string): AiFillDraft[] {
  const arr = extractJsonArray(reply)
  const out: AiFillDraft[] = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const clauseNo = String(r.clause_no ?? r.clauseNo ?? '').trim()
    if (!clauseNo) continue
    const conformity = normalizeConformity(r.conformity)
    out.push({
      clause_no: clauseNo,
      conformity: conformity || 'yes',
      remark: String(r.remark ?? r.observation ?? '').trim(),
      non_conformity: String(r.non_conformity ?? r.nonConformity ?? '').trim(),
    })
  }
  return out
}

function needsAiFill(item: AuditChecklistItemRow): boolean {
  if (!item.conformity) return true
  if (item.conformity === 'yes' && !item.remark.trim()) return true
  if (item.conformity === 'no' && (!item.remark.trim() || !item.non_conformity.trim())) return true
  return false
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
type ClauseFilterScope = 'all' | 'yes' | 'no' | 'na' | 'nc' | 'empty_obs'

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
  const showAiButtons = useShowAiButtons()
  const [items, setItems] = useState<AuditChecklistItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [clauseScope, setClauseScope] = useState<ClauseFilterScope>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [polishingKey, setPolishingKey] = useState<string | null>(null)
  const [aiFilling, setAiFilling] = useState(false)
  const [aiFillProgress, setAiFillProgress] = useState<{ done: number; total: number } | null>(null)
  /** AI Assistant free-text: type NC clause(s) e.g. "4.1.1 missing records". */
  const [aiNcMessage, setAiNcMessage] = useState('')
  const [aiNcBusy, setAiNcBusy] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)

  const itemsRef = useRef(items)
  itemsRef.current = items

  const polishingKeyRef = useRef(polishingKey)
  polishingKeyRef.current = polishingKey

  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  const aiFillAbortRef = useRef(false)

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
      aiFillAbortRef.current = true
      setItems([])
      setFilter('')
      setClauseScope('all')
      setSelectedIds(new Set())
      setPolishingKey(null)
      setAiFilling(false)
      setAiFillProgress(null)
      setAiNcMessage('')
      setAiNcBusy(false)
      setAiAssistantOpen(false)
      return
    }
    setSelectedIds(new Set())
    void loadOrSeed(plan.id)
    return () => {
      clearPendingTimers()
      aiFillAbortRef.current = true
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

  const persistItemsBatch = useCallback(
    async (batch: AuditChecklistItemRow[]) => {
      if (batch.length === 0) return
      setSaveStatus('saving')
      setSaveError(null)
      const payload = batch.map((item) => ({
        id: item.id,
        audit_plan_id: item.audit_plan_id,
        clause_no: item.clause_no,
        clause_matter: item.clause_matter,
        conformity: item.conformity,
        remark: item.remark,
        non_conformity: item.conformity === 'no' ? item.non_conformity : '',
        sort_order: item.sort_order,
      }))
      const { error } = await supabase.from('audit_checklist_items').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      reportProgress(itemsRef.current)
      setSaveStatus('saved')
      if (savedClearTimer.current != null) window.clearTimeout(savedClearTimer.current)
      savedClearTimer.current = window.setTimeout(() => {
        setSaveStatus((s) => (s === 'saved' ? 'idle' : s))
      }, 1600)
    },
    [reportProgress],
  )

  const runAiFillChecklist = useCallback(async () => {
    if (!plan || aiFilling || aiNcBusy || polishingKeyRef.current) return

    const selected = selectedIds.size > 0
      ? itemsRef.current.filter((i) => selectedIds.has(i.id))
      : itemsRef.current

    if (selected.length === 0) {
      setSaveError('No checklist rows available to fill.')
      return
    }

    let targets = selected.filter(needsAiFill)
    if (targets.length === 0) {
      const ok = window.confirm(
        selectedIds.size > 0
          ? 'Selected rows already have answers. Overwrite them with AI fill?'
          : 'Checklist already has answers. Overwrite the entire checklist with AI fill?',
      )
      if (!ok) return
      targets = selected
    } else if (targets.length < selected.length) {
      const ok = window.confirm(
        `AI will fill ${targets.length} incomplete row(s) (empty observation / NC). Continue?`,
      )
      if (!ok) return
    } else {
      const ok = window.confirm(
        `AI will fill ${targets.length} checklist row(s)${selectedIds.size > 0 ? ' (selected)' : ''}. Continue?`,
      )
      if (!ok) return
    }

    aiFillAbortRef.current = false
    setAiFilling(true)
    setAiFillProgress({ done: 0, total: targets.length })
    setSaveError(null)
    setPolishingKey('bulk:fill')

    let filled = 0
    try {
      for (let i = 0; i < targets.length; i += AI_FILL_BATCH_SIZE) {
        if (aiFillAbortRef.current) break
        const batch = targets.slice(i, i + AI_FILL_BATCH_SIZE)
        const context = [
          `Audit ID: ${plan.audit_id}`,
          `Audit Type: ${auditTypeLabel(plan.audit_type)}`,
          `Proposed: ${formatProposedRange(plan.proposed_from, plan.proposed_to)}`,
          'Mode: Standard conforming fill',
          '',
          'Clauses:',
          ...batch.map(
            (item, idx) =>
              `${idx + 1}. ${item.clause_no} | ${item.clause_matter.replace(/\s+/g, ' ').trim()}`,
          ),
        ].join('\n')

        const { reply } = await sendQiAssistantMessage({
          page: 'audit-mrm/audit-checklist',
          message: AI_FILL_MESSAGE,
          context,
          activeRecordId: plan.id,
          activeRecordTable: 'audit_plans',
          history: [],
        })

        if (aiFillAbortRef.current) break

        const drafts = parseAiFillDrafts(reply)
        const byClause = new Map(drafts.map((d) => [d.clause_no, d]))
        const batchIds = new Set(batch.map((b) => b.id))
        const updatedBatch: AuditChecklistItemRow[] = []
        const next = itemsRef.current.map((item) => {
          if (!batchIds.has(item.id)) return item
          const draft = byClause.get(item.clause_no)
          if (!draft) return item

          const conformity = draft.conformity || 'yes'
          const merged: AuditChecklistItemRow = {
            ...item,
            conformity,
            remark: draft.remark || item.remark,
            non_conformity: conformity === 'no' ? draft.non_conformity || item.non_conformity : '',
          }
          updatedBatch.push(merged)
          return merged
        })
        itemsRef.current = next
        setItems(next)
        reportProgress(next)

        if (updatedBatch.length > 0) {
          await persistItemsBatch(updatedBatch)
        }

        filled = Math.min(targets.length, i + batch.length)
        setAiFillProgress({ done: filled, total: targets.length })
      }

      if (aiFillAbortRef.current) {
        setSaveError(`AI fill cancelled after ${filled}/${targets.length} rows.`)
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : 'AI fill failed.')
    } finally {
      setAiFilling(false)
      setAiFillProgress(null)
      setPolishingKey(null)
      aiFillAbortRef.current = false
    }
  }, [aiFilling, aiNcBusy, persistItemsBatch, plan, reportProgress, selectedIds])

  /** AI Assistant: type NC clause(s) → set Conformity No + fill Observation / NC. */
  const runAiNcAssistant = useCallback(async () => {
    if (!plan || aiFilling || aiNcBusy || polishingKeyRef.current) return

    const message = aiNcMessage.trim()
    if (!message && selectedIds.size === 0) {
      setSaveError(
        'Type an NC clause in AI Assistant (e.g. 4.1.1), or select clause rows then send.',
      )
      return
    }

    const { targets, unmatched } = resolveNcTargetsFromMessage(
      itemsRef.current,
      message,
      selectedIds,
    )

    if (unmatched.length > 0 && targets.length === 0) {
      setSaveError(`No matching checklist clause for: ${unmatched.join(', ')}`)
      return
    }
    if (targets.length === 0) {
      setSaveError('No checklist clauses matched. Type a clause no (e.g. 4.1.1) or select rows.')
      return
    }

    const ok = window.confirm(
      `AI Assistant will set Conformity to No and fill NC for ${targets.length} clause(s)` +
        (unmatched.length ? ` (not found: ${unmatched.join(', ')})` : '') +
        '. Continue?',
    )
    if (!ok) return

    aiFillAbortRef.current = false
    setAiNcBusy(true)
    setAiFilling(true)
    setAiFillProgress({ done: 0, total: targets.length })
    setSaveError(null)
    setPolishingKey('bulk:nc-assistant')

    let filled = 0
    try {
      for (let i = 0; i < targets.length; i += AI_FILL_BATCH_SIZE) {
        if (aiFillAbortRef.current) break
        const batch = targets.slice(i, i + AI_FILL_BATCH_SIZE)
        const context = [
          `Audit ID: ${plan.audit_id}`,
          `Audit Type: ${auditTypeLabel(plan.audit_type)}`,
          `Proposed: ${formatProposedRange(plan.proposed_from, plan.proposed_to)}`,
          'Mode: AI Assistant — Fill as Non Conformity (conformity must be no)',
          message ? `Auditor message: ${message}` : 'Auditor message: (none — use selected clauses)',
          '',
          'Clauses:',
          ...batch.map(
            (item, idx) =>
              `${idx + 1}. ${item.clause_no} | ${item.clause_matter.replace(/\s+/g, ' ').trim()} | Current conformity: ${item.conformity || '(none)'}`,
          ),
        ].join('\n')

        const { reply } = await sendQiAssistantMessage({
          page: 'audit-mrm/audit-checklist',
          message: AI_FILL_AS_NC_MESSAGE,
          context,
          activeRecordId: plan.id,
          activeRecordTable: 'audit_plans',
          history: [],
        })

        if (aiFillAbortRef.current) break

        const drafts = parseAiFillDrafts(reply)
        const byClause = new Map(drafts.map((d) => [d.clause_no, d]))
        const batchIds = new Set(batch.map((b) => b.id))
        const updatedBatch: AuditChecklistItemRow[] = []
        const next = itemsRef.current.map((item) => {
          if (!batchIds.has(item.id)) return item
          const draft = byClause.get(item.clause_no)
          const merged: AuditChecklistItemRow = {
            ...item,
            conformity: 'no',
            remark:
              draft?.remark?.trim() ||
              item.remark.trim() ||
              `Observation recorded against clause ${item.clause_no} during internal audit.`,
            non_conformity:
              draft?.non_conformity?.trim() ||
              item.non_conformity.trim() ||
              `Non-conformity: requirement of clause ${item.clause_no} is not adequately demonstrated.`,
          }
          updatedBatch.push(merged)
          return merged
        })
        itemsRef.current = next
        setItems(next)
        reportProgress(next)

        if (updatedBatch.length > 0) {
          await persistItemsBatch(updatedBatch)
        }

        filled = Math.min(targets.length, i + batch.length)
        setAiFillProgress({ done: filled, total: targets.length })
      }

      if (aiFillAbortRef.current) {
        setSaveError(`AI Assistant cancelled after ${filled}/${targets.length} NC row(s).`)
      } else {
        setAiNcMessage('')
        if (unmatched.length > 0) {
          setSaveError(`Filled ${filled} NC row(s). Not found: ${unmatched.join(', ')}`)
        }
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : 'AI Assistant NC fill failed.')
    } finally {
      setAiNcBusy(false)
      setAiFilling(false)
      setAiFillProgress(null)
      setPolishingKey(null)
      aiFillAbortRef.current = false
    }
  }, [aiFilling, aiNcBusy, aiNcMessage, persistItemsBatch, plan, reportProgress, selectedIds])

  const cancelAiFill = useCallback(() => {
    aiFillAbortRef.current = true
  }, [])

  const handleSaveAndClose = useCallback(async () => {
    if (aiFilling || loading || !plan) return
    // Flush debounced autosaves — persist current checklist snapshot then close.
    for (const t of pendingTimers.current.values()) window.clearTimeout(t)
    pendingTimers.current.clear()
    setSaveError(null)
    try {
      await persistItemsBatch(itemsRef.current)
      onOpenChange(false)
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : formatSupabaseError(err))
    }
  }, [aiFilling, loading, onOpenChange, persistItemsBatch, plan])

  const polishLocked = polishingKey != null || aiFilling

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return items.filter((i) => {
      if (clauseScope === 'yes' && i.conformity !== 'yes') return false
      if (clauseScope === 'no' && i.conformity !== 'no') return false
      if (clauseScope === 'na' && i.conformity !== 'na') return false
      if (clauseScope === 'nc' && !(i.conformity === 'no' || i.non_conformity.trim())) return false
      if (clauseScope === 'empty_obs' && i.remark.trim()) return false

      if (!q) return true
      const hay = [i.clause_no, i.clause_matter, i.remark, i.non_conformity, i.conformity]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, filter, clauseScope])

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
    aiFilling && aiFillProgress
      ? `AI filling ${aiFillProgress.done}/${aiFillProgress.total}…`
      : saveStatus === 'saving'
        ? 'Saving…'
        : saveStatus === 'saved'
          ? 'Saved'
          : saveStatus === 'error'
            ? 'Save failed'
            : null

  const thClass =
    'sticky top-0 z-10 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
          'left-0 top-0',
          'lg:!left-[268px] lg:!right-0 lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {plan ? plan.audit_id : 'Audit Checklist'}
              </DialogTitle>
              {plan ? (
                <p className="text-sm text-stone-300">
                  {auditTypeLabel(plan.audit_type)} · {formatProposedRange(plan.proposed_from, plan.proposed_to)} ·{' '}
                  {answeredCount}/{items.length || ISO_17025_AUDIT_CLAUSES.length} Answered
                  {statusLabel ? (
                    <span
                      className={
                        saveStatus === 'error'
                          ? ' ml-2 text-rose-300'
                          : saveStatus === 'saved'
                            ? ' ml-2 text-emerald-300'
                            : ' ml-2 text-stone-400'
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
          {(loadError || saveError) && (
            <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {loadError || saveError}
            </p>
          )}

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Label
                htmlFor="checklist-filter"
                className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                Filter All Clause
              </Label>
              <input
                id="checklist-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search clause no, description, observation, NC…"
                className={cn(limsFieldClass, 'h-9 w-full min-w-0 flex-1 px-3 text-sm sm:max-w-md')}
                aria-label="Filter all clause"
                disabled={aiFilling}
              />
              <Select
                value={clauseScope}
                onValueChange={(v) => setClauseScope(v as ClauseFilterScope)}
                disabled={aiFilling}
              >
                <SelectTrigger
                  className={cn(limsFieldClass, 'h-9 w-full shrink-0 sm:w-[13.75rem]')}
                  aria-label="Clause filter scope"
                >
                  <SelectValue placeholder="All Clauses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clauses</SelectItem>
                  <SelectItem value="yes">Conformity: Yes</SelectItem>
                  <SelectItem value="no">Conformity: No</SelectItem>
                  <SelectItem value="na">Conformity: N/A</SelectItem>
                  <SelectItem value="nc">Non Conformities</SelectItem>
                  <SelectItem value="empty_obs">Empty Observation</SelectItem>
                </SelectContent>
              </Select>
              {(filter.trim() || clauseScope !== 'all') && !aiFilling ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'h-9 shrink-0')}
                  onClick={() => {
                    setFilter('')
                    setClauseScope('all')
                  }}
                  aria-label="Clear clause filters"
                >
                  Clear
                </Button>
              ) : null}
              {showAiButtons && aiFillProgress ? (
                <p className="shrink-0 text-xs font-medium text-amber-800">
                  AI filling {aiFillProgress.done}/{aiFillProgress.total}…
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showAiButtons && aiFilling ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'h-8 gap-1.5')}
                  onClick={cancelAiFill}
                  aria-label="Cancel AI fill"
                >
                  Cancel
                </Button>
              ) : null}
              {showAiButtons ? (
                <DropdownMenu
                  open={aiAssistantOpen}
                  onOpenChange={(next) => {
                    if (aiFilling) return
                    setAiAssistantOpen(next)
                  }}
                  modal={false}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsPrimaryBtnClass, 'h-8 shrink-0 gap-1.5')}
                      disabled={loading || items.length === 0}
                      aria-label="Open AI Assistant"
                      title="AI Assistant — type NC clause or fill checklist"
                    >
                      {aiFilling ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {aiFilling
                        ? aiNcBusy
                          ? 'Filling NC…'
                          : 'Filling…'
                        : 'AI Assistant'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={6}
                    className="w-[min(100vw-2rem,22rem)] rounded-none border-2 border-stone-500 bg-stone-50 p-3 shadow-lg"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onInteractOutside={(e) => {
                      if (aiFilling) e.preventDefault()
                    }}
                  >
                    <DropdownMenuLabel className="px-0 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      AI Assistant
                    </DropdownMenuLabel>
                    <Label htmlFor="ai-nc-assistant" className="sr-only">
                      Type NC clause
                    </Label>
                    <input
                      id="ai-nc-assistant"
                      type="text"
                      value={aiNcMessage}
                      onChange={(e) => setAiNcMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void runAiNcAssistant().then(() => setAiAssistantOpen(false))
                        }
                      }}
                      placeholder="Type NC clause e.g. 4.1.1…"
                      className={cn(limsFieldClass, 'mb-2 h-9 w-full px-2.5 text-sm')}
                      aria-label="AI Assistant message — type NC clause to set Conformity No and fill NC"
                      disabled={loading || aiFilling || items.length === 0}
                      autoFocus
                    />
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className={cn(limsPrimaryBtnClass, 'h-8 w-full gap-1.5')}
                        onClick={() => {
                          void runAiNcAssistant().then(() => setAiAssistantOpen(false))
                        }}
                        disabled={
                          loading ||
                          aiFilling ||
                          items.length === 0 ||
                          (!aiNcMessage.trim() && selectedIds.size === 0)
                        }
                        aria-label="Fill as NC with AI Assistant"
                      >
                        {aiNcBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        Fill as NC
                      </Button>
                      <DropdownMenuSeparator className="bg-stone-300" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-8 w-full gap-1.5')}
                        onClick={() => {
                          setAiAssistantOpen(false)
                          void runAiFillChecklist()
                        }}
                        disabled={loading || aiFilling || items.length === 0}
                        aria-label="Fill checklist with AI"
                        title={
                          selectedIds.size > 0
                            ? 'AI fill selected checklist rows'
                            : 'AI fill entire checklist (incomplete rows first)'
                        }
                      >
                        <Sparkles size={14} />
                        AI Fill checklist
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading checklist…</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
              <Table className="min-w-[1100px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]">
                <TableHeader>
                  <TableRow className="bg-stone-800 hover:bg-stone-800">
                    <TableHead className={cn(thClass, 'w-12')}>
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
                    <TableHead className={cn(thClass, 'w-[88px]')}>Clause No</TableHead>
                    <TableHead className={cn(thClass, 'min-w-[240px] text-left')}>Description</TableHead>
                    <TableHead className={cn(thClass, 'w-[110px]')}>Conformity</TableHead>
                    <TableHead className={cn(thClass, 'min-w-[220px]')}>Observation</TableHead>
                    <TableHead className={cn(thClass, 'min-w-[220px]')}>Non Conformity</TableHead>
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

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-300 pt-3">
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
              onClick={() => void handleSaveAndClose()}
              disabled={loading || aiFilling || items.length === 0 || saveStatus === 'saving'}
              aria-label="Save checklist and close"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save & Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
