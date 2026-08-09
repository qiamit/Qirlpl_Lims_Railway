import { useMemo, useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { cn } from '@/lib/utils'
import { ClientManageDialogContent } from './ClientManageDialogContent'
import { clientAddLinkClass, clientRegistryFormClass, clientVerifyLinkClass } from './clientsFormUi'
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
  onUpdateState,
  onDeleteState,
  countryDialogOpen,
  setCountryDialogOpen,
  newCountryName,
  setNewCountryName,
  onAddCountry,
  onUpdateCountry,
  onDeleteCountry,
  districtDialogOpen,
  setDistrictDialogOpen,
  newDistrictName,
  setNewDistrictName,
  onAddDistrict,
  onUpdateDistrict,
  onDeleteDistrict,
  pinCodeDialogOpen,
  setPinCodeDialogOpen,
  newPinCode,
  setNewPinCode,
  onAddPinCode,
  onUpdatePinCode,
  onDeletePinCode,
  countryCodeDialogOpen,
  setCountryCodeDialogOpen,
  newCountryCode,
  setNewCountryCode,
  onAddCountryCode,
  onUpdateCountryCode,
  onDeleteCountryCode,
  companyTypeDialogOpen,
  setCompanyTypeDialogOpen,
  newCompanyType,
  setNewCompanyType,
  onAddCompanyType,
  onUpdateCompanyType,
  onDeleteCompanyType,
  companyScaleDialogOpen,
  setCompanyScaleDialogOpen,
  newCompanyScale,
  setNewCompanyScale,
  onAddCompanyScale,
  onUpdateCompanyScale,
  onDeleteCompanyScale,
  paymentTermDialogOpen,
  setPaymentTermDialogOpen,
  newPaymentTerm,
  setNewPaymentTerm,
  onAddPaymentTerm,
  onUpdatePaymentTerm,
  onDeletePaymentTerm,
}: {
  form: ClientForm
  onChange: (next: ClientForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
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
  onUpdateState: (id: string) => void
  onDeleteState: (id: string) => void
  countryDialogOpen: boolean
  setCountryDialogOpen: (open: boolean) => void
  newCountryName: string
  setNewCountryName: (value: string) => void
  onAddCountry: () => void
  onUpdateCountry: (id: string) => void
  onDeleteCountry: (id: string) => void
  districtDialogOpen: boolean
  setDistrictDialogOpen: (open: boolean) => void
  newDistrictName: string
  setNewDistrictName: (value: string) => void
  onAddDistrict: () => void
  onUpdateDistrict: (id: string) => void
  onDeleteDistrict: (id: string) => void
  pinCodeDialogOpen: boolean
  setPinCodeDialogOpen: (open: boolean) => void
  newPinCode: string
  setNewPinCode: (value: string) => void
  onAddPinCode: () => void
  onUpdatePinCode: (id: string) => void
  onDeletePinCode: (id: string) => void
  countryCodeDialogOpen: boolean
  setCountryCodeDialogOpen: (open: boolean) => void
  newCountryCode: string
  setNewCountryCode: (value: string) => void
  onAddCountryCode: () => void
  onUpdateCountryCode: (id: string) => void
  onDeleteCountryCode: (id: string) => void
  companyTypeDialogOpen: boolean
  setCompanyTypeDialogOpen: (open: boolean) => void
  newCompanyType: string
  setNewCompanyType: (value: string) => void
  onAddCompanyType: () => void
  onUpdateCompanyType: (id: string) => void
  onDeleteCompanyType: (id: string) => void
  companyScaleDialogOpen: boolean
  setCompanyScaleDialogOpen: (open: boolean) => void
  newCompanyScale: string
  setNewCompanyScale: (value: string) => void
  onAddCompanyScale: () => void
  onUpdateCompanyScale: (id: string) => void
  onDeleteCompanyScale: (id: string) => void
  paymentTermDialogOpen: boolean
  setPaymentTermDialogOpen: (open: boolean) => void
  newPaymentTerm: string
  setNewPaymentTerm: (value: string) => void
  onAddPaymentTerm: () => void
  onUpdatePaymentTerm: (id: string) => void
  onDeletePaymentTerm: (id: string) => void
}) {
  const [pinOpen, setPinOpen] = useState(false)
  const [districtOpen, setDistrictOpen] = useState(false)
  const [stateOpen, setStateOpen] = useState(false)
  const [countryCodeOpen, setCountryCodeOpen] = useState(false)
  const [paymentTermOpen, setPaymentTermOpen] = useState(false)
  const gstError = isValidGst(form.gstNumber) ? null : 'Invalid GST Number'
  const mobileError = isValidMobile(form.mobile) ? null : 'Mobile number must be 10 digits'
  const emailError = isValidEmail(form.email) ? null : 'Invalid email address'
  const pinError = isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'

  const pinOptions = useMemo(() => {
    const all = Array.from(
      new Set(pinCodes.map((x) => x.label).filter((v) => String(v ?? '').trim().length > 0)),
    )
    const q = form.pinCode.trim()
    const filtered = q ? all.filter((p) => p.includes(q)) : all
    return filtered.map((p) => ({ id: p, label: p }))
  }, [pinCodes, form.pinCode])

  const districtOptions = useMemo(() => {
    const all = Array.from(
      new Set(districts.map((x) => x.label).filter((v) => String(v ?? '').trim().length > 0)),
    )
    const q = form.district.trim().toLowerCase()
    const filtered = q ? all.filter((d) => d.toLowerCase().includes(q)) : all
    return filtered.map((d) => ({ id: d, label: d }))
  }, [districts, form.district])

  const stateOptions = useMemo(() => {
    const all = Array.from(
      new Set(states.map((x) => x.label).filter((v) => String(v ?? '').trim().length > 0)),
    )
    const q = form.state.trim().toLowerCase()
    const filtered = q ? all.filter((s) => s.toLowerCase().includes(q)) : all
    return filtered.map((s) => ({ id: s, label: s }))
  }, [states, form.state])

  const countryCodeOptions = useMemo(() => {
    const q = form.countryCode.trim().toLowerCase()
    return countryCodes
      .filter((c) => {
        const value = String(c.value ?? '').trim()
        const label = String(c.label ?? '').trim()
        if (!value && !label) return false
        if (!q) return true
        return value.toLowerCase().includes(q) || label.toLowerCase().includes(q)
      })
      .map((c) => ({
        id: c.value,
        label: c.value || c.label,
      }))
  }, [countryCodes, form.countryCode])

  const paymentTermOptions = useMemo(() => {
    const all = Array.from(
      new Set(paymentTerms.map((x) => x.label).filter((v) => String(v ?? '').trim().length > 0)),
    )
    const q = form.paymentTerm.trim().toLowerCase()
    const filtered = q ? all.filter((t) => t.toLowerCase().includes(q)) : all
    return filtered.map((t) => ({ id: t, label: t }))
  }, [paymentTerms, form.paymentTerm])

  const applyPinAutoFill = (pin: string) => {
    const key = pin.trim()
    const hit = key ? pinAutoFill.get(key) : undefined
    onChange({
      ...form,
      pinCode: key,
      district: hit?.district ?? form.district,
      state: hit?.state ?? form.state,
      country: hit?.country ?? form.country,
    })
  }

  return (
    <div className={clientRegistryFormClass}>
      <div className="space-y-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between gap-2 h-5">
              <Label htmlFor="gst">GST Number</Label>
              <a
                className={clientVerifyLinkClass}
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
              placeholder="22AAAFQ8256C1ZK"
              value={form.gstNumber}
              onChange={(e) => onChange({ ...form, gstNumber: e.target.value })}
              aria-invalid={Boolean(gstError)}
              className={cn(
                gstError &&
                  '!border-red-600 !bg-red-50 focus-visible:!border-red-600 focus-visible:!ring-red-500/30',
              )}
            />
          </div>

          <div className="col-span-12 md:col-span-4 space-y-2">
            <div className="flex items-center justify-between gap-2 h-5">
              <Label htmlFor="company-type" className="text-xs">Company Type</Label>
              <Dialog open={companyTypeDialogOpen} onOpenChange={setCompanyTypeDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={companyTypeDialogOpen}
                  title="Manage Company Types"
                  addLabel="Add Company Type"
                  inputId="new-company-type"
                  placeholder="e.g., Distributor"
                  value={newCompanyType}
                  onValueChange={setNewCompanyType}
                  onSave={onAddCompanyType}
                  onUpdate={onUpdateCompanyType}
                  saveDisabled={!newCompanyType.trim()}
                  items={companyTypes}
                  canDelete={() => companyTypes.length > 1}
                  onDelete={onDeleteCompanyType}
                />
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
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={companyScaleDialogOpen}
                  title="Manage Company Scales"
                  addLabel="Add Company Scale"
                  inputId="new-company-scale"
                  placeholder="e.g., Nano"
                  value={newCompanyScale}
                  onValueChange={setNewCompanyScale}
                  onSave={onAddCompanyScale}
                  onUpdate={onUpdateCompanyScale}
                  saveDisabled={!newCompanyScale.trim()}
                  items={companyScales}
                  canDelete={() => companyScales.length > 1}
                  onDelete={onDeleteCompanyScale}
                />
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
              placeholder="Enter Company Name"
              value={form.companyName}
              onChange={(e) => onChange({ ...form, companyName: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2">
            <Label htmlFor="address" className="text-xs">Address of the Company</Label>
            <Textarea
              id="address"
              rows={1}
              placeholder="Enter Company Address"
              value={form.address}
              onChange={(e) => onChange({ ...form, address: e.target.value })}
              className="!h-10 !min-h-10 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-2 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="pin" className="text-xs">PIN Code</Label>
              <Dialog open={pinCodeDialogOpen} onOpenChange={setPinCodeDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={pinCodeDialogOpen}
                  title="Manage PIN Codes"
                  addLabel="Add PIN Code"
                  inputId="new-pin"
                  placeholder="6 digit PIN"
                  value={newPinCode}
                  onValueChange={(v) => setNewPinCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric"
                  onSave={onAddPinCode}
                  onUpdate={onUpdatePinCode}
                  saveDisabled={newPinCode.trim().length !== 6}
                  items={pinCodes}
                  canDelete={() => pinCodes.length > 1}
                  onDelete={onDeletePinCode}
                />
              </Dialog>
            </div>
            <FilterCombobox
              value={form.pinCode}
              onValueChange={(v) => {
                const pin = v.replace(/[^0-9]/g, '').slice(0, 6)
                if (pin.length === 6) {
                  applyPinAutoFill(pin)
                } else {
                  onChange({ ...form, pinCode: pin })
                }
              }}
              options={pinOptions}
              onSelectOption={(opt) => applyPinAutoFill(opt.label)}
              open={pinOpen}
              onOpenChange={setPinOpen}
              placeholder="Type or select PIN"
              listId="client-pin-combobox"
              inputClassName="h-10"
            />
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="district" className="text-xs">District</Label>
              <Dialog open={districtDialogOpen} onOpenChange={setDistrictDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={districtDialogOpen}
                  title="Manage Districts"
                  addLabel="Add District"
                  inputId="new-district"
                  placeholder="Enter District"
                  value={newDistrictName}
                  onValueChange={setNewDistrictName}
                  onSave={onAddDistrict}
                  onUpdate={onUpdateDistrict}
                  saveDisabled={!newDistrictName.trim()}
                  items={districts}
                  canDelete={() => districts.length > 1}
                  onDelete={onDeleteDistrict}
                />
              </Dialog>
            </div>
            <FilterCombobox
              value={form.district}
              onValueChange={(v) => onChange({ ...form, district: v })}
              options={districtOptions}
              onSelectOption={(opt) => onChange({ ...form, district: opt.label })}
              open={districtOpen}
              onOpenChange={setDistrictOpen}
              placeholder="Type or select District"
              listId="client-district-combobox"
              inputId="district"
              inputClassName="h-10"
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="state" className="text-xs">State</Label>
              <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={stateDialogOpen}
                  title="Manage States"
                  addLabel="Add State"
                  inputId="new-state"
                  placeholder="Enter state"
                  value={newStateName}
                  onValueChange={setNewStateName}
                  onSave={onAddState}
                  onUpdate={onUpdateState}
                  saveDisabled={!newStateName.trim()}
                  items={states}
                  canDelete={(s) => states.length > 1 && s.label !== 'Chhattisgarh'}
                  onDelete={onDeleteState}
                />
              </Dialog>
            </div>
            <FilterCombobox
              value={form.state}
              onValueChange={(v) => onChange({ ...form, state: v })}
              options={stateOptions}
              onSelectOption={(opt) => onChange({ ...form, state: opt.label })}
              open={stateOpen}
              onOpenChange={setStateOpen}
              placeholder="Type or select State"
              listId="client-state-combobox"
              inputId="state"
              inputClassName="h-10"
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label htmlFor="country" className="text-xs">Country</Label>
              <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={countryDialogOpen}
                  title="Manage Countries"
                  addLabel="Add Country"
                  inputId="new-country"
                  placeholder="Enter country"
                  value={newCountryName}
                  onValueChange={setNewCountryName}
                  onSave={onAddCountry}
                  onUpdate={onUpdateCountry}
                  saveDisabled={!newCountryName.trim()}
                  items={countries}
                  canDelete={(c) => countries.length > 1 && c.label !== 'India'}
                  onDelete={onDeleteCountry}
                />
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

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="contact-person">Name of the Contact Person</Label>
            </div>
            <Input
              id="contact-person"
              placeholder="Enter Contact Person Name"
              value={form.contactPersonName}
              onChange={(e) => onChange({ ...form, contactPersonName: e.target.value })}
              className="h-10"
            />
          </div>

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label>Mobile Number</Label>
              <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add country code">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={countryCodeDialogOpen}
                  title="Manage Country Codes"
                  addLabel="Add Country Code"
                  inputId="new-country-code"
                  placeholder="e.g., +44"
                  value={newCountryCode}
                  onValueChange={setNewCountryCode}
                  onSave={onAddCountryCode}
                  onUpdate={onUpdateCountryCode}
                  saveDisabled={!newCountryCode.trim()}
                  items={countryCodes}
                  canDelete={(c) => {
                    const row = countryCodes.find((x) => x.id === c.id)
                    return countryCodes.length > 1 && row?.value !== '+91'
                  }}
                  onDelete={onDeleteCountryCode}
                  getEditValue={(c) => countryCodes.find((x) => x.id === c.id)?.value ?? c.label}
                />
              </Dialog>
            </div>
            <div className="flex h-10 gap-2">
              <div className="w-20 shrink-0">
                <FilterCombobox
                  value={form.countryCode}
                  onValueChange={(v) => onChange({ ...form, countryCode: v })}
                  options={countryCodeOptions}
                  onSelectOption={(opt) => onChange({ ...form, countryCode: opt.id })}
                  open={countryCodeOpen}
                  onOpenChange={setCountryCodeOpen}
                  placeholder="+91"
                  listId="client-country-code-combobox"
                  inputId="country-code"
                  inputClassName="h-10 px-1.5 text-sm"
                />
              </div>
              <Input
                inputMode="numeric"
                placeholder="10 Digit Mobile Number"
                value={form.mobile}
                onChange={(e) =>
                  onChange({
                    ...form,
                    mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                  })
                }
                className="min-w-0 flex-[1_1_0%] grow"
              />
            </div>
            {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
          </div>

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="email">Email ID</Label>
            </div>
            <Input
              id="email"
              type="email"
              placeholder="Enter Email ID"
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              className="h-10"
            />
            {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
          </div>

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="opening-balance">Opening Balance</Label>
            </div>
            <div className="flex h-10 gap-2">
              <Input
                id="opening-balance"
                inputMode="decimal"
                placeholder="0.00"
                value={form.openingBalance}
                onChange={(e) => onChange({ ...form, openingBalance: e.target.value.replace(/[^0-9.]/g, '') })}
                className="min-w-0 flex-1"
              />
              <div className="w-24 shrink-0">
                <Select value={form.balanceType} onValueChange={(v) => onChange({ ...form, balanceType: v as BalanceType })}>
                  <SelectTrigger aria-label="Cr/Dr" className="h-10 rounded-none">
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

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="payment-term">Payment Term</Label>
              <Dialog open={paymentTermDialogOpen} onOpenChange={setPaymentTermDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={clientAddLinkClass} aria-label="Add">
                    <Plus size={14} />
                  </button>
                </DialogTrigger>
                <ClientManageDialogContent
                  open={paymentTermDialogOpen}
                  title="Manage Payment Terms"
                  addLabel="Add Payment Term"
                  inputId="new-payment-term"
                  placeholder="e.g., 90 Days"
                  value={newPaymentTerm}
                  onValueChange={setNewPaymentTerm}
                  onSave={onAddPaymentTerm}
                  onUpdate={onUpdatePaymentTerm}
                  saveDisabled={!newPaymentTerm.trim()}
                  items={paymentTerms}
                  canDelete={() => paymentTerms.length > 1}
                  onDelete={onDeletePaymentTerm}
                />
              </Dialog>
            </div>
            <FilterCombobox
              value={form.paymentTerm}
              onValueChange={(v) => onChange({ ...form, paymentTerm: v as PaymentTerm })}
              options={paymentTermOptions}
              onSelectOption={(opt) => onChange({ ...form, paymentTerm: opt.label as PaymentTerm })}
              open={paymentTermOpen}
              onOpenChange={setPaymentTermOpen}
              placeholder="Type or select Payment Term"
              listId="client-payment-term-combobox"
              inputId="payment-term"
              inputClassName="h-10"
            />
          </div>

          <div className="col-span-12 md:col-span-4 flex flex-col space-y-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="remark">Remark</Label>
            </div>
            <Input
              id="remark"
              placeholder="Enter Remark"
              value={form.remark}
              onChange={(e) => onChange({ ...form, remark: e.target.value })}
              className="h-10"
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-stone-200 pt-2.5">
        <Button
          type="button"
          className="h-9 rounded-none bg-amber-700 px-4 text-sm text-white shadow-sm hover:bg-amber-800"
          onClick={onSave}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
