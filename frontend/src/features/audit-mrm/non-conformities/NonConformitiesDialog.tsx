import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Loader2, Paperclip, Save, Sparkles, UserRound, X } from 'lucide-react'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  emptyNcActionForm,
  formatNcFieldAuthorLine,
  formatProposedRange,
  isNcActionStarted,
  mapNcActionForm,
  mapNcEvidenceByField,
  mapNcFieldAuthors,
  NC_ACTION_FIELDS,
  NC_EVIDENCE_BUCKET,
  type NcActionFieldKey,
  type NcActionForm,
  type NcEvidenceByField,
  type NcEvidenceFile,
  type NcFieldAuthor,
  type NcFieldAuthors,
  type NonConformityRow,
} from './types'

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildAuthorsForPersist(
  form: NcActionForm,
  prevAuthors: NcFieldAuthors,
  touched: Set<NcActionFieldKey>,
  currentAuthor: NcFieldAuthor | null,
  isDirector: boolean,
): NcFieldAuthors {
  const next: NcFieldAuthors = { ...prevAuthors }
  for (const { key } of NC_ACTION_FIELDS) {
    if (key === 'description_of_nc') {
      delete next[key]
      continue
    }
    const text = form[key].trim()
    if (!text) {
      if (isDirector || !next[key]) delete next[key]
      continue
    }
    if (!next[key] && touched.has(key) && currentAuthor) {
      next[key] = { ...currentAuthor }
    }
  }
  return next
}

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function InfoBlock({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-stone-500 bg-[#f7f3eb] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={cn('mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-900', tone)}>
        {value.trim() || '—'}
      </p>
    </div>
  )
}

function extractJsonObject(reply: string): Record<string, unknown> {
  let text = reply.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI did not return a JSON object.')
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function buildAiFillFieldMessage(targetKey: NcActionFieldKey, targetLabel: string): string {
  return `Fill ONE field of an ISO/IEC 17025 non-conformity CAPA / corrective action form.

You may READ all context and all other form fields, but you must WRITE only this target field.

Target field key: ${targetKey}
Target field label: ${targetLabel}

Return ONLY a JSON object (no markdown fences, no commentary) with this exact single key:
{ "${targetKey}":"..." }

Rules:
- Use professional audit English suitable for an accredited laboratory.
- Base content on the provided clause, observation, non-conformity text, and other form values.
- Do not invent specific document numbers, fake dates, names, or evidence IDs.
- Keep the answer 1–3 concise sentences.
- If the target field already has text, improve/complete it while keeping intent.
- Do not return or modify any other keys.`
}

const AUTOSAVE_INTERVAL_MS = 30_000

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function NonConformitiesDialog({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: NonConformityRow | null
  onSaved?: (checklistItemId: string, started: boolean) => void
}) {
  const showAiButtons = useShowAiButtons()
  const { user, profileName, designation, departmentName, division } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const [form, setForm] = useState<NcActionForm>(() => emptyNcActionForm())
  const [evidence, setEvidence] = useState<NcEvidenceByField>({})
  const [fieldAuthors, setFieldAuthors] = useState<NcFieldAuthors>({})
  const [loading, setLoading] = useState(false)
  const [aiFillingField, setAiFillingField] = useState<NcActionFieldKey | null>(null)
  const [uploadingField, setUploadingField] = useState<NcActionFieldKey | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Partial<Record<NcActionFieldKey, HTMLInputElement | null>>>({})
  const formRef = useRef(form)
  const evidenceRef = useRef(evidence)
  const fieldAuthorsRef = useRef(fieldAuthors)
  const touchedFieldsRef = useRef<Set<NcActionFieldKey>>(new Set())
  const hydratedRef = useRef(false)
  const dirtyRef = useRef(false)
  const aiFillingFieldRef = useRef<NcActionFieldKey | null>(null)
  const uploadingFieldRef = useRef<NcActionFieldKey | null>(null)
  const autosaveIntervalRef = useRef<number | null>(null)
  const savedClearTimerRef = useRef<number | null>(null)

  formRef.current = form
  evidenceRef.current = evidence
  fieldAuthorsRef.current = fieldAuthors
  aiFillingFieldRef.current = aiFillingField
  uploadingFieldRef.current = uploadingField

  const buildCurrentAuthor = useCallback((): NcFieldAuthor | null => {
    if (!user?.id) return null
    return {
      userId: user.id,
      name: profileName.trim() || user.email || 'User',
      designation: designation.trim(),
      department: departmentName.trim(),
      division: division.trim(),
      date: todayIsoDate(),
    }
  }, [departmentName, designation, division, profileName, user?.email, user?.id])

  const canEditField = useCallback(
    (key: NcActionFieldKey) => isDirector || !fieldAuthors[key],
    [fieldAuthors, isDirector],
  )

  const clearAutosaveInterval = useCallback(() => {
    if (autosaveIntervalRef.current != null) {
      window.clearInterval(autosaveIntervalRef.current)
      autosaveIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open || !row) {
      clearAutosaveInterval()
      if (savedClearTimerRef.current != null) {
        window.clearTimeout(savedClearTimerRef.current)
        savedClearTimerRef.current = null
      }
      hydratedRef.current = false
      dirtyRef.current = false
      touchedFieldsRef.current = new Set()
      setForm(emptyNcActionForm())
      setEvidence({})
      setFieldAuthors({})
      setExistingId(null)
      setError(null)
      setSaveStatus('idle')
      setAiFillingField(null)
      setUploadingField(null)
      return
    }

    let cancelled = false
    hydratedRef.current = false
    dirtyRef.current = false
    touchedFieldsRef.current = new Set()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: qErr } = await supabase
          .from('audit_nc_actions')
          .select('*')
          .eq('checklist_item_id', row.checklistItemId)
          .maybeSingle()
        if (qErr) throw qErr
        if (cancelled) return

        const mapped = mapNcActionForm((data as Record<string, unknown> | null) ?? null)
        // Always mirror NC text — this field is display-only from the checklist NC.
        mapped.description_of_nc = row.nonConformity.trim() || mapped.description_of_nc
        setForm(mapped)
        setEvidence(
          mapNcEvidenceByField(
            data ? (data as Record<string, unknown>).evidence_by_field : null,
          ),
        )
        setFieldAuthors(
          mapNcFieldAuthors(
            data ? (data as Record<string, unknown>).field_authors : null,
          ),
        )
        setExistingId(data ? String((data as { id: string }).id) : null)
      } catch (err) {
        if (!cancelled) {
          setError(formatSupabaseError(err))
          const fallback = emptyNcActionForm()
          fallback.description_of_nc = row.nonConformity.trim()
          setForm(fallback)
          setEvidence({})
          setFieldAuthors({})
          setExistingId(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          window.setTimeout(() => {
            if (!cancelled) {
              hydratedRef.current = true
              dirtyRef.current = false
            }
          }, 0)
        }
      }
    })()

    return () => {
      cancelled = true
      clearAutosaveInterval()
    }
  }, [clearAutosaveInterval, open, row])

  const persistForm = useCallback(
    async (andClose = false) => {
      if (!row || aiFillingFieldRef.current || uploadingFieldRef.current) return false
      const latestForm = formRef.current
      const latestEvidence = evidenceRef.current
      const nextAuthors = buildAuthorsForPersist(
        latestForm,
        fieldAuthorsRef.current,
        touchedFieldsRef.current,
        buildCurrentAuthor(),
        isDirector,
      )
      setSaveStatus('saving')
      setError(null)
      try {
        const payload = {
          checklist_item_id: row.checklistItemId,
          ...latestForm,
          evidence_by_field: latestEvidence,
          field_authors: nextAuthors,
        }
        const { data, error: upsertErr } = await supabase
          .from('audit_nc_actions')
          .upsert(payload, { onConflict: 'checklist_item_id' })
          .select('id')
          .single()
        if (upsertErr) throw upsertErr
        setExistingId(data ? String((data as { id: string }).id) : existingId)
        setFieldAuthors(nextAuthors)
        fieldAuthorsRef.current = nextAuthors
        setSaveStatus('saved')
        dirtyRef.current = false
        onSaved?.(
          row.checklistItemId,
          isNcActionStarted(latestForm) || Object.keys(latestEvidence).length > 0,
        )
        if (andClose) {
          onOpenChange(false)
          return true
        }
        if (savedClearTimerRef.current != null) window.clearTimeout(savedClearTimerRef.current)
        savedClearTimerRef.current = window.setTimeout(() => {
          setSaveStatus((s) => (s === 'saved' ? 'idle' : s))
        }, 1600)
        return true
      } catch (err) {
        setSaveStatus('error')
        setError(err instanceof Error ? err.message : formatSupabaseError(err))
        return false
      }
    },
    [buildCurrentAuthor, existingId, isDirector, onOpenChange, onSaved, row],
  )

  // Auto-save every 30s while the form dialog is open.
  useEffect(() => {
    if (!open || !row) {
      clearAutosaveInterval()
      return
    }
    clearAutosaveInterval()
    autosaveIntervalRef.current = window.setInterval(() => {
      if (!hydratedRef.current) return
      if (aiFillingFieldRef.current || uploadingFieldRef.current) return
      if (!dirtyRef.current) return
      void persistForm(false)
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearAutosaveInterval()
  }, [clearAutosaveInterval, open, persistForm, row])

  // Mark dirty when form/evidence changes after hydrate (typing, AI fill, evidence).
  useEffect(() => {
    if (!hydratedRef.current) return
    dirtyRef.current = true
  }, [form, evidence])

  const setField = useCallback(
    (key: NcActionFieldKey, value: string) => {
      if (key === 'description_of_nc') return
      if (!isDirector && fieldAuthorsRef.current[key]) return
      touchedFieldsRef.current.add(key)
      setForm((prev) => ({ ...prev, [key]: value }))
      setSaveStatus('idle')
    },
    [isDirector],
  )

  const handleSaveAndClose = useCallback(async () => {
    clearAutosaveInterval()
    await persistForm(true)
  }, [clearAutosaveInterval, persistForm])

  const handleUploadEvidence = useCallback(
    async (key: NcActionFieldKey, fileList: FileList | null) => {
      if (!row || !fileList || fileList.length === 0) return
      if (key === 'description_of_nc') return
      if (!isDirector && fieldAuthorsRef.current[key]) return
      setUploadingField(key)
      setError(null)
      try {
        const uploaded: NcEvidenceFile[] = []
        for (const file of Array.from(fileList)) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `${row.checklistItemId}/${key}/${crypto.randomUUID()}_${safeName}`
          const { error: upErr } = await supabase.storage
            .from(NC_EVIDENCE_BUCKET)
            .upload(path, file, { upsert: false })
          if (upErr) throw upErr
          uploaded.push({
            id: crypto.randomUUID(),
            name: file.name,
            path,
            uploadedAt: new Date().toISOString(),
          })
        }
        setEvidence((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), ...uploaded],
        }))
        setSaveStatus('idle')
      } catch (err) {
        setError(err instanceof Error ? err.message : formatSupabaseError(err))
      } finally {
        setUploadingField(null)
        const input = fileInputRefs.current[key]
        if (input) input.value = ''
      }
    },
    [isDirector, row],
  )

  const handleViewEvidence = useCallback(async (file: NcEvidenceFile) => {
    try {
      const { data, error: urlErr } = await supabase.storage
        .from(NC_EVIDENCE_BUCKET)
        .createSignedUrl(file.path, 60 * 10)
      if (urlErr) throw urlErr
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      else throw new Error('Could not open evidence file.')
    } catch (err) {
      setError(err instanceof Error ? err.message : formatSupabaseError(err))
    }
  }, [])

  const handleRemoveEvidence = useCallback(
    async (key: NcActionFieldKey, file: NcEvidenceFile) => {
      if (key === 'description_of_nc') return
      if (!isDirector && fieldAuthorsRef.current[key]) return
      setError(null)
      try {
        await supabase.storage.from(NC_EVIDENCE_BUCKET).remove([file.path])
      } catch {
        // still remove from UI if storage delete fails (orphan cleanup later)
      }
      setEvidence((prev) => {
        const nextList = (prev[key] ?? []).filter((f) => f.id !== file.id && f.path !== file.path)
        const next = { ...prev }
        if (nextList.length === 0) delete next[key]
        else next[key] = nextList
        return next
      })
      setSaveStatus('idle')
    },
    [isDirector],
  )

  const handleAiFillField = useCallback(
    async (targetKey: NcActionFieldKey) => {
      if (!row || loading || aiFillingField != null || uploadingField != null) return
      if (targetKey === 'description_of_nc') return
      if (!isDirector && fieldAuthorsRef.current[targetKey]) return

      const meta = NC_ACTION_FIELDS.find((f) => f.key === targetKey)
      if (!meta) return

      setAiFillingField(targetKey)
      setError(null)
      try {
        const latestForm = formRef.current
        const context = [
          `Audit ID: ${row.auditId}`,
          `Audit Type: ${auditTypeLabel(row.auditType)}`,
          `Audit Date: ${formatProposedRange(row.proposedFrom, row.proposedTo)}`,
          `Clause No: ${row.clauseNo}`,
          `Clause Description: ${row.clauseMatter}`,
          `Observation: ${row.observation || '(none)'}`,
          `Non Conformity: ${row.nonConformity || '(none)'}`,
          '',
          `Target field to write: ${targetKey} (${meta.label})`,
          '',
          'Current form values (read-only context; write ONLY the target field):',
          ...NC_ACTION_FIELDS.map(
            ({ key, label }) =>
              `${key} (${label})${key === targetKey ? ' [TARGET]' : ''}: ${latestForm[key] || '(empty)'}`,
          ),
        ].join('\n')

        const { reply } = await sendQiAssistantMessage({
          page: 'audit-mrm/non-conformities',
          message: buildAiFillFieldMessage(targetKey, meta.label),
          context,
          activeRecordId: row.checklistItemId,
          activeRecordTable: 'audit_checklist_items',
          history: [],
        })

        const draft = extractJsonObject(reply)
        const value = String(draft[targetKey] ?? '').trim()
        if (!value) throw new Error('AI did not return text for this field.')

        touchedFieldsRef.current.add(targetKey)
        setForm((prev) => ({ ...prev, [targetKey]: value }))
        setSaveStatus('idle')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI fill failed.')
      } finally {
        setAiFillingField(null)
      }
    },
    [aiFillingField, isDirector, loading, row, uploadingField],
  )

  const statusLabel =
    saveStatus === 'saving'
      ? 'Auto-saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && hydratedRef.current) {
          clearAutosaveInterval()
          void persistForm(false)
        }
        onOpenChange(next)
      }}
    >
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
                {row
                  ? `NC Action — ${row.auditId} · Clause ${row.clauseNo}`
                  : 'NC Action'}
              </DialogTitle>
              {row ? (
                <p className="text-sm text-stone-300">
                  {auditTypeLabel(row.auditType)} ·{' '}
                  {formatProposedRange(row.proposedFrom, row.proposedTo)}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
          {error ? (
            <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {statusLabel ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <span
                className={cn(
                  'text-xs font-medium',
                  saveStatus === 'error' ? 'text-destructive' : 'text-amber-800',
                )}
              >
                {statusLabel}
              </span>
            </div>
          ) : null}

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading action form…</p>
          ) : !row ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No NC selected.</p>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <InfoBlock label="Clause Description" value={row.clauseMatter} />
              <InfoBlock label="Observation" value={row.observation} />

              <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                NC Action Form
              </p>

              {NC_ACTION_FIELDS.map(({ key, label, step }) => {
                const isFromNc = key === 'description_of_nc'
                const files = evidence[key] ?? []
                const uploading = uploadingField === key
                const aiBusy = aiFillingField === key
                const anyAiBusy = aiFillingField != null
                const author = fieldAuthors[key]
                const editable = !isFromNc && canEditField(key)
                const authorLine = author ? formatNcFieldAuthorLine(author) : ''

                if (isFromNc) {
                  return (
                    <div key={key} className="border border-stone-500 bg-[#f7f3eb] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                        {step}. {label}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-900">
                        {form[key].trim() || '—'}
                      </p>
                    </div>
                  )
                }

                return (
                  <div key={key} className="border border-stone-500 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor={`nc-action-${key}`}
                        className="min-w-0 text-xs font-semibold uppercase tracking-wide text-stone-600"
                      >
                        {step}. {label}
                      </Label>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {author ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(
                                  limsOutlineBtnClass,
                                  'h-7 max-w-[11rem] gap-1 px-2 text-[11px]',
                                )}
                                aria-label={`Input by ${author.name}`}
                                title={authorLine}
                              >
                                <UserRound size={12} className="shrink-0" />
                                <span className="truncate">{author.name}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-64 rounded-none border-stone-400 bg-[#f7f3eb] p-0"
                            >
                              <div className="space-y-1.5 px-3 py-2.5 text-xs text-stone-800">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                                  Input By
                                </p>
                                <p>
                                  <span className="text-stone-500">Name: </span>
                                  {author.name || '—'}
                                </p>
                                <p>
                                  <span className="text-stone-500">Designation: </span>
                                  {author.designation || '—'}
                                </p>
                                <p>
                                  <span className="text-stone-500">Department: </span>
                                  {author.department || '—'}
                                </p>
                                <p>
                                  <span className="text-stone-500">Division: </span>
                                  {author.division || '—'}
                                </p>
                                <p>
                                  <span className="text-stone-500">Date: </span>
                                  {author.date || '—'}
                                </p>
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                        {showAiButtons ? (
                          <Button
                            type="button"
                            size="sm"
                            className={cn(limsPrimaryBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
                            disabled={
                              !editable ||
                              anyAiBusy ||
                              uploadingField != null ||
                              saveStatus === 'saving'
                            }
                            onClick={() => void handleAiFillField(key)}
                            aria-label={`AI fill ${label}`}
                            title={
                              editable
                                ? 'AI fills this field only (reads all other fields)'
                                : 'View only — Laboratory Director can edit'
                            }
                          >
                            {aiBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}
                            {aiBusy ? 'AI…' : 'AI Fill'}
                          </Button>
                        ) : null}
                        <input
                          ref={(el) => {
                            fileInputRefs.current[key] = el
                          }}
                          type="file"
                          className="hidden"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => void handleUploadEvidence(key, e.target.files)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
                          disabled={
                            !editable || anyAiBusy || uploading || saveStatus === 'saving'
                          }
                          onClick={() => fileInputRefs.current[key]?.click()}
                          aria-label={`Upload evidence for ${label}`}
                          title={
                            editable
                              ? 'Attach evidence file(s)'
                              : 'View only — Laboratory Director can edit'
                          }
                        >
                          {uploading ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Paperclip size={12} />
                          )}
                          Evidence
                          {files.length > 0 ? (
                            <span className="tabular-nums text-amber-800">({files.length})</span>
                          ) : null}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id={`nc-action-${key}`}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      disabled={anyAiBusy}
                      readOnly={!editable}
                      rows={3}
                      className={cn(
                        limsFieldClass,
                        'mt-2 min-h-[4.5rem] resize-y rounded-none text-sm',
                        !editable && 'cursor-default bg-stone-50 text-stone-800',
                      )}
                      title={
                        editable
                          ? undefined
                          : 'View only — Laboratory Director can edit this field'
                      }
                    />
                    {author && !editable ? (
                      <p className="mt-1.5 text-[10px] text-stone-500">
                        View only · Filled by {author.name} · Laboratory Director may edit
                      </p>
                    ) : null}
                    {files.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {files.map((file) => (
                          <li
                            key={file.id}
                            className="flex items-center gap-2 border border-stone-300 bg-stone-50 px-2 py-1 text-xs text-stone-800"
                          >
                            <span className="min-w-0 flex-1 truncate" title={file.name}>
                              {file.name}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(limsOutlineBtnClass, 'h-6 gap-1 px-1.5 text-[10px]')}
                              onClick={() => void handleViewEvidence(file)}
                              aria-label={`View evidence ${file.name}`}
                            >
                              <Eye size={11} />
                              View
                            </Button>
                            {editable ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(
                                  limsOutlineBtnClass,
                                  'h-6 px-1.5 text-[10px] text-rose-700',
                                )}
                                onClick={() => void handleRemoveEvidence(key, file)}
                                aria-label={`Remove evidence ${file.name}`}
                              >
                                <X size={11} />
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex shrink-0 justify-end border-t border-stone-300 pt-3">
            <Button
              type="button"
              size="sm"
              className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
              disabled={!row || loading || aiFillingField != null || uploadingField != null || saveStatus === 'saving'}
              onClick={() => void handleSaveAndClose()}
              aria-label="Save NC action form and close"
            >
              {saveStatus === 'saving' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save & Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
