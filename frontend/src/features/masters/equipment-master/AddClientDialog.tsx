import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  emptyClientForm,
  type ClientForm,
  isValidGst,
  isValidIndianPin,
  isValidMobile,
  isValidEmail,
  toContinuousText,
  COMPANY_TYPES,
  COMPANY_SCALES,
  BALANCE_TYPES,
  PAYMENT_TERMS,
  INDIA_STATES,
  WORLD_COUNTRIES,
} from '../clients/types'

export function AddClientDialog({
  open,
  onOpenChange,
  onClientSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClientSaved: (clientId: string) => void
}) {
  const [form, setForm] = useState<ClientForm>(() => emptyClientForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const gstError = useMemo(() => (isValidGst(form.gstNumber) ? null : 'Invalid GST Number'), [form.gstNumber])
  const mobileError = useMemo(() => (isValidMobile(form.mobile) ? null : 'Mobile number must be 10 digits'), [form.mobile])
  const emailError = useMemo(() => (isValidEmail(form.email) ? null : 'Invalid email address'), [form.email])
  const pinError = useMemo(() => (isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'), [form.pinCode])

  const canSave =
    !saveLoading &&
    !gstError &&
    !mobileError &&
    !emailError &&
    !pinError &&
    form.companyName.trim().length > 0

  const handleSave = async () => {
    setSaveLoading(true)
    setSaveError(null)
    try {
      const payload = {
        gst_number: form.gstNumber.trim().toUpperCase() || null,
        company_type: form.companyType,
        company_scale: form.companyScale,
        company_name: form.companyName.trim(),
        contact_person_name: form.contactPersonName.trim() || null,
        country_code: form.countryCode || null,
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        address: toContinuousText(form.address) || null,
        pin_code: form.pinCode.trim() || null,
        district: form.district.trim() || null,
        state: form.state || null,
        country: form.country || null,
        opening_balance: form.openingBalance ? Number(form.openingBalance) : 0,
        balance_type: form.balanceType,
        payment_term: form.paymentTerm,
        remark: form.remark.trim() || null,
      }

      const { data, error } = await supabase
        .from('clients')
        .insert(payload)
        .select('id')
        .single()

      if (error) throw error

      if (data?.id) {
        onClientSaved(data.id)
        setForm(emptyClientForm())
        onOpenChange(false)
      } else {
        throw new Error('Client saved but no ID returned.')
      }
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save client')
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold border-b pb-2">Add New Client (Agency)</DialogTitle>
        </DialogHeader>
        {saveError && (
          <div className="text-sm text-destructive px-6 py-2 bg-destructive/10 rounded-md border border-destructive/20">
            {saveError}
          </div>
        )}
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-gst" className="text-xs">GST Number</Label>
              <Input
                id="add-gst"
                placeholder="22AAAAA0000A1Z5"
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
              />
              {gstError && <p className="text-[10px] text-destructive">{gstError}</p>}
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-company-type" className="text-xs">Company Type</Label>
              <Select value={form.companyType} onValueChange={(v) => setForm({ ...form, companyType: v as any })}>
                <SelectTrigger id="add-company-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-company-scale" className="text-xs">Company Scale</Label>
              <Select value={form.companyScale} onValueChange={(v) => setForm({ ...form, companyScale: v as any })}>
                <SelectTrigger id="add-company-scale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SCALES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="add-company-name" className="text-xs">Name of the Company *</Label>
              <Input
                id="add-company-name"
                placeholder="Enter company name"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="add-address" className="text-xs">Address of the Company</Label>
              <Textarea
                id="add-address"
                placeholder="Enter address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="h-16"
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="add-pin" className="text-xs">PIN Code</Label>
              <Input
                id="add-pin"
                placeholder="6-digit PIN"
                value={form.pinCode}
                onChange={(e) => setForm({ ...form, pinCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })}
              />
              {pinError && <p className="text-[10px] text-destructive">{pinError}</p>}
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="add-district" className="text-xs">District</Label>
              <Input
                id="add-district"
                placeholder="Raipur"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="add-state" className="text-xs">State</Label>
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                <SelectTrigger id="add-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDIA_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="add-country" className="text-xs">Country</Label>
              <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                <SelectTrigger id="add-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORLD_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-contact-person" className="text-xs">Name of the Contact Person</Label>
              <Input
                id="add-contact-person"
                placeholder="Enter contact person"
                value={form.contactPersonName}
                onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label className="text-xs">Mobile Number</Label>
              <div className="flex gap-2">
                <Input
                  className="w-16 flex-shrink-0"
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                />
                <Input
                  placeholder="10 digit mobile"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })}
                />
              </div>
              {mobileError && <p className="text-[10px] text-destructive">{mobileError}</p>}
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-email" className="text-xs">Email ID</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="name@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {emailError && <p className="text-[10px] text-destructive">{emailError}</p>}
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-opening-balance" className="text-xs">Opening Balance</Label>
              <div className="flex gap-2">
                <Input
                  id="add-opening-balance"
                  placeholder="0.00"
                  value={form.openingBalance}
                  onChange={(e) => setForm({ ...form, openingBalance: e.target.value.replace(/[^0-9.]/g, '') })}
                />
                <Select value={form.balanceType} onValueChange={(v) => setForm({ ...form, balanceType: v as any })}>
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BALANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-payment-term" className="text-xs">Payment Term</Label>
              <Select value={form.paymentTerm} onValueChange={(v) => setForm({ ...form, paymentTerm: v as any })}>
                <SelectTrigger id="add-payment-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-4 space-y-1.5">
              <Label htmlFor="add-remark" className="text-xs">Remark</Label>
              <Input
                id="add-remark"
                placeholder="Enter remark"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="border-t pt-4 bg-slate-50/50 -mx-6 -mb-6 px-6 pb-6 rounded-b-lg gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(emptyClientForm())
              onOpenChange(false)
            }}
            disabled={saveLoading}
            className="w-28"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saveLoading}
            className="w-28 bg-primary hover:bg-primary/90 text-white"
          >
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
