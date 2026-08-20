import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, ClipboardList, Loader2, Mail, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  createEmptyAgendaItem,
  createEmptyRecipient,
  recipientFromUser,
  toAutoCapitalizedAgendaTitle,
  validateMrmAgendaItems,
  type MrmAgendaItemForm,
  type MrmPlanForm,
  type MrmPlanStatus,
  type MrmRecipientForm,
  type MrmUserOption,
} from './types'

function AgendaPointsDialog({
  open,
  onOpenChange,
  items,
  onChange,
  showErrors,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MrmAgendaItemForm[]
  onChange: (items: MrmAgendaItemForm[]) => void
  showErrors: boolean
}) {
  const validationError = validateMrmAgendaItems(items)
  const list = items.length > 0 ? items : [createEmptyAgendaItem([])]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'z-[80] flex max-h-[90vh] w-[min(960px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Agenda Points
            </DialogTitle>
            <p className="text-sm text-stone-300">ISO/IEC 17025 Clause 8.9.2 management review inputs</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4">
          <div className="overflow-x-auto border-2 border-stone-500 bg-white">
            <Table className="min-w-[640px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]">
              <TableHeader>
                <TableRow className={cn(limsTableHeadClass, 'hover:bg-stone-800')}>
                  <TableHead className="w-14 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-amber-200/50 bg-stone-700 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      checked={items.length > 0 && items.every((i) => i.included)}
                      ref={(el) => {
                        if (!el) return
                        const some = items.some((i) => i.included)
                        const all = items.length > 0 && items.every((i) => i.included)
                        el.indeterminate = some && !all
                      }}
                      onChange={(e) => {
                        const included = e.target.checked
                        onChange(items.map((item) => ({ ...item, included })))
                      }}
                      aria-label="Select all agenda points"
                      title="Select all"
                    />
                  </TableHead>
                  <TableHead className="text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Agenda Point
                  </TableHead>
                  <TableHead className="w-20 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={limsTableBodyToneClass}>
                {list.map((item, index) => {
                  const isLast = index === list.length - 1
                  const titleInvalid = showErrors && item.included && !item.title.trim()
                  return (
                    <TableRow
                      key={item.key}
                      className={cn(
                        index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-white',
                        'hover:bg-amber-50/70',
                      )}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          checked={item.included}
                          onChange={() => {
                            const next = [...items]
                            if (next.length === 0) {
                              onChange([{ ...item, included: !item.included }])
                              return
                            }
                            next[index] = { ...item, included: !item.included }
                            onChange(next)
                          }}
                          aria-label={`Select agenda ${item.clauseLetter}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={item.title}
                          onChange={(e) => {
                            const next = items.length > 0 ? [...items] : [item]
                            next[index] = {
                              ...item,
                              title: toAutoCapitalizedAgendaTitle(e.target.value),
                            }
                            onChange(next)
                          }}
                          onBlur={(e) => {
                            const next = items.length > 0 ? [...items] : [item]
                            next[index] = {
                              ...item,
                              title: toAutoCapitalizedAgendaTitle(e.target.value.trim()),
                            }
                            onChange(next)
                          }}
                          required={item.included}
                          aria-invalid={titleInvalid}
                          className={cn(
                            limsFieldClass,
                            'h-8 w-full',
                            titleInvalid &&
                              'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
                          )}
                          aria-label={`Agenda point ${item.clauseLetter}`}
                          placeholder="Agenda point…"
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        {isLast ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0')}
                            onClick={() => {
                              const base = items.length > 0 ? items : [item]
                              onChange([...base, createEmptyAgendaItem(base)])
                            }}
                            aria-label="Add agenda point"
                            title="Add agenda point"
                          >
                            <Plus size={14} />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0 text-rose-700')}
                            onClick={() => {
                              onChange(
                                items
                                  .filter((_, i) => i !== index)
                                  .map((row, i) => ({ ...row, sortOrder: i + 1 })),
                              )
                            }}
                            aria-label={`Delete agenda ${item.clauseLetter}`}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {showErrors && validationError ? (
            <p className="text-xs text-destructive">{validationError}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-stone-300 bg-white px-4 py-3">
          <Button
            type="button"
            size="sm"
            className={cn(limsPrimaryBtnClass, 'h-9')}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PersonNamePicker({
  userOptions,
  usedUserIds,
  recipient,
  onPick,
  disabled,
}: {
  userOptions: MrmUserOption[]
  usedUserIds: Set<string>
  recipient: MrmRecipientForm
  onPick: (user: MrmUserOption | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedLabel = recipient.name || ''

  const options = useMemo<FilterComboboxOption[]>(() => {
    const q = (open ? query : selectedLabel).trim().toLowerCase()
    return userOptions
      .filter((u) => {
        if (usedUserIds.has(u.id) && u.id !== recipient.userId) return false
        if (!q) return true
        const blob = `${u.name} ${u.email} ${u.designation} ${u.department} ${u.division}`.toLowerCase()
        return blob.includes(q)
      })
      .slice(0, 50)
      .map((u) => ({
        id: u.id,
        label: u.name,
        secondaryLabel: [u.designation, u.department, u.division].filter(Boolean).join(' · ') || undefined,
      }))
  }, [open, query, recipient.userId, selectedLabel, usedUserIds, userOptions])

  const byId = useMemo(() => new Map(userOptions.map((u) => [u.id, u])), [userOptions])

  return (
    <FilterCombobox
      listId={`mrm-comm-person-${recipient.key}`}
      value={open ? query : selectedLabel}
      onValueChange={(v) => {
        setQuery(v)
        if (!open) setOpen(true)
        if (!v.trim()) onPick(null)
      }}
      options={options}
      onSelectOption={(opt) => {
        onPick(byId.get(opt.id) ?? null)
        setQuery(opt.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery(selectedLabel)
      }}
      placeholder="Type & select person…"
      disabled={disabled}
      inputClassName={cn(limsFieldClass, 'h-8')}
    />
  )
}

function CommunicationDialog({
  open,
  onOpenChange,
  form,
  onChange,
  userOptions,
  usersLoading,
  usersError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: MrmPlanForm
  onChange: (next: MrmPlanForm) => void
  userOptions: MrmUserOption[]
  usersLoading: boolean
  usersError: string | null
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())

  const rows = useMemo(() => {
    if (form.recipients.length === 0) return [createEmptyRecipient()]
    return form.recipients.map((r, idx) => ({
      ...r,
      key: r.key || `recip-${r.userId || idx}`,
      mobile: r.mobile ?? '',
    }))
  }, [form.recipients])

  const usedUserIds = useMemo(
    () => new Set(rows.map((r) => r.userId).filter(Boolean)),
    [rows],
  )

  const setRecipients = (next: MrmRecipientForm[]) => {
    onChange({ ...form, recipients: next })
  }

  const updateRow = (index: number, nextRow: MrmRecipientForm) => {
    const next = [...rows]
    next[index] = nextRow
    setRecipients(next)
  }

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  const allSelectableKeys = rows.filter((r) => r.userId || r.name.trim()).map((r) => r.key)
  const allSelected =
    allSelectableKeys.length > 0 && allSelectableKeys.every((k) => selectedKeys.has(k))

  const emailStatusLabel = (status: MrmRecipientForm['emailStatus']) => {
    if (status === 'sent') return 'Sent'
    if (status === 'failed') return 'Failed'
    if (status === 'skipped') return 'Skipped'
    return 'Pending'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="z-[80] lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="z-[80] !items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          'z-[80] !flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:!left-[268px] lg:!right-0 lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Communication — Related Persons
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
          {usersError ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {usersError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span>
              Selected: {selectedKeys.size} · Recipients:{' '}
              {rows.filter((r) => r.userId || r.name.trim()).length}
            </span>
            {usersLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Loading users…
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-2 border-stone-500 bg-white">
            <Table className="min-w-[1100px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]">
              <TableHeader>
                <TableRow className={cn(limsTableHeadClass, 'hover:bg-stone-800')}>
                  <TableHead className="w-12 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-amber-200/50 bg-stone-700 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      checked={allSelected}
                      ref={(el) => {
                        if (!el) return
                        const some = allSelectableKeys.some((k) => selectedKeys.has(k))
                        el.indeterminate = some && !allSelected
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedKeys(new Set(allSelectableKeys))
                        else setSelectedKeys(new Set())
                      }}
                      aria-label="Select all recipients"
                    />
                  </TableHead>
                  <TableHead className="min-w-[11rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Name of the Person
                  </TableHead>
                  <TableHead className="min-w-[8rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Division
                  </TableHead>
                  <TableHead className="min-w-[8rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Department
                  </TableHead>
                  <TableHead className="min-w-[8rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Designation
                  </TableHead>
                  <TableHead className="min-w-[10rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Email ID
                  </TableHead>
                  <TableHead className="min-w-[8rem] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Mobile Number
                  </TableHead>
                  <TableHead className="w-28 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Mark Communication
                  </TableHead>
                  <TableHead className="w-24 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Email Send
                  </TableHead>
                  <TableHead className="w-16 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={limsTableBodyToneClass}>
                {rows.map((row, index) => {
                  const isLast = index === rows.length - 1
                  const checked = selectedKeys.has(row.key)
                  const marked = Boolean(row.markedCommunicatedAt)
                  return (
                    <TableRow
                      key={row.key}
                      className={cn(
                        index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-white',
                        'hover:bg-amber-50/70',
                        checked && 'bg-amber-50',
                      )}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          checked={checked}
                          disabled={!row.userId && !row.name.trim()}
                          onChange={() => toggleSelect(row.key)}
                          aria-label={`Select ${row.name || `row ${index + 1}`}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <PersonNamePicker
                          userOptions={userOptions}
                          usedUserIds={usedUserIds}
                          recipient={row}
                          disabled={usersLoading}
                          onPick={(user) => {
                            if (!user) {
                              updateRow(index, {
                                ...createEmptyRecipient(),
                                key: row.key,
                                markedCommunicatedAt: row.markedCommunicatedAt,
                                emailSentAt: row.emailSentAt,
                                emailStatus: row.emailStatus,
                                emailError: row.emailError,
                              })
                              return
                            }
                            updateRow(index, recipientFromUser(user, row))
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.division}
                          readOnly
                          tabIndex={-1}
                          className={cn(limsFieldClass, 'h-8 bg-stone-100')}
                          aria-label={`Division ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.department}
                          readOnly
                          tabIndex={-1}
                          className={cn(limsFieldClass, 'h-8 bg-stone-100')}
                          aria-label={`Department ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.designation}
                          readOnly
                          tabIndex={-1}
                          className={cn(limsFieldClass, 'h-8 bg-stone-100')}
                          aria-label={`Designation ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.email}
                          readOnly
                          tabIndex={-1}
                          className={cn(limsFieldClass, 'h-8 bg-stone-100')}
                          aria-label={`Email ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell className="align-middle">
                        <Input
                          value={row.mobile}
                          readOnly
                          tabIndex={-1}
                          className={cn(limsFieldClass, 'h-8 bg-stone-100')}
                          aria-label={`Mobile ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          checked={marked}
                          disabled={!row.userId && !row.name.trim()}
                          onChange={(e) => {
                            updateRow(index, {
                              ...row,
                              markedCommunicatedAt: e.target.checked
                                ? new Date().toISOString()
                                : null,
                            })
                          }}
                          aria-label={`Mark communication ${row.name || index + 1}`}
                          title={marked ? 'Marked communicated' : 'Mark communicated'}
                        />
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <span
                          className={cn(
                            'text-[11px] font-semibold uppercase tracking-wide',
                            row.emailStatus === 'sent' && 'text-emerald-700',
                            row.emailStatus === 'failed' && 'text-rose-700',
                            row.emailStatus === 'pending' && 'text-stone-500',
                            row.emailStatus === 'skipped' && 'text-amber-700',
                          )}
                          title={row.emailError || undefined}
                        >
                          {row.userId || row.name.trim() ? emailStatusLabel(row.emailStatus) : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        {isLast ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0')}
                            onClick={() => setRecipients([...rows, createEmptyRecipient()])}
                            aria-label="Add related person"
                            title="Add related person"
                          >
                            <Plus size={14} />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0 text-rose-700')}
                            onClick={() => {
                              const next = rows.filter((_, i) => i !== index)
                              setRecipients(next.length > 0 ? next : [createEmptyRecipient()])
                              setSelectedKeys((prev) => {
                                const n = new Set(prev)
                                n.delete(row.key)
                                return n
                              })
                            }}
                            aria-label={`Delete ${row.name || `row ${index + 1}`}`}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            size="sm"
            className={cn(limsPrimaryBtnClass, 'h-9')}
            onClick={() => {
              const cleaned = rows.filter((r) => r.userId || r.name.trim())
              onChange({ ...form, recipients: cleaned })
              onOpenChange(false)
            }}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MrmAgendaForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  userOptions,
  usersLoading,
  usersError,
  actionBusy,
  onMarkCommunicated,
  onPrintAgenda,
  onSendEmail,
  showCommunicationActions,
}: {
  form: MrmPlanForm
  onChange: (next: MrmPlanForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  userOptions: MrmUserOption[]
  usersLoading: boolean
  usersError: string | null
  actionBusy: boolean
  onMarkCommunicated: () => void
  onPrintAgenda: () => void
  onSendEmail: () => void
  showCommunicationActions: boolean
}) {
  const [showAgendaErrors, setShowAgendaErrors] = useState(false)
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false)
  const [communicationDialogOpen, setCommunicationDialogOpen] = useState(false)

  const agendaValidationError = validateMrmAgendaItems(form.agendaItems)
  const includedCount = form.agendaItems.filter((i) => i.included).length

  const set = <K extends keyof MrmPlanForm>(key: K, value: MrmPlanForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  const recipientCount = form.recipients.filter((r) => r.userId || r.name.trim()).length

  useEffect(() => {
    if (userOptions.length === 0 || form.recipients.length === 0) return
    const byId = new Map(userOptions.map((u) => [u.id, u]))
    let changed = false
    const next = form.recipients.map((r) => {
      const u = byId.get(r.userId)
      if (!u) return r
      const email = r.email || u.email
      const mobile = r.mobile || u.mobile
      const name = r.name || u.name
      const designation = r.designation || u.designation
      const department = r.department || u.department
      const division = r.division || u.division
      if (
        email !== r.email ||
        mobile !== r.mobile ||
        name !== r.name ||
        designation !== r.designation ||
        department !== r.department ||
        division !== r.division
      ) {
        changed = true
        return { ...r, email, mobile, name, designation, department, division }
      }
      return r
    })
    if (changed) onChange({ ...form, recipients: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync profile fields once when options load
  }, [userOptions])

  return (
    <div className={labRegistryFormClass}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="mrm-plan-code">Plan ID</Label>
          <Input
            id="mrm-plan-code"
            value={form.planCode}
            onChange={(e) => set('planCode', e.target.value)}
            className={limsFieldClass}
            aria-label="Plan ID"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mrm-from">
            From <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mrm-from"
            type="date"
            value={form.plannedFrom}
            onChange={(e) => set('plannedFrom', e.target.value)}
            className={limsFieldClass}
            aria-label="Planned from date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mrm-to">
            To <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mrm-to"
            type="date"
            value={form.plannedTo}
            onChange={(e) => set('plannedTo', e.target.value)}
            className={limsFieldClass}
            aria-label="Planned to date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mrm-venue">Venue</Label>
          <Input
            id="mrm-venue"
            value={form.venue}
            onChange={(e) => set('venue', e.target.value)}
            className={limsFieldClass}
            aria-label="Venue"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mrm-chair">Chairperson</Label>
          <Input
            id="mrm-chair"
            value={form.chairperson}
            onChange={(e) => set('chairperson', e.target.value)}
            className={limsFieldClass}
            aria-label="Chairperson"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mrm-status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => set('status', v as MrmPlanStatus)}
          >
            <SelectTrigger id="mrm-status" className={limsFieldClass} aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="communicated">Communicated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        2. Agenda points
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
          onClick={() => setAgendaDialogOpen(true)}
          aria-label="Open agenda points"
        >
          <ClipboardList size={14} />
          Agenda Points
          <span className="tabular-nums text-amber-100/90">
            ({includedCount}/{form.agendaItems.length || 0})
          </span>
        </Button>
        {showAgendaErrors && agendaValidationError ? (
          <p className="text-xs text-destructive">{agendaValidationError}</p>
        ) : (
          <p className="text-xs text-stone-500">
            Opens agenda list in a separate window
          </p>
        )}
      </div>

      <AgendaPointsDialog
        open={agendaDialogOpen}
        onOpenChange={setAgendaDialogOpen}
        items={form.agendaItems}
        onChange={(agendaItems) => set('agendaItems', agendaItems)}
        showErrors={showAgendaErrors}
      />

      <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        3. Communication — related persons
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
          onClick={() => setCommunicationDialogOpen(true)}
          aria-label="Open communication related persons"
        >
          <Mail size={14} />
          Communication
          <span className="tabular-nums text-amber-100/90">
            ({recipientCount})
          </span>
        </Button>
        <p className="text-xs text-stone-500">
          Opens related persons list in a separate window
        </p>
      </div>

      <CommunicationDialog
        open={communicationDialogOpen}
        onOpenChange={setCommunicationDialogOpen}
        form={form}
        onChange={onChange}
        userOptions={userOptions}
        usersLoading={usersLoading}
        usersError={usersError}
      />

      {showCommunicationActions ? (
        <div className="flex flex-wrap gap-2 border-t border-stone-300 pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'h-8 gap-1.5')}
            disabled={actionBusy || recipientCount === 0}
            onClick={onMarkCommunicated}
          >
            <CheckSquare size={14} />
            Mark Communicated
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'h-8 gap-1.5')}
            disabled={actionBusy}
            onClick={onPrintAgenda}
          >
            <Printer size={14} />
            Print Agenda
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(limsPrimaryBtnClass, 'h-8 gap-1.5')}
            disabled={actionBusy || recipientCount === 0}
            onClick={onSendEmail}
          >
            {actionBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Send Email
          </Button>
        </div>
      ) : (
        <p className="text-xs text-stone-500">
          Save the plan first to enable Mark Communicated / Print / Send Email for this record.
        </p>
      )}

      <div className="flex justify-end border-t border-stone-300 pt-3">
        <Button
          type="button"
          size="sm"
          className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
          disabled={!canSave || saveLoading || actionBusy}
          onClick={() => {
            setShowAgendaErrors(true)
            if (validateMrmAgendaItems(form.agendaItems)) {
              setAgendaDialogOpen(true)
              return
            }
            onSave()
          }}
          aria-label="Save MRM plan"
        >
          {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Plan
        </Button>
      </div>
    </div>
  )
}
