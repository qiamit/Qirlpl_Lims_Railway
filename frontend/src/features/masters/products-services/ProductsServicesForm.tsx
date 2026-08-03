import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import {
  ITEM_CATEGORIES,
  ITEM_TYPES,
  isProductStockFieldVisible,
  isValidNumberOrEmpty,
  type ItemCategory,
  type ItemType,
  type ProductServiceForm,
} from './types'

/** Official GST portal — Search HSN / SAC codes (pre-login available). */
const HSN_SAC_FINDER_URL = 'https://services.gst.gov.in/services/searchhsnsac'

export function ProductsServicesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onItemTypeChange,
  codeLocked,
}: {
  form: ProductServiceForm
  onChange: (next: ProductServiceForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  /** When item type changes, parent regenerates item code (P-#### / S-####). */
  onItemTypeChange: (itemType: ItemType) => void
  /** Auto code is read-only on create; editable only if parent allows. */
  codeLocked?: boolean
}) {
  const showStock = isProductStockFieldVisible(form.itemType)
  const priceError =
    !isValidNumberOrEmpty(form.salePrice) ||
    !isValidNumberOrEmpty(form.purchasePrice) ||
    !isValidNumberOrEmpty(form.gstPercent) ||
    !isValidNumberOrEmpty(form.discount) ||
    (showStock &&
      (!isValidNumberOrEmpty(form.openingStock) || !isValidNumberOrEmpty(form.lowStockAlert)))

  const set = <K extends keyof ProductServiceForm>(key: K, value: ProductServiceForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className={labRegistryFormClass}>
      <div className="space-y-6">
        {priceError ? (
          <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Price, GST, discount and stock values must be valid numbers.
          </p>
        ) : null}

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="ps-item-type">Item (Product / Service) *</Label>
            <Select
              value={form.itemType}
              onValueChange={(v) => onItemTypeChange(v as ItemType)}
            >
              <SelectTrigger id="ps-item-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="ps-item-code">Item Code *</Label>
            <Input
              id="ps-item-code"
              value={form.itemCode}
              onChange={(e) => set('itemCode', e.target.value.toUpperCase())}
              placeholder={form.itemType === 'Product' ? 'P-0001' : 'S-0001'}
              readOnly={codeLocked}
              className={codeLocked ? 'bg-slate-50 text-slate-700' : undefined}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="ps-item-category">Item Category *</Label>
            <Select
              value={form.itemCategory}
              onValueChange={(v) => set('itemCategory', v as ItemCategory)}
            >
              <SelectTrigger id="ps-item-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 space-y-2 md:col-span-8">
            <Label htmlFor="ps-item-name">Item Name *</Label>
            <Input
              id="ps-item-name"
              value={form.itemName}
              onChange={(e) => set('itemName', e.target.value)}
              placeholder="Enter item name"
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="ps-hsn">Item HSN Code</Label>
              <a
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                href={HSN_SAC_FINDER_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Open HSN Code Finder on GST portal"
              >
                HSN Code Finder
                <ExternalLink size={12} />
              </a>
            </div>
            <Input
              id="ps-hsn"
              value={form.hsnCode}
              onChange={(e) => set('hsnCode', e.target.value)}
              placeholder={
                form.itemType === 'Service' ? 'SAC code (e.g. 9983)' : 'HSN code (e.g. 9031)'
              }
            />
          </div>

          <div className="col-span-12 space-y-2">
            <Label htmlFor="ps-desc">Item Description</Label>
            <Textarea
              id="ps-desc"
              value={form.itemDescription}
              onChange={(e) => set('itemDescription', e.target.value)}
              placeholder="Short description"
              rows={3}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label htmlFor="ps-sale">Sale Price</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
                aria-hidden
              >
                ₹
              </span>
              <Input
                id="ps-sale"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={form.salePrice}
                onChange={(e) => set('salePrice', e.target.value)}
                placeholder="0.00"
                className="pl-7"
                aria-label="Sale Price in INR"
              />
            </div>
          </div>
          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label htmlFor="ps-purchase">Purchase Price</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
                aria-hidden
              >
                ₹
              </span>
              <Input
                id="ps-purchase"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={form.purchasePrice}
                onChange={(e) => set('purchasePrice', e.target.value)}
                placeholder="0.00"
                className="pl-7"
                aria-label="Purchase Price in INR"
              />
            </div>
          </div>
          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label htmlFor="ps-gst">GST %</Label>
            <Input
              id="ps-gst"
              type="number"
              inputMode="decimal"
              step="any"
              value={form.gstPercent}
              onChange={(e) => set('gstPercent', e.target.value)}
              placeholder="18"
            />
          </div>
          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label htmlFor="ps-discount">Discount</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
                aria-hidden
              >
                ₹
              </span>
              <Input
                id="ps-discount"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={form.discount}
                onChange={(e) => set('discount', e.target.value)}
                placeholder="0.00"
                className="pl-7"
                aria-label="Discount in INR"
              />
            </div>
          </div>

          <div className="col-span-12 md:col-span-4">
            <MeasurementUnitSelect
              id="ps-uom"
              label="Unit of Measurement"
              value={form.unitOfMeasurement}
              onChange={(unitOfMeasurement) => set('unitOfMeasurement', unitOfMeasurement)}
              placeholder="Select or add unit"
            />
          </div>

          {showStock ? (
            <>
              <div className="col-span-12 space-y-2 md:col-span-4">
                <Label htmlFor="ps-opening-stock">Opening Stock</Label>
                <Input
                  id="ps-opening-stock"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form.openingStock}
                  onChange={(e) => set('openingStock', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="col-span-12 space-y-2 md:col-span-4">
                <Label htmlFor="ps-low-stock">Low Stock Alert</Label>
                <Input
                  id="ps-low-stock"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form.lowStockAlert}
                  onChange={(e) => set('lowStockAlert', e.target.value)}
                  placeholder="0"
                />
              </div>
            </>
          ) : (
            <div className="col-span-12 rounded-md border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-[12px] text-slate-500 md:col-span-8">
              Opening Stock and Low Stock Alert apply only to <strong>Product</strong> items.
              Switch Item to Product to manage stock.
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          type="button"
          className="bg-teal-600 text-white hover:bg-teal-500"
          onClick={onSave}
          disabled={!canSave || saveLoading || priceError}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
