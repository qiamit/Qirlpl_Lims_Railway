import { useEffect, useRef, useState } from 'react'
import { Calculator, BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SCIENTIFIC_PAD_KEYS,
  applyFormulaPadInsert,
  validatePointFormula,
  type FormulaPadKey,
} from './pointFormula'
import {
  deleteSavedPointFormula,
  loadSavedPointFormulas,
  savePointFormula,
  type SavedPointFormula,
} from './savedPointFormulas'

function padKeyClass(variant: FormulaPadKey['variant']): string {
  switch (variant) {
    case 'accent':
      return 'border-teal-700/40 bg-teal-800/80 text-teal-50 hover:bg-teal-700'
    case 'fn':
      return 'border-slate-600/60 bg-slate-800 text-cyan-200 hover:bg-slate-700'
    case 'muted':
      return 'border-slate-600/50 bg-slate-800/70 text-slate-200 hover:bg-slate-700'
    case 'danger':
      return 'border-rose-700/40 bg-rose-950/80 text-rose-100 hover:bg-rose-900'
    default:
      return 'border-slate-600/40 bg-slate-900 text-slate-50 hover:bg-slate-800'
  }
}

export function ScientificFormulaPad({
  id,
  label = 'Formula',
  value,
  onChange,
  hint,
}: {
  id: string
  label?: string
  value: string
  onChange: (next: string) => void
  hint?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [formulaName, setFormulaName] = useState('')
  const [savedFormulas, setSavedFormulas] = useState<SavedPointFormula[]>([])
  const [libraryHint, setLibraryHint] = useState<string | null>(null)

  useEffect(() => {
    setSavedFormulas(loadSavedPointFormulas())
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const { start, end } = caretRef.current
    if (document.activeElement === el) {
      el.setSelectionRange(start, end)
    }
  }, [value])

  const rememberCaret = () => {
    const el = textareaRef.current
    if (!el) return
    caretRef.current = {
      start: el.selectionStart ?? value.length,
      end: el.selectionEnd ?? value.length,
    }
  }

  const applyInsert = (key: FormulaPadKey) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? caretRef.current.start
    const end = el?.selectionEnd ?? caretRef.current.end
    const next = applyFormulaPadInsert(value, start, end, key.insert)
    caretRef.current = { start: next.caret, end: next.caret }
    onChange(next.value)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const validationError = value.trim() ? validatePointFormula(value) : null
  const canSave = value.trim().length > 0 && validationError == null

  const handleSaveFormula = () => {
    if (!canSave) {
      setLibraryHint(validationError ?? 'Enter a valid formula before saving.')
      return
    }
    const name = formulaName.trim()
    if (!name) {
      setLibraryHint('Enter a name for this formula.')
      return
    }
    const next = savePointFormula(name, value)
    setSavedFormulas(next)
    setLibraryHint(`Saved “${name}”. You can load it anytime from Saved Formulas.`)
    setSaveOpen(false)
    setFormulaName('')
  }

  const handleLoadFormula = (item: SavedPointFormula) => {
    onChange(item.expression)
    setLibraryHint(`Loaded “${item.name}”.`)
    setSaveOpen(false)
  }

  const handleDeleteFormula = (item: SavedPointFormula) => {
    const next = deleteSavedPointFormula(item.id)
    setSavedFormulas(next)
    setLibraryHint(`Deleted “${item.name}”.`)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal-300/80">
              Scientific Formula
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-200 hover:bg-slate-800 hover:text-white"
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
                      <div
                        key={item.id}
                        className="flex items-start gap-1 px-1 py-0.5"
                      >
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
                className={`h-7 gap-1.5 border-slate-600 px-2 text-[11px] ${
                  saveOpen
                    ? 'bg-teal-800/80 text-teal-50 hover:bg-teal-700'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
                disabled={!canSave && !saveOpen}
                onClick={() => {
                  setLibraryHint(null)
                  setSaveOpen((open) => !open)
                }}
                aria-expanded={saveOpen}
                aria-controls={`${id}-save-panel`}
              >
                <BookmarkPlus size={13} />
                Save
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 gap-1.5 border-slate-600 px-2 text-[11px] ${
                  keypadOpen
                    ? 'bg-teal-800/80 text-teal-50 hover:bg-teal-700'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
                aria-expanded={keypadOpen}
                aria-controls={`${id}-keypad`}
                onClick={() => setKeypadOpen((open) => !open)}
              >
                <Calculator size={13} />
                {keypadOpen ? 'Hide Keypad' : 'Keypad'}
              </Button>
            </div>
          </div>

          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(e) => {
              rememberCaret()
              caretRef.current = {
                start: e.target.selectionStart,
                end: e.target.selectionEnd,
              }
              onChange(e.target.value)
              setLibraryHint(null)
            }}
            onSelect={rememberCaret}
            onKeyUp={rememberCaret}
            onClick={rememberCaret}
            placeholder="e.g. 2.3018*10^-9*x^3 - 2.4060*10^-6*x^2 + 101.0953*x - 7.0843"
            rows={3}
            className="min-h-[4.5rem] !h-auto resize-y rounded-none border-0 bg-transparent px-3 py-2 font-mono text-sm text-teal-50 shadow-none placeholder:text-slate-600 focus-visible:ring-0"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />

          {saveOpen ? (
            <div
              id={`${id}-save-panel`}
              className="space-y-2 border-t border-slate-800 bg-slate-900/90 px-3 py-3"
            >
              <Label htmlFor={`${id}-save-name`} className="text-slate-300">
                Formula name
              </Label>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  id={`${id}-save-name`}
                  value={formulaName}
                  onChange={(e) => setFormulaName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveFormula()
                    }
                  }}
                  placeholder="e.g. Load Cell Polynomial"
                  className="h-9 min-w-[12rem] flex-1 border-slate-600 bg-slate-950 text-slate-100"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 bg-teal-600 text-white hover:bg-teal-500"
                  onClick={handleSaveFormula}
                  disabled={!canSave || !formulaName.trim()}
                >
                  Save Formula
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Same name updates the existing formula. You can save many formulas and load them
                later.
              </p>
            </div>
          ) : null}

          {validationError || libraryHint ? (
            <div className="border-t border-slate-800 bg-slate-900/80 px-3 py-2">
              {validationError ? (
                <p className="text-[11px] text-rose-300">{validationError}</p>
              ) : null}
              {libraryHint ? (
                <p className="text-[11px] text-teal-300">{libraryHint}</p>
              ) : null}
            </div>
          ) : null}

          {keypadOpen ? (
            <div
              id={`${id}-keypad`}
              className="border-t border-slate-800 bg-slate-950 p-2"
              role="group"
              aria-label="Scientific calculator keypad"
            >
              <div className="space-y-1.5">
                {SCIENTIFIC_PAD_KEYS.map((row, rowIndex) => (
                  <div
                    key={`pad-row-${rowIndex}`}
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                  >
                    {row.map((key) => (
                      <button
                        key={`${rowIndex}-${key.label}-${key.ariaLabel}`}
                        type="button"
                        aria-label={key.ariaLabel}
                        onClick={() => applyInsert(key)}
                        className={`h-9 rounded-md border font-mono text-[12px] font-medium transition-colors ${padKeyClass(key.variant)}`}
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
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  )
}
