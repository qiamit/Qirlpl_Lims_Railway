import { useEffect, useRef, useState } from 'react'
import { Calculator, BookmarkPlus, ChevronDown, CircleHelp, Trash2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  POINT_FORMULA_HELP_ROWS,
  SCIENTIFIC_PAD_KEYS,
  applyFormulaPadInsert,
  clampPointFormulaDecimals,
  validatePointFormula,
  type FormulaPadKey,
} from './pointFormula'
import {
  deleteSavedPointFormula,
  loadSavedPointFormulas,
  savePointFormula,
  type SavedPointFormula,
} from './savedPointFormulas'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

function padKeyClass(variant: FormulaPadKey['variant']): string {
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

export function ScientificFormulaPad({
  id,
  value,
  onChange,
  hint,
  decimals,
  onDecimalsChange,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  hint?: string
  decimals?: number
  onDecimalsChange?: (next: number) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formulaName, setFormulaName] = useState('')
  const [savedFormulas, setSavedFormulas] = useState<SavedPointFormula[]>([])
  const [libraryHint, setLibraryHint] = useState<string | null>(null)

  useEffect(() => {
    setSavedFormulas(loadSavedPointFormulas())
  }, [])

  const syncFormulaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, 40), 192)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 192 ? 'auto' : 'hidden'
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const { start, end } = caretRef.current
    if (document.activeElement === el) {
      el.setSelectionRange(start, end)
    }
    syncFormulaHeight()
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
    <div className="space-y-2">
      <div className="overflow-hidden rounded-none border-2 border-stone-400 bg-white shadow-sm">
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
            requestAnimationFrame(syncFormulaHeight)
          }}
          onSelect={rememberCaret}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          placeholder="e.g. 2.3018*10^-9*x^3 - 2.4060*10^-6*x^2 + 101.0953*x - 7.0843"
          rows={1}
          className="min-h-10 resize-none overflow-hidden rounded-none border-0 bg-stone-50 px-3 py-2 font-mono text-sm leading-6 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />

        {validationError || libraryHint ? (
          <div className="border-t border-stone-300 bg-stone-50 px-3 py-2">
            {validationError ? (
              <p className="text-[11px] text-red-700">{validationError}</p>
            ) : null}
            {libraryHint ? (
              <p className="text-[11px] text-amber-800">{libraryHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {onDecimalsChange ? (
          <>
            <Label htmlFor={`${id}-decimals`} className="text-[11px] text-stone-700">
              Decimal Points
            </Label>
            <Input
              id={`${id}-decimals`}
              type="number"
              min={0}
              max={6}
              className="h-7 w-14 bg-white px-1.5 text-center"
              value={decimals ?? 2}
              onChange={(e) => {
                const t = e.target.value.trim()
                const n = Number(t)
                onDecimalsChange(clampPointFormulaDecimals(t === '' ? 2 : n, 2))
              }}
              aria-label="Decimal points"
            />
          </>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-7 gap-1 px-2 text-[11px]', limsOutlineBtnClass)}
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
            saveOpen ? limsPrimaryBtnClass : limsOutlineBtnClass,
          )}
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
          className={cn('h-7 px-2 text-[11px]', limsOutlineBtnClass)}
          onClick={() => setHelpOpen(true)}
          aria-label="Formula help — list and usage"
        >
          <CircleHelp size={13} className="mr-1" aria-hidden />
          Formula
        </Button>

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
          onClick={() => setKeypadOpen((open) => !open)}
        >
          <Calculator size={13} />
          {keypadOpen ? 'Hide Calculator' : 'Calculator'}
        </Button>
      </div>

      {saveOpen ? (
        <div
          id={`${id}-save-panel`}
          className="space-y-2 rounded-none border-2 border-stone-400 bg-stone-50 px-3 py-3"
        >
          <Label htmlFor={`${id}-save-name`} className="text-stone-600">
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
              className="h-9 min-w-[12rem] flex-1"
            />
            <Button
              type="button"
              size="sm"
              className={cn('h-9', limsPrimaryBtnClass)}
              onClick={handleSaveFormula}
              disabled={!canSave || !formulaName.trim()}
            >
              Save Formula
            </Button>
          </div>
          <p className="text-[11px] text-stone-500">
            Same name updates the existing formula. You can save many formulas and load them later.
          </p>
        </div>
      ) : null}

      {keypadOpen ? (
        <div
          id={`${id}-keypad`}
          className="rounded-none border-2 border-stone-400 bg-stone-50 p-2"
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
                    className={`h-9 border font-mono text-[12px] font-medium transition-colors ${padKeyClass(key.variant)}`}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="top"
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
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
                  {POINT_FORMULA_HELP_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td className="border border-stone-300 px-2 py-2 font-medium text-stone-900">
                        {row.name}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-[12px] text-stone-700">
                        {row.syntax}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 font-mono text-[12px] text-stone-700">
                        {row.example}
                      </td>
                      <td className="border border-stone-300 px-2 py-2 text-stone-700">
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
              className={limsPrimaryBtnClass}
              onClick={() => setHelpOpen(false)}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
