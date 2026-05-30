  import { useEffect, useState } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import { supabase } from '@/lib/supabaseClient'
import { LegalDocumentsTab } from './lab-settings/LegalDocumentsTab'
import { RegistrationDocumentsTab } from './lab-settings/RegistrationDocumentsTab'
import { PrefixesTab } from './lab-settings/PrefixesTab'
import { LetterheadTab } from './lab-settings/LetterheadTab'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'

const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

export default function LabSettingsPage() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'laboratory-details'
    return window.localStorage.getItem('labSettings.activeTab') ?? 'laboratory-details'
  })
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [labName, setLabName] = useState('')
  const [contactPersonName, setContactPersonName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [district, setDistrict] = useState('Raipur')

  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null)
  const [sealSignPath, setSealSignPath] = useState<string | null>(null)

  const [bankName, setBankName] = useState('')
  const [branchName, setBranchName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [upi, setUpi] = useState('')
  const [chequeCopyPath, setChequeCopyPath] = useState<string | null>(null)
  const [qrCodePath, setQrCodePath] = useState<string | null>(null)
  const [labTypes, setLabTypes] = useState([
    { value: 'testing', label: 'Testing Laboratory' },
    { value: 'calibration', label: 'Calibration Laboratory' },
    { value: 'research', label: 'Research Laboratory' },
    { value: 'other', label: 'Other' },
  ])
  const [selectedLabType, setSelectedLabType] = useState('testing')
  const [newLabType, setNewLabType] = useState('')
  const [labTypeDialogOpen, setLabTypeDialogOpen] = useState(false)
  const [labScales, setLabScales] = useState([
    { value: 'small', label: 'Small Scale' },
    { value: 'medium', label: 'Medium Scale' },
    { value: 'large', label: 'Large Scale' },
    { value: 'enterprise', label: 'Enterprise / Multi-location' },
  ])
  const [selectedLabScale, setSelectedLabScale] = useState('medium')
  const [newLabScale, setNewLabScale] = useState('')
  const [labScaleDialogOpen, setLabScaleDialogOpen] = useState(false)
  const [states, setStates] = useState([
    { value: 'chhattisgarh', label: 'Chhattisgarh' },
    { value: 'maharashtra', label: 'Maharashtra' },
    { value: 'telangana', label: 'Telangana' },
  ])
  const [selectedState, setSelectedState] = useState('chhattisgarh')
  const [newState, setNewState] = useState('')
  const [stateDialogOpen, setStateDialogOpen] = useState(false)
  const [countries, setCountries] = useState([
    { value: 'india', label: 'India' },
    { value: 'nepal', label: 'Nepal' },
    { value: 'bhutan', label: 'Bhutan' },
  ])
  const [selectedCountry, setSelectedCountry] = useState('india')
  const [newCountry, setNewCountry] = useState('')
  const [countryDialogOpen, setCountryDialogOpen] = useState(false)
  const [designations, setDesignations] = useState([
    { value: 'lab-director', label: 'Laboratory Director' },
    { value: 'quality-manager', label: 'Quality Manager' },
    { value: 'technical-manager', label: 'Technical Manager' },
  ])
  const [selectedDesignation, setSelectedDesignation] = useState('lab-director')
  const [newDesignation, setNewDesignation] = useState('')
  const [designationDialogOpen, setDesignationDialogOpen] = useState(false)
  const [countryCodes, setCountryCodes] = useState([
    { value: '+91', label: '+91 (IN)' },
    { value: '+977', label: '+977 (NP)' },
    { value: '+975', label: '+975 (BT)' },
  ])
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')
  const [newCountryCode, setNewCountryCode] = useState('')
  const [countryCodeDialogOpen, setCountryCodeDialogOpen] = useState(false)
  const [currencies, setCurrencies] = useState([
    { value: 'inr', label: 'INR (₹) - Indian Rupee' },
    { value: 'usd', label: 'USD ($) - US Dollar' },
    { value: 'eur', label: 'EUR (€) - Euro' },
    { value: 'gbp', label: 'GBP (£) - British Pound' },
  ])
  const [selectedCurrency, setSelectedCurrency] = useState('inr')
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false)
  const [newCurrency, setNewCurrency] = useState('')
  const [dateFormats, setDateFormats] = useState([
    { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY' },
    { value: 'mm-dd-yyyy', label: 'MM-DD-YYYY' },
    { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
  ])
  const [selectedDateFormat, setSelectedDateFormat] = useState('dd-mm-yyyy')
  const [dateDialogOpen, setDateDialogOpen] = useState(false)
  const [newDateFormat, setNewDateFormat] = useState('')
  const [timeFormats, setTimeFormats] = useState([
    { value: '24h', label: '24 Hour (HH:MM)' },
    { value: '12h', label: '12 Hour (hh:MM AM/PM)' },
  ])
  const [selectedTimeFormat, setSelectedTimeFormat] = useState('24h')
  const [timeDialogOpen, setTimeDialogOpen] = useState(false)
  const [newTimeFormat, setNewTimeFormat] = useState('')
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('light')
  type AccreditationCard = {
    id: string
    inputLabel: string
    inputId: string
    certificateLabel: string
    scopeLabel: string
    logoLabel: string
    certificateNo: string
    certificateFilePath?: string | null
    scopeFilePath?: string | null
    logoFilePath?: string | null
    validityStart?: string | null
    validityEnd?: string | null
  }

  const handleSaveLegalDocuments = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const { error: deleteError } = await supabase
          .from('lab_documents')
          .delete()
          .eq('doc_type', 'registration')

        if (deleteError) throw deleteError

        if (registrationDocs.length > 0) {
          const payload = registrationDocs
            .filter((doc) => doc.name.trim())
            .map((doc) => ({
              doc_type: 'registration',
              title: doc.name.trim(),
              notes: doc.number ?? '',
              file_path: doc.fileUrl ?? null,
            }))

          const { error: insertError } = await supabase
            .from('lab_documents')
            .insert(payload)
          if (insertError) throw insertError
        }

        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save documents')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSaveAccreditations = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const { error: deleteError } = await supabase
          .from('lab_accreditations')
          .delete()
          .neq('title', '')

        if (deleteError) throw deleteError

        if (accreditationCards.length > 0) {
          const payload = accreditationCards
            .filter((card) => card.inputLabel.trim())
            .map((card) => ({
              title: card.inputLabel.trim(),
              certificate_no: card.certificateNo ?? '',
              certificate_file_path: card.certificateFilePath ?? null,
              scope_file_path: card.scopeFilePath ?? null,
              logo_file_path: card.logoFilePath ?? null,
              valid_from: card.validityStart ?? null,
              valid_to: card.validityEnd ?? null,
            }))

          const { error: insertError } = await supabase
            .from('lab_accreditations')
            .insert(payload)

          if (insertError) throw insertError
        }

        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save accreditations')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSavePrefixes = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const { error: deleteError } = await supabase
          .from('lab_prefixes')
          .delete()
          .neq('name', '')

        if (deleteError) throw deleteError

        const payload = prefixes
          .map((p) => ({
            name: p.name?.trim() ?? '',
            label: p.name?.trim() ?? '',
            prefix: p.prefix?.trim() ?? '',
          }))
          .filter((p) => p.name.length > 0 && p.prefix.length > 0)

        if (payload.length > 0) {
          const { error: insertError } = await supabase
            .from('lab_prefixes')
            .insert(payload)
          if (insertError) throw insertError
        }

        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save prefixes')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSaveLetterheads = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const { error: deleteError } = await supabase
          .from('lab_letterheads')
          .delete()
          .neq('template_type', '')

        if (deleteError) throw deleteError

        const payload: Array<{
          template_type: string
          title: string
          file_path?: string | null
          content_text?: string | null
          is_default: boolean
        }> = []

        for (const h of headerTemplates) {
          if (!h.name.trim()) continue
          payload.push({
            template_type: 'header',
            title: h.name.trim(),
            file_path: h.fileUrl ?? '',
            content_text: null,
            is_default: false,
          })
        }
        for (const f of footerTemplates) {
          if (!f.name.trim()) continue
          payload.push({
            template_type: 'footer',
            title: f.name.trim(),
            file_path: f.fileUrl ?? '',
            content_text: null,
            is_default: false,
          })
        }
        for (const t of termsTemplates) {
          if (!t.name.trim()) continue
          payload.push({
            template_type: 'terms',
            title: t.name.trim(),
            file_path: '',
            content_text: t.text ?? '',
            is_default: false,
          })
        }

        for (const wm of watermarkTemplates) {
          if (!wm.name.trim()) continue
          if (wm.type === 'image') {
            payload.push({
              template_type: 'watermark_image',
              title: wm.name.trim(),
              file_path: wm.imagePath ?? '',
              content_text: null,
              is_default: false,
            })
          } else {
            payload.push({
              template_type: 'watermark_text',
              title: wm.name.trim(),
              file_path: '',
              content_text: wm.text?.trim() ?? '',
              is_default: false,
            })
          }
        }

        if (payload.length > 0) {
          const { error: insertError } = await supabase
            .from('lab_letterheads')
            .insert(payload)
          if (insertError) throw insertError
        }

        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save letterheads')
      } finally {
        setSaveLoading(false)
      }
    })()
  }
  const handleAddCurrency = () => {
    if (!newCurrency.trim()) return
    const normalized = newCurrency.trim()
    const value = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `curr-${Date.now()}`
    setCurrencies((prev) => [...prev, { value, label: normalized }])
    setSelectedCurrency(value)
    setNewCurrency('')
    setCurrencyDialogOpen(false)
  }
  const handleDeleteCurrency = (value: string) => {
    setCurrencies((prev) => {
      const updated = prev.filter((currency) => currency.value !== value)
      if (updated.length === 0) {
        setSelectedCurrency('')
      } else if (selectedCurrency === value) {
        setSelectedCurrency(updated[0].value)
      }
      return updated
    })
  }
  const handleAddDateFormat = () => {
    if (!newDateFormat.trim()) return
    const normalized = newDateFormat.trim().toUpperCase()
    const value = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `date-${Date.now()}`
    setDateFormats((prev) => [...prev, { value, label: normalized }])
    setSelectedDateFormat(value)
    setNewDateFormat('')
    setDateDialogOpen(false)
  }
  const handleDeleteDateFormat = (value: string) => {
    setDateFormats((prev) => {
      const updated = prev.filter((format) => format.value !== value)
      if (updated.length === 0) {
        setSelectedDateFormat('')
      } else if (selectedDateFormat === value) {
        setSelectedDateFormat(updated[0].value)
      }
      return updated
    })
  }
  const handleAddTimeFormat = () => {
    if (!newTimeFormat.trim()) return
    const normalized = newTimeFormat.trim()
    const value = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `time-${Date.now()}`
    setTimeFormats((prev) => [...prev, { value, label: normalized }])
    setSelectedTimeFormat(value)
    setNewTimeFormat('')
    setTimeDialogOpen(false)
  }
  const handleDeleteTimeFormat = (value: string) => {
    setTimeFormats((prev) => {
      const updated = prev.filter((format) => format.value !== value)
      if (updated.length === 0) {
        setSelectedTimeFormat('')
      } else if (selectedTimeFormat === value) {
        setSelectedTimeFormat(updated[0].value)
      }
      return updated
    })
  }
  type FileTemplate = { id: string; name: string; fileUrl?: string | null }
  type TermsTemplate = { id: string; name: string; text: string }
  type WatermarkTemplate = {
    id: string
    name: string
    type: 'image' | 'text'
    imagePath?: string | null
    text?: string
  }

  const [registrationDocs, setRegistrationDocs] = useState<
    { id: string; name: string; number: string; fileUrl?: string | null }[]
  >([])
  const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false)
  const [registrationDeleteTarget, setRegistrationDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [newRegistrationName, setNewRegistrationName] = useState('')
  const [accreditationDialogOpen, setAccreditationDialogOpen] = useState(false)
  const [newAccreditationName, setNewAccreditationName] = useState('')
  const [accreditationCards, setAccreditationCards] = useState<AccreditationCard[]>([])
  const [accreditationDeleteTarget, setAccreditationDeleteTarget] = useState<
    { id: string; name: string } | null
  >(null)

  const [prefixDialogOpen, setPrefixDialogOpen] = useState(false)
  const [newPrefixName, setNewPrefixName] = useState('')
  const [newPrefixValue, setNewPrefixValue] = useState('')
  const [prefixes, setPrefixes] = useState<{ id: string; name: string; prefix: string }[]>([])
  const [prefixDeleteTarget, setPrefixDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [headerDialogOpen, setHeaderDialogOpen] = useState(false)
  const [newHeaderName, setNewHeaderName] = useState('')
  const [headerTemplates, setHeaderTemplates] = useState<FileTemplate[]>([])
  const [headerDeleteTarget, setHeaderDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [footerDialogOpen, setFooterDialogOpen] = useState(false)
  const [newFooterName, setNewFooterName] = useState('')
  const [footerTemplates, setFooterTemplates] = useState<FileTemplate[]>([])
  const [footerDeleteTarget, setFooterDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [termsTemplates, setTermsTemplates] = useState<TermsTemplate[]>([])
  const [newTermsName, setNewTermsName] = useState('')
  const [termsDialogOpen, setTermsDialogOpen] = useState(false)
  const [termsDeleteTarget, setTermsDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [watermarkTemplates, setWatermarkTemplates] = useState<WatermarkTemplate[]>([])
  const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false)
  const [newWatermarkType, setNewWatermarkType] = useState<'image' | 'text'>('image')
  const [newWatermarkName, setNewWatermarkName] = useState('')
  const [watermarkDeleteTarget, setWatermarkDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleAddLabType = () => {
    if (!newLabType.trim()) return
    const value = newLabType.toLowerCase().replace(/\s+/g, '-')
    setLabTypes((prev) => [...prev, { value, label: newLabType.trim() }])
    setSelectedLabType(value)
    setNewLabType('')
    setLabTypeDialogOpen(false)
  }

  const handleAddAccreditationCard = () => {
    if (!newAccreditationName.trim()) return
    const baseName = newAccreditationName.trim()
    const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const id = `${slug || 'custom'}-${Date.now()}`
    setAccreditationCards((prev) => [
      ...prev,
      {
        id,
        inputLabel: baseName,
        inputId: `${id}-cert`,
        certificateLabel: `${baseName} Certificate`,
        scopeLabel: `${baseName} Scope`,
        logoLabel: `${baseName} Logo`,
        certificateNo: '',
        certificateFilePath: null,
        scopeFilePath: null,
        logoFilePath: null,
        validityStart: null,
        validityEnd: null,
      },
    ])
    setNewAccreditationName('')
    setAccreditationDialogOpen(false)
  }

  const handleDeleteAccreditationCard = () => {
    if (!accreditationDeleteTarget) return
    setAccreditationCards((prev) => prev.filter((card) => card.id !== accreditationDeleteTarget.id))
    setAccreditationDeleteTarget(null)
  }

  const handleAddPrefix = () => {
    if (!newPrefixName.trim() || !newPrefixValue.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setPrefixes((prev) => [
      ...prev,
      {
        id,
        name: newPrefixName.trim(),
        prefix: newPrefixValue.trim(),
      },
    ])
    setNewPrefixName('')
    setNewPrefixValue('')
    setPrefixDialogOpen(false)
  }
  const handleDeletePrefix = () => {
    if (!prefixDeleteTarget) return
    setPrefixes((prev) => prev.filter((prefix) => prefix.id !== prefixDeleteTarget.id))
    setPrefixDeleteTarget(null)
  }
  const handleAddHeaderTemplate = () => {
    if (!newHeaderName.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setHeaderTemplates((prev) => [...prev, { id, name: newHeaderName.trim(), fileUrl: null }])
    setNewHeaderName('')
    setHeaderDialogOpen(false)
  }
  const handleDeleteHeaderTemplate = () => {
    if (!headerDeleteTarget) return
    setHeaderTemplates((prev) => prev.filter((template) => template.id !== headerDeleteTarget.id))
    setHeaderDeleteTarget(null)
  }
  const handleAddFooterTemplate = () => {
    if (!newFooterName.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFooterTemplates((prev) => [...prev, { id, name: newFooterName.trim(), fileUrl: null }])
    setNewFooterName('')
    setFooterDialogOpen(false)
  }
  const handleDeleteFooterTemplate = () => {
    if (!footerDeleteTarget) return
    setFooterTemplates((prev) => prev.filter((template) => template.id !== footerDeleteTarget.id))
    setFooterDeleteTarget(null)
  }
  const handleAddTermsTemplate = () => {
    if (!newTermsName.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setTermsTemplates((prev) => [...prev, { id, name: newTermsName.trim(), text: '' }])
    setNewTermsName('')
    setTermsDialogOpen(false)
  }
  const handleDeleteTermsTemplate = () => {
    if (!termsDeleteTarget) return
    setTermsTemplates((prev) => prev.filter((template) => template.id !== termsDeleteTarget.id))
    setTermsDeleteTarget(null)
  }

  const handleAddWatermarkTemplate = () => {
    if (!newWatermarkName.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setWatermarkTemplates((prev) => [
      ...prev,
      {
        id,
        name: newWatermarkName.trim(),
        type: newWatermarkType,
        imagePath: null,
        text: '',
      },
    ])
    setNewWatermarkName('')
    setNewWatermarkType('image')
    setWatermarkDialogOpen(false)
  }

  const handleDeleteWatermarkTemplate = () => {
    if (!watermarkDeleteTarget) return
    setWatermarkTemplates((prev) => prev.filter((wm) => wm.id !== watermarkDeleteTarget.id))
    setWatermarkDeleteTarget(null)
  }
  const handleDeleteLabType = (value: string) => {
    setLabTypes((prev) => prev.filter((type) => type.value !== value))
    if (selectedLabType === value && labTypes.length > 1) {
      const next = labTypes.find((type) => type.value !== value)
      if (next) setSelectedLabType(next.value)
    }
  }
  const handleAddLabScale = () => {
    if (!newLabScale.trim()) return
    const value = newLabScale.toLowerCase().replace(/\s+/g, '-')
    setLabScales((prev) => [...prev, { value, label: newLabScale.trim() }])
    setSelectedLabScale(value)
    setNewLabScale('')
    setLabScaleDialogOpen(false)
  }
  const handleDeleteLabScale = (value: string) => {
    setLabScales((prev) => prev.filter((scale) => scale.value !== value))
    if (selectedLabScale === value && labScales.length > 1) {
      const next = labScales.find((scale) => scale.value !== value)
      if (next) setSelectedLabScale(next.value)
    }
  }
  const handleAddDesignation = () => {
    if (!newDesignation.trim()) return
    const value = newDesignation.toLowerCase().replace(/\s+/g, '-')
    setDesignations((prev) => [...prev, { value, label: newDesignation.trim() }])
    setSelectedDesignation(value)
    setNewDesignation('')
    setDesignationDialogOpen(false)
  }
  const handleDeleteDesignation = (value: string) => {
    setDesignations((prev) => prev.filter((designation) => designation.value !== value))
    if (selectedDesignation === value && designations.length > 1) {
      const next = designations.find((designation) => designation.value !== value)
      if (next) setSelectedDesignation(next.value)
    }
  }
  const handleAddCountryCode = () => {
    if (!newCountryCode.trim()) return
    const formatted = newCountryCode.startsWith('+') ? newCountryCode : `+${newCountryCode}`
    const value = formatted
    setCountryCodes((prev) => [...prev, { value, label: `${formatted}` }])
    setSelectedCountryCode(value)
    setNewCountryCode('')
    setCountryCodeDialogOpen(false)
  }
  const handleDeleteCountryCode = (value: string) => {
    setCountryCodes((prev) => prev.filter((code) => code.value !== value))
    if (selectedCountryCode === value && countryCodes.length > 1) {
      const next = countryCodes.find((code) => code.value !== value)
      if (next) setSelectedCountryCode(next.value)
    }
  }

  const handleAddRegistrationDocument = () => {
    if (!newRegistrationName.trim()) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setRegistrationDocs((prev) => [
      ...prev,
      {
        id,
        name: newRegistrationName.trim(),
        number: '',
        fileUrl: null,
      },
    ])
    setNewRegistrationName('')
    setRegistrationDialogOpen(false)
  }

  const handleDeleteRegistrationCard = () => {
    if (!registrationDeleteTarget) return
    setRegistrationDocs((prev) => prev.filter((doc) => doc.id !== registrationDeleteTarget.id))
    setRegistrationDeleteTarget(null)
  }
  const handleAddState = () => {
    if (!newState.trim()) return
    const value = newState.toLowerCase().replace(/\s+/g, '-')
    setStates((prev) => [...prev, { value, label: newState.trim() }])
    setSelectedState(value)
    setNewState('')
    setStateDialogOpen(false)
  }
  const handleDeleteState = (value: string) => {
    setStates((prev) => prev.filter((state) => state.value !== value))
    if (selectedState === value && states.length > 1) {
      const next = states.find((state) => state.value !== value)
      if (next) setSelectedState(next.value)
    }
  }
  const handleAddCountry = () => {
    if (!newCountry.trim()) return
    const value = newCountry.toLowerCase().replace(/\s+/g, '-')
    setCountries((prev) => [...prev, { value, label: newCountry.trim() }])
    setSelectedCountry(value)
    setNewCountry('')
    setCountryDialogOpen(false)
  }
  const handleDeleteCountry = (value: string) => {
    setCountries((prev) => prev.filter((country) => country.value !== value))
    if (selectedCountry === value && countries.length > 1) {
      const next = countries.find((country) => country.value !== value)
      if (next) setSelectedCountry(next.value)
    }
  }

  const parseOptions = (input: unknown) => {
    if (!Array.isArray(input)) return null
    const cleaned = input
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const value = typeof record.value === 'string' ? record.value : ''
        const label = typeof record.label === 'string' ? record.label : ''
        if (!value.trim() || !label.trim()) return null
        return { value: value.trim(), label: label.trim() }
      })
      .filter(Boolean) as Array<{ value: string; label: string }>
    return cleaned.length > 0 ? cleaned : null
  }

  useEffect(() => {
    let canceled = false

    const load = async () => {
      if (canceled) return

      const fetchRow = async () => {
        const singleton = await supabase
          .from('lab_settings')
          .select('*')
          .eq('id', LAB_SETTINGS_SINGLETON_ID)
          .maybeSingle()
        if (!singleton.error && singleton.data) {
          return singleton.data
        }

        const latest = await supabase
          .from('lab_settings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!latest.error && latest.data) {
          return latest.data
        }

        if (latest.error && latest.error.message) {
          console.error('Failed to load lab settings:', latest.error.message)
        }

        return null
      }

      const data = await fetchRow()

      if (canceled || !data) return

      const row = data as Record<string, unknown>
      setLabName(String(row.lab_name ?? ''))
      setContactPersonName(String(row.contact_person_name ?? ''))
      setMobile(String(row.lab_phone ?? ''))
      setEmail(String(row.lab_email ?? ''))
      setAddress(String(row.lab_address ?? ''))
      setPinCode(String(row.pin_code ?? ''))
      setDistrict(String(row.district ?? 'Raipur'))

      setCompanyLogoPath(typeof row.company_logo_path === 'string' ? row.company_logo_path : null)
      setSealSignPath(typeof row.seal_sign_path === 'string' ? row.seal_sign_path : null)

      setBankName(String(row.bank_name ?? ''))
      setBranchName(String(row.branch_name ?? ''))
      setAccountNumber(String(row.account_number ?? ''))
      setIfsc(String(row.ifsc ?? ''))
      setUpi(String(row.upi ?? ''))

      setChequeCopyPath(typeof row.cheque_copy_path === 'string' ? row.cheque_copy_path : null)
      setQrCodePath(typeof row.qr_code_path === 'string' ? row.qr_code_path : null)

      const savedCurrencies = parseOptions(row.currency_options)
      if (savedCurrencies) setCurrencies(savedCurrencies)

      const savedDateFormats = parseOptions(row.date_format_options)
      if (savedDateFormats) setDateFormats(savedDateFormats)

      const savedTimeFormats = parseOptions(row.time_format_options)
      if (savedTimeFormats) setTimeFormats(savedTimeFormats)

      const dbLabType = String(row.laboratory_type ?? '')
      if (dbLabType) setSelectedLabType(dbLabType)

      const dbLabScale = String(row.laboratory_scale ?? '')
      if (dbLabScale) setSelectedLabScale(dbLabScale)

      const dbDesignation = String(row.contact_designation ?? '')
      if (dbDesignation) setSelectedDesignation(dbDesignation)

      const dbState = String(row.state ?? '')
      if (dbState) setSelectedState(dbState)

      const dbCountry = String(row.country ?? '')
      if (dbCountry) setSelectedCountry(dbCountry)

      const dbCurrency = String(row.currency ?? '')
      if (dbCurrency) setSelectedCurrency(dbCurrency)

      const dbDateFormat = String(row.date_format ?? '')
      if (dbDateFormat) setSelectedDateFormat(dbDateFormat)

      const dbTimeFormat = String(row.time_format ?? '')
      if (dbTimeFormat) setSelectedTimeFormat(dbTimeFormat)

      const dbTheme = String(row.theme ?? '').trim()
      if (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'system') {
        setSelectedTheme(dbTheme)
      }
    }

    void load()

    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('labSettings.activeTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    let canceled = false

    const loadLists = async () => {
      const [documentsResult, prefixesResult, letterheadsResult, accreditationsResult] = await Promise.all([
        supabase
          .from('lab_documents')
          .select('doc_type, title, notes, file_path')
          .eq('doc_type', 'registration'),
        supabase
          .from('lab_prefixes')
          .select('name, prefix'),
        supabase
          .from('lab_letterheads')
          .select('template_type, title, file_path, content_text'),
        supabase
          .from('lab_accreditations')
          .select('title, certificate_no, certificate_file_path, scope_file_path, logo_file_path, valid_from, valid_to'),
      ])

      if (canceled) return

      if (!documentsResult.error) {
        const docs = (documentsResult.data ?? []) as Array<{ title?: unknown; notes?: unknown; file_path?: unknown }>
        setRegistrationDocs(
          docs.map((row) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: String(row.title ?? ''),
            number: String(row.notes ?? ''),
            fileUrl: typeof row.file_path === 'string' ? row.file_path : null,
          })),
        )
      }

      if (!prefixesResult.error) {
        const rows = (prefixesResult.data ?? []) as Array<{ name?: unknown; prefix?: unknown }>
        setPrefixes(
          rows.map((row) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: String(row.name ?? ''),
            prefix: String(row.prefix ?? ''),
          })),
        )
      }

      if (!letterheadsResult.error) {
        const rows = (letterheadsResult.data ?? []) as Array<{
          template_type?: unknown
          title?: unknown
          file_path?: unknown
          content_text?: unknown
        }>

        const headers: FileTemplate[] = []
        const footers: FileTemplate[] = []
        const terms: TermsTemplate[] = []
        const watermarks: WatermarkTemplate[] = []

        for (const row of rows) {
          const type = String(row.template_type ?? '')
          const title = String(row.title ?? '')
          const fileUrl = typeof row.file_path === 'string' ? row.file_path : null
          const text = String(row.content_text ?? '')

          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          if (type === 'header') {
            headers.push({ id, name: title, fileUrl })
          } else if (type === 'footer') {
            footers.push({ id, name: title, fileUrl })
          } else if (type === 'terms') {
            terms.push({ id, name: title, text })
          } else if (type === 'watermark_image') {
            watermarks.push({ id, name: title, type: 'image', imagePath: fileUrl, text: '' })
          } else if (type === 'watermark_text') {
            watermarks.push({ id, name: title, type: 'text', imagePath: null, text })
          }
        }

        setHeaderTemplates(headers)
        setFooterTemplates(footers)
        setTermsTemplates(terms)
        setWatermarkTemplates(watermarks)
      }

      if (!accreditationsResult.error) {
        const rows = (accreditationsResult.data ?? []) as Array<{
          title?: unknown
          certificate_no?: unknown
          certificate_file_path?: unknown
          scope_file_path?: unknown
          logo_file_path?: unknown
          valid_from?: unknown
          valid_to?: unknown
        }>

        setAccreditationCards(
          rows
            .filter((r) => String(r.title ?? '').trim())
            .map((r) => {
              const baseName = String(r.title ?? '').trim()
              const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
              const id = `${slug || 'accr'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

              return {
                id,
                inputLabel: baseName,
                inputId: `${id}-cert`,
                certificateLabel: `${baseName} Certificate`,
                scopeLabel: `${baseName} Scope`,
                logoLabel: `${baseName} Logo`,
                certificateNo: String(r.certificate_no ?? ''),
                certificateFilePath: typeof r.certificate_file_path === 'string' ? r.certificate_file_path : null,
                scopeFilePath: typeof r.scope_file_path === 'string' ? r.scope_file_path : null,
                logoFilePath: typeof r.logo_file_path === 'string' ? r.logo_file_path : null,
                validityStart: typeof r.valid_from === 'string' ? r.valid_from : null,
                validityEnd: typeof r.valid_to === 'string' ? r.valid_to : null,
              }
            }),
        )
      }
    }

    void loadLists()

    return () => {
      canceled = true
    }
  }, [])

  const upsertLabSettings = (partial: Record<string, unknown>) => {
    return (async () => {
      const payload = {
        id: LAB_SETTINGS_SINGLETON_ID,
        ...partial,
      }

      const { error: upsertError } = await supabase
        .from('lab_settings')
        .upsert(payload, { onConflict: 'id' })

      if (upsertError) throw upsertError
    })()
  }

  const handleSaveLaboratoryDetails = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        await upsertLabSettings({
          lab_name: labName,
          lab_address: address,
          lab_phone: mobile,
          lab_email: email,
          laboratory_type: selectedLabType,
          laboratory_scale: selectedLabScale,
          contact_person_name: contactPersonName,
          contact_designation: selectedDesignation,
          pin_code: pinCode,
          district,
          state: selectedState,
          country: selectedCountry,
          company_logo_path: companyLogoPath,
          seal_sign_path: sealSignPath,
        })
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('labSettings.labName', labName)
        }
        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save laboratory details')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSaveBankDetails = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        await upsertLabSettings({
          bank_name: bankName,
          branch_name: branchName,
          account_number: accountNumber,
          ifsc,
          upi,
          cheque_copy_path: chequeCopyPath,
          qr_code_path: qrCodePath,
        })
        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save bank details')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSaveSystemSettings = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        await upsertLabSettings({
          currency: selectedCurrency,
          date_format: selectedDateFormat,
          time_format: selectedTimeFormat,
          theme: selectedTheme,
          currency_options: currencies,
          date_format_options: dateFormats,
          time_format_options: timeFormats,
        })
        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save settings')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lab Setting</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Laboratory Information, Documents, & System Preferences
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 gap-2 overflow-x-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="laboratory-details" className="w-full text-xs font-semibold sm:text-sm">
            Laboratory Details
          </TabsTrigger>
          <TabsTrigger value="bank-details" className="w-full text-xs font-semibold sm:text-sm">
            Bank Details
          </TabsTrigger>
          <TabsTrigger value="legal-documents" className="w-full text-xs font-semibold sm:text-sm">
            Legal Documents
          </TabsTrigger>
          <TabsTrigger value="logos-signatures" className="w-full text-xs font-semibold sm:text-sm">
            Registration Documents
          </TabsTrigger>
          <TabsTrigger value="prefixes" className="w-full text-xs font-semibold sm:text-sm">
            Prefix's
          </TabsTrigger>
          <TabsTrigger value="letterhead" className="w-full text-xs font-semibold sm:text-sm">
            Letter Head Templates
          </TabsTrigger>
          <TabsTrigger value="settings" className="w-full text-xs font-semibold sm:text-sm">
            Setting
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Laboratory Details */}
        <TabsContent value="laboratory-details">
          <Card>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-end gap-3 pt-4">
                {saveMessage && (
                  <p className={saveMessage.toLowerCase().includes('saved') ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
                    {saveMessage}
                  </p>
                )}
                <Button className="gap-2" onClick={handleSaveLaboratoryDetails} disabled={saveLoading}>
                  <Save size={16} />
                  {saveLoading ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-4">
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="lab-name">Name of the Laboratory</Label>
                  <Input
                    id="lab-name"
                    placeholder="Enter Laboratory Name"
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                  />
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lab-type">Laboratory Type</Label>
                    <Dialog open={labTypeDialogOpen} onOpenChange={setLabTypeDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Type
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add New Laboratory Type</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-lab-type">Type Name</Label>
                            <Input
                              id="new-lab-type"
                              value={newLabType}
                              onChange={(e) => setNewLabType(e.target.value)}
                              placeholder="e.g., Environmental Testing"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Existing Types</p>
                            <div className="space-y-1">
                              {labTypes.map((type) => (
                                <div
                                  key={type.value}
                                  className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                >
                                  <span>{type.label}</span>
                                  {labTypes.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLabType(type.value)}
                                      className="text-destructive hover:text-destructive/80"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setNewLabType('')
                              setLabTypeDialogOpen(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddLabType} disabled={!newLabType.trim()}>
                            Save Type
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedLabType} onValueChange={setSelectedLabType}>
                    <SelectTrigger id="lab-type">
                      <SelectValue placeholder="Select laboratory type" />
                    </SelectTrigger>
                    <SelectContent>
                      {labTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lab-scale">Laboratory Scale</Label>
                    <Dialog open={labScaleDialogOpen} onOpenChange={setLabScaleDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Scale
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add New Laboratory Scale</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-lab-scale">Scale Name</Label>
                            <Input
                              id="new-lab-scale"
                              value={newLabScale}
                              onChange={(e) => setNewLabScale(e.target.value)}
                              placeholder="e.g., Mega Facility"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Existing Scales</p>
                            <div className="space-y-1">
                              {labScales.map((scale) => (
                                <div
                                  key={scale.value}
                                  className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                >
                                  <span>{scale.label}</span>
                                  {labScales.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLabScale(scale.value)}
                                      className="text-destructive hover:text-destructive/80"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setNewLabScale('')
                              setLabScaleDialogOpen(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddLabScale} disabled={!newLabScale.trim()}>
                            Save Scale
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedLabScale} onValueChange={setSelectedLabScale}>
                    <SelectTrigger id="lab-scale">
                      <SelectValue placeholder="Select laboratory scale" />
                    </SelectTrigger>
                    <SelectContent>
                      {labScales.map((scale) => (
                        <SelectItem key={scale.value} value={scale.value}>
                          {scale.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:col-span-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-person">Contact Person Name</Label>
                    <Input
                      id="contact-person"
                      placeholder="Enter Contact Person Name"
                      value={contactPersonName}
                      onChange={(e) => setContactPersonName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="contact-designation">Designation of Person</Label>
                      <Dialog open={designationDialogOpen} onOpenChange={setDesignationDialogOpen}>
                        <DialogTrigger asChild>
                          <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                            <Plus size={12} />
                            Add New Designation
                          </button>
                        </DialogTrigger>
                        <DialogContent aria-describedby={undefined}>
                          <DialogHeader>
                            <DialogTitle>Add New Designation</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="new-designation">Designation Name</Label>
                              <Input
                                id="new-designation"
                                value={newDesignation}
                                onChange={(e) => setNewDesignation(e.target.value)}
                                placeholder="e.g., Compliance Officer"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Designations</p>
                              <div className="space-y-1">
                                {designations.map((designation) => (
                                  <div
                                    key={designation.value}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                  >
                                    <span>{designation.label}</span>
                                    {designations.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDesignation(designation.value)}
                                        className="text-destructive hover:text-destructive/80"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setNewDesignation('')
                                setDesignationDialogOpen(false)
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={handleAddDesignation} disabled={!newDesignation.trim()}>
                              Save Designation
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                      <SelectTrigger id="contact-designation">
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        {designations.map((designation) => (
                          <SelectItem key={designation.value} value={designation.value}>
                            {designation.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="mobile">Mobile Number</Label>
                      <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                        <DialogTrigger asChild>
                          <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                            <Plus size={12} />
                            Manage Codes
                          </button>
                        </DialogTrigger>
                        <DialogContent aria-describedby={undefined}>
                          <DialogHeader>
                            <DialogTitle>Add Country Code</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="new-country-code">Country Code</Label>
                              <Input
                                id="new-country-code"
                                value={newCountryCode}
                                onChange={(e) => setNewCountryCode(e.target.value)}
                                placeholder="e.g., +44"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Codes</p>
                              <div className="space-y-1 max-h-40 overflow-auto">
                                {countryCodes.map((code) => (
                                  <div
                                    key={code.value}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                  >
                                    <span>{code.label}</span>
                                    {countryCodes.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCountryCode(code.value)}
                                        className="text-destructive hover:text-destructive/80"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setNewCountryCode('')
                                setCountryCodeDialogOpen(false)
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={handleAddCountryCode} disabled={!newCountryCode.trim()}>
                              Save Code
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                          <SelectTrigger id="country-code">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {countryCodes.map((code) => (
                              <SelectItem key={code.value} value={code.value}>
                                {code.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        id="mobile"
                        type="tel"
                        placeholder="Enter Mobile Number"
                        className="col-span-2"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        maxLength={10}
                        minLength={10}
                        pattern="\d{10}"
                        inputMode="numeric"
                        title="Enter a 10-digit mobile number"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email ID</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter Email Address"
                      pattern="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      title="Enter a valid email address"
                    />
                  </div>
                </div>

              <div className="space-y-2">
                <Label htmlFor="address">Current Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter Complete Address"
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="pincode">PIN Code</Label>
                  <Input
                    id="pincode"
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit PIN code"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="district">District</Label>
                  <Input
                    id="district"
                    placeholder="Enter district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="state">State</Label>
                    <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New State
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add New State</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-state">State Name</Label>
                            <Input
                              id="new-state"
                              value={newState}
                              onChange={(e) => setNewState(e.target.value)}
                              placeholder="e.g., Karnataka"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Existing States</p>
                            <div className="space-y-1 max-h-40 overflow-auto">
                              {states.map((state) => (
                                <div
                                  key={state.value}
                                  className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                >
                                  <span>{state.label}</span>
                                  {states.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteState(state.value)}
                                      className="text-destructive hover:text-destructive/80"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setNewState('')
                              setStateDialogOpen(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddState} disabled={!newState.trim()}>
                            Save State
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger id="state">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="country">Country</Label>
                    <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Country
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add New Country</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-country">Country Name</Label>
                            <Input
                              id="new-country"
                              value={newCountry}
                              onChange={(e) => setNewCountry(e.target.value)}
                              placeholder="e.g., Sri Lanka"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Existing Countries</p>
                            <div className="space-y-1 max-h-40 overflow-auto">
                              {countries.map((country) => (
                                <div
                                  key={country.value}
                                  className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                >
                                  <span>{country.label}</span>
                                  {countries.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCountry(country.value)}
                                      className="text-destructive hover:text-destructive/80"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setNewCountry('')
                              setCountryDialogOpen(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddCountry} disabled={!newCountry.trim()}>
                            Save Country
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FileUpload
                  label="Company Logo"
                  accept="image/*"
                  bucket="laboratory-files"
                  pathPrefix="company"
                  value={companyLogoPath ?? undefined}
                  onChange={(_file, storagePath) => setCompanyLogoPath(storagePath)}
                />
                <FileUpload
                  label="Seal & Sign"
                  accept="image/*"
                  bucket="laboratory-files"
                  pathPrefix="company"
                  value={sealSignPath ?? undefined}
                  onChange={(_file, storagePath) => setSealSignPath(storagePath)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Bank Details */}
        <TabsContent value="bank-details">
          <Card>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-end gap-3 pt-4">
                {saveMessage && (
                  <p className={saveMessage.toLowerCase().includes('saved') ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
                    {saveMessage}
                  </p>
                )}
                <Button className="gap-2" onClick={handleSaveBankDetails} disabled={saveLoading}>
                  <Save size={16} />
                  {saveLoading ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="bank-name">Bank Name</Label>
                  <Input
                    id="bank-name"
                    placeholder="Enter Bank Name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch-name">Branch Name</Label>
                  <Input
                    id="branch-name"
                    placeholder="Enter Branch Name"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account-number">Account Number</Label>
                  <Input
                    id="account-number"
                    placeholder="Enter Account Number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ifsc">IFSC Code</Label>
                  <Input
                    id="ifsc"
                    placeholder="Enter IFSC Code"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                  <Label htmlFor="upi">UPI Number</Label>
                  <Input
                    id="upi"
                    placeholder="Enter UPI ID"
                    value={upi}
                    onChange={(e) => setUpi(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <FileUpload
                    label="Cheque Copy"
                    accept="image/*"
                    bucket="laboratory-files"
                    pathPrefix="bank"
                    value={chequeCopyPath ?? undefined}
                    onChange={(_file, storagePath) => setChequeCopyPath(storagePath)}
                  />
                </div>

                <div className="space-y-2">
                  <FileUpload
                    label="QR Code for Payment"
                    accept="image/*"
                    bucket="laboratory-files"
                    pathPrefix="bank"
                    value={qrCodePath ?? undefined}
                    onChange={(_file, storagePath) => setQrCodePath(storagePath)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Legal Documents */}
        <TabsContent value="legal-documents">
          <LegalDocumentsTab
            saveMessage={saveMessage}
            saveLoading={saveLoading}
            onSave={handleSaveLegalDocuments}
            registrationDocs={registrationDocs}
            setRegistrationDocs={setRegistrationDocs}
            registrationDialogOpen={registrationDialogOpen}
            setRegistrationDialogOpen={setRegistrationDialogOpen}
            newRegistrationName={newRegistrationName}
            setNewRegistrationName={setNewRegistrationName}
            onAddRegistrationDocument={handleAddRegistrationDocument}
            registrationDeleteTarget={registrationDeleteTarget}
            setRegistrationDeleteTarget={setRegistrationDeleteTarget}
            onDeleteRegistrationCard={handleDeleteRegistrationCard}
          />
        </TabsContent>

        {/* Tab 4: Registration Documents */}
        <TabsContent value="logos-signatures">
          <RegistrationDocumentsTab
            saveMessage={saveMessage}
            saveLoading={saveLoading}
            onSave={handleSaveAccreditations}
            accreditationDialogOpen={accreditationDialogOpen}
            setAccreditationDialogOpen={setAccreditationDialogOpen}
            newAccreditationName={newAccreditationName}
            setNewAccreditationName={setNewAccreditationName}
            onAddAccreditationCard={handleAddAccreditationCard}
            accreditationCards={accreditationCards}
            setAccreditationCards={setAccreditationCards}
            accreditationDeleteTarget={accreditationDeleteTarget}
            setAccreditationDeleteTarget={setAccreditationDeleteTarget}
            onDeleteAccreditationCard={handleDeleteAccreditationCard}
          />
        </TabsContent>

        <TabsContent value="prefixes">
          <PrefixesTab
            saveMessage={saveMessage}
            saveLoading={saveLoading}
            onSave={handleSavePrefixes}
            prefixDialogOpen={prefixDialogOpen}
            setPrefixDialogOpen={setPrefixDialogOpen}
            newPrefixName={newPrefixName}
            setNewPrefixName={setNewPrefixName}
            newPrefixValue={newPrefixValue}
            setNewPrefixValue={setNewPrefixValue}
            onAddPrefix={handleAddPrefix}
            prefixes={prefixes}
            setPrefixes={setPrefixes}
            prefixDeleteTarget={prefixDeleteTarget}
            setPrefixDeleteTarget={setPrefixDeleteTarget}
            onDeletePrefix={handleDeletePrefix}
          />
        </TabsContent>
        {/* Tab 5: Letter Head Templates */}
        <TabsContent value="letterhead">
          <LetterheadTab
            saveMessage={saveMessage}
            saveLoading={saveLoading}
            onSave={handleSaveLetterheads}
            headerDialogOpen={headerDialogOpen}
            setHeaderDialogOpen={setHeaderDialogOpen}
            newHeaderName={newHeaderName}
            setNewHeaderName={setNewHeaderName}
            onAddHeaderTemplate={handleAddHeaderTemplate}
            headerTemplates={headerTemplates}
            setHeaderTemplates={setHeaderTemplates}
            headerDeleteTarget={headerDeleteTarget}
            setHeaderDeleteTarget={setHeaderDeleteTarget}
            onDeleteHeaderTemplate={handleDeleteHeaderTemplate}
            footerDialogOpen={footerDialogOpen}
            setFooterDialogOpen={setFooterDialogOpen}
            newFooterName={newFooterName}
            setNewFooterName={setNewFooterName}
            onAddFooterTemplate={handleAddFooterTemplate}
            footerTemplates={footerTemplates}
            setFooterTemplates={setFooterTemplates}
            footerDeleteTarget={footerDeleteTarget}
            setFooterDeleteTarget={setFooterDeleteTarget}
            onDeleteFooterTemplate={handleDeleteFooterTemplate}
            termsTemplates={termsTemplates}
            setTermsTemplates={setTermsTemplates}
            newTermsName={newTermsName}
            setNewTermsName={setNewTermsName}
            termsDialogOpen={termsDialogOpen}
            setTermsDialogOpen={setTermsDialogOpen}
            onAddTermsTemplate={handleAddTermsTemplate}
            termsDeleteTarget={termsDeleteTarget}
            setTermsDeleteTarget={setTermsDeleteTarget}
            onDeleteTermsTemplate={handleDeleteTermsTemplate}
            watermarkTemplates={watermarkTemplates}
            setWatermarkTemplates={setWatermarkTemplates}
            watermarkDialogOpen={watermarkDialogOpen}
            setWatermarkDialogOpen={setWatermarkDialogOpen}
            newWatermarkType={newWatermarkType}
            setNewWatermarkType={setNewWatermarkType}
            newWatermarkName={newWatermarkName}
            setNewWatermarkName={setNewWatermarkName}
            onAddWatermarkTemplate={handleAddWatermarkTemplate}
            watermarkDeleteTarget={watermarkDeleteTarget}
            setWatermarkDeleteTarget={setWatermarkDeleteTarget}
            onDeleteWatermarkTemplate={handleDeleteWatermarkTemplate}
          />
        </TabsContent>

        {/* Tab 7: Settings */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>Configure system preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-end gap-3 pt-1">
                {saveMessage && (
                  <p
                    className={
                      saveMessage.toLowerCase().includes('saved')
                        ? 'text-sm text-emerald-700'
                        : 'text-sm text-destructive'
                    }
                  >
                    {saveMessage}
                  </p>
                )}
                <Button className="gap-2" onClick={handleSaveSystemSettings} disabled={saveLoading}>
                  <Save size={16} />
                  {saveLoading ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="currency">Currency Setting</Label>
                    <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Currency
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add New Currency</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-currency">Currency Name</Label>
                            <Input
                              id="new-currency"
                              placeholder="e.g., SGD ($) - Singapore Dollar"
                              value={newCurrency}
                              onChange={(e) => setNewCurrency(e.target.value)}
                            />
                          </div>
                          {currencies.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Currencies</p>
                              <div className="space-y-1 max-h-40 overflow-auto">
                                {currencies.map((currency) => (
                                  <div
                                    key={currency.value}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                  >
                                    <span>{currency.label}</span>
                                    {currencies.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCurrency(currency.value)}
                                        className="text-destructive hover:text-destructive/80"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setCurrencyDialogOpen(false)
                              setNewCurrency('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddCurrency} disabled={!newCurrency.trim()}>
                            Save Currency
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((currency) => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="date-format">Date Setting</Label>
                    <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Format
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add Date Format</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-date-format">Format</Label>
                            <Input
                              id="new-date-format"
                              placeholder="e.g., DD/MM/YYYY"
                              value={newDateFormat}
                              onChange={(e) => setNewDateFormat(e.target.value)}
                            />
                          </div>
                          {dateFormats.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Formats</p>
                              <div className="space-y-1 max-h-40 overflow-auto">
                                {dateFormats.map((format) => (
                                  <div
                                    key={format.value}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                  >
                                    <span>{format.label}</span>
                                    {dateFormats.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDateFormat(format.value)}
                                        className="text-destructive hover:text-destructive/80"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setDateDialogOpen(false)
                              setNewDateFormat('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddDateFormat} disabled={!newDateFormat.trim()}>
                            Save Format
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedDateFormat} onValueChange={setSelectedDateFormat}>
                    <SelectTrigger id="date-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFormats.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="time-format">Time Setting</Label>
                    <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                          <Plus size={12} />
                          Add New Format
                        </button>
                      </DialogTrigger>
                      <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle>Add Time Format</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-time-format">Format</Label>
                            <Input
                              id="new-time-format"
                              placeholder="e.g., HH:MM:ss"
                              value={newTimeFormat}
                              onChange={(e) => setNewTimeFormat(e.target.value)}
                            />
                          </div>
                          {timeFormats.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Existing Formats</p>
                              <div className="space-y-1 max-h-40 overflow-auto">
                                {timeFormats.map((format) => (
                                  <div
                                    key={format.value}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                                  >
                                    <span>{format.label}</span>
                                    {timeFormats.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTimeFormat(format.value)}
                                        className="text-destructive hover:text-destructive/80"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setTimeDialogOpen(false)
                              setNewTimeFormat('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddTimeFormat} disabled={!newTimeFormat.trim()}>
                            Save Format
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={selectedTimeFormat} onValueChange={setSelectedTimeFormat}>
                    <SelectTrigger id="time-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeFormats.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={selectedTheme} onValueChange={(value) => setSelectedTheme(value as 'light' | 'dark' | 'system')}>
                    <SelectTrigger id="theme">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System Default</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
