import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clientRegistryFormClass } from '@/features/masters/clients/clientsFormUi'
import { limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { CalibrationEquipmentSelectButton } from './SelectCalibrationEquipmentDialog'
import {
  CAPABILITY_EVALUATION_ROWS,
  EVALUATION_DEFAULT_REMARKS,
  QI_TERMS_AND_CONDITIONS,
  RESOURCE_EVALUATION_ROWS,
  SERVICE_REQUEST_STATUSES,
  defaultDueDateFromSrf,
  isEvaluationDefaultRemark,
  remarkForEvaluationOk,
  type CapabilityEvaluation,
  type CapabilityEvaluationKey,
  type EvaluationItem,
  type ResourceEvaluation,
  type ResourceEvaluationKey,
  type ServiceRequestForm,
  type ServiceRequestStatus,
} from './types'

const FORM_TABS = [
  'request',
  'evaluation',
  'customer-communication',
  'review',
] as const

type FormTab = (typeof FORM_TABS)[number]

const formTabTriggerClass = cn(
  'group min-w-0 flex-1 whitespace-nowrap rounded-none border border-transparent px-2 py-2 text-[11px] font-semibold uppercase tracking-wide shadow-none sm:px-3 sm:text-xs',
  'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900',
  'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:ring-offset-0',
  'data-[state=active]:border-amber-500/50 data-[state=active]:bg-stone-800 data-[state=active]:text-amber-100',
  'data-[state=active]:shadow-none',
)

function nextFormTab(current: string): FormTab | null {
  const idx = FORM_TABS.indexOf(current as FormTab)
  if (idx < 0 || idx >= FORM_TABS.length - 1) return null
  return FORM_TABS[idx + 1]!
}

function YesNoSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  disabled?: boolean
}) {
  const selectValue = value === true ? 'yes' : value === false ? 'no' : 'na'
  return (
    <Select
      value={selectValue}
      onValueChange={(v) =>
        onChange(v === 'yes' ? true : v === 'no' ? false : null)
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className="mx-auto h-9 w-[96px] rounded-none border-stone-500 bg-stone-50"
        aria-label="Yes, No, or N/A"
      >
        <SelectValue placeholder="N/A" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">Yes</SelectItem>
        <SelectItem value="no">No</SelectItem>
        <SelectItem value="na">N/A</SelectItem>
      </SelectContent>
    </Select>
  )
}

function EvaluationTable({
  title,
  rows = [],
  values = {},
  onChangeItem,
  extraRows,
}: {
  title: string
  rows?: Array<{ key: string; label: string }>
  values?: Record<string, EvaluationItem>
  onChangeItem?: (key: string, patch: Partial<EvaluationItem>) => void
  extraRows?: Array<{
    key: string
    label: string
    item: EvaluationItem
    onChange: (patch: Partial<EvaluationItem>) => void
    remarkPlaceholder?: string
    /** Force-disable remark input */
    remarkDisabled?: boolean
  }>
}) {
  return (
    <div className={cn(limsPanelClass, 'overflow-hidden')}>
      <p className="border-b border-stone-700 bg-stone-800 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
        {title}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
              Description
            </th>
            <th className="w-28 border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
              Yes / No / N/A
            </th>
            <th className="min-w-[120px] border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
              Remark
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = values[row.key] ?? {
              ok: true as const,
              remark: remarkForEvaluationOk(true),
            }
            return (
              <tr key={row.key}>
                <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5 text-[12px] text-stone-800">
                  {row.label}
                </td>
                <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5 text-center">
                  <YesNoSelect
                    id={`eval-${row.key}`}
                    value={item.ok}
                    onChange={(ok) => {
                      const patch: Partial<EvaluationItem> = { ok }
                      if (isEvaluationDefaultRemark(item.remark)) {
                        patch.remark = remarkForEvaluationOk(ok)
                      }
                      onChangeItem?.(row.key, patch)
                    }}
                  />
                </td>
                <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5">
                  <Input
                    className="h-9"
                    value={item.remark}
                    onChange={(e) => onChangeItem?.(row.key, { remark: e.target.value })}
                    placeholder={remarkForEvaluationOk(item.ok)}
                    aria-label={`${row.label} remark`}
                  />
                </td>
              </tr>
            )
          })}
          {(extraRows ?? []).map((row) => (
            <tr key={row.key}>
              <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5 text-[12px] text-stone-800">
                {row.label}
              </td>
              <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5 text-center">
                <YesNoSelect
                  id={`eval-${row.key}`}
                  value={row.item.ok}
                  onChange={(ok) => {
                    const patch: Partial<EvaluationItem> = { ok }
                    if (isEvaluationDefaultRemark(row.item.remark)) {
                      patch.remark = remarkForEvaluationOk(ok)
                    }
                    row.onChange(patch)
                  }}
                />
              </td>
              <td className="border border-[#e7e0d4] bg-[#fffcf7] px-2 py-1.5">
                <Input
                  className="h-9"
                  value={row.item.remark}
                  onChange={(e) => row.onChange({ remark: e.target.value })}
                  placeholder={row.remarkPlaceholder ?? remarkForEvaluationOk(row.item.ok)}
                  disabled={row.remarkDisabled || row.item.ok !== true}
                  aria-label={`${row.label} remark`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ServiceRequestFormView({
  form,
  onChange,
  clientOptions,
  clientContactById,
  canSave,
  saveLoading,
  onSave,
  srfLocked = false,
  onCustomerDocumentSelect,
  customerDocumentFileName,
}: {
  form: ServiceRequestForm
  onChange: (next: ServiceRequestForm) => void
  clientOptions: FilterComboboxOption[]
  /** Contact person + phone/email from Client Master (auto-filled on select). */
  clientContactById?: Record<string, { contactPerson: string; contactNumberMail: string }>
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  srfLocked?: boolean
  onCustomerDocumentSelect?: (file: File | null) => void
  customerDocumentFileName?: string
}) {
  const [clientQuery, setClientQuery] = useState(form.clientName)
  const [clientOpen, setClientOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('request')

  useEffect(() => {
    setClientQuery(form.clientName)
  }, [form.clientId, form.clientName])

  // Upgrade legacy unset Capability/Resources rows (null + blank) to Yes / OK once.
  useEffect(() => {
    const upgradeMap = <T extends CapabilityEvaluation | ResourceEvaluation>(
      map: T,
      keys: Array<{ key: string }>,
    ): T | null => {
      let changed = false
      const next = { ...map }
      for (const { key } of keys) {
        const k = key as keyof T
        const item = next[k] as EvaluationItem | undefined
        if (item && item.ok === null && isEvaluationDefaultRemark(item.remark)) {
          ;(next as Record<string, EvaluationItem>)[key] = {
            ok: true,
            remark: EVALUATION_DEFAULT_REMARKS.yes,
          }
          changed = true
        }
      }
      return changed ? next : null
    }

    const nextCap = upgradeMap(form.capabilityEvaluation, CAPABILITY_EVALUATION_ROWS)
    const nextRes = upgradeMap(form.resourceEvaluation, RESOURCE_EVALUATION_ROWS)
    if (!nextCap && !nextRes) return
    onChange({
      ...form,
      ...(nextCap ? { capabilityEvaluation: nextCap } : {}),
      ...(nextRes ? { resourceEvaluation: nextRes } : {}),
    })
    // Mount / form-open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = <K extends keyof ServiceRequestForm>(key: K, value: ServiceRequestForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  const selectedClientLabel = useMemo(() => {
    const match = clientOptions.find((c) => c.id === form.clientId)
    return match?.label ?? form.clientName
  }, [clientOptions, form.clientId, form.clientName])

  const reviewDoneCount = useMemo(() => {
    const capDone = CAPABILITY_EVALUATION_ROWS.filter(
      (r) => form.capabilityEvaluation[r.key]?.ok != null,
    ).length
    const resDone = RESOURCE_EVALUATION_ROWS.filter(
      (r) => form.resourceEvaluation[r.key]?.ok != null,
    ).length
    return capDone + resDone + (form.termsAccepted ? 1 : 0)
  }, [form.capabilityEvaluation, form.resourceEvaluation, form.termsAccepted])

  const patchCapability = (key: CapabilityEvaluationKey, patch: Partial<EvaluationItem>) => {
    set('capabilityEvaluation', {
      ...form.capabilityEvaluation,
      [key]: { ...form.capabilityEvaluation[key], ...patch },
    })
  }

  const patchResource = (key: ResourceEvaluationKey, patch: Partial<EvaluationItem>) => {
    set('resourceEvaluation', {
      ...form.resourceEvaluation,
      [key]: { ...form.resourceEvaluation[key], ...patch },
    })
  }

  const nextTab = nextFormTab(activeTab)
  const isLastTab = activeTab === 'review'

  return (
    <div className={clientRegistryFormClass}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 flex h-auto w-full items-stretch gap-1 overflow-hidden rounded-none border-2 border-stone-500 bg-stone-100 p-1">
          <TabsTrigger value="request" className={formTabTriggerClass}>
            Request Details
          </TabsTrigger>
          <TabsTrigger value="evaluation" className={formTabTriggerClass}>
            Evaluation
          </TabsTrigger>
          <TabsTrigger value="customer-communication" className={formTabTriggerClass}>
            Customer Communication
          </TabsTrigger>
          <TabsTrigger value="review" className={formTabTriggerClass}>
            Review of Request
            {reviewDoneCount > 0 ? (
              <span className="ml-1 rounded-none bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 group-data-[state=active]:bg-amber-500/25 group-data-[state=active]:text-amber-200">
                {reviewDoneCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="mt-0 space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-12 gap-x-4 gap-y-2 md:gap-x-5">
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-number">SRF Number *</Label>
              <Input
                id="srf-number"
                value={form.srfNumber}
                onChange={(e) => set('srfNumber', e.target.value.toUpperCase())}
                readOnly={srfLocked}
                className={srfLocked ? 'bg-stone-100 text-stone-700' : undefined}
                placeholder="SRF-2026-0001"
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-date">SRF Date *</Label>
              <Input
                id="srf-date"
                type="date"
                value={form.srfDate}
                onChange={(e) => {
                  const nextSrf = e.target.value
                  const prevDefault = defaultDueDateFromSrf(form.srfDate)
                  const nextDefault = defaultDueDateFromSrf(nextSrf)
                  onChange({
                    ...form,
                    srfDate: nextSrf,
                    customerRequiredDate:
                      !form.customerRequiredDate ||
                      form.customerRequiredDate === prevDefault
                        ? nextDefault
                        : form.customerRequiredDate,
                    requiredCompletionDate:
                      !form.requiredCompletionDate ||
                      form.requiredCompletionDate === prevDefault
                        ? nextDefault
                        : form.requiredCompletionDate,
                  })
                }}
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-customer-ref">Customer Reference No</Label>
              <Input
                id="srf-customer-ref"
                value={form.customerReferenceNo}
                onChange={(e) => set('customerReferenceNo', e.target.value)}
                placeholder="PO / Enquiry / Ref. No."
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-customer-ref-date">Customer Reference Date</Label>
              <Input
                id="srf-customer-ref-date"
                type="date"
                value={form.customerReferenceDate}
                onChange={(e) => set('customerReferenceDate', e.target.value)}
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-6">
              <Label>Client *</Label>
              <FilterCombobox
                value={clientOpen ? clientQuery : selectedClientLabel}
                onValueChange={(v) => {
                  setClientQuery(v)
                  if (!clientOpen) setClientOpen(true)
                }}
                options={clientOptions}
                onSelectOption={(opt) => {
                  const contact = clientContactById?.[opt.id]
                  onChange({
                    ...form,
                    clientId: opt.id,
                    clientName: opt.label,
                    contactPerson: contact?.contactPerson ?? '',
                    contactNumberMail: contact?.contactNumberMail ?? '',
                  })
                  setClientQuery(opt.label)
                  setClientOpen(false)
                }}
                open={clientOpen}
                onOpenChange={(open) => {
                  setClientOpen(open)
                  if (open) setClientQuery(selectedClientLabel)
                }}
                placeholder="Search & Select Client"
                listId="srf-client-list"
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-customer-due">Customer Required Date</Label>
              <Input
                id="srf-customer-due"
                type="date"
                value={form.customerRequiredDate}
                onChange={(e) => set('customerRequiredDate', e.target.value)}
              />
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-3">
              <Label htmlFor="srf-due">Expected Date of Completion</Label>
              <Input
                id="srf-due"
                type="date"
                value={form.requiredCompletionDate}
                onChange={(e) => set('requiredCompletionDate', e.target.value)}
              />
            </div>
            <div className="col-span-12">
              <CalibrationEquipmentSelectButton
                value={form.equipmentDescription}
                onApply={({ description, quantity, methodNotes }) =>
                  onChange({
                    ...form,
                    equipmentDescription: description,
                    quantity,
                    methodNotes,
                  })
                }
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evaluation" className="mt-0 space-y-5 focus-visible:outline-none">
          <div className={cn(limsPanelClass, 'space-y-3 p-3 sm:p-4')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-700">
                  Statement of Conformity Required
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  If Yes, decision rule will apply (Error + MU ≤ Tolerance / Accuracy, or customer
                  rule).
                </p>
              </div>
              <Select
                value={form.statementOfConformityRequested ? 'yes' : 'no'}
                onValueChange={(v) => set('statementOfConformityRequested', v === 'yes')}
              >
                <SelectTrigger
                  className="h-10 w-28 rounded-none border-stone-500 bg-stone-50"
                  aria-label="Statement of conformity"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.statementOfConformityRequested ? (
              <div className="grid grid-cols-12 gap-4 border-t border-stone-300 pt-3 md:gap-6">
                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="srf-spec">Specification / Standard</Label>
                  <Input
                    id="srf-spec"
                    value={form.specificationStandard}
                    onChange={(e) => set('specificationStandard', e.target.value)}
                    placeholder="e.g. IS / manufacturer tolerance"
                  />
                </div>
                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="srf-rule">Decision Rule (agreed with customer)</Label>
                  <Input
                    id="srf-rule"
                    value={form.decisionRule}
                    onChange={(e) => set('decisionRule', e.target.value)}
                    placeholder="How uncertainty is accounted for"
                  />
                </div>
              </div>
            ) : null}
          </div>
          <EvaluationTable
            title="Capability"
            rows={CAPABILITY_EVALUATION_ROWS}
            values={form.capabilityEvaluation}
            onChangeItem={(key, patch) =>
              patchCapability(key as CapabilityEvaluationKey, patch)
            }
          />
          <EvaluationTable
            title="Resources"
            rows={RESOURCE_EVALUATION_ROWS}
            values={form.resourceEvaluation}
            onChangeItem={(key, patch) => patchResource(key as ResourceEvaluationKey, patch)}
          />
          <EvaluationTable
            title="ISO 17025 Checks"
            extraRows={[
              {
                key: 'req_defined',
                label: 'Requirements are clear and understood',
                item: { ok: form.reqDefinedUnderstood, remark: '' },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  set('reqDefinedUnderstood', patch.ok)
                },
              },
              {
                key: 'methods_selected',
                label: 'Appropriate methods / procedures are selected',
                item: { ok: form.methodsSelectedOk, remark: form.methodNotes },
                remarkPlaceholder: 'Method / procedure notes',
                onChange: (patch) => {
                  onChange({
                    ...form,
                    ...(patch.ok !== undefined
                      ? {
                          methodsSelectedOk: patch.ok,
                          ...(patch.ok === true
                            ? { methodOutdatedCustomerInformed: null }
                            : {}),
                        }
                      : {}),
                    ...(patch.remark !== undefined ? { methodNotes: patch.remark } : {}),
                  })
                },
              },
              {
                key: 'external_provider',
                label: 'External provider is used',
                item: {
                  ok: form.externalProviderUsed,
                  remark: form.externalProviderDetails,
                },
                remarkPlaceholder: 'Provider name / activities',
                onChange: (patch) => {
                  onChange({
                    ...form,
                    ...(patch.ok !== undefined
                      ? {
                          externalProviderUsed: patch.ok,
                          ...(patch.ok === true
                            ? {}
                            : {
                                externalProviderCustomerApproved: null,
                                externalProviderDetails: '',
                              }),
                        }
                      : {}),
                    ...(patch.remark !== undefined
                      ? { externalProviderDetails: patch.remark }
                      : {}),
                  })
                },
              },
              {
                key: 'differences_resolved',
                label: 'Differences resolved and contract accepted by both parties',
                item: { ok: form.differencesResolved, remark: '' },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  onChange({
                    ...form,
                    differencesResolved: patch.ok,
                    contractAccepted: patch.ok === true,
                  })
                },
              },
            ]}
          />
        </TabsContent>

        <TabsContent
          value="customer-communication"
          className="mt-0 space-y-4 focus-visible:outline-none"
        >
          <EvaluationTable
            title="Customer Communication"
            extraRows={[
              {
                key: 'capability_resources_ok',
                label: 'Lab has the capability and resources',
                item: { ok: form.capabilityResourcesOk, remark: '' },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  set('capabilityResourcesOk', patch.ok)
                },
              },
              {
                key: 'method_outdated',
                label: 'Customer informed if method is inappropriate or outdated',
                item: {
                  ok: form.methodOutdatedCustomerInformed,
                  remark: '',
                },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  set('methodOutdatedCustomerInformed', patch.ok)
                },
              },
              {
                key: 'external_provider_approved',
                label: 'Customer approval obtained for external provider',
                item: {
                  ok: form.externalProviderCustomerApproved,
                  remark: '',
                },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  set('externalProviderCustomerApproved', patch.ok)
                },
              },
              {
                key: 'deviations_informed',
                label: 'Customer informed of any contract deviations',
                item: { ok: form.deviationsCustomerInformed, remark: '' },
                remarkDisabled: true,
                onChange: (patch) => {
                  if (patch.ok === undefined) return
                  set('deviationsCustomerInformed', patch.ok)
                },
              },
              {
                key: 'witness_lab_activities',
                label: 'Customer Representative wants to witness lab activities?',
                item: {
                  ok: form.witnessRequired,
                  remark: form.witnessActivity,
                },
                remarkPlaceholder: 'If Yes, specify activity',
                onChange: (patch) => {
                  onChange({
                    ...form,
                    ...(patch.ok !== undefined
                      ? {
                          witnessRequired: patch.ok === true,
                          witnessActivity: patch.ok === true ? form.witnessActivity : '',
                        }
                      : {}),
                    ...(patch.remark !== undefined
                      ? { witnessActivity: patch.remark }
                      : {}),
                  })
                },
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-0 space-y-5 focus-visible:outline-none">
          <div className="space-y-3">
            <div className="grid grid-cols-12 items-start gap-x-4 gap-y-2">
              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="srf-customer-doc">Customer Document</Label>
                <Input
                  id="srf-customer-doc"
                  type="file"
                  className="h-10 max-w-full w-full cursor-pointer rounded-none border-stone-500 bg-stone-50 file:mr-3 file:h-full file:cursor-pointer file:rounded-none file:border-0 file:bg-stone-800 file:px-3 file:text-[11px] file:font-semibold file:uppercase file:tracking-wide file:text-amber-100"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    onCustomerDocumentSelect?.(f)
                  }}
                />
                {(customerDocumentFileName || form.customerDocumentName) && (
                  <p
                    className="truncate text-xs text-stone-500"
                    title={customerDocumentFileName || form.customerDocumentName}
                  >
                    {customerDocumentFileName || form.customerDocumentName}
                  </p>
                )}
              </div>
              <div className="col-span-12 space-y-2 md:col-span-2">
                <Label htmlFor="srf-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => set('status', v as ServiceRequestStatus)}
                >
                  <SelectTrigger
                    id="srf-status"
                    className="h-10 rounded-none border-stone-500 bg-stone-50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_REQUEST_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="srf-special">Instruction By Customer</Label>
                <Textarea
                  id="srf-special"
                  rows={1}
                  value={form.specialInstruction}
                  onChange={(e) => set('specialInstruction', e.target.value)}
                  className="!min-h-10 h-10 resize-none py-2"
                />
              </div>
              <div className="col-span-12 space-y-2 md:col-span-4">
                <Label htmlFor="srf-remarks">Review Remarks</Label>
                <Textarea
                  id="srf-remarks"
                  rows={1}
                  value={form.reviewRemarks}
                  onChange={(e) => set('reviewRemarks', e.target.value)}
                  className="!min-h-10 h-10 resize-none py-2"
                />
              </div>
            </div>
          </div>

          <div className={cn(limsPanelClass, 'space-y-3 p-3 sm:p-4')}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-700">
              Terms &amp; Conditions
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-stone-600">
              {QI_TERMS_AND_CONDITIONS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <label className="flex cursor-pointer items-start gap-2 pt-1">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-700"
                checked={form.termsAccepted}
                onChange={(e) => set('termsAccepted', e.target.checked)}
              />
              <span className="text-[12px] text-stone-700">
                I acknowledge the Terms &amp; Conditions above
              </span>
            </label>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-stone-300 pt-4">
        {!isLastTab ? (
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => {
              if (nextTab) setActiveTab(nextTab)
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={onSave}
            disabled={!canSave || saveLoading}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        )}
      </div>
    </div>
  )
}
