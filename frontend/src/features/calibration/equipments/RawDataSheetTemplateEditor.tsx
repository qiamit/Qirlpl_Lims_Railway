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
  EMPTY_RAW_DATA_ENVIRONMENT,
  ENV_PARAMETER_OPTIONS,
  ENV_STANDARD_FIELD_OPTIONS,
  defaultEnvStatFormulaExpression,
  emptyColumnFormula,
  emptyEnvParameterColumn,
  emptyEnvironmentReadingRow,
  emptyRawDataSheetColumn,
  emptyVerificationItem,
  envParameterFormulaColumns,
  ENV_FORMULA_REF_PREFIX,
  evaluateEnvParameterFormula,
  extractExpressionSourceKeys,
  formulaOpMeta,
  isEnvStandardFieldLabel,
  resolveEnvParameterColumns,
  analyzeColumnFormulaExpression,
  COLUMN_FORMULA_HELP_ROWS,
  type FormulaValidationIssue,
  type EnvParameterColumn,
  type EnvParameterKey,
  type RawDataColumnFormula,
  type RawDataEnvironmentReadingRow,
  type RawDataSheetColumn,
  type RawDataSheetTemplate,
} from '@/features/calibration/rawDataSheetTypes'
import {
  deleteSavedColumnFormula,
  loadSavedColumnFormulas,
  saveColumnFormula,
  type SavedColumnFormula,
} from '@/features/calibration/equipments/savedColumnFormulas'

function bracketLabel(label: string): string {
  return `[${label.trim() || 'Untitled'}]`
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

function ColumnFormulaInput({
  id,
  value,
  onChange,
  sourceColumns,
  errorToken = null,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  sourceColumns: RawDataSheetColumn[]
  errorToken?: string | null
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

  /** Grow the box as the formula wraps to more lines. */
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const token = useMemo(() => findAutocompleteToken(value, cursor), [value, cursor])

  const suggestions = useMemo(() => {
    if (!token) return []
    const q = token.query.trim().toLowerCase()
    return sourceColumns.filter((c) => {
      const label = (c.label || 'Untitled column').toLowerCase()
      const key = c.key.toLowerCase()
      return !q || label.includes(q) || key.includes(q)
    })
  }, [sourceColumns, token])

  useEffect(() => {
    setOpen(Boolean(token) && suggestions.length > 0)
    setHighlight(0)
  }, [token, suggestions.length])

  const insertColumn = (col: RawDataSheetColumn) => {
    if (!token) return
    const insert = bracketLabel(col.label || col.key)
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

  return (
    <div className="relative space-y-1">
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
        </div>
      </div>

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

      <div
        className={cn(
          'relative min-h-10 overflow-hidden rounded-md border bg-white shadow-sm',
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
          className="absolute z-[90] mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((col, i) => {
            const isEnv = col.key.startsWith(ENV_FORMULA_REF_PREFIX)
            return (
            <li key={col.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm',
                  i === highlight ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50',
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertColumn(col)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{col.label || 'Untitled column'}</span>
                  {isEnv ? (
                    <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-800">
                      Env
                    </span>
                  ) : null}
                </span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-slate-400">
                  {bracketLabel(col.label || col.key)}
                </span>
              </button>
            </li>
            )
          })}
        </ul>
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
          className="absolute z-[90] mt-1 max-h-40 w-full min-w-[12rem] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
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

function ColumnCalculationDialog({
  open,
  onOpenChange,
  column,
  columns,
  envColumns,
  onUpdateFormula,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: RawDataSheetColumn | null
  columns: RawDataSheetColumn[]
  envColumns: RawDataSheetColumn[]
  onUpdateFormula: (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => void
}) {
  const formula = column?.formula ?? emptyColumnFormula()
  const columnIndex = column ? columns.findIndex((c) => c.key === column.key) : -1
  const sourceOptions = useMemo(() => {
    if (!column || columnIndex < 0) return []
    const dataCols = columns.filter(
      (c, i) => c.key !== column.key && (c.type !== 'formula' || i < columnIndex),
    )
    return [...dataCols, ...envColumns]
  }, [column, columns, columnIndex, envColumns])

  const labelOf = (key: string) =>
    (columns.find((c) => c.key === key)?.label || key).trim()

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
    setDraftExpr(nextExpr)
    const sources = extractExpressionSourceKeys(nextExpr, sourceOptions)
    const trimmed = nextExpr.trim()
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
        layer="nested"
        className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
          <DialogHeader className="text-left">
            <div className="min-w-0 pr-8">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
                Calculated Column
              </p>
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Column Calculation
              </DialogTitle>
              <p className="mt-1 text-xs text-slate-300">
                {column.label.trim() || 'Untitled column'}
              </p>
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
          <ColumnFormulaInput
            id={`rds-formula-${column.key}`}
            value={draftExpr}
            onChange={commitExpression}
            sourceColumns={sourceOptions}
            errorToken={validationIssue?.errorToken ?? null}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={`rds-dec-${column.key}`} className="text-[11px]">
                Decimals
              </Label>
              <Input
                id={`rds-dec-${column.key}`}
                type="number"
                min={0}
                max={6}
                className="h-9 w-[110px] bg-white"
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
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-indigo-600/40 text-indigo-800 hover:bg-indigo-50"
              onClick={() => setHelpOpen(true)}
              aria-label="Formula help — list and usage"
            >
              <CircleHelp size={14} className="mr-1.5" aria-hidden />
              Formulas
            </Button>
          </div>

          {sourceOptions.length === 0 ? (
            <p className="text-xs text-amber-700">
              Add number columns above this calculated column first — they appear as formula
              suggestions.
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            onClick={() => {
              commitExpression(draftExpr)
              onOpenChange(false)
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="nested"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
            <DialogHeader className="text-left">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-300/90">
                Column Calculation
              </p>
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Formula List &amp; Use
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] border-collapse text-center text-sm">
                <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="border border-slate-200 px-2 py-2">Formula</th>
                    <th className="border border-slate-200 px-2 py-2">Syntax</th>
                    <th className="border border-slate-200 px-2 py-2">Example</th>
                    <th className="border border-slate-200 px-2 py-2">Use</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMN_FORMULA_HELP_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td className="border border-slate-200 px-2 py-2 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 font-mono text-xs text-slate-700">
                        {row.syntax}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 font-mono text-xs text-indigo-900">
                        {row.example}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-slate-600">
                        {row.use}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" onClick={() => setHelpOpen(false)}>
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
}: {
  value: RawDataSheetTemplate
  onChange: (next: RawDataSheetTemplate) => void
}) {
  const [paramsOpen, setParamsOpen] = useState(false)
  const envDefaults = value.environmentDefaults ?? {
    selectedParameters: [...EMPTY_RAW_DATA_ENVIRONMENT.selectedParameters],
    parameterColumns: [],
    selectedReadingPoints: [] as string[],
    rows: [] as RawDataEnvironmentReadingRow[],
  }
  const parameterColumns = resolveEnvParameterColumns(envDefaults)
  const [draftColumns, setDraftColumns] = useState<EnvParameterColumn[]>(parameterColumns)
  const envRows = envDefaults.rows ?? []
  const cols = value.columns.filter((c) => c.type !== 'formula')
  const readingLike = cols.filter((c) =>
    /reading|indicator|obs|observed|as\s*found|as\s*left/i.test(c.label),
  )
  const readingLabels = [
    ...new Set(
      (readingLike.length > 0 ? readingLike : cols).map((c) => c.label.trim()).filter(Boolean),
    ),
  ]

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
    const used = new Set(envRows.map((r) => r.readingLabel.trim()))
    const nextLabel =
      readingLabels.find((label) => !used.has(label)) ?? `Reading ${envRows.length + 1}`
    patchEnvDefaults({
      rows: [...envRows, emptyEnvironmentReadingRow(nextLabel)],
    })
  }

  const patchEnvRow = (
    rowId: string,
    patch: {
      readingLabel?: string
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
          values: patch.values ? { ...row.values, ...patch.values } : row.values,
          ...(nextFormulas && Object.keys(nextFormulas).length > 0
            ? { formulas: nextFormulas }
            : {}),
        }
      }),
    })
  }

  /** Only Environment Field rows (data rows) — not Raw Data Sheet columns. */
  const envDataFieldLabels = [
    ...new Set(
      envRows
        .map((r) => r.readingLabel.trim())
        .filter((label) => label.length > 0 && !isEnvStandardFieldLabel(label)),
    ),
  ]

  const applyStandardField = (rowId: string, fieldLabel: string) => {
    const sourceLabels = envRows
      .filter((r) => r.id !== rowId)
      .map((r) => r.readingLabel.trim())
      .filter((label) => label.length > 0 && !isEnvStandardFieldLabel(label))
    const expr = defaultEnvStatFormulaExpression(fieldLabel, sourceLabels)
    const formulas: Record<string, string> = {}
    for (const col of parameterColumns) {
      formulas[col.id] = expr
    }
    patchEnvRow(rowId, {
      readingLabel: fieldLabel,
      formulas,
      values: Object.fromEntries(parameterColumns.map((c) => [c.id, ''])),
    })
  }

  const removeEnvRow = (rowId: string) => {
    patchEnvDefaults({
      rows: envRows.filter((r) => r.id !== rowId),
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-800">
          <Thermometer size={18} aria-hidden />
        </div>
        <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">Environment Condition</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 border-sky-600/40 text-sky-900 hover:bg-sky-50"
          onClick={openParams}
          aria-label="Edit environment parameter column headers"
        >
          <Settings2 size={14} className="mr-1.5" aria-hidden />
          Parameters
          {parameterColumns.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-sky-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
              {parameterColumns.length}
            </span>
          ) : null}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="min-w-[180px] border border-slate-200 px-2 py-2 text-left">Field</th>
              {parameterColumns.map((opt) => (
                <th
                  key={opt.id}
                  className="min-w-[120px] border border-slate-200 px-2 py-2 text-center"
                >
                  {opt.header}
                </th>
              ))}
              <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {parameterColumns.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="border border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                >
                  Open Parameters and add column headers (e.g. Temperature, Humidity, Pressure).
                </td>
              </tr>
            ) : envRows.length === 0 ? (
              <tr>
                <td
                  colSpan={parameterColumns.length + 1}
                  className="border border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                >
                  No rows yet. Click + to add a Field (reading / point).
                </td>
                <td className="border border-slate-200 px-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                    onClick={addEnvRow}
                    aria-label="Add environment row"
                  >
                    <Plus size={14} />
                  </Button>
                </td>
              </tr>
            ) : (
              envRows.map((row, index) => {
                const isStandard = isEnvStandardFieldLabel(row.readingLabel)
                const known = readingLabels.includes(row.readingLabel) || isStandard
                return (
                  <tr key={row.id}>
                    <td className="border border-slate-200 px-1.5 py-1.5 align-top">
                      <Select
                        value={
                          known
                            ? row.readingLabel
                            : row.readingLabel
                              ? '__custom__'
                              : undefined
                        }
                        onValueChange={(v) => {
                          if (v === '__custom__') {
                            patchEnvRow(row.id, {
                              readingLabel: `Reading ${index + 1}`,
                              clearFormulas: true,
                            })
                            return
                          }
                          if (isEnvStandardFieldLabel(v)) {
                            applyStandardField(row.id, v)
                            return
                          }
                          patchEnvRow(row.id, {
                            readingLabel: v,
                            clearFormulas: true,
                          })
                        }}
                      >
                        <SelectTrigger
                          className="h-9"
                          aria-label={`Field for environment row ${index + 1}`}
                        >
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {readingLabels.map((label) => (
                            <SelectItem key={label} value={label}>
                              {label}
                            </SelectItem>
                          ))}
                          {readingLabels.length > 0 ? (
                            <SelectSeparator />
                          ) : null}
                          {ENV_STANDARD_FIELD_OPTIONS.map((label) => (
                            <SelectItem key={label} value={label}>
                              {label}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value="__custom__">Custom label…</SelectItem>
                        </SelectContent>
                      </Select>
                      {!known ? (
                        <Input
                          className="mt-1.5 h-8 text-xs"
                          placeholder="Custom field label"
                          value={row.readingLabel}
                          onChange={(e) =>
                            patchEnvRow(row.id, { readingLabel: e.target.value })
                          }
                        />
                      ) : null}
                    </td>
                    {parameterColumns.map((opt) => {
                      const sameColumnFields = envRows
                        .filter(
                          (r) =>
                            r.id !== row.id &&
                            r.readingLabel.trim().length > 0 &&
                            !isEnvStandardFieldLabel(r.readingLabel),
                        )
                        .map((r) => r.readingLabel.trim())
                      const uniqueSameColumnFields = [...new Set(sameColumnFields)]
                      return (
                      <td key={opt.id} className="border border-slate-200 px-1.5 py-1">
                        {isStandard ? (
                          <EnvCellFormulaInput
                            value={row.formulas?.[opt.id] ?? '='}
                            onChange={(next) =>
                              patchEnvRow(row.id, {
                                formulas: { [opt.id]: next },
                                values: { [opt.id]: '' },
                              })
                            }
                            sourceFields={uniqueSameColumnFields}
                            envRows={envRows}
                            parameterColumnId={opt.id}
                            placeholder={`=AVERAGE([${uniqueSameColumnFields[0] ?? envDataFieldLabels[0] ?? 'Reading at 0'}])`}
                            ariaLabel={`${opt.header} formula for row ${index + 1}`}
                          />
                        ) : (
                          <Input
                            inputMode="decimal"
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
                    <td className="border border-slate-200 px-1 text-center">
                      {index === envRows.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
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
          layer="nested"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
            <DialogHeader className="text-left">
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sky-300/90">
                Environment Condition
              </p>
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Parameter Columns
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-5">
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-12 border border-slate-200 px-2 py-2 text-center">#</th>
                    <th className="border border-slate-200 px-2 py-2 text-left">Column header</th>
                    <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draftColumns.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="border border-slate-200 px-3 py-6 text-center text-muted-foreground"
                      >
                        No parameters yet. Click Add Parameter.
                      </td>
                    </tr>
                  ) : (
                    draftColumns.map((col, index) => (
                      <tr key={col.id}>
                        <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                          {index + 1}
                        </td>
                        <td className="border border-slate-200 px-2 py-2">
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
                        <td className="border border-slate-200 px-2 py-2 text-center">
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
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" onClick={() => setParamsOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-sky-700 text-white hover:bg-sky-600"
              onClick={saveParams}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function RawDataSheetTemplateEditor({
  value,
  onChange,
}: {
  value: RawDataSheetTemplate
  onChange: (next: RawDataSheetTemplate) => void
}) {
  const [calculationColumnKey, setCalculationColumnKey] = useState<string | null>(null)

  const envFormulaColumns = useMemo(
    () => envParameterFormulaColumns(value.environmentDefaults),
    [value.environmentDefaults],
  )

  const updateColumn = (key: string, patch: Partial<RawDataSheetColumn>) => {
    onChange({
      ...value,
      columns: value.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    })
  }

  const changeColumnType = (col: RawDataSheetColumn, type: RawDataSheetColumn['type']) => {
    if (type === 'formula') {
      updateColumn(col.key, {
        type,
        required: false,
        formula: col.formula ?? emptyColumnFormula(),
      })
      setCalculationColumnKey(col.key)
      return
    }
    onChange({
      ...value,
      columns: value.columns.map((c) => {
        if (c.key !== col.key) return c
        const next: RawDataSheetColumn = { ...c, type }
        delete next.formula
        return next
      }),
    })
    if (calculationColumnKey === col.key) setCalculationColumnKey(null)
  }

  const updateFormula = (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => {
    updateColumn(col.key, {
      formula: { ...(col.formula ?? emptyColumnFormula()), ...patch },
    })
  }

  const addColumn = () => {
    onChange({
      ...value,
      columns: [...value.columns, emptyRawDataSheetColumn()],
    })
  }

  const removeColumn = (key: string) => {
    if (calculationColumnKey === key) setCalculationColumnKey(null)
    if (value.columns.length <= 1) {
      onChange({ ...value, columns: [emptyRawDataSheetColumn()] })
      return
    }
    onChange({
      ...value,
      columns: value.columns.filter((c) => c.key !== key),
    })
  }

  const moveColumn = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= value.columns.length) return
    const cols = [...value.columns]
    ;[cols[index], cols[next]] = [cols[next]!, cols[index]!]
    onChange({ ...value, columns: cols })
  }

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
    value.columns.find((c) => c.key === calculationColumnKey && c.type === 'formula') ?? null

  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Verification checklist
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 border border-slate-200 px-2 py-2 text-center">#</th>
                <th className="border border-slate-200 px-2 py-2 text-left">Check item</th>
                <th className="w-24 border border-slate-200 px-2 py-2 text-center">Required</th>
                <th className="w-16 border border-slate-200 px-2 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {value.verification.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-slate-200 px-3 py-6 text-center text-muted-foreground">
                    No verification items yet.
                  </td>
                </tr>
              ) : (
                value.verification.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">
                      {index + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2">
                      <Input
                        value={item.label}
                        onChange={(e) => updateItem(item.id, { label: e.target.value })}
                        placeholder="e.g. Visual inspection OK"
                        className="h-9"
                        aria-label={`Verification item ${index + 1}`}
                      />
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="mx-auto block h-4 w-4 accent-teal-600"
                        checked={item.required}
                        onChange={(e) => updateItem(item.id, { required: e.target.checked })}
                        aria-label={`Required verification ${index + 1}`}
                      />
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      {index === value.verification.items.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mx-auto h-8 w-8 px-0 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
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

      <EnvironmentConditionEditor value={value} onChange={onChange} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Raw data columns
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-16 border border-slate-200 px-2 py-2 text-center">Order</th>
                <th className="border border-slate-200 px-2 py-2 text-left">Column label</th>
                <th className="w-28 border border-slate-200 px-2 py-2 text-center">Type</th>
                <th className="w-24 border border-slate-200 px-2 py-2 text-center">Required</th>
                <th className="w-40 border border-slate-200 px-2 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {value.columns.map((col, index) => {
                const isFormula = col.type === 'formula'
                return (
                  <Fragment key={col.key}>
                    <tr>
                      <td className="border border-slate-200 px-1 py-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <GripVertical size={14} className="text-slate-400" aria-hidden />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-xs"
                            disabled={index === 0}
                            onClick={() => moveColumn(index, -1)}
                            aria-label={`Move column ${index + 1} up`}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-xs"
                            disabled={index === value.columns.length - 1}
                            onClick={() => moveColumn(index, 1)}
                            aria-label={`Move column ${index + 1} down`}
                          >
                            ↓
                          </Button>
                        </div>
                      </td>
                      <td className="border border-slate-200 px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={col.label}
                            onChange={(e) => updateColumn(col.key, { label: e.target.value })}
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
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <Select
                          value={col.type}
                          onValueChange={(v) =>
                            changeColumnType(
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
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        {isFormula ? (
                          <span className="text-[11px] text-muted-foreground">Auto</span>
                        ) : (
                          <input
                            type="checkbox"
                            className="mx-auto block h-4 w-4 accent-teal-600"
                            checked={col.required}
                            onChange={(e) =>
                              updateColumn(col.key, {
                                required: e.target.checked,
                              })
                            }
                            aria-label={`Required column ${index + 1}`}
                          />
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {index === value.columns.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 px-0 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                              onClick={addColumn}
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
                              onClick={() => removeColumn(col.key)}
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

      <ColumnCalculationDialog
        open={calculationColumn != null}
        onOpenChange={(open) => {
          if (!open) setCalculationColumnKey(null)
        }}
        column={calculationColumn}
        columns={value.columns}
        envColumns={envFormulaColumns}
        onUpdateFormula={updateFormula}
      />
    </div>
  )
}
