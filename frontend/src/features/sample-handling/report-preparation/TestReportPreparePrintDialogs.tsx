import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
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
  printFontFamilyOptions,
  type PdfOutputMode,
  type PrintPageSize,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'
import {
  fetchTestReportPrintSettings,
  saveTestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsConfig'

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

            <div className="space-y-2">
              <p className="text-sm font-medium">Parts &amp; watermark</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
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

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading || saveLoading} className="gap-2">
            <Save size={16} />
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
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
        bodyPaddingHorizontalMm: 10,
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
        bodyPaddingHorizontalMm: 14,
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
      bodyPaddingHorizontalMm: 12,
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Page Setting</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading page settings…</p>
        ) : (
          <div className="space-y-5">
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
                  id="prep-margin-h"
                  label="Left / right margin"
                  value={settings.bodyPaddingHorizontalMm}
                  min={8}
                  max={25}
                  disabled={saveLoading}
                  onChange={(bodyPaddingHorizontalMm) => patch({ bodyPaddingHorizontalMm })}
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

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading || saveLoading} className="gap-2">
            <Save size={16} />
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
