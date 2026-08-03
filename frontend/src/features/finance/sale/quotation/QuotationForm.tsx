import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  AddProductServiceDialog,
  type SavedProductService,
} from '@/features/masters/products-services/AddProductServiceDialog'
import {
  QUOTATION_STATUSES,
  computeQuotationTotals,
  emptyQuotationLine,
  formatMoney,
  lineAmount,
  type QuotationForm as QuotationFormType,
  type QuotationLineForm,
} from './types'

export type QuotationClientContact = {
  contactPerson: string
  contactEmail: string
  contactMobile: string
}

export type QuotationProductDetails = {
  itemName: string
  hsnCode: string
  unit: string
  salePrice: number
}

export function QuotationFormView({
  form,
  onChange,
  clientOptions,
  clientContactById,
  productOptions,
  productById,
  onReloadProducts,
  canSave,
  saveLoading,
  onSave,
}: {
  form: QuotationFormType
  onChange: (next: QuotationFormType) => void
  clientOptions: FilterComboboxOption[]
  clientContactById: Record<string, QuotationClientContact>
  productOptions: FilterComboboxOption[]
  productById: Record<string, QuotationProductDetails>
  onReloadProducts: () => void | Promise<void>
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const [clientQuery, setClientQuery] = useState(form.clientName)
  const [clientOpen, setClientOpen] = useState(false)
  const [descOpenByKey, setDescOpenByKey] = useState<Record<string, boolean>>({})
  const [descQueryByKey, setDescQueryByKey] = useState<Record<string, string>>({})
  const [addProductLineKey, setAddProductLineKey] = useState<string | null>(null)
  const [addProductInitialName, setAddProductInitialName] = useState('')
  const totals = computeQuotationTotals(form)

  useEffect(() => {
    setClientQuery(form.clientName)
  }, [form.clientId, form.clientName])

  const set = <K extends keyof QuotationFormType>(key: K, value: QuotationFormType[K]) => {
    onChange({ ...form, [key]: value })
  }

  const patchLine = (key: string, patch: Partial<QuotationLineForm>) => {
    onChange({
      ...form,
      lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    })
  }

  const applyProductToLine = (lineKey: string, product: QuotationProductDetails | SavedProductService) => {
    const itemName = 'itemName' in product ? product.itemName : ''
    const hsnCode = 'hsnCode' in product ? product.hsnCode : ''
    const unit = 'unit' in product ? product.unit : ''
    const salePrice = 'salePrice' in product ? product.salePrice : 0
    patchLine(lineKey, {
      description: itemName.trim() || form.lines.find((l) => l.key === lineKey)?.description || '',
      hsnSac: hsnCode.trim(),
      unit: unit.trim() || form.lines.find((l) => l.key === lineKey)?.unit || 'Nos',
      rate: String(Number.isFinite(salePrice) ? salePrice : 0),
    })
    setDescQueryByKey((prev) => ({ ...prev, [lineKey]: itemName.trim() }))
    setDescOpenByKey((prev) => ({ ...prev, [lineKey]: false }))
  }

  const addLine = () => {
    onChange({ ...form, lines: [...form.lines, emptyQuotationLine()] })
  }

  const removeLine = (key: string) => {
    if (form.lines.length <= 1) return
    onChange({ ...form, lines: form.lines.filter((l) => l.key !== key) })
  }

  const applyClientSelection = (clientId: string, clientName: string) => {
    const contact = clientId ? clientContactById[clientId] : undefined
    onChange({
      ...form,
      clientId,
      clientName,
      contactPerson: contact?.contactPerson ?? '',
      contactEmail: contact?.contactEmail ?? '',
      contactMobile: contact?.contactMobile ?? '',
    })
  }

  const clearClientSelection = () => {
    onChange({
      ...form,
      clientId: '',
      clientName: '',
      contactPerson: '',
      contactEmail: '',
      contactMobile: '',
    })
  }

  const selectedClientLabel =
    clientOptions.find((o) => o.id === form.clientId)?.label ?? form.clientName

  const filteredProductsByQuery = useMemo(() => {
    const map: Record<string, FilterComboboxOption[]> = {}
    for (const line of form.lines) {
      const open = Boolean(descOpenByKey[line.key])
      const q = (open ? (descQueryByKey[line.key] ?? line.description) : line.description)
        .trim()
        .toLowerCase()
      map[line.key] = !q
        ? productOptions
        : productOptions.filter((opt) => {
            const details = productById[opt.id]
            const hay = [opt.label, details?.itemName, details?.hsnCode]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            return hay.includes(q)
          })
    }
    return map
  }, [form.lines, descOpenByKey, descQueryByKey, productOptions, productById])

  return (
    <div className={labRegistryFormClass}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,260px)] sm:items-start sm:gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Client</Label>
            <FilterCombobox
              value={clientOpen ? clientQuery : selectedClientLabel}
              onValueChange={(v) => {
                setClientQuery(v)
                if (!clientOpen) setClientOpen(true)
                if (!v.trim()) {
                  clearClientSelection()
                  return
                }
                const match = clientOptions.find((opt) => opt.label === v)
                if (match) applyClientSelection(match.id, match.label)
              }}
              options={clientOptions}
              onSelectOption={(opt) => {
                applyClientSelection(opt.id, opt.label)
                setClientQuery(opt.label)
                setClientOpen(false)
              }}
              open={clientOpen}
              onOpenChange={(open) => {
                setClientOpen(open)
                if (open) setClientQuery(selectedClientLabel)
              }}
              placeholder="Select client"
              listId="quotation-client-combobox"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qtn-contact">Contact Person</Label>
            <Input
              id="qtn-contact"
              value={form.contactPerson}
              onChange={(e) => set('contactPerson', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qtn-email">Contact Email</Label>
            <Input
              id="qtn-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="qtn-mobile">Contact Mobile</Label>
            <Input
              id="qtn-mobile"
              value={form.contactMobile}
              onChange={(e) => set('contactMobile', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="qtn-number">Quotation Number</Label>
            <Input
              id="qtn-number"
              value={form.quotationNumber}
              readOnly
              className="bg-slate-50"
              aria-label="Quotation number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qtn-date">Quotation Date</Label>
            <Input
              id="qtn-date"
              type="date"
              value={form.quotationDate}
              onChange={(e) => set('quotationDate', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qtn-valid">Valid Until</Label>
            <Input
              id="qtn-valid"
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => set('status', v as QuotationFormType['status'])}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUOTATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Line Items</h3>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-[780px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-border px-2 py-2 text-left text-xs">Description</th>
                <th className="border border-border px-2 py-2 text-center text-xs">HSN/SAC</th>
                <th className="border border-border px-2 py-2 text-center text-xs">Qty</th>
                <th className="border border-border px-2 py-2 text-center text-xs">Unit</th>
                <th className="border border-border px-2 py-2 text-center text-xs">Rate</th>
                <th className="border border-border px-2 py-2 text-center text-xs">Amount</th>
                <th className="border border-border px-2 py-2 text-center text-xs">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, index) => {
                const isLast = index === form.lines.length - 1
                const descOpen = Boolean(descOpenByKey[line.key])
                const descValue = descOpen
                  ? (descQueryByKey[line.key] ?? line.description)
                  : line.description
                return (
                  <tr key={line.key}>
                    <td className="border border-border p-1.5 min-w-[220px]">
                      <FilterCombobox
                        value={descValue}
                        onValueChange={(v) => {
                          setDescQueryByKey((prev) => ({ ...prev, [line.key]: v }))
                          setDescOpenByKey((prev) => ({ ...prev, [line.key]: true }))
                          patchLine(line.key, { description: v })
                        }}
                        options={filteredProductsByQuery[line.key] ?? productOptions}
                        onSelectOption={(opt) => {
                          const details = productById[opt.id]
                          if (details) applyProductToLine(line.key, details)
                          else patchLine(line.key, { description: opt.label })
                        }}
                        open={descOpen}
                        onOpenChange={(open) => {
                          setDescOpenByKey((prev) => ({ ...prev, [line.key]: open }))
                          if (open) {
                            setDescQueryByKey((prev) => ({
                              ...prev,
                              [line.key]: prev[line.key] ?? line.description,
                            }))
                          }
                        }}
                        placeholder="Item / service description"
                        listId={`quotation-line-desc-${line.key}`}
                        extraActions={[
                          {
                            key: 'add-product',
                            label: 'Add New Product / Service',
                            onSelect: () => {
                              setAddProductLineKey(line.key)
                              setAddProductInitialName(
                                (descQueryByKey[line.key] ?? line.description).trim(),
                              )
                            },
                          },
                        ]}
                      />
                    </td>
                    <td className="border border-border p-1.5">
                      <Input
                        className="text-center"
                        value={line.hsnSac}
                        onChange={(e) => patchLine(line.key, { hsnSac: e.target.value })}
                        aria-label="HSN SAC"
                      />
                    </td>
                    <td className="border border-border p-1.5">
                      <Input
                        className="text-center"
                        type="number"
                        min={0}
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                        aria-label="Quantity"
                      />
                    </td>
                    <td className="border border-border p-1.5">
                      <Input
                        className="text-center"
                        value={line.unit}
                        onChange={(e) => patchLine(line.key, { unit: e.target.value })}
                        aria-label="Unit"
                      />
                    </td>
                    <td className="border border-border p-1.5">
                      <Input
                        className="text-center"
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.rate}
                        onChange={(e) => patchLine(line.key, { rate: e.target.value })}
                        aria-label="Rate"
                      />
                    </td>
                    <td className="border border-border px-2 py-2 text-center tabular-nums">
                      ₹ {formatMoney(lineAmount(line))}
                    </td>
                    <td className="border border-border p-1.5 text-center">
                      {isLast ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                          onClick={addLine}
                          aria-label="Add line"
                        >
                          <Plus size={16} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => removeLine(line.key)}
                          aria-label="Remove line"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qtn-remarks">Remarks</Label>
            <Textarea
              id="qtn-remarks"
              rows={4}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qtn-terms">Payment Terms</Label>
            <Input
              id="qtn-terms"
              value={form.paymentTerms}
              onChange={(e) => set('paymentTerms', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qtn-disc">Discount %</Label>
              <Input
                id="qtn-disc"
                type="number"
                min={0}
                step="0.01"
                value={form.discountPercent}
                onChange={(e) => set('discountPercent', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qtn-gst">GST %</Label>
              <Input
                id="qtn-gst"
                type="number"
                min={0}
                step="0.01"
                value={form.gstPercent}
                onChange={(e) => set('gstPercent', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">₹ {formatMoney(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">₹ {formatMoney(totals.discountAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">₹ {formatMoney(totals.gstAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold">
              <span>Grand Total</span>
              <span className="tabular-nums text-teal-800">₹ {formatMoney(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
        <Button
          type="button"
          className="bg-teal-600 text-white hover:bg-teal-500"
          disabled={!canSave}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <AddProductServiceDialog
        open={addProductLineKey !== null}
        onOpenChange={(open) => {
          if (!open) setAddProductLineKey(null)
        }}
        nested
        initialItemName={addProductInitialName}
        onSaved={(item) => {
          const lineKey = addProductLineKey
          void onReloadProducts()
          if (lineKey) applyProductToLine(lineKey, item)
          setAddProductLineKey(null)
        }}
      />
    </div>
  )
}
