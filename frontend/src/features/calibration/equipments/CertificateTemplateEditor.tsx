import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  type CalibrationCertificateTemplate,
  DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE,
} from './certificateTemplateTypes'

export function CertificateTemplateEditor({
  value,
  onChange,
}: {
  value: CalibrationCertificateTemplate
  onChange: (next: CalibrationCertificateTemplate) => void
}) {
  const patch = <K extends keyof CalibrationCertificateTemplate>(
    key: K,
    next: CalibrationCertificateTemplate[K],
  ) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-teal-200 bg-teal-50/80 px-3 py-2.5 text-xs leading-relaxed text-teal-900">
        <p className="font-semibold text-teal-950">Template of Calibration Certificate</p>
        <p className="mt-1">
          Har Calibration Equipment ka certificate format alag ho sakta hai. Abhi default layout{' '}
          <span className="font-medium">
            {DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.layoutName}
          </span>{' '}
          (Certificate Preparation me jo format banaya hai) hai — baaki equipment bhi isi template se
          start hote hain. Baad me kisi equipment pe kaam karte waqt uska template yahan change kar
          sakte ho.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-layout-name">Layout / Equipment Format</Label>
          <Input
            id="cert-tpl-layout-name"
            value={value.layoutName}
            onChange={(e) => patch('layoutName', e.target.value)}
            placeholder={DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.layoutName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-title">Certificate Title</Label>
          <Input
            id="cert-tpl-title"
            value={value.title}
            onChange={(e) => patch('title', e.target.value)}
            placeholder={DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.title}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cert-tpl-format-no">Default Format Number</Label>
          <Input
            id="cert-tpl-format-no"
            value={value.formatNumber}
            onChange={(e) => patch('formatNumber', e.target.value)}
            placeholder="e.g. QI/F/CC/…"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-device">Device Section Label</Label>
          <Input
            id="cert-tpl-device"
            value={value.deviceSectionPrefix}
            onChange={(e) => patch('deviceSectionPrefix', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-master">Master Section Title</Label>
          <Input
            id="cert-tpl-master"
            value={value.masterSectionTitle}
            onChange={(e) => patch('masterSectionTitle', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-results">Results Section Title</Label>
          <Input
            id="cert-tpl-results"
            value={value.resultsSectionTitle}
            onChange={(e) => patch('resultsSectionTitle', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-cal-by">Calibrated By Label</Label>
          <Input
            id="cert-tpl-cal-by"
            value={value.calibratedByLabel}
            onChange={(e) => patch('calibratedByLabel', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cert-tpl-auth">Authorized Signatory Label</Label>
          <Input
            id="cert-tpl-auth"
            value={value.authorizedSignatoryLabel}
            onChange={(e) => patch('authorizedSignatoryLabel', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={value.showSummaryLine}
            onChange={(e) => patch('showSummaryLine', e.target.checked)}
            aria-label="Show summary line"
          />
          Show summary line
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={value.showNotesRemarks}
            onChange={(e) => patch('showNotesRemarks', e.target.checked)}
            aria-label="Show notes and remarks"
          />
          Show Notes / Remarks
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={value.showSignatures}
            onChange={(e) => patch('showSignatures', e.target.checked)}
            aria-label="Show signature block"
          />
          Show signature block
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-notes">Default Notes</Label>
          <Textarea
            id="cert-tpl-notes"
            rows={8}
            className="min-h-[140px] resize-y font-mono text-xs"
            value={value.defaultNotes}
            onChange={(e) => patch('defaultNotes', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-tpl-remarks">Default Remarks</Label>
          <Textarea
            id="cert-tpl-remarks"
            rows={8}
            className="min-h-[140px] resize-y font-mono text-xs"
            value={value.defaultRemarks}
            onChange={(e) => patch('defaultRemarks', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
