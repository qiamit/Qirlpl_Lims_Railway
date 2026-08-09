import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { ArrowRight, Download, FileCheck, Printer, RefreshCw, Save } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  calculateNextDueDate,
  formatManualDaysFrequency,
  isPresetFrequency,
  parseManualIntervalDays,
  parseStoredFrequency,
  type Frequency,
} from '@/features/calibration/equipment-for-calibration/types'
import {
  formatThermalExpansionDisplay,
  parseThermalExpansion,
} from '@/features/calibration/equipment-for-calibration/thermalExpansion'
import {
  masterEquipmentIdsFromTabs,
  parseMeasurementRanges,
  resolveEquipmentModeOfCalibration,
  type MeasurementRangeStored,
} from '@/features/calibration/equipments/types'
import {
  defaultCalibrationCertificateTemplate,
  resolveCertificateTemplateFromEquipment,
  type CalibrationCertificateTemplate,
} from '@/features/calibration/equipments/certificateTemplateTypes'
import {
  parseRawDataSheetPayload,
  getEnvironmentAverageParamValue,
  type RawDataEnvironmentConditions,
  type RawDataSheetPayload,
} from '@/features/calibration/rawDataSheetTypes'
import { cn } from '@/lib/utils'
import type { CalibrationJobRow } from '../types'
import {
  fetchCertificateDraftByJobId,
  fetchMasterEquipmentsByIds,
  fetchRawDataSheetByJobId,
  fetchSrfSummaryForSheet,
  fetchUserProfileBrief,
  resolveEquipmentMasterForJob,
  suggestCalibrationCertificateNumber,
  updateCalibrationJobCertificateDraft,
  type MasterEquipmentForSheet,
  type SrfSummaryForSheet,
} from '../jobs/calibrationJobApi'
import {
  buildCalibrationUlrHeaderPrefix,
  fetchNextCalibrationNablUlrNumber,
  formatNablUlrNumber,
  sanitizeNablUlrInput,
} from '@/features/sample-handling/report-preparation/nablUlrNumber'
import {
  fetchManagementDocLetterhead,
  formatNablCertificateNo,
  type ManagementDocLetterhead,
} from '@/features/management-docs/fetchManagementDocLetterhead'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import {
  DEFAULT_CERTIFICATE_NOTES,
  DEFAULT_CERTIFICATE_REMARKS,
  EMPTY_CERTIFICATE_DRAFT,
  applyCertificateNotesMinLoad,
  composeCustomerContactDetails,
  formatCertificateMinLoadDisplay,
  parseCertificateDraft,
  parseCustomerContactDetails,
  serializeCertificateDraft,
  type CertificateDraftPayload,
} from './certificateDraftTypes'
import { waitForPrintDocumentReady } from '@/features/sample-handling/report-preparation/waitForPrintDocumentReady'
import { downloadCertificatePagesAsPdf } from './downloadCertificatePagesAsPdf'

/** Wait until certificate letterhead / footer images inside host are decoded. */
async function waitForCertificateImagesReady(
  host: HTMLElement | null,
  timeoutMs = 15000,
): Promise<void> {
  if (!host) {
    await waitForPrintDocumentReady(document, timeoutMs)
    return
  }
  const images = Array.from(host.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          img.loading = 'eager'
          const src = img.currentSrc || img.src
          if (src) {
            // Kick decode for images that were covered / deferred
            img.src = src
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          if (typeof img.decode === 'function') {
            void img.decode().then(done).catch(done)
          }
          window.setTimeout(done, timeoutMs)
        }),
    ),
  )
  await waitForPrintDocumentReady(document, Math.min(timeoutMs, 5000))
  await new Promise<void>((r) => window.setTimeout(r, 200))
}


/** Lab Settings → Letter Head Templates (same as Certificate Format). */
const CALIBRATION_LETTERHEAD_HEADER = 'NABL Letter Head for Calibration'
const CALIBRATION_LETTERHEAD_FOOTER = 'General Letter Footer'

function formatCertEnvNumber(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  const n = Number.parseFloat(t.replace(/,/g, ''))
  if (!Number.isFinite(n)) return t
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

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

function CertificateLetterhead({ lh }: { lh: ManagementDocLetterhead | null }) {
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
          loading="eager"
          decoding="sync"
        />
      </header>
    )
  }

  return (
    <header className="certificate-page-header w-full shrink-0 bg-white pb-1">
      {/* Logos row */}
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

      {/* Accreditation — full letter width bar */}
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

function CertificatePageFooter({
  lh,
  pageLabel,
}: {
  lh: ManagementDocLetterhead | null
  pageLabel: string
}) {
  const firmName = (lh?.labName ?? '').trim() || 'Laboratory'
  const { address, contact } = formatLabFooterParts(lh)
  const footerImageUrl = (lh?.footerUrl ?? '').trim() || null

  /** Letter Head Templates → Footer image (Lab Settings) — same as Certificate Format. */
  if (footerImageUrl) {
    return (
      <footer className="certificate-page-footer relative mt-auto shrink-0">
        <div className="relative -ml-[10mm] -mr-[5mm] w-[calc(100%+15mm)]">
          <img
            src={footerImageUrl}
            alt={`${firmName} letterhead footer`}
            className="w-full max-w-none object-contain object-bottom"
            loading="eager"
            decoding="sync"
          />
          <p className="pointer-events-none absolute bottom-1 right-[5mm] whitespace-nowrap text-right text-[9px] font-medium leading-none text-slate-800 sm:text-[10px]">
            Page No : {pageLabel.trim() || '—'}
          </p>
        </div>
      </footer>
    )
  }

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

function CertificateNumberUlrBar({
  pageKey,
  certificateNumber,
  ulrNumber,
  ulrPlaceholder,
  onCertificateNumberChange,
  onUlrNumberChange,
  onAutoCertificate,
  onAutoUlr,
  autoNumbering,
  autoUlrNumbering,
  controlsDisabled,
}: {
  pageKey: string
  certificateNumber: string
  ulrNumber: string
  ulrPlaceholder: string
  onCertificateNumberChange: (value: string) => void
  onUlrNumberChange: (value: string) => void
  onAutoCertificate: () => void
  onAutoUlr: () => void
  autoNumbering: boolean
  autoUlrNumbering: boolean
  controlsDisabled: boolean
}) {
  const certId = `cert-number-${pageKey}`
  const ulrId = `cert-ulr-${pageKey}`
  return (
    <div className="certificate-number-ulr-bar w-full shrink-0 overflow-hidden border border-slate-400">
      <div className="grid grid-cols-2">
        <div
          className={cn(
            'flex min-h-[32px] items-center gap-1 bg-white p-1.5',
            'border-r border-slate-400',
          )}
        >
          <Label htmlFor={certId} className="sr-only">
            Certificate Number
          </Label>
          <span className="shrink-0 text-xs font-bold text-slate-900 sm:text-sm">
            Certificate No
          </span>
          <span className={cn(certMetaSepClass, 'font-bold')} aria-hidden>
            :
          </span>
          <Input
            id={certId}
            value={certificateNumber}
            onChange={(e) => onCertificateNumberChange(e.target.value)}
            placeholder="e.g. QI/CC/2026/0001"
            className={cn(certCellSingleLineClass, 'min-w-0 flex-1 font-bold')}
            aria-label="Certificate Number"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="certificate-draft-no-print h-7 shrink-0 gap-1 px-2 text-[10px]"
            disabled={controlsDisabled || autoNumbering}
            onClick={onAutoCertificate}
            aria-label="Auto create certificate number"
          >
            <RefreshCw
              size={12}
              className={cn(autoNumbering && 'animate-spin')}
              aria-hidden
            />
            {autoNumbering ? '…' : 'Auto'}
          </Button>
        </div>
        <div className="flex min-h-[32px] w-full items-center justify-between gap-2 bg-white p-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="certificate-draft-no-print h-7 shrink-0 gap-1 px-2 text-[10px]"
            disabled={controlsDisabled || autoUlrNumbering}
            onClick={onAutoUlr}
            aria-label="Auto create NABL ULR number"
          >
            <RefreshCw
              size={12}
              className={cn(autoUlrNumbering && 'animate-spin')}
              aria-hidden
            />
            {autoUlrNumbering ? '…' : 'Auto'}
          </Button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Label htmlFor={ulrId} className="sr-only">
              ULR Number
            </Label>
            <span className="shrink-0 whitespace-nowrap text-xs font-bold text-slate-900 sm:text-sm">
              ULR
            </span>
            <span className="shrink-0 select-none text-xs font-bold text-slate-900 sm:text-sm" aria-hidden>
              :
            </span>
            <Input
              id={ulrId}
              value={ulrNumber}
              onChange={(e) => onUlrNumberChange(sanitizeNablUlrInput(e.target.value))}
              placeholder={ulrPlaceholder}
              maxLength={19}
              className={cn(
                certCellSingleLineClass,
                'm-0 h-7 w-[19ch] min-w-0 border-0 bg-transparent p-0 text-left text-xs font-bold shadow-none focus-visible:ring-0 sm:text-sm',
              )}
              aria-label="ULR Number"
              title="NABL 18-position ULR (19 chars): CC/TC + cert + YY + location + 8-digit serial + F"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function CertificateLetterPage({
  children,
  lh,
  numberBar,
  pageLabel,
  isLast = false,
  grow = false,
}: {
  children: ReactNode
  lh: ManagementDocLetterhead | null
  /** Certificate No + ULR row — shown under letterhead on every page. */
  numberBar?: ReactNode
  /** e.g. "01 of 02" — shown in footer. */
  pageLabel: string
  isLast?: boolean
  /** Allow sheet taller than Letter when content overflows (continuation pages). */
  grow?: boolean
}) {
  return (
    <article
      className={cn(
        'certificate-letter-sheet mx-auto flex w-[8.5in] max-w-full flex-col gap-1.5 leading-none [&_*]:leading-none',
        grow ? 'certificate-letter-sheet--grow min-h-[11in]' : 'h-[11in]',
        'border-2 border-slate-800 bg-white pl-[10mm] pr-[5mm] pt-[2mm] pb-[2mm]',
        'shadow-lg outline outline-1 outline-offset-[3px] outline-slate-800 print:shadow-none',
        !isLast && 'certificate-letter-sheet--break',
      )}
      aria-label="Calibration certificate Letter page"
    >
      <CertificateLetterhead lh={lh} />
      {numberBar}
      {/* Natural height — do not flex-grow, or SectionCards stretch with empty space */}
      <div className="flex w-full flex-col gap-1.5">{children}</div>
      <div className="min-h-0 flex-1" aria-hidden />
      <CertificatePageFooter lh={lh} pageLabel={pageLabel} />
    </article>
  )
}

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

/** Numeric raw-data cells on certificate → always 2 decimal places. */
function formatCertRawCell(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  if (!t) return '—'
  const normalized = t.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return t
  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n)) return t
  return n.toFixed(2)
}

function parseNumericMagnitude(raw: string | null | undefined): number | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  // Prefer the ±U half when value looks like "0.31±0.31"
  const pm = t.match(/±\s*(-?\d+(?:\.\d+)?)/)
  if (pm?.[1]) {
    const n = Math.abs(Number.parseFloat(pm[1]))
    return Number.isFinite(n) ? n : null
  }
  const m = t.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Math.abs(Number.parseFloat(m[0]))
  return Number.isFinite(n) ? n : null
}

function formatMagnitudeDisplay(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Parse instrument max capacity from strings like "0 - 1000 kN" or "1000 kN". */
function parseInstrumentMaxCapacity(rangeText: string | null | undefined): number | null {
  const t = String(rangeText ?? '').trim()
  if (!t) return null
  const nums = [...t.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((m) => Number.parseFloat(m[0]!))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return null
  return Math.max(...nums.map((n) => Math.abs(n)))
}

function findCertColumnByPatterns(
  columns: Array<{ key: string; label: string }>,
  patterns: RegExp[],
): { key: string; label: string } | null {
  for (const re of patterns) {
    const hit = columns.find((c) => re.test(`${c.label} ${c.key}`))
    if (hit) return hit
  }
  return null
}

function maxMagnitudeFromColumn(
  rows: Array<{ values: Record<string, string> }>,
  colKey: string,
): number | null {
  let max: number | null = null
  for (const row of rows) {
    const n = parseNumericMagnitude(row.values[colKey])
    if (n == null) continue
    if (max == null || n > max) max = n
  }
  return max
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function takePrefixed(parts: string[], prefix: RegExp): string {
  const idx = parts.findIndex((p) => prefix.test(p))
  if (idx < 0) return ''
  const raw = parts[idx]!
  parts.splice(idx, 1)
  return raw.replace(prefix, '').trim()
}

function parseJobEquipmentFields(job: CalibrationJobRow) {
  const empty = {
    leastCount: '',
    range: '',
    make: '',
    model: '',
    serial: '',
    quantity: '',
    accuracy: '',
    condition: '',
    physical: '',
    calMethod: '',
    customerId: '',
    frequency: '',
  }
  const text = (job.equipment_detail || job.equipment_label || '').trim()
  if (!text) return empty
  const parts = text.split('·').map((p) => p.trim()).filter(Boolean)
  parts.shift()
  const eqidIdx = parts.findIndex((p) => /^eqid\s+/i.test(p))
  if (eqidIdx >= 0) parts.splice(eqidIdx, 1)
  return {
    leastCount: takePrefixed(parts, /^lc\s+/i),
    range: takePrefixed(parts, /^range\s+/i),
    make: takePrefixed(parts, /^make\s+/i),
    model: takePrefixed(parts, /^model\s+/i),
    serial: takePrefixed(parts, /^s\/n\s+/i),
    accuracy: takePrefixed(parts, /^accuracy\s+/i),
    condition: takePrefixed(parts, /^condition\s+/i),
    physical: takePrefixed(parts, /^physical\s+/i),
    calMethod: takePrefixed(parts, /^cal\s*method\s+/i),
    customerId: takePrefixed(parts, /^cust(?:omer)?\s*id\s+/i),
    frequency: takePrefixed(parts, /^freq\s+/i),
    quantity: takePrefixed(parts, /^qty\s+/i),
  }
}

function formatDisplayDate(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return '—'
  const d = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return cellText(raw)
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

function collectMasterIdsFromEquipment(
  equipment: {
    measurement_ranges: unknown
    range_capacity: string | null
    resolution_least_count: string | null
    master_equipment_id?: string | null
  },
  extraIds: string[],
): string[] {
  const ranges = parseMeasurementRanges(
    equipment.measurement_ranges as MeasurementRangeStored[] | null,
    equipment.range_capacity,
    equipment.resolution_least_count,
    equipment.master_equipment_id,
  )
  const out: string[] = []
  const add = (raw: string) => {
    const id = raw.trim()
    if (id && !out.includes(id)) out.push(id)
  }
  for (const range of ranges) {
    for (const id of masterEquipmentIdsFromTabs(range.masterPointsTabs ?? [])) add(id)
    for (const id of range.masterEquipmentIds ?? []) add(id)
  }
  add((equipment.master_equipment_id ?? '').trim())
  for (const id of extraIds) add(id)
  return out
}

function isoDateOnly(value: string | null | undefined): string {
  const d = String(value ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

/**
 * Due Date = Calibration Date + Frequency (preset or "N Days" from Raw Data Sheet).
 * Default frequency Yearly when blank.
 */
function computeDueFromFrequency(calDate: string, frequency: string): string {
  const date = isoDateOnly(calDate)
  if (!date) return ''
  const raw = frequency.trim() || 'Yearly'
  const parsed = parseStoredFrequency(raw)
  const manualDays = parseManualIntervalDays(raw) ?? parseManualIntervalDays(parsed)
  const forCalc: Frequency =
    manualDays != null
      ? formatManualDaysFrequency(manualDays)
      : isPresetFrequency(parsed)
        ? parsed
        : isPresetFrequency(raw)
          ? (raw as Frequency)
          : 'Yearly'
  return calculateNextDueDate(date, forCalc) || ''
}

function srfCustomerContactFields(srf: SrfSummaryForSheet | null): {
  person: string
  mobile: string
  email: string
} {
  if (!srf) return { person: '', mobile: '', email: '' }
  return {
    person: (srf.contact_person ?? '').trim(),
    mobile: (srf.contact_phone ?? '').trim(),
    email: (srf.contact_email ?? '').trim(),
  }
}

/** Continuous-text certificate field styles. */
const certCellInputClass =
  'h-7 border-0 bg-transparent px-0 text-xs font-medium text-slate-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm'

const certCellSingleLineClass =
  'h-7 w-full border-0 bg-transparent px-0 text-xs font-medium text-slate-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm'

/** Right-side certificate meta: Label | : | Value (left / centre / right). */
const certMetaBlockClass =
  'ml-auto grid w-full max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-0 leading-none'

/** Uniform row height — same as Dated lines (no tall inputs stretching gaps). */
const certMetaRowH = 'h-4 min-h-4 max-h-4'

const certMetaLabelClass = cn(
  certMetaRowH,
  'flex items-center justify-self-start text-left text-xs font-medium leading-none text-slate-900 sm:text-sm',
)

const certMetaSepClass = cn(
  certMetaRowH,
  'flex select-none items-center justify-self-center text-center text-xs font-medium leading-none text-slate-900 sm:text-sm',
)

const certMetaValueTextClass = cn(
  certMetaRowH,
  'flex w-full min-w-0 items-center justify-end text-right text-xs font-medium leading-none text-slate-900 sm:text-sm',
)

/** Value-column input — fills right cell, text right-aligned. */
function CertMetaInput({
  id,
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  'aria-label': string
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        certMetaRowH,
        'm-0 w-full min-w-0 border-0 bg-transparent p-0 text-right text-xs font-medium leading-none text-slate-900 shadow-none outline-none ring-0 focus:outline-none focus:ring-0 sm:text-sm',
      )}
    />
  )
}

function CertMetaRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <>
      {htmlFor ? (
        <Label htmlFor={htmlFor} className={certMetaLabelClass}>
          {label}
        </Label>
      ) : (
        <span className={certMetaLabelClass}>{label}</span>
      )}
      <span className={certMetaSepClass} aria-hidden>
        :
      </span>
      <div
        className={cn(
          certMetaRowH,
          'flex min-w-0 items-center justify-end justify-self-stretch text-right',
        )}
      >
        {children}
      </div>
    </>
  )
}

/** Textarea that grows with content — no internal scrollbar. */
function CertAutoGrowTextarea({
  value,
  onChange,
  className,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  className?: string
} & Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'onChange' | 'className'
>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const syncHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    syncHeight()
  }, [value, syncHeight])

  return (
    <Textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => {
        onChange(e.target.value)
        // Grow immediately on keystroke (before next paint with new value).
        requestAnimationFrame(syncHeight)
      }}
      className={cn(
        certCellInputClass,
        'h-auto min-h-0 w-full resize-none overflow-hidden whitespace-pre-wrap break-words leading-snug',
        className,
      )}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Certificate customer block (continuous):
 * Customer Name: Firm, Address…
 * Contact Person (Mobile)
 * Email
 */
function CustomerBlockContinuous({
  name,
  address,
  person,
  mobile,
  email,
  onChange,
}: {
  name: string
  address: string
  person: string
  mobile: string
  email: string
  onChange: (next: {
    name: string
    address: string
    person: string
    mobile: string
    email: string
  }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)

  const buildHtml = useCallback(
    (n: string, a: string, p: string, m: string, e: string) => {
      const firm = escapeHtml(n.trim())
      const addr = escapeHtml(a.trim().replace(/\s*\n+\s*/g, ', '))
      const contact = escapeHtml(p.trim())
      const phone = escapeHtml(m.trim())
      const mail = escapeHtml(e.trim())

      if (!firm && !addr && !contact && !phone && !mail) {
        return (
          '<span class="text-slate-400">' +
          'Customer Name: Company Name, Address…<br/>' +
          'Contact Person (Mobile)<br/>' +
          'Email' +
          '</span>'
        )
      }

      const line1 =
        `Customer Name: <strong class="font-semibold">${firm || '—'}</strong>` +
        (addr ? `, ${addr}` : '')
      const line2 =
        contact && phone
          ? `${contact} (${phone})`
          : contact || (phone ? `(${phone})` : '')
      const line3 = mail
      return [line1, line2, line3].filter(Boolean).join('<br/>')
    },
    [],
  )

  const syncFromProps = useCallback(() => {
    const el = ref.current
    if (!el || focusedRef.current) return
    el.innerHTML = buildHtml(name, address, person, mobile, email)
  }, [address, buildHtml, email, mobile, name, person])

  useEffect(() => {
    syncFromProps()
  }, [syncFromProps])

  const commitFromDom = useCallback(() => {
    const el = ref.current
    if (!el) return
    const strong = el.querySelector('strong')
    let firm = (strong?.textContent ?? '').trim()
    if (firm === '—') firm = ''

    const lines = (el.innerText ?? '')
      .replace(/\u00a0/g, ' ')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    let addr = ''
    let contact = ''
    let phone = ''
    let mail = ''

    const first = lines[0] ?? ''
    let restFirst = first.replace(/^Customer Name(?::-|:)\s*/i, '')
    if (firm && restFirst.startsWith(firm)) {
      restFirst = restFirst.slice(firm.length)
    }
    addr = restFirst.replace(/^[\s,]*/, '').trim()

    const remaining = lines.slice(1)
    for (const line of remaining) {
      const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      if (emailMatch && !mail) {
        mail = emailMatch[0]
        continue
      }
      if (!contact && !phone) {
        const withPhone = line.match(/^(.+?)\s*\((.+)\)\s*$/)
        if (withPhone) {
          contact = withPhone[1]!.trim()
          phone = withPhone[2]!.trim()
        } else {
          contact = line
        }
      } else if (!mail) {
        mail = line
      }
    }

    onChange({
      name: firm,
      address: addr,
      person: contact,
      mobile: phone,
      email: mail,
    })
  }, [onChange])

  return (
    <div
      ref={ref}
      id="cert-customer-block"
      role="textbox"
      aria-multiline="true"
      aria-label="Customer name, address and contact"
      contentEditable
      suppressContentEditableWarning
      className={cn(
        'w-full cursor-text break-words border-0 bg-transparent px-0 text-xs font-medium leading-snug text-slate-900 shadow-none outline-none sm:text-sm',
        'relative z-0 block h-auto min-h-[3.5rem] overflow-visible whitespace-pre-wrap',
      )}
      onFocus={() => {
        focusedRef.current = true
        const el = ref.current
        if (!el) return
        if (!name.trim() && !address.trim() && !person.trim() && !mobile.trim() && !email.trim()) {
          el.innerHTML =
            'Customer Name: <strong class="font-semibold"></strong>,&nbsp;<br/><br/>'
        }
      }}
      onBlur={() => {
        focusedRef.current = false
        commitFromDom()
      }}
    />
  )
}

function DucFieldLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="flex items-center justify-self-start text-left text-xs font-medium leading-none text-slate-900 sm:text-sm">
        {label}
      </span>
      <span
        className="flex select-none items-center justify-self-center text-center text-xs font-medium leading-none text-slate-900 sm:text-sm"
        aria-hidden
      >
        :
      </span>
      <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right text-xs font-medium leading-none text-slate-900 sm:text-sm">
        {cellText(value)}
      </span>
    </>
  )
}

/** Shared vertical tracks: Label | : | Value (aligned across rows). */
const ducColumnGridClass =
  'grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center items-center gap-x-1.5 gap-y-1 leading-none'

const MASTER_CERT_ROWS: Array<{
  label: string
  getValue: (master: MasterEquipmentForSheet) => string
}> = [
  {
    label: 'Item Description',
    getValue: (m) => (m.equipment_name ?? '').trim(),
  },
  {
    label: 'Calibration Temperature',
    getValue: (m) => (m.calibration_temperature ?? '').trim(),
  },
  {
    label: 'Coefficient of Thermal Expansion',
    getValue: (m) => {
      const raw = (m.coefficient_of_thermal_expansion ?? '').trim()
      if (!raw) return ''
      const parts = parseThermalExpansion(raw)
      return parts ? formatThermalExpansionDisplay(parts) : raw
    },
  },
  {
    label: 'Serial Number',
    getValue: (m) => (m.serial_number ?? '').trim(),
  },
  {
    label: 'Capacity & Class',
    getValue: (m) => {
      const capacity = (m.range_capacity ?? '').trim()
      const cls = (m.class_of_instrument ?? m.accuracy_acceptance_criteria ?? '').trim()
      if (capacity && cls) return `${capacity} / ${cls}`
      return capacity || cls
    },
  },
  {
    label: 'Details of Indicator',
    getValue: (m) => (m.resolution_least_count ?? '').trim(),
  },
  {
    label: 'Calibration Date',
    getValue: (m) => formatDisplayDate(m.last_calibration_date),
  },
  {
    label: 'Calibration Due Date',
    getValue: (m) => formatDisplayDate(m.next_calibration_due),
  },
  {
    label: 'Calibration Cert No.',
    getValue: (m) => (m.calibration_certificate_number ?? '').trim(),
  },
  {
    label: 'Calibrated By',
    getValue: (m) => (m.external_calibration_agency_name ?? '').trim(),
  },
]

function SectionCard({
  title,
  eyebrow,
  aside,
  contentClassName,
  children,
}: {
  title: string
  eyebrow?: string
  /** Extra text on the right of the title bar (e.g. load range). */
  aside?: string
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <section className="h-fit w-full shrink-0 overflow-hidden border border-slate-300 bg-white break-inside-avoid">
      <div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5">
        {eyebrow ? (
          <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="text-xs font-semibold tracking-tight text-slate-900 sm:text-sm">
            {title}
          </h3>
          {aside?.trim() ? (
            <p className="text-xs font-semibold tracking-tight text-slate-800 sm:text-sm">
              {aside.trim()}
            </p>
          ) : null}
        </div>
      </div>
      <div className={cn('h-fit', contentClassName ?? 'p-2')}>{children}</div>
    </section>
  )
}

export function CertificateDraftDialog({
  job,
  open,
  onOpenChange,
  onIssueAndForward,
  autoPrint = false,
  autoDownload = false,
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persist draft then forward job to Certificates stage. */
  onIssueAndForward?: (job: CalibrationJobRow) => void | Promise<void>
  /** After load completes, open the browser print dialog. */
  autoPrint?: boolean
  /** After load completes, download the certificate PDF directly. */
  autoDownload?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [autoNumbering, setAutoNumbering] = useState(false)
  const [autoUlrNumbering, setAutoUlrNumbering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<CertificateDraftPayload>({ ...EMPTY_CERTIFICATE_DRAFT })
  const [payload, setPayload] = useState<RawDataSheetPayload | null>(null)
  const [masters, setMasters] = useState<MasterEquipmentForSheet[]>([])
  const [equipmentLabel, setEquipmentLabel] = useState('')
  const [letterhead, setLetterhead] = useState<ManagementDocLetterhead | null>(null)
  const [certTemplate, setCertTemplate] = useState<CalibrationCertificateTemplate>(() =>
    defaultCalibrationCertificateTemplate(),
  )
  const [modeOfCalibration, setModeOfCalibration] = useState('')
  const pagesHostRef = useRef<HTMLDivElement | null>(null)
  const autoDownloadFiredRef = useRef(false)
  const autoPrintFiredRef = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const silentMode = autoPrint
  // autoDownload uses the same full certificate UI as View Cert so PDF matches preview.
  const load = useCallback(async (activeJob: CalibrationJobRow) => {
    // Reset draft UI state before loading job data (no Method Used on DUC).
    setLoading(true)
    setError(null)
    setMessage(null)
    setPayload(null)
    setMasters([])
    setLetterhead(null)
    setCertTemplate(defaultCalibrationCertificateTemplate())
    setModeOfCalibration('')
    setDraft({ ...EMPTY_CERTIFICATE_DRAFT })
    setEquipmentLabel(activeJob.equipment_label)

    try {
      const [equipment, srfRow, sheet, storedDraft, suggestedCert, lhBase] = await Promise.all([
        resolveEquipmentMasterForJob(activeJob),
        activeJob.service_request_id
          ? fetchSrfSummaryForSheet(activeJob.service_request_id, {
              clientId: activeJob.client_id,
              clientName: activeJob.client_name,
            })
          : Promise.resolve(null),
        fetchRawDataSheetByJobId(activeJob.id),
        fetchCertificateDraftByJobId(activeJob.id),
        suggestCalibrationCertificateNumber(),
        fetchManagementDocLetterhead().catch(() => null),
      ])

      let lh = lhBase
      try {
        const named = await resolveNamedLetterheadTemplates(
          CALIBRATION_LETTERHEAD_HEADER,
          CALIBRATION_LETTERHEAD_FOOTER,
        )
        if (lh) {
          lh = {
            ...lh,
            headerUrl: named.headerUrl ?? lh.headerUrl,
            footerUrl: named.footerUrl ?? lh.footerUrl,
          }
        }
      } catch {
        // keep base letterhead
      }

      let ulrPrefill = ''
      try {
        const { ulr } = await fetchNextCalibrationNablUlrNumber({
          accreditationCertificateNo: lh?.nablCertificateNo,
          excludeJobId: activeJob.id,
        })
        ulrPrefill = ulr
      } catch {
        ulrPrefill = ''
      }

      setLetterhead(lh)
      setEquipmentLabel(equipment?.equipment_name || activeJob.equipment_label)

      const template = resolveCertificateTemplateFromEquipment(equipment)
      setCertTemplate(template)
      setModeOfCalibration(
        resolveEquipmentModeOfCalibration(
          parseMeasurementRanges(equipment?.measurement_ranges),
          '',
        ),
      )

      const parsedSheet = sheet ? parseRawDataSheetPayload(sheet.payload) : null
      setPayload(parsedSheet)

      const rowMasterIds = (parsedSheet?.rows ?? [])
        .map((r) => (r.masterEquipmentId ?? '').trim())
        .filter(Boolean)
      const masterIds = equipment
        ? collectMasterIdsFromEquipment(equipment, rowMasterIds)
        : [...new Set(rowMasterIds)]
      if (masterIds.length > 0) {
        try {
          setMasters(await fetchMasterEquipmentsByIds(masterIds))
        } catch {
          setMasters([])
        }
      }

      const existing = parseCertificateDraft(storedDraft)
      const eqFields = parseJobEquipmentFields(activeJob)
      const frequency = eqFields.frequency.trim() || 'Yearly'
      // Calibration Date = day Raw Data Sheet was filled/seeded (fallback today).
      const sheetFillDate = isoDateOnly(parsedSheet?.seededAt)
      const calDate =
        sheetFillDate ||
        existing.dateOfCalibration ||
        todayIsoDate()
      // Due Date always from Calibration Date + Raw Data Sheet Frequency (default Yearly).
      const due =
        computeDueFromFrequency(calDate, frequency) ||
        existing.dueDateOfCalibration ||
        ''
      const srfContact = srfCustomerContactFields(srfRow)
      const existingContact =
        existing.customerContactPerson ||
        existing.customerMobile ||
        existing.customerEmail
          ? {
              person: existing.customerContactPerson,
              mobile: existing.customerMobile,
              email: existing.customerEmail,
            }
          : existing.customerContactDetails
            ? parseCustomerContactDetails(existing.customerContactDetails)
            : srfContact
      const contactPerson = existingContact.person || srfContact.person
      const contactMobile = existingContact.mobile || srfContact.mobile
      const contactEmail = existingContact.email || srfContact.email
      const contactPrefill = composeCustomerContactDetails({
        person: contactPerson,
        mobile: contactMobile,
        email: contactEmail,
      })

      const defaultNotes = template.defaultNotes.trim() || DEFAULT_CERTIFICATE_NOTES
      const defaultRemarks = template.defaultRemarks.trim() || DEFAULT_CERTIFICATE_REMARKS

      const loadCol =
        (parsedSheet?.template.columns ?? []).find((c) =>
          /load/i.test(`${c.label} ${c.key}`),
        ) ??
        (parsedSheet?.template.columns ?? []).find((c) =>
          /k\s*n/i.test(`${c.label} ${c.key}`),
        ) ??
        null
      const loadNums: number[] = []
      if (loadCol) {
        for (const row of parsedSheet?.rows ?? []) {
          const n = Number.parseFloat(
            String(row.values[loadCol.key] ?? '').replace(/,/g, '').trim(),
          )
          if (Number.isFinite(n)) loadNums.push(n)
        }
      }
      const unitMatch = loadCol
        ? `${loadCol.label} ${loadCol.key}`.match(
            /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
          )
        : null
      const loadUnit = unitMatch ? unitMatch[1]!.replace(/^kn$/i, 'kN') : 'kN'
      const seededMinLoad =
        loadNums.length > 0
          ? formatCertificateMinLoadDisplay(Math.min(...loadNums), loadUnit)
          : ''
      const seedNotes = existing.notes.trim() ? existing.notes : defaultNotes

      // Calibrated By = Raw Data entry person (fallback: allocated engineer).
      // Authorized Signatory = Raw Data reviewer (Review Data forward).
      const entryBy = parsedSheet?.entryBy
      let calibratedName =
        existing.calibratedByName.trim() ||
        (entryBy?.name ?? '').trim() ||
        (activeJob.allocated_engineer_name ?? '').trim()
      let calibratedDesig =
        existing.calibratedByDesignation.trim() ||
        (entryBy?.designation ?? '').trim()
      if (
        !calibratedDesig &&
        !existing.calibratedByDesignation.trim() &&
        activeJob.allocated_engineer_id
      ) {
        try {
          const eng = await fetchUserProfileBrief(activeJob.allocated_engineer_id)
          if (eng) {
            if (!calibratedName) calibratedName = eng.name
            calibratedDesig = eng.designation
          }
        } catch {
          // keep name-only
        }
      }

      const reviewedBy = parsedSheet?.reviewedBy
      let authorizedName =
        existing.authorizedSignatoryName.trim() ||
        (reviewedBy?.name ?? '').trim() ||
        (sheet?.reviewed_by ?? '').trim()
      let authorizedDesig =
        existing.authorizedSignatoryDesignation.trim() ||
        (reviewedBy?.designation ?? '').trim()

      setDraft({
        ...existing,
        srfNumber:
          existing.srfNumber ||
          (activeJob.srf_number ?? '').trim() ||
          (srfRow?.srf_number ?? '').trim() ||
          '',
        certificateNumber: existing.certificateNumber || suggestedCert || '',
        ulrNumber: existing.ulrNumber || ulrPrefill || '',
        formatNumber: existing.formatNumber || template.formatNumber || '',
        customerName:
          existing.customerName ||
          (srfRow?.client_name ?? '').trim() ||
          (activeJob.client_name ?? '').trim() ||
          '',
        customerAddress:
          existing.customerAddress || (srfRow?.customer_address ?? '').trim() || '',
        customerContactPerson: contactPerson,
        customerMobile: contactMobile,
        customerEmail: contactEmail,
        customerContactDetails: contactPrefill,
        // Issue Date = day certificate is prepared (not calibration date).
        issueDate: existing.issueDate.trim() || todayIsoDate(),
        pageNumber: existing.pageNumber || '01 of 02',
        workInstructionNumber:
          existing.workInstructionNumber || template.workInstructionNumber || '',
        dateOfCalibration: calDate,
        dueDateOfCalibration: due,
        notes: applyCertificateNotesMinLoad(seedNotes, seededMinLoad),
        remarks: existing.remarks.trim() ? existing.remarks : defaultRemarks,
        calibratedByName: calibratedName,
        calibratedByDesignation: calibratedDesig,
        authorizedSignatoryName: authorizedName,
        authorizedSignatoryDesignation: authorizedDesig,
      })
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Unable to load certificate draft'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !job) return
    void load(job)
  }, [open, job, load])

  useEffect(() => {
    if (!open) {
      autoPrintFiredRef.current = false
      return
    }
    if (!autoPrint || loading || !job) return

    let cancelled = false
    let fallbackTimer = 0

    const closeAfterPrint = () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      onOpenChangeRef.current(false)
    }

    const runPrint = async () => {
      if (cancelled || autoPrintFiredRef.current) return
      // Ensure pages + letterhead images are in DOM and decoded before print preview
      const host = pagesHostRef.current
      host?.querySelectorAll('.certificate-letter-sheet').forEach((sheet) => {
        sheet.scrollIntoView({ block: 'nearest' })
      })
      await waitForCertificateImagesReady(host)
      if (cancelled || autoPrintFiredRef.current) return
      autoPrintFiredRef.current = true
      window.addEventListener('afterprint', closeAfterPrint, { once: true })
      fallbackTimer = window.setTimeout(closeAfterPrint, 120_000)
      try {
        window.print()
      } catch (err) {
        window.removeEventListener('afterprint', closeAfterPrint)
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        autoPrintFiredRef.current = false
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: string }).message)
            : 'Unable to open print dialog'
        setError(msg)
      }
    }

    const t = window.setTimeout(() => {
      void runPrint()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      window.removeEventListener('afterprint', closeAfterPrint)
    }
  }, [open, autoPrint, loading, job?.id])

  const buildPdfFilename = useCallback(() => {
    const certNo = draft.certificateNumber.trim().replace(/\s+/g, '_')
    const eq = (equipmentLabel || job?.equipment_label || 'Calibration_Certificate')
      .trim()
      .replace(/\s+/g, '_')
    return certNo || eq || 'Calibration_Certificate'
  }, [draft.certificateNumber, equipmentLabel, job?.equipment_label])

  const buildPdfFilenameRef = useRef(buildPdfFilename)
  buildPdfFilenameRef.current = buildPdfFilename

  const handleDownloadPdf = useCallback(async () => {
    if (!job) return
    setDownloading(true)
    setError(null)
    setMessage(null)
    try {
      let host = pagesHostRef.current
      for (
        let i = 0;
        i < 25 &&
        (!host || host.querySelectorAll('.certificate-letter-sheet').length === 0);
        i++
      ) {
        await new Promise<void>((r) => window.setTimeout(r, 100))
        host = pagesHostRef.current
      }
      if (!host || host.querySelectorAll('.certificate-letter-sheet').length === 0) {
        throw new Error('Certificate pages are not ready to download')
      }
      host.querySelectorAll('.certificate-letter-sheet').forEach((sheet) => {
        sheet.scrollIntoView({ block: 'nearest' })
      })
      await waitForCertificateImagesReady(host)
      await downloadCertificatePagesAsPdf(host, buildPdfFilenameRef.current())
      if (autoDownload) {
        onOpenChangeRef.current(false)
        return
      }
      setMessage('Certificate PDF downloaded.')
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Unable to download certificate PDF'
      setError(msg)
    } finally {
      setDownloading(false)
    }
  }, [autoDownload, job])

  const handleDownloadPdfRef = useRef(handleDownloadPdf)
  handleDownloadPdfRef.current = handleDownloadPdf

  useEffect(() => {
    if (!open) {
      autoDownloadFiredRef.current = false
      return
    }
    if (!autoDownload || loading || !job) return

    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled || autoDownloadFiredRef.current) return
      autoDownloadFiredRef.current = true
      void handleDownloadPdfRef.current()
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, autoDownload, loading, job?.id])

  const eqFields = useMemo(
    () => (job ? parseJobEquipmentFields(job) : null),
    [job],
  )

  const environment: RawDataEnvironmentConditions | null =
    payload?.environmentConditions ?? null

  const envTemperatureAvg = useMemo(
    () => formatCertEnvNumber(getEnvironmentAverageParamValue(environment, 'temperature')),
    [environment],
  )
  const envHumidityAvg = useMemo(
    () => formatCertEnvNumber(getEnvironmentAverageParamValue(environment, 'humidity')),
    [environment],
  )

  const ducReferredStandard = useMemo(() => {
    const m = masters[0]
    if (!m) return ''
    const name = (m.equipment_name ?? '').trim()
    const cert = (m.calibration_certificate_number ?? '').trim()
    if (name && cert) return `${name} (${cert})`
    return name || cert
  }, [masters])

  const patchDraft = <K extends keyof CertificateDraftPayload>(
    key: K,
    value: CertificateDraftPayload[K],
  ) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'dateOfCalibration') {
        const cal = String(value)
        const frequency = (eqFields?.frequency ?? '').trim() || 'Yearly'
        const computed = computeDueFromFrequency(cal, frequency)
        if (computed) next.dueDateOfCalibration = computed
      }
      return next
    })
    setMessage(null)
  }

  const autoCreateCertificateNumber = useCallback(async () => {
    setAutoNumbering(true)
    setError(null)
    try {
      const next = await suggestCalibrationCertificateNumber()
      if (!next) {
        setError('Could not generate certificate number.')
        return
      }
      patchDraft('certificateNumber', next)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Could not generate certificate number'
      setError(msg)
    } finally {
      setAutoNumbering(false)
    }
  }, [])

  const autoCreateUlrNumber = useCallback(async () => {
    setAutoUlrNumbering(true)
    setError(null)
    try {
      const { ulr } = await fetchNextCalibrationNablUlrNumber({
        accreditationCertificateNo: letterhead?.nablCertificateNo,
        excludeJobId: job?.id,
      })
      if (!ulr) {
        setError('Could not generate ULR number.')
        return
      }
      patchDraft('ulrNumber', ulr)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Could not generate ULR number'
      setError(msg)
    } finally {
      setAutoUlrNumbering(false)
    }
  }, [job?.id, letterhead?.nablCertificateNo])

  const saveDraft = async (): Promise<boolean> => {
    if (!job) return false
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const serialized = serializeCertificateDraft(draft)
      await updateCalibrationJobCertificateDraft(
        job.id,
        serialized as unknown as Record<string, unknown>,
      )
      setDraft(serialized)
      setMessage('Certificate draft saved.')
      return true
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Unable to save certificate draft'
      setError(msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleIssueAndForward = async () => {
    if (!job || !onIssueAndForward) return
    setIssuing(true)
    setError(null)
    try {
      const ok = await saveDraft()
      if (!ok) return
      await onIssueAndForward(job)
      onOpenChange(false)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Unable to issue and forward'
      setError(msg)
    } finally {
      setIssuing(false)
    }
  }

  const columns = payload?.template.columns ?? []
  const loadColumn = useMemo(() => {
    if (columns.length === 0) return null
    return (
      columns.find((c) => /load/i.test(`${c.label} ${c.key}`)) ??
      columns.find((c) => /k\s*n/i.test(`${c.label} ${c.key}`)) ??
      null
    )
  }, [columns])

  const rows = useMemo(() => {
    const list = payload?.rows ?? []
    if (list.length === 0 || !loadColumn) return list
    const parseLoad = (raw: unknown): number => {
      const n = Number.parseFloat(String(raw ?? '').replace(/,/g, '').trim())
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
    }
    return [...list].sort(
      (a, b) => parseLoad(a.values[loadColumn.key]) - parseLoad(b.values[loadColumn.key]),
    )
  }, [payload?.rows, loadColumn])

  const calibrationLoadRangeLabel = useMemo(() => {
    if (!loadColumn || rows.length === 0) return ''
    const values: number[] = []
    for (const row of rows) {
      const n = Number.parseFloat(
        String(row.values[loadColumn.key] ?? '').replace(/,/g, '').trim(),
      )
      if (Number.isFinite(n)) values.push(n)
    }
    if (values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const unitMatch = `${loadColumn.label} ${loadColumn.key}`.match(
      /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
    )
    const unit = unitMatch ? unitMatch[1]!.replace(/^kn$/i, 'kN') : 'kN'
    const fmt = (n: number) =>
      Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
    return `Range = ${fmt(min)} ${unit} - ${fmt(max)} ${unit}`
  }, [loadColumn, rows])

  const minLoadDisplay = useMemo(() => {
    if (!loadColumn || rows.length === 0) return ''
    const values: number[] = []
    for (const row of rows) {
      const n = Number.parseFloat(
        String(row.values[loadColumn.key] ?? '').replace(/,/g, '').trim(),
      )
      if (Number.isFinite(n)) values.push(n)
    }
    if (values.length === 0) return ''
    const unitMatch = `${loadColumn.label} ${loadColumn.key}`.match(
      /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
    )
    const unit = unitMatch ? unitMatch[1]!.replace(/^kn$/i, 'kN') : 'kN'
    return formatCertificateMinLoadDisplay(Math.min(...values), unit)
  }, [loadColumn, rows])

  useEffect(() => {
    if (!minLoadDisplay) return
    setDraft((prev) => {
      const nextNotes = applyCertificateNotesMinLoad(prev.notes, minLoadDisplay)
      if (nextNotes === prev.notes) return prev
      return { ...prev, notes: nextNotes }
    })
  }, [minLoadDisplay])

  const computedCertSummary = useMemo(() => {
    const loadUnitMatch = loadColumn
      ? `${loadColumn.label} ${loadColumn.key}`.match(
          /\b(kN|kn|N|kgf|kg|MPa|psi|bar|ton|t)\b/i,
        )
      : null
    const loadUnit = loadUnitMatch
      ? loadUnitMatch[1]!.replace(/^kn$/i, 'kN')
      : 'kN'

    const withLoadUnit = (n: number) => `${formatMagnitudeDisplay(n)} ${loadUnit}`

    // "Reading at 0/120/360" = UTM angular positions — NOT zero-load reading.
    const isAngularReadingCol = (c: { key: string; label: string }) =>
      /reading\s*at\s*(0|120|360)\b/i.test(`${c.label} ${c.key}`)

    // Prefer "Relative Resolution @ Fi" max (certificate Summary line source).
    const relativeResolutionCol = findCertColumnByPatterns(columns, [
      /relative\s*resolution\s*@?\s*fi/i,
      /relative\s*resolution/i,
    ])

    const zeroReadingCol = findCertColumnByPatterns(columns, [
      /max(?:imum)?\s*zero\s*reading/i,
      /zero\s*reading\s*observed/i,
      /zero\s*reading/i,
      /zero\s*return/i,
    ])
    const zeroReadingOk =
      zeroReadingCol && !isAngularReadingCol(zeroReadingCol) ? zeroReadingCol : null

    const relativeZeroCol = findCertColumnByPatterns(columns, [
      /max(?:imum)?\s*relative\s*zero\s*error/i,
      /relative\s*zero\s*error/i,
      /zero\s*error/i,
    ])
    const expandedUCol = findCertColumnByPatterns(columns, [
      /actual\s*expanded\s*uncertain/i,
      /expanded\s*uncertain/i,
      /actual\s*expanded\s*u\b/i,
    ])

    let maxZero: number | null =
      relativeResolutionCol != null
        ? maxMagnitudeFromColumn(rows, relativeResolutionCol.key)
        : null

    if (maxZero == null && zeroReadingOk != null) {
      maxZero = maxMagnitudeFromColumn(rows, zeroReadingOk.key)
    }

    if (maxZero == null && loadColumn && rows.length > 0) {
      const loads = rows
        .map((r) => parseNumericMagnitude(r.values[loadColumn.key]))
        .filter((n): n is number => n != null)
      if (loads.length > 0) {
        const minLoad = Math.min(...loads)
        const nearZeroRows = rows.filter((r) => {
          const n = parseNumericMagnitude(r.values[loadColumn.key])
          return n != null && Math.abs(n - minLoad) < 1e-9
        })
        const avgCol = findCertColumnByPatterns(columns, [
          /^average$/i,
          /\baverage\b/i,
        ])
        const stdCol = findCertColumnByPatterns(columns, [
          /temprature\s*corrected|temperature\s*corrected|standard\s*reading/i,
        ])
        let maxDelta: number | null = null
        for (const row of nearZeroRows.length > 0 ? nearZeroRows : rows) {
          const load = parseNumericMagnitude(row.values[loadColumn.key])
          const avg = avgCol
            ? parseNumericMagnitude(row.values[avgCol.key])
            : null
          const std = stdCol
            ? parseNumericMagnitude(row.values[stdCol.key])
            : null
          if (load != null && avg != null && avg <= load * 5 + 50) {
            const d = Math.abs(avg - load)
            if (maxDelta == null || d > maxDelta) maxDelta = d
          } else if (load != null && std != null && std <= load * 5 + 50) {
            const d = Math.abs(std - load)
            if (maxDelta == null || d > maxDelta) maxDelta = d
          }
        }
        maxZero = maxDelta ?? minLoad
      }
    }

    const maxRelZeroFromCol =
      relativeZeroCol != null
        ? maxMagnitudeFromColumn(rows, relativeZeroCol.key)
        : null

    // Maximum Relative Zero Error =
    // (max Relative Resolution @ Fi / Instrument max capacity) × 100 %
    const relResMaxForPct =
      relativeResolutionCol != null
        ? maxMagnitudeFromColumn(rows, relativeResolutionCol.key)
        : null
    const instrumentCapacity =
      parseInstrumentMaxCapacity(eqFields?.range ?? '') ??
      (loadColumn && rows.length > 0
        ? (() => {
            const loads = rows
              .map((r) => parseNumericMagnitude(r.values[loadColumn.key]))
              .filter((n): n is number => n != null)
            return loads.length > 0 ? Math.max(...loads) : null
          })()
        : null)
    const maxRelZeroPct =
      relResMaxForPct != null &&
      instrumentCapacity != null &&
      instrumentCapacity > 0
        ? (relResMaxForPct / instrumentCapacity) * 100
        : null

    const uCandidates: number[] = []
    if (expandedUCol) {
      // All row values under "Actual Expanded Uncertainty" → take max later with masters.
      for (const row of rows) {
        const n = parseNumericMagnitude(row.values[expandedUCol.key])
        if (n != null) uCandidates.push(n)
      }
    }
    for (const master of masters) {
      const u = parseNumericMagnitude(master.calibration_certificate_uncertainty)
      if (u != null) uCandidates.push(u)
    }
    const maxU = uCandidates.length > 0 ? Math.max(...uCandidates) : null
    const uUnitFromCol = (() => {
      if (!expandedUCol) return ''
      const fromLabel = `${expandedUCol.label} ${expandedUCol.key}`.match(
        /\(([^)]+)\)|\b(kN|kn|N|kgf|kg|MPa|psi|%)\b/i,
      )
      if (fromLabel?.[1]) return fromLabel[1].trim().replace(/^kn$/i, 'kN')
      if (fromLabel?.[2]) return fromLabel[2].replace(/^kn$/i, 'kN')
      return ''
    })()
    const uUnit =
      masters
        .map((m) => (m.calibration_uncertainty_unit ?? '').trim())
        .find(Boolean) ||
      uUnitFromCol ||
      loadUnit

    // Relative Resolution @ Fi max — keep unit from column label, else Load unit (kN).
    const maxZeroFromRelativeResolution = relativeResolutionCol != null
    const relativeResolutionUnit = (() => {
      if (!relativeResolutionCol) return loadUnit
      const fromLabel = `${relativeResolutionCol.label} ${relativeResolutionCol.key}`.match(
        /\(([^)]+)\)|\b(kN|kn|N|kgf|kg|%|Div|div)\b/i,
      )
      if (fromLabel?.[1]) return fromLabel[1].trim().replace(/^kn$/i, 'kN')
      if (fromLabel?.[2]) return fromLabel[2].replace(/^kn$/i, 'kN').replace(/^div$/i, 'Div')
      return loadUnit
    })()

    return {
      maxZeroReadingObserved:
        maxZero != null
          ? maxZeroFromRelativeResolution
            ? `${formatMagnitudeDisplay(maxZero)} ${relativeResolutionUnit}`
            : withLoadUnit(maxZero)
          : '',
      maxRelativeZeroError:
        maxRelZeroPct != null
          ? `${formatMagnitudeDisplay(maxRelZeroPct)}%`
          : maxRelZeroFromCol != null
            ? `${formatMagnitudeDisplay(maxRelZeroFromCol)}%`
            : '',
      uncertaintyReported:
        maxU != null
          ? `±${formatMagnitudeDisplay(maxU)}${uUnit ? ` ${uUnit}` : ''}`
          : '',
    }
  }, [columns, rows, masters, loadColumn, eqFields?.range])

  // Prefill / refresh summary fields from Raw Data Sheet columns.
  useEffect(() => {
    if (loading) return
    setDraft((prev) => {
      const next = { ...prev }
      let changed = false

      const curZero = prev.maxZeroReadingObserved.trim()
      const computedZero = computedCertSummary.maxZeroReadingObserved
      const looksLikeAutoNumeric =
        /^\d+(\.\d+)?(\s*(kN|N|kgf|kg|%|Div))?$/i.test(curZero)
      if (computedZero && (!curZero || looksLikeAutoNumeric)) {
        if (curZero !== computedZero) {
          next.maxZeroReadingObserved = computedZero
          changed = true
        }
      }

      if (
        computedCertSummary.maxRelativeZeroError &&
        (!prev.maxRelativeZeroError.trim() ||
          /^\d+(\.\d+)?%?$/i.test(prev.maxRelativeZeroError.trim()))
      ) {
        if (prev.maxRelativeZeroError.trim() !== computedCertSummary.maxRelativeZeroError) {
          next.maxRelativeZeroError = computedCertSummary.maxRelativeZeroError
          changed = true
        }
      }
      if (
        computedCertSummary.uncertaintyReported &&
        (!prev.uncertaintyReported.trim() ||
          /^[±+]?\s*\d+(\.\d+)?(\s*(kN|N|kgf|kg|%))?$/i.test(
            prev.uncertaintyReported.trim(),
          ))
      ) {
        if (prev.uncertaintyReported.trim() !== computedCertSummary.uncertaintyReported) {
          next.uncertaintyReported = computedCertSummary.uncertaintyReported
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [computedCertSummary, loading])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-certificate-draft-preview=""
        className={cn(
          'certificate-draft-dialog !flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none',
          silentMode
            ? 'bg-white'
            : 'bg-[#e8eaed] [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100',
        )}
        layer="nested"
        aria-describedby={undefined}
        showCloseButton={!silentMode}
        onEscapeKeyDown={(e) => {
          if (silentMode && downloading) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (silentMode) e.preventDefault()
        }}
      >
        <style>{`
          @media print {
            @page {
              size: letter;
              margin: 0;
            }

            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body * {
              visibility: hidden !important;
            }
            [data-certificate-draft-pages],
            [data-certificate-draft-pages] * {
              visibility: visible !important;
            }

            /* Header/footer letterhead images must always paint in print preview */
            .certificate-page-header,
            .certificate-page-footer,
            .certificate-page-header img,
            .certificate-page-footer img,
            .certificate-letter-sheet img {
              visibility: visible !important;
              display: block !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .certificate-page-header,
            .certificate-page-footer {
              flex-shrink: 0 !important;
              overflow: visible !important;
            }
            .certificate-page-header img,
            .certificate-page-footer img {
              width: calc(100% + 15mm) !important;
              max-width: none !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .certificate-page-header img {
              margin-left: -10mm !important;
              margin-right: -5mm !important;
            }
            .certificate-page-footer > div {
              margin-left: -10mm !important;
              margin-right: -5mm !important;
              width: calc(100% + 15mm) !important;
            }

            [data-radix-dialog-overlay],
            .certificate-draft-no-print {
              display: none !important;
            }

            /* Pull certificate pages to printable origin */
            [data-certificate-draft-pages] {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 8.5in !important;
              max-width: 8.5in !important;
              margin: 0 !important;
              padding: 0 !important;
              gap: 0 !important;
              background: #fff !important;
              display: flex !important;
              flex-direction: column !important;
            }

            /* Un-clip fixed dialog / portal wrappers */
            body,
            #root,
            [data-radix-portal],
            div.fixed.inset-0,
            [data-certificate-draft-preview],
            .certificate-draft-dialog {
              overflow: visible !important;
              height: auto !important;
              max-height: none !important;
              position: static !important;
              inset: auto !important;
              transform: none !important;
              background: transparent !important;
            }

            [data-certificate-draft-preview],
            .certificate-draft-dialog {
              display: block !important;
              width: auto !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }

            .certificate-letter-sheet,
            .certificate-letter-sheet.certificate-letter-sheet--grow {
              display: flex !important;
              flex-direction: column !important;
              box-sizing: border-box !important;
              width: 8.5in !important;
              max-width: 8.5in !important;
              height: 11in !important;
              min-height: 11in !important;
              max-height: 11in !important;
              margin: 0 !important;
              padding: 2mm 5mm 2mm 10mm !important;
              overflow: hidden !important;
              box-shadow: none !important;
              outline: none !important;
              border: 2px solid #1e293b !important;
              background: #fff !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            /* Free vertical space so footer image is not clipped */
            .certificate-letter-sheet > [aria-hidden="true"] {
              display: none !important;
              flex: 0 0 0 !important;
              min-height: 0 !important;
              height: 0 !important;
            }

            .certificate-letter-sheet:last-of-type,
            .certificate-letter-sheet.certificate-letter-sheet--break:last-of-type {
              page-break-after: auto !important;
              break-after: auto !important;
            }
          }
        `}</style>

        {silentMode ? (
          <div className="certificate-draft-no-print absolute inset-x-0 top-0 z-50 flex flex-col items-center gap-2 border-b border-slate-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur-sm print:hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Print calibration certificate</DialogTitle>
            </DialogHeader>
            <p className="text-sm font-medium text-slate-800">
              {error
                ? 'Print failed'
                : loading
                  ? 'Preparing print…'
                  : 'Opening print dialog…'}
            </p>
            {error ? (
              <p className="max-w-md text-center text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Loading letterhead, then system print dialog will open.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        {!silentMode ? (
        <div className="certificate-draft-no-print relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Certificate Preparation · Draft · US Letter
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Certificate Draft — {cellText(equipmentLabel || job?.equipment_label)}
                </DialogTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/25 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
                  disabled={loading || saving || issuing || !job}
                  onClick={() => void saveDraft()}
                  aria-label="Save certificate draft"
                >
                  <Save size={14} className="mr-1.5" aria-hidden />
                  {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                {onIssueAndForward ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5 bg-teal-600 text-xs text-white hover:bg-teal-500"
                    disabled={loading || saving || issuing || !job}
                    onClick={() => void handleIssueAndForward()}
                    aria-label="Issue certificate and forward to Certificates"
                  >
                    <ArrowRight size={14} aria-hidden />
                    {issuing ? 'Issuing…' : 'Issue & Forward'}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogHeader>
        </div>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-6 sm:py-5',
            silentMode ? 'bg-white pt-28' : 'bg-[#e8eaed]',
          )}
        >
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Loading certificate draft…
            </p>
          ) : (
            <div
              ref={pagesHostRef}
              data-certificate-draft-pages=""
              className="mx-auto flex w-full max-w-[8.5in] flex-col gap-3"
            >
              {error ? (
                <p className="certificate-draft-no-print rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="certificate-draft-no-print rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {message}
                </p>
              ) : null}

              <CertificateLetterPage
                lh={letterhead}
                pageLabel="01 of 02"
                grow
                numberBar={
                  <>
                    <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-slate-900 sm:text-base">
                      {certTemplate.title}
                    </p>
                    <CertificateNumberUlrBar
                      pageKey="1"
                      certificateNumber={draft.certificateNumber}
                      ulrNumber={draft.ulrNumber}
                      ulrPlaceholder={formatNablUlrNumber(
                        buildCalibrationUlrHeaderPrefix(letterhead?.nablCertificateNo),
                        1,
                        'CC',
                      )}
                      onCertificateNumberChange={(v) =>
                        patchDraft('certificateNumber', v)
                      }
                      onUlrNumberChange={(v) => patchDraft('ulrNumber', v)}
                      onAutoCertificate={() => void autoCreateCertificateNumber()}
                      onAutoUlr={() => void autoCreateUlrNumber()}
                      autoNumbering={autoNumbering}
                      autoUlrNumbering={autoUlrNumbering}
                      controlsDisabled={loading || saving || issuing}
                    />
                  </>
                }
              >
                {/* Certificate header info table — shrink-0 so height follows content */}
                <div className="w-full shrink-0 border border-slate-400">
                  {/* Customer (left) | Meta fields (right) */}
                  <div className="grid grid-cols-2 items-stretch">
                    <div
                      className={cn(
                        'flex min-h-0 min-w-0 flex-col bg-white p-1.5',
                        'border-r border-slate-400',
                      )}
                    >
                      <CustomerBlockContinuous
                        name={draft.customerName}
                        address={draft.customerAddress}
                        person={draft.customerContactPerson}
                        mobile={draft.customerMobile}
                        email={draft.customerEmail}
                        onChange={({
                          name: nextName,
                          address: nextAddress,
                          person,
                          mobile,
                          email,
                        }) => {
                          setDraft((prev) => ({
                            ...prev,
                            customerName: nextName,
                            customerAddress: nextAddress,
                            customerContactPerson: person,
                            customerMobile: mobile,
                            customerEmail: email,
                            customerContactDetails: composeCustomerContactDetails({
                              person,
                              mobile,
                              email,
                            }),
                          }))
                          setMessage(null)
                        }}
                      />
                    </div>
                    <div className={cn(certMetaBlockClass, 'min-w-0 content-start bg-white p-1.5')}>
                      <CertMetaRow label="SRF No" htmlFor="cert-srf">
                        <CertMetaInput
                          id="cert-srf"
                          value={draft.srfNumber}
                          onChange={(v) => patchDraft('srfNumber', v)}
                          aria-label="SRF Number"
                        />
                      </CertMetaRow>
                      <CertMetaRow label="Issue Date">
                        <span
                          id="cert-issue-date"
                          title="Date certificate is prepared"
                          className={certMetaValueTextClass}
                        >
                          {formatDisplayDate(draft.issueDate || todayIsoDate())}
                        </span>
                      </CertMetaRow>
                      <CertMetaRow label="WI No" htmlFor="cert-wi">
                        <CertMetaInput
                          id="cert-wi"
                          value={draft.workInstructionNumber}
                          onChange={(v) => patchDraft('workInstructionNumber', v)}
                          placeholder="WI No."
                          aria-label="Work Instruction Number"
                        />
                      </CertMetaRow>
                      <CertMetaRow label="Format No" htmlFor="cert-format">
                        <CertMetaInput
                          id="cert-format"
                          value={draft.formatNumber}
                          onChange={(v) => patchDraft('formatNumber', v)}
                          placeholder="Format No."
                          aria-label="Format Number"
                        />
                      </CertMetaRow>
                      <CertMetaRow label="Date of Calibration">
                        <span
                          id="cert-cal-date"
                          title="From Raw Data Sheet fill date"
                          className={certMetaValueTextClass}
                        >
                          {formatDisplayDate(draft.dateOfCalibration)}
                        </span>
                      </CertMetaRow>
                      <CertMetaRow label="Due Date of Calibration">
                        <span
                          id="cert-due-date"
                          title="Auto: Calibration Date + Frequency"
                          className={certMetaValueTextClass}
                        >
                          {formatDisplayDate(draft.dueDateOfCalibration)}
                        </span>
                      </CertMetaRow>
                    </div>
                  </div>
                </div>

              <SectionCard
                title={`${certTemplate.deviceSectionPrefix} : ${cellText(equipmentLabel || job?.equipment_label)}`}
                contentClassName="p-1.5"
              >
                {/* Same field order / pairing as Certificate Format preview — 2 cols with vertical separator */}
                <div className="grid h-fit grid-cols-2 divide-x divide-slate-300 border border-slate-300">
                  <div className={cn(ducColumnGridClass, 'px-2 py-1')}>
                    <DucFieldLine label="Make" value={eqFields?.make ?? ''} />
                    <DucFieldLine label="Serial No" value={eqFields?.serial ?? ''} />
                    <DucFieldLine label="Resolution" value={eqFields?.leastCount ?? ''} />
                    <DucFieldLine
                      label="Location"
                      value={job?.location_of_calibration ?? ''}
                    />
                    <DucFieldLine
                      label="Referred Standard"
                      value={(eqFields?.calMethod ?? '').trim() || ducReferredStandard}
                    />
                  </div>
                  <div className={cn(ducColumnGridClass, 'px-2 py-1')}>
                    <DucFieldLine label="Model" value={eqFields?.model ?? ''} />
                    <DucFieldLine label="Capacity" value={eqFields?.range ?? ''} />
                    <DucFieldLine label="ID Number" value={eqFields?.customerId ?? ''} />
                    <DucFieldLine
                      label="Condition of DUC"
                      value={eqFields?.condition ?? ''}
                    />
                    <DucFieldLine
                      label="Mode of Calibration"
                      value={modeOfCalibration || eqFields?.physical || ''}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Environment Condition" contentClassName="p-1.5">
                <div className="grid grid-cols-2 divide-x divide-slate-300 border border-slate-300 text-xs sm:text-sm">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-2 py-1 leading-none">
                    <span className="flex items-center justify-self-start text-left font-medium text-slate-900">
                      Temperature (°C)
                    </span>
                    <span className="flex items-center justify-self-center select-none text-center font-medium" aria-hidden>
                      :
                    </span>
                    <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right font-medium text-slate-900">
                      {envTemperatureAvg ? `${envTemperatureAvg} °C` : '—'}
                    </span>
                  </div>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-2 py-1 leading-none">
                    <span className="flex items-center justify-self-start text-left font-medium text-slate-900">
                      Humidity (%RH)
                    </span>
                    <span className="flex items-center justify-self-center select-none text-center font-medium" aria-hidden>
                      :
                    </span>
                    <span className="flex w-full min-w-0 items-center justify-end justify-self-stretch text-right font-medium text-slate-900">
                      {envHumidityAvg ? `${envHumidityAvg} %RH` : '—'}
                    </span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title={certTemplate.masterSectionTitle}>
                {masters.length === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    No master equipment linked for this job. Link masters on the
                    Calibration Equipment range / Raw Data Sheet.
                  </p>
                ) : (
                  <div className="overflow-hidden border border-slate-300">
                    <table className="w-full border-collapse text-xs sm:text-sm">
                      <tbody>
                        {MASTER_CERT_ROWS.map((row) => (
                          <tr key={row.label}>
                            <td className="border border-slate-300 px-2 py-0.5 align-middle font-medium leading-none text-slate-900">
                              {row.label}
                            </td>
                            {masters.map((master) => (
                              <td
                                key={`${row.label}-${master.id}`}
                                className="border border-slate-300 px-2 py-0.5 align-middle text-center font-medium leading-none text-slate-900"
                              >
                                {cellText(row.getValue(master))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
              </CertificateLetterPage>

              <CertificateLetterPage
                lh={letterhead}
                grow
                isLast
                pageLabel="02 of 02"
                numberBar={
                  <CertificateNumberUlrBar
                    pageKey="2"
                    certificateNumber={draft.certificateNumber}
                    ulrNumber={draft.ulrNumber}
                    ulrPlaceholder={formatNablUlrNumber(
                      buildCalibrationUlrHeaderPrefix(letterhead?.nablCertificateNo),
                      1,
                      'CC',
                    )}
                    onCertificateNumberChange={(v) =>
                      patchDraft('certificateNumber', v)
                    }
                    onUlrNumberChange={(v) => patchDraft('ulrNumber', v)}
                    onAutoCertificate={() => void autoCreateCertificateNumber()}
                    onAutoUlr={() => void autoCreateUlrNumber()}
                    autoNumbering={autoNumbering}
                    autoUlrNumbering={autoUlrNumbering}
                    controlsDisabled={loading || saving || issuing}
                  />
                }
              >
              <SectionCard
                title={certTemplate.resultsSectionTitle}
                aside={calibrationLoadRangeLabel || undefined}
              >
                {!payload || columns.length === 0 || rows.length === 0 ? (
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                    No Calibration Raw Data is available for this job yet.
                  </p>
                ) : (
                  <div className="w-full overflow-hidden border border-slate-300 bg-white">
                    <table className="w-full table-fixed border-collapse text-[7.5px] leading-[1.15] sm:text-[8px]">
                      <thead>
                        <tr className="bg-slate-100">
                          {columns.map((col) => (
                            <th
                              key={col.key}
                              className="border border-slate-300 px-0.5 py-1 text-center align-middle font-semibold text-slate-700 break-words hyphens-auto"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            {columns.map((col) => (
                              <td
                                key={col.key}
                                className="border border-slate-300 px-0.5 py-0.5 text-center break-all text-slate-900"
                              >
                                {formatCertRawCell(row.values[col.key])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              {certTemplate.showSummaryLine ? (
              <div className="overflow-hidden border border-slate-300 bg-white break-inside-avoid">
                <div className="grid grid-cols-3 divide-x divide-slate-300 px-0 py-1.5 text-[9px] font-bold leading-none text-slate-900 sm:text-[10px]">
                  <div className="flex min-w-0 items-center px-1.5">
                    <span className="shrink-0 whitespace-nowrap font-bold">
                      Maximum Zero Reading Observed
                    </span>
                    <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                      :
                    </span>
                    <Input
                      id="cert-max-zero-reading"
                      value={draft.maxZeroReadingObserved}
                      onChange={(e) =>
                        patchDraft('maxZeroReadingObserved', e.target.value)
                      }
                      placeholder={
                        computedCertSummary.maxZeroReadingObserved || '—'
                      }
                      className={cn(
                        certCellSingleLineClass,
                        'm-0 h-5 w-auto min-w-[2.5rem] max-w-[48%] shrink border-0 bg-transparent p-0 text-right text-[9px] font-bold shadow-none focus-visible:ring-0 sm:text-[10px]',
                      )}
                      aria-label="Maximum Zero Reading Observed"
                    />
                  </div>
                  <div className="flex min-w-0 items-center px-1.5">
                    <span className="shrink-0 whitespace-nowrap font-bold">
                      Maximum Relative Zero Error
                    </span>
                    <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                      :
                    </span>
                    <Input
                      id="cert-max-rel-zero"
                      value={draft.maxRelativeZeroError}
                      onChange={(e) =>
                        patchDraft('maxRelativeZeroError', e.target.value)
                      }
                      placeholder={
                        computedCertSummary.maxRelativeZeroError || '—'
                      }
                      className={cn(
                        certCellSingleLineClass,
                        'm-0 h-5 w-auto min-w-[2.5rem] max-w-[48%] shrink border-0 bg-transparent p-0 text-right text-[9px] font-bold shadow-none focus-visible:ring-0 sm:text-[10px]',
                      )}
                      aria-label="Maximum Relative Zero Error"
                    />
                  </div>
                  <div className="flex min-w-0 items-center px-1.5">
                    <span className="shrink-0 whitespace-nowrap font-bold">
                      Uncertainty Reported
                    </span>
                    <span className="min-w-0 flex-1 select-none text-center font-bold" aria-hidden>
                      :
                    </span>
                    <Input
                      id="cert-uncertainty-reported"
                      value={draft.uncertaintyReported}
                      onChange={(e) =>
                        patchDraft('uncertaintyReported', e.target.value)
                      }
                      placeholder={
                        computedCertSummary.uncertaintyReported || '—'
                      }
                      className={cn(
                        certCellSingleLineClass,
                        'm-0 h-5 w-auto min-w-[2.5rem] max-w-[48%] shrink border-0 bg-transparent p-0 text-right text-[9px] font-bold shadow-none focus-visible:ring-0 sm:text-[10px]',
                      )}
                      aria-label="Uncertainty Reported"
                    />
                  </div>
                </div>
              </div>
              ) : null}

              {certTemplate.showNotesRemarks ? (
              <div className="grid grid-cols-2 gap-1.5 break-inside-avoid">
                <SectionCard title="Notes" contentClassName="p-2">
                  <CertAutoGrowTextarea
                    id="cert-notes"
                    value={draft.notes}
                    onChange={(v) => patchDraft('notes', v)}
                    placeholder={certTemplate.defaultNotes || DEFAULT_CERTIFICATE_NOTES}
                    className="min-h-[1rem] !p-0 !text-[8px] !leading-snug"
                    aria-label="Notes"
                  />
                </SectionCard>

                <SectionCard title="Remarks" contentClassName="p-2">
                  <CertAutoGrowTextarea
                    id="cert-remarks"
                    value={draft.remarks}
                    onChange={(v) => patchDraft('remarks', v)}
                    placeholder={
                      certTemplate.defaultRemarks || DEFAULT_CERTIFICATE_REMARKS
                    }
                    className="min-h-[1rem] !p-0 !text-[8px] !leading-snug"
                    aria-label="Remarks"
                  />
                </SectionCard>
              </div>
              ) : null}

              <p className="flex w-full items-center gap-2 break-inside-avoid py-1 text-[10px] font-bold tracking-wide text-slate-900 sm:text-xs">
                <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" aria-hidden>
                  {'='.repeat(200)}
                </span>
                <span className="shrink-0 whitespace-nowrap">End of Calibration Certificate</span>
                <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-right" aria-hidden>
                  {'='.repeat(200)}
                </span>
              </p>

              {certTemplate.showSignatures ? (
              <div className="flex gap-3 break-inside-avoid border border-slate-300 bg-white px-3 py-4">
                <div className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-end space-y-0.5 text-center">
                  <div className="mb-4 min-h-[2rem] border-b border-slate-400" aria-hidden />
                  <p className="text-[10px] font-semibold text-slate-900 sm:text-xs">
                    {certTemplate.calibratedByLabel}
                  </p>
                  <div className="mx-auto flex w-full max-w-[260px] items-center gap-1.5">
                    <Input
                      value={draft.calibratedByName}
                      onChange={(e) => patchDraft('calibratedByName', e.target.value)}
                      placeholder={certTemplate.signatureNameLabel || 'Name'}
                      aria-label="Calibrated by name"
                      className={cn(
                        certCellSingleLineClass,
                        'h-5 min-w-0 flex-1 text-center text-[9px] sm:text-[10px]',
                      )}
                    />
                    <Input
                      value={draft.calibratedByDesignation}
                      onChange={(e) =>
                        patchDraft('calibratedByDesignation', e.target.value)
                      }
                      placeholder={certTemplate.signatureDesignationLabel || 'Designation'}
                      aria-label="Calibrated by designation"
                      className={cn(
                        certCellSingleLineClass,
                        'h-5 min-w-0 flex-1 text-center text-[9px] sm:text-[10px]',
                      )}
                    />
                  </div>
                </div>
                <div className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-end space-y-0.5 text-center">
                  <div className="mb-4 min-h-[2rem] border-b border-slate-400" aria-hidden />
                  <p className="text-[10px] font-semibold text-slate-900 sm:text-xs">
                    {certTemplate.authorizedSignatoryLabel}
                  </p>
                  <div className="mx-auto flex w-full max-w-[260px] items-center gap-1.5">
                    <Input
                      value={draft.authorizedSignatoryName}
                      onChange={(e) =>
                        patchDraft('authorizedSignatoryName', e.target.value)
                      }
                      placeholder={certTemplate.signatureNameLabel || 'Name'}
                      aria-label="Authorized signatory name"
                      className={cn(
                        certCellSingleLineClass,
                        'h-5 min-w-0 flex-1 text-center text-[9px] sm:text-[10px]',
                      )}
                    />
                    <Input
                      value={draft.authorizedSignatoryDesignation}
                      onChange={(e) =>
                        patchDraft('authorizedSignatoryDesignation', e.target.value)
                      }
                      placeholder={certTemplate.signatureDesignationLabel || 'Designation'}
                      aria-label="Authorized signatory designation"
                      className={cn(
                        certCellSingleLineClass,
                        'h-5 min-w-0 flex-1 text-center text-[9px] sm:text-[10px]',
                      )}
                    />
                  </div>
                </div>
              </div>
              ) : null}
              </CertificateLetterPage>

              <div className="certificate-draft-no-print flex flex-wrap items-center justify-end gap-2 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || saving || issuing || downloading || !job}
                  onClick={() => {
                    void (async () => {
                      await waitForCertificateImagesReady(pagesHostRef.current)
                      window.print()
                    })()
                  }}
                  aria-label="Print calibration certificate"
                  title="Print"
                >
                  <Printer size={14} aria-hidden />
                  Print
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || saving || issuing || downloading || !job}
                  onClick={() => void handleDownloadPdf()}
                  aria-label="Download calibration certificate as PDF"
                  title="Download PDF"
                >
                  <Download size={14} aria-hidden />
                  {downloading ? 'Downloading…' : 'Download'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || saving || issuing || downloading || !job}
                  onClick={() => void saveDraft()}
                  aria-label="Save certificate draft"
                >
                  <FileCheck size={14} aria-hidden />
                  {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                {onIssueAndForward ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-teal-600 text-white hover:bg-teal-500"
                    disabled={loading || saving || issuing || downloading || !job}
                    onClick={() => void handleIssueAndForward()}
                    aria-label="Issue certificate and forward to Certificates"
                  >
                    <ArrowRight size={14} aria-hidden />
                    {issuing ? 'Issuing…' : 'Issue & Forward'}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
