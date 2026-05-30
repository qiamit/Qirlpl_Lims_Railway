import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { SampleReceivingForm as FormType } from '../types'
import { OptionCombobox } from './OptionCombobox'

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
  onAddReceivingOption,
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
  onAddReceivingOption?: (category: string, label: string) => Promise<void>
  onDeleteReceivingOption?: (category: string, id: string) => Promise<void>
}) {
  const yesNo = (key: keyof FormType, value: boolean) =>
    onChange({ ...form, [key]: value })

  const [customerInput, setCustomerInput] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [isCodeInput, setIsCodeInput] = useState('')
  const [isCodeDropdownOpen, setIsCodeDropdownOpen] = useState(false)

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

  const handleDateChange = (newDate: string) => {
    if (onDateOfSampleReceivingChange) {
      onDateOfSampleReceivingChange(newDate)
    } else {
      onChange({ ...form, dateOfSampleReceiving: newDate })
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Customer & Sample Details</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-5 mt-4">
            <h3 className="text-sm font-semibold">Customer & Sample Details</h3>
            {/* Row 1: SRF 25%, Date 25%, Customer 50% - all in one line */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              <div className="space-y-2 md:col-span-1">
                <Label>SRF Number</Label>
                <Input value={form.srfNumber} readOnly className="bg-muted w-full" />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label>Date of Sample Receiving</Label>
                <Input type="date" value={form.dateOfSampleReceiving} onChange={(e) => handleDateChange(e.target.value)} className="w-full" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Name of the Customer</Label>
                <div className="relative">
                  <Input
                    value={customerInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setCustomerInput(val)
                      const match = clientOptions.find((opt) => opt.label === val)
                      if (match) {
                        onChange({ ...form, customerId: match.id })
                      }
                    }}
                    onFocus={() => setClientDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setClientDropdownOpen(false), 120)}
                    placeholder="Select client"
                    autoComplete="off"
                  />
                  {clientDropdownOpen && (filteredClients.length > 0 || onAddClient) && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                      <ul className="max-h-48 overflow-auto text-sm">
                        {filteredClients.map((opt) => (
                          <li key={opt.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setCustomerInput(opt.label)
                                onChange({ ...form, customerId: opt.id })
                                setClientDropdownOpen(false)
                              }}
                            >
                              {opt.label}
                            </button>
                          </li>
                        ))}
                        {onAddClient && (
                          <li>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-primary hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setClientDropdownOpen(false)
                                onAddClient()
                              }}
                            >
                              Add new Client
                            </button>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Row 2: Test Report 25%, Client Ref 25%, Sample Qty 50% - all in one line */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              <div className="space-y-2 md:col-span-1">
                <Label>Test Report as per IS</Label>
                <div className="relative">
                  <Input
                    value={isCodeInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setIsCodeInput(val)
                      const match = isCodeOptions.find((opt) => opt.label === val)
                      if (match) {
                        onChange({ ...form, testReportAsPerIsId: match.id })
                      }
                    }}
                    onFocus={() => setIsCodeDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsCodeDropdownOpen(false), 120)}
                    placeholder="Select IS Code"
                    autoComplete="off"
                  />
                  {isCodeDropdownOpen && (filteredIsCodes.length > 0 || onAddIsCode) && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                      <ul className="max-h-48 overflow-auto text-sm">
                        {filteredIsCodes.map((opt) => (
                          <li key={opt.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setIsCodeInput(opt.label)
                                onChange({ ...form, testReportAsPerIsId: opt.id })
                                setIsCodeDropdownOpen(false)
                              }}
                            >
                              {opt.label}
                            </button>
                          </li>
                        ))}
                        {onAddIsCode && (
                          <li>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-primary hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setIsCodeDropdownOpen(false)
                                onAddIsCode()
                              }}
                            >
                              Add new IS Code
                            </button>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label>Client Reference</Label>
                <Input value={form.clientReference} onChange={(e) => onChange({ ...form, clientReference: e.target.value })} placeholder="Client reference" className="w-full" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Sample Quantity</Label>
                <Input value={form.sampleQuantity} onChange={(e) => onChange({ ...form, sampleQuantity: e.target.value })} placeholder="Quantity" className="w-full" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Sample Code</Label>
                <Input value={form.sampleCode} onChange={(e) => onChange({ ...form, sampleCode: e.target.value })} placeholder="Sample code" />
              </div>
              <div className="space-y-2">
                <Label>Sample QR Code</Label>
                <Input value={form.sampleQrCode} onChange={(e) => onChange({ ...form, sampleQrCode: e.target.value })} placeholder="QR code" />
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
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or type"
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
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Batch Number</Label>
                <Input value={form.batchNumber} onChange={(e) => onChange({ ...form, batchNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date of Manufacturing</Label>
                <Input type="date" value={form.dateOfManufacturing} onChange={(e) => onChange({ ...form, dateOfManufacturing: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>BIS Seal</Label>
                <Select value={form.bisSeal ? 'yes' : 'no'} onValueChange={(v) => onChange({ ...form, bisSeal: v === 'yes' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>IO&apos;s Signature</Label>
                <Select value={form.ioSignature ? 'yes' : 'no'} onValueChange={(v) => onChange({ ...form, ioSignature: v === 'yes' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            {/* Any Other Information 50%, Mode of Disposal 25%, Nature of Sample 25% - single line */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Any Other Information</Label>
                <Textarea value={form.anyOtherInformation} onChange={(e) => onChange({ ...form, anyOtherInformation: e.target.value })} rows={1} className="w-full min-h-10 h-10 resize-none" />
              </div>
              <div className="space-y-2 md:col-span-1">
                {onAddReceivingOption ? (
                  <OptionCombobox
                    label="Mode of Disposal"
                    value={form.modeOfDisposal}
                    onChange={(v) => onChange({ ...form, modeOfDisposal: v })}
                    options={modeOfDisposalOptions}
                    category="mode_of_disposal"
                    onAddOption={onAddReceivingOption}
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or type"
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
              <div className="space-y-2 md:col-span-1">
                {onAddReceivingOption ? (
                  <OptionCombobox
                    label="Nature of Sample"
                    value={form.natureOfSample}
                    onChange={(v) => onChange({ ...form, natureOfSample: v })}
                    options={natureOfSampleOptions}
                    category="nature_of_sample"
                    onAddOption={onAddReceivingOption}
                    onDeleteOption={onDeleteReceivingOption}
                    placeholder="Select or type"
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
            <div className="flex gap-2 justify-end">
              <button type="button" className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 py-2 hover:bg-accent" onClick={onClear}>Clear</button>
              <button type="button" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 py-2 hover:bg-primary/90" onClick={onGoToReview}>Go to Review</button>
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-5 mt-4">
            {/* 4 fields in a single row at top */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Tentative Date Required</Label>
                <Input type="date" value={form.tentativeDateRequired} onChange={(e) => onChange({ ...form, tentativeDateRequired: e.target.value })} />
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
                <Label>Upload Clients References</Label>
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
            <div className="flex gap-2">
              <button type="button" className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 py-2 hover:bg-accent" onClick={onClear}>Clear</button>
              <button type="button" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 py-2 hover:bg-primary/90 disabled:opacity-50" onClick={onSave} disabled={!canSave || saveLoading}>
                {saveLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
