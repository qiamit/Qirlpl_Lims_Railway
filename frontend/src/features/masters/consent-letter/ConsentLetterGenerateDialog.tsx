import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
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
          const params = await parametersFromSavedRow(editRow)
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
        addedParameters.length > 0 &&
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
      const resolvedClause = clauseFromParams || 'Relevant Clause of Correspondence IS'
      const testNames = addedParameters.map((p) => p.testName)

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
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          showCloseButton={!nestedDialogOpen}
        >
          <DialogHeader className="pr-10">
            <DialogTitle>{isEdit ? 'Edit Consent Letter' : 'Generate Consent Letter'}</DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="consent-letter-no">Consent Letter No</Label>
                  <Input
                    id="consent-letter-no"
                    value={numberLoading ? 'Generating…' : consentLetterNo}
                    readOnly
                    className="bg-muted/40"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={!isCodeId}
                    onClick={() => setPickerOpen(true)}
                  >
                    <Plus size={14} />
                    Add Test Parameter
                  </Button>
                </div>

                {addedParameters.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border/80 px-3 py-4 text-center">
                    No test parameters added. Select IS code and click Add Test Parameter.
                  </p>
                ) : (
                  <ul className="rounded-md border border-border/80 divide-y max-h-48 overflow-y-auto">
                    {addedParameters.map((p) => (
                      <li
                        key={p.key}
                        className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{p.testName}</span>
                          {p.clauseNo ? (
                            <span className="block text-xs text-muted-foreground">Clause: {p.clauseNo}</span>
                          ) : null}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading || saving || !canSave}>
              {saving ? 'Saving…' : 'Save'}
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
