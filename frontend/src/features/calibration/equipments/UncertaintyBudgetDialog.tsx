import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookmarkPlus,
  Calculator,
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  deleteSavedColumnFormula,
  loadSavedColumnFormulas,
  saveColumnFormula,
  type SavedColumnFormula,
} from '@/features/calibration/equipments/savedColumnFormulas'
import {
  MU_CALIBRATION_POINT_COLUMN,
  MU_CALIBRATION_POINT_FIELD_KEY,
  MU_EQUIPMENT_RANGE_FIELD_COLUMNS,
  createUncertaintyBudgetTableFromColumns,
  defaultMuUncertaintyBudget,
  clampMuBudgetDecimalPlaces,
  emptyMuBudgetCell,
  emptyMuUncertaintyBudgetRow,
  isMuEquipmentRangeFieldKey,
  newUncertaintyBudgetColumnKey,
  type MuBudgetCell,
  type MuBudgetFieldType,
  type MuSheetSection,
  type MuUncertaintyBudget,
  type MuUncertaintyBudgetColumnDef,
  type MuUncertaintyBudgetRow,
} from './muCalculationTypes'

export type UncertaintySourceOption = {
  id: string
  group: 'Type A' | 'Type B'
  label: string
}

function collectSectionComponentOptions(
  section: MuSheetSection | null | undefined,
  group: 'Type A' | 'Type B',
): UncertaintySourceOption[] {
  if (!section?.tables?.length) return []
  return section.tables.map((table, index) => {
    const label = table.label.trim() || `Component ${index + 1}`
    return {
      id: `${group}:${table.id}`,
      group,
      label,
    }
  })
}

const DISTRIBUTIONS = [
  'Normal',
  'Rectangular',
  'Triangular',
  'U-shaped',
  'Other',
] as const

type BudgetSummaryField = 'combinedUncertainty' | 'coverageFactorK' | 'expandedUncertainty'

const SUMMARY_FIELDS: Array<{ key: BudgetSummaryField; label: string; placeholder: string }> = [
  { key: 'combinedUncertainty', label: 'Combined Uncertainty', placeholder: 'u_c' },
  { key: 'coverageFactorK', label: 'Coverage Factor k', placeholder: '2' },
  { key: 'expandedUncertainty', label: 'Expanded Uncertainty ± (%)', placeholder: 'U' },
]

type BudgetFormulaRef = {
  key: string
  label: string
  kind: 'budget' | 'summary' | 'range' | 'point'
}

function bracketLabel(label: string): string {
  return `[${label.trim() || 'Untitled'}]`
}

function findAutocompleteToken(
  value: string,
  cursor: number,
): { start: number; end: number; query: string } | null {
  const before = value.slice(0, cursor)
  const openIdx = before.lastIndexOf('[')
  const closeIdx = before.lastIndexOf(']')
  if (openIdx > closeIdx) {
    return {
      start: openIdx + 1,
      end: cursor,
      query: before.slice(openIdx + 1),
    }
  }
  const match = /(?:^|[=+\-*/(,])\s*([^+\-*/(,=\[\]]+)$/.exec(before)
  if (!match) return null
  const token = match[1] ?? ''
  if (!token.trim()) return null
  return {
    start: cursor - token.length,
    end: cursor,
    query: token,
  }
}

function formulaRefKindClass(kind: BudgetFormulaRef['kind'] | 'unknown'): string {
  switch (kind) {
    case 'budget':
      return 'font-semibold text-indigo-700'
    case 'summary':
      return 'font-semibold text-violet-700'
    case 'range':
      return 'font-semibold text-emerald-700'
    case 'point':
      return 'font-semibold text-amber-700'
    default:
      return 'font-semibold text-rose-500/90'
  }
}

function renderFormulaHighlighted(value: string, refs: BudgetFormulaRef[]): ReactNode {
  if (!value) return <span>{'\u00a0'}</span>

  const byLabel = new Map(
    refs.map((r) => [r.label.trim().toLowerCase(), r.kind] as const),
  )

  const parts: ReactNode[] = []
  const re = /(\[[^\]]*\])/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} className="text-slate-800">
          {value.slice(lastIndex, match.index)}
        </span>,
      )
    }
    const token = match[1] ?? ''
    const inner = token.slice(1, -1).trim().toLowerCase()
    const kind = byLabel.get(inner) ?? 'unknown'
    parts.push(
      <span key={key++} className={formulaRefKindClass(kind)}>
        {token}
      </span>,
    )
    lastIndex = match.index + token.length
  }

  if (lastIndex < value.length) {
    parts.push(
      <span key={key++} className="text-slate-800">
        {value.slice(lastIndex)}
      </span>,
    )
  }

  return parts.length > 0 ? <>{parts}</> : <span>{'\u00a0'}</span>
}

function columnMinWidth(key: string): string {
  if (key === 'sourceOfUncertainty') return 'min-w-[180px]'
  if (key === 'probabilityDistribution') return 'min-w-[160px]'
  return 'min-w-[140px]'
}

function BudgetFormulaInput({
  id,
  value,
  onChange,
  refs,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  refs: BudgetFormulaRef[]
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [saveOpen, setSaveOpen] = useState(false)
  const [formulaName, setFormulaName] = useState('')
  const [savedFormulas, setSavedFormulas] = useState<SavedColumnFormula[]>([])
  const [libraryHint, setLibraryHint] = useState<string | null>(null)

  useEffect(() => {
    setSavedFormulas(loadSavedColumnFormulas())
  }, [])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`
  }, [value])

  const token = useMemo(() => findAutocompleteToken(value, cursor), [value, cursor])

  const suggestions = useMemo(() => {
    if (!token) return []
    const q = token.query.trim().toLowerCase()
    return refs.filter((r) => {
      const label = r.label.toLowerCase()
      const key = r.key.toLowerCase()
      return !q || label.includes(q) || key.includes(q)
    })
  }, [refs, token])

  useEffect(() => {
    setOpen(Boolean(token) && suggestions.length > 0)
    setHighlight(0)
  }, [token, suggestions.length])

  const insertRef = (ref: BudgetFormulaRef) => {
    if (!token) return
    const insert = bracketLabel(ref.label)
    const start = token.start
    const end = token.end
    let next: string
    if (value[start - 1] === '[') {
      const afterCursor = value.slice(end)
      const rest = afterCursor.startsWith(']') ? afterCursor.slice(1) : afterCursor
      next = `${value.slice(0, start - 1)}${insert}${rest}`
      const caret = start - 1 + insert.length
      onChange(next)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(caret, caret)
        setCursor(caret)
      })
      setOpen(false)
      return
    }
    next = `${value.slice(0, start)}${insert}${value.slice(end)}`
    const caret = start + insert.length
    onChange(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
      setCursor(caret)
    })
    setOpen(false)
  }

  const canSave = value.trim().length > 0 && value.trim() !== '='

  const handleSaveFormula = () => {
    if (!canSave) {
      setLibraryHint('Enter a formula before saving.')
      return
    }
    const name = formulaName.trim()
    if (!name) {
      setLibraryHint('Enter a name for this formula.')
      return
    }
    const next = saveColumnFormula(name, value)
    setSavedFormulas(next)
    setLibraryHint(`Saved “${name}”. Load anytime from Saved.`)
    setSaveOpen(false)
    setFormulaName('')
  }

  return (
    <div className="relative space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[11px]">
          Formula
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-slate-300 px-2 text-[11px] text-slate-700"
                aria-label="Saved formulas"
              >
                Saved
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-[90] max-h-72 w-80 overflow-y-auto"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
                Saved formulas ({savedFormulas.length})
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedFormulas.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No saved formulas yet. Enter a formula and click Save.
                </p>
              ) : (
                savedFormulas.map((item) => (
                  <div key={item.id} className="flex items-start gap-1 px-1 py-0.5">
                    <DropdownMenuItem
                      className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5"
                      onSelect={() => {
                        onChange(item.expression)
                        setLibraryHint(`Loaded “${item.name}”.`)
                        setSaveOpen(false)
                      }}
                    >
                      <span className="truncate font-medium text-slate-800">{item.name}</span>
                      <span className="w-full truncate font-mono text-[10px] text-slate-500">
                        {item.expression}
                      </span>
                    </DropdownMenuItem>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-0.5 h-8 w-8 shrink-0 px-0 text-destructive hover:bg-destructive/10"
                      aria-label={`Delete formula ${item.name}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const next = deleteSavedColumnFormula(item.id)
                        setSavedFormulas(next)
                        setLibraryHint(`Deleted “${item.name}”.`)
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-7 gap-1.5 px-2 text-[11px]',
              saveOpen
                ? 'border-indigo-600/50 bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                : 'border-slate-300 text-slate-700',
            )}
            disabled={!canSave && !saveOpen}
            onClick={() => {
              setLibraryHint(null)
              setSaveOpen((v) => !v)
            }}
            aria-expanded={saveOpen}
          >
            <BookmarkPlus size={13} />
            Save
          </Button>
        </div>
      </div>

      {saveOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2">
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor={`${id}-save-name`} className="text-[11px]">
              Formula name
            </Label>
            <Input
              id={`${id}-save-name`}
              value={formulaName}
              onChange={(e) => setFormulaName(e.target.value)}
              placeholder="e.g. u_i contribution"
              className="h-8 bg-white text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveFormula()
                }
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-indigo-600 text-white hover:bg-indigo-500"
            onClick={handleSaveFormula}
            disabled={!canSave}
          >
            Save formula
          </Button>
        </div>
      ) : null}

      {libraryHint ? <p className="text-[11px] text-indigo-800">{libraryHint}</p> : null}

      <div className="relative min-h-[4.5rem] overflow-hidden rounded-md border border-input bg-white shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-3 py-2 font-mono text-sm leading-6 text-slate-900"
        >
          {renderFormulaHighlighted(value, refs)}
        </div>
        <textarea
          ref={inputRef}
          id={id}
          rows={3}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder="=[Standard Uncertainty]*[Sensitivity Coefficient]"
          className="relative block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent px-3 py-2 font-mono text-sm leading-6 text-transparent caret-slate-900 outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            onChange(e.target.value.replace(/\r?\n/g, ''))
            setCursor(e.target.selectionStart ?? e.target.value.length)
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) {
              if (e.key === 'Enter') e.preventDefault()
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => (h + 1) % suggestions.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              const pick = suggestions[highlight]
              if (pick) insertRef(pick)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          aria-label="Uncertainty budget formula"
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>

      {open ? (
        <ul
          className="absolute z-[90] mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((ref, i) => (
            <li key={ref.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm',
                  i === highlight
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  insertRef(ref)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{ref.label}</span>
                  {ref.kind === 'budget' ? (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700">
                      Budget
                    </span>
                  ) : null}
                  {ref.kind === 'summary' ? (
                    <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-800">
                      Summary
                    </span>
                  ) : null}
                  {ref.kind === 'range' ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
                      Range
                    </span>
                  ) : null}
                  {ref.kind === 'point' ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-900">
                      Point
                    </span>
                  ) : null}
                </span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-slate-400">
                  {bracketLabel(ref.label)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function BudgetFormulaDialog({
  open,
  onOpenChange,
  title,
  value,
  decimalPlaces,
  onChange,
  refs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  decimalPlaces: number
  onChange: (next: { value: string; decimalPlaces: number }) => void
  refs: BudgetFormulaRef[]
}) {
  const [draft, setDraft] = useState(value || '=')
  const [draftDecimals, setDraftDecimals] = useState(
    clampMuBudgetDecimalPlaces(decimalPlaces, 2),
  )
  const [tab, setTab] = useState('formula')

  useEffect(() => {
    if (open) {
      setDraft(value?.trim() ? value : '=')
      setDraftDecimals(clampMuBudgetDecimalPlaces(decimalPlaces, 2))
      setTab('formula')
    }
  }, [open, value, decimalPlaces])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
          <DialogHeader className="text-left">
            <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
              Uncertainty Budget
            </p>
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Formula — {title}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="mb-3 grid h-9 w-full grid-cols-2">
              <TabsTrigger value="formula" className="text-xs sm:text-sm">
                Formula
              </TabsTrigger>
              <TabsTrigger value="decimals" className="text-xs sm:text-sm">
                Decimals
              </TabsTrigger>
            </TabsList>
            <TabsContent value="formula" className="mt-0 outline-none">
              <BudgetFormulaInput
                id={`ub-formula-${title.replace(/\s+/g, '-').toLowerCase()}`}
                value={draft}
                onChange={setDraft}
                refs={refs}
              />
            </TabsContent>
            <TabsContent value="decimals" className="mt-0 space-y-2 outline-none">
              <Label htmlFor={`ub-dec-${title.replace(/\s+/g, '-').toLowerCase()}`} className="text-[11px]">
                Decimal places
              </Label>
              <Input
                id={`ub-dec-${title.replace(/\s+/g, '-').toLowerCase()}`}
                type="number"
                min={0}
                max={6}
                className="h-9 w-[110px] bg-white"
                value={draftDecimals}
                onChange={(e) => {
                  const t = e.target.value.trim()
                  const n = Number(t)
                  setDraftDecimals(
                    !t || !Number.isFinite(n) || n < 0 || n > 6 ? 2 : Math.round(n),
                  )
                }}
                aria-label="Decimal places"
              />
              <p className="text-[11px] text-slate-500">Allowed range: 0–6 (default 2).</p>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            onClick={() => {
              onChange({
                value: draft.trim() || '=',
                decimalPlaces: clampMuBudgetDecimalPlaces(draftDecimals, 2),
              })
              onOpenChange(false)
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceOfUncertaintyCell({
  cell,
  onChange,
  options,
  ariaLabel,
}: {
  cell: MuBudgetCell
  onChange: (next: MuBudgetCell) => void
  options: UncertaintySourceOption[]
  ariaLabel: string
}) {
  const selected = options.find((o) => o.label === cell.value.trim())
  const selectValue = selected?.id ?? ''

  return (
    <div className="space-y-1">
      <Select
        value={selectValue || undefined}
        onValueChange={(id) => {
          const opt = options.find((o) => o.id === id)
          if (!opt) return
          onChange({ type: 'text', value: opt.label })
        }}
      >
        <SelectTrigger className="h-9 w-full" aria-label={ariaLabel}>
          <SelectValue placeholder="Select Type A / Type B component" />
        </SelectTrigger>
        <SelectContent className="z-[90] max-h-72">
          {options.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No components yet — add Component tables under Type A / Type B on the MU Calculation
              Sheet.
            </p>
          ) : (
            (['Type A', 'Type B'] as const).map((group) => {
              const groupOpts = options.filter((o) => o.group === group)
              if (groupOpts.length === 0) return null
              return (
                <SelectGroup key={group}>
                  <SelectLabel className="text-[10px] uppercase tracking-wide text-slate-500">
                    {group}
                  </SelectLabel>
                  {groupOpts.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            })
          )}
        </SelectContent>
      </Select>
      {cell.value.trim() && !selected ? (
        <Input
          value={cell.value}
          onChange={(e) => onChange({ type: 'text', value: e.target.value })}
          className="h-8 text-xs"
          aria-label={`${ariaLabel} custom`}
          placeholder="Custom source"
        />
      ) : null}
    </div>
  )
}

/** Normalize stored cell to the column/field type (column-type-fixed UX). */
function cellForFieldType(cell: MuBudgetCell, fieldType: MuBudgetFieldType): MuBudgetCell {
  if (cell.type === fieldType) {
    if (fieldType === 'formula') {
      return {
        type: 'formula',
        value: cell.value,
        decimalPlaces: clampMuBudgetDecimalPlaces(cell.decimalPlaces, 2),
      }
    }
    return { type: fieldType, value: cell.value }
  }
  if (fieldType === 'formula') {
    const raw = cell.value.trim()
    return {
      type: 'formula',
      value: raw.startsWith('=') ? cell.value : raw ? `=${raw}` : '=',
      decimalPlaces: clampMuBudgetDecimalPlaces(cell.decimalPlaces, 2),
    }
  }
  return { type: fieldType, value: cell.value.replace(/^\s*=/, '') }
}

function BudgetTypedCell({
  label,
  cell,
  fieldType,
  onChange,
  ariaLabel,
  allowDistributionQuickPick = false,
  formulaRefs,
}: {
  label: string
  cell: MuBudgetCell
  /** Column (or summary) type — drives render; no per-cell type UI. */
  fieldType: MuBudgetFieldType
  onChange: (next: MuBudgetCell) => void
  ariaLabel: string
  allowDistributionQuickPick?: boolean
  formulaRefs: BudgetFormulaRef[]
}) {
  const [formulaOpen, setFormulaOpen] = useState(false)
  const effective = cellForFieldType(cell, fieldType)
  const isFormula = fieldType === 'formula'

  return (
    <div className="space-y-1">
      {allowDistributionQuickPick && fieldType === 'text' ? (
        <select
          className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-teal-600"
          value={
            DISTRIBUTIONS.includes(effective.value as (typeof DISTRIBUTIONS)[number])
              ? effective.value
              : ''
          }
          onChange={(e) => onChange({ type: 'text', value: e.target.value })}
          aria-label={ariaLabel}
        >
          <option value="">Select / type below</option>
          {DISTRIBUTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      ) : null}

      <Input
        value={effective.value}
        type={fieldType === 'number' ? 'number' : 'text'}
        onChange={(e) => {
          if (isFormula) return
          onChange({ type: fieldType, value: e.target.value })
        }}
        onClick={() => {
          if (isFormula) setFormulaOpen(true)
        }}
        onKeyDown={(e) => {
          if (isFormula && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setFormulaOpen(true)
          }
        }}
        readOnly={isFormula}
        className={cn('h-9', isFormula && 'cursor-pointer font-mono text-xs')}
        placeholder={isFormula ? '=…' : undefined}
        aria-label={ariaLabel}
        title={isFormula ? 'Click to edit formula' : undefined}
      />

      <BudgetFormulaDialog
        open={formulaOpen}
        onOpenChange={setFormulaOpen}
        title={label}
        value={effective.value}
        decimalPlaces={clampMuBudgetDecimalPlaces(effective.decimalPlaces, 2)}
        onChange={(next) =>
          onChange({
            type: 'formula',
            value: next.value,
            decimalPlaces: next.decimalPlaces,
          })
        }
        refs={formulaRefs}
      />
    </div>
  )
}

function cellFor(
  row: MuUncertaintyBudgetRow,
  col: MuUncertaintyBudgetColumnDef,
): MuBudgetCell {
  return row.cells?.[col.key] ?? emptyMuBudgetCell(col.defaultType)
}

type DraftBudgetColumn = {
  draftId: string
  label: string
  defaultType: MuBudgetFieldType
  /** Optional manual key; empty → auto from label on Done. */
  key: string
  formulaExpression?: string
  decimalPlaces?: number
}

function newDraftColumnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ub_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function emptyDraftColumn(): DraftBudgetColumn {
  return {
    draftId: newDraftColumnId(),
    label: '',
    defaultType: 'number',
    key: '',
  }
}

function buildWizardFormulaRefs(drafts: DraftBudgetColumn[]): BudgetFormulaRef[] {
  const list: BudgetFormulaRef[] = []
  for (const d of drafts) {
    const label = d.label.trim()
    if (!label) continue
    list.push({
      key: d.key.trim() || d.draftId,
      label,
      kind: 'budget',
    })
  }
  for (const field of SUMMARY_FIELDS) {
    list.push({ key: field.key, label: field.label, kind: 'summary' })
  }
  for (const col of MU_EQUIPMENT_RANGE_FIELD_COLUMNS) {
    list.push({
      key: col.key,
      label: col.label,
      kind: isMuEquipmentRangeFieldKey(col.key) ? 'range' : 'budget',
    })
  }
  list.push({
    key: MU_CALIBRATION_POINT_FIELD_KEY,
    label: MU_CALIBRATION_POINT_COLUMN.label,
    kind: 'point',
  })
  return list
}

function CreateUncertaintyBudgetTableWizard({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (columns: MuUncertaintyBudgetColumnDef[]) => void
}) {
  const [drafts, setDrafts] = useState<DraftBudgetColumn[]>([])
  const [formulaDraftId, setFormulaDraftId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDrafts([])
      setFormulaDraftId(null)
    }
  }, [open])

  const canDone =
    drafts.length > 0 && drafts.every((d) => d.label.trim().length > 0)

  const wizardFormulaRefs = useMemo(
    () => buildWizardFormulaRefs(drafts),
    [drafts],
  )

  const formulaDraft = formulaDraftId
    ? drafts.find((d) => d.draftId === formulaDraftId) ?? null
    : null

  const updateDraft = (draftId: string, partial: Partial<DraftBudgetColumn>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.draftId === draftId ? { ...d, ...partial } : d)),
    )
  }

  const changeDraftType = (draftId: string, nextType: MuBudgetFieldType) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.draftId !== draftId) return d
        if (nextType === 'formula') {
          return {
            ...d,
            defaultType: 'formula',
            decimalPlaces: clampMuBudgetDecimalPlaces(d.decimalPlaces, 2),
            formulaExpression: d.formulaExpression ?? '',
          }
        }
        return {
          draftId: d.draftId,
          label: d.label,
          defaultType: nextType,
          key: d.key,
        }
      }),
    )
  }

  const removeDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.draftId !== draftId))
    if (formulaDraftId === draftId) setFormulaDraftId(null)
  }

  const moveDraft = (index: number, delta: number) => {
    setDrafts((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const tmp = next[index]!
      next[index] = next[target]!
      next[target] = tmp
      return next
    })
  }

  const commit = () => {
    if (!canDone) return
    const used = new Set<string>()
    const columns: MuUncertaintyBudgetColumnDef[] = drafts.map((d) => {
      const label = d.label.trim()
      let key = d.key.trim() || newUncertaintyBudgetColumnKey(label)
      if (used.has(key)) {
        let n = 2
        while (used.has(`${key}_${n}`)) n += 1
        key = `${key}_${n}`
      }
      used.add(key)
      const col: MuUncertaintyBudgetColumnDef = {
        key,
        label,
        defaultType: d.defaultType,
      }
      if (d.defaultType === 'formula') {
        const expr = String(d.formulaExpression ?? '').trim()
        if (expr) col.formulaExpression = expr
        col.decimalPlaces = clampMuBudgetDecimalPlaces(d.decimalPlaces, 2)
      }
      return col
    })
    onDone(columns)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
          <DialogHeader className="text-left">
            <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
              Uncertainty Budget
            </p>
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Create Uncertainty Budget Table
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-16 border border-slate-200 px-2 py-2 text-center">Order</th>
                  <th className="border border-slate-200 px-2 py-2 text-left">Column label</th>
                  <th className="w-28 border border-slate-200 px-2 py-2 text-center">Type</th>
                  <th className="w-20 border border-slate-200 px-2 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-slate-200 px-3 py-10 text-center text-muted-foreground"
                    >
                      <p className="mb-3 text-sm">No columns yet — add your first column.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                        onClick={() => setDrafts([emptyDraftColumn()])}
                        aria-label="Add first column"
                      >
                        <Plus size={14} />
                        Add column
                      </Button>
                    </td>
                  </tr>
                ) : (
                  drafts.map((draft, index) => {
                    const isCalculated = draft.defaultType === 'formula'
                    return (
                      <tr key={draft.draftId}>
                        <td className="border border-slate-200 px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <GripVertical size={14} className="text-slate-400" aria-hidden />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1 text-xs"
                              disabled={index === 0}
                              onClick={() => moveDraft(index, -1)}
                              aria-label={`Move column ${index + 1} up`}
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1 text-xs"
                              disabled={index === drafts.length - 1}
                              onClick={() => moveDraft(index, 1)}
                              aria-label={`Move column ${index + 1} down`}
                            >
                              ↓
                            </Button>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={draft.label}
                              onChange={(e) =>
                                updateDraft(draft.draftId, { label: e.target.value })
                              }
                              placeholder={
                                isCalculated ? 'e.g. Uncertainty Contribution' : 'e.g. Estimate'
                              }
                              className="h-9"
                              aria-label={`Column label ${index + 1}`}
                            />
                            {isCalculated ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 shrink-0 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                                onClick={() => setFormulaDraftId(draft.draftId)}
                                aria-label={`Column calculation for ${draft.label || `column ${index + 1}`}`}
                                title="Set formula"
                              >
                                <Calculator size={16} />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center">
                          <Select
                            value={draft.defaultType}
                            onValueChange={(v) =>
                              changeDraftType(
                                draft.draftId,
                                v === 'number'
                                  ? 'number'
                                  : v === 'formula'
                                    ? 'formula'
                                    : 'text',
                              )
                            }
                          >
                            <SelectTrigger
                              className="mx-auto h-9 w-[110px]"
                              aria-label={`Column type ${index + 1}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[90]">
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="formula">Calculated</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-center">
                          {index === drafts.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 w-8 px-0 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                              onClick={() => setDrafts((prev) => [...prev, emptyDraftColumn()])}
                              aria-label="Add column"
                            >
                              <Plus size={16} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                              onClick={() => removeDraft(draft.draftId)}
                              aria-label={`Delete column ${index + 1}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            disabled={!canDone}
            onClick={commit}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <BudgetFormulaDialog
        open={formulaDraft != null}
        onOpenChange={(next) => {
          if (!next) setFormulaDraftId(null)
        }}
        title={formulaDraft?.label.trim() || 'Calculated column'}
        value={formulaDraft?.formulaExpression ?? '='}
        decimalPlaces={clampMuBudgetDecimalPlaces(formulaDraft?.decimalPlaces, 2)}
        onChange={({ value, decimalPlaces }) => {
          if (!formulaDraft) return
          updateDraft(formulaDraft.draftId, {
            formulaExpression: value,
            decimalPlaces,
          })
        }}
        refs={wizardFormulaRefs}
      />
    </Dialog>
  )
}

/** Slim add-column dialog — same label + type fields as the create wizard. */
function AddUncertaintyBudgetColumnDialog({
  open,
  onOpenChange,
  onAdd,
  existingColumns,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (
    column: Pick<
      MuUncertaintyBudgetColumnDef,
      'label' | 'defaultType' | 'formulaExpression' | 'decimalPlaces'
    >,
  ) => void
  existingColumns: MuUncertaintyBudgetColumnDef[]
}) {
  const [label, setLabel] = useState('')
  const [defaultType, setDefaultType] = useState<MuBudgetFieldType>('number')
  const [formulaExpression, setFormulaExpression] = useState('')
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [formulaOpen, setFormulaOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setLabel('')
      setDefaultType('number')
      setFormulaExpression('')
      setDecimalPlaces(2)
      setFormulaOpen(false)
    }
  }, [open])

  const canAdd = label.trim().length > 0
  const isCalculated = defaultType === 'formula'

  const formulaRefs = useMemo((): BudgetFormulaRef[] => {
    const list: BudgetFormulaRef[] = []
    for (const col of existingColumns) {
      list.push({ key: col.key, label: col.label, kind: 'budget' })
    }
    if (label.trim()) {
      list.push({ key: '__new__', label: label.trim(), kind: 'budget' })
    }
    for (const field of SUMMARY_FIELDS) {
      list.push({ key: field.key, label: field.label, kind: 'summary' })
    }
    for (const col of MU_EQUIPMENT_RANGE_FIELD_COLUMNS) {
      list.push({
        key: col.key,
        label: col.label,
        kind: isMuEquipmentRangeFieldKey(col.key) ? 'range' : 'budget',
      })
    }
    list.push({
      key: MU_CALIBRATION_POINT_FIELD_KEY,
      label: MU_CALIBRATION_POINT_COLUMN.label,
      kind: 'point',
    })
    return list
  }, [existingColumns, label])

  const commit = () => {
    if (!canAdd) return
    const payload: Pick<
      MuUncertaintyBudgetColumnDef,
      'label' | 'defaultType' | 'formulaExpression' | 'decimalPlaces'
    > = {
      label: label.trim(),
      defaultType,
    }
    if (defaultType === 'formula') {
      const expr = formulaExpression.trim()
      if (expr) payload.formulaExpression = expr
      payload.decimalPlaces = clampMuBudgetDecimalPlaces(decimalPlaces, 2)
    }
    onAdd(payload)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        className="w-[calc(100vw-1rem)] max-w-md border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Add column
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-3 bg-[#fafbfc] px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="ub-add-col-label" className="text-[11px]">
              Column label
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="ub-add-col-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={isCalculated ? 'e.g. Uncertainty Contribution' : 'e.g. Estimate'}
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                  }
                }}
              />
              {isCalculated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                  onClick={() => setFormulaOpen(true)}
                  aria-label={`Column calculation for ${label || 'new column'}`}
                  title="Set formula"
                >
                  <Calculator size={16} />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Type</Label>
            <Select
              value={defaultType}
              onValueChange={(v) => {
                const next: MuBudgetFieldType =
                  v === 'number' ? 'number' : v === 'formula' ? 'formula' : 'text'
                setDefaultType(next)
                if (next === 'formula') {
                  setDecimalPlaces(clampMuBudgetDecimalPlaces(decimalPlaces, 2))
                } else {
                  setFormulaExpression('')
                }
              }}
            >
              <SelectTrigger className="h-9" aria-label="Column type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[90]">
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="formula">Calculated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            disabled={!canAdd}
            onClick={commit}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>

      <BudgetFormulaDialog
        open={formulaOpen}
        onOpenChange={setFormulaOpen}
        title={label.trim() || 'Calculated column'}
        value={formulaExpression || '='}
        decimalPlaces={clampMuBudgetDecimalPlaces(decimalPlaces, 2)}
        onChange={({ value, decimalPlaces: dp }) => {
          setFormulaExpression(value)
          setDecimalPlaces(dp)
        }}
        refs={formulaRefs}
      />
    </Dialog>
  )
}

export function UncertaintyBudgetDialog({
  open,
  onOpenChange,
  value,
  onChange,
  typeA,
  typeB,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: MuUncertaintyBudget
  onChange: (next: MuUncertaintyBudget) => void
  typeA?: MuSheetSection | null
  typeB?: MuSheetSection | null
}) {
  const [createWizardOpen, setCreateWizardOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  const sourceOptions = useMemo(
    () => [
      ...collectSectionComponentOptions(typeA, 'Type A'),
      ...collectSectionComponentOptions(typeB, 'Type B'),
    ],
    [typeA, typeB],
  )

  const columns = value.columns ?? []
  const tableReady = columns.length > 0

  const rows = useMemo(() => {
    if (!tableReady) return []
    return value.rows?.length ? value.rows : [emptyMuUncertaintyBudgetRow(columns)]
  }, [tableReady, value.rows, columns])

  const formulaRefs = useMemo((): BudgetFormulaRef[] => {
    const list: BudgetFormulaRef[] = []
    for (const col of columns) {
      list.push({ key: col.key, label: col.label, kind: 'budget' })
    }
    for (const field of SUMMARY_FIELDS) {
      list.push({ key: field.key, label: field.label, kind: 'summary' })
    }
    for (const col of MU_EQUIPMENT_RANGE_FIELD_COLUMNS) {
      list.push({
        key: col.key,
        label: col.label,
        kind: isMuEquipmentRangeFieldKey(col.key) ? 'range' : 'budget',
      })
    }
    list.push({
      key: MU_CALIBRATION_POINT_FIELD_KEY,
      label: MU_CALIBRATION_POINT_COLUMN.label,
      kind: 'point',
    })
    return list
  }, [columns])

  const patchBudget = (partial: Partial<MuUncertaintyBudget>) => {
    onChange({ ...value, ...partial })
  }

  const updateRowCell = (id: string, colKey: string, cell: MuBudgetCell) => {
    patchBudget({
      rows: rows.map((r) =>
        r.id === id
          ? {
              ...r,
              cells: { ...r.cells, [colKey]: cell },
            }
          : r,
      ),
    })
  }

  const addRow = () => {
    patchBudget({ rows: [...rows, emptyMuUncertaintyBudgetRow(columns)] })
  }

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      patchBudget({ rows: [emptyMuUncertaintyBudgetRow(columns)] })
      return
    }
    patchBudget({ rows: rows.filter((r) => r.id !== id) })
  }

  const addColumnToExisting = (draft: {
    label: string
    defaultType: MuBudgetFieldType
    formulaExpression?: string
    decimalPlaces?: number
  }) => {
    const label = draft.label.trim() || `Column ${columns.length + 1}`
    let key = newUncertaintyBudgetColumnKey(label)
    const used = new Set(columns.map((c) => c.key))
    if (used.has(key)) {
      let n = 2
      while (used.has(`${key}_${n}`)) n += 1
      key = `${key}_${n}`
    }
    const col: MuUncertaintyBudgetColumnDef = {
      key,
      label,
      defaultType: draft.defaultType,
    }
    if (draft.defaultType === 'formula') {
      const expr = String(draft.formulaExpression ?? '').trim()
      if (expr) col.formulaExpression = expr
      col.decimalPlaces = clampMuBudgetDecimalPlaces(draft.decimalPlaces, 2)
    }
    const nextColumns = [...columns, col]
    const seedCell =
      col.defaultType === 'formula'
        ? {
            type: 'formula' as const,
            value: String(col.formulaExpression ?? '').trim(),
            decimalPlaces: clampMuBudgetDecimalPlaces(col.decimalPlaces, 2),
          }
        : emptyMuBudgetCell(col.defaultType)
    patchBudget({
      columns: nextColumns,
      rows: rows.map((r) => ({
        ...r,
        cells: {
          ...r.cells,
          [col.key]: seedCell,
        },
      })),
    })
  }

  const handleClearTable = () => {
    if (
      !window.confirm(
        'Clear the Uncertainty Budget table? All columns and rows will be removed.',
      )
    ) {
      return
    }
    const kRaw = Number(value.coverageFactorK?.value ?? 2)
    const k = Number.isFinite(kRaw) && kRaw > 0 ? kRaw : 2
    onChange(defaultMuUncertaintyBudget(k))
  }

  const handleWizardDone = (nextColumns: MuUncertaintyBudgetColumnDef[]) => {
    const kRaw = Number(value.coverageFactorK?.value ?? 2)
    const k = Number.isFinite(kRaw) && kRaw > 0 ? kRaw : 2
    onChange(createUncertaintyBudgetTableFromColumns(nextColumns, k))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        className="fixed inset-0 z-[60] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 border-slate-300 bg-white p-0 shadow-2xl sm:rounded-none"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
          <DialogHeader className="pr-12 text-left">
            <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
              MU Calculation Sheet
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Uncertainty Budget
              </DialogTitle>
              {!tableReady ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-indigo-300/50 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setCreateWizardOpen(true)}
                  aria-label="Create Uncertainty Budget Table"
                >
                  Create Uncertainty Budget Table
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-indigo-300/50 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setAddColumnOpen(true)}
                    aria-label="Add column to Uncertainty Budget table"
                  >
                    <Plus size={14} className="mr-1" />
                    Add column
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-rose-300/40 bg-white/5 text-xs text-rose-100 hover:bg-white/10 hover:text-white"
                    onClick={handleClearTable}
                    aria-label="Clear Uncertainty Budget table"
                  >
                    Clear table
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
          {!tableReady ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <p className="text-sm font-medium text-slate-800">No Uncertainty Budget table yet</p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Click <span className="font-semibold">Create Uncertainty Budget Table</span> to
                open the column wizard. Add columns one by one, then press Done to create the
                table.
              </p>
              <Button
                type="button"
                className="mt-4 bg-indigo-600 text-white hover:bg-indigo-500"
                onClick={() => setCreateWizardOpen(true)}
              >
                Create Uncertainty Budget Table
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full min-w-[1280px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 border border-slate-200 px-2 py-2 text-center">S.No</th>
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          className={`border border-slate-200 px-2 py-2 text-center ${columnMinWidth(col.key)}`}
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const isLast = index === rows.length - 1
                      return (
                        <tr key={row.id} className="align-top">
                          <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                            {index + 1}
                          </td>
                          {columns.map((col) => (
                            <td key={col.key} className="border border-slate-200 px-2 py-2">
                              {col.key === 'sourceOfUncertainty' ? (
                                <SourceOfUncertaintyCell
                                  cell={cellFor(row, col)}
                                  onChange={(cell) => updateRowCell(row.id, col.key, cell)}
                                  options={sourceOptions}
                                  ariaLabel={`${col.label} row ${index + 1}`}
                                />
                              ) : (
                                <BudgetTypedCell
                                  label={col.label}
                                  cell={cellFor(row, col)}
                                  fieldType={col.defaultType}
                                  onChange={(cell) => updateRowCell(row.id, col.key, cell)}
                                  ariaLabel={`${col.label} row ${index + 1}`}
                                  allowDistributionQuickPick={
                                    col.key === 'probabilityDistribution'
                                  }
                                  formulaRefs={formulaRefs}
                                />
                              )}
                            </td>
                          ))}
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            {isLast ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mx-auto h-8 w-8 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                onClick={addRow}
                                aria-label="Add uncertainty budget row"
                              >
                                <Plus size={16} />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                                onClick={() => removeRow(row.id)}
                                aria-label={`Delete uncertainty budget row ${index + 1}`}
                              >
                                <Trash2 size={16} />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-3">
                {SUMMARY_FIELDS.map((field) => {
                  const summaryCell =
                    value[field.key] ?? emptyMuBudgetCell('number')
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-[11px]">{field.label}</Label>
                      <BudgetTypedCell
                        label={field.label}
                        cell={summaryCell}
                        fieldType={summaryCell.type}
                        onChange={(cell) => patchBudget({ [field.key]: cell })}
                        ariaLabel={field.label}
                        formulaRefs={formulaRefs}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <CreateUncertaintyBudgetTableWizard
        open={createWizardOpen}
        onOpenChange={setCreateWizardOpen}
        onDone={handleWizardDone}
      />
      <AddUncertaintyBudgetColumnDialog
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        onAdd={addColumnToExisting}
        existingColumns={columns}
      />
    </Dialog>
  )
}
