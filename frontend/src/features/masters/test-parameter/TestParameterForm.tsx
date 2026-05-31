import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AccreditationBodyRow, TestParameterForm, UnitRow } from './types'

const SCIENTIFIC_SYMBOLS = [
  '±', 'µ', 'Ω', 'Δ', '∑', '√', '≤', '≥', '≈', '≠', '≡', '∝', '∫', '∂', '∇',
  'α', 'β', 'γ', 'δ', 'θ', 'λ', 'π', 'σ', 'ρ', 'τ', 'φ', 'ω', 'η', 'ν', 'ψ', 'ζ', 'ξ', 'κ', 'ι',
  'Σ', 'Π', 'Λ', 'Φ', 'Ψ', 'Γ', 'Θ', 'Δ',
  '²', '³', '⁺', '⁻', '⁰', '¹', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉',
]
const OTHER_SYMBOLS = [
  '°', '×', '÷', '∞', '‰', '℃', '℉', '§', '™', '®', '©', 'Ø', '⊕', '⊗',
  '•', '·', '…', '–', '—', '′', '″', '†', '‡', '№', '¶', '✓', '✗', '✔', '✘',
  '«', '»', '‹', '›', '‘', '’', '"', '"', '„', '‚',
  '₹', '$', '€', '£', '¥', '¢', '¤',
  '→', '←', '↑', '↓', '⇒', '⇔', '↔', '↦', '∈', '∉', '⊂', '⊃', '⊆', '⊇',
]

function formatPlusMinusPercent(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const numberPart = raw.replace(/[^0-9.]/g, '')
  if (!numberPart) return ''
  return `± ${numberPart} %`
}

function extractNumberPart(value: string) {
  return value.replace(/[^0-9.]/g, '')
}

export function TestParameterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
  isCodes = [],
  accreditationBodies = [],
  accreditationDialogOpen,
  setAccreditationDialogOpen,
  newAccreditationBody,
  setNewAccreditationBody,
  onAddAccreditationBody,
  onDeleteAccreditationBody,
  units = [],
  unitDialogOpen,
  setUnitDialogOpen,
  newUnitName,
  setNewUnitName,
  onAddUnit,
  onDeleteUnit,
  onOpenAddIsCodeForm,
  departments = [],
  designations = [],
  designationsByDepartment = {},
}: {
  form: TestParameterForm
  onChange: (next: TestParameterForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
  isCodes?: Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>
  accreditationBodies?: AccreditationBodyRow[]
  accreditationDialogOpen: boolean
  setAccreditationDialogOpen: (open: boolean) => void
  newAccreditationBody: string
  setNewAccreditationBody: (value: string) => void
  onAddAccreditationBody: () => void
  onDeleteAccreditationBody: (id: string) => void
  units?: UnitRow[]
  unitDialogOpen: boolean
  setUnitDialogOpen: (open: boolean) => void
  newUnitName: string
  setNewUnitName: (value: string) => void
  onAddUnit: () => void
  onDeleteUnit: (id: string) => void
  onOpenAddIsCodeForm: (typedCode: string) => void
  departments?: string[]
  designations?: string[]
  designationsByDepartment?: Record<string, string[]>
}) {
  const isCodeOptions = isCodes ?? []
  const accreditationBodyOptions = accreditationBodies ?? []
  const unitOptions = units ?? []
  const departmentOptions = departments ?? []
  const allDesignations = designations ?? []
  const deptDesignationMap = designationsByDepartment ?? {}
  const underAccreditationIds = form.underAccreditationIds ?? []

  const normLabel = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

  const getDesignationOptionsForDepartment = (department: string) => {
    const dept = department.trim()
    if (!dept) return allDesignations
    const deptNorm = normLabel(dept)
    const fromMap = Object.entries(deptDesignationMap).find(([k]) => normLabel(k) === deptNorm)?.[1]
    if (fromMap?.length) return fromMap
    return allDesignations
  }

  const designationOptions = useMemo(
    () => getDesignationOptionsForDepartment(form.department),
    [form.department, allDesignations, deptDesignationMap],
  )

  const pickerId = useId()
  const [isCodeOpen, setIsCodeOpen] = useState(false)
  const [testMethodOpen, setTestMethodOpen] = useState(false)
  const [isCodeHighlight, setIsCodeHighlight] = useState(0)
  const [testMethodHighlight, setTestMethodHighlight] = useState(0)
  const [unitOpen, setUnitOpen] = useState(false)
  const [unitHighlight, setUnitHighlight] = useState(0)
  const unitInputRef = useRef<HTMLInputElement | null>(null)
  const specificRequirementRef = useRef<HTMLTextAreaElement | null>(null)
  const selectedIs = isCodeOptions.find((x) => x.id === form.isCodeId)
  const [symbolDialogOpen, setSymbolDialogOpen] = useState(false)
  const [symbolSearch, setSymbolSearch] = useState('')
  const [symbolRecents, setSymbolRecents] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem('testParameter.symbolRecents')
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  const uncertaintyNumber = extractNumberPart(form.uncertaintyMu)

  const filteredIsCodesByCode = useMemo(() => {
    const query = form.isCodeLabel.trim().toLowerCase()
    if (!query) return isCodeOptions.slice(0, 10)
    return isCodeOptions.filter((code) => code.searchLabel.toLowerCase().includes(query)).slice(0, 10)
  }, [isCodeOptions, form.isCodeLabel])

  const filteredIsCodesByMethod = useMemo(() => {
    const query = form.testMethod.trim().toLowerCase()
    if (!query) return isCodeOptions.slice(0, 10)
    return isCodeOptions.filter((code) => code.defaultTestMethod.toLowerCase().includes(query) || code.searchLabel.toLowerCase().includes(query)).slice(0, 10)
  }, [isCodeOptions, form.testMethod])

  const showAddIsCodeAction = useMemo(() => {
    const typed = form.isCodeLabel.trim()
    if (!typed) return false
    return !isCodeOptions.some((code) => code.displayCode.toLowerCase() === typed.toLowerCase())
  }, [form.isCodeLabel, isCodeOptions])

  const filteredUnits = useMemo(() => {
    const q = form.unitValue.trim().toLowerCase()
    if (!q) return unitOptions
    return unitOptions.filter((u) => u.name.toLowerCase().includes(q))
  }, [unitOptions, form.unitValue])

  const showAddUnitAction = useMemo(() => {
    const typed = form.unitValue.trim()
    if (!typed) return false
    return !unitOptions.some((u) => u.name.toLowerCase() === typed.toLowerCase())
  }, [form.unitValue, unitOptions])

  const totalIsCodeOptions = filteredIsCodesByCode.length + (showAddIsCodeAction ? 1 : 0)
  const showAddTestMethodAction = useMemo(() => {
    const typed = form.testMethod.trim()
    if (!typed) return false
    return !isCodeOptions.some((c) => c.defaultTestMethod.toLowerCase() === typed.toLowerCase())
  }, [form.testMethod, isCodeOptions])
  const totalTestMethodOptions = filteredIsCodesByMethod.length + (showAddTestMethodAction ? 1 : 0)
  const totalUnitOptions = filteredUnits.length + (showAddUnitAction ? 1 : 0)

  useEffect(() => {
    setIsCodeHighlight((prev) => (totalIsCodeOptions === 0 ? 0 : Math.min(prev, totalIsCodeOptions - 1)))
  }, [totalIsCodeOptions])

  useEffect(() => {
    setTestMethodHighlight((prev) => (totalTestMethodOptions === 0 ? 0 : Math.min(prev, totalTestMethodOptions - 1)))
  }, [totalTestMethodOptions])

  useEffect(() => {
    setUnitHighlight((prev) => (totalUnitOptions === 0 ? 0 : Math.min(prev, totalUnitOptions - 1)))
  }, [totalUnitOptions])

  const handleIsCodeTyping = (value: string) => {
    setIsCodeOpen(true)
    const typed = value
    onChange({
      ...form,
      isCodeId: '',
      isCodeLabel: typed,
    })
    setIsCodeHighlight(0)
  }

  const syncSelectionFromIsCode = (match: { id: string; displayCode: string; defaultTestMethod: string }) => {
    const shouldSyncTestMethod =
      !form.testMethod.trim().length ||
      form.testMethod === form.isCodeLabel ||
      (selectedIs && form.testMethod === selectedIs.defaultTestMethod)

    onChange({
      ...form,
      isCodeId: match.id,
      isCodeLabel: match.displayCode,
      testMethod: shouldSyncTestMethod ? match.defaultTestMethod : form.testMethod,
    })
    setIsCodeOpen(false)
  }

  const handleTestMethodTyping = (value: string) => {
    setTestMethodOpen(true)
    onChange({ ...form, testMethod: value })
    setTestMethodHighlight(0)
  }

  const handleTestMethodPick = (match: { defaultTestMethod: string }) => {
    onChange({ ...form, testMethod: match.defaultTestMethod })
    setTestMethodOpen(false)
  }

  const handleUnitTyping = (value: string) => {
    setUnitOpen(true)
    onChange({ ...form, unitValue: value })
    setUnitHighlight(0)
  }

  const handleUnitPick = (name: string) => {
    onChange({ ...form, unitValue: name })
    setUnitOpen(false)
  }

  const handleUnitKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setUnitOpen(false)
      return
    }
    if (!unitOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setUnitOpen(true)
    }
    if (event.key === 'ArrowDown' && totalUnitOptions > 0) {
      event.preventDefault()
      setUnitHighlight((prev) => (prev + 1) % totalUnitOptions)
    }
    if (event.key === 'ArrowUp' && totalUnitOptions > 0) {
      event.preventDefault()
      setUnitHighlight((prev) => (prev - 1 + totalUnitOptions) % totalUnitOptions)
    }
    if (event.key === 'Enter' && totalUnitOptions > 0) {
      event.preventDefault()
      if (unitHighlight < filteredUnits.length) {
        handleUnitPick(filteredUnits[unitHighlight].name)
      } else if (showAddUnitAction) {
        setNewUnitName(form.unitValue.trim())
        setUnitDialogOpen(true)
        setUnitOpen(false)
      }
    }
  }

  const filteredScientificSymbols = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase()
    if (!q) return SCIENTIFIC_SYMBOLS
    return SCIENTIFIC_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [symbolSearch])

  const filteredOtherSymbols = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase()
    if (!q) return OTHER_SYMBOLS
    return OTHER_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [symbolSearch])

  const handleInsertSymbol = (symbol: string) => {
    const target = specificRequirementRef.current
    if (!target) return
    const { selectionStart = target.value.length, selectionEnd = target.value.length } = target
    const nextValue =
      target.value.slice(0, selectionStart) +
      symbol +
      target.value.slice(selectionEnd)

    onChange({ ...form, specificRequirement: nextValue })

    requestAnimationFrame(() => {
      target.focus()
      const caret = selectionStart + symbol.length
      target.setSelectionRange(caret, caret)
    })

    setSymbolDialogOpen(false)
    setSymbolSearch('')
    setSymbolRecents((prev) => {
      const updated = [symbol, ...prev.filter((s) => s !== symbol)].slice(0, 10)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('testParameter.symbolRecents', JSON.stringify(updated))
        } catch {
          // ignore
        }
      }
      return updated
    })
  }

  const handleIsCodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setIsCodeOpen(false)
      return
    }
    if (!isCodeOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setIsCodeOpen(true)
    }

    if (event.key === 'ArrowDown' && totalIsCodeOptions > 0) {
      event.preventDefault()
      setIsCodeHighlight((prev) => (prev + 1) % totalIsCodeOptions)
    }

    if (event.key === 'ArrowUp' && totalIsCodeOptions > 0) {
      event.preventDefault()
      setIsCodeHighlight((prev) => (prev - 1 + totalIsCodeOptions) % totalIsCodeOptions)
    }

    if (event.key === 'Enter' && totalIsCodeOptions > 0) {
      event.preventDefault()
      if (isCodeHighlight < filteredIsCodesByCode.length) {
        syncSelectionFromIsCode(filteredIsCodesByCode[isCodeHighlight])
      } else if (showAddIsCodeAction) {
        setIsCodeOpen(false)
        openCreateIsDialog()
      }
    }
  }

  const handleTestMethodKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setTestMethodOpen(false)
      return
    }
    if (!testMethodOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setTestMethodOpen(true)
    }

    if (event.key === 'ArrowDown' && totalTestMethodOptions > 0) {
      event.preventDefault()
      setTestMethodHighlight((prev) => (prev + 1) % totalTestMethodOptions)
    }

    if (event.key === 'ArrowUp' && totalTestMethodOptions > 0) {
      event.preventDefault()
      setTestMethodHighlight((prev) => (prev - 1 + totalTestMethodOptions) % totalTestMethodOptions)
    }

    if (event.key === 'Enter' && totalTestMethodOptions > 0) {
      event.preventDefault()
      if (testMethodHighlight < filteredIsCodesByMethod.length) {
        handleTestMethodPick(filteredIsCodesByMethod[testMethodHighlight])
      } else if (showAddTestMethodAction) {
        onOpenAddIsCodeForm(form.testMethod.trim())
        setTestMethodOpen(false)
      }
    }
  }

  const openCreateIsDialog = () => {
    onOpenAddIsCodeForm(form.isCodeLabel.trim())
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-6 pt-5">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor={`is-code-${pickerId}`}>IS Code</Label>
            <div className="relative">
              <Input
                id={`is-code-${pickerId}`}
                value={form.isCodeLabel}
                onChange={(e) => handleIsCodeTyping(e.target.value)}
                onFocus={() => setIsCodeOpen(true)}
                onBlur={() => setTimeout(() => setIsCodeOpen(false), 150)}
                onKeyDown={handleIsCodeKeyDown}
                placeholder="IS 1786: 2008"
                autoComplete="off"
              />
              {isCodeOpen && (filteredIsCodesByCode.length > 0 || showAddIsCodeAction) && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg" tabIndex={-1}>
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredIsCodesByCode.map((code, index) => (
                      <li key={code.id}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left ${index === isCodeHighlight ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setIsCodeHighlight(index)}
                          onClick={() => syncSelectionFromIsCode(code)}
                        >
                          <span className="font-medium">{code.displayCode}</span>
                        </button>
                      </li>
                    ))}
                    {showAddIsCodeAction && (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left text-primary ${
                            isCodeHighlight === filteredIsCodesByCode.length ? 'bg-muted font-semibold' : 'hover:bg-muted'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setIsCodeHighlight(filteredIsCodesByCode.length)}
                          onClick={() => {
                            openCreateIsDialog()
                            setIsCodeOpen(false)
                          }}
                        >
                          Add "{form.isCodeLabel.trim()}" to IS Code master
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor="clause-no">Clause No</Label>
            <Input
              id="clause-no"
              value={form.clauseNo}
              onChange={(e) => onChange({ ...form, clauseNo: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center justify-between">
              <Label htmlFor="unit-value">Unit of Measurement</Label>
              <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add New
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add Measurement Unit</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-unit">Unit Name</Label>
                      <Input
                        id="new-unit"
                        placeholder="e.g., kN"
                        value={newUnitName}
                        onChange={(e) => setNewUnitName(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing Units</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {unitOptions.length > 0 ? (
                          unitOptions.map((unit) => (
                            <div key={unit.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                              <span>{unit.name}</span>
                              <button
                                type="button"
                                onClick={() => onDeleteUnit(unit.id)}
                                className="text-destructive hover:text-destructive/80"
                                aria-label={`Delete ${unit.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No units added yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <UiDialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setUnitDialogOpen(false)
                        setNewUnitName('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={onAddUnit} disabled={!newUnitName.trim()}>
                      Save Unit
                    </Button>
                  </UiDialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="relative">
              <Input
                ref={unitInputRef}
                id="unit-value"
                value={form.unitValue}
                onChange={(e) => handleUnitTyping(e.target.value)}
                onFocus={() => setUnitOpen(true)}
                onBlur={() => setTimeout(() => setUnitOpen(false), 150)}
                onKeyDown={handleUnitKeyDown}
                placeholder={unitOptions.length > 0 ? 'Select unit' : 'Add units to use them here'}
                autoComplete="off"
              />
              {(filteredUnits.length > 0 || showAddUnitAction) && unitOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg" tabIndex={-1}>
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredUnits.map((unit, index) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left ${index === unitHighlight ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setUnitHighlight(index)}
                          onClick={() => handleUnitPick(unit.name)}
                        >
                          {unit.name}
                        </button>
                      </li>
                    ))}
                    {showAddUnitAction && (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left text-primary ${
                            unitHighlight === filteredUnits.length ? 'bg-muted font-semibold' : 'hover:bg-muted'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setUnitHighlight(filteredUnits.length)}
                          onClick={() => {
                            setNewUnitName(form.unitValue.trim())
                            setUnitDialogOpen(true)
                            setUnitOpen(false)
                          }}
                        >
                          Add &quot;{form.unitValue.trim()}&quot; as new unit
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor={`test-method-${pickerId}`}>Test Method</Label>
            </div>
            <div className="relative">
              <Input
                id={`test-method-${pickerId}`}
                value={form.testMethod}
                onChange={(e) => handleTestMethodTyping(e.target.value)}
                onFocus={() => setTestMethodOpen(true)}
                onBlur={() => setTimeout(() => setTestMethodOpen(false), 150)}
                onKeyDown={handleTestMethodKeyDown}
                placeholder="IS 1786: 2008"
                autoComplete="off"
              />
              {testMethodOpen && (filteredIsCodesByMethod.length > 0 || showAddTestMethodAction) && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg" tabIndex={-1}>
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredIsCodesByMethod.map((code, index) => (
                      <li key={`${code.id}-method`}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left ${index === testMethodHighlight ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setTestMethodHighlight(index)}
                          onClick={() => handleTestMethodPick(code)}
                        >
                          <span className="font-medium">{code.defaultTestMethod}</span>
                        </button>
                      </li>
                    ))}
                    {showAddTestMethodAction && (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left text-primary ${
                            testMethodHighlight === filteredIsCodesByMethod.length ? 'bg-muted font-semibold' : 'hover:bg-muted'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setTestMethodHighlight(filteredIsCodesByMethod.length)}
                          onClick={() => {
                            onOpenAddIsCodeForm(form.testMethod.trim())
                            setTestMethodOpen(false)
                          }}
                        >
                          Add &quot;{form.testMethod.trim()}&quot; to IS Code master
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor="item-name">Name of Test Parameter</Label>
            </div>
            <Input
              id="item-name"
              value={form.itemName}
              onChange={(e) => onChange({ ...form, itemName: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-6 space-y-2">
            <div className="flex min-h-6 items-center justify-between">
              <Label htmlFor="specific-requirement">Specific Requirement</Label>
              <Dialog open={symbolDialogOpen} onOpenChange={setSymbolDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
                  >
                    <Sparkles size={12} />
                    Insert Symbol
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined} className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Insert Symbol</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="symbol-search">Search</Label>
                      <Input
                        id="symbol-search"
                        placeholder="Search symbols..."
                        value={symbolSearch}
                        onChange={(e) => setSymbolSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {symbolRecents.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Recent</p>
                        <div className="flex flex-wrap gap-2">
                          {symbolRecents.map((sym, index) => (
                            <button
                              key={`recent-${index}`}
                              type="button"
                              className="rounded border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                              onClick={() => handleInsertSymbol(sym)}
                            >
                              {sym}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Scientific</p>
                      <div className="flex flex-wrap gap-2">
                        {filteredScientificSymbols.map((sym, index) => (
                          <button
                            key={`scientific-${index}`}
                            type="button"
                            className="rounded border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => handleInsertSymbol(sym)}
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Other</p>
                      <div className="flex flex-wrap gap-2">
                        {filteredOtherSymbols.map((sym, index) => (
                          <button
                            key={`other-${index}`}
                            type="button"
                            className="rounded border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => handleInsertSymbol(sym)}
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Textarea
              id="specific-requirement"
              ref={specificRequirementRef}
              rows={1}
              value={form.specificRequirement}
              onChange={(e) => onChange({ ...form, specificRequirement: e.target.value })}
              className="min-h-10 h-10 resize-none"
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center justify-between">
              <Label htmlFor="under-accreditation">Under Accreditation</Label>
              <Dialog open={accreditationDialogOpen} onOpenChange={setAccreditationDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add New
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add Accreditation Body</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-accreditation">Body Name</Label>
                      <Input
                        id="new-accreditation"
                        placeholder="e.g., NABL"
                        value={newAccreditationBody}
                        onChange={(e) => setNewAccreditationBody(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing Bodies</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {accreditationBodyOptions.length > 0 ? (
                          accreditationBodyOptions.map((b) => (
                            <div key={b.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                              <span>{b.name}</span>
                              <button
                                type="button"
                                onClick={() => onDeleteAccreditationBody(b.id)}
                                className="text-destructive hover:text-destructive/80"
                                aria-label={`Delete ${b.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No bodies added yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <UiDialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setAccreditationDialogOpen(false)
                        setNewAccreditationBody('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={onAddAccreditationBody} disabled={!newAccreditationBody.trim()}>
                      Save Body
                    </Button>
                  </UiDialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {accreditationBodyOptions.length > 0 ? (
              <Select
                value={underAccreditationIds[0] ?? ''}
                onValueChange={(v) =>
                  onChange({
                    ...form,
                    underAccreditationIds: v ? [v] : [],
                  })
                }
              >
                <SelectTrigger id="under-accreditation">
                  <SelectValue placeholder="Select accreditation" />
                </SelectTrigger>
                <SelectContent>
                  {accreditationBodyOptions.map((body) => (
                    <SelectItem key={body.id} value={body.id}>
                      {body.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="under-accreditation" value="" readOnly placeholder="Add bodies to use them here" />
            )}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor="uncertainty">Uncertainty (MU)</Label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">±</span>
              <Input
                id="uncertainty"
                inputMode="decimal"
                placeholder="5.60"
                value={uncertaintyNumber}
                onChange={(e) => {
                  const n = e.target.value.replace(/[^0-9.]/g, '')
                  onChange({ ...form, uncertaintyMu: formatPlusMinusPercent(n) })
                }}
                onBlur={() => {
                  onChange({ ...form, uncertaintyMu: formatPlusMinusPercent(form.uncertaintyMu) })
                }}
                className="pl-8 pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label htmlFor="department">Department</Label>
            {departmentOptions.length > 0 ? (
              <Select
                value={form.department}
                onValueChange={(v) => {
                  const allowed = getDesignationOptionsForDepartment(v)
                  const keepDesignation =
                    form.designation &&
                    allowed.some((d) => normLabel(d) === normLabel(form.designation))
                  onChange({
                    ...form,
                    department: v,
                    designation: keepDesignation ? form.designation : '',
                  })
                }}
              >
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([form.department, ...departmentOptions].filter((d) => d && d.trim().length > 0))).map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="department"
                value={form.department}
                onChange={(e) => onChange({ ...form, department: e.target.value })}
              />
            )}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex min-h-6 items-center">
              <Label htmlFor="designation">Designation</Label>
            </div>
            {designationOptions.length > 0 ? (
              <Select
                value={form.designation}
                onValueChange={(v) => onChange({ ...form, designation: v })}
                disabled={!form.department.trim()}
              >
                <SelectTrigger id="designation">
                  <SelectValue placeholder={form.department.trim() ? 'Select designation' : 'Select department first'} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([form.designation, ...designationOptions].filter((d) => d && d.trim().length > 0))).map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="designation"
                value={form.designation}
                readOnly
                placeholder="Add designations in User Management"
              />
            )}
            {form.department.trim() && designationOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No designations in User Management for this department.</p>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClear} disabled={saveLoading} className="w-28">
          Clear
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave} className="w-28">
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>

    </Card>
  )
}
