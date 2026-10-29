import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { AskReason } from '@/hooks/useReasonForChange'
import {
  NO_EQUIPMENT_LABEL,
  checkEquipmentUsableOn,
  equipmentMatchesSection,
  equipmentSnapshotsOf,
  noEquipmentEntryOf,
  snapshotFromOption,
  type EquipmentOption,
  type EquipmentUsedEntry,
  type EquipmentUsedSnapshot,
} from '@/lib/equipmentTraceability'

const OVERRIDE_QUICK_PICKS = [
  'New calibration certificate received; master not updated yet',
  'Verified by intermediate check before use',
  'Repair completed; breakdown register not closed yet',
  'No alternative equipment; impact assessed',
] as const

const NO_EQUIPMENT_QUICK_PICKS = [
  'Visual examination',
  'Calculated from other results',
  'Observation only',
] as const

/** Short justification: enough to explain, short enough for the record line. */
const NO_EQUIPMENT_REASON_MAX = 160

const checkboxClass =
  'h-4 w-4 shrink-0 rounded-none border-stone-500 text-amber-700 accent-amber-700 disabled:opacity-40'

/** Keeps clicks inside the on-demand reason dialog (own React root) from closing this one. */
const insideReasonDialog = (e: Event) =>
  e.target instanceof Element && Boolean(e.target.closest('[data-reason-for-change-root]'))

/**
 * Choose the equipment / CRMs used for one test parameter (ISO 17025 6.4, 7.5.1).
 * Items that are not usable on the test date are blocked; the Laboratory
 * Director may still pick one after giving a reason, recorded in the snapshot.
 * A parameter that needs no equipment (visual / calculation / observation) is
 * recorded as a single { kind: 'none', reason } entry with a required reason.
 * The items are shown as a table with search; mode 'view' shows only the
 * saved choice until Edit is pressed.
 */
export function EquipmentUsedPickerDialog({
  open,
  onOpenChange,
  testLabel,
  testDate,
  section,
  options,
  loading,
  loadError,
  initial,
  suggestedIds,
  isDirector,
  directorId,
  directorName,
  askReason,
  canApplyToOthers,
  onConfirm,
  mode = 'edit',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  testLabel: string
  testDate: string | null
  section: string | null
  options: EquipmentOption[]
  loading: boolean
  loadError: string | null
  initial: EquipmentUsedEntry[]
  /** Last selection for this parameter (used when nothing is selected yet). */
  suggestedIds: string[]
  isDirector: boolean
  directorId: string
  directorName: string
  askReason: AskReason
  canApplyToOthers: boolean
  onConfirm: (items: EquipmentUsedEntry[], applyToOthers: boolean) => void
  /** 'view' shows the saved choice read-only with an Edit button; 'edit' opens the form. */
  mode?: 'view' | 'edit'
}) {
  const [editing, setEditing] = useState(mode === 'edit')
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const initialSnapshots = useMemo(() => equipmentSnapshotsOf(initial), [initial])
  const initialNone = noEquipmentEntryOf(initial)
  const [noEquipment, setNoEquipment] = useState(Boolean(initialNone))
  const [noEquipmentReason, setNoEquipmentReason] = useState(initialNone?.reason ?? '')
  // Mounted fresh for each parameter (parent renders it only while open), so
  // the initial selection comes straight from the props.
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (initialSnapshots.length > 0) return new Set(initialSnapshots.map((s) => s.equipment_id))
    if (initialNone) return new Set()
    // Pre-select the last choice for this parameter, but only items usable on the test date.
    return new Set(
      suggestedIds.filter((id) => {
        const opt = options.find((o) => o.id === id)
        return opt ? checkEquipmentUsableOn(opt, testDate).usable : false
      }),
    )
  })
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const ov: Record<string, string> = {}
    for (const s of initialSnapshots) if (s.override_reason) ov[s.equipment_id] = s.override_reason
    return ov
  })
  const [search, setSearch] = useState('')
  const [sectionOnly, setSectionOnly] = useState(true)
  const [applyToOthers, setApplyToOthers] = useState(false)

  const hasSectionMatches = useMemo(
    () => options.some((o) => o.kind === 'equipment' && equipmentMatchesSection(o, section)),
    [options, section],
  )
  const filterBySection = sectionOnly && hasSectionMatches

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return options.filter((o) => {
      if (selected.has(o.id)) return true
      if (filterBySection && !equipmentMatchesSection(o, section)) return false
      if (!term) return true
      return `${o.assetCode} ${o.name} ${o.location ?? ''} ${o.calCertNo ?? ''}`.toLowerCase().includes(term)
    })
  }, [options, search, filterBySection, section, selected])

  const toggle = async (opt: EquipmentOption) => {
    if (selected.has(opt.id)) {
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(opt.id)
        return next
      })
      return
    }
    const check = checkEquipmentUsableOn(opt, testDate)
    if (!check.usable && !overrides[opt.id]) {
      if (!isDirector) return
      const reason = await askReason({
        title: 'Override: equipment not usable on the test date',
        recordLabel: `${opt.assetCode} ${opt.name} · ${check.reason ?? ''}`,
        description: 'Recorded with the result as a Laboratory Director override (ISO 17025 6.4).',
        confirmLabel: 'Use anyway',
        quickPicks: OVERRIDE_QUICK_PICKS,
      })
      if (!reason) return
      setOverrides((prev) => ({ ...prev, [opt.id]: reason }))
    }
    setSelected((prev) => new Set(prev).add(opt.id))
  }

  const noEquipmentReasonTrimmed = noEquipmentReason.trim()
  const canConfirm = noEquipment ? noEquipmentReasonTrimmed !== '' : true

  const confirm = () => {
    if (noEquipment) {
      if (!noEquipmentReasonTrimmed) return
      onConfirm([{ kind: 'none', reason: noEquipmentReasonTrimmed }], applyToOthers)
      return
    }
    const items: EquipmentUsedSnapshot[] = []
    for (const id of selected) {
      const opt = optionById.get(id)
      if (opt) {
        const reason = overrides[id]
        items.push(
          snapshotFromOption(
            opt,
            testDate,
            reason ? { reason, byId: directorId, byName: directorName } : undefined,
          ),
        )
      } else {
        // Saved earlier but no longer listed (e.g. deleted): keep the old snapshot.
        const old = initialSnapshots.find((s) => s.equipment_id === id)
        if (old) items.push(old)
      }
    }
    onConfirm(items, applyToOthers)
  }

  const viewNone = !editing ? initialNone : null
  const thClass = 'sticky top-0 z-10 border-b border-stone-700 bg-stone-900 px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-amber-100'
  const tdClass = 'border-b border-stone-200 px-2 py-1.5 align-top text-[11.5px]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        className={cn(limsDialogClass, '!flex !max-h-[88dvh] !w-[calc(100vw-1rem)] !max-w-5xl !flex-col !gap-0 !p-0')}
        onPointerDownOutside={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <DialogTitle className="text-base font-semibold text-white">
              {editing ? 'Add equipment / CRMs used' : 'Equipment / CRMs used'}
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-300">
              {testLabel} · test date {testDate ? formatDate(testDate) : 'today'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {editing ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-stone-300 bg-[#f7f3eb] px-4 py-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search asset code, name, certificate or location"
                aria-label="Search equipment"
                className="h-8 w-full max-w-[22rem] rounded-none border-stone-500 bg-white text-xs"
                autoFocus
              />
              {hasSectionMatches ? (
                <label className="flex items-center gap-1.5 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={sectionOnly}
                    onChange={(e) => setSectionOnly(e.target.checked)}
                  />
                  Only {section} equipment
                </label>
              ) : null}
              <span className="ml-auto text-xs text-stone-600">{selected.size} selected</span>
            </div>

            <div className="shrink-0 border-b border-stone-300 bg-white px-4 py-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={noEquipment}
                  onChange={(e) => setNoEquipment(e.target.checked)}
                />
                {NO_EQUIPMENT_LABEL}
              </label>
              {noEquipment ? (
                <div className="mt-2 space-y-1.5">
                  <Input
                    value={noEquipmentReason}
                    maxLength={NO_EQUIPMENT_REASON_MAX}
                    onChange={(e) => setNoEquipmentReason(e.target.value)}
                    placeholder="Justification (required), e.g. Visual examination"
                    aria-label="Justification for no equipment"
                    aria-invalid={!noEquipmentReasonTrimmed}
                    className={cn(
                      'h-8 rounded-none border-stone-500 bg-white text-xs',
                      !noEquipmentReasonTrimmed && 'border-red-600',
                    )}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {NO_EQUIPMENT_QUICK_PICKS.map((pick) => (
                      <button
                        key={pick}
                        type="button"
                        className="rounded-none border border-stone-400 px-1.5 py-0.5 text-[11px] text-stone-700 hover:bg-amber-50"
                        onClick={() => setNoEquipmentReason(pick)}
                      >
                        {pick}
                      </button>
                    ))}
                  </div>
                  {!noEquipmentReasonTrimmed ? (
                    <p className="text-[11px] font-medium text-red-700">Give a short justification.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <div className={cn('min-h-0 flex-1 overflow-auto bg-white', editing && noEquipment && 'pointer-events-none opacity-40')}>
          {viewNone ? (
            <p className="px-4 py-6 text-sm text-stone-800">
              <span className="font-semibold">No equipment used</span>
              {viewNone.reason.trim() ? ` · ${viewNone.reason.trim()}` : ''}
            </p>
          ) : !editing ? (
            initialSnapshots.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-stone-600">No equipment recorded for this result.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thClass}>Asset code</th>
                    <th className={thClass}>Equipment / CRM</th>
                    <th className={thClass}>Type</th>
                    <th className={thClass}>Cal. certificate</th>
                    <th className={thClass}>Cal. due / valid upto</th>
                    <th className={thClass}>Status at use</th>
                    <th className={thClass}>On the test date</th>
                  </tr>
                </thead>
                <tbody>
                  {initialSnapshots.map((sn) => {
                    const due = sn.kind === 'crm' ? sn.crm_valid_upto : sn.cal_due_date
                    return (
                      <tr key={sn.equipment_id}>
                        <td className={cn(tdClass, 'font-semibold whitespace-nowrap')}>{sn.asset_code || '—'}</td>
                        <td className={tdClass}>{sn.name || '—'}</td>
                        <td className={tdClass}>{sn.kind === 'crm' ? 'CRM' : 'Equipment'}</td>
                        <td className={tdClass}>{sn.cal_cert_no || '—'}</td>
                        <td className={cn(tdClass, 'whitespace-nowrap')}>{due ? formatDate(due) : '—'}</td>
                        <td className={tdClass}>{sn.status_at_use || '—'}</td>
                        <td className={cn(tdClass, sn.override_reason ? 'text-amber-800' : sn.usable === false ? 'text-red-700' : 'text-emerald-800')}>
                          {sn.override_reason
                            ? `Director override: ${sn.override_reason}`
                            : sn.usable === false
                              ? `Not usable: ${sn.reason ?? ''}`
                              : 'Usable'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-stone-600">Loading equipment…</p>
          ) : loadError ? (
            <p className="px-4 py-6 text-center text-sm text-red-700">{loadError}</p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-600">No equipment found.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cn(thClass, 'w-8')}>
                    <span className="sr-only">Select</span>
                  </th>
                  <th className={thClass}>Asset code</th>
                  <th className={thClass}>Equipment / CRM</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Cal. certificate</th>
                  <th className={thClass}>Cal. due / valid upto</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Location</th>
                  <th className={thClass}>On the test date</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const check = checkEquipmentUsableOn(o, testDate)
                  const isSelected = selected.has(o.id)
                  const overridden = Boolean(overrides[o.id])
                  const blocked = !check.usable && !overridden
                  const disabled = blocked && !isDirector && !isSelected
                  const due = o.kind === 'crm' ? o.crmValidUpto : o.calDueDate
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        'cursor-pointer hover:bg-amber-50/60',
                        isSelected && 'bg-amber-50',
                        disabled && 'cursor-not-allowed opacity-70',
                      )}
                      onClick={() => {
                        if (!disabled) void toggle(o)
                      }}
                    >
                      <td className={cn(tdClass, 'text-center')}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${o.assetCode} ${o.name}`}
                          checked={isSelected}
                          disabled={disabled}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => void toggle(o)}
                        />
                      </td>
                      <td className={cn(tdClass, 'font-semibold whitespace-nowrap')}>{o.assetCode || '—'}</td>
                      <td className={tdClass}>{o.name || '—'}</td>
                      <td className={tdClass}>{o.kind === 'crm' ? 'CRM' : 'Equipment'}</td>
                      <td className={tdClass}>{o.calCertNo || '—'}</td>
                      <td className={cn(tdClass, 'whitespace-nowrap')}>{due ? formatDate(due) : '—'}</td>
                      <td className={tdClass}>{o.status || '—'}</td>
                      <td className={tdClass}>{o.location || '—'}</td>
                      <td className={cn(tdClass, check.usable ? 'text-emerald-800' : overridden ? 'text-amber-800' : 'text-red-700')}>
                        {check.usable
                          ? 'Usable'
                          : overridden
                            ? `Director override: ${overrides[o.id]} (${check.reason})`
                            : `Not usable: ${check.reason}${isDirector ? ' — tick to override with a reason' : ''}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="relative shrink-0 flex-wrap items-center gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-between">
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          {!editing ? (
            <>
              <span className="relative text-xs text-stone-300">Double-click View in the results table also opens the form.</span>
              <Button type="button" className={cn(limsPrimaryBtnClass, 'relative')} onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          ) : (
            <>
              {canApplyToOthers ? (
                <label className="relative flex items-center gap-1.5 text-xs text-stone-200">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={applyToOthers}
                    onChange={(e) => setApplyToOthers(e.target.checked)}
                  />
                  Also use for other parameters in this section with no equipment yet
                </label>
              ) : (
                <span />
              )}
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'relative')}
                onClick={confirm}
                disabled={!canConfirm}
              >
                {noEquipment ? 'Record: no equipment used' : `Use ${selected.size} item${selected.size === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
