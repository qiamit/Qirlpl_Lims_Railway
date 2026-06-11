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
  defaultSignatureAfterParts,
  isAllSignaturePartsSelected,
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
        className="rounded border-border mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground font-normal">{hint}</span> : null}
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
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print Setting</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading print settings…</p>
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
                  <SelectItem value="html2pdf">Direct PDF file (html2pdf)</SelectItem>
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

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Letterhead &amp; content on print</p>
              <p className="text-xs text-muted-foreground">
                Header, footer, and watermark templates are chosen per scope in the Results
                section. These toggles control whether they appear on the printed report.
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
                  hint="End Report marker and standard disclaimer text"
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
              <p className="text-sm font-medium">Parts, page breaks &amp; watermark</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <CheckboxRow
                  id="prep-part-a-new"
                  label="Part A starts on new page"
                  checked={settings.partANewPage}
                  disabled={saveLoading}
                  onChange={(partANewPage) => patch({ partANewPage })}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={settings.partBNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partBNewPage: e.target.checked })}
                  />
                  Part B starts on new page
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={settings.partCNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partCNewPage: e.target.checked })}
                  />
                  Part C starts on new page
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={settings.partDNewPage}
                    disabled={saveLoading}
                    onChange={(e) => patch({ partDNewPage: e.target.checked })}
                  />
                  Part D starts on new page
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={settings.showWatermark}
                    disabled={saveLoading}
                    onChange={(e) => patch({ showWatermark: e.target.checked })}
                  />
                  Show watermark on print / PDF
                </label>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Part C table columns (report)</p>
                <p className="text-xs text-muted-foreground">
                  Choose which columns appear in Part C when printing or downloading the test report PDF.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {PART_C_REPORT_COLUMN_DEFS.map((col) => {
                    const checked = settings.partCColumns[col.key]
                    const visibleCount = visiblePartCReportColumns(settings.partCColumns).length
                    const isLastVisible = checked && visibleCount <= 1
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 cursor-pointer ${isLastVisible ? 'opacity-70' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-border"
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
                ? 'text-sm text-emerald-700'
                : 'text-sm text-destructive'
            }
          >
            {message}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveLoading}
            onClick={() => setSettings(resetPrintSettings())}
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading || saveLoading} className="gap-2">
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
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

  const selectAllSignatureParts = () => {
    patch({ signatureAfterParts: defaultSignatureAfterParts() })
  }

  const selectPartDOnlySignatures = () => {
    patch({ signatureAfterParts: ['part_d'] })
  }

  const clearAllSignatureParts = () => {
    patch({ signatureAfterParts: [] })
  }

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Signatures</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading signature settings…</p>
        ) : (
          <div className="space-y-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={settings.showSignatures}
                disabled={saveLoading}
                onChange={(e) => patch({ showSignatures: e.target.checked })}
              />
              Show signatures on printed / PDF test report
            </label>

            <div className="space-y-3 rounded-md border border-border p-3 bg-muted/10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Signature after part</p>
                  <p className="text-xs text-muted-foreground">
                    Choose after which report parts signatures appear. Unselected parts will not
                    show a signature block.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saveLoading || !settings.showSignatures}
                    onClick={selectPartDOnlySignatures}
                  >
                    After Part D only
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saveLoading || !settings.showSignatures}
                    onClick={selectAllSignatureParts}
                  >
                    All parts
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saveLoading || !settings.showSignatures}
                    onClick={clearAllSignatureParts}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {TEST_REPORT_SIGNATURE_PART_IDS.map((part) => {
                  const checked = selectedSignatureParts.has(part)
                  return (
                    <label
                      key={part}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer ${
                        checked
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-background opacity-80'
                      } ${!settings.showSignatures ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={checked}
                        disabled={saveLoading || !settings.showSignatures}
                        onChange={(e) => toggleSignaturePart(part, e.target.checked)}
                      />
                      After {TEST_REPORT_SIGNATURE_PART_LABELS[part]}
                    </label>
                  )
                })}
              </div>
              {!settings.showSignatures ? (
                <p className="text-xs text-muted-foreground">
                  Enable signatures above to configure part selection.
                </p>
              ) : selectedSignatureParts.size === 1 && selectedSignatureParts.has('part_d') ? (
                <p className="text-xs text-emerald-700">After Part D only (recommended).</p>
              ) : isAllSignaturePartsSelected([...selectedSignatureParts]) ? (
                <p className="text-xs text-muted-foreground">Signatures after every part (A–D).</p>
              ) : selectedSignatureParts.size === 0 ? (
                <p className="text-xs text-amber-700">
                  No parts selected — signatures will not appear on the report.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Selected:{' '}
                  {TEST_REPORT_SIGNATURE_PART_IDS.filter((part) => selectedSignatureParts.has(part))
                    .map((part) => `After ${TEST_REPORT_SIGNATURE_PART_LABELS[part]}`)
                    .join(', ')}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Signatories</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={saveLoading || settings.signatures.length >= MAX_TEST_REPORT_SIGNATURES}
                  onClick={addSignature}
                >
                  <Plus size={14} />
                  Add signature
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose a role label (Tested By, Reviewed By, etc.), then pick a person from User
                Management — designation fills automatically. Up to {MAX_TEST_REPORT_SIGNATURES}{' '}
                signatories.
              </p>
              {usersLoading ? (
                <p className="text-xs text-muted-foreground">Loading users from User Management…</p>
              ) : null}
              {usersError ? <p className="text-xs text-destructive">{usersError}</p> : null}
              {!usersLoading && !usersError && users.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active users found in User Management. Add users under Settings → User
                  Management.
                </p>
              ) : null}

              <div className="space-y-3">
                {settings.signatures.map((sig, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-border p-3 space-y-3 bg-muted/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Signature {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                        disabled={saveLoading}
                        onClick={() => removeSignature(index)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          placeholder="Auto from User Management"
                        />
                      </div>
                    </div>
                    {!sig.userId && sig.name.trim() ? (
                      <p className="text-xs text-muted-foreground">
                        Saved name: <span className="font-medium">{sig.name}</span>. Select a person
                        above to link User Management.
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
                  className="gap-1.5"
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
                ? 'text-sm text-emerald-700'
                : 'text-sm text-destructive'
            }
          >
            {message}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveLoading}
            onClick={() => setSettings(resetPrintSettings())}
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading || saveLoading} className="gap-2">
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Page Setting</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading page settings…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 items-start">
              <TestReportPageMarginPreview
                settings={settings}
                onPatch={patch}
                disabled={saveLoading}
              />
              <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <p className="text-sm font-medium">Quick presets</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saveLoading}
                  onClick={() => applyPreset('compact')}
                >
                  Compact
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saveLoading}
                  onClick={() => applyPreset('standard')}
                >
                  Standard Lab
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saveLoading}
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
              <p className="text-sm font-medium">Page margins (mm)</p>
              <p className="text-xs text-muted-foreground">
                Use the preview handles or enter exact values below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <p className="text-sm font-medium">Letterhead image bounds (mm)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Page numbering</p>
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
                    onValueChange={(value) => patch({ pageNumberPosition: value as PageNumberPosition })}
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
                  <p className="text-xs text-muted-foreground">
                    Top positions use the top margin; bottom positions use the bottom margin.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Layout &amp; spacing</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    onChange={(e) =>
                      patch({ lineHeight: Math.min(1.65, Math.max(1.2, Number(e.target.value))) })
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
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="rounded border-border"
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
                ? 'text-sm text-emerald-700'
                : 'text-sm text-destructive'
            }
          >
            {message}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveLoading}
            onClick={() => setSettings(resetPrintSettings())}
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading || saveLoading} className="gap-2">
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
