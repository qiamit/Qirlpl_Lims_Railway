import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookmarkPlus,
  Calculator,
  ChevronDown,
  CircleHelp,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  COLUMN_FORMULA_HELP_ROWS,
  analyzeColumnFormulaExpression,
  emptyColumnFormula,
  extractExpressionSourceKeys,
  formulaOpMeta,
  type FormulaValidationIssue,
  type RawDataColumnFormula,
  type RawDataSheetColumn,
} from '@/features/calibration/rawDataSheetTypes'
import {
  deleteSavedColumnFormula,
  loadSavedColumnFormulas,
  saveColumnFormula,
  type SavedColumnFormula,
} from '@/features/calibration/equipments/savedColumnFormulas'
import {
  MU_CALIBRATION_POINT_COLUMN,
  MU_CALIBRATION_POINT_FIELD_KEY,
  emptyMuSheetColumn,
  emptyMuSheetTable,
  flattenMuSectionColumns,
  type MuCalculationTemplate,
  type MuSheetSection,
  type MuSheetTable,
} from './muCalculationTypes'

function bracketLabel(label: string): string {
  return `[${label.trim() || 'Untitled'}]`
}

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
    default:
      return `=${meta.value.toUpperCase()}(${picked.join(',')})`
  }
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

type FormulaRefKind = 'sheet' | 'rds' | 'point'

function MuColumnFormulaInput({
  id,
  value,
  onChange,
  sourceColumns,
  refKindOf,
  errorToken = null,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  sourceColumns: RawDataSheetColumn[]
  refKindOf: (key: string) => FormulaRefKind
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
  const canSave = value.trim().length > 0 && value.trim() !== '=' && !hasError

  const handleSaveFormula = () => {
    if (!canSave) {
      setLibraryHint(
        errorToken ? 'Fix formula errors before saving.' : 'Enter a formula before saving.',
      )
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
              placeholder="e.g. Type B ui from resolution"
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
          placeholder="=AVERAGE([Reading 1],[Reading 2]) or =[Calibration Point]/SQRT(3)"
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
            const kind = refKindOf(col.key)
            return (
              <li key={col.key}>
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
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertColumn(col)
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">
                      {col.label || 'Untitled column'}
                    </span>
                    {kind === 'rds' ? (
                      <span className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal-800">
                        RDS
                      </span>
                    ) : null}
                    {kind === 'point' ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-900">
                        Point
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

function MuColumnCalculationDialog({
  open,
  onOpenChange,
  column,
  sectionColumns,
  externalColumns,
  onUpdateFormula,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: RawDataSheetColumn | null
  sectionColumns: RawDataSheetColumn[]
  externalColumns: RawDataSheetColumn[]
  onUpdateFormula: (col: RawDataSheetColumn, patch: Partial<RawDataColumnFormula>) => void
}) {
  const formula = column?.formula ?? emptyColumnFormula()
  const columnIndex = column
    ? sectionColumns.findIndex((c) => c.key === column.key)
    : -1

  const externalKeySet = useMemo(
    () => new Set(externalColumns.map((c) => c.key)),
    [externalColumns],
  )

  const sourceOptions = useMemo(() => {
    if (!column || columnIndex < 0) return [...externalColumns]
    const dataCols = sectionColumns.filter(
      (c, i) => c.key !== column.key && (c.type !== 'formula' || i < columnIndex),
    )
    // Prefer section columns; then external (RDS + Calibration Point) not already keyed.
    const seen = new Set(dataCols.map((c) => c.key))
    const extras = externalColumns.filter((c) => !seen.has(c.key))
    return [...dataCols, ...extras]
  }, [column, columnIndex, sectionColumns, externalColumns])

  const labelOf = (key: string) => {
    const fromSection = sectionColumns.find((c) => c.key === key)
    if (fromSection) return (fromSection.label || key).trim()
    const fromExt = externalColumns.find((c) => c.key === key)
    return (fromExt?.label || key).trim()
  }

  const refKindOf = (key: string): FormulaRefKind => {
    if (key === MU_CALIBRATION_POINT_FIELD_KEY) return 'point'
    if (externalKeySet.has(key) && key !== MU_CALIBRATION_POINT_FIELD_KEY) return 'rds'
    return 'sheet'
  }

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
    else if (trimmed && trimmed !== '=') nextOp = 'sum'
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
          <MuColumnFormulaInput
            id={`mu-formula-${column.key}`}
            value={draftExpr}
            onChange={commitExpression}
            sourceColumns={sourceOptions}
            refKindOf={refKindOf}
            errorToken={validationIssue?.errorToken ?? null}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={`mu-dec-${column.key}`} className="text-[11px]">
                Decimals
              </Label>
              <Input
                id={`mu-dec-${column.key}`}
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

          <p className="text-xs text-slate-600">
            Autocomplete includes this Type&apos;s columns, equipment Raw Data Sheet columns (RDS),
            and Calibration Point.
          </p>

          {sourceOptions.length === 0 ? (
            <p className="text-xs text-amber-700">
              Add columns above this calculated column (or configure Raw Data Sheet Format) so they
              appear as formula suggestions.
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

function MuSheetTableEditor({
  table,
  tableIndex,
  canRemove,
  onChange,
  onRemove,
  formulaSourceColumns,
  externalColumns,
}: {
  table: MuSheetTable
  tableIndex: number
  canRemove: boolean
  onChange: (next: MuSheetTable) => void
  onRemove: () => void
  /** Other columns in this Type section (same + sibling tables) for formulas. */
  formulaSourceColumns: RawDataSheetColumn[]
  externalColumns: RawDataSheetColumn[]
}) {
  const [calculationColumnKey, setCalculationColumnKey] = useState<string | null>(null)

  const updateColumn = (key: string, patch: Partial<RawDataSheetColumn>) => {
    onChange({
      ...table,
      columns: table.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
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
      ...table,
      columns: table.columns.map((c) => {
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
      ...table,
      columns: [...table.columns, emptyMuSheetColumn()],
    })
  }

  const removeColumn = (key: string) => {
    if (calculationColumnKey === key) setCalculationColumnKey(null)
    onChange({
      ...table,
      columns: table.columns.filter((c) => c.key !== key),
    })
  }

  const moveColumn = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= table.columns.length) return
    const cols = [...table.columns]
    ;[cols[index], cols[next]] = [cols[next]!, cols[index]!]
    onChange({ ...table, columns: cols })
  }

  const calculationColumn =
    table.columns.find((c) => c.key === calculationColumnKey && c.type === 'formula') ?? null

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Component {tableIndex + 1}
          </p>
          <Input
            value={table.label}
            onChange={(e) => onChange({ ...table, label: e.target.value })}
            className="h-8 max-w-sm bg-white text-sm"
            placeholder="e.g. Resolution / Reference std"
            aria-label={`Component ${tableIndex + 1} name`}
          />
        </div>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            aria-label={`Remove component ${tableIndex + 1}`}
          >
            <Trash2 size={14} />
            Remove
          </Button>
        ) : null}
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
            {table.columns.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-slate-200 px-3 py-8 text-center text-muted-foreground"
                >
                  <p className="mb-3 text-sm">No columns yet — add fields like Raw Data Sheet Format.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-teal-600/40 text-teal-800 hover:bg-teal-50"
                    onClick={addColumn}
                    aria-label={`Add first column to component ${tableIndex + 1}`}
                  >
                    <Plus size={14} />
                    Add column
                  </Button>
                </td>
              </tr>
            ) : (
              table.columns.map((col, index) => {
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
                            disabled={index === table.columns.length - 1}
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
                            placeholder={
                              isFormula ? 'e.g. Combined u' : 'e.g. Resolution'
                            }
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
                              updateColumn(col.key, { required: e.target.checked })
                            }
                            aria-label={`Required column ${index + 1}`}
                          />
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {index === table.columns.length - 1 ? (
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
              })
            )}
          </tbody>
        </table>
      </div>

      <MuColumnCalculationDialog
        open={calculationColumn != null}
        onOpenChange={(open) => {
          if (!open) setCalculationColumnKey(null)
        }}
        column={calculationColumn}
        sectionColumns={formulaSourceColumns}
        externalColumns={externalColumns}
        onUpdateFormula={updateFormula}
      />
    </div>
  )
}

function MuSheetSectionEditor({
  title,
  section,
  onChange,
  externalColumns,
}: {
  title: string
  section: MuSheetSection
  onChange: (next: MuSheetSection) => void
  externalColumns: RawDataSheetColumn[]
}) {
  const tables =
    section.tables.length > 0 ? section.tables : [emptyMuSheetTable('Component 1')]

  const setTables = (nextTables: MuSheetTable[]) => {
    onChange({
      ...section,
      tables: nextTables.length > 0 ? nextTables : [emptyMuSheetTable('Component 1')],
    })
  }

  const updateTable = (id: string, next: MuSheetTable) => {
    setTables(tables.map((t) => (t.id === id ? next : t)))
  }

  const addTable = () => {
    setTables([
      ...tables,
      emptyMuSheetTable(`Component ${tables.length + 1}`),
    ])
  }

  const removeTable = (id: string) => {
    if (tables.length <= 1) return
    setTables(tables.filter((t) => t.id !== id))
  }

  const sectionColumns = flattenMuSectionColumns({ ...section, tables })

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</p>
          <Input
            value={section.label}
            onChange={(e) => onChange({ ...section, label: e.target.value })}
            className="h-8 max-w-md text-sm"
            aria-label={`${title} section label`}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={section.enabled}
            onChange={(e) => onChange({ ...section, enabled: e.target.checked })}
            aria-label={`Enable ${title}`}
          />
          Enabled
        </label>
      </div>

      <div className="space-y-3">
        {tables.map((table, index) => (
          <MuSheetTableEditor
            key={table.id}
            table={table}
            tableIndex={index}
            canRemove={tables.length > 1}
            onChange={(next) => updateTable(table.id, next)}
            onRemove={() => removeTable(table.id)}
            formulaSourceColumns={sectionColumns}
            externalColumns={externalColumns}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-teal-600/50 text-teal-800 hover:bg-teal-50"
        onClick={addTable}
        aria-label={`Add ${title} component table`}
      >
        <Plus size={14} />
        Add component
      </Button>
    </div>
  )
}

export function MuCalculationSheetEditor({
  value,
  onChange,
  rawDataSheetColumns = [],
}: {
  value: MuCalculationTemplate
  onChange: (next: MuCalculationTemplate) => void
  /** Columns from equipment Raw Data Sheet Format (formula refs). */
  rawDataSheetColumns?: Array<{ key: string; label: string; type?: string }>
}) {
  const externalColumns = useMemo((): RawDataSheetColumn[] => {
    const rds: RawDataSheetColumn[] = rawDataSheetColumns
      .filter((c) => c.key.trim())
      .map((c) => ({
        key: c.key,
        label: c.label.trim() || c.key,
        type:
          c.type === 'formula' ? 'formula' : c.type === 'text' ? 'text' : 'number',
        required: false,
      }))
    const withoutPoint = rds.filter((c) => c.key !== MU_CALIBRATION_POINT_FIELD_KEY)
    return [...withoutPoint, MU_CALIBRATION_POINT_COLUMN]
  }, [rawDataSheetColumns])

  const patch = (partial: Partial<MuCalculationTemplate>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Build Type A and Type B like Raw Data Sheet Format — add multiple components (tables),
        columns, types (text / number / calculated), and formulas. Formulas can reference
        columns in this Type, Raw Data Sheet columns, and Calibration Point.
      </p>

      <MuSheetSectionEditor
        title="Type A"
        section={value.typeA}
        onChange={(typeA) => patch({ typeA })}
        externalColumns={externalColumns}
      />

      <MuSheetSectionEditor
        title="Type B"
        section={value.typeB}
        onChange={(typeB) => patch({ typeB })}
        externalColumns={externalColumns}
      />
    </div>
  )
}
