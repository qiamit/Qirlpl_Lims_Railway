import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  DEFAULT_TEST_REPORT_SIGNATURES,
  MAX_TEST_REPORT_SIGNATURES,
  PAGE_NUMBER_POSITION_LABELS,
  PAGE_NUMBER_POSITIONS,
  printFontFamilyOptions,
  TEST_REPORT_SIGNATURE_PART_IDS,
  type PageNumberPosition,
  TEST_REPORT_SIGNATURE_PART_LABELS,
  TEST_REPORT_SIGNATURE_ROLE_OPTIONS,
  type PdfOutputMode,
  type PrintPageSize,
  type TestReportPrintSettings,
  type TestReportSignature,
  type TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'
import {
  fetchActiveUserProfiles,
  type ActiveUserProfileOption,
} from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import {
  DEFAULT_PART_C_REPORT_COLUMNS,
  PART_C_REPORT_COLUMN_DEFS,
  visiblePartCReportColumns,
} from './partCReportColumns'
import { TestReportPageMarginPreview } from './TestReportPageMarginPreview'
import {
  fetchTestReportPrintSettings,
  saveTestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsConfig'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

function CheckboxRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 cursor-pointer text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-stone-800">
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-stone-500">{hint}</span> : null}
      </span>
    </label>
  )
}

function resetPrintSettings(): TestReportPrintSettings {
  return {
    ...DEFAULT_TEST_REPORT_PRINT_SETTINGS,
    partCColumns: { ...DEFAULT_PART_C_REPORT_COLUMNS },
    signatures: DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s })),
    signatureAfterParts: ['part_d'],
  }
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        className={limsFieldClass}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function useTestReportPrintSettingsState(prepareOpen: boolean) {
  const [settings, setSettings] = useState<TestReportPrintSettings>(DEFAULT_TEST_REPORT_PRINT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!prepareOpen) return
    setMessage(null)
    setLoading(true)
    void fetchTestReportPrintSettings()
      .then(setSettings)
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Unable to load print settings')
      })
      .finally(() => setLoading(false))
  }, [prepareOpen])

  const save = async (): Promise<boolean> => {
    setSaveLoading(true)
    setMessage(null)
    try {
      await saveTestReportPrintSettings(settings)
      setMessage('Saved successfully.')
      return true
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save print settings')
      return false
    } finally {
      setSaveLoading(false)
    }
  }

  return { settings, setSettings, loading, saveLoading, message, save }
}

export type TestReportPrintSettingsControls = ReturnType<typeof useTestReportPrintSettingsState>

export function useTestReportPrintSettingsForPrepare(prepareOpen: boolean) {
  return useTestReportPrintSettingsState(prepareOpen)
}

export function TestReportPrintSettingDialog({
  open,
  onOpenChange,
  controls,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
}) {
  const { settings, setSettings, loading, saveLoading, message, save } = controls

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }))

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[90vh] max-w-2xl flex-col',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Print Setting
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className={cn(limsRegistryFormClass, 'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5')}>
        {loading ? (
          <p className="text-sm text-stone-600">Loading print settings…</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>PDF download method</Label>
              <Select
                value={settings.pdfOutputMode}
                onValueChange={(v) => patch({ pdfOutputMode: v as PdfOutputMode })}
                disabled={saveLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser_print">
                    Browser print (recommended — fixed letterhead/footer)
                  </SelectItem>
                  <SelectItem value="playwright">Direct PDF file (Playwright)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prep-font-family">Font family</Label>
                <Select
                  value={settings.fontFamily}
                  onValueChange={(fontFamily) => patch({ fontFamily })}
                  disabled={saveLoading}
                >
                  <SelectTrigger id="prep-font-family">
                    <SelectValue placeholder="Select font" />
                  </SelectTrigger>
                  <SelectContent>
                    {printFontFamilyOptions(settings.fontFamily).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                id="prep-font-size"
                label="Base font size (pt)"
                value={settings.baseFontSizePt}
                min={8}
                max={14}
                disabled={saveLoading}
                onChange={(baseFontSizePt) => patch({ baseFontSizePt })}
              />
            </div>

            <div className="space-y-3 border-t border-stone-400 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Letterhead &amp; content on print
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CheckboxRow
                  id="prep-show-header"
                  label="Show letterhead header"
                  checked={settings.showPrintHeader}
                  disabled={saveLoading}
                  onChange={(showPrintHeader) => patch({ showPrintHeader })}
                />
                <CheckboxRow
                  id="prep-show-footer"
                  label="Show letterhead footer"
                  checked={settings.showPrintFooter}
                  disabled={saveLoading}
                  onChange={(showPrintFooter) => patch({ showPrintFooter })}
                />
                <CheckboxRow
                  id="prep-show-title"
                  label='Show "Test Report" title'
                  checked={settings.showReportTitle}
                  disabled={saveLoading}
                  onChange={(showReportTitle) => patch({ showReportTitle })}
                />
                <CheckboxRow
                  id="prep-show-terms"
                  label="Show Terms & Conditions"
                  checked={settings.showTermsAndConditions}
                  disabled={saveLoading}
                  onChange={(showTermsAndConditions) => patch({ showTermsAndConditions })}
                />
                <CheckboxRow
                  id="prep-show-end-notes"
                  label="Show Part C end notes"
                  checked={settings.showPartCEndNotes}
                  disabled={saveLoading}
                  onChange={(showPartCEndNotes) => patch({ showPartCEndNotes })}
                />
                <CheckboxRow
                  id="prep-show-section-rows"
                  label="Show Section Code rows in Part C"
                  checked={settings.showPartCSectionRows}
                  disabled={saveLoading}
                  onChange={(showPartCSectionRows) => patch({ showPartCSectionRows })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Parts, page breaks &amp; watermark
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm text-stone-800 sm:grid-cols-2">
                <CheckboxRow
                  id="prep-part-a-new"
                  label="Part A starts on new page"
                  checked={settings.partANewPage}
                  disabled={saveLoading}
                  onChange={(partANewPage) => patch({ partANewPage })}
                />
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                    checked={settings.partBNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partBNewPage: e.target.checked })}
                  />
                  Part B starts on new page
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                    checked={settings.partCNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partCNewPage: e.target.checked })}
                  />
                  Part C starts on new page
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                    checked={settings.partDNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partDNewPage: e.target.checked })}
                  />
                  Part D starts on new page
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                    checked={settings.showWatermark}
                    disabled={saveLoading}
                    onChange={(e) => patch({ showWatermark: e.target.checked })}
                  />
                  Show watermark on print / PDF
                </label>
              </div>
              <div className="space-y-2 border-t border-stone-400 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                  Part C table columns (report)
                </p>
                <div className="grid grid-cols-1 gap-2 text-sm text-stone-800 sm:grid-cols-2">
                  {PART_C_REPORT_COLUMN_DEFS.map((col) => {
                    const checked = settings.partCColumns[col.key]
                    const visibleCount = visiblePartCReportColumns(settings.partCColumns).length
                    const isLastVisible = checked && visibleCount <= 1
                    return (
                      <label
                        key={col.key}
                        className={`flex cursor-pointer items-center gap-2 ${isLastVisible ? 'opacity-70' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                          checked={checked}
                          disabled={saveLoading || isLastVisible}
                          onChange={(e) => {
                            const next = { ...settings.partCColumns, [col.key]: e.target.checked }
                            patch({ partCColumns: next })
                          }}
                        />
                        {col.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <NumberField
                  id="prep-gap-a-b"
                  label="Gap Part A → Part B (px)"
                  value={settings.partGapAfterAMm}
                  min={4}
                  max={24}
                  disabled={saveLoading}
                  onChange={(partGapAfterAMm) =>
                    patch({ partGapAfterAMm, partGapMm: partGapAfterAMm })
                  }
                />
                <NumberField
                  id="prep-gap-b-c"
                  label="Gap Part B → Part C (px)"
                  value={settings.partGapAfterBMm}
                  min={4}
                  max={24}
                  disabled={saveLoading}
                  onChange={(partGapAfterBMm) => patch({ partGapAfterBMm })}
                />
                <NumberField
                  id="prep-gap-c-d"
                  label="Gap Part C → Part D (px)"
                  value={settings.partGapAfterCMm}
                  min={4}
                  max={24}
                  disabled={saveLoading}
                  onChange={(partGapAfterCMm) => patch({ partGapAfterCMm })}
                />
              </div>
            </div>
          </div>
        )}

        {message ? (
          <p
            className={
              message.toLowerCase().includes('saved')
                ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
            }
          >
            {message}
          </p>
        ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveLoading}
              className={limsDarkBarBtnClass}
              onClick={() => setSettings(resetPrintSettings())}
            >
              Reset to defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={limsDarkBarBtnClass}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={cn('gap-2', limsPrimaryBtnClass)}
                onClick={handleSave}
                disabled={loading || saveLoading}
              >
                <Save size={16} />
                {saveLoading ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const EMPTY_SIGNATURE: TestReportSignature = {
  roleLabel: '',
  userId: '',
  name: '',
  designation: '',
}

export function TestReportSignatureSettingDialog({
  open,
  onOpenChange,
  controls,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
}) {
  const { settings, setSettings, loading, saveLoading, message, save } = controls
  const [users, setUsers] = useState<ActiveUserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsersError(null)
    setUsersLoading(true)
    void fetchActiveUserProfiles()
      .then(setUsers)
      .catch((err) => {
        setUsers([])
        setUsersError(err instanceof Error ? err.message : 'Unable to load users')
      })
      .finally(() => setUsersLoading(false))
  }, [open])

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }))

  const updateSignature = (index: number, partial: Partial<TestReportSignature>) => {
    setSettings((prev) => ({
      ...prev,
      signatures: prev.signatures.map((sig, i) => (i === index ? { ...sig, ...partial } : sig)),
    }))
  }

  const selectSignatureUser = (index: number, userId: string) => {
    if (!userId || userId === '__none__') {
      updateSignature(index, { userId: '', name: '', designation: '' })
      return
    }
    const user = users.find((u) => u.id === userId)
    updateSignature(index, {
      userId,
      name: user?.name ?? '',
      designation: user?.designation ?? '',
    })
  }

  const addSignature = () => {
    if (settings.signatures.length >= MAX_TEST_REPORT_SIGNATURES) return
    patch({ signatures: [...settings.signatures, { ...EMPTY_SIGNATURE }] })
  }

  const removeSignature = (index: number) => {
    if (settings.signatures.length <= 1) {
      patch({ signatures: [{ ...EMPTY_SIGNATURE, roleLabel: 'Tested By' }] })
      return
    }
    patch({ signatures: settings.signatures.filter((_, i) => i !== index) })
  }

  const selectedSignatureParts = new Set(settings.signatureAfterParts)

  const toggleSignaturePart = (part: TestReportSignatureAfterPart, checked: boolean) => {
    const next = new Set(selectedSignatureParts)
    if (checked) next.add(part)
    else next.delete(part)
    const ordered = TEST_REPORT_SIGNATURE_PART_IDS.filter((id) => next.has(id))
    patch({ signatureAfterParts: ordered })
  }

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[90vh] max-w-2xl flex-col',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Report Signatures
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading signature settings…</p>
          ) : (
            <div className="space-y-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                  checked={settings.showSignatures}
                  disabled={saveLoading}
                  onChange={(e) => patch({ showSignatures: e.target.checked })}
                />
                Show signatures on printed / PDF test report
              </label>

              <div className="space-y-3 border-2 border-stone-500 bg-[#f7f3eb] p-3 shadow-sm ring-1 ring-amber-700/15">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                  Signature after part
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEST_REPORT_SIGNATURE_PART_IDS.map((part) => {
                    const checked = selectedSignatureParts.has(part)
                    return (
                      <label
                        key={part}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-xs',
                          checked
                            ? 'border-amber-600/50 bg-amber-50 text-stone-900'
                            : 'border-stone-400 bg-white text-stone-700 opacity-80',
                          !settings.showSignatures && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                          checked={checked}
                          disabled={saveLoading || !settings.showSignatures}
                          onChange={(e) => toggleSignaturePart(part, e.target.checked)}
                        />
                        After {TEST_REPORT_SIGNATURE_PART_LABELS[part]}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                    Signatories
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-1.5', limsOutlineBtnClass)}
                    disabled={saveLoading || settings.signatures.length >= MAX_TEST_REPORT_SIGNATURES}
                    onClick={addSignature}
                  >
                    <Plus size={14} />
                    Add signature
                  </Button>
                </div>
                {usersLoading ? (
                  <p className="text-xs text-stone-500">Loading users from User Management…</p>
                ) : null}
                {usersError ? (
                  <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {usersError}
                  </p>
                ) : null}
                {!usersLoading && !usersError && users.length === 0 ? (
                  <p className="text-xs text-stone-500">
                    No active users found in User Management. Add users under Settings → User
                    Management.
                  </p>
                ) : null}

                <div className="space-y-3">
                  {settings.signatures.map((sig, index) => (
                    <div
                      key={index}
                      className="space-y-3 border-2 border-stone-500 bg-white p-3 shadow-sm ring-1 ring-amber-700/15"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-stone-400 bg-stone-800 px-3 py-2 -mx-3 -mt-3 mb-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                          Signature {index + 1}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn('h-8 gap-1', limsDeleteBtnClass)}
                          disabled={saveLoading}
                          onClick={() => removeSignature(index)}
                        >
                          <Trash2 size={14} />
                          Remove
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`prep-sig-role-${index}`}>Role label</Label>
                          <Select
                            value={sig.roleLabel || undefined}
                            onValueChange={(roleLabel) => updateSignature(index, { roleLabel })}
                            disabled={saveLoading}
                          >
                            <SelectTrigger id={`prep-sig-role-${index}`}>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {TEST_REPORT_SIGNATURE_ROLE_OPTIONS.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`prep-sig-user-${index}`}>Person name</Label>
                          <Select
                            value={sig.userId || undefined}
                            onValueChange={(userId) => selectSignatureUser(index, userId)}
                            disabled={saveLoading || usersLoading || users.length === 0}
                          >
                            <SelectTrigger id={`prep-sig-user-${index}`}>
                              <SelectValue
                                placeholder={
                                  usersLoading
                                    ? 'Loading users…'
                                    : users.length === 0
                                      ? 'No users available'
                                      : 'Select person'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— None —</SelectItem>
                              {sig.userId &&
                              sig.name &&
                              !users.some((u) => u.id === sig.userId) ? (
                                <SelectItem value={sig.userId}>{sig.name}</SelectItem>
                              ) : null}
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`prep-sig-designation-${index}`}>Designation</Label>
                          <Input
                            id={`prep-sig-designation-${index}`}
                            value={sig.designation}
                            disabled
                            readOnly
                            className={limsFieldClass}
                            placeholder="Auto from User Management"
                          />
                        </div>
                      </div>
                      {!sig.userId && sig.name.trim() ? (
                        <p className="text-xs text-stone-500">
                          Saved name: <span className="font-medium text-stone-800">{sig.name}</span>.
                          Select a person above to link User Management.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {settings.signatures.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-1.5', limsOutlineBtnClass)}
                    disabled={saveLoading}
                    onClick={() =>
                      patch({ signatures: DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s })) })
                    }
                  >
                    <Plus size={14} />
                    Add first signature
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved')
                  ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveLoading}
              className={limsDarkBarBtnClass}
              onClick={() => setSettings(resetPrintSettings())}
            >
              Reset to defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={limsDarkBarBtnClass}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={cn('gap-2', limsPrimaryBtnClass)}
                onClick={handleSave}
                disabled={loading || saveLoading}
              >
                <Save size={16} />
                {saveLoading ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TestReportPageSettingDialog({
  open,
  onOpenChange,
  controls,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
}) {
  const { settings, setSettings, loading, saveLoading, message, save } = controls

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }))

  const applyPreset = (preset: 'compact' | 'standard' | 'spacious') => {
    if (preset === 'compact') {
      patch({
        pageSize: 'A4',
        bodyPaddingTopMm: 24,
        bodyPaddingBottomMm: 20,
        bodyPaddingLeftMm: 10,
        bodyPaddingRightMm: 10,
        headerMaxHeightMm: 22,
        footerMaxHeightMm: 16,
        baseFontSizePt: 9,
        titleFontSizePt: 16,
        lineHeight: 1.3,
        partGapMm: 6,
        partGapAfterAMm: 6,
        partGapAfterBMm: 6,
        partGapAfterCMm: 6,
        tableCellPaddingPx: 4,
        showPartFrames: true,
      })
      return
    }
    if (preset === 'spacious') {
      patch({
        pageSize: 'A4',
        bodyPaddingTopMm: 36,
        bodyPaddingBottomMm: 28,
        bodyPaddingLeftMm: 14,
        bodyPaddingRightMm: 14,
        headerMaxHeightMm: 30,
        footerMaxHeightMm: 22,
        baseFontSizePt: 11,
        titleFontSizePt: 20,
        lineHeight: 1.5,
        partGapMm: 14,
        partGapAfterAMm: 14,
        partGapAfterBMm: 14,
        partGapAfterCMm: 14,
        tableCellPaddingPx: 8,
        showPartFrames: true,
      })
      return
    }
    patch({
      pageSize: 'A4',
      bodyPaddingTopMm: 36,
      bodyPaddingBottomMm: 28,
      bodyPaddingLeftMm: 12,
      bodyPaddingRightMm: 12,
      headerMaxHeightMm: 32,
      footerMaxHeightMm: 22,
      baseFontSizePt: 10,
      titleFontSizePt: 18,
      lineHeight: 1.4,
      partGapMm: 10,
      partGapAfterAMm: 10,
      partGapAfterBMm: 10,
      partGapAfterCMm: 10,
      tableCellPaddingPx: 6,
      showPartFrames: true,
    })
  }

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[90vh] max-w-3xl flex-col',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Page Setting
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading page settings…</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_1fr]">
                <TestReportPageMarginPreview
                  settings={settings}
                  onPatch={patch}
                  disabled={saveLoading}
                />
                <div className="min-w-0 space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Quick presets
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saveLoading}
                        className={limsOutlineBtnClass}
                        onClick={() => applyPreset('compact')}
                      >
                        Compact
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saveLoading}
                        className={limsOutlineBtnClass}
                        onClick={() => applyPreset('standard')}
                      >
                        Standard Lab
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saveLoading}
                        className={limsOutlineBtnClass}
                        onClick={() => applyPreset('spacious')}
                      >
                        Spacious
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Page size</Label>
                    <Select
                      value={settings.pageSize}
                      onValueChange={(v) => patch({ pageSize: v as PrintPageSize })}
                      disabled={saveLoading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="Letter">Letter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Page margins (mm)
                    </p>
                    <p className="text-xs text-stone-500">
                      Use the preview handles or enter exact values below.
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <NumberField
                        id="prep-margin-top"
                        label="Top margin"
                        value={settings.bodyPaddingTopMm}
                        min={18}
                        max={50}
                        disabled={saveLoading}
                        onChange={(bodyPaddingTopMm) => patch({ bodyPaddingTopMm })}
                      />
                      <NumberField
                        id="prep-margin-bottom"
                        label="Bottom margin"
                        value={settings.bodyPaddingBottomMm}
                        min={16}
                        max={45}
                        disabled={saveLoading}
                        onChange={(bodyPaddingBottomMm) => patch({ bodyPaddingBottomMm })}
                      />
                      <NumberField
                        id="prep-margin-left"
                        label="Left margin"
                        value={settings.bodyPaddingLeftMm}
                        min={8}
                        max={25}
                        disabled={saveLoading}
                        onChange={(bodyPaddingLeftMm) => patch({ bodyPaddingLeftMm })}
                      />
                      <NumberField
                        id="prep-margin-right"
                        label="Right margin"
                        value={settings.bodyPaddingRightMm}
                        min={8}
                        max={25}
                        disabled={saveLoading}
                        onChange={(bodyPaddingRightMm) => patch({ bodyPaddingRightMm })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Letterhead image bounds (mm)
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <NumberField
                        id="prep-hdr-max"
                        label="Header max height"
                        value={settings.headerMaxHeightMm}
                        min={12}
                        max={40}
                        disabled={saveLoading}
                        onChange={(headerMaxHeightMm) => patch({ headerMaxHeightMm })}
                      />
                      <NumberField
                        id="prep-ftr-max"
                        label="Footer max height"
                        value={settings.footerMaxHeightMm}
                        min={10}
                        max={35}
                        disabled={saveLoading}
                        onChange={(footerMaxHeightMm) => patch({ footerMaxHeightMm })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-stone-400 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Page numbering
                    </p>
                    <CheckboxRow
                      id="prep-show-page-numbers"
                      label='Show page numbers (e.g. "Page 01 of 05")'
                      hint="Increase top or bottom margin if numbers overlap header/footer"
                      checked={settings.showPageNumbers}
                      disabled={saveLoading}
                      onChange={(showPageNumbers) => patch({ showPageNumbers })}
                    />
                    {settings.showPageNumbers ? (
                      <div className="space-y-1.5 pl-6">
                        <Label htmlFor="prep-page-number-position">Page number alignment</Label>
                        <Select
                          value={settings.pageNumberPosition}
                          onValueChange={(value) =>
                            patch({ pageNumberPosition: value as PageNumberPosition })
                          }
                          disabled={saveLoading}
                        >
                          <SelectTrigger id="prep-page-number-position" className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_NUMBER_POSITIONS.map((position) => (
                              <SelectItem key={position} value={position}>
                                {PAGE_NUMBER_POSITION_LABELS[position]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-stone-500">
                          Top positions use the top margin; bottom positions use the bottom margin.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3 border-t border-stone-400 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Layout &amp; spacing
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <NumberField
                        id="prep-title-size"
                        label="Title size (pt)"
                        value={settings.titleFontSizePt}
                        min={14}
                        max={24}
                        disabled={saveLoading}
                        onChange={(titleFontSizePt) => patch({ titleFontSizePt })}
                      />
                      <NumberField
                        id="prep-table-font-size"
                        label="Part C table font (pt)"
                        hint="Font size for results table only"
                        value={settings.tableFontSizePt}
                        min={8}
                        max={14}
                        disabled={saveLoading}
                        onChange={(tableFontSizePt) => patch({ tableFontSizePt })}
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="prep-line-height">Line height</Label>
                        <Input
                          id="prep-line-height"
                          type="number"
                          min={1.2}
                          max={1.65}
                          step={0.05}
                          value={settings.lineHeight}
                          disabled={saveLoading}
                          className={limsFieldClass}
                          onChange={(e) =>
                            patch({
                              lineHeight: Math.min(1.65, Math.max(1.2, Number(e.target.value))),
                            })
                          }
                        />
                      </div>
                      <NumberField
                        id="prep-part-gap"
                        label="Gap between parts (px)"
                        value={settings.partGapMm}
                        min={4}
                        max={24}
                        disabled={saveLoading}
                        onChange={(partGapMm) =>
                          patch({
                            partGapMm,
                            partGapAfterAMm: partGapMm,
                            partGapAfterBMm: partGapMm,
                            partGapAfterCMm: partGapMm,
                          })
                        }
                      />
                      <NumberField
                        id="prep-cell-pad"
                        label="Table cell padding (px)"
                        value={settings.tableCellPaddingPx}
                        min={4}
                        max={12}
                        disabled={saveLoading}
                        onChange={(tableCellPaddingPx) => patch({ tableCellPaddingPx })}
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                      <input
                        type="checkbox"
                        className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                        checked={settings.showPartFrames}
                        disabled={saveLoading}
                        onChange={(e) => patch({ showPartFrames: e.target.checked })}
                      />
                      Show bordered frames around Part A–D (matches prepare dialog)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved')
                  ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveLoading}
              className={limsDarkBarBtnClass}
              onClick={() => setSettings(resetPrintSettings())}
            >
              Reset to defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={limsDarkBarBtnClass}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={cn('gap-2', limsPrimaryBtnClass)}
                onClick={handleSave}
                disabled={loading || saveLoading}
              >
                <Save size={16} />
                {saveLoading ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
