import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { isValidNumberOrEmpty, type ItemCategory, type ProductServiceForm } from './types'

export function ProductServicesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
  gstRates,
  units,
  gstRateDialogOpen,
  setGstRateDialogOpen,
  newGstRate,
  setNewGstRate,
  onAddGstRate,
  onDeleteGstRate,
  unitDialogOpen,
  setUnitDialogOpen,
  newUnit,
  setNewUnit,
  onAddUnit,
  onDeleteUnit,
  generateItemCode,
}: {
  form: ProductServiceForm
  onChange: (next: ProductServiceForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
  gstRates: Array<{ id: string; label: string }>
  units: Array<{ id: string; label: string }>
  gstRateDialogOpen: boolean
  setGstRateDialogOpen: (open: boolean) => void
  newGstRate: string
  setNewGstRate: (value: string) => void
  onAddGstRate: () => void
  onDeleteGstRate: (id: string) => void
  unitDialogOpen: boolean
  setUnitDialogOpen: (open: boolean) => void
  newUnit: string
  setNewUnit: (value: string) => void
  onAddUnit: () => void
  onDeleteUnit: (id: string) => void
  generateItemCode: (category: ItemCategory) => string
}) {
  const numberError = (label: string, v: string) => (isValidNumberOrEmpty(v) ? null : `${label} must be a number`)

  const isService = form.category === 'Service'

  const gstRateError = numberError('GST Rate', form.gstRate)
  const lowStockError = numberError('Low Stock Value', form.lowStockValue)
  const purchaseError = numberError('Purchase Price', form.purchasePrice)
  const saleError = numberError('Sale Price', form.salePrice)
  const mrpError = numberError('Maximum Retail Price', form.maximumRetailPrice)
  const openingError = numberError('Opening Stock', form.openingStock)

  const errors = [gstRateError, lowStockError, purchaseError, saleError, mrpError, openingError].filter(Boolean)

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((e) => (
              <p key={e} className="text-sm text-destructive">
                {e}
              </p>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Category of Item</Label>
            <Select
              value={form.category}
              onValueChange={(v) => {
                const nextCategory = v as ItemCategory
                const next = {
                  ...form,
                  category: nextCategory,
                  itemCode: generateItemCode(nextCategory),
                }

                if (nextCategory === 'Service') {
                  next.lowStockValue = ''
                  next.openingStock = ''
                  next.purchasePrice = ''
                }

                onChange(next)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Product">Product</SelectItem>
                <SelectItem value="Service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Item Code</Label>
            <Input value={form.itemCode} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Make</Label>
            <Input value={form.make} onChange={(e) => onChange({ ...form, make: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Serial No / Model No</Label>
            <Input value={form.serialModelNo} onChange={(e) => onChange({ ...form, serialModelNo: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Name of the Item</Label>
          <Input value={form.itemName} onChange={(e) => onChange({ ...form, itemName: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>Description of Item</Label>
          <Textarea value={form.itemDescription} onChange={(e) => onChange({ ...form, itemDescription: e.target.value })} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>HSN Code</Label>
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href="https://services.gst.gov.in/services/searchhsnsac" target="_blank" rel="noreferrer">
                  Find HSN
                  <ExternalLink size={14} />
                </a>
              </Button>
            </div>
            <Input value={form.hsnCode} onChange={(e) => onChange({ ...form, hsnCode: e.target.value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>GST rate in %</Label>
              <Dialog open={gstRateDialogOpen} onOpenChange={setGstRateDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus size={14} />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add GST Rate</DialogTitle>
                    <DialogDescription>Add a new GST rate option.</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <Label>Existing GST Rates</Label>
                    <div className="max-h-44 overflow-auto rounded-md border p-2">
                      {gstRates.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No options.</div>
                      ) : (
                        <div className="space-y-2">
                          {gstRates.map((o) => (
                            <div key={o.id} className="flex items-center justify-between gap-2">
                              <div className="text-sm">{o.label}</div>
                              <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteGstRate(o.id)}>
                                <Trash2 size={14} />
                                Delete
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>GST Rate (%)</Label>
                    <Input value={newGstRate} onChange={(e) => setNewGstRate(e.target.value)} placeholder="18" />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setGstRateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={onAddGstRate}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Select value={form.gstRate} onValueChange={(v) => onChange({ ...form, gstRate: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {gstRates.map((o) => (
                  <SelectItem key={o.id} value={o.label}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Unit of Item</Label>
              <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus size={14} />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Unit</DialogTitle>
                    <DialogDescription>Add a new unit option.</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <Label>Existing Units</Label>
                    <div className="max-h-44 overflow-auto rounded-md border p-2">
                      {units.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No options.</div>
                      ) : (
                        <div className="space-y-2">
                          {units.map((o) => (
                            <div key={o.id} className="flex items-center justify-between gap-2">
                              <div className="text-sm">{o.label}</div>
                              <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteUnit(o.id)}>
                                <Trash2 size={14} />
                                Delete
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Nos" />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setUnitDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={onAddUnit}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Select value={form.unitOfItem} onValueChange={(v) => onChange({ ...form, unitOfItem: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {units.map((o) => (
                  <SelectItem key={o.id} value={o.label}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Low Stock Value</Label>
            <Input
              value={form.lowStockValue}
              disabled={isService}
              onChange={(e) => onChange({ ...form, lowStockValue: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Purchase Price</Label>
            <Input
              value={form.purchasePrice}
              disabled={isService}
              onChange={(e) => onChange({ ...form, purchasePrice: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Sale Price</Label>
            <Input value={form.salePrice} onChange={(e) => onChange({ ...form, salePrice: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Maximum Retail Price</Label>
            <Input value={form.maximumRetailPrice} onChange={(e) => onChange({ ...form, maximumRetailPrice: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Opening Stock</Label>
            <Input
              value={form.openingStock}
              disabled={isService}
              onChange={(e) => onChange({ ...form, openingStock: e.target.value })}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div className="w-full flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClear} disabled={saveLoading}>
            Clear
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
