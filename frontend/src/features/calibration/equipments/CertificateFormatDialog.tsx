import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import {
  fetchManagementDocLetterhead,
  formatNablCertificateNo,
  type ManagementDocLetterhead,
} from '@/features/management-docs/fetchManagementDocLetterhead'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import {
  parseCalibrationCertificateTemplate,
  serializeCalibrationCertificateTemplate,
  type CalibrationCertificateTemplate,
} from './certificateTemplateTypes'
import {
  applyCertificateNotesMinLoad,
  CERTIFICATE_NOTES_MIN_LOAD_TOKEN,
  ensureCertificateNotesMinLoadToken,
  formatCertificateMinLoadDisplay,
} from '@/features/calibration/handling/certificate-preparation/certificateDraftTypes'

const FULLSCREEN_OVERLAY = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

/** Lab Settings → Letter Head Templates (calibration certificate). */
const CALIBRATION_LETTERHEAD_HEADER = 'NABL Letter Head for Calibration'
const CALIBRATION_LETTERHEAD_FOOTER = 'General Letter Footer'

/** Fallback when equipment Raw Data Sheet has no columns yet (UTM-style preview). */
const FALLBACK_RESULTS_COLUMNS = [
  'Load in Kn',
  'Indicator Reading in Div',
  'Temperature Corrected Standard Reading',
  'Reading at 0',
  'Reading at 120',
  'Reading at 360',
  'Average',
  'Relative Indication Error q1',
  'Relative Indication Error q2',
  'Relative Indication Error q3',
  'Average of Relative Indication Error q%',
  'Estimate Mean Relative Error',
  'Relative Repeatability Error b%',
  'Relative Resolution @ Fi',
  'Actual Expanded Uncertainty',
] as const

function resolveResultsPreviewColumns(labels?: string[] | null): string[] {
  const fromRaw = (labels ?? [])
    .map((l) => String(l ?? '').trim())
    .filter(Boolean)
  return fromRaw.length > 0 ? fromRaw : [...FALLBACK_RESULTS_COLUMNS]
}

function sampleResultsPreviewRows(columnCount: number): string[][] {
  return [0, 1, 2].map((rowIdx) =>
    Array.from({ length: columnCount }, (_, colIdx) => {
      if (colIdx === 0) return String((rowIdx + 1) * 10)
      return '—'
    }),
  )
}

const tplFieldClass =
  'border-0 border-b border-dashed border-teal-400 bg-teal-50/40 shadow-none focus-visible:ring-1 focus-visible:ring-teal-500'

/** Same NABL QR behaviour as Certificate Preparation (Company / Lab Settings). */
function NablScopeQrMark({
  imageUrl,
  payload,
}: {
  imageUrl: string | null
  payload: string
}) {
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (imageUrl) {
      setGeneratedDataUrl(null)
      return
    }
    let cancelled = false
    const text = payload.trim() || 'https://nabl-india.org/'
    void QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 160,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setGeneratedDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setGeneratedDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl, payload])

  const src = imageUrl || generatedDataUrl
  if (src) {
    return (
      <img
        src={src}
        alt="NABL scope QR code"
        className="max-h-full max-w-full object-contain"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
      QR
    </div>
  )
}

/** Letterhead from Lab Settings — prefer NABL Letter Head for Calibration image. */
function PreviewLetterhead({ lh }: { lh: ManagementDocLetterhead | null }) {
  const companyName = (lh?.labName ?? '').trim() || 'Laboratory'
  const nablBody = (lh?.nablBody ?? '').trim() || 'NABL'
  const nablCertDisplay = formatNablCertificateNo(lh?.nablCertificateNo)
  const qrPayload =
    (lh?.nablScopeQrPayload ?? '').trim() ||
    `NABL India Certificate No. ${nablCertDisplay} — https://nabl-india.org/`
  const headerImageUrl = (lh?.headerUrl ?? '').trim() || null

  /** Lab Settings → Letter Head Templates → "NABL Letter Head for Calibration" */
  if (headerImageUrl) {
    return (
      <header className="certificate-page-header w-full shrink-0 bg-white pb-1">
        <img
          src={headerImageUrl}
          alt={`${companyName} — NABL Letter Head for Calibration`}
          className="-ml-[10mm] -mr-[5mm] w-[calc(100%+15mm)] max-w-none object-contain object-top"
        />
      </header>
    )
  }

  return (
    <header className="certificate-page-header w-full shrink-0 bg-white pb-1">
      <div className="grid grid-cols-3 items-center gap-2 sm:gap-3">
        <div className="flex h-[80px] items-center justify-start sm:h-[96px]">
          {lh?.logoUrl ? (
            <img
              src={lh.logoUrl}
              alt={`${companyName} logo`}
              className="max-h-full max-w-[140px] object-contain sm:max-w-[168px]"
            />
          ) : (
            <div className="flex h-full w-[100px] items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:w-[120px]">
              Logo
            </div>
          )}
        </div>

        <div className="flex h-[80px] items-center justify-center sm:h-[96px]">
          <div className="flex h-full w-[72px] items-center justify-center sm:w-[88px]">
            <NablScopeQrMark imageUrl={lh?.nablScopeQrImageUrl ?? null} payload={qrPayload} />
          </div>
        </div>

        <div className="flex h-[80px] items-center justify-end sm:h-[96px]">
          {lh?.nablLogoUrl ? (
            <img
              src={lh.nablLogoUrl}
              alt={`${nablBody} accreditation mark`}
              className="max-h-full max-w-[120px] object-contain sm:max-w-[140px]"
            />
          ) : (
            <div className="flex h-full w-[88px] flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-[8px] font-semibold uppercase tracking-wide text-slate-400 sm:w-[104px]">
              <span>NABL</span>
              <span>Logo</span>
            </div>
          )}
        </div>
      </div>

      <p className="-ml-[10mm] -mr-[5mm] mt-3 w-[calc(100%+15mm)] bg-slate-800 px-3 py-2 text-center text-[10px] font-semibold uppercase leading-snug tracking-[0.06em] text-white sm:px-4 sm:text-[11px] sm:tracking-[0.08em]">
        An ISO/IEC 17025: 2017 Accredited Laboratory by NABL India, Vide Certificate No.{' '}
        {nablCertDisplay}
      </p>
    </header>
  )
}

function formatLabFooterParts(lh: ManagementDocLetterhead | null): {
  address: string
  contact: string
} {
  if (!lh) return { address: '', contact: '' }
  const address = [
    lh.labAddress.trim(),
    [lh.district, lh.state, lh.pinCode].map((s) => s.trim()).filter(Boolean).join(', '),
    lh.country.trim(),
  ]
    .filter(Boolean)
    .join(', ')
  const contact = [lh.labPhone.trim(), lh.labEmail.trim(), lh.labWebsite.trim()]
    .filter(Boolean)
    .join(' · ')
  return { address, contact }
}

function PreviewPageFooter({
  lh,
  pageLabel,
}: {
  lh: ManagementDocLetterhead | null
  pageLabel: string
}) {
  const firmName = (lh?.labName ?? '').trim() || 'Laboratory'
  const { address, contact } = formatLabFooterParts(lh)
  const footerImageUrl = (lh?.footerUrl ?? '').trim() || null

  /** Letter Head Templates → Footer image (Lab Settings). */
  if (footerImageUrl) {
    return (
      <footer className="certificate-page-footer relative mt-auto shrink-0">
        <div className="relative -ml-[10mm] -mr-[5mm] w-[calc(100%+15mm)]">
          <img
            src={footerImageUrl}
            alt={`${firmName} letterhead footer`}
            className="w-full max-w-none object-contain object-bottom"
          />
          <p className="pointer-events-none absolute bottom-1 right-[5mm] whitespace-nowrap text-right text-[9px] font-medium leading-none text-slate-800 sm:text-[10px]">
            Page No : {pageLabel.trim() || '—'}
          </p>
        </div>
      </footer>
    )
  }

  /** Company / Lab Settings text footer (same as Certificate Preparation). */
  return (
    <footer className="certificate-page-footer mt-auto shrink-0 border-t border-slate-400 pt-1.5">
      <p className="text-center text-[13px] font-extrabold uppercase tracking-[0.12em] text-slate-900 sm:text-sm">
        {firmName}
      </p>
      {address ? (
        <p className="mt-0.5 break-words text-center text-[9px] leading-snug text-slate-600 sm:text-[10px]">
          {address}
        </p>
      ) : !contact ? (
        <p className="mt-0.5 text-center text-[9px] text-slate-400 sm:text-[10px]">
          Laboratory address
        </p>
      ) : null}
      <div className="relative mt-0.5 min-h-[1rem]">
        <p className="px-16 text-center text-[7.5px] leading-snug text-slate-600 sm:text-[8px]">
          {contact || '\u00a0'}
        </p>
        <p className="absolute bottom-0 right-0 whitespace-nowrap text-[9px] font-medium text-slate-800 sm:text-[10px]">
          Page No : {pageLabel.trim() || '—'}
        </p>
      </div>
    </footer>
  )
}

function PreviewSection({
  titleNode,
  aside,
  toggle,
  children,
}: {
  titleNode: ReactNode
  /** Right-side header text (e.g. Load range). */
  aside?: ReactNode
  toggle?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-1.5">
        <div className="min-w-0 flex-1">{titleNode}</div>
        {aside ? (
          <div className="shrink-0 text-xs font-semibold tracking-tight text-slate-800 sm:text-sm">
            {aside}
          </div>
        ) : null}
        {toggle}
      </div>
      <div className="p-2.5 sm:p-3">{children}</div>
    </section>
  )
}

function SectionVisibilityToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-medium text-slate-600">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-teal-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      Show
    </label>
  )
}

function CertificateFormatPreview({
  template,
  equipmentName,
  letterhead,
  rawDataColumnLabels,
  onChange,
}: {
  template: CalibrationCertificateTemplate
  equipmentName: string
  letterhead: ManagementDocLetterhead | null
  rawDataColumnLabels?: string[] | null
  onChange: (next: CalibrationCertificateTemplate) => void
}) {
  const patch = <K extends keyof CalibrationCertificateTemplate>(
    key: K,
    value: CalibrationCertificateTemplate[K],
  ) => onChange({ ...template, [key]: value })

  const resultsColumns = resolveResultsPreviewColumns(rawDataColumnLabels)
  const resultsRows = sampleResultsPreviewRows(resultsColumns.length)
  const resultsTableTextClass =
    resultsColumns.length > 14
      ? 'text-[5.5px] leading-[1.1] sm:text-[6px]'
      : resultsColumns.length > 10
        ? 'text-[6.5px] leading-[1.12] sm:text-[7px]'
        : 'text-[7.5px] leading-[1.15] sm:text-[8px]'

  const previewMinLoadDisplay = (() => {
    const loadColIdx = resultsColumns.findIndex((c) => /load/i.test(c))
    const idx = loadColIdx >= 0 ? loadColIdx : 0
    const nums: number[] = []
    for (const row of resultsRows) {
      const n = Number.parseFloat(String(row[idx] ?? '').replace(/,/g, '').trim())
      if (Number.isFinite(n)) nums.push(n)
    }
    if (nums.length === 0) return ''
    const unitMatch = (resultsColumns[idx] ?? '').match(
      /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
    )
    const unit = unitMatch ? unitMatch[1]!.replace(/^kn$/i, 'kN') : 'kN'
    return formatCertificateMinLoadDisplay(Math.min(...nums), unit)
  })()

  const previewLoadRangeLabel = (() => {
    const loadColIdx = resultsColumns.findIndex((c) => /load/i.test(c))
    const idx = loadColIdx >= 0 ? loadColIdx : 0
    const nums: number[] = []
    for (const row of resultsRows) {
      const n = Number.parseFloat(String(row[idx] ?? '').replace(/,/g, '').trim())
      if (Number.isFinite(n)) nums.push(n)
    }
    if (nums.length === 0) return 'Range = From Raw Data (Load min – max)'
    const unitMatch = (resultsColumns[idx] ?? '').match(
      /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
    )
    const unit = unitMatch ? unitMatch[1]!.replace(/^kn$/i, 'kN') : 'kN'
    const fmt = (n: number) =>
      Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    return `Range = ${fmt(min)} ${unit} - ${fmt(max)} ${unit}`
  })()

  const notesForPreview = applyCertificateNotesMinLoad(
    template.defaultNotes,
    previewMinLoadDisplay || '«min Load»',
  )

  const sheetClass =
    'mx-auto flex w-[8.5in] max-w-full flex-col gap-1.5 border-2 border-slate-800 bg-white pl-[10mm] pr-[5mm] pt-[2mm] pb-[2mm] shadow-lg outline outline-1 outline-offset-[3px] outline-slate-800 leading-none [&_*]:leading-none'

  const equipmentLabel = equipmentName.trim() || 'Sample Equipment'

  return (
    <div className="mx-auto flex w-full max-w-[8.5in] flex-col gap-3">
      {/* Page 1 */}
      <article className={cn(sheetClass, 'min-h-[11in]')} aria-label="Certificate format page 1">
        <PreviewLetterhead lh={letterhead} />

        <Input
          value={template.title}
          onChange={(e) => patch('title', e.target.value)}
          aria-label="Certificate title"
          className={cn(
            tplFieldClass,
            'h-8 text-center text-sm font-bold uppercase tracking-[0.18em] text-slate-900 sm:text-base',
          )}
        />

        <div className="grid grid-cols-2 items-center gap-2 border border-slate-400 bg-white px-2 py-1 text-xs font-bold text-slate-900 sm:text-sm">
          <div className="flex items-center">
            <span>Certificate No : </span>
            <span>QI/CC/SAMPLE/001</span>
          </div>
          <div className="flex items-center justify-end text-right">
            <span>ULR : </span>
            <span>CCXXXXXX0000000001F</span>
          </div>
        </div>

        <div className="w-full overflow-hidden border border-slate-400">
          <div className="grid grid-cols-2 items-stretch">
            <div className="flex min-h-[72px] flex-col justify-center space-y-1 border-r border-slate-400 bg-white p-2 text-[10px] text-slate-700">
              <p className="flex items-start">
                <span className="font-medium text-slate-700">Customer Name:</span>{' '}
                <span className="font-semibold text-slate-800">
                  Quality Engineering Private Limited
                </span>
                , Plot No 7A, Avinash logistic Park, SKS Road, Siltara Industrial
                Area, Phase - II, Raipur - 493221, Chhattisgarh, INDIA.
              </p>
              <p className="flex items-center">Amit Kumar (+91 90410 63388)</p>
              <p className="flex items-center">amitrajput183@gmail.com</p>
            </div>
            <div className="ml-auto grid w-full max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-0 bg-white p-2 text-[10px] leading-none">
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                SRF No
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <span className="flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                SRF/SAMPLE/001
              </span>

              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                Issue Date
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <span className="flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                = Certificate prepare date
              </span>

              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                WI No
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <input
                type="text"
                value={template.workInstructionNumber}
                onChange={(e) => patch('workInstructionNumber', e.target.value)}
                placeholder="WI/CAL/01"
                aria-label="Default work instruction number"
                className="m-0 flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-self-stretch border-0 bg-transparent p-0 text-right text-[10px] font-medium leading-none text-slate-800 outline-none"
              />

              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                Format No
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <input
                type="text"
                value={template.formatNumber}
                onChange={(e) => patch('formatNumber', e.target.value)}
                placeholder="QI/F/CC/…"
                aria-label="Default format number"
                className="m-0 flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-self-stretch border-0 bg-transparent p-0 text-right text-[10px] font-medium leading-none text-slate-800 outline-none"
              />

              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                Date of Calibration
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <span className="flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                Raw Data Sheet fill date
              </span>

              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-start text-left font-medium text-slate-700">
                Due Date of Calibration
              </span>
              <span className="flex h-4 min-h-4 max-h-4 items-center justify-self-center text-center">:</span>
              <span className="flex h-4 min-h-4 max-h-4 w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                Calibration Date + Frequency
              </span>
            </div>
          </div>
        </div>

        <PreviewSection
          titleNode={
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Input
                value={template.deviceSectionPrefix}
                onChange={(e) => patch('deviceSectionPrefix', e.target.value)}
                aria-label="Device section label"
                className={cn(
                  tplFieldClass,
                  'h-7 max-w-[260px] text-xs font-semibold tracking-tight text-slate-900 sm:text-sm',
                )}
              />
              <span className="text-xs font-semibold text-slate-900 sm:text-sm">:</span>
              <span className="truncate text-xs font-semibold text-slate-900 sm:text-sm">
                {equipmentLabel}
              </span>
            </div>
          }
        >
          <div className="grid grid-cols-2 divide-x divide-slate-300 border border-slate-300 text-[10px] text-slate-700">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center items-center gap-x-1.5 gap-y-1 px-2 py-1">
              {(
                [
                  ['Make', 'From SRF'],
                  ['Serial No', 'From SRF'],
                  ['Resolution', 'From SRF'],
                  ['Location', 'From Calibration Conduct'],
                  ['Referred Standard', 'From SRF'],
                ] as const
              ).map(([label, value]) => (
                <Fragment key={label}>
                  <span className="flex items-center justify-self-start text-left font-medium text-slate-700">
                    {label}
                  </span>
                  <span className="flex items-center justify-self-center select-none text-center" aria-hidden>
                    :
                  </span>
                  <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                    {value}
                  </span>
                </Fragment>
              ))}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center items-center gap-x-1.5 gap-y-1 px-2 py-1">
              {(
                [
                  ['Model', 'From SRF'],
                  ['Capacity', 'From SRF'],
                  ['ID Number', 'From SRF'],
                  ['Condition of DUC', 'From SRF'],
                  ['Mode of Calibration', 'From Range Points'],
                ] as const
              ).map(([label, value]) => (
                <Fragment key={label}>
                  <span className="flex items-center justify-self-start text-left font-medium text-slate-700">
                    {label}
                  </span>
                  <span className="flex items-center justify-self-center select-none text-center" aria-hidden>
                    :
                  </span>
                  <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                    {value}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          titleNode={
            <span className="text-xs font-semibold tracking-tight text-slate-900 sm:text-sm">
              Environment Condition
            </span>
          }
        >
          <div className="grid grid-cols-2 divide-x divide-slate-300 border border-slate-300 text-xs sm:text-sm">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-2 py-1">
              <span className="flex items-center justify-self-start text-left font-medium text-slate-900">
                Temperature (°C)
              </span>
              <span className="flex items-center justify-self-center select-none text-center font-medium" aria-hidden>
                :
              </span>
              <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                From Raw Data Sheet (Average) °C
              </span>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-2 py-1">
              <span className="flex items-center justify-self-start text-left font-medium text-slate-900">
                Humidity (%RH)
              </span>
              <span className="flex items-center justify-self-center select-none text-center font-medium" aria-hidden>
                :
              </span>
              <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right text-slate-500">
                From Raw Data Sheet (Average) %RH
              </span>
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          titleNode={
            <Input
              value={template.masterSectionTitle}
              onChange={(e) => patch('masterSectionTitle', e.target.value)}
              aria-label="Master section title"
              className={cn(
                tplFieldClass,
                'h-7 max-w-full text-xs font-semibold tracking-tight text-slate-900 sm:text-sm',
              )}
            />
          }
        >
          <div className="overflow-hidden border border-slate-300">
            <table className="w-full border-collapse text-xs sm:text-sm">
              <tbody>
                {(
                  [
                    ['Item Description', 'Sample Load Cell'],
                    ['Calibration Temperature', '23 °C'],
                    ['Serial Number', 'SN-001'],
                    ['Capacity & Class', '1000 kN / Class 1'],
                    ['Details of Indicator', '0.01 kN'],
                    ['Calibration Date', '30-12-2025'],
                    ['Calibration Due Date', '29-12-2026'],
                    ['Calibration Cert No.', 'MC/2025/001'],
                    ['Calibrated By', 'External Agency'],
                  ] as const
                ).map(([label, sample]) => (
                  <tr key={label}>
                    <td className="border border-slate-300 px-2 py-0.5 align-middle font-medium text-slate-900">
                      {label}
                    </td>
                    <td className="border border-slate-300 px-2 py-0.5 align-middle text-center text-slate-500">
                      {sample}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PreviewSection>

        <PreviewPageFooter lh={letterhead} pageLabel="01 of 02" />
      </article>

      {/* Page 2 */}
      <article className={cn(sheetClass, 'min-h-[11in]')} aria-label="Certificate format page 2">
        <PreviewLetterhead lh={letterhead} />
        <div className="grid grid-cols-2 gap-2 border border-slate-400 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 sm:text-sm">
          <div>
            <span>Certificate No : </span>
            <span>QI/CC/SAMPLE/001</span>
          </div>
          <div className="text-right">
            <span>ULR : </span>
            <span>CCXXXXXX0000000001F</span>
          </div>
        </div>

        <PreviewSection
          titleNode={
            <Input
              value={template.resultsSectionTitle}
              onChange={(e) => patch('resultsSectionTitle', e.target.value)}
              aria-label="Results section title"
              className={cn(
                tplFieldClass,
                'h-7 max-w-full text-xs font-semibold tracking-tight text-slate-900 sm:text-sm',
              )}
            />
          }
          aside={<span aria-label="Calibration load range">{previewLoadRangeLabel}</span>}
        >
          <div className="w-full overflow-hidden border border-slate-300">
            <table
              className={cn(
                'w-full table-fixed border-collapse',
                resultsTableTextClass,
              )}
            >
              <thead>
                <tr className="bg-slate-100">
                  {resultsColumns.map((col) => (
                    <th
                      key={col}
                      className="border border-slate-300 px-px py-0.5 text-center align-middle font-semibold text-slate-700 break-words hyphens-auto [overflow-wrap:anywhere]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultsRows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, cellIdx) => (
                      <td
                        key={`${idx}-${cellIdx}`}
                        className="border border-slate-300 px-px py-0.5 text-center align-middle break-all text-slate-500"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PreviewSection>

        <div className="overflow-hidden border border-slate-300 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
            <span className="text-[10px] font-semibold text-slate-600">Summary line</span>
            <SectionVisibilityToggle
              checked={template.showSummaryLine}
              onChange={(v) => patch('showSummaryLine', v)}
              label="Show summary line"
            />
          </div>
          {template.showSummaryLine ? (
            <div className="grid grid-cols-3 divide-x divide-slate-300 px-0 py-1.5 text-[8px] font-bold text-slate-800 sm:text-[9px]">
              <div className="flex min-w-0 items-center px-1.5">
                <span className="shrink-0 whitespace-nowrap font-bold">
                  Maximum Zero Reading Observed
                </span>
                <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                  :
                </span>
                <span
                  className="max-w-[48%] shrink truncate whitespace-nowrap text-right font-bold text-slate-800"
                  title="Max of Relative Resolution @ Fi (with unit)"
                >
                  Max of Relative Resolution @ Fi (with unit)
                </span>
              </div>
              <div className="flex min-w-0 items-center px-1.5">
                <span className="shrink-0 whitespace-nowrap font-bold">
                  Maximum Relative Zero Error
                </span>
                <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                  :
                </span>
                <span
                  className="max-w-[48%] shrink truncate whitespace-nowrap text-right font-bold text-slate-800"
                  title="(Max Relative Resolution @ Fi ÷ Capacity) × 100 %"
                >
                  (Max Relative Resolution @ Fi ÷ Capacity) × 100 %
                </span>
              </div>
              <div className="flex min-w-0 items-center px-1.5">
                <span className="shrink-0 whitespace-nowrap font-bold">
                  Uncertainty Reported
                </span>
                <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                  :
                </span>
                <span
                  className="max-w-[48%] shrink truncate whitespace-nowrap text-right font-bold text-slate-800"
                  title="Max of Masters’ U & Actual Expanded Uncertainty (±)"
                >
                  Max of Masters’ U & Actual Expanded Uncertainty (±)
                </span>
              </div>
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[10px] italic text-slate-400">Hidden on certificate</p>
          )}
        </div>

        <div className="overflow-hidden border border-slate-300 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
            <span className="text-[10px] font-semibold text-slate-600">Notes / Remarks</span>
            <SectionVisibilityToggle
              checked={template.showNotesRemarks}
              onChange={(v) => patch('showNotesRemarks', v)}
              label="Show notes and remarks"
            />
          </div>
          {template.showNotesRemarks ? (
            <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-wide text-slate-600">
                  Notes
                </p>
                <Textarea
                  value={notesForPreview}
                  onChange={(e) => {
                    let next = e.target.value
                    if (previewMinLoadDisplay) {
                      next = next
                        .split(previewMinLoadDisplay)
                        .join(CERTIFICATE_NOTES_MIN_LOAD_TOKEN)
                    }
                    patch('defaultNotes', ensureCertificateNotesMinLoadToken(next))
                  }}
                  rows={8}
                  aria-label="Default certificate notes"
                  className="min-h-[140px] resize-y border-dashed border-teal-400 bg-teal-50/30 font-mono text-[10px] focus-visible:ring-teal-500"
                />
                <p className="text-[9px] text-slate-500">
                  Note 4 load = minimum value from Raw Data column &quot;Load&quot;
                  {previewMinLoadDisplay ? ` (preview ${previewMinLoadDisplay})` : ''}.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-wide text-slate-600">
                  Remarks
                </p>
                <Textarea
                  value={template.defaultRemarks}
                  onChange={(e) => patch('defaultRemarks', e.target.value)}
                  rows={8}
                  aria-label="Default certificate remarks"
                  className="min-h-[140px] resize-y border-dashed border-teal-400 bg-teal-50/30 font-mono text-[10px] focus-visible:ring-teal-500"
                />
              </div>
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[10px] italic text-slate-400">Hidden on certificate</p>
          )}
        </div>

        <p className="flex w-full items-center gap-2 py-1 text-[10px] font-bold tracking-wide text-slate-900 sm:text-xs">
          <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" aria-hidden>
            {'='.repeat(200)}
          </span>
          <span className="shrink-0 whitespace-nowrap">End of Calibration Certificate</span>
          <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-right" aria-hidden>
            {'='.repeat(200)}
          </span>
        </p>

        <div className="overflow-hidden border border-slate-300 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
            <span className="text-[10px] font-semibold text-slate-600">Signature block</span>
            <SectionVisibilityToggle
              checked={template.showSignatures}
              onChange={(v) => patch('showSignatures', v)}
              label="Show signature block"
            />
          </div>
          {template.showSignatures ? (
            <div className="flex gap-6 px-2 py-6">
              <div className="min-w-0 flex-1 space-y-1 text-center">
                <div className="mb-8 border-b border-dashed border-slate-400" />
                <Input
                  value={template.calibratedByLabel}
                  onChange={(e) => patch('calibratedByLabel', e.target.value)}
                  aria-label="Calibrated by label"
                  className={cn(
                    tplFieldClass,
                    'mx-auto h-7 max-w-[200px] text-center text-xs font-semibold',
                  )}
                />
                <div className="mx-auto flex w-full max-w-[280px] items-center gap-1.5">
                  <Input
                    value={template.signatureNameLabel}
                    onChange={(e) => patch('signatureNameLabel', e.target.value)}
                    aria-label="Name label"
                    className={cn(
                      tplFieldClass,
                      'h-6 min-w-0 flex-1 text-center text-[10px] font-medium',
                    )}
                  />
                  <Input
                    value={template.signatureDesignationLabel}
                    onChange={(e) => patch('signatureDesignationLabel', e.target.value)}
                    aria-label="Designation label"
                    className={cn(
                      tplFieldClass,
                      'h-6 min-w-0 flex-1 text-center text-[10px] font-medium',
                    )}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-center">
                <div className="mb-8 border-b border-dashed border-slate-400" />
                <Input
                  value={template.authorizedSignatoryLabel}
                  onChange={(e) => patch('authorizedSignatoryLabel', e.target.value)}
                  aria-label="Authorized signatory label"
                  className={cn(
                    tplFieldClass,
                    'mx-auto h-7 max-w-[220px] text-center text-xs font-semibold',
                  )}
                />
                <div className="mx-auto flex w-full max-w-[280px] items-center gap-1.5">
                  <Input
                    value={template.signatureNameLabel}
                    onChange={(e) => patch('signatureNameLabel', e.target.value)}
                    aria-label="Name label (authorized)"
                    className={cn(
                      tplFieldClass,
                      'h-6 min-w-0 flex-1 text-center text-[10px] font-medium',
                    )}
                  />
                  <Input
                    value={template.signatureDesignationLabel}
                    onChange={(e) => patch('signatureDesignationLabel', e.target.value)}
                    aria-label="Designation label (authorized)"
                    className={cn(
                      tplFieldClass,
                      'h-6 min-w-0 flex-1 text-center text-[10px] font-medium',
                    )}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[10px] italic text-slate-400">Hidden on certificate</p>
          )}
        </div>

        <PreviewPageFooter lh={letterhead} pageLabel="02 of 02" />
      </article>
    </div>
  )
}

export function CertificateFormatDialog({
  open,
  onOpenChange,
  value,
  equipmentName,
  rawDataColumnLabels,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: CalibrationCertificateTemplate
  equipmentName?: string
  /** Column labels from Calibration Equipment Raw Data Sheet template. */
  rawDataColumnLabels?: string[] | null
  onChange: (next: CalibrationCertificateTemplate) => void
}) {
  const [draft, setDraft] = useState<CalibrationCertificateTemplate>(() =>
    parseCalibrationCertificateTemplate(value),
  )
  const [letterhead, setLetterhead] = useState<ManagementDocLetterhead | null>(null)

  useEffect(() => {
    if (!open) return
    const parsed = parseCalibrationCertificateTemplate(value)
    setDraft({
      ...parsed,
      defaultNotes: ensureCertificateNotesMinLoadToken(parsed.defaultNotes),
    })
    let cancelled = false
    void (async () => {
      try {
        const [lh, named] = await Promise.all([
          fetchManagementDocLetterhead(),
          resolveNamedLetterheadTemplates(
            CALIBRATION_LETTERHEAD_HEADER,
            CALIBRATION_LETTERHEAD_FOOTER,
          ).catch(() => ({ headerUrl: null, footerUrl: null })),
        ])
        if (cancelled) return
        setLetterhead({
          ...lh,
          headerUrl: named.headerUrl ?? lh.headerUrl,
          footerUrl: named.footerUrl ?? lh.footerUrl,
        })
      } catch {
        if (!cancelled) setLetterhead(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, value])

  const handleDone = () => {
    const equipmentLabel = equipmentName?.trim() || ''
    onChange(
      serializeCalibrationCertificateTemplate({
        ...draft,
        // Bind template to this equipment only — never overwrite other equipment formats.
        layoutName: equipmentLabel || draft.layoutName,
      }),
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Certificate Format
              {equipmentName?.trim() ? ` — ${equipmentName.trim()}` : ''}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
          <CertificateFormatPreview
            template={draft}
            equipmentName={equipmentName ?? ''}
            letterhead={letterhead}
            rawDataColumnLabels={rawDataColumnLabels}
            onChange={setDraft}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={handleDone}
            aria-label="Save certificate format and close"
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CertificateFormatButton({
  configured,
  onClick,
  className,
}: {
  configured?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'relative h-8 shrink-0 rounded-none border-stone-500 bg-stone-50 text-stone-800 hover:bg-stone-100 hover:text-stone-900',
        className,
      )}
      onClick={onClick}
      aria-label="Certificate Format"
    >
      <FileText size={16} className="mr-1.5" aria-hidden />
      Certificate Format
      {configured ? (
        <span
          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-600"
          aria-hidden
          title="Certificate format configured"
        />
      ) : null}
    </Button>
  )
}
