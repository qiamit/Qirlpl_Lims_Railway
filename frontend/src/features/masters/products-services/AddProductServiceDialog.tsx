import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductsServicesForm } from './ProductsServicesForm'
import {
  emptyProductServiceForm,
  isValidNumberOrEmpty,
  nextItemCode,
  normalizeText,
  parseMoney,
  type ItemType,
  type ProductServiceForm,
  type ProductServiceRow,
} from './types'

export type SavedProductService = {
  id: string
  itemName: string
  hsnCode: string
  unit: string
  salePrice: number
}

export function AddProductServiceDialog({
  open,
  onOpenChange,
  onSaved,
  initialItemName,
  nested = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (item: SavedProductService) => void
  initialItemName?: string
  nested?: boolean
}) {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [form, setForm] = useState<ProductServiceForm>(() => emptyProductServiceForm('Service'))
  const [existingCodes, setExistingCodes] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('products_services_master').select('item_code, item_type')
      if (cancelled) return
      const rows = (Array.isArray(data) ? data : []) as Array<{ item_code?: string; item_type?: string }>
      setExistingCodes(rows.map((r) => String(r.item_code ?? '').trim()).filter(Boolean))
      const serviceCodes = rows
        .filter((r) => r.item_type === 'Service')
        .map((r) => String(r.item_code ?? '').trim())
      const startType: ItemType = 'Service'
      setForm({
        ...emptyProductServiceForm(startType),
        itemCode: nextItemCode(startType, serviceCodes),
        itemName: initialItemName?.trim() ?? '',
      })
      setSaveMessage(null)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, initialItemName])

  const handleItemTypeChange = (itemType: ItemType) => {
    const codesForType = existingCodes.filter((c) =>
      itemType === 'Product' ? /^P-/i.test(c) : /^S-/i.test(c),
    )
    setForm((prev) => ({
      ...prev,
      itemType,
      itemCode: nextItemCode(itemType, codesForType),
      openingStock: itemType === 'Service' ? '0' : prev.openingStock,
      lowStockAlert: itemType === 'Service' ? '0' : prev.lowStockAlert,
    }))
  }

  const canSave =
    normalizeText(form.itemName).length > 0 &&
    normalizeText(form.itemCode).length > 0 &&
    isValidNumberOrEmpty(form.salePrice) &&
    isValidNumberOrEmpty(form.purchasePrice) &&
    isValidNumberOrEmpty(form.gstPercent) &&
    isValidNumberOrEmpty(form.discount) &&
    isValidNumberOrEmpty(form.openingStock) &&
    isValidNumberOrEmpty(form.lowStockAlert) &&
    !saveLoading

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const isProduct = form.itemType === 'Product'
      const payload = {
        item_type: form.itemType,
        item_code: normalizeText(form.itemCode).toUpperCase(),
        item_category: form.itemCategory,
        item_name: normalizeText(form.itemName),
        item_description: normalizeText(form.itemDescription) || null,
        hsn_code: normalizeText(form.hsnCode) || null,
        sale_price: parseMoney(form.salePrice),
        purchase_price: parseMoney(form.purchasePrice),
        gst_percent: parseMoney(form.gstPercent),
        discount: parseMoney(form.discount),
        unit_of_measurement: normalizeText(form.unitOfMeasurement) || null,
        opening_stock: isProduct ? parseMoney(form.openingStock) : 0,
        low_stock_alert: isProduct ? parseMoney(form.lowStockAlert) : 0,
      }
      const { data, error } = await supabase
        .from('products_services_master')
        .insert(payload)
        .select('id, item_name, hsn_code, unit_of_measurement, sale_price')
        .single()
      if (error) throw error
      const row = data as ProductServiceRow | null
      if (!row?.id) throw new Error('Save succeeded but no id returned')
      onSaved({
        id: row.id,
        itemName: String(row.item_name ?? payload.item_name).trim(),
        hsnCode: String(row.hsn_code ?? '').trim(),
        unit: String(row.unit_of_measurement ?? '').trim(),
        salePrice: Number(row.sale_price ?? payload.sale_price) || 0,
      })
      onOpenChange(false)
      setForm(emptyProductServiceForm('Service'))
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save product / service')
    } finally {
      setSaveLoading(false)
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[min(920px,92vw)] max-w-4xl overflow-y-auto"
        aria-describedby={undefined}
        layer={nested ? 'nested' : 'default'}
        persistOnFocusLoss
      >
        <DialogHeader>
          <DialogTitle>Add New Product / Service</DialogTitle>
        </DialogHeader>
        {saveMessage ? <p className="text-sm text-destructive">{saveMessage}</p> : null}
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <ProductsServicesForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={() => void handleSave()}
            onItemTypeChange={handleItemTypeChange}
            codeLocked
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            {saveLoading ? 'Saving…' : 'Save Product / Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
