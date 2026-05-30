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
import {
  BALANCE_TYPES,
  isValidEmail,
  isValidGst,
  isValidIndianPin,
  isValidMobile,
  type BalanceType,
  type ClientForm,
  type CompanyScale,
  type CompanyType,
  type PaymentTerm,
} from './types'

export function ClientsForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
  states,
  countries,
  districts,
  pinCodes,
  pinAutoFill,
  countryCodes,
  companyTypes,
  companyScales,
  paymentTerms,
  stateDialogOpen,
  setStateDialogOpen,
  newStateName,
  setNewStateName,
  onAddState,
  onDeleteState,
  countryDialogOpen,
  setCountryDialogOpen,
  newCountryName,
  setNewCountryName,
  onAddCountry,
  onDeleteCountry,
  districtDialogOpen,
  setDistrictDialogOpen,
  newDistrictName,
  setNewDistrictName,
  onAddDistrict,
  onDeleteDistrict,
  pinCodeDialogOpen,
  setPinCodeDialogOpen,
  newPinCode,
  setNewPinCode,
  onAddPinCode,
  onDeletePinCode,
  countryCodeDialogOpen,
  setCountryCodeDialogOpen,
  newCountryCode,
  setNewCountryCode,
  onAddCountryCode,
  onDeleteCountryCode,
  companyTypeDialogOpen,
  setCompanyTypeDialogOpen,
  newCompanyType,
  setNewCompanyType,
  onAddCompanyType,
  onDeleteCompanyType,
  companyScaleDialogOpen,
  setCompanyScaleDialogOpen,
  newCompanyScale,
  setNewCompanyScale,
  onAddCompanyScale,
  onDeleteCompanyScale,
  paymentTermDialogOpen,
  setPaymentTermDialogOpen,
  newPaymentTerm,
  setNewPaymentTerm,
  onAddPaymentTerm,
  onDeletePaymentTerm,
}: {
  form: ClientForm
  onChange: (next: ClientForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
  states: Array<{ id: string; label: string }>
  countries: Array<{ id: string; label: string }>
  districts: Array<{ id: string; label: string }>
  pinCodes: Array<{ id: string; label: string }>
  pinAutoFill: Map<string, { district?: string; state?: string; country?: string }>
  countryCodes: Array<{ id: string; value: string; label: string }>
  companyTypes: Array<{ id: string; label: string }>
  companyScales: Array<{ id: string; label: string }>
  paymentTerms: Array<{ id: string; label: string }>
  stateDialogOpen: boolean
  setStateDialogOpen: (open: boolean) => void
  newStateName: string
  setNewStateName: (value: string) => void
  onAddState: () => void
  onDeleteState: (id: string) => void
  countryDialogOpen: boolean
  setCountryDialogOpen: (open: boolean) => void
  newCountryName: string
  setNewCountryName: (value: string) => void
  onAddCountry: () => void
  onDeleteCountry: (id: string) => void
  districtDialogOpen: boolean
  setDistrictDialogOpen: (open: boolean) => void
  newDistrictName: string
  setNewDistrictName: (value: string) => void
  onAddDistrict: () => void
  onDeleteDistrict: (id: string) => void
  pinCodeDialogOpen: boolean
  setPinCodeDialogOpen: (open: boolean) => void
  newPinCode: string
  setNewPinCode: (value: string) => void
  onAddPinCode: () => void
  onDeletePinCode: (id: string) => void
  countryCodeDialogOpen: boolean
  setCountryCodeDialogOpen: (open: boolean) => void
  newCountryCode: string
  setNewCountryCode: (value: string) => void
  onAddCountryCode: () => void
  onDeleteCountryCode: (id: string) => void
  companyTypeDialogOpen: boolean
  setCompanyTypeDialogOpen: (open: boolean) => void
  newCompanyType: string
  setNewCompanyType: (value: string) => void
  onAddCompanyType: () => void
  onDeleteCompanyType: (id: string) => void
  companyScaleDialogOpen: boolean
  setCompanyScaleDialogOpen: (open: boolean) => void
  newCompanyScale: string
  setNewCompanyScale: (value: string) => void
  onAddCompanyScale: () => void
  onDeleteCompanyScale: (id: string) => void
  paymentTermDialogOpen: boolean
  setPaymentTermDialogOpen: (open: boolean) => void
  newPaymentTerm: string
  setNewPaymentTerm: (value: string) => void
  onAddPaymentTerm: () => void
  onDeletePaymentTerm: (id: string) => void
}) {
  const gstError = isValidGst(form.gstNumber) ? null : 'Invalid GST Number'
  const mobileError = isValidMobile(form.mobile) ? null : 'Mobile number must be 10 digits'
  const emailError = isValidEmail(form.email) ? null : 'Invalid email address'
  const pinError = isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'

  const applyPinAutoFill = (pin: string) => {
    const key = pin.trim()
    const hit = key ? pinAutoFill.get(key) : undefined
    if (!hit) return
    onChange({
      ...form,
      pinCode: key,
      district: hit.district ?? form.district,
      state: hit.state ?? form.state,
      country: hit.country ?? form.country,
    })
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-6 pt-5">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between gap-2 h-5">
              <Label htmlFor="gst">GST Number</Label>
              <a
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                href="https://services.gst.gov.in/services/searchtp"
                target="_blank"
                rel="noreferrer"
              >
                Verify GST
                <ExternalLink size={12} />
              </a>
            </div>
            <Input
              id="gst"
              placeholder="22AAAAA0000A1Z5"
              value={form.gstNumber}
              onChange={(e) => onChange({ ...form, gstNumber: e.target.value })}
            />
            {gstError && <p className="text-xs text-destructive">{gstError}</p>}
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between gap-2 h-5">
              <Label htmlFor="company-type" className="text-xs">Company Type</Label>
              <Dialog open={companyTypeDialogOpen} onOpenChange={setCompanyTypeDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Company Types</DialogTitle>
                    <DialogDescription>Add or remove company types.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-company-type" className="text-xs">Add Company Type</Label>
                      <Input
                        id="new-company-type"
                        placeholder="e.g., Distributor"
                        value={newCompanyType}
                        onChange={(e) => setNewCompanyType(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {companyTypes.map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{t.label}</span>
                            {companyTypes.length > 1 && (
                              <button type="button" onClick={() => onDeleteCompanyType(t.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setCompanyTypeDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddCompanyType} disabled={!newCompanyType.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.companyType} onValueChange={(v) => onChange({ ...form, companyType: v as CompanyType })}>
              <SelectTrigger id="company-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([form.companyType, ...companyTypes.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between gap-2 h-5">
              <Label htmlFor="company-scale" className="text-xs">Company Scale</Label>
              <Dialog open={companyScaleDialogOpen} onOpenChange={setCompanyScaleDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Company Scales</DialogTitle>
                    <DialogDescription>Add or remove company scales.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-company-scale" className="text-xs">Add Company Scale</Label>
                      <Input
                        id="new-company-scale"
                        placeholder="e.g., Nano"
                        value={newCompanyScale}
                        onChange={(e) => setNewCompanyScale(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {companyScales.map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{t.label}</span>
                            {companyScales.length > 1 && (
                              <button type="button" onClick={() => onDeleteCompanyScale(t.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setCompanyScaleDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddCompanyScale} disabled={!newCompanyScale.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.companyScale} onValueChange={(v) => onChange({ ...form, companyScale: v as CompanyScale })}>
              <SelectTrigger id="company-scale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([form.companyScale, ...companyScales.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 space-y-2">
            <Label htmlFor="company-name" className="text-xs">Name of the Company</Label>
            <Input
              id="company-name"
              placeholder="Enter company name"
              value={form.companyName}
              onChange={(e) => onChange({ ...form, companyName: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2">
            <Label htmlFor="address" className="text-xs">Address of the Company</Label>
            <Textarea
              id="address"
              placeholder="Enter address"
              value={form.address}
              onChange={(e) => onChange({ ...form, address: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="pin" className="text-xs">PIN Code</Label>
              <Dialog open={pinCodeDialogOpen} onOpenChange={setPinCodeDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage PIN Codes</DialogTitle>
                    <DialogDescription>Add or remove PIN codes.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-pin" className="text-xs">Add PIN Code</Label>
                      <Input
                        id="new-pin"
                        inputMode="numeric"
                        placeholder="6 digit PIN"
                        value={newPinCode}
                        onChange={(e) => setNewPinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {pinCodes.map((p) => (
                          <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{p.label}</span>
                            {pinCodes.length > 1 && (
                              <button type="button" onClick={() => onDeletePinCode(p.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setPinCodeDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddPinCode} disabled={newPinCode.trim().length !== 6}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select
              value={form.pinCode}
              onValueChange={(v) => {
                const pin = v.replace(/[^0-9]/g, '').slice(0, 6)
                applyPinAutoFill(pin)
              }}
            >
              <SelectTrigger id="pin">
                <SelectValue placeholder="Select PIN" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([form.pinCode, ...pinCodes.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="district" className="text-xs">District</Label>
              <Dialog open={districtDialogOpen} onOpenChange={setDistrictDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Districts</DialogTitle>
                    <DialogDescription>Add or remove districts.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-district" className="text-xs">Add District</Label>
                      <Input
                        id="new-district"
                        placeholder="Enter district"
                        value={newDistrictName}
                        onChange={(e) => setNewDistrictName(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {districts.map((d) => (
                          <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{d.label}</span>
                            {districts.length > 1 && (
                              <button type="button" onClick={() => onDeleteDistrict(d.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setDistrictDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddDistrict} disabled={!newDistrictName.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.district} onValueChange={(v) => onChange({ ...form, district: v })}>
              <SelectTrigger id="district">
                <SelectValue placeholder="Select district" />
              </SelectTrigger>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.id} value={d.label}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="state" className="text-xs">State</Label>
              <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage States</DialogTitle>
                    <DialogDescription>Add or remove states.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-state" className="text-xs">Add State</Label>
                      <Input
                        id="new-state"
                        placeholder="Enter state"
                        value={newStateName}
                        onChange={(e) => setNewStateName(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {states.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{s.label}</span>
                            {states.length > 1 && s.label !== 'Chhattisgarh' && (
                              <button type="button" onClick={() => onDeleteState(s.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setStateDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddState} disabled={!newStateName.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.state} onValueChange={(v) => onChange({ ...form, state: v })}>
              <SelectTrigger id="state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.id} value={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="country" className="text-xs">Country</Label>
              <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Countries</DialogTitle>
                    <DialogDescription>Add or remove countries.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-country" className="text-xs">Add Country</Label>
                      <Input
                        id="new-country"
                        placeholder="Enter country"
                        value={newCountryName}
                        onChange={(e) => setNewCountryName(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {countries.map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{c.label}</span>
                            {countries.length > 1 && c.label !== 'India' && (
                              <button type="button" onClick={() => onDeleteCountry(c.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setCountryDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddCountry} disabled={!newCountryName.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.country} onValueChange={(v) => onChange({ ...form, country: v })}>
              <SelectTrigger id="country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <Label htmlFor="contact-person" className="text-xs">Name of the Contact Person</Label>
            <Input
              id="contact-person"
              placeholder="Enter contact person"
              value={form.contactPersonName}
              onChange={(e) => onChange({ ...form, contactPersonName: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label className="text-xs">Mobile Number</Label>
              <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Codes
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Country Codes</DialogTitle>
                    <DialogDescription>Add or remove mobile country codes.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-country-code" className="text-xs">Add Country Code</Label>
                      <Input
                        id="new-country-code"
                        placeholder="e.g., +44"
                        value={newCountryCode}
                        onChange={(e) => setNewCountryCode(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {countryCodes.map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{c.label}</span>
                            {countryCodes.length > 1 && c.value !== '+91' && (
                              <button type="button" onClick={() => onDeleteCountryCode(c.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setCountryCodeDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddCountryCode} disabled={!newCountryCode.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex gap-2">
              <div className="w-32">
                <Select value={form.countryCode} onValueChange={(v) => onChange({ ...form, countryCode: v })}>
                  <SelectTrigger aria-label="Country code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countryCodes.map((c) => (
                      <SelectItem key={c.id} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                inputMode="numeric"
                placeholder="10 digit mobile"
                value={form.mobile}
                onChange={(e) =>
                  onChange({
                    ...form,
                    mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                  })
                }
              />
            </div>
            {mobileError && <p className="text-xs text-destructive">{mobileError}</p>}
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <Label htmlFor="email">Email ID</Label>
            <Input id="email" type="email" placeholder="name@company.com" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} />
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <Label htmlFor="opening-balance">Opening Balance</Label>
            <div className="flex gap-2">
              <Input
                id="opening-balance"
                inputMode="decimal"
                placeholder="0.00"
                value={form.openingBalance}
                onChange={(e) => onChange({ ...form, openingBalance: e.target.value.replace(/[^0-9.]/g, '') })}
              />
              <div className="w-24">
                <Select value={form.balanceType} onValueChange={(v) => onChange({ ...form, balanceType: v as BalanceType })}>
                  <SelectTrigger aria-label="Cr/Dr">
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
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="payment-term" className="text-xs">Payment Term</Label>
              <Dialog open={paymentTermDialogOpen} onOpenChange={setPaymentTermDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Payment Terms</DialogTitle>
                    <DialogDescription>Add or remove payment terms.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-payment-term" className="text-xs">Add Payment Term</Label>
                      <Input
                        id="new-payment-term"
                        placeholder="e.g., 90 Days"
                        value={newPaymentTerm}
                        onChange={(e) => setNewPaymentTerm(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {paymentTerms.map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{t.label}</span>
                            {paymentTerms.length > 1 && (
                              <button type="button" onClick={() => onDeletePaymentTerm(t.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setPaymentTermDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddPaymentTerm} disabled={!newPaymentTerm.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={form.paymentTerm} onValueChange={(v) => onChange({ ...form, paymentTerm: v as PaymentTerm })}>
              <SelectTrigger id="payment-term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentTerms.map((t) => (
                  <SelectItem key={t.id} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <Label htmlFor="remark" className="text-xs">Remark</Label>
            <Input
              id="remark"
              placeholder="Enter remark"
              value={form.remark}
              onChange={(e) => onChange({ ...form, remark: e.target.value })}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClear} disabled={saveLoading} className="w-28">
          Clear
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave} className="w-28">
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  )
}
