import { useEffect, useMemo, useRef, useState } from 'react'
import { ListChecks, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import {
  limsDarkBarGlowStyle,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { AddClientDialog } from '@/features/sample-handling/receiving/AddClientDialog'
import { AddIsCodeDialog } from '@/features/sample-handling/receiving/AddIsCodeDialog'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  formatConsentLetterDate,
  parseConsentLetterDateInput,
  clientAddressForStorage,
} from '@/features/sample-handling/report-preparation/consentLetterDefaults'
import {
  fetchStandaloneConsentLetterFormData,
  fetchTestParametersForIsCode,
  refreshConsentLetterMasterLists,
  type ConsentLetterFormData,
  type ConsentLetterTestParameterOption,
} from '@/features/sample-handling/report-preparation/fetchConsentLetterFormData'
import { ConsentLetterTestParameterPickerDialog } from './ConsentLetterTestParameterPickerDialog'
import { generateNextConsentLetterNumber, insertConsentLetter, updateConsentLetter } from './consentLetterDb'
import type { ConsentLetterListRow } from './types'

/** Clause cell stored for an "All tests as per IS" letter (one free-text line instead of picked tests). */
export const ALL_TESTS_CLAUSE = 'All clauses'

/**
 * Default text for "All tests as per IS": the standard's number, year and title,
 * then every clause the LIMS knows for it with its test, e.g.
 * "All tests as per IS 10748:2025 (Hot rolled steel …), as required by the standard:
 *  Cl. 7.2: Carbon, Manganese, …; Cl. 8: Tensile Strength, Yield Strength; …"
 */
export function allTestsTextForIsCode(
  isCode: { isNumber: string; revisionYear: string | null; title: string; label: string },
  tests: Array<{ testName: string; clauseNo: string | null }>,
): string {
  const number = isCode.isNumber
    ? `${isCode.isNumber}${isCode.revisionYear ? `:${isCode.revisionYear}` : ''}`
    : isCode.label
  const standard = /^is\b/i.test(number) ? number : `IS ${number}`
  const title = isCode.title ? ` (${isCode.title})` : ''
  // One entry per clause, in clause order, with its tests: "Cl. 7.2: Carbon, Manganese, …".
  const byClause = new Map<string, string[]>()
  for (const t of tests) {
    const clause = t.clauseNo?.trim() ?? ''
    const name = t.testName.trim()
    if (!name) continue
    const list = byClause.get(clause) ?? []
    if (!list.includes(name)) list.push(name)
    byClause.set(clause, list)
  }
  const clauses = [...byClause.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([clause, names]) => (clause ? `Cl. ${clause}: ${names.join(', ')}` : names.join(', ')))
  return clauses.length
    ? `All tests as per ${standard}${title}, as required by the standard: ${clauses.join('; ')}.`
    : `All tests as per ${standard}${title}, as required by the standard (all applicable clauses).`
}

const dialogOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const dialogShellClass = cn(
  'max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(48rem,calc(100vw-268px-2rem))] lg:max-w-[min(48rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
)

async function parametersFromSavedRow(
  row: ConsentLetterListRow,
): Promise<ConsentLetterTestParameterOption[]> {
  const names = row.testParameterNames
  if (names.length === 0) return []

  if (!row.isCodeId) {
    return names.map((name) => ({
      key: `legacy:${name}`,
      testName: name,
      clauseNo: null,
      specificRequirement: null,
      uncertaintyMu: null,
      underAccreditation: null,
    }))
  }

  const all = await fetchTestParametersForIsCode(row.isCodeId)
  return names.map((name) => {
    const match = all.find((p) => p.testName === name)
    return (
      match ?? {
        key: `legacy:${name}`,
        testName: name,
        clauseNo: null,
        specificRequirement: null,
        uncertaintyMu: null,
        underAccreditation: null,
      }
    )
  })
}

export function ConsentLetterGenerateDialog({
  open,
  onOpenChange,
  editRow,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editRow?: ConsentLetterListRow | null
  onSaved?: () => void
}) {
  const isEdit = Boolean(editRow?.id)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<ConsentLetterFormData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [clientId, setClientId] = useState('')
  const [clientInput, setClientInput] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [isCodeId, setIsCodeId] = useState('')
  // "All tests as per IS": one editable text instead of picked test parameters.
  const [allTestsMode, setAllTestsMode] = useState(false)
  const [allTestsText, setAllTestsText] = useState('')
  const [allTestsLoading, setAllTestsLoading] = useState(false)
  const [isCodeInput, setIsCodeInput] = useState('')
  const [isCodeDropdownOpen, setIsCodeDropdownOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addIsCodeOpen, setAddIsCodeOpen] = useState(false)

  const [addedParameters, setAddedParameters] = useState<ConsentLetterTestParameterOption[]>([])
  const [consentLetterNo, setConsentLetterNo] = useState('')
  const [letterDate, setLetterDate] = useState(() => formatConsentLetterDate())
  const [numberLoading, setNumberLoading] = useState(false)
  const initialEditSnapshotRef = useRef<{ date: string; no: string } | null>(null)

  const clientOptions = useMemo(
    () => (formData?.clients ?? []).map((c) => ({ id: c.id, label: c.companyName })),
    [formData?.clients],
  )

  const isCodeOptions = useMemo(
    () => (formData?.isCodes ?? []).map((c) => ({ id: c.id, label: c.label })),
    [formData?.isCodes],
  )

  const filteredClients = clientInput.trim()
    ? clientOptions.filter((opt) =>
        opt.label.toLowerCase().includes(clientInput.trim().toLowerCase()),
      )
    : clientOptions

  const filteredIsCodes = isCodeInput.trim()
    ? isCodeOptions.filter((opt) =>
        opt.label.toLowerCase().includes(isCodeInput.trim().toLowerCase()),
      )
    : isCodeOptions

  const clientExactMatch = clientOptions.some(
    (opt) => opt.label.toLowerCase() === clientInput.trim().toLowerCase(),
  )
  const isCodeExactMatch = isCodeOptions.some(
    (opt) => opt.label.toLowerCase() === isCodeInput.trim().toLowerCase(),
  )

  useEffect(() => {
    if (!open) {
      setFormData(null)
      setError(null)
      setPickerOpen(false)
      setClientInput('')
      setClientDropdownOpen(false)
      setIsCodeInput('')
      setIsCodeDropdownOpen(false)
      setAddClientOpen(false)
      setAddIsCodeOpen(false)
      initialEditSnapshotRef.current = null
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const data = await fetchStandaloneConsentLetterFormData(
          editRow?.isCodeId ?? null,
          editRow?.clientId ?? null,
        )
        if (cancelled) return
        setFormData(data)

        if (editRow) {
          const editDate = editRow.letterDate || formatConsentLetterDate()
          initialEditSnapshotRef.current = {
            date: editDate,
            no: editRow.consentLetterNo,
          }
          setConsentLetterNo(editRow.consentLetterNo)
          setLetterDate(editDate)
          const nextClientId = editRow.clientId ?? ''
          const nextIsCodeId = editRow.isCodeId ?? ''
          setClientId(nextClientId)
          setIsCodeId(nextIsCodeId)
          setClientInput(
            data.clients.find((c) => c.id === nextClientId)?.companyName ??
              editRow.clientName?.trim() ??
              '',
          )
          setIsCodeInput(
            data.isCodes.find((c) => c.id === nextIsCodeId)?.label ??
              editRow.isCodeLabel?.trim() ??
              '',
          )
          const savedAllTests =
            editRow.clauseSummary === ALL_TESTS_CLAUSE && editRow.testParameterNames.length === 1
          setAllTestsMode(savedAllTests)
          setAllTestsText(savedAllTests ? editRow.testParameterNames[0] : '')
          const params = savedAllTests ? [] : await parametersFromSavedRow(editRow)
          if (!cancelled) setAddedParameters(params)
        } else {
          initialEditSnapshotRef.current = null
          const nextDate = formatConsentLetterDate()
          setLetterDate(nextDate)
          setConsentLetterNo('')
          setClientId('')
          setIsCodeId('')
          setClientInput('')
          setIsCodeInput('')
          setAddedParameters([])
          setAllTestsMode(false)
          setAllTestsText('')
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load consent letter form')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, editRow])

  useEffect(() => {
    if (!open || loading) return

    const snapshot = initialEditSnapshotRef.current
    if (isEdit && snapshot && letterDate === snapshot.date) {
      setConsentLetterNo(snapshot.no)
      return
    }

    if (!parseConsentLetterDateInput(letterDate)) return

    let cancelled = false
    setNumberLoading(true)
    void (async () => {
      try {
        const next = await generateNextConsentLetterNumber(letterDate, isEdit ? editRow?.id : null)
        if (!cancelled) setConsentLetterNo(next)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to generate consent letter number')
        }
      } finally {
        if (!cancelled) setNumberLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [letterDate, open, loading, isEdit, editRow?.id])

  useEffect(() => {
    const current = clientOptions.find((c) => c.id === clientId)
    if (current) setClientInput(current.label)
  }, [clientId, clientOptions])

  useEffect(() => {
    const current = isCodeOptions.find((c) => c.id === isCodeId)
    if (current) setIsCodeInput(current.label)
  }, [isCodeId, isCodeOptions])

  const handleIsCodeSelect = (id: string) => {
    setIsCodeId(id)
    setAddedParameters([])
    if (allTestsMode) void generateAllTestsText(id)
  }

  /** Fills the "All tests as per IS" text from the IS code and its clauses. */
  const generateAllTestsText = async (forIsCodeId: string = isCodeId) => {
    const isCode = formData?.isCodes.find((c) => c.id === forIsCodeId)
    if (!isCode) return
    setAllTestsLoading(true)
    try {
      const tests = await fetchTestParametersForIsCode(forIsCodeId)
      setAllTestsText(allTestsTextForIsCode(isCode, tests))
    } catch {
      setAllTestsText(allTestsTextForIsCode(isCode, []))
    } finally {
      setAllTestsLoading(false)
    }
  }

  const startAllTests = () => {
    setAllTestsMode(true)
    setAddedParameters([])
    void generateAllTestsText()
  }

  const refreshMasters = async () => {
    const { clients, isCodes } = await refreshConsentLetterMasterLists()
    setFormData((prev) => (prev ? { ...prev, clients, isCodes } : prev))
    return { clients, isCodes }
  }

  const selectedClient = useMemo(
    () => formData?.clients.find((c) => c.id === clientId) ?? null,
    [formData, clientId],
  )

  const selectedIsCode = useMemo(
    () => formData?.isCodes.find((c) => c.id === isCodeId) ?? null,
    [formData, isCodeId],
  )

  const addedKeys = useMemo(() => new Set(addedParameters.map((p) => p.key)), [addedParameters])

  const removeParameter = (key: string) => {
    setAddedParameters((prev) => prev.filter((p) => p.key !== key))
  }

  const handleAddParameters = (picked: ConsentLetterTestParameterOption[]) => {
    setAddedParameters((prev) => {
      const existing = new Set(prev.map((p) => p.key))
      const next = [...prev]
      for (const p of picked) {
        if (!existing.has(p.key)) next.push(p)
      }
      return next
    })
  }

  const canSave =
    Boolean(
      selectedClient &&
        selectedIsCode &&
        (allTestsMode ? allTestsText.trim() !== '' : addedParameters.length > 0) &&
        consentLetterNo.trim() &&
        !numberLoading,
    )

  const handleSave = async () => {
    if (!formData || !selectedClient || !selectedIsCode || !canSave) return
    setSaving(true)
    setError(null)
    try {
      const clauseFromParams = addedParameters
        .map((p) => p.clauseNo?.trim())
        .filter(Boolean)
        .join(', ')
      const resolvedClause = allTestsMode
        ? ALL_TESTS_CLAUSE
        : clauseFromParams || 'Relevant Clause of Correspondence IS'
      const testNames = allTestsMode ? [allTestsText.trim()] : addedParameters.map((p) => p.testName)

      const payload = {
        consentLetterNo: consentLetterNo.trim(),
        letterDate: letterDate.trim() || formatConsentLetterDate(),
        clientId: selectedClient.id,
        clientName: selectedClient.companyName,
        clientAddress: clientAddressForStorage(
          selectedClient.addressBlock,
          selectedClient.companyName,
        ),
        isCodeId: selectedIsCode.id,
        isCodeLabel: selectedIsCode.label,
        isNumber: selectedIsCode.isNumber,
        revisionYear: selectedIsCode.revisionYear,
        productTitle: selectedIsCode.title,
        testParameterNames: testNames,
        clauseSummary: resolvedClause,
      }

      if (isEdit && editRow) {
        await updateConsentLetter({ id: editRow.id, ...payload })
      } else {
        const { data: authData } = await supabase.auth.getUser()
        await insertConsentLetter({
          ...payload,
          generatedBy: authData.user?.id ?? null,
        })
      }

      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : formatSupabaseError(e as { message?: string }) || 'Unable to save consent letter')
    } finally {
      setSaving(false)
    }
  }

  const nestedDialogOpen = pickerOpen || addClientOpen || addIsCodeOpen

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          showCloseButton={!nestedDialogOpen}
          overlayClassName={dialogOverlayClass}
          className={dialogShellClass}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {isEdit ? 'Edit Consent Letter' : 'Generate Consent Letter'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {loading ? (
              <p className="py-4 text-sm text-stone-500">Loading…</p>
            ) : (
              <div className={cn(limsRegistryFormClass, 'space-y-4')}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="consent-letter-no">Consent Letter No</Label>
                    <Input
                      id="consent-letter-no"
                      value={numberLoading ? 'Generating…' : consentLetterNo}
                      readOnly
                      className="bg-stone-100"
                      placeholder="QI/yymmdd-01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="consent-letter-date">Date</Label>
                    <Input
                      id="consent-letter-date"
                      value={letterDate}
                      onChange={(e) => setLetterDate(e.target.value)}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="consent-client">Client</Label>
                    <FilterCombobox
                      value={clientInput}
                      onValueChange={(val) => {
                        setClientInput(val)
                        if (!val.trim()) {
                          setClientId('')
                          return
                        }
                        const match = clientOptions.find((opt) => opt.label === val)
                        if (match) setClientId(match.id)
                      }}
                      options={filteredClients}
                      onSelectOption={(opt) => {
                        setClientInput(opt.label)
                        setClientId(opt.id)
                      }}
                      open={clientDropdownOpen}
                      onOpenChange={setClientDropdownOpen}
                      placeholder="Type to search client"
                      listId="consent-letter-client-combobox"
                      disabled={!formData?.clients.length && !clientInput.trim()}
                      extraActions={
                        clientInput.trim() && !clientExactMatch
                          ? [
                              {
                                key: 'add-client',
                                label: 'Add New Client',
                                onSelect: () => setAddClientOpen(true),
                              },
                            ]
                          : []
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consent-is-code">IS Code</Label>
                    <FilterCombobox
                      value={isCodeInput}
                      onValueChange={(val) => {
                        setIsCodeInput(val)
                        if (!val.trim()) {
                          setIsCodeId('')
                          if (!isEdit) setAddedParameters([])
                          return
                        }
                        const match = isCodeOptions.find((opt) => opt.label === val)
                        if (match) handleIsCodeSelect(match.id)
                      }}
                      options={filteredIsCodes}
                      onSelectOption={(opt) => {
                        setIsCodeInput(opt.label)
                        handleIsCodeSelect(opt.id)
                      }}
                      open={isCodeDropdownOpen}
                      onOpenChange={setIsCodeDropdownOpen}
                      placeholder="Type to search IS code"
                      listId="consent-letter-is-code-combobox"
                      disabled={!formData?.isCodes.length && !isCodeInput.trim()}
                      extraActions={
                        isCodeInput.trim() && !isCodeExactMatch
                          ? [
                              {
                                key: 'add-is-code',
                                label: 'Add New IS Code',
                                onSelect: () => setAddIsCodeOpen(true),
                              },
                            ]
                          : []
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Test Parameters</Label>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {allTestsMode ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'gap-1.5')}
                          disabled={!isCodeId || allTestsLoading}
                          onClick={() => void generateAllTestsText()}
                        >
                          <RotateCcw size={14} />
                          Default text from IS
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'gap-1.5')}
                          disabled={!isCodeId}
                          onClick={startAllTests}
                        >
                          <ListChecks size={14} />
                          All tests as per IS
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'gap-1.5')}
                        disabled={!isCodeId}
                        onClick={() => {
                          setAllTestsMode(false)
                          setPickerOpen(true)
                        }}
                      >
                        <Plus size={14} />
                        Add Test Parameter
                      </Button>
                    </div>
                  </div>

                  {allTestsMode ? (
                    <div className="space-y-1">
                      <textarea
                        id="consent-all-tests-text"
                        aria-label="All tests as per IS"
                        className="min-h-[96px] w-full resize-y rounded-none border border-stone-500 bg-white px-3 py-2 text-sm"
                        value={allTestsLoading ? 'Reading the IS code…' : allTestsText}
                        disabled={allTestsLoading}
                        onChange={(e) => setAllTestsText(e.target.value)}
                      />
                      <p className="text-xs text-stone-500">
                        Printed in the test table with clause "{ALL_TESTS_CLAUSE}". Edit the text if needed; "Default text from
                        IS" writes it again from the IS code. Choose "Add Test Parameter" to pick single tests instead.
                      </p>
                    </div>
                  ) : null}

                  {allTestsMode ? null : addedParameters.length === 0 ? (
                    <p className="rounded-none border border-dashed border-stone-400 bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
                      No test parameters added. Select IS code and click Add Test Parameter.
                    </p>
                  ) : (
                    <ul className="max-h-48 divide-y divide-stone-200 overflow-y-auto rounded-none border border-stone-500 bg-white">
                      {addedParameters.map((p) => (
                        <li
                          key={p.key}
                          className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span>
                            <span className="font-medium text-stone-800">{p.testName}</span>
                            {p.clauseNo ? (
                              <span className="block text-xs text-stone-500">Clause: {p.clauseNo}</span>
                            ) : null}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 rounded-none text-red-700 hover:bg-red-50 hover:text-red-800"
                            aria-label={`Remove ${p.testName}`}
                            onClick={() => removeParameter(p.key)}
                          >
                            <X size={14} />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {error ? (
              <p className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => void handleSave()}
              disabled={loading || saving || !canSave}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConsentLetterTestParameterPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        isCodeId={isCodeId}
        isCodeLabel={selectedIsCode?.label ?? '—'}
        alreadyAddedKeys={addedKeys}
        onConfirm={handleAddParameters}
      />

      <AddClientDialog
        nested
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        initialCompanyName={clientInput}
        onSaved={(id) => {
          void (async () => {
            try {
              const { clients } = await refreshMasters()
              const client = clients.find((c) => c.id === id)
              setClientId(id)
              setClientInput(client?.companyName ?? clientInput)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to refresh clients')
            }
          })()
        }}
      />

      <AddIsCodeDialog
        nested
        open={addIsCodeOpen}
        onOpenChange={setAddIsCodeOpen}
        initialLabel={isCodeInput}
        onSaved={(id) => {
          void (async () => {
            try {
              const { isCodes } = await refreshMasters()
              const isCode = isCodes.find((c) => c.id === id)
              handleIsCodeSelect(id)
              setIsCodeInput(isCode?.label ?? isCodeInput)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to refresh IS codes')
            }
          })()
        }}
      />
    </>
  )
}
