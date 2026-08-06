import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { ArrowRight, FileCheck, RefreshCw, Save } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  calculateNextDueDate,
  isPresetFrequency,
  parseStoredFrequency,
  type Frequency,
} from '@/features/calibration/equipment-for-calibration/types'
import {
  masterEquipmentIdsFromTabs,
  parseMeasurementRanges,
  type MeasurementRangeStored,
} from '@/features/calibration/equipments/types'
import {
  defaultCalibrationCertificateTemplate,
  resolveCertificateTemplateFromEquipment,
  type CalibrationCertificateTemplate,
} from '@/features/calibration/equipments/certificateTemplateTypes'
import {
  parseRawDataSheetPayload,
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
import {
  DEFAULT_CERTIFICATE_NOTES,
  DEFAULT_CERTIFICATE_REMARKS,
  EMPTY_CERTIFICATE_DRAFT,
  parseCertificateDraft,
  serializeCertificateDraft,
  type CertificateDraftPayload,
} from './certificateDraftTypes'

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
          Page No :- {pageLabel.trim() || '—'}
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
          <span className="shrink-0 text-xs font-medium text-slate-900 sm:text-sm">
            Certificate No
          </span>
          <span className={certMetaSepClass} aria-hidden>
            :-
          </span>
          <Input
            id={certId}
            value={certificateNumber}
            onChange={(e) => onCertificateNumberChange(e.target.value)}
            placeholder="e.g. QI/CC/2026/0001"
            className={cn(certCellSingleLineClass, 'min-w-0 flex-1')}
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
        <div className="flex min-h-[32px] items-center justify-end gap-1 bg-white p-1.5">
          <div className="flex min-w-0 max-w-full items-center gap-1">
            <Label htmlFor={ulrId} className="sr-only">
              ULR Number
            </Label>
            <span className="shrink-0 text-xs font-medium text-slate-900 sm:text-sm">
              ULR No
            </span>
            <span className={certMetaSepClass} aria-hidden>
              :-
            </span>
            <Input
              id={ulrId}
              value={ulrNumber}
              onChange={(e) => onUlrNumberChange(sanitizeNablUlrInput(e.target.value))}
              placeholder={ulrPlaceholder}
              maxLength={19}
              className={cn(certCellSingleLineClass, 'min-w-0 w-[12.5rem]')}
              aria-label="ULR Number"
              title="NABL 18-position ULR (19 chars): CC/TC + cert + YY + location + 8-digit serial + F"
            />
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
        'certificate-letter-sheet mx-auto flex w-[8.5in] max-w-full flex-col gap-1.5',
        grow ? 'certificate-letter-sheet--grow min-h-[11in]' : 'h-[11in]',
        'border-2 border-slate-800 bg-white pl-[10mm] pr-[5mm] pt-[calc(0.5in-5mm)] pb-3',
        'shadow-lg outline outline-1 outline-offset-[3px] outline-slate-800 print:shadow-none',
        !isLast && 'certificate-letter-sheet--break',
      )}
      aria-label="Calibration certificate Letter page"
    >
      <CertificateLetterhead lh={lh} />
      {numberBar}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1.5',
          !grow && 'overflow-hidden',
        )}
      >
        {children}
      </div>
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

function computeDueFromFrequency(calDate: string, frequency: string): string {
  const date = calDate.trim().slice(0, 10)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const freq = parseStoredFrequency(frequency)
  if (!isPresetFrequency(freq)) return ''
  return calculateNextDueDate(date, freq as Frequency) || ''
}

function formatCustomerContactDetails(srf: SrfSummaryForSheet | null): string {
  if (!srf) return ''
  const lines: string[] = []
  const person = (srf.contact_person ?? '').trim()
  const phone = (srf.contact_phone ?? '').trim()
  const email = (srf.contact_email ?? srf.contact_number_mail ?? '').trim()
  if (person && phone) lines.push(`${person} - ${phone}`)
  else if (person) lines.push(person)
  else if (phone) lines.push(phone)
  if (email && email !== phone) lines.push(email)
  return lines.join('\n')
}

/** Continuous-text certificate field styles. */
const certCellInputClass =
  'h-7 border-0 bg-transparent px-0 text-xs font-medium text-slate-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm'

const certCellSingleLineClass =
  'h-7 w-full border-0 bg-transparent px-0 text-xs font-medium text-slate-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm'

/** Right-meta label column — keeps `:-` on one vertical line. */
const certMetaLabelClass =
  'whitespace-nowrap text-xs font-medium text-slate-900 sm:text-sm'

const certMetaGridClass =
  'grid grid-cols-[max-content_max-content_minmax(0,1fr)] items-center gap-x-1 gap-y-0'

const certMetaSepClass = 'select-none text-xs font-medium text-slate-900 sm:text-sm'

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

/** Escape text for safe use inside contentEditable HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Continuous "Customer Name:- **Firm**, Address…" editor.
 * Firm name stays bold; address flows after the comma (wraps as one paragraph).
 */
function CustomerNameAddressContinuous({
  name,
  address,
  onChange,
}: {
  name: string
  address: string
  onChange: (next: { name: string; address: string }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)

  const buildHtml = useCallback((n: string, a: string) => {
    const firm = escapeHtml(n.trim())
    const addr = escapeHtml(a.trim().replace(/\s*\n+\s*/g, ', '))
    if (!firm && !addr) {
      return '<span class="text-slate-400">Customer Name:- Company Name, Address…</span>'
    }
    return `Customer Name:- <strong class="font-bold">${firm || '—'}</strong>, ${addr}`
  }, [])

  const syncFromProps = useCallback(() => {
    const el = ref.current
    if (!el || focusedRef.current) return
    el.innerHTML = buildHtml(name, address)
  }, [address, buildHtml, name])

  useEffect(() => {
    syncFromProps()
  }, [syncFromProps])

  const commitFromDom = useCallback(() => {
    const el = ref.current
    if (!el) return
    const strong = el.querySelector('strong')
    let firm = (strong?.textContent ?? '').trim()
    if (firm === '—') firm = ''

    let rest = (el.innerText ?? '').replace(/\u00a0/g, ' ')
    rest = rest.replace(/^Customer Name:-\s*/i, '')
    if (firm && rest.startsWith(firm)) {
      rest = rest.slice(firm.length)
    }
    rest = rest.replace(/^[\s,]*/, '').trim()

    onChange({ name: firm, address: rest })
  }, [onChange])

  return (
    <div
      ref={ref}
      id="cert-customer-name-address"
      role="textbox"
      aria-multiline="true"
      aria-label="Customer Name and Address"
      contentEditable
      suppressContentEditableWarning
      className={cn(
        'w-full cursor-text break-words border-0 bg-transparent px-0 text-xs font-medium leading-snug text-slate-900 shadow-none outline-none sm:text-sm',
        'relative z-0 h-auto min-h-[1.25rem]',
      )}
      onFocus={() => {
        focusedRef.current = true
        const el = ref.current
        if (!el) return
        if (!name.trim() && !address.trim()) {
          el.innerHTML =
            'Customer Name:- <strong class="font-bold"></strong>,&nbsp;'
        }
      }}
      onBlur={() => {
        focusedRef.current = false
        commitFromDom()
      }}
    />
  )
}

function DucFieldCells({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className={cn(certMetaLabelClass, 'py-0.5')}>{label}</span>
      <span className={cn(certMetaSepClass, 'py-0.5')} aria-hidden>
        :-
      </span>
      <span className="min-w-0 break-words py-0.5 text-xs font-medium text-slate-900 sm:text-sm">
        {cellText(value)}
      </span>
    </>
  )
}

const MASTER_CERT_ROWS: Array<{
  label: string
  getValue: (master: MasterEquipmentForSheet) => string
}> = [
  {
    label: 'Master Equipment Name',
    getValue: (m) => (m.equipment_name ?? '').trim(),
  },
  {
    label: 'Calibration Temperature',
    getValue: () => '',
  },
  {
    label: 'Serial Number',
    getValue: (m) => (m.serial_number ?? '').trim(),
  },
  {
    label: 'Capacity & Class',
    getValue: (m) => {
      const capacity = (m.range_capacity ?? '').trim()
      const cls = (m.accuracy_acceptance_criteria ?? '').trim()
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
    label: 'Certificate No',
    getValue: (m) => (m.calibration_certificate_number ?? '').trim(),
  },
  {
    label: 'Calibrated By',
    getValue: () => '',
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
    <section className="overflow-hidden border border-slate-300 bg-white break-inside-avoid">
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
      <div className={contentClassName ?? 'p-2.5 sm:p-3'}>{children}</div>
    </section>
  )
}

export function CertificateDraftDialog({
  job,
  open,
  onOpenChange,
  onIssueAndForward,
}: {
  job: CalibrationJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persist draft then forward job to Certificates stage. */
  onIssueAndForward?: (job: CalibrationJobRow) => void | Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
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

  const load = useCallback(async (activeJob: CalibrationJobRow) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    setPayload(null)
    setMasters([])
    setLetterhead(null)
    setCertTemplate(defaultCalibrationCertificateTemplate())
    setDraft({ ...EMPTY_CERTIFICATE_DRAFT })
    setEquipmentLabel(activeJob.equipment_label)

    try {
      const [equipment, srfRow, sheet, storedDraft, suggestedCert, lh] = await Promise.all([
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
      const calDate =
        existing.dateOfCalibration ||
        (activeJob.stage_entered_at ?? '').slice(0, 10) ||
        todayIsoDate()
      const due =
        existing.dueDateOfCalibration ||
        computeDueFromFrequency(calDate, eqFields.frequency)
      const contactPrefill =
        existing.customerContactDetails || formatCustomerContactDetails(srfRow)

      const defaultNotes = template.defaultNotes.trim() || DEFAULT_CERTIFICATE_NOTES
      const defaultRemarks = template.defaultRemarks.trim() || DEFAULT_CERTIFICATE_REMARKS

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
        customerContactDetails: contactPrefill,
        issueDate: existing.issueDate || todayIsoDate(),
        pageNumber: existing.pageNumber || '01 of 02',
        workInstructionNumber: existing.workInstructionNumber || '',
        dateOfCalibration: calDate,
        dueDateOfCalibration: due,
        notes: existing.notes.trim() ? existing.notes : defaultNotes,
        remarks: existing.remarks.trim() ? existing.remarks : defaultRemarks,
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

  const eqFields = useMemo(
    () => (job ? parseJobEquipmentFields(job) : null),
    [job],
  )

  const environment: RawDataEnvironmentConditions | null =
    payload?.environmentConditions ?? null

  const ducTemperatureAtCalibration = useMemo(() => {
    const rows = environment?.rows ?? []
    for (const row of rows) {
      const vals = row.values ?? {}
      const direct = (vals.temperatureC ?? vals.temperature_c ?? '').trim()
      if (direct) return `${direct} °C`
      const fromKey = Object.entries(vals).find(([k, v]) =>
        /temp/i.test(k) && v.trim(),
      )
      if (fromKey?.[1]?.trim()) return `${fromKey[1].trim()} °C`
    }
    return ''
  }, [environment])

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
      if (key === 'dateOfCalibration' && eqFields?.frequency) {
        const computed = computeDueFromFrequency(String(value), eqFields.frequency)
        if (computed && !prev.dueDateOfCalibration) {
          next.dueDateOfCalibration = computed
        }
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
    return `Range ${fmt(min)} ${unit} - ${fmt(max)} ${unit}`
  }, [loadColumn, rows])

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
    ])

    // Prefer dedicated zero-reading column; else max |Load| deviation at lowest Load points
    // expressed in Load unit (kN).
    let maxZero: number | null =
      zeroReadingOk != null ? maxMagnitudeFromColumn(rows, zeroReadingOk.key) : null

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
        // At lowest Load row(s), take max |Relative Indication Error| if present —
        // still report in Load unit only when we have an absolute Load delta.
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
          // Only use Average vs Load when Average is same order as Load (force units).
          if (load != null && avg != null && avg <= load * 5 + 50) {
            const d = Math.abs(avg - load)
            if (maxDelta == null || d > maxDelta) maxDelta = d
          } else if (load != null && std != null && std <= load * 5 + 50) {
            const d = Math.abs(std - load)
            if (maxDelta == null || d > maxDelta) maxDelta = d
          }
        }
        // Fallback: report the lowest Load point itself (verified Load range start) in Load unit.
        maxZero = maxDelta ?? minLoad
      }
    }

    const maxRelZero =
      relativeZeroCol != null
        ? maxMagnitudeFromColumn(rows, relativeZeroCol.key)
        : null

    const uCandidates: number[] = []
    if (expandedUCol) {
      const fromRows = maxMagnitudeFromColumn(rows, expandedUCol.key)
      if (fromRows != null) uCandidates.push(fromRows)
    }
    for (const master of masters) {
      const u = parseNumericMagnitude(master.calibration_certificate_uncertainty)
      if (u != null) uCandidates.push(u)
    }
    const maxU = uCandidates.length > 0 ? Math.max(...uCandidates) : null
    const uUnit =
      masters
        .map((m) => (m.calibration_uncertainty_unit ?? '').trim())
        .find(Boolean) ?? ''

    return {
      maxZeroReadingObserved: maxZero != null ? withLoadUnit(maxZero) : '',
      maxRelativeZeroError:
        maxRelZero != null ? formatMagnitudeDisplay(maxRelZero) : '',
      uncertaintyReported:
        maxU != null
          ? uUnit
            ? `${formatMagnitudeDisplay(maxU)} ${uUnit}`
            : formatMagnitudeDisplay(maxU)
          : '',
    }
  }, [columns, rows, masters, loadColumn])

  // Prefill / refresh summary fields (replace old indicator Div auto-fill for zero reading).
  useEffect(() => {
    if (loading) return
    setDraft((prev) => {
      const next = { ...prev }
      let changed = false

      const curZero = prev.maxZeroReadingObserved.trim()
      const computedZero = computedCertSummary.maxZeroReadingObserved
      const looksLikeOldIndicatorAuto =
        /^\d+(\.\d+)?$/.test(curZero) && !/\b(kN|N|kgf|kg)\b/i.test(curZero)
      if (
        computedZero &&
        (!curZero || looksLikeOldIndicatorAuto || curZero !== computedZero)
      ) {
        // Always keep Maximum Zero Reading Observed in Load unit when we have a computed value.
        if (!curZero || looksLikeOldIndicatorAuto) {
          next.maxZeroReadingObserved = computedZero
          changed = true
        }
      }

      if (!prev.maxRelativeZeroError.trim() && computedCertSummary.maxRelativeZeroError) {
        next.maxRelativeZeroError = computedCertSummary.maxRelativeZeroError
        changed = true
      }
      if (!prev.uncertaintyReported.trim() && computedCertSummary.uncertaintyReported) {
        next.uncertaintyReported = computedCertSummary.uncertaintyReported
        changed = true
      }
      return changed ? next : prev
    })
  }, [computedCertSummary, loading])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="certificate-draft-dialog !flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#e8eaed] p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100 print:static print:h-auto print:max-h-none print:overflow-visible print:bg-white"
        layer="nested"
        aria-describedby={undefined}
      >
        <style>{`
          @media print {
            @page { size: letter; margin: 0; }
            body * { visibility: hidden !important; }
            .certificate-draft-dialog,
            .certificate-draft-dialog * { visibility: visible !important; }
            .certificate-draft-dialog {
              position: static !important;
              inset: auto !important;
              width: auto !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              background: white !important;
              transform: none !important;
            }
            .certificate-draft-no-print { display: none !important; }
            .certificate-letter-sheet {
              width: 8.5in !important;
              max-width: 8.5in !important;
              min-height: 11in !important;
              height: 11in !important;
              margin: 0 !important;
              padding: calc(0.5in - 5mm) 5mm 0.35in 10mm !important;
              box-shadow: none !important;
              border: 2px solid #1e293b !important;
              outline: 1px solid #1e293b !important;
              outline-offset: 3px !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
            }
            .certificate-letter-sheet--grow {
              height: auto !important;
              overflow: visible !important;
            }
            .certificate-letter-sheet--break {
              break-after: page !important;
              page-break-after: always !important;
            }
          }
        `}</style>

        <div className="certificate-draft-no-print relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
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

        <div className="min-h-0 flex-1 overflow-auto bg-[#e8eaed] px-3 py-4 sm:px-6 sm:py-5 print:overflow-visible print:bg-white print:p-0">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Loading certificate draft…
            </p>
          ) : (
            <div className="mx-auto flex w-full max-w-[8.5in] flex-col gap-3">
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
                numberBar={
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
                }
              >
                <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-slate-900 sm:text-base">
                  {certTemplate.title}
                </p>

                {/* Certificate header info table */}
                <div className="w-full overflow-hidden border border-slate-400">
                  {/* Customer (left) | Meta fields (right) */}
                  <div className="grid grid-cols-2">
                    <div
                      className={cn(
                        'flex min-h-[36px] flex-col gap-1.5 overflow-hidden bg-white p-1.5',
                        'border-r border-slate-400',
                      )}
                    >
                      <CustomerNameAddressContinuous
                        name={draft.customerName}
                        address={draft.customerAddress}
                        onChange={({ name: nextName, address: nextAddress }) => {
                          setDraft((prev) => ({
                            ...prev,
                            customerName: nextName,
                            customerAddress: nextAddress,
                          }))
                        }}
                      />
                      <CertAutoGrowTextarea
                        id="cert-customer-contact"
                        value={draft.customerContactDetails}
                        onChange={(v) => patchDraft('customerContactDetails', v)}
                        placeholder={'Contact person - Phone\nEmail'}
                        aria-label="Customer Contact Details"
                        className="relative z-0 shrink-0"
                      />
                    </div>
                    <div
                      className={cn(
                        certMetaGridClass,
                        'ml-auto w-max max-w-full min-h-[36px] bg-white p-1.5',
                      )}
                    >
                      <Label htmlFor="cert-srf" className={certMetaLabelClass}>
                        SRF No
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-srf"
                        value={draft.srfNumber}
                        onChange={(e) => patchDraft('srfNumber', e.target.value)}
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="SRF Number"
                      />
                      <Label htmlFor="cert-issue-date" className={certMetaLabelClass}>
                        Issue Date
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-issue-date"
                        type="date"
                        value={draft.issueDate}
                        onChange={(e) => patchDraft('issueDate', e.target.value)}
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="Issue Date"
                      />
                      <Label htmlFor="cert-wi" className={certMetaLabelClass}>
                        WI No
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-wi"
                        value={draft.workInstructionNumber}
                        onChange={(e) =>
                          patchDraft('workInstructionNumber', e.target.value)
                        }
                        placeholder="WI No."
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="Work Instruction Number"
                      />
                      <Label htmlFor="cert-format" className={certMetaLabelClass}>
                        Format No
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-format"
                        value={draft.formatNumber}
                        onChange={(e) => patchDraft('formatNumber', e.target.value)}
                        placeholder="Format No."
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="Format Number"
                      />
                      <Label htmlFor="cert-cal-date" className={certMetaLabelClass}>
                        Date of Calibration
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-cal-date"
                        type="date"
                        value={draft.dateOfCalibration}
                        onChange={(e) => patchDraft('dateOfCalibration', e.target.value)}
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="Date of Calibration"
                      />
                      <Label htmlFor="cert-due-date" className={certMetaLabelClass}>
                        Due Date of Calibration
                      </Label>
                      <span className={certMetaSepClass} aria-hidden>
                        :-
                      </span>
                      <Input
                        id="cert-due-date"
                        type="date"
                        value={draft.dueDateOfCalibration}
                        onChange={(e) =>
                          patchDraft('dueDateOfCalibration', e.target.value)
                        }
                        className={cn(certCellSingleLineClass, 'h-6 min-w-0')}
                        aria-label="Due Date of Calibration"
                      />
                    </div>
                  </div>
                </div>

              <SectionCard
                title={`${certTemplate.deviceSectionPrefix} :- ${cellText(equipmentLabel || job?.equipment_label)}`}
              >
                {/* DUC — 2-column field layout */}
                <div className="overflow-hidden border border-slate-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    <div
                      className={cn(
                        certMetaGridClass,
                        'min-w-0 content-start p-2 sm:border-r sm:border-slate-300',
                      )}
                    >
                      <DucFieldCells label="Make" value={eqFields?.make ?? ''} />
                      <DucFieldCells label="Model" value={eqFields?.model ?? ''} />
                      <DucFieldCells label="Serial No" value={eqFields?.serial ?? ''} />
                      <DucFieldCells
                        label="Resolution"
                        value={eqFields?.leastCount ?? ''}
                      />
                      <DucFieldCells label="Capacity" value={eqFields?.range ?? ''} />
                      <DucFieldCells
                        label="ID Number"
                        value={eqFields?.customerId ?? ''}
                      />
                    </div>
                    <div className={cn(certMetaGridClass, 'min-w-0 content-start p-2')}>
                      <DucFieldCells
                        label="Location"
                        value={job?.calibration_location ?? ''}
                      />
                      <DucFieldCells
                        label="Condition of DUC"
                        value={eqFields?.condition ?? ''}
                      />
                      <DucFieldCells
                        label="Referred Standard"
                        value={
                          (eqFields?.calMethod ?? '').trim() || ducReferredStandard
                        }
                      />
                      <DucFieldCells
                        label="Mode of Calibration"
                        value={eqFields?.physical ?? ''}
                      />
                      <DucFieldCells label="Method Used" value="" />
                      <DucFieldCells
                        label="Temperature @ Calibration"
                        value={ducTemperatureAtCalibration}
                      />
                    </div>
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
                  <div className="overflow-x-auto border border-slate-300">
                    <div
                      className="grid min-w-0"
                      style={{
                        gridTemplateColumns: `minmax(9.5rem, max-content) auto repeat(${masters.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {MASTER_CERT_ROWS.map((row) => (
                        <div key={row.label} className="contents">
                          <span
                            className={cn(
                              certMetaLabelClass,
                              'border-b border-slate-200 px-2 py-1',
                            )}
                          >
                            {row.label}
                          </span>
                          <span
                            className={cn(
                              certMetaSepClass,
                              'border-b border-slate-200 py-1 pr-1',
                            )}
                            aria-hidden
                          >
                            :-
                          </span>
                          {masters.map((master, index) => (
                            <span
                              key={`${row.label}-${master.id}`}
                              className={cn(
                                'min-w-0 break-words border-b border-slate-200 px-2 py-1 text-center text-xs font-medium text-slate-900 sm:text-sm',
                                index > 0 && 'border-l border-slate-200',
                              )}
                            >
                              {cellText(row.getValue(master))}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
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
                <div className="flex w-full flex-nowrap items-baseline gap-x-0.5 overflow-hidden px-2 py-1.5 text-[9px] leading-snug text-slate-900 sm:text-[10px]">
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    Maximum Zero Reading Observed =
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
                      'h-5 min-w-0 flex-1 basis-0 px-0.5 text-[9px] sm:text-[10px]',
                    )}
                    aria-label="Maximum Zero Reading Observed"
                  />
                  <span className="shrink-0 select-none text-slate-500" aria-hidden>
                    ,
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    Maximum Relative Zero Error =
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
                      'h-5 min-w-0 flex-1 basis-0 px-0.5 text-[9px] sm:text-[10px]',
                    )}
                    aria-label="Maximum Relative Zero Error"
                  />
                  <span className="shrink-0 select-none text-slate-500" aria-hidden>
                    ,
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    Uncertainty Reported =
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
                      'h-5 min-w-0 flex-1 basis-0 px-0.5 text-[9px] sm:text-[10px]',
                    )}
                    aria-label="Uncertainty Reported"
                  />
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
                    className="min-h-[1rem] !p-0 !text-[6px] !leading-snug sm:!text-[7px]"
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
                    className="min-h-[1rem] !p-0 !text-[6px] !leading-snug sm:!text-[7px]"
                    aria-label="Remarks"
                  />
                </SectionCard>
              </div>
              ) : null}

              {certTemplate.showSignatures ? (
              <div className="grid grid-cols-2 gap-3 break-inside-avoid border border-slate-300 bg-white px-3 py-4">
                <div className="flex min-h-[4.5rem] flex-col justify-end text-center">
                  <div className="mb-6 min-h-[2rem] border-b border-slate-400" aria-hidden />
                  <p className="text-[10px] font-semibold text-slate-900 sm:text-xs">
                    {certTemplate.calibratedByLabel}
                  </p>
                </div>
                <div className="flex min-h-[4.5rem] flex-col justify-end text-center">
                  <div className="mb-6 min-h-[2rem] border-b border-slate-400" aria-hidden />
                  <p className="text-[10px] font-semibold text-slate-900 sm:text-xs">
                    {certTemplate.authorizedSignatoryLabel}
                  </p>
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
                  disabled={loading || saving || issuing || !job}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
