import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  LAB_NAME_CHANGED_EVENT,
  LAB_NAME_STORAGE_KEY,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'
import { useAuth } from '@/hooks/useAuth'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { buildMrmAgendaPrintHtml } from './buildMrmAgendaPrintHtml'
import { MrmAgendaFooterBar } from './MrmAgendaFooterBar'
import { MrmAgendaForm } from './MrmAgendaForm'
import { MrmAgendaHeaderBar } from './MrmAgendaHeaderBar'
import { MrmAgendaTable } from './MrmAgendaTable'
import {
  emptyMrmPlanForm,
  mapMrmPlanRow,
  nextMrmPlanCode,
  rowToForm,
  toAutoCapitalizedAgendaTitle,
  validateMrmAgendaItems,
  type MrmPlanForm,
  type MrmPlanRow,
  type MrmUserOption,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function getFirmInitialsFromLabName(labName: string): string {
  const parts = labName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'QI'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

async function fetchMrmUserOptions(): Promise<MrmUserOption[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  // Prefer list-users (includes email) when caller is allowed; else profiles without email.
  if (accessToken) {
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as unknown
        const rows =
          typeof payload === 'object' && payload && 'users' in payload
            ? ((payload as { users?: unknown }).users as unknown)
            : []
        const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
        return list
          .map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.full_name ?? '').trim(),
            email: String(row.email ?? '').trim(),
            mobile: String(row.mobile ?? '').trim(),
            designation: String(row.designation ?? '').trim(),
            department: String((row as { department_name?: unknown }).department_name ?? '').trim(),
            division: String((row as { division?: unknown }).division ?? '').trim(),
            status: String(row.status ?? 'Active'),
          }))
          .filter((u) => u.id && u.status.toLowerCase() !== 'inactive')
          .map(({ id, name, email, mobile, designation, department, division }) => ({
            id,
            name: name || email || id,
            email,
            mobile,
            designation,
            department,
            division,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch {
      // fall through to profiles
    }
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, designation, department_name, division, mobile, status')
    .order('full_name', { ascending: true })
  if (error) throw error

  return (Array.isArray(data) ? data : [])
    .filter((u) => String((u as { status?: string }).status ?? '').toLowerCase() !== 'inactive')
    .map((u) => {
      const r = u as Record<string, unknown>
      return {
        id: String(r.id ?? ''),
        name: String(r.full_name ?? '').trim() || String(r.id ?? ''),
        email: '',
        mobile: String(r.mobile ?? '').trim(),
        designation: String(r.designation ?? '').trim(),
        department: String(r.department_name ?? '').trim(),
        division: String(r.division ?? '').trim(),
      }
    })
    .filter((u) => u.id)
}

function openPrintWindow(html: string) {
  // Hidden iframe print avoids browser pop-up blockers (same pattern as Audit Plan).
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const cleanup = () => {
    try {
      document.body.removeChild(iframe)
    } catch {
      // ignore
    }
  }

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    cleanup()
    throw new Error('Unable to open print preview.')
  }

  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(cleanup, 800)
    }
  }

  iframe.onload = () => doPrint()

  doc.open()
  doc.write(html)
  doc.close()

  // Some browsers fire onload before we assign the handler for about:blank writes.
  window.setTimeout(doPrint, 300)
}

export default function MrmAgendaMasterPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<MrmPlanRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MrmPlanForm>(() => emptyMrmPlanForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [labName, setLabName] = useState(() => {
    try {
      return localStorage.getItem(LAB_NAME_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [firmInitials, setFirmInitials] = useState('QI')
  const [userOptions, setUserOptions] = useState<MrmUserOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  const dateRangeValid =
    form.plannedFrom.length > 0 &&
    form.plannedTo.length > 0 &&
    form.plannedFrom <= form.plannedTo

  const agendaValid = validateMrmAgendaItems(form.agendaItems) == null

  const canSave =
    form.planCode.trim().length > 0 &&
    dateRangeValid &&
    agendaValid &&
    !saveLoading &&
    !actionBusy

  const loadPlans = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const { data: plans, error } = await supabase
        .from('mrm_plans')
        .select('*')
        .order('planned_from', { ascending: false })
      if (error) throw error
      const planList = Array.isArray(plans) ? plans : []
      const ids = planList.map((p) => String((p as { id: string }).id))
      let agendaByPlan = new Map<string, Record<string, unknown>[]>()
      let recipientsByPlan = new Map<string, Record<string, unknown>[]>()
      if (ids.length > 0) {
        const [agendaRes, recipRes] = await Promise.all([
          supabase.from('mrm_agenda_items').select('*').in('plan_id', ids),
          supabase.from('mrm_plan_recipients').select('*').in('plan_id', ids),
        ])
        if (agendaRes.error) throw agendaRes.error
        if (recipRes.error) throw recipRes.error
        agendaByPlan = new Map()
        for (const row of Array.isArray(agendaRes.data) ? agendaRes.data : []) {
          const r = row as Record<string, unknown>
          const pid = String(r.plan_id ?? '')
          const list = agendaByPlan.get(pid) ?? []
          list.push(r)
          agendaByPlan.set(pid, list)
        }
        recipientsByPlan = new Map()
        for (const row of Array.isArray(recipRes.data) ? recipRes.data : []) {
          const r = row as Record<string, unknown>
          const pid = String(r.plan_id ?? '')
          const list = recipientsByPlan.get(pid) ?? []
          list.push(r)
          recipientsByPlan.set(pid, list)
        }
      }
      setRows(
        planList.map((p) => {
          const id = String((p as { id: string }).id)
          return mapMrmPlanRow(
            p as Record<string, unknown>,
            agendaByPlan.get(id) ?? [],
            recipientsByPlan.get(id) ?? [],
          )
        }),
      )
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  useEffect(() => {
    let canceled = false
    void (async () => {
      try {
        const { data } = await supabase
          .from('lab_settings')
          .select('lab_name')
          .eq('id', LAB_SETTINGS_SINGLETON_ID)
          .maybeSingle()
        if (canceled) return
        const name = String((data as { lab_name?: string } | null)?.lab_name ?? '').trim()
        if (name) {
          setLabName(name)
          setFirmInitials(getFirmInitialsFromLabName(name))
        }
      } catch {
        // ignore
      }
    })()
    const onLabName = () => {
      try {
        const name = localStorage.getItem(LAB_NAME_STORAGE_KEY) ?? ''
        setLabName(name)
        setFirmInitials(getFirmInitialsFromLabName(name))
      } catch {
        // ignore
      }
    }
    window.addEventListener(LAB_NAME_CHANGED_EVENT, onLabName)
    return () => {
      canceled = true
      window.removeEventListener(LAB_NAME_CHANGED_EVENT, onLabName)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const users = await fetchMrmUserOptions()
      setUserOptions(users)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Unable to load users')
      setUserOptions([])
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showForm) void loadUsers()
  }, [loadUsers, showForm])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.planCode,
        r.venue,
        r.chairperson,
        r.status,
        r.notes,
        ...r.recipients.map((x) => x.name),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const openNew = () => {
    setEditingId(null)
    setForm(
      emptyMrmPlanForm(
        nextMrmPlanCode(
          firmInitials,
          rows.map((r) => r.planCode),
        ),
      ),
    )
    setSaveMessage(null)
    setShowForm(true)
  }

  const openEdit = (row: MrmPlanRow) => {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setSaveMessage(null)
    setShowForm(true)
  }

  const persistPlan = useCallback(
    async (opts?: { markCommunicated?: boolean }) => {
      if (!form.planCode.trim() || !dateRangeValid) {
        setSaveMessage('Plan ID and valid date range are required.')
        return null
      }
      const agendaError = validateMrmAgendaItems(form.agendaItems)
      if (agendaError) {
        setSaveMessage(agendaError)
        return null
      }
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const status = opts?.markCommunicated ? 'communicated' : form.status
        const communicatedAt = opts?.markCommunicated
          ? new Date().toISOString()
          : status === 'communicated'
            ? new Date().toISOString()
            : null

        const planPayload = {
          plan_code: form.planCode.trim(),
          planned_from: form.plannedFrom,
          planned_to: form.plannedTo,
          venue: form.venue.trim(),
          chairperson: form.chairperson.trim(),
          status,
          notes: form.notes.trim(),
          communicated_at: communicatedAt,
        }

        let planId = editingId
        if (editingId) {
          const { error } = await supabase
            .from('mrm_plans')
            .update(planPayload)
            .eq('id', editingId)
          if (error) throw error
        } else {
          const { data, error } = await supabase
            .from('mrm_plans')
            .insert({ ...planPayload, created_by: user?.id ?? null })
            .select('id')
            .single()
          if (error) throw error
          planId = String((data as { id: string }).id)
          setEditingId(planId)
        }
        if (!planId) throw new Error('Plan id missing after save.')

        await supabase.from('mrm_agenda_items').delete().eq('plan_id', planId)
        const agendaRows = form.agendaItems.map((item, index) => ({
          plan_id: planId,
          clause_letter: item.clauseLetter.trim().toLowerCase() || `x${index + 1}`,
          title: toAutoCapitalizedAgendaTitle(item.title.trim()) || `Agenda point ${item.clauseLetter}`,
          sort_order: index + 1,
          included: item.included,
          remarks: item.remarks.trim(),
        }))
        const { error: agendaErr } = await supabase.from('mrm_agenda_items').insert(agendaRows)
        if (agendaErr) throw agendaErr

        await supabase.from('mrm_plan_recipients').delete().eq('plan_id', planId)
        if (form.recipients.length > 0) {
          const nowIso = opts?.markCommunicated ? new Date().toISOString() : null
          const recipRows = form.recipients
            .filter((r) => r.userId || r.name.trim())
            .map((r) => ({
            plan_id: planId,
            user_id: r.userId || null,
            name: r.name,
            email: r.email,
            mobile: r.mobile,
            designation: r.designation,
            department: r.department,
            division: r.division,
            marked_communicated_at: opts?.markCommunicated
              ? nowIso
              : r.markedCommunicatedAt,
            email_sent_at: r.emailSentAt,
            email_status: r.emailStatus,
            email_error: r.emailError,
          }))
          if (recipRows.length > 0) {
            const { error: recipErr } = await supabase.from('mrm_plan_recipients').insert(recipRows)
            if (recipErr) throw recipErr
          }
        }

        if (opts?.markCommunicated) {
          setForm((prev) => ({
            ...prev,
            status: 'communicated',
            recipients: prev.recipients.map((r) => ({
              ...r,
              markedCommunicatedAt: new Date().toISOString(),
            })),
          }))
        }

        await loadPlans()
        setSaveMessage(opts?.markCommunicated ? 'Communicated & saved.' : 'Plan saved.')
        return planId
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : formatSupabaseError(err))
        return null
      } finally {
        setSaveLoading(false)
      }
    },
    [dateRangeValid, editingId, form, loadPlans, user?.id],
  )

  const handleSave = async () => {
    await persistPlan()
  }

  const handleMarkCommunicated = async () => {
    if (form.recipients.filter((r) => r.userId || r.name.trim()).length === 0) {
      setSaveMessage('Select at least one recipient.')
      return
    }
    setActionBusy(true)
    try {
      await persistPlan({ markCommunicated: true })
    } finally {
      setActionBusy(false)
    }
  }

  const handlePrintAgenda = () => {
    try {
      const html = buildMrmAgendaPrintHtml({ labName, plan: form })
      openPrintWindow(html)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Print failed.')
    }
  }

  const handleSendEmail = async () => {
    if (form.recipients.filter((r) => r.userId || r.name.trim()).length === 0) {
      setSaveMessage('Select at least one recipient.')
      return
    }
    setActionBusy(true)
    setSaveMessage(null)
    try {
      const planId = await persistPlan()
      if (!planId) return

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Session expired. Please log in again.')

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-mrm-agenda`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        sent?: number
        failed?: number
        recipients?: Array<{
          userId?: string
          emailStatus?: string
          emailError?: string
          emailSentAt?: string | null
        }>
      } | null

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            (response.status === 503
              ? 'Email service not configured (RESEND_API_KEY). Recipients were saved.'
              : `Send failed (${response.status})`),
        )
      }

      if (payload?.recipients?.length) {
        const byUser = new Map(
          payload.recipients.map((r) => [String(r.userId ?? ''), r]),
        )
        setForm((prev) => ({
          ...prev,
          recipients: prev.recipients.map((r) => {
            const upd = byUser.get(r.userId)
            if (!upd) return r
            return {
              ...r,
              emailStatus:
                (upd.emailStatus as typeof r.emailStatus) ?? r.emailStatus,
              emailError: String(upd.emailError ?? ''),
              emailSentAt: upd.emailSentAt ?? r.emailSentAt,
            }
          }),
        }))
      }

      await loadPlans()
      setSaveMessage(
        `Email sent: ${payload?.sent ?? 0}` +
          (payload?.failed ? `, failed: ${payload.failed}` : ''),
      )
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : formatSupabaseError(err))
      await loadPlans()
    } finally {
      setActionBusy(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} MRM plan(s)?`)) return
    setListLoading(true)
    setSaveMessage(null)
    try {
      const { error } = await supabase
        .from('mrm_plans')
        .delete()
        .in('id', Array.from(selectedIds))
      if (error) throw error
      setSelectedIds(new Set())
      setSaveMessage('Deleted.')
      await loadPlans()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setListLoading(false)
    }
  }

  const handlePrintSelected = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    try {
      for (const row of selected) {
        const html = buildMrmAgendaPrintHtml({ labName, plan: rowToForm(row) })
        openPrintWindow(html)
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Print failed.')
    }
  }

  return (
    <div className={limsPageShellClass}>
      <MrmAgendaHeaderBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
      />

      {listError ? (
        <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {listError}
        </p>
      ) : null}

      <MrmAgendaTable
        rows={pageRows}
        loading={listLoading}
        selectedIds={selectedIds}
        onToggleAll={(checked) => {
          if (!checked) {
            setSelectedIds(new Set())
            return
          }
          setSelectedIds(new Set(pageRows.map((r) => r.id)))
        }}
        onToggleOne={(id, checked) => {
          setSelectedIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(id)
            else next.delete(id)
            return next
          })
        }}
        onEdit={openEdit}
      />

      <MrmAgendaFooterBar
        message={saveMessage}
        loading={listLoading || saveLoading || actionBusy}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={() => void handleDeleteSelected()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n < 1) return
          setPage(Math.min(pageCount, Math.floor(n)))
        }}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
            'left-0 top-0',
            'md:!left-[268px] md:!right-0 md:!w-[calc(100vw-268px)] md:!max-w-[calc(100vw-268px)]',
            '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? `Edit MRM Plan — ${form.planCode}` : 'New MRM Plan & Agenda'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
            {saveMessage ? (
              <p
                className={cn(
                  'mb-3 border-l-2 px-3 py-2 text-sm',
                  saveMessage.toLowerCase().includes('fail') ||
                    saveMessage.toLowerCase().includes('error') ||
                    saveMessage.toLowerCase().includes('unable') ||
                    saveMessage.toLowerCase().includes('expired') ||
                    saveMessage.toLowerCase().includes('blocked') ||
                    saveMessage.toLowerCase().includes('not configured')
                    ? 'border-destructive bg-destructive/5 text-destructive'
                    : 'border-emerald-600 bg-emerald-50 text-emerald-900',
                )}
              >
                {saveMessage}
              </p>
            ) : null}
            <MrmAgendaForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
              userOptions={userOptions}
              usersLoading={usersLoading}
              usersError={usersError}
              actionBusy={actionBusy || saveLoading}
              onMarkCommunicated={() => void handleMarkCommunicated()}
              onPrintAgenda={handlePrintAgenda}
              onSendEmail={() => void handleSendEmail()}
              showCommunicationActions
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
