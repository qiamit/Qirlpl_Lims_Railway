import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BookmarkPlus, Calculator, ChevronDown, CircleHelp, GripVertical, Plus, Settings2, Thermometer, Trash2 } from 'lucide-react'
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
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { parseCalibrationPointsTable } from '@/features/calibration/equipment-for-calibration/types'
import {
  SCIENTIFIC_PAD_KEYS,
  applyFormulaPadInsert,
  type FormulaPadKey,
} from '@/features/calibration/equipment-for-calibration/pointFormula'
import {
  EMPTY_RAW_DATA_ENVIRONMENT,
  ENV_PARAMETER_OPTIONS,
  defaultEnvStatFormulaExpression,
  emptyColumnFormula,
  emptyEnvParameterColumn,
  emptyEnvironmentReadingRow,
  emptyRawDataSheetColumn,
  emptyRawDataSheetTableBlock,
  emptyVerificationItem,
  allRawDataSheetColumns,
  DEFAULT_RAW_DATA_TABLE_NAME,
  PRIMARY_RAW_DATA_TABLE_ID,
  envParameterFormulaColumns,
  ENV_FORMULA_REF_PREFIX,
  evaluateEnvParameterFormula,
  extractExpressionSourceKeys,
  wrapBareFormulaColumnRef,
  formulaOpMeta,
  isEnvRowCalculated,
  isEnvStandardFieldLabel,
  resolveEnvParameterColumns,
  resolveEnvRowFieldType,
  analyzeColumnFormulaExpression,
  COLUMN_FORMULA_HELP_ROWS,
  type FormulaValidationIssue,
  type EnvParameterColumn,
  type EnvRowFieldType,
  type EnvParameterKey,
  type RawDataColumnFormula,
  type RawDataEnvironmentReadingRow,
  type RawDataSheetColumn,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import {
  masterEquipmentFormulaRefColumns,
  masterPointsFormulaRefColumns,
} from '@/features/calibration/masterEquipmentFormulaRefs'
import {
  deleteSavedColumnFormula,
  loadSavedColumnFormulas,
  saveColumnFormula,
  type SavedColumnFormula,
} from '@/features/calibration/equipments/savedColumnFormulas'
import {
  MU_CALIBRATION_POINT_FIELD_KEY,
  isMuEquipmentRangeFieldKey,
} from '@/features/calibration/equipments/muCalculationTypes'

const thClass =
  'border border-stone-700 bg-stone-800 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const addBtnClass = 'h-8 w-8 px-0 text-amber-800 hover:bg-amber-500/15 hover:text-amber-950'

function bracketLabel(label: string): string {
  return `[${label.trim() || 'Untitled'}]`
}

export function formulaRefLocation(col: RawDataSheetColumn): string {
  if (col.key.startsWith(ENV_FORMULA_REF_PREFIX)) return 'Environment'
  if (col.key.startsWith('eq:')) return 'Master Equipment'
  if (col.key.startsWith('pt:')) return 'Calibration Points'
  if (col.key === MU_CALIBRATION_POINT_FIELD_KEY) return 'Calibration Point'
  if (isMuEquipmentRangeFieldKey(col.key)) return 'Range'
  return 'This Table'
}

/** Build editable Excel-style expression from legacy op/sources. */
function legacyFormulaToExpression(
  formula: RawDataColumnFormula,
  labelOf: (key: string) => string,
): string {
  if (formula.expression?.trim()) {
    const e = formula.expression.trim()
    return e.startsWith('=') ? e : `=${e}`
  }
  const meta = formulaOpMeta(formula.op)
  const picked = (meta.arity === 'two' ? formula.sources.slice(0, 2) : formula.sources).map(
    (k) => bracketLabel(labelOf(k)),
  )
  if (picked.length === 0) return '='
  const k = formula.constant
  switch (formula.op) {
    case 'sum':
      return `=${[...picked, ...(k != null ? [String(k)] : [])].join('+')}`
    case 'subtract':
      return `=${[...picked, ...(k != null ? [String(k)] : [])].join('-')}`
    case 'multiply':
      return `=${[...picked, ...(k != null ? [String(k)] : [])].join('*')}`
    case 'divide':
      return `=${[...picked, ...(k != null ? [String(k)] : [])].join('/')}`
    case 'average':
      return `=AVERAGE(${picked.join(',')})`
    case 'min':
      return `=MIN(${picked.join(',')})`
    case 'max':
      return `=MAX(${picked.join(',')})`
    case 'error':
      return picked.length < 2 ? '=' : `=${picked[0]}-${picked[1]}`
    case 'abs_error':
      return picked.length < 2 ? '=' : `=ABS(${picked[0]}-${picked[1]})`
    case 'percent_error':
      return picked.length < 2 ? '=' : `=((${picked[0]}-${picked[1]})/${picked[1]})*100`
    case 'percent_of':
      return picked.length < 2 ? '=' : `=(${picked[0]}/${picked[1]})*100`
    case 'temp_correct': {
      if (picked.length < 2) return '='
      const alpha = k != null && Number.isFinite(k) ? String(k) : '0'
      const tRef =
        formula.referenceTempC != null && Number.isFinite(formula.referenceTempC)
          ? String(formula.referenceTempC)
          : '20'
      return `=${picked[0]}*(1+${alpha}*(${tRef}-${picked[1]}))`
    }
    default:
      return `=${meta.value.toUpperCase()}(${picked.join(',')})`
  }
}

function findAutocompleteToken(
  value: string,
  cursor: number,
): { start: number; end: number; query: string } | null {
  const before = value.slice(0, cursor)
  // Inside [ ... unfinished bracket
  const openIdx = before.lastIndexOf('[')
  const closeIdx = before.lastIndexOf(']')
  if (openIdx > closeIdx) {
    return {
      start: openIdx + 1,
      end: cursor,
      query: before.slice(openIdx + 1),
    }
  }
  // After operator / start — bare token
  const match = /(?:^|[=+\-*/(,])\s*([^+\-*/(,=\[\]]+)$/.exec(before)
  if (!match) return null
  const token = match[1] ?? ''
  if (!token.trim()) return null
  // Don't suggest while typing function names that already look complete-ish with (
  if (
    /^(average|mean|sum|min|max|abs|sqrt|round|median|mode|stdev|stddev|var|variance|count|product|power|mod|int|ceiling|floor|roundup|rounddown|exp|ln|log|log10|pi|e|sin|cos|tan|asin|acos|atan|atan2|radians|degrees|sign|trunc|fact|quotient|even|odd|if|and|or|not|geomean|harmean|avedev|large|small)$/i.test(
      token.trim(),
    )
  )
    return null
  return {
    start: cursor - token.length,
    end: cursor,
    query: token,
  }
}

function renderFormulaWithErrorHighlight(value: string, errorToken: string | null) {
  if (!errorToken || !value.includes(errorToken)) {
    return <span>{value || '\u00a0'}</span>
  }
  const parts: ReactNode[] = []
  let remaining = value
  let key = 0
  while (remaining.length > 0) {
    const idx = remaining.indexOf(errorToken)
    if (idx < 0) {
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }
    if (idx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>)
    }
    parts.push(
      <span key={key++} className="rounded-sm bg-red-100 font-semibold text-red-600">
        {errorToken}
      </span>,
    )
    remaining = remaining.slice(idx + errorToken.length)
  }
  return <>{parts}</>
}

function columnPadKeyClass(variant: FormulaPadKey['variant']): string {
  switch (variant) {
    case 'accent':
      return 'rounded-none border-amber-700/50 bg-amber-700 text-white hover:bg-amber-800'
    case 'fn':
      return 'rounded-none border-stone-400 bg-stone-100 text-amber-900 hover:bg-amber-50'
    case 'muted':
      return 'rounded-none border-stone-400 bg-stone-50 text-stone-700 hover:bg-stone-100'
    case 'danger':
      return 'rounded-none border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
    default:
      return 'rounded-none border-stone-400 bg-white text-stone-800 hover:bg-stone-100'
  }
}

function ColumnFormulaInput({
  id,
  value,
  onChange,
  sourceColumns,
  errorToken = null,
  toolbarExtra,
  toolbarAfter,
  formulaFor,
  locationOf,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  sourceColumns: RawDataSheetColumn[]
  errorToken?: string | null
  toolbarExtra?: ReactNode
  toolbarAfter?: ReactNode
  formulaFor?: string
  locationOf?: (col: RawDataSheetColumn) => string
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [focused, setFocused] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [formulaName, setFormulaName] = useState('')
  const [savedFormulas, setSavedFormulas] = useState<SavedColumnFormula[]>([])
  const [libraryHint, setLibraryHint] = useState<string | null>(null)

  useEffect(() => {
    setSavedFormulas(loadSavedColumnFormulas())
  }, [])

  const syncFormulaHeight = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, 40), 192)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 192 ? 'auto' : 'hidden'
  }

  /** Grow the box as the formula wraps to more lines. */
  useEffect(() => {
    syncFormulaHeight()
  }, [value])

  const token = useMemo(() => findAutocompleteToken(value, cursor), [value, cursor])

  /** After `=`, `(`, `,`, or bare `[` — offer all source columns (incl. Master fields). */
  const offerAllAtCursor = useMemo(() => {
    if (!focused) return false
    const before = value.slice(0, cursor)
    if (/[=(,]\s*$/.test(before)) return true
    if (before.endsWith('[')) return true
    return false
  }, [focused, value, cursor])

  const suggestions = useMemo(() => {
    if (sourceColumns.length === 0) return []
    if (token) {
      const q = token.query.trim().toLowerCase()
      return sourceColumns.filter((c) => {
        const label = (c.label || 'Untitled column').toLowerCase()
        const key = c.key.toLowerCase()
        return !q || label.includes(q) || key.includes(q)
      })
    }
    if (offerAllAtCursor) return sourceColumns
    return []
  }, [sourceColumns, token, offerAllAtCursor])

  useEffect(() => {
    setOpen(focused && suggestions.length > 0)
    setHighlight(0)
  }, [focused, suggestions.length, token?.query, offerAllAtCursor])

  const insertColumn = (col: RawDataSheetColumn) => {
    const insert = bracketLabel(col.label || col.key)
    if (token) {
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
      return
    }
    // Insert at cursor when offering the full list after = / ( / ,
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const text = before.endsWith('[')
      ? `${before}${col.label.trim() || col.key}]${after.startsWith(']') ? after.slice(1) : after}`
      : `${before}${insert}${after}`
    const caret = before.endsWith('[')
      ? before.length + (col.label.trim() || col.key).length + 1
      : before.length + insert.length
    onChange(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
      setCursor(caret)
    })
    setOpen(false)
  }

  const hasError = Boolean(errorToken)
  const canSave =
    value.trim().length > 0 && value.trim() !== '=' && !hasError

  const handleSaveFormula = () => {
    if (!canSave) {
      setLibraryHint(errorToken ? 'Fix formula errors before saving.' : 'Enter a formula before saving.')
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

  const handleLoadFormula = (item: SavedColumnFormula) => {
    onChange(item.expression)
    setLibraryHint(`Loaded “${item.name}”.`)
    setSaveOpen(false)
  }

  const handleDeleteFormula = (item: SavedColumnFormula) => {
    const next = deleteSavedColumnFormula(item.id)
    setSavedFormulas(next)
    setLibraryHint(`Deleted “${item.name}”.`)
  }

  const toolbar = (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {toolbarExtra}
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
                      onSelect={() => handleLoadFormula(item)}
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
                        handleDeleteFormula(item)
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
            aria-controls={`${id}-save-panel`}
          >
            <BookmarkPlus size={13} />
            Save
          </Button>
          {toolbarAfter}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-7 gap-1.5 px-2 text-[11px]',
              keypadOpen ? limsPrimaryBtnClass : limsOutlineBtnClass,
            )}
            aria-expanded={keypadOpen}
            aria-controls={`${id}-keypad`}
            onClick={() => setKeypadOpen((v) => !v)}
          >
            <Calculator size={13} />
            {keypadOpen ? 'Hide Calculator' : 'Calculator'}
          </Button>
        </div>
  )

  return (
    <div className="relative space-y-1">
      <Label htmlFor={id} className="text-[11px]">
        {formulaFor?.trim() ? `Formula for ${formulaFor.trim()}` : 'Formula'}
      </Label>

      <div
        className={cn(
          'relative min-h-10 overflow-hidden rounded-none border bg-white shadow-sm',
          hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-input',
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-3 py-2 font-mono text-sm leading-6 text-slate-900"
        >
          {renderFormulaWithErrorHighlight(value, errorToken)}
        </div>
        <textarea
          ref={inputRef}
          id={id}
          rows={1}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder='=AVERAGE([Reading at 0],[Reading at 120]) or =[Error]&" °C"'
          className="relative block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent px-3 py-2 font-mono text-sm leading-6 text-transparent caret-slate-900 outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            onChange(e.target.value.replace(/\r?\n/g, ''))
            setCursor(e.target.selectionStart ?? e.target.value.length)
            requestAnimationFrame(syncFormulaHeight)
          }}
          onFocus={(e) => {
            setFocused(true)
            setCursor(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
          }}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 120)
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) {
              // Keep the formula on one logical line — wrapping is visual only
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
              if (pick) insertColumn(pick)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          aria-label="Column formula"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-invalid={hasError || undefined}
        />
      </div>
      {open ? (
        <ul
          className="relative z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-none border border-stone-400 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((col, i) => {
            const location = locationOf?.(col) ?? formulaRefLocation(col)
            return (
            <li key={col.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm',
                  i === highlight ? 'bg-amber-50 text-stone-900' : 'text-stone-700 hover:bg-stone-50',
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertColumn(col)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="min-w-0 truncate font-medium">
                  {col.label || 'Untitled column'}
                </span>
                <span className="shrink-0 text-right text-[11px] text-stone-500">
                  {location}
                </span>
              </button>
            </li>
            )
          })}
        </ul>
      ) : null}

      {saveOpen ? (
        <div
          id={`${id}-save-panel`}
          className="flex flex-wrap items-end gap-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2"
        >
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor={`${id}-save-name`} className="text-[11px]">
              Formula name
            </Label>
            <Input
              id={`${id}-save-name`}
              value={formulaName}
              onChange={(e) => setFormulaName(e.target.value)}
              placeholder="e.g. Average of 3 readings"
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

      {libraryHint ? (
        <p className="text-[11px] text-indigo-800">{libraryHint}</p>
      ) : null}

      {toolbar}

      {keypadOpen ? (
        <div
          id={`${id}-keypad`}
          className="border border-stone-400 bg-stone-50 p-2"
          role="group"
          aria-label="Scientific calculator keypad"
        >
          <div className="space-y-1.5">
            {SCIENTIFIC_PAD_KEYS.map((row, rowIndex) => (
              <div
                key={`col-pad-row-${rowIndex}`}
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((key) => (
                  <button
                    key={`${rowIndex}-${key.label}-${key.ariaLabel}`}
                    type="button"
                    aria-label={key.ariaLabel}
                    onClick={() => {
                      const el = inputRef.current
                      const start = el?.selectionStart ?? cursor
                      const end = el?.selectionEnd ?? cursor
                      const next = applyFormulaPadInsert(value, start, end, key.insert)
                      const nextValue = next.value.replace(/\r?\n/g, '')
                      onChange(nextValue)
                      requestAnimationFrame(() => {
                        const box = inputRef.current
                        if (!box) return
                        box.focus()
                        box.setSelectionRange(next.caret, next.caret)
                        setCursor(next.caret)
                      })
                    }}
                    className={`h-9 border font-mono text-[12px] font-medium transition-colors ${columnPadKeyClass(key.variant)}`}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Compact Excel-style formula cell — shows calculated value; edit formula on focus. */
function EnvCellFormulaInput({
  value,
  onChange,
  sourceFields,
  envRows,
  parameterColumnId,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  sourceFields: string[]
  envRows: RawDataEnvironmentReadingRow[]
  parameterColumnId: string
  placeholder?: string
  ariaLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [focused, setFocused] = useState(false)

  const token = useMemo(() => findAutocompleteToken(value, cursor), [value, cursor])

  const computedText = useMemo(() => {
    const formula = value.trim()
    if (!formula || formula === '=') return ''
    try {
      const n = evaluateEnvParameterFormula(formula, envRows, parameterColumnId)
      if (n == null) return ''
      if (Number.isInteger(n)) return String(n)
      return String(Math.round(n * 1000) / 1000)
    } catch {
      return ''
    }
  }, [value, envRows, parameterColumnId])

  /** After `(`, `,`, or `=` with no query yet — still offer same-column Fields. */
  const offerAllAtCursor = useMemo(() => {
    if (!focused) return false
    const before = value.slice(0, cursor)
    if (/[=(,]\s*$/.test(before)) return true
    if (before.endsWith('[')) return true
    return false
  }, [focused, value, cursor])

  const suggestions = useMemo(() => {
    if (sourceFields.length === 0) return []
    if (token) {
      const q = token.query.trim().toLowerCase()
      return sourceFields.filter((label) => {
        const l = label.toLowerCase()
        return !q || l.includes(q)
      })
    }
    if (offerAllAtCursor) return sourceFields
    return []
  }, [sourceFields, token, offerAllAtCursor])

  useEffect(() => {
    setOpen(focused && suggestions.length > 0)
    setHighlight(0)
  }, [focused, suggestions.length, token?.query, offerAllAtCursor])

  const insertField = (label: string) => {
    const insert = bracketLabel(label)
    if (token) {
      const start = token.start
      const end = token.end
      if (value[start - 1] === '[') {
        const afterCursor = value.slice(end)
        const rest = afterCursor.startsWith(']') ? afterCursor.slice(1) : afterCursor
        const next = `${value.slice(0, start - 1)}${insert}${rest}`
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
      const next = `${value.slice(0, start)}${insert}${value.slice(end)}`
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
      return
    }
    const next = `${value.slice(0, cursor)}${insert}${value.slice(cursor)}`
    const caret = cursor + insert.length
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

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={focused ? value : computedText}
        spellCheck={false}
        autoComplete="off"
        placeholder={focused ? (placeholder ?? '=AVERAGE([Reading at 0])') : '—'}
        title={value.trim() || undefined}
        className={cn(
          'h-9 bg-indigo-50/40 font-mono text-indigo-950',
          focused ? 'text-left text-xs' : 'text-center text-sm font-semibold',
        )}
        onChange={(e) => {
          onChange(e.target.value)
          setCursor(e.target.selectionStart ?? e.target.value.length)
        }}
        onFocus={(e) => {
          setFocused(true)
          setCursor(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
        }}
        onBlur={() => {
          window.setTimeout(() => setFocused(false), 120)
        }}
        onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => (h + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            const pick = suggestions[highlight]
            if (pick) insertField(pick)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open ? (
        <ul
          className="absolute z-[90] mt-1 max-h-40 w-full min-w-[12rem] overflow-y-auto rounded-md border border-[#e7e0d4] bg-white py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs',
                  i === highlight
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertField(label)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="truncate font-medium">{label}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-slate-400">
                  {bracketLabel(label)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function ColumnCalculationDialog({
  open,
  onOpenChange,
  column,
  columns,
  envColumns,
  onUpdateFormula,
  layer = 'nested',
  locationOf,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: RawDataSheetColumn | null
  columns: RawDataSheetColumn[]
  envColumns: RawDataSheetColumn[]
  onUpdateFormula: (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => void
  /** Dialog stack level — use `top` when parent is already `stacked` (z-70). */
  layer?: 'default' | 'nested' | 'stacked' | 'top'
  locationOf?: (col: RawDataSheetColumn) => string
}) {
  const formula = column?.formula ?? emptyColumnFormula()
  const columnIndex = column ? columns.findIndex((c) => c.key === column.key) : -1
  const sourceOptions = useMemo(() => {
    if (!column) return [...envColumns]
    const dataCols = columns.filter(
      (c, i) => c.key !== column.key && (c.type !== 'formula' || columnIndex < 0 || i < columnIndex),
    )
    const seen = new Set(dataCols.map((c) => c.key))
    const extras = envColumns.filter((c) => c.key !== column.key && !seen.has(c.key))
    return [...dataCols, ...extras]
  }, [column, columns, columnIndex, envColumns])

  const labelOf = (key: string) =>
    (
      columns.find((c) => c.key === key)?.label ||
      envColumns.find((c) => c.key === key)?.label ||
      key
    ).trim()

  const [draftExpr, setDraftExpr] = useState('=')
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!open || !column) return
    setDraftExpr(legacyFormulaToExpression(column.formula ?? emptyColumnFormula(), labelOf))
    setHelpOpen(false)
    if (column.formula?.decimals == null) {
      onUpdateFormula(column, { decimals: 2 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when dialog opens for a column
  }, [open, column?.key])

  const validationIssue = useMemo((): FormulaValidationIssue | null => {
    if (!draftExpr.trim() || draftExpr.trim() === '=') return null
    return analyzeColumnFormulaExpression(draftExpr, sourceOptions)
  }, [draftExpr, sourceOptions])

  if (!column) return null

  const commitExpression = (nextExpr: string) => {
    const wrapped = wrapBareFormulaColumnRef(nextExpr, sourceOptions)
    setDraftExpr(wrapped)
    const sources = extractExpressionSourceKeys(wrapped, sourceOptions)
    const trimmed = wrapped.trim()
    let nextOp = formula.op
    if (/^\s*=?\s*AVERAGE\s*\(/i.test(trimmed)) nextOp = 'average'
    else if (/^\s*=?\s*SUM\s*\(/i.test(trimmed)) nextOp = 'sum'
    else if (/^\s*=?\s*MIN\s*\(/i.test(trimmed)) nextOp = 'min'
    else if (/^\s*=?\s*MAX\s*\(/i.test(trimmed)) nextOp = 'max'
    else if (/^\s*=?\s*MEDIAN\s*\(/i.test(trimmed)) nextOp = 'median'
    else if (/^\s*=?\s*TEMP_CORRECT\s*\(/i.test(trimmed)) nextOp = 'temp_correct'
    else if (/\*\s*\(\s*1\s*\+/i.test(trimmed) && sources.length >= 1) nextOp = 'temp_correct'
    else if (trimmed && trimmed !== '=') {
      // Custom arithmetic expression — keep a neutral op; evaluation uses expression.
      nextOp = 'sum'
    }
    onUpdateFormula(column, {
      expression: trimmed || null,
      sources,
      op: nextOp,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-xl flex-col',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2',
          'md:w-[min(36rem,calc(100vw-268px-2rem))] md:max-w-[min(36rem,calc(100vw-268px-2rem))]',
          'md:!-translate-x-1/2 md:!-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Column Calculation
              </DialogTitle>
            </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          <ColumnFormulaInput
            id={`rds-formula-${column.key}`}
            value={draftExpr}
            onChange={commitExpression}
            sourceColumns={sourceOptions}
            errorToken={validationIssue?.errorToken ?? null}
            formulaFor={column.label.trim() || 'Column'}
            locationOf={locationOf}
            toolbarExtra={
              <>
                <Label htmlFor={`rds-dec-${column.key}`} className="text-[11px]">
                  Decimals
                </Label>
                <Input
                  id={`rds-dec-${column.key}`}
                  type="number"
                  min={0}
                  max={6}
                  className="h-7 w-14 bg-white px-1.5 text-center"
                  value={formula.decimals ?? 2}
                  onChange={(e) => {
                    const t = e.target.value.trim()
                    const n = Number(t)
                    onUpdateFormula(column, {
                      decimals:
                        !t || !Number.isFinite(n) || n < 0 || n > 6 ? 2 : Math.round(n),
                    })
                  }}
                />
              </>
            }
            toolbarAfter={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('h-7 px-2 text-[11px]', limsOutlineBtnClass)}
                onClick={() => setHelpOpen(true)}
                aria-label="Formula help — list and usage"
              >
                <CircleHelp size={13} className="mr-1" aria-hidden />
                Formulas
              </Button>
            }
          />

          {sourceOptions.length === 0 ? (
            <p className="text-xs text-amber-700">
              Add number columns above this calculated column first — they appear as formula
              suggestions.
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => {
              const dp = formula.decimals != null ? formula.decimals : 2
              if (formula.decimals == null) {
                onUpdateFormula(column, { decimals: dp })
              }
              commitExpression(draftExpr)
              onOpenChange(false)
            }}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          persistOnFocusLoss
          layer={layer === 'default' ? 'nested' : layer}
          aria-describedby={undefined}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Formula List &amp; Use
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
              <table className="w-full min-w-[640px] border-collapse text-center text-sm">
                <thead className="bg-stone-800 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  <tr>
                    <th className="border border-stone-700 px-2 py-2">Formula</th>
                    <th className="border border-stone-700 px-2 py-2">Syntax</th>
                    <th className="border border-stone-700 px-2 py-2">Example</th>
                    <th className="border border-stone-700 px-2 py-2">Use</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMN_FORMULA_HELP_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td className="border border-stone-300 px-2 py-2 font-medium text-stone-900">
                        {row.name}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-xs text-stone-700">
                        {row.syntax}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-xs text-amber-900">
                        {row.example}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 text-stone-600">
                        {row.use}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => setHelpOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}


function EnvironmentConditionEditor({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  value: RawDataSheetTemplate
  onChange: (next: RawDataSheetTemplate) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [paramsOpen, setParamsOpen] = useState(false)
  const [envCalcTarget, setEnvCalcTarget] = useState<{
    rowId: string
    paramId: string
  } | null>(null)
  const envDefaults = value.environmentDefaults ?? {
    selectedParameters: [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
    parameterColumns: [],
    selectedReadingPoints: [] as string[],
    rows: [] as RawDataEnvironmentReadingRow[],
  }
  const parameterColumns = resolveEnvParameterColumns(envDefaults)
  const [draftColumns, setDraftColumns] = useState<EnvParameterColumn[]>(parameterColumns)
  const envRows = envDefaults.rows ?? []

  const patchEnvDefaults = (next: {
    selectedParameters?: EnvParameterKey[]
    parameterColumns?: EnvParameterColumn[]
    selectedReadingPoints?: string[]
    rows?: RawDataEnvironmentReadingRow[]
  }) => {
    const rows = next.rows ?? envRows
    const params = next.selectedParameters ?? envDefaults.selectedParameters
    const columns = next.parameterColumns ?? parameterColumns
    onChange({
      ...value,
      environmentDefaults: {
        selectedParameters: params,
        parameterColumns: columns,
        selectedReadingPoints: [
          ...new Set(
            next.selectedReadingPoints ?? rows.map((r) => r.readingLabel).filter(Boolean),
          ),
        ],
        rows,
      },
    })
  }

  const openParams = () => {
    const savedColumns = resolveEnvParameterColumns(envDefaults).map((c) => ({ ...c }))
    setDraftColumns(
      savedColumns.length > 0 ? savedColumns : [emptyEnvParameterColumn()],
    )
    setParamsOpen(true)
  }

  const saveParams = () => {
    const cleaned = draftColumns
      .map((c) => ({
        id: c.id.trim() || emptyEnvParameterColumn().id,
        header: c.header.trim(),
      }))
      .filter((c) => c.header.length > 0)
    const finalCols = cleaned
    const selected = ENV_PARAMETER_OPTIONS.map((o) => o.key).filter((k) =>
      finalCols.some((c) => c.id === k),
    ) as EnvParameterKey[]
    patchEnvDefaults({
      parameterColumns: finalCols,
      selectedParameters: selected,
    })
    setParamsOpen(false)
  }

  const addEnvRow = () => {
    patchEnvDefaults({
      rows: [
        ...envRows,
        {
          ...emptyEnvironmentReadingRow('Average', 'number'),
          fieldType: 'number',
          values: Object.fromEntries(parameterColumns.map((c) => [c.id, ''])),
        },
      ],
    })
  }

  const patchEnvRow = (
    rowId: string,
    patch: {
      readingLabel?: string
      fieldType?: EnvRowFieldType
      values?: Record<string, string>
      formulas?: Record<string, string> | null
      clearFormulas?: boolean
    },
  ) => {
    patchEnvDefaults({
      rows: envRows.map((row) => {
        if (row.id !== rowId) return row
        const nextFormulas = patch.clearFormulas
          ? undefined
          : patch.formulas
            ? { ...(row.formulas ?? {}), ...patch.formulas }
            : row.formulas
        const { formulas: _prevFormulas, ...rest } = row
        return {
          ...rest,
          readingLabel: patch.readingLabel ?? row.readingLabel,
          fieldType: patch.fieldType ?? row.fieldType,
          values: patch.values ? { ...row.values, ...patch.values } : row.values,
          ...(nextFormulas && Object.keys(nextFormulas).length > 0
            ? { formulas: nextFormulas }
            : {}),
        }
      }),
    })
  }

  const applyStandardField = (rowId: string, fieldLabel: string) => {
    const sourceLabels = envRows
      .filter((r) => r.id !== rowId && !isEnvRowCalculated(r))
      .map((r) => r.readingLabel.trim())
      .filter((label) => label.length > 0)
    const expr = defaultEnvStatFormulaExpression(fieldLabel, sourceLabels)
    const formulas: Record<string, string> = {}
    for (const col of parameterColumns) {
      formulas[col.id] = expr
    }
    patchEnvRow(rowId, {
      readingLabel: fieldLabel,
      fieldType: 'formula',
      formulas,
      values: Object.fromEntries(parameterColumns.map((c) => [c.id, ''])),
    })
  }

  const changeEnvFieldType = (rowId: string, type: EnvRowFieldType) => {
    if (type === 'formula') {
      const row = envRows.find((r) => r.id === rowId)
      const label = row?.readingLabel.trim() || 'Average'
      applyStandardField(rowId, isEnvStandardFieldLabel(label) ? label : 'Average')
      return
    }
    patchEnvRow(rowId, {
      fieldType: type,
      clearFormulas: true,
    })
  }

  const seededAverageRef = useRef(false)
  useEffect(() => {
    if (!open) {
      seededAverageRef.current = false
      return
    }
    if (seededAverageRef.current || parameterColumns.length === 0) return
    if (envRows.length === 0) {
      seededAverageRef.current = true
      patchEnvDefaults({
        rows: [
          {
            ...emptyEnvironmentReadingRow('Average', 'number'),
            fieldType: 'number',
            values: Object.fromEntries(parameterColumns.map((c) => [c.id, ''])),
          },
        ],
      })
      return
    }
    if (envRows.length === 1) {
      const first = envRows[0]!
      const label = first.readingLabel.trim()
      if (!first.fieldType && (!label || /^Reading \d+$/i.test(label))) {
        seededAverageRef.current = true
        patchEnvRow(first.id, {
          readingLabel: label || 'Average',
          fieldType: 'number',
          clearFormulas: true,
        })
      }
    }
  }, [open, parameterColumns, envRows])

  const removeEnvRow = (rowId: string) => {
    patchEnvDefaults({
      rows: envRows.filter((r) => r.id !== rowId),
    })
  }

  const envCalcRow = envCalcTarget
    ? (envRows.find((r) => r.id === envCalcTarget.rowId) ?? null)
    : null
  const envCalcParam = envCalcTarget
    ? (parameterColumns.find((c) => c.id === envCalcTarget.paramId) ?? null)
    : null
  const envCalcSourceColumns: RawDataSheetColumn[] = envRows
    .filter(
      (r) =>
        r.id !== envCalcTarget?.rowId &&
        r.readingLabel.trim().length > 0 &&
        !isEnvRowCalculated(r),
    )
    .map((r) => ({
      key: r.id,
      label: r.readingLabel.trim(),
      type: 'number',
      required: false,
    }))
  const envCalcColumn: RawDataSheetColumn | null =
    envCalcRow && envCalcParam
      ? {
          key: `envcalc_${envCalcRow.id}_${envCalcParam.id}`,
          label: `${envCalcRow.readingLabel.trim() || 'Field'} — ${envCalcParam.header}`,
          type: 'formula',
          required: false,
          formula: {
            ...emptyColumnFormula(),
            op: 'average',
            expression: envCalcRow.formulas?.[envCalcParam.id]?.trim() || '=',
          },
        }
      : null
  const envCalcColumns: RawDataSheetColumn[] = envCalcColumn
    ? [...envCalcSourceColumns, envCalcColumn]
    : envCalcSourceColumns

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Environment Condition
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('h-8 shrink-0', limsOutlineBtnClass)}
                onClick={openParams}
                aria-label="Edit environment parameter column headers"
              >
                <Settings2 size={14} className="mr-1.5" aria-hidden />
                Parameters
                {parameterColumns.length > 0 ? (
                  <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    {parameterColumns.length}
                  </span>
                ) : null}
              </Button>
            </div>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">

      <div className="overflow-x-auto rounded-none border-2 border-stone-400">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thClass, 'min-w-[160px] text-left')}>Field Label</th>
              <th className={cn(thClass, 'w-36 text-center')}>Field Type</th>
              {parameterColumns.map((opt) => (
                <th
                  key={opt.id}
                  className={cn(thClass, 'min-w-[120px] text-center')}
                >
                  {opt.header}
                </th>
              ))}
              <th className={cn(thClass, 'w-16 text-center')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {parameterColumns.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="border border-[#e7e0d4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-stone-500"
                >
                  Open Parameters and add column headers (e.g. Temperature, Humidity, Pressure).
                </td>
              </tr>
            ) : envRows.length === 0 ? (
              <tr>
                <td
                  colSpan={parameterColumns.length + 2}
                  className="border border-[#e7e0d4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-stone-500"
                >
                  No rows yet. Click + to add a Field (reading / point).
                </td>
                <td className="border border-[#e7e0d4] px-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={addBtnClass}
                    onClick={addEnvRow}
                    aria-label="Add environment row"
                  >
                    <Plus size={14} />
                  </Button>
                </td>
              </tr>
            ) : (
              envRows.map((row, index) => {
                const fieldType = resolveEnvRowFieldType(row)
                const isCalc = fieldType === 'formula'
                return (
                  <tr key={row.id}>
                    <td className="border border-[#e7e0d4] px-1.5 py-1.5 align-top">
                      <Input
                        className="h-9"
                        placeholder="e.g. Average"
                        value={row.readingLabel}
                        onChange={(e) =>
                          patchEnvRow(row.id, { readingLabel: e.target.value })
                        }
                        aria-label={`Field label for environment row ${index + 1}`}
                      />
                    </td>
                    <td className="border border-[#e7e0d4] px-1.5 py-1.5 text-center align-top">
                      <Select
                        value={fieldType}
                        onValueChange={(v) =>
                          changeEnvFieldType(
                            row.id,
                            v === 'text' ? 'text' : v === 'formula' ? 'formula' : 'number',
                          )
                        }
                      >
                        <SelectTrigger
                          className="mx-auto h-9 w-[120px]"
                          aria-label={`Field type for environment row ${index + 1}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="formula">Calculated</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {parameterColumns.map((opt) => {
                      return (
                      <td key={opt.id} className="border border-[#e7e0d4] px-1.5 py-1">
                        {isCalc ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              'mx-auto flex h-9 w-full max-w-[11rem] items-center justify-center gap-1.5 px-2 text-xs',
                              limsOutlineBtnClass,
                            )}
                            onClick={() =>
                              setEnvCalcTarget({ rowId: row.id, paramId: opt.id })
                            }
                            aria-label={`Set formula for ${opt.header} row ${index + 1}`}
                            title={row.formulas?.[opt.id]?.trim() || 'Set formula'}
                          >
                            <Calculator size={14} aria-hidden />
                            Set Formula
                          </Button>
                        ) : (
                          <Input
                            inputMode={fieldType === 'number' ? 'decimal' : 'text'}
                            placeholder={opt.header}
                            value={row.values[opt.id] ?? ''}
                            onChange={(e) =>
                              patchEnvRow(row.id, {
                                values: { [opt.id]: e.target.value },
                              })
                            }
                            className="h-9 text-center font-mono"
                            aria-label={`${opt.header} for row ${index + 1}`}
                          />
                        )}
                      </td>
                      )
                    })}
                    <td className="border border-[#e7e0d4] px-1 text-center">
                      {index === envRows.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={addBtnClass}
                          onClick={addEnvRow}
                          aria-label="Add environment row"
                        >
                          <Plus size={14} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => removeEnvRow(row.id)}
                          aria-label={`Delete environment row ${index + 1}`}
                        >
                          <Trash2 size={14} />
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

      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="top"
          className={cn(limsDialogClass, 'flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0')}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Parameter Columns
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(thClass, 'w-12 text-center')}>#</th>
                    <th className={cn(thClass, 'text-left')}>Column header</th>
                    <th className={cn(thClass, 'w-16 text-center')}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draftColumns.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="border border-[#e7e0d4] px-3 py-6 text-center text-muted-foreground"
                      >
                        No parameters yet. Click Add Parameter.
                      </td>
                    </tr>
                  ) : (
                    draftColumns.map((col, index) => (
                      <tr key={col.id}>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center text-slate-500">
                          {index + 1}
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2">
                          <Input
                            value={col.header}
                            onChange={(e) =>
                              setDraftColumns((prev) =>
                                prev.map((c) =>
                                  c.id === col.id ? { ...c, header: e.target.value } : c,
                                ),
                              )
                            }
                            placeholder="e.g. Temperature (°C)"
                            className="h-9"
                            aria-label={`Parameter header ${index + 1}`}
                          />
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          {index === draftColumns.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 w-8 px-0 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                              onClick={() =>
                                setDraftColumns((prev) => [
                                  ...prev,
                                  emptyEnvParameterColumn(),
                                ])
                              }
                              aria-label="Add parameter"
                            >
                              <Plus size={16} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setDraftColumns((prev) =>
                                  prev.filter((c) => c.id !== col.id),
                                )
                              }
                              aria-label={`Delete parameter ${index + 1}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={saveParams}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => onOpenChange(false)}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ColumnCalculationDialog
      open={envCalcTarget != null}
      onOpenChange={(next) => {
        if (!next) setEnvCalcTarget(null)
      }}
      layer="top"
      column={envCalcColumn}
      columns={envCalcColumns}
      envColumns={[]}
      onUpdateFormula={(_col, patch) => {
        if (!envCalcTarget) return
        const expr = String(patch.expression ?? '').trim() || '='
        patchEnvRow(envCalcTarget.rowId, {
          formulas: { [envCalcTarget.paramId]: expr },
          values: { [envCalcTarget.paramId]: '' },
        })
      }}
    />
    </>
  )
}

export function RawDataSheetTemplateEditor({
  value,
  onChange,
  masterPointsTables = [],
  masterEquipmentIds = [],
  environmentDialogOpen = false,
  onEnvironmentDialogOpenChange,
  verificationDialogOpen = false,
  onVerificationDialogOpenChange,
}: {
  value: RawDataSheetTemplate
  onChange: (next: RawDataSheetTemplate) => void
  /** Selected masters' calibration-points tables — column headers become formula refs. */
  masterPointsTables?: Array<{ columns: Array<{ header: string }> }>
  /** When tables are not loaded yet, fetch column headers from these master ids. */
  masterEquipmentIds?: string[]
  environmentDialogOpen?: boolean
  onEnvironmentDialogOpenChange?: (open: boolean) => void
  verificationDialogOpen?: boolean
  onVerificationDialogOpenChange?: (open: boolean) => void
}) {
  const [calculationColumnKey, setCalculationColumnKey] = useState<string | null>(null)
  const [fetchedPointsTables, setFetchedPointsTables] = useState<
    Array<{ columns: Array<{ header: string }> }>
  >([])

  useEffect(() => {
    const ids = [...new Set(masterEquipmentIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) {
      setFetchedPointsTables([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('equipment_for_calibration')
          .select('id, calibration_points')
          .in('id', ids)
        if (error) throw error
        if (cancelled) return
        const tables = ((data ?? []) as Array<{ calibration_points: unknown }>).map((row) => {
          const table = parseCalibrationPointsTable(row.calibration_points)
          return { columns: table.columns.map((c) => ({ header: c.header })) }
        })
        setFetchedPointsTables(tables.filter((t) => t.columns.length > 0))
      } catch {
        if (!cancelled) setFetchedPointsTables([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [masterEquipmentIds.join('|')])

  const pointsTablesForRefs = useMemo(() => {
    const fromProps = masterPointsTables.filter((t) => (t.columns?.length ?? 0) > 0)
    if (fromProps.length === 0) return fetchedPointsTables
    if (fetchedPointsTables.length === 0) return fromProps
    return [...fromProps, ...fetchedPointsTables]
  }, [masterPointsTables, fetchedPointsTables])

  const envFormulaColumns = useMemo(
    () => [
      ...envParameterFormulaColumns(value.environmentDefaults),
      ...masterEquipmentFormulaRefColumns(),
      ...masterPointsFormulaRefColumns(pointsTablesForRefs),
    ],
    [value.environmentDefaults, pointsTablesForRefs],
  )

  const mapTableColumns = (
    tableId: string,
    mapper: (cols: RawDataSheetColumn[]) => RawDataSheetColumn[],
  ) => {
    if (tableId === PRIMARY_RAW_DATA_TABLE_ID) {
      onChange({ ...value, columns: mapper(value.columns) })
      return
    }
    onChange({
      ...value,
      extraTables: (value.extraTables ?? []).map((table) =>
        table.id === tableId ? { ...table, columns: mapper(table.columns) } : table,
      ),
    })
  }

  const updateColumn = (tableId: string, key: string, patch: Partial<RawDataSheetColumn>) => {
    mapTableColumns(tableId, (cols) => cols.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const changeColumnType = (
    tableId: string,
    col: RawDataSheetColumn,
    type: RawDataSheetColumn['type'],
  ) => {
    if (type === 'formula') {
      updateColumn(tableId, col.key, {
        type,
        required: false,
        requiredMode: 'auto',
        formula: col.formula ?? emptyColumnFormula(),
      })
      setCalculationColumnKey(col.key)
      return
    }
    mapTableColumns(tableId, (cols) =>
      cols.map((c) => {
        if (c.key !== col.key) return c
        const next: RawDataSheetColumn = { ...c, type }
        delete next.formula
        delete next.requiredMode
        return next
      }),
    )
    if (calculationColumnKey === col.key) setCalculationColumnKey(null)
  }

  const updateFormula = (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => {
    const tableId =
      value.columns.some((c) => c.key === col.key)
        ? PRIMARY_RAW_DATA_TABLE_ID
        : (value.extraTables ?? []).find((t) => t.columns.some((c) => c.key === col.key))?.id ??
          PRIMARY_RAW_DATA_TABLE_ID
    updateColumn(tableId, col.key, {
      formula: { ...(col.formula ?? emptyColumnFormula()), ...patch },
    })
  }

  const addColumn = (tableId: string) => {
    mapTableColumns(tableId, (cols) => [...cols, emptyRawDataSheetColumn()])
  }

  const removeColumn = (tableId: string, key: string) => {
    if (calculationColumnKey === key) setCalculationColumnKey(null)
    mapTableColumns(tableId, (cols) => {
      if (cols.length <= 1) return [emptyRawDataSheetColumn()]
      return cols.filter((c) => c.key !== key)
    })
  }

  const moveColumn = (tableId: string, index: number, dir: -1 | 1) => {
    mapTableColumns(tableId, (cols) => {
      const next = index + dir
      if (next < 0 || next >= cols.length) return cols
      const copy = [...cols]
      ;[copy[index], copy[next]] = [copy[next]!, copy[index]!]
      return copy
    })
  }

  const setTableName = (tableId: string, name: string) => {
    if (tableId === PRIMARY_RAW_DATA_TABLE_ID) {
      onChange({ ...value, tableName: name })
      return
    }
    onChange({
      ...value,
      extraTables: (value.extraTables ?? []).map((table) =>
        table.id === tableId ? { ...table, name } : table,
      ),
    })
  }

  const addRawDataTable = () => {
    const nextNo = (value.extraTables?.length ?? 0) + 2
    onChange({
      ...value,
      extraTables: [
        ...(value.extraTables ?? []),
        emptyRawDataSheetTableBlock(`Raw data table ${nextNo}`),
      ],
    })
  }

  const removeRawDataTable = (tableId: string) => {
    if (tableId === PRIMARY_RAW_DATA_TABLE_ID) return
    const removed = (value.extraTables ?? []).find((t) => t.id === tableId)
    if (removed?.columns.some((c) => c.key === calculationColumnKey)) {
      setCalculationColumnKey(null)
    }
    onChange({
      ...value,
      extraTables: (value.extraTables ?? []).filter((table) => table.id !== tableId),
    })
  }

  const editorTables = [
    {
      id: PRIMARY_RAW_DATA_TABLE_ID,
      name: value.tableName ?? DEFAULT_RAW_DATA_TABLE_NAME,
      columns: value.columns,
      isPrimary: true,
    },
    ...(value.extraTables ?? []).map((table) => ({
      ...table,
      isPrimary: false,
    })),
  ]

  const updateItem = (id: string, patch: Partial<{ label: string; required: boolean }>) => {
    onChange({
      ...value,
      verification: {
        items: value.verification.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })
  }

  const addItem = () => {
    onChange({
      ...value,
      verification: {
        items: [...value.verification.items, emptyVerificationItem()],
      },
    })
  }

  const removeItem = (id: string) => {
    if (value.verification.items.length <= 1) {
      onChange({
        ...value,
        verification: { items: [emptyVerificationItem()] },
      })
      return
    }
    onChange({
      ...value,
      verification: {
        items: value.verification.items.filter((item) => item.id !== id),
      },
    })
  }

  const calculationColumn =
    allRawDataSheetColumns(value).find(
      (c) => c.key === calculationColumnKey && c.type === 'formula',
    ) ?? null

  return (
    <div className="space-y-5 rounded-none border-2 border-stone-400 bg-[#f7f3eb] p-4 ring-1 ring-amber-700/20">
      <Dialog
        open={verificationDialogOpen}
        onOpenChange={onVerificationDialogOpenChange ?? (() => undefined)}
      >
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
          )}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Verification Checklist
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(thClass, 'w-12 text-center')}>#</th>
                    <th className={cn(thClass, 'text-left')}>Check item</th>
                    <th className={cn(thClass, 'w-24 text-center')}>Required</th>
                    <th className={cn(thClass, 'w-16 text-center')}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {value.verification.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="border border-[#e7e0d4] bg-[#fffcf7] px-3 py-6 text-center text-stone-500"
                      >
                        No verification items yet. Click + to add a check item.
                      </td>
                      <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn('mx-auto', addBtnClass)}
                          onClick={addItem}
                          aria-label="Add verification item"
                        >
                          <Plus size={16} />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    value.verification.items.map((item, index) => (
                      <tr key={item.id}>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center text-stone-500">
                          {index + 1}
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2">
                          <Input
                            value={item.label}
                            onChange={(e) => updateItem(item.id, { label: e.target.value })}
                            placeholder="e.g. Visual inspection OK"
                            className="h-9"
                            aria-label={`Verification item ${index + 1}`}
                          />
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="mx-auto block h-4 w-4 accent-amber-700"
                            checked={item.required}
                            onChange={(e) => updateItem(item.id, { required: e.target.checked })}
                            aria-label={`Required verification ${index + 1}`}
                          />
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          {index === value.verification.items.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn('mx-auto', addBtnClass)}
                              onClick={addItem}
                              aria-label="Add verification item"
                            >
                              <Plus size={16} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Delete verification ${index + 1}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => onVerificationDialogOpenChange?.(false)}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnvironmentConditionEditor
        value={value}
        onChange={onChange}
        open={environmentDialogOpen}
        onOpenChange={onEnvironmentDialogOpenChange ?? (() => undefined)}
      />

      {editorTables.map((table) => (
        <div key={table.id} className="space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor={`rds-table-name-${table.id}`}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-600"
            >
              Table name
            </label>
            <Input
              id={`rds-table-name-${table.id}`}
              value={table.name}
              onChange={(e) => setTableName(table.id, e.target.value)}
              placeholder="e.g. Raw data columns"
              className="h-9 min-w-0 flex-1"
              aria-label="Raw data table name"
            />
            {table.isPrimary ? (
              <Button
                type="button"
                variant="outline"
                className={cn('h-9', limsOutlineBtnClass)}
                onClick={addRawDataTable}
              >
                <Plus size={16} className="mr-1.5" aria-hidden />
                Add table
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-destructive hover:bg-destructive/10"
                onClick={() => removeRawDataTable(table.id)}
                aria-label={`Delete table ${table.name || 'extra'}`}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-none border-2 border-stone-400 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(thClass, 'w-16 text-center')}>Order</th>
                  <th className={cn(thClass, 'text-left')}>Column label</th>
                  <th className={cn(thClass, 'w-28 text-center')}>Type</th>
                  <th className={cn(thClass, 'w-32 text-center')}>Required in Raw Data</th>
                  <th className={cn(thClass, 'w-32 text-center')}>Required in Certificate</th>
                  <th className={cn(thClass, 'w-16 text-center')}>Action</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col, index) => {
                  const isFormula = col.type === 'formula'
                  return (
                    <Fragment key={col.key}>
                      <tr>
                        <td className="border border-[#e7e0d4] px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <GripVertical size={14} className="text-slate-400" aria-hidden />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1 text-xs"
                              disabled={index === 0}
                              onClick={() => moveColumn(table.id, index, -1)}
                              aria-label={`Move column ${index + 1} up`}
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1 text-xs"
                              disabled={index === table.columns.length - 1}
                              onClick={() => moveColumn(table.id, index, 1)}
                              aria-label={`Move column ${index + 1} down`}
                            >
                              ↓
                            </Button>
                          </div>
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={col.label}
                              onChange={(e) =>
                                updateColumn(table.id, col.key, { label: e.target.value })
                              }
                              placeholder={isFormula ? 'e.g. Average Reading' : 'e.g. As Found'}
                              className="h-9"
                              aria-label={`Column label ${index + 1}`}
                            />
                            {isFormula ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 shrink-0 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
                                onClick={() => setCalculationColumnKey(col.key)}
                                aria-label={`Column calculation for ${col.label || `column ${index + 1}`}`}
                                title="Set formula"
                              >
                                <Calculator size={16} />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          <Select
                            value={col.type}
                            onValueChange={(v) =>
                              changeColumnType(
                                table.id,
                                col,
                                v === 'number' ? 'number' : v === 'formula' ? 'formula' : 'text',
                              )
                            }
                          >
                            <SelectTrigger
                              className="mx-auto h-9 w-[110px]"
                              aria-label={`Column type ${index + 1}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="formula">Calculated</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="mx-auto block h-4 w-4 accent-amber-700"
                            checked={col.required}
                            onChange={(e) =>
                              updateColumn(table.id, col.key, {
                                required: e.target.checked,
                                requiredMode: e.target.checked ? 'yes' : 'no',
                              })
                            }
                            aria-label={`Required column ${index + 1}`}
                          />
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="mx-auto block h-4 w-4 accent-amber-700"
                            checked={col.requiredInCertificate !== false}
                            onChange={(e) =>
                              updateColumn(table.id, col.key, {
                                requiredInCertificate: e.target.checked,
                              })
                            }
                            aria-label={`Required in certificate for ${col.label || `column ${index + 1}`}`}
                            title="If checked, this column is shown on the calibration certificate"
                          />
                        </td>
                        <td className="border border-[#e7e0d4] px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {index === table.columns.length - 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={addBtnClass}
                                onClick={() => addColumn(table.id)}
                                aria-label="Add column"
                              >
                                <Plus size={16} />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 px-0 text-destructive hover:bg-destructive/10"
                                onClick={() => removeColumn(table.id, col.key)}
                                aria-label={`Delete column ${index + 1}`}
                              >
                                <Trash2 size={16} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <ColumnCalculationDialog
        open={calculationColumn != null}
        onOpenChange={(open) => {
          if (!open) setCalculationColumnKey(null)
        }}
        column={calculationColumn}
        columns={allRawDataSheetColumns(value)}
        envColumns={envFormulaColumns}
        onUpdateFormula={updateFormula}
      />
    </div>
  )
}
