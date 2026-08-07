import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import { supabase } from '@/lib/supabaseClient'
import { EMAIL_INPUT_PATTERN } from '@/lib/validation'
import { LegalDocumentsTab } from './lab-settings/LegalDocumentsTab'
import { RegistrationDocumentsTab } from './lab-settings/RegistrationDocumentsTab'
import { PrefixesTab } from './lab-settings/PrefixesTab'
import { LetterheadTab } from './lab-settings/LetterheadTab'
import { LabSettingsHeaderBar } from './lab-settings/LabSettingsHeaderBar'
import { LabSettingsPanel, labAddLinkClass } from './lab-settings/labSettingsUi'
import { persistLabNameLocal } from './lab-settings/brandMark'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  deleteLabMasterOption,
  fetchLabMasterOptionsGrouped,
  insertLabMasterOption,
  slugifyLabOptionValue,
  type LabMasterOptionCategory,
} from './lab-settings/labMasterOptions'
import type { OptionItem } from './lab-settings/types'
import {
  LAB_SETTINGS_SINGLETON_ID,
  parseLabSettingsRow,
  labDetailsPayload,
  labBankPayload,
  labSystemPayload,
  registrationDocsToRows,
  registrationDocFromRow,
  accreditationsToRows,
  accreditationFromRow,
  letterheadFromRow,
} from './lab-settings/labSettingsDb'

function mergeOption(
  prev: OptionItem[],
  item: OptionItem,
): OptionItem[] {
  const next = prev.some((o) => o.value === item.value) ? prev : [...prev, item]
  return next.sort((a, b) => a.label.localeCompare(b.label))
}

export default function LabSettingsPage() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'laboratory-details'
    const stored = window.localStorage.getItem('labSettings.activeTab') ?? 'laboratory-details'
    return stored === 'print' ? 'laboratory-details' : stored
  })
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [labName, setLabName] = useState('')
  const [contactPersonName, setContactPersonName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
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
  const [generateReportEnabled, setGenerateReportEnabled] = useState(true)
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
          .eq('category', 'registration')

        if (deleteError) throw deleteError

        const payload = registrationDocsToRows(registrationDocs)
        if (payload.length > 0) {
          const { error: insertError } = await supabase.from('lab_documents').insert(payload)
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
          .gte('created_at', '1970-01-01')

        if (deleteError) throw deleteError

        const payload = accreditationsToRows(accreditationCards)
        if (payload.length > 0) {
          const { error: insertError } = await supabase.from('lab_accreditations').insert(payload)
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
          .gte('created_at', '1970-01-01')

        if (deleteError) throw deleteError

        const payload: Array<{
          name: string
          template_type: string
          title: string
          file_path?: string | null
          content_text?: string | null
          is_default: boolean
        }> = []

        for (const h of headerTemplates) {
          if (!h.name.trim()) continue
          const label = h.name.trim()
          payload.push({
            name: label,
            template_type: 'header',
            title: label,
            file_path: h.fileUrl ?? '',
            content_text: null,
            is_default: false,
          })
        }
        for (const f of footerTemplates) {
          if (!f.name.trim()) continue
          const label = f.name.trim()
          payload.push({
            name: label,
            template_type: 'footer',
            title: label,
            file_path: f.fileUrl ?? '',
            content_text: null,
            is_default: false,
          })
        }
        for (const t of termsTemplates) {
          if (!t.name.trim()) continue
          const label = t.name.trim()
          payload.push({
            name: label,
            template_type: 'terms',
            title: label,
            file_path: '',
            content_text: t.text ?? '',
            is_default: false,
          })
        }

        for (const wm of watermarkTemplates) {
          if (!wm.name.trim()) continue
          const label = wm.name.trim()
          if (wm.type === 'image') {
            payload.push({
              name: label,
              template_type: 'watermark_image',
              title: label,
              file_path: wm.imagePath ?? '',
              content_text: null,
              is_default: false,
            })
          } else {
            payload.push({
              name: label,
              template_type: 'watermark_text',
              title: label,
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
    const label = newCurrency.trim()
    const value = slugifyLabOptionValue(label, 'currency')
    persistNewMasterOption(
      'currency',
      label,
      value,
      setCurrencies,
      setSelectedCurrency,
      () => setNewCurrency(''),
      () => setCurrencyDialogOpen(false),
    )
  }
  const handleDeleteCurrency = (value: string) => {
    if (currencies.length <= 1) return
    persistDeleteMasterOption('currency', value, currencies, setCurrencies, selectedCurrency, setSelectedCurrency)
  }
  const handleAddDateFormat = () => {
    if (!newDateFormat.trim()) return
    const label = newDateFormat.trim().toUpperCase()
    const value = slugifyLabOptionValue(label, 'date')
    persistNewMasterOption(
      'date_format',
      label,
      value,
      setDateFormats,
      setSelectedDateFormat,
      () => setNewDateFormat(''),
      () => setDateDialogOpen(false),
    )
  }
  const handleDeleteDateFormat = (value: string) => {
    if (dateFormats.length <= 1) return
    persistDeleteMasterOption('date_format', value, dateFormats, setDateFormats, selectedDateFormat, setSelectedDateFormat)
  }
  const handleAddTimeFormat = () => {
    if (!newTimeFormat.trim()) return
    const label = newTimeFormat.trim()
    const value = slugifyLabOptionValue(label, 'time')
    persistNewMasterOption(
      'time_format',
      label,
      value,
      setTimeFormats,
      setSelectedTimeFormat,
      () => setNewTimeFormat(''),
      () => setTimeDialogOpen(false),
    )
  }
  const handleDeleteTimeFormat = (value: string) => {
    if (timeFormats.length <= 1) return
    persistDeleteMasterOption('time_format', value, timeFormats, setTimeFormats, selectedTimeFormat, setSelectedTimeFormat)
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

  const persistNewMasterOption = (
    category: LabMasterOptionCategory,
    label: string,
    value: string,
    setOptions: Dispatch<SetStateAction<OptionItem[]>>,
    setSelected: (value: string) => void,
    clearInput: () => void,
    closeDialog: () => void,
  ) => {
    void (async () => {
      try {
        await insertLabMasterOption(category, label, value)
        const item = { value, label }
        setOptions((prev) => mergeOption(prev, item))
        setSelected(value)
        clearInput()
        closeDialog()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save option')
      }
    })()
  }

  const persistDeleteMasterOption = (
    category: LabMasterOptionCategory,
    value: string,
    options: OptionItem[],
    setOptions: Dispatch<SetStateAction<OptionItem[]>>,
    selected: string,
    setSelected: (value: string) => void,
  ) => {
    void (async () => {
      try {
        await deleteLabMasterOption(category, value)
        const updated = options.filter((o) => o.value !== value)
        setOptions(updated)
        if (selected === value) {
          setSelected(updated[0]?.value ?? '')
        }
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete option')
      }
    })()
  }

  const handleAddLabType = () => {
    if (!newLabType.trim()) return
    const label = newLabType.trim()
    const value = slugifyLabOptionValue(label, 'type')
    persistNewMasterOption(
      'laboratory_type',
      label,
      value,
      setLabTypes,
      setSelectedLabType,
      () => setNewLabType(''),
      () => setLabTypeDialogOpen(false),
    )
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
    if (labTypes.length <= 1) return
    persistDeleteMasterOption('laboratory_type', value, labTypes, setLabTypes, selectedLabType, setSelectedLabType)
  }
  const handleAddLabScale = () => {
    if (!newLabScale.trim()) return
    const label = newLabScale.trim()
    const value = slugifyLabOptionValue(label, 'scale')
    persistNewMasterOption(
      'laboratory_scale',
      label,
      value,
      setLabScales,
      setSelectedLabScale,
      () => setNewLabScale(''),
      () => setLabScaleDialogOpen(false),
    )
  }
  const handleDeleteLabScale = (value: string) => {
    if (labScales.length <= 1) return
    persistDeleteMasterOption('laboratory_scale', value, labScales, setLabScales, selectedLabScale, setSelectedLabScale)
  }
  const handleAddDesignation = () => {
    if (!newDesignation.trim()) return
    const label = newDesignation.trim()
    const value = slugifyLabOptionValue(label, 'designation')
    persistNewMasterOption(
      'designation',
      label,
      value,
      setDesignations,
      setSelectedDesignation,
      () => setNewDesignation(''),
      () => setDesignationDialogOpen(false),
    )
  }
  const handleDeleteDesignation = (value: string) => {
    if (designations.length <= 1) return
    persistDeleteMasterOption(
      'designation',
      value,
      designations,
      setDesignations,
      selectedDesignation,
      setSelectedDesignation,
    )
  }
  const handleAddCountryCode = () => {
    if (!newCountryCode.trim()) return
    const formatted = newCountryCode.startsWith('+') ? newCountryCode.trim() : `+${newCountryCode.trim()}`
    const label = formatted
    const value = formatted
    persistNewMasterOption(
      'country_code',
      label,
      value,
      setCountryCodes,
      setSelectedCountryCode,
      () => setNewCountryCode(''),
      () => setCountryCodeDialogOpen(false),
    )
  }
  const handleDeleteCountryCode = (value: string) => {
    if (countryCodes.length <= 1) return
    persistDeleteMasterOption(
      'country_code',
      value,
      countryCodes,
      setCountryCodes,
      selectedCountryCode,
      setSelectedCountryCode,
    )
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
    const label = newState.trim()
    const value = slugifyLabOptionValue(label, 'state')
    persistNewMasterOption(
      'state',
      label,
      value,
      setStates,
      setSelectedState,
      () => setNewState(''),
      () => setStateDialogOpen(false),
    )
  }
  const handleDeleteState = (value: string) => {
    if (states.length <= 1) return
    persistDeleteMasterOption('state', value, states, setStates, selectedState, setSelectedState)
  }
  const handleAddCountry = () => {
    if (!newCountry.trim()) return
    const label = newCountry.trim()
    const value = slugifyLabOptionValue(label, 'country')
    persistNewMasterOption(
      'country',
      label,
      value,
      setCountries,
      setSelectedCountry,
      () => setNewCountry(''),
      () => setCountryDialogOpen(false),
    )
  }
  const handleDeleteCountry = (value: string) => {
    if (countries.length <= 1) return
    persistDeleteMasterOption('country', value, countries, setCountries, selectedCountry, setSelectedCountry)
  }

  useEffect(() => {
    let canceled = false

    const loadMasterOptions = async () => {
      try {
        const grouped = await fetchLabMasterOptionsGrouped()
        if (canceled) return
        setLabTypes(grouped.laboratory_type)
        setLabScales(grouped.laboratory_scale)
        setDesignations(grouped.designation)
        setStates(grouped.state)
        setCountries(grouped.country)
        setCountryCodes(grouped.country_code)
        setCurrencies(grouped.currency)
        setDateFormats(grouped.date_format)
        setTimeFormats(grouped.time_format)
      } catch (err) {
        if (!canceled) {
          console.error('Failed to load lab master options:', err)
        }
      }
    }

    void loadMasterOptions()

    return () => {
      canceled = true
    }
  }, [])

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

      const parsed = parseLabSettingsRow(data as Record<string, unknown>)
      setLabName(parsed.labName)
      setContactPersonName(parsed.contactPersonName)
      setMobile(parsed.mobile)
      setEmail(parsed.email)
      setWebsite(parsed.website)
      setAddress(parsed.address)
      setPinCode(parsed.pinCode)
      setDistrict(parsed.district)
      setCompanyLogoPath(parsed.companyLogoPath)
      setSealSignPath(parsed.sealSignPath)
      setBankName(parsed.bankName)
      setBranchName(parsed.branchName)
      setAccountNumber(parsed.accountNumber)
      setIfsc(parsed.ifsc)
      setUpi(parsed.upi)
      setChequeCopyPath(parsed.chequeCopyPath)
      setQrCodePath(parsed.qrCodePath)
      if (parsed.labType) setSelectedLabType(parsed.labType)
      if (parsed.labScale) setSelectedLabScale(parsed.labScale)
      if (parsed.designation) setSelectedDesignation(parsed.designation)
      if (parsed.state) setSelectedState(parsed.state)
      if (parsed.country) setSelectedCountry(parsed.country)
      if (parsed.currency) setSelectedCurrency(parsed.currency)
      if (parsed.dateFormat) setSelectedDateFormat(parsed.dateFormat)
      if (parsed.timeFormat) setSelectedTimeFormat(parsed.timeFormat)
      if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
        setSelectedTheme(parsed.theme)
      }
      setGenerateReportEnabled(parsed.generateReportEnabled)
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
          .select('category, name, remarks, file_path')
          .eq('category', 'registration'),
        supabase.from('lab_prefixes').select('name, prefix'),
        supabase
          .from('lab_letterheads')
          .select('template_type, title, name, file_path, content_text, header_html, footer_html'),
        supabase
          .from('lab_accreditations')
          .select(
            'accreditation_body, accreditation_number, certificate_file_path, scope_document_path, logo_file_path, valid_from, valid_until',
          ),
      ])

      if (canceled) return

      if (!documentsResult.error) {
        const docs = (documentsResult.data ?? []) as Array<{
          name?: unknown
          title?: unknown
          remarks?: unknown
          notes?: unknown
          file_path?: unknown
        }>
        setRegistrationDocs(
          docs.map((row) => {
            const parsed = registrationDocFromRow(row)
            return {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: parsed.name,
              number: parsed.number,
              fileUrl: parsed.fileUrl,
            }
          }),
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
        const rows = (letterheadsResult.data ?? []) as Array<Record<string, unknown>>

        const headers: FileTemplate[] = []
        const footers: FileTemplate[] = []
        const terms: TermsTemplate[] = []
        const watermarks: WatermarkTemplate[] = []

        for (const row of rows) {
          const { type, title, fileUrl, text } = letterheadFromRow(row)

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
        const rows = (accreditationsResult.data ?? []) as Array<Record<string, unknown>>

        setAccreditationCards(
          rows
            .map((r) => accreditationFromRow(r))
            .filter((r) => r.inputLabel.trim())
            .map((parsed) => {
              const baseName = parsed.inputLabel
              const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
              const id = `${slug || 'accr'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

              return {
                id,
                inputLabel: baseName,
                inputId: `${id}-cert`,
                certificateLabel: `${baseName} Certificate`,
                scopeLabel: `${baseName} Scope`,
                logoLabel: `${baseName} Logo`,
                certificateNo: parsed.certificateNo,
                certificateFilePath: parsed.certificateFilePath,
                scopeFilePath: parsed.scopeFilePath,
                logoFilePath: parsed.logoFilePath,
                validityStart: parsed.validityStart,
                validityEnd: parsed.validityEnd,
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
        await upsertLabSettings(
          labDetailsPayload({
            labName,
            address,
            mobile,
            email,
            website,
            labType: selectedLabType,
            labScale: selectedLabScale,
            contactPersonName,
            designation: selectedDesignation,
            pinCode,
            district,
            state: selectedState,
            country: selectedCountry,
            companyLogoPath,
            sealSignPath,
          }),
        )
        if (typeof window !== 'undefined') {
          persistLabNameLocal(labName)
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
        await upsertLabSettings(
          labBankPayload({
            bankName,
            branchName,
            accountNumber,
            ifsc,
            upi,
            chequeCopyPath,
            qrCodePath,
          }),
        )
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
        await upsertLabSettings(
          labSystemPayload({
            currency: selectedCurrency,
            dateFormat: selectedDateFormat,
            timeFormat: selectedTimeFormat,
            theme: selectedTheme,
            generateReportEnabled,
          }),
        )
        setSaveMessage('Saved successfully.')
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to save settings')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleHeaderSave = () => {
    if (activeTab === 'laboratory-details') handleSaveLaboratoryDetails()
    else if (activeTab === 'bank-details') handleSaveBankDetails()
    else if (activeTab === 'legal-documents') handleSaveLegalDocuments()
    else if (activeTab === 'logos-signatures') handleSaveAccreditations()
    else if (activeTab === 'prefixes') handleSavePrefixes()
    else if (activeTab === 'letterhead') handleSaveLetterheads()
    else if (activeTab === 'settings') handleSaveSystemSettings()
  }

  return (
    <div className="p-6 space-y-5">
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v)
          setSaveMessage(null)
        }}
        className="space-y-5"
      >
        <LabSettingsHeaderBar
          labName={labName}
          saveLoading={saveLoading}
          saveMessage={saveMessage}
          onSave={handleHeaderSave}
        />

        {/* Tab 1: Laboratory Details */}
        <TabsContent value="laboratory-details" className="mt-0 focus-visible:outline-none">
          <LabSettingsPanel eyebrow="Lab Registry · Profile" title="Laboratory Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end">
                <div className="min-w-0 space-y-2 xl:col-span-2">
                  <div className="flex items-center min-h-[20px]">
                    <Label htmlFor="lab-name">Name of the Laboratory</Label>
                  </div>
                  <Input
                    id="lab-name"
                    className="w-full"
                    placeholder="Enter Laboratory Name"
                    value={labName}
                    onChange={(e) => {
                      const next = e.target.value
                      setLabName(next)
                      persistLabNameLocal(next)
                    }}
                  />
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-1">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="lab-type" className="shrink-0">Laboratory Type</Label>
                    <Dialog open={labTypeDialogOpen} onOpenChange={setLabTypeDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="lab-type" className="w-full">
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

                <div className="min-w-0 space-y-2 xl:col-span-1">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="lab-scale" className="shrink-0">Laboratory Scale</Label>
                    <Dialog open={labScaleDialogOpen} onOpenChange={setLabScaleDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="lab-scale" className="w-full">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end lg:col-span-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center min-h-[20px]">
                      <Label htmlFor="contact-person">Contact Person Name</Label>
                    </div>
                    <Input
                      id="contact-person"
                      className="w-full"
                      placeholder="Enter Contact Person Name"
                      value={contactPersonName}
                      onChange={(e) => setContactPersonName(e.target.value)}
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2 min-h-[20px]">
                      <Label htmlFor="contact-designation" className="shrink-0">Designation</Label>
                      <Dialog open={designationDialogOpen} onOpenChange={setDesignationDialogOpen}>
                        <DialogTrigger asChild>
                          <button type="button" className={labAddLinkClass}>
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
                      <SelectTrigger id="contact-designation" className="w-full">
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

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2 min-h-[20px]">
                      <Label htmlFor="mobile" className="shrink-0">Mobile Number</Label>
                      <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                        <DialogTrigger asChild>
                          <button type="button" className={labAddLinkClass}>
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
                    <div className="grid w-full grid-cols-3 gap-2">
                      <div>
                        <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                          <SelectTrigger id="country-code" className="w-full">
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

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center min-h-[20px]">
                      <Label htmlFor="email">Email ID</Label>
                    </div>
                    <Input
                      id="email"
                      className="w-full"
                      type="email"
                      placeholder="Enter Email Address"
                      pattern={EMAIL_INPUT_PATTERN}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      title="Enter a valid email address"
                    />
                  </div>
                </div>

              <div className="min-w-0 max-w-xl space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  className="w-full"
                  type="url"
                  placeholder="Enter Website URL"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  title="Enter company website"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Current Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter Complete Address"
                  rows={3}
                  className="!h-auto !min-h-[88px] resize-y rounded-md border border-slate-300 bg-white focus-visible:ring-teal-600/30"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center min-h-[20px]">
                    <Label htmlFor="pincode">PIN Code</Label>
                  </div>
                  <Input
                    id="pincode"
                    className="w-full"
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit PIN code"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                  />
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center min-h-[20px]">
                    <Label htmlFor="district">District</Label>
                  </div>
                  <Input
                    id="district"
                    className="w-full"
                    placeholder="Enter district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  />
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="state" className="shrink-0">State</Label>
                    <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="state" className="w-full">
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

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="country" className="shrink-0">Country</Label>
                    <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="country" className="w-full">
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
          </LabSettingsPanel>
        </TabsContent>

        {/* Tab 2: Bank Details */}
        <TabsContent value="bank-details" className="mt-0 focus-visible:outline-none">
          <LabSettingsPanel eyebrow="Lab Registry · Banking" title="Bank Details">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </LabSettingsPanel>
        </TabsContent>

        {/* Tab 3: Legal Documents */}
        <TabsContent value="legal-documents" className="mt-0 focus-visible:outline-none">
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
        <TabsContent value="logos-signatures" className="mt-0 focus-visible:outline-none">
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

        <TabsContent value="prefixes" className="mt-0 focus-visible:outline-none">
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
        <TabsContent value="letterhead" className="mt-0 focus-visible:outline-none">
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
        <TabsContent value="settings" className="mt-0 focus-visible:outline-none">
          <LabSettingsPanel eyebrow="Lab Registry · Preferences" title="System Setting">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="currency" className="shrink-0">Currency Setting</Label>
                    <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="currency" className="w-full">
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

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="date-format" className="shrink-0">Date Setting</Label>
                    <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="date-format" className="w-full">
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

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[20px]">
                    <Label htmlFor="time-format" className="shrink-0">Time Setting</Label>
                    <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className={labAddLinkClass}>
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
                    <SelectTrigger id="time-format" className="w-full">
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

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center min-h-[20px]">
                    <Label htmlFor="theme">Theme</Label>
                  </div>
                  <Select value={selectedTheme} onValueChange={(value) => setSelectedTheme(value as 'light' | 'dark' | 'system')}>
                    <SelectTrigger id="theme" className="w-full">
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

              <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
                <Label htmlFor="generate-report-feature">Calibration Generate Report</Label>
                <label
                  htmlFor="generate-report-feature"
                  className="flex max-w-xl cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300"
                >
                  <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-700">
                    Show Generate Report Format (Calibration Equipments) and Generate Report
                    (Calibration Conduct)
                  </span>
                  <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                    <input
                      id="generate-report-feature"
                      type="checkbox"
                      className="peer sr-only"
                      checked={generateReportEnabled}
                      onChange={(e) => setGenerateReportEnabled(e.target.checked)}
                    />
                    <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600/40" />
                    <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
              </div>
          </LabSettingsPanel>
        </TabsContent>

      </Tabs>
    </div>
  )
}
