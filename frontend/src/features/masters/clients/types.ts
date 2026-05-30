export type CompanyType =
  | 'Manufacturer'
  | 'Service Provider'
  | 'Testing Laboratory'
  | 'Calibration Laboratory'
  | 'PT Provider'
  | 'Supplier'

export type CompanyScale = 'Large' | 'Medium' | 'Small' | 'Micro'

export type BalanceType = 'Cr' | 'Dr'

export type PaymentTerm = '100 % Advance' | '15 Days' | '30 Days' | '45 Days' | '60 Days'

export type ClientRow = {
  id: string
  gst_number: string | null
  company_type: CompanyType
  company_scale: CompanyScale
  company_name: string
  contact_person_name: string | null
  country_code: string | null
  mobile: string | null
  email: string | null
  address: string | null
  pin_code: string | null
  district: string | null
  state: string | null
  country: string | null
  opening_balance: number | null
  balance_type: BalanceType
  payment_term: PaymentTerm
  remark: string | null
  created_at?: string
}

export type ClientForm = {
  gstNumber: string
  companyType: CompanyType
  companyScale: CompanyScale
  companyName: string
  contactPersonName: string
  countryCode: string
  mobile: string
  email: string
  address: string
  pinCode: string
  district: string
  state: string
  country: string
  openingBalance: string
  balanceType: BalanceType
  paymentTerm: PaymentTerm
  remark: string
}

export const COMPANY_TYPES: CompanyType[] = [
  'Manufacturer',
  'Service Provider',
  'Testing Laboratory',
  'Calibration Laboratory',
  'PT Provider',
  'Supplier',
]

export const COMPANY_SCALES: CompanyScale[] = ['Large', 'Medium', 'Small', 'Micro']

export const BALANCE_TYPES: BalanceType[] = ['Cr', 'Dr']

export const PAYMENT_TERMS: PaymentTerm[] = ['100 % Advance', '15 Days', '30 Days', '45 Days', '60 Days']

export const DEFAULT_STATE = 'Chhattisgarh'
export const DEFAULT_COUNTRY = 'India'

export const INDIA_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Puducherry',
]

export const WORLD_COUNTRIES = [
  'Afghanistan',
  'Australia',
  'Bangladesh',
  'Bhutan',
  'Brazil',
  'Canada',
  'China',
  'France',
  'Germany',
  'India',
  'Indonesia',
  'Italy',
  'Japan',
  'Malaysia',
  'Nepal',
  'New Zealand',
  'Pakistan',
  'Singapore',
  'South Africa',
  'Sri Lanka',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
]

export const COUNTRY_CODES = [
  { value: '+91', label: '+91 (IN)' },
  { value: '+977', label: '+977 (NP)' },
  { value: '+975', label: '+975 (BT)' },
]

export const isValidGst = (value: string) => {
  const v = value.trim().toUpperCase()
  if (!v) return true
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
}

export const isValidIndianPin = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[1-9][0-9]{5}$/.test(v)
}

export const isValidMobile = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{10}$/.test(v)
}

export const isValidEmail = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export const emptyClientForm = (): ClientForm => ({
  gstNumber: '',
  companyType: 'Manufacturer',
  companyScale: 'Medium',
  companyName: '',
  contactPersonName: '',
  countryCode: '+91',
  mobile: '',
  email: '',
  address: '',
  pinCode: '',
  district: 'Raipur',
  state: DEFAULT_STATE,
  country: DEFAULT_COUNTRY,
  openingBalance: '',
  balanceType: 'Dr',
  paymentTerm: '100 % Advance',
  remark: '',
})
