import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { limsOutlineBtnClass, limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  RECEIVING_REPORT_TYPES,
  type SampleReceivingForm as FormType,
  type SampleRow,
} from '../types'
import { buildReceivingSrfFromReference, stripReceivingReportSuffix } from './receivingSrfFromReference'
import { FilterCombobox } from './FilterCombobox'
import { OptionCombobox } from './OptionCombobox'

export type SrfSearchOption = Pick<SampleRow, 'id' | 'srf_number' | 'client_name'>

export function SampleReceivingForm({
  form,
  onChange,
  onSave,
  onClear,
  onGoToReview,
  canSave,
  saveLoading,
  activeTab,
  onTabChange,
  clientOptions,
  isCodeOptions,
  testRequiredOptions,
  modeOfDisposalOptions,
  natureOfSampleOptions,
  sampleReceivingStatusOptions,
  onAddClient,
  onAddIsCode,
  onFileSelect,
  clientReferencesFileName,
  onDateOfSampleReceivingChange,
  onReportTypeChange,
  onSelectReferencedSrf,
  srfSearchRows = [],
  editingSampleId = null,
  onAddReceivingOption,
  onUpdateReceivingOption,
  onDeleteReceivingOption = async () => {},
}: {
  form: FormType
  onChange: (next: FormType) => void
  onSave: () => void
  onClear: () => void
  onGoToReview: () => void
  canSave: boolean
  saveLoading: boolean
  activeTab: string
  onTabChange: (v: string) => void
  clientOptions: Array<{ id: string; label: string }>
  isCodeOptions: Array<{ id: string; label: string }>
  testRequiredOptions: Array<{ id: string; label: string }>
  modeOfDisposalOptions: Array<{ id: string; label: string }>
  natureOfSampleOptions: Array<{ id: string; label: string }>
  sampleReceivingStatusOptions: string[]
  onAddClient?: () => void
  onAddIsCode?: () => void
  onFileSelect?: (file: File | null) => void
  clientReferencesFileName?: string
  onDateOfSampleReceivingChange?: (newDate: string) => void
  onReportTypeChange?: (reportType: string) => void
  onSelectReferencedSrf?: (sampleId: string) => void
  srfSearchRows?: SrfSearchOption[]
  editingSampleId?: string | null
  onAddReceivingOption?: (category: string, label: string) => Promise<void>
  onUpdateReceivingOption?: (category: string, id: string, label: string) => Promise<void>
  onDeleteReceivingOption?: (category: string, id: string) => Promise<void>
}) {
  const yesNo = (key: keyof FormType, value: boolean) =>
    onChange({ ...form, [key]: value })

  const [customerInput, setCustomerInput] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [isCodeInput, setIsCodeInput] = useState('')
  const [isCodeDropdownOpen, setIsCodeDropdownOpen] = useState(false)
  const [srfSearchInput, setSrfSearchInput] = useState('')
  const [srfDropdownOpen, setSrfDropdownOpen] = useState(false)
  const reviewFirstFieldRef = useRef<HTMLInputElement>(null)

  const isNewReport = form.receivingReportType === RECEIVING_REPORT_TYPES[0]
  const useReferencedSrfSearch = !editingSampleId && !isNewReport

  useEffect(() => {
    const current = clientOptions.find((c) => c.id === form.customerId)
    if (current) {
      setCustomerInput(current.label)
    } else if (!form.customerId) {
      setCustomerInput('')
    }
    const isCode = isCodeOptions.find((o) => o.id === form.testReportAsPerIsId)
    if (isCode) {
      setIsCodeInput(isCode.label)
    } else if (!form.testReportAsPerIsId) {
      setIsCodeInput('')
    }
  }, [form.customerId, form.testReportAsPerIsId, clientOptions, isCodeOptions])

  useEffect(() => {
    if (useReferencedSrfSearch) {
      setSrfSearchInput(form.referencedSrfNumber)
    } else {
      setSrfSearchInput(form.srfNumber)
    }
  }, [form.referencedSrfNumber, form.srfNumber, useReferencedSrfSearch])

  const filteredClients = customerInput.trim()
    ? clientOptions.filter((opt) =>
        opt.label.toLowerCase().includes(customerInput.trim().toLowerCase()),
      )
    : clientOptions

  const filteredIsCodes = isCodeInput.trim()
    ? isCodeOptions.filter((opt) =>
        opt.label.toLowerCase().includes(isCodeInput.trim().toLowerCase()),
      )
    : isCodeOptions

  const srfQuery = srfSearchInput.trim().toLowerCase()
  const filteredSrfRows = (srfQuery
    ? srfSearchRows.filter((r) => {
        const srf = r.srf_number?.toLowerCase() ?? ''
        const client = r.client_name?.toLowerCase() ?? ''
        return srf.includes(srfQuery) || client.includes(srfQuery)
      })
    : srfSearchRows
  )
    .filter((r) => r.srf_number?.trim())
    .slice(0, 25)

  const goToReviewTab = () => {
    onGoToReview()
    requestAnimationFrame(() => reviewFirstFieldRef.current?.focus())
  }

  const handleDateChange = (newDate: string) => {
    if (onDateOfSampleReceivingChange) {
      onDateOfSampleReceivingChange(newDate)
    } else {
      onChange({ ...form, dateOfSampleReceiving: newDate })
    }
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-0')}>
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <div
            className="grid h-10 w-full grid-cols-2 items-center justify-center rounded-none border border-stone-500 bg-stone-200/80 p-1 text-stone-600"
            role="tablist"
            aria-label="Sample receiving sections"
          >
            <button
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={activeTab === 'details'}
              className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30',
                activeTab === 'details'
                  ? 'bg-stone-800 text-amber-100 shadow-sm'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
              )}
              onClick={() => onTabChange('details')}
            >
              Customer & Sample Details
            </button>
            <button
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={activeTab === 'review'}
              className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30',
                activeTab === 'review'
                  ? 'bg-stone-800 text-amber-100 shadow-sm'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
              )}
              onClick={() => onTabChange('review')}
            >
              Review
            </button>
          </div>

          <TabsContent value="details" tabIndex={-1} className="space-y-5 mt-4 outline-none">
            {/* Row 1: Report Type 20%, SRF 20%, Date 20%, Customer 40% */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_1fr_1fr_2fr] md:items-end">
              <div className="space-y-2 min-w-0">
                <Label>Report Type</Label>
                <Select
                  value={form.receivingReportType || RECEIVING_REPORT_TYPES[0]}
                  onValueChange={(v) => {
                    if (onReportTypeChange) onReportTypeChange(v)
                    else onChange({ ...form, receivingReportType: v })
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Report type">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECEIVING_REPORT_TYPES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-0">
                <Label>SRF Number</Label>
                {useReferencedSrfSearch ? (
                  <>
                    <div className="relative">
                      <Input
                        value={srfSearchInput}
                        onChange={(e) => {
                          const val = e.target.value
                          setSrfSearchInput(val)
                          const base = stripReceivingReportSuffix(val)
                          onChange({
                            ...form,
                            referencedSrfNumber: base,
                            srfNumber: buildReceivingSrfFromReference(base, form.receivingReportType),
                          })
                        }}
                        onFocus={() => setSrfDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setSrfDropdownOpen(false), 150)}
                        placeholder="Search previous SRF…"
                        autoComplete="off"
                        className="w-full"
                      />
                      {srfDropdownOpen && filteredSrfRows.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                          <ul className="max-h-48 overflow-auto text-sm">
                            {filteredSrfRows.map((row) => (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left hover:bg-muted"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    const label = stripReceivingReportSuffix(row.srf_number ?? '')
                                    setSrfSearchInput(label)
                                    setSrfDropdownOpen(false)
                                    onSelectReferencedSrf?.(row.id)
                                  }}
                                >
                                  <span className="font-medium">{row.srf_number}</span>
                                  {row.client_name ? (
                                    <span className="text-muted-foreground"> — {row.client_name}</span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {form.srfNumber ? (
                      <p className="text-xs text-muted-foreground">
                        Assigned SRF: <span className="font-medium text-foreground">{form.srfNumber}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Input
                    value={form.srfNumber}
                    onChange={(e) => onChange({ ...form, srfNumber: e.target.value })}
                    className="w-full"
                    aria-label="SRF number"
                    placeholder="Auto-generated or enter manually"
                  />
                )}
              </div>
              <div className="space-y-2 min-w-0">
                <Label>Date of Receiving</Label>
                <Input type="date" value={form.dateOfSampleReceiving} onChange={(e) => handleDateChange(e.target.value)} className="w-full" />
              </div>
              <div className="space-y-2 min-w-0">
                <Label>Name of the Customer</Label>
                <FilterCombobox
                  value={customerInput}
                  onValueChange={(val) => {
                    setCustomerInput(val)
                    const match = clientOptions.find((opt) => opt.label === val)
                    if (match) {
                      onChange({ ...form, customerId: match.id })
                    }
                  }}
                  options={filteredClients}
                  onSelectOption={(opt) => {
                    setCustomerInput(opt.label)
                    onChange({ ...form, customerId: opt.id })
                  }}
                  open={clientDropdownOpen}
                  onOpenChange={setClientDropdownOpen}
                  placeholder="Select Client"
                  listId="receiving-client-combobox"
                  extraActions={
                    onAddClient
                      ? [
                          {
                            key: 'add-client',
                            label: 'Add new Client',
                            onSelect: onAddClient,
                          },
                        ]
                      : []
                  }
                />
              </div>
            </div>
            {/* Row 2: Test Report 25%, Client Ref 25%, Sample Qty 50% - all in one line */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              <div className="space-y-2 md:col-span-1">
                <Label>Test Report as per IS</Label>
                <FilterCombobox
                  value={isCodeInput}
                  onValueChange={(val) => {
                    setIsCodeInput(val)
                    const match = isCodeOptions.find((opt) => opt.label === val)
                    if (match) {
                      onChange({ ...form, testReportAsPerIsId: match.id })
                    }
                  }}
                  options={filteredIsCodes}
                  onSelectOption={(opt) => {
                    setIsCodeInput(opt.label)
                    onChange({ ...form, testReportAsPerIsId: opt.id })
                  }}
                  open={isCodeDropdownOpen}
                  onOpenChange={setIsCodeDropdownOpen}
                  placeholder="Select IS Code"
                  listId="receiving-is-code-combobox"
                  extraActions={
                    onAddIsCode
                      ? [
                          {
                            key: 'add-is-code',
                            label: 'Add new IS Code',
                            onSelect: onAddIsCode,
                          },
                        ]
                      : []
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label>Client Reference</Label>
                <Input value={form.clientReference} onChange={(e) => onChange({ ...form, clientReference: e.target.value })} placeholder="Client Reference" className="w-full" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Sample Quantity</Label>
                <Input value={form.sampleQuantity} onChange={(e) => onChange({ ...form, sampleQuantity: e.target.value })} placeholder="Quantity" className="w-full" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Sample Code</Label>
                <Input value={form.sampleCode} onChange={(e) => onChange({ ...form, sampleCode: e.target.value })} placeholder="Sample Code" />
              </div>
              <div className="space-y-2">
                <Label>Sample QR Code</Label>
                <Input value={form.sampleQrCode} onChange={(e) => onChange({ ...form, sampleQrCode: e.target.value })} placeholder="QR Code" />
              </div>
              <div className="space-y-2">
                <Label>Shelf-Life</Label>
                <Input value={form.shelfLife} onChange={(e) => onChange({ ...form, shelfLife: e.target.value })} placeholder="Shelf life" />
              </div>
              <div className="space-y-2">
                {onAddReceivingOption ? (
                  <OptionCombobox
                    label="Test Required"
                    value={form.testRequired}
                    onChange={(v) => onChange({ ...form, testRequired: v })}
                    options={testRequiredOptions}
                    category="test_required"
                    onAddOption={onAddReceivingOption}
                    onUpdateOption={onUpdateReceivingOption}
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or Type"
                  />
                ) : (
                  <Select value={form.testRequired ?? ''} onValueChange={(v) => onChange({ ...form, testRequired: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {testRequiredOptions.map((o) => (
                        <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {/* Batch Number, Date of Manufacturing, BIS Seal, IO's Signature — one horizontal line */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4 md:items-end">
              <div className="space-y-2 min-w-0">
                <Label>Batch Number</Label>
                <Input value={form.batchNumber} onChange={(e) => onChange({ ...form, batchNumber: e.target.value })} className="w-full" />
              </div>
              <div className="space-y-2 min-w-0">
                <Label>Date of Manufacturing</Label>
                <Input type="date" value={form.dateOfManufacturing} onChange={(e) => onChange({ ...form, dateOfManufacturing: e.target.value })} className="w-full" />
              </div>
              <div className="space-y-2 min-w-0">
                <Label>BIS Seal</Label>
                <Select value={form.bisSeal ? 'yes' : 'no'} onValueChange={(v) => onChange({ ...form, bisSeal: v === 'yes' })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-0">
                <Label>IO&apos;s Signature</Label>
                <Select value={form.ioSignature ? 'yes' : 'no'} onValueChange={(v) => onChange({ ...form, ioSignature: v === 'yes' })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Sample Description</Label>
                <Textarea value={form.sampleDescription} onChange={(e) => onChange({ ...form, sampleDescription: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Sample Declaration</Label>
                <Textarea value={form.sampleDeclaration} onChange={(e) => onChange({ ...form, sampleDeclaration: e.target.value })} rows={3} />
              </div>
            </div>
            {/* Any Other Information 50%, Mode of Disposal 25%, Nature of Sample 25% */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-[2fr_1fr_1fr] md:items-end">
              <div className="space-y-2 min-w-0">
                <Label>Any Other Information</Label>
                <Textarea value={form.anyOtherInformation} onChange={(e) => onChange({ ...form, anyOtherInformation: e.target.value })} rows={1} className="w-full min-h-10 h-10 resize-none" />
              </div>
              <div className="space-y-2 min-w-0">
                {onAddReceivingOption ? (
                  <OptionCombobox
                    label="Mode of Disposal"
                    value={form.modeOfDisposal}
                    onChange={(v) => onChange({ ...form, modeOfDisposal: v })}
                    options={modeOfDisposalOptions}
                    category="mode_of_disposal"
                    onAddOption={onAddReceivingOption}
                    onUpdateOption={onUpdateReceivingOption}
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or Type"
                  />
                ) : (
                  <>
                    <Label>Mode of Disposal</Label>
                    <Select value={form.modeOfDisposal ?? ''} onValueChange={(v) => onChange({ ...form, modeOfDisposal: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {modeOfDisposalOptions.map((o) => (
                          <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              <div className="space-y-2 min-w-0">
                {onAddReceivingOption ? (
                  <OptionCombobox
                    label="Nature of Sample"
                    value={form.natureOfSample}
                    onChange={(v) => onChange({ ...form, natureOfSample: v })}
                    options={natureOfSampleOptions}
                    category="nature_of_sample"
                    onAddOption={onAddReceivingOption}
                    onUpdateOption={onUpdateReceivingOption}
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or Type"
                  />
                ) : (
                  <>
                    <Label>Nature of Sample</Label>
                    <Select value={form.natureOfSample ?? ''} onValueChange={(v) => onChange({ ...form, natureOfSample: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {natureOfSampleOptions.map((o) => (
                          <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-300 pt-3">
              <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={onClear}>
                Clear
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} onClick={goToReviewTab}>
                Go to Review
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="review" tabIndex={-1} className="mt-4 space-y-5 outline-none">
            {/* 4 fields in a single row at top */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Tentative Date Required</Label>
                <Input
                  ref={reviewFirstFieldRef}
                  type="date"
                  value={form.tentativeDateRequired}
                  onChange={(e) => onChange({ ...form, tentativeDateRequired: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tentative Date by Lab</Label>
                <Input type="date" value={form.tentativeDateByLab} onChange={(e) => onChange({ ...form, tentativeDateByLab: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Sample Receiving Status</Label>
                <Select value={form.sampleReceivingStatus ?? ''} onValueChange={(v) => onChange({ ...form, sampleReceivingStatus: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {sampleReceivingStatusOptions.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Client References</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    className="max-w-full w-full"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      onFileSelect?.(f ?? null)
                    }}
                  />
                </div>
                {clientReferencesFileName && <p className="text-xs text-muted-foreground truncate" title={clientReferencesFileName}>{clientReferencesFileName}</p>}
              </div>
            </div>
            <h3 className="text-sm font-semibold">Review</h3>
            <div className="space-y-3">
              {[
                { key: 'statementConformityRequired', label: 'Statement of Conformity Required?', default: false },
                { key: 'witnessTestRequired', label: 'Witness Test Required by Customer?', default: false },
                { key: 'competentPersonAvailable', label: 'Competent Person Related to Testing Available?', default: true },
                { key: 'equipmentAvailable', label: 'All Related Testing Equipment Available?', default: true },
                { key: 'canCompleteWithinTime', label: 'Can Complete within Time?', default: true },
                { key: 'deviationFromMethods', label: 'Deviation from Test Methods?', default: false },
                { key: 'supportingDocsRequired', label: 'Supporting Documents Required?', default: false },
                { key: 'decisionRuleApplied', label: 'Decision Rule Applied?', default: false },
                { key: 'testingMethodAvailable', label: 'Testing Method Available & Verified?', default: true },
                { key: 'samplingProcedureRef', label: 'Reference to Sampling Procedure?', default: true },
              ].map(({ key, label, default: def }) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="text-sm flex-1">{label}</span>
                  <Select value={form[key as keyof FormType] === true ? 'yes' : 'no'} onValueChange={(v) => yesNo(key as keyof FormType, v === 'yes')}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-300 pt-3">
              <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={onClear}>
                Clear
              </Button>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
                onClick={onSave}
                disabled={!canSave || saveLoading}
              >
                {saveLoading ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
    </div>
  )
}
