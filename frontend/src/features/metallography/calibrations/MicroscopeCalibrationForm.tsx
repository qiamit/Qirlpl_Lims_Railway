import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BadgeCheck, CalendarClock, ImageUp, Loader2, Save, ShieldAlert, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EnvPanel, EnvSelect, Field, MessageLine, envInputClass } from '@/features/environment/EnvironmentUi'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { checkEquipmentUsableOn, type EquipmentOption } from '@/lib/equipmentTraceability'
import {
  limsDeleteBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { readingLengthPx, computeScaleFromReadings } from '../calc/scaleCalibration'
import {
  createCalibrationDraft,
  deleteCalibrationDraft,
  localIsoDate,
  metallographyErrorText,
  replaceCalibrationImage,
  shortenCalibrationValidity,
  updateCalibrationDraft,
  verifyCalibration,
  withdrawCalibration,
} from '../metallographyApi'
import {
  assertImagePixels,
  assertMetallographyImage,
  METALLOGRAPHY_IMAGE_EXTENSIONS,
  verifyStoredHash,
} from '../metallographyStorage'
import { CalibrationStatusBadge } from '../MetallographyUi'
import type { CalibrationReading, ScaleCalibration, ScaleCalibrationDraftInput, ScaleFromReadings } from '../types'
import {
  addOneYear,
  calibrationValidity,
  equipmentText,
  fixed,
  parseNumber,
  resolutionText,
  umPerPxText,
} from './calibrationFormat'
import { MicrometerReadingsCanvas } from './MicrometerReadingsCanvas'
import { CalibrationValidityBadge } from './MicroscopeCalibrationTable'

/**
 * S4 form (dialog): record a new calibration as a draft, change a draft
 * (performer or Director), verify it (a second person), withdraw it with a
 * reason, or shorten its validity. µm/px and u_rel are shown live from the
 * readings with calc/scaleCalibration.ts; the database recomputes and stores
 * the same numbers (calibration guard), so nothing typed can disagree.
 */

const AUDIT_TABLE = 'metallography_scale_calibrations'

const ACCEPT = [...METALLOGRAPHY_IMAGE_EXTENSIONS].map((e) => `.${e}`).join(',')

type FormFields = {
  microscopeId: string
  cameraId: string
  micrometerId: string
  objective: string
  totalMagnification: string
  referenceLengthUm: string
  validFrom: string
  validUntil: string
  notes: string
  readings: CalibrationReading[]
}

type ImageState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      url: string
      width: number
      height: number
      /** Newly chosen file (not yet uploaded); null = the stored image. */
      file: File | null
      /** Stored image re-hashed on open; null for a new file. */
      hashOk: boolean | null
      fileName: string | null
    }

function fieldsFrom(c: ScaleCalibration | null, today: string): FormFields {
  if (!c) {
    return {
      microscopeId: '',
      cameraId: '',
      micrometerId: '',
      objective: '',
      totalMagnification: '',
      referenceLengthUm: '',
      validFrom: today,
      validUntil: addOneYear(today),
      notes: '',
      readings: [],
    }
  }
  return {
    microscopeId: c.microscopeEquipmentId,
    cameraId: c.cameraEquipmentId ?? '',
    micrometerId: c.stageMicrometerEquipmentId,
    objective: c.objective,
    totalMagnification: c.totalMagnification === null ? '' : String(c.totalMagnification),
    referenceLengthUm: c.referenceLengthUm ? String(c.referenceLengthUm) : '',
    validFrom: c.validFrom ?? '',
    validUntil: c.validUntil,
    notes: c.notes ?? '',
    readings: c.readings.map((r) => ({ axis: r.axis, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 })),
  }
}

/** Natural size of an image URL (object URL, so nothing leaves the browser). */
function decodeImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('The image could not be read. Use PNG, JPEG, BMP or WebP.'))
    img.src = url
  })
}

function safeScale(readings: CalibrationReading[], referenceUm: number | null): ScaleFromReadings | null {
  try {
    return computeScaleFromReadings(readings, referenceUm ?? 0)
  } catch {
    return null
  }
}

function UsabilityLine({ option, onDate, label }: { option: EquipmentOption | undefined; onDate: string; label: string }) {
  if (!option) return null
  const u = checkEquipmentUsableOn(option, onDate)
  return (
    <p className={cn('text-[11.5px]', u.usable ? 'text-emerald-800' : 'font-semibold text-red-700')}>
      {u.usable
        ? `Usable on ${formatDate(onDate)}${option.calDueDate ? ` · cal due ${formatDate(option.calDueDate)}` : ''}`
        : `${label} not usable on ${formatDate(onDate)}: ${u.reason}`}
    </p>
  )
}

function StatRow({ label, x, y }: { label: string; x: ReactNode; y: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="border border-[#e7e0d4] px-2 py-1 text-left text-[11.5px] font-semibold text-stone-600">
        {label}
      </th>
      <td className="border border-[#e7e0d4] px-2 py-1 text-right font-mono text-[12px] tabular-nums">{x}</td>
      <td className="border border-[#e7e0d4] px-2 py-1 text-right font-mono text-[12px] tabular-nums">{y}</td>
    </tr>
  )
}

export type MicroscopeCalibrationFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = new calibration. Remount (key) to switch records. */
  calibration: ScaleCalibration | null
  /** Testing equipment (no CRMs) from loadEquipmentOptions(). */
  equipment: EquipmentOption[]
  equipmentById: ReadonlyMap<string, EquipmentOption>
  /** Director, or Edit on Microscope Calibration (and module access allows edit). */
  canEdit: boolean
  isDirector: boolean
  userId: string | null
  /** Result of the last write (shown on top after the form reopens on the saved record). */
  notice?: string | null
  /** After a write: the calibration as saved (null after delete) and a message for the page. */
  onChanged: (saved: ScaleCalibration | null, message: string) => void
}

export function MicroscopeCalibrationForm({
  open,
  onOpenChange,
  calibration,
  equipment,
  equipmentById,
  canEdit,
  isDirector,
  userId,
  notice = null,
  onChanged,
}: MicroscopeCalibrationFormProps) {
  const askReason = useReasonForChange()
  const [today] = useState(() => localIsoDate())
  const [initial] = useState(() => fieldsFrom(calibration, today))
  const [fields, setFields] = useState<FormFields>(initial)
  const [image, setImage] = useState<ImageState>(() => (calibration ? { status: 'loading' } : { status: 'none' }))
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'save' | 'verify' | 'withdraw' | 'shorten' | 'delete' | 'image'>(null)
  const [error, setError] = useState<string | null>(null)

  const isNew = calibration === null
  const status = calibration?.status ?? 'draft'
  const label = calibration?.calCode ?? 'New calibration'
  const isPerformer = Boolean(userId && calibration?.performedBy === userId)
  const canEditDraft = canEdit && (isNew || (status === 'draft' && (isPerformer || isDirector)))
  const canVerify = canEdit && !isNew && status === 'draft' && !isPerformer
  const canWithdraw = canEdit && status === 'verified'
  const canDelete = canEdit && !isNew && status === 'draft' && (isPerformer || isDirector)
  const validity = calibration ? calibrationValidity(calibration, today) : null

  // Stored micrometer image: download as a blob (canvas stays untainted) and re-hash it.
  useEffect(() => {
    if (!calibration) return
    let cancelled = false
    let createdUrl: string | null = null
    void (async () => {
      const res = await verifyStoredHash(calibration.evidenceImagePath, calibration.evidenceImageSha256)
      if (cancelled) return
      if (!res.blob) {
        setImage({ status: 'error', message: res.error ?? 'The micrometer image could not be downloaded.' })
        return
      }
      createdUrl = URL.createObjectURL(res.blob)
      try {
        const size = await decodeImageSize(createdUrl)
        if (cancelled) return
        setImage({
          status: 'ready',
          url: createdUrl,
          width: size.width,
          height: size.height,
          file: null,
          hashOk: res.ok,
          fileName: null,
        })
        createdUrl = null
      } catch (e) {
        if (!cancelled) setImage({ status: 'error', message: metallographyErrorText(e) })
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [calibration])

  // Free the object URL when it is replaced or the form closes.
  const imageUrl = image.status === 'ready' ? image.url : null
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    },
    [imageUrl],
  )

  const refUm = parseNumber(fields.referenceLengthUm)
  const scale = useMemo(() => safeScale(fields.readings, refUm), [fields.readings, refUm])
  const fieldsDirty = JSON.stringify(fields) !== JSON.stringify(initial)
  const imageChanged = image.status === 'ready' && image.file !== null
  const dirty = fieldsDirty || imageChanged

  const performedDate = calibration ? calibration.performedAt.slice(0, 10) : today
  const microscopeDate = fields.validFrom || performedDate
  const microscopeOpt = equipmentById.get(fields.microscopeId)
  const micrometerOpt = equipmentById.get(fields.micrometerId)
  const cameraOpt = equipmentById.get(fields.cameraId)

  const set = <K extends keyof FormFields>(key: K, value: FormFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  /** Equipment problems the database checks at verification. */
  const usabilityProblems = (): string[] => {
    const out: string[] = []
    if (micrometerOpt) {
      const u = checkEquipmentUsableOn(micrometerOpt, performedDate)
      if (!u.usable) out.push(`Stage micrometer on ${formatDate(performedDate)}: ${u.reason}`)
    }
    if (microscopeOpt) {
      const u = checkEquipmentUsableOn(microscopeOpt, microscopeDate)
      if (!u.usable) out.push(`Microscope on ${formatDate(microscopeDate)}: ${u.reason}`)
    }
    return out
  }

  const validationProblems = (): string[] => {
    const out: string[] = []
    if (!fields.microscopeId) out.push('Choose the microscope.')
    if (!fields.micrometerId) out.push('Choose the stage micrometer.')
    if (fields.microscopeId && fields.microscopeId === fields.micrometerId) {
      out.push('The microscope and the stage micrometer must be different equipment.')
    }
    if (fields.cameraId && (fields.cameraId === fields.microscopeId || fields.cameraId === fields.micrometerId)) {
      out.push('The camera must be different from the microscope and the stage micrometer.')
    }
    if (!fields.objective.trim()) out.push('Enter the objective (for example 10×).')
    const mag = parseNumber(fields.totalMagnification)
    if (fields.totalMagnification.trim() && (mag === null || mag <= 0)) out.push('Total magnification must be a number above 0.')
    if (image.status !== 'ready') out.push('Add the stage micrometer image.')
    if (!fields.validUntil) out.push('Enter "Valid until".')
    if (fields.validFrom && fields.validUntil && fields.validUntil < fields.validFrom) {
      out.push('"Valid until" must not be before "Valid from".')
    }
    if (scale) out.push(...scale.errors)
    else out.push('The readings could not be calculated.')
    return out
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      assertMetallographyImage(file)
    } catch (e) {
      setError(metallographyErrorText(e))
      return
    }
    if (fields.readings.length > 0 && !window.confirm('The readings drawn on the current image will be cleared. Continue?')) {
      return
    }
    setBusy('image')
    const url = URL.createObjectURL(file)
    try {
      const size = await decodeImageSize(url)
      assertImagePixels(size.width, size.height)
      setImage({ status: 'ready', url, width: size.width, height: size.height, file, hashOk: null, fileName: file.name })
      setFields((f) => ({ ...f, readings: [] }))
      setSelected(null)
    } catch (e) {
      URL.revokeObjectURL(url)
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const removeReading = (index: number) => {
    setFields((f) => ({ ...f, readings: f.readings.filter((_, i) => i !== index) }))
    setSelected(null)
  }

  const save = async () => {
    const problems = validationProblems()
    if (problems.length > 0) {
      setError(problems.join(' '))
      return
    }
    if (image.status !== 'ready' || refUm === null) return
    const input: ScaleCalibrationDraftInput = {
      microscopeEquipmentId: fields.microscopeId,
      cameraEquipmentId: fields.cameraId || null,
      stageMicrometerEquipmentId: fields.micrometerId,
      objective: fields.objective.trim(),
      totalMagnification: parseNumber(fields.totalMagnification),
      imageWidthPx: image.width,
      imageHeightPx: image.height,
      referenceLengthUm: refUm,
      readings: fields.readings,
      validFrom: fields.validFrom || null,
      validUntil: fields.validUntil,
      notes: fields.notes,
    }
    setBusy('save')
    setError(null)
    try {
      let saved: ScaleCalibration
      if (!calibration) {
        if (!image.file) throw new Error('Add the stage micrometer image.')
        saved = await createCalibrationDraft({ ...input, file: image.file })
      } else {
        const withImage = image.file ? await replaceCalibrationImage(calibration, image.file) : calibration
        saved = await updateCalibrationDraft(withImage.id, input)
      }
      onChanged(saved, `${saved.calCode ?? 'Calibration'} saved as a draft. A second person must verify it before it can be used.`)
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const verify = async () => {
    if (!calibration) return
    if (dirty) {
      setError('Save the changes to the draft first, then verify it as recorded.')
      return
    }
    const problems = usabilityProblems()
    let reason: string | null = null
    const askOverride = (detail: string) =>
      askReason({
        title: `Reason for verifying ${label} with equipment not usable`,
        recordLabel: label,
        description: `${detail} Only the Laboratory Director can verify in this case.`,
        confirmLabel: 'Verify',
        quickPicks: ['Certificate renewed, equipment master not yet updated', 'Breakdown closed, register not yet updated'],
      })
    if (problems.length > 0) {
      if (!isDirector) {
        setError(`Equipment not usable: ${problems.join('; ')}. Only the Laboratory Director can verify with a reason.`)
        return
      }
      reason = await askOverride(`${problems.join('; ')}.`)
      if (!reason) return
    } else if (
      !window.confirm(
        `Verify ${label}? Check the readings on the image first. Once verified, the readings, image and equipment cannot be changed.`,
      )
    ) {
      return
    }
    setBusy('verify')
    setError(null)
    try {
      let saved: ScaleCalibration
      try {
        saved = await verifyCalibration(calibration.id, reason)
      } catch (e) {
        // The database found a problem the equipment list here did not show (stale data).
        const text = metallographyErrorText(e)
        if (!isDirector || reason || !/equipment not usable/i.test(text)) throw e
        reason = await askOverride(text)
        if (!reason) return
        saved = await verifyCalibration(calibration.id, reason)
      }
      if (reason) await recordReason(AUDIT_TABLE, calibration.id, reason)
      onChanged(saved, `${saved.calCode ?? 'Calibration'} verified. It can now be used for analyses at ${resolutionText(saved.imageWidthPx, saved.imageHeightPx)}.`)
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async () => {
    if (!calibration) return
    const reason = await askReason({
      title: `Reason for withdrawing ${label}`,
      recordLabel: label,
      description:
        'A withdrawn calibration cannot be chosen for new analyses. Completed analyses keep the scale they were measured with.',
      confirmLabel: 'Withdraw',
      quickPicks: ['Microscope serviced or moved', 'Camera, objective or resolution changed', 'Readings found to be wrong', 'Replaced by a new calibration'],
    })
    if (!reason) return
    setBusy('withdraw')
    setError(null)
    try {
      const saved = await withdrawCalibration(calibration.id, reason)
      await recordReason(AUDIT_TABLE, calibration.id, reason)
      onChanged(saved, `${saved.calCode ?? 'Calibration'} withdrawn.`)
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const shorten = async () => {
    if (!calibration) return
    const until = fields.validUntil
    if (!until || until >= calibration.validUntil) {
      setError('Choose a "Valid until" date earlier than the current one. A verified calibration can only be shortened.')
      return
    }
    const from = calibration.validFrom ?? performedDate
    if (until < from) {
      setError('"Valid until" must not be before "Valid from". Withdraw the calibration instead.')
      return
    }
    const reason = await askReason({
      title: `Reason for shortening the validity of ${label}`,
      recordLabel: `${label}: ${formatDate(calibration.validUntil)} → ${formatDate(until)}`,
      confirmLabel: 'Shorten validity',
      quickPicks: ['Microscope service planned', 'Recalibration due earlier', 'Entry error corrected'],
    })
    if (!reason) return
    setBusy('shorten')
    setError(null)
    try {
      const saved = await shortenCalibrationValidity(calibration.id, until)
      await recordReason(AUDIT_TABLE, calibration.id, reason)
      onChanged(saved, `${saved.calCode ?? 'Calibration'} is now valid until ${formatDate(saved.validUntil)}.`)
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!calibration) return
    if (!window.confirm(`Delete draft ${label} and its micrometer image? This cannot be undone.`)) return
    setBusy('delete')
    setError(null)
    try {
      await deleteCalibrationDraft(calibration)
      onChanged(null, `Draft ${label} deleted.`)
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const closeIfIdle = (next: boolean) => {
    if (!next && busy) return
    if (!next && dirty && canEditDraft && !window.confirm('Close without saving the changes?')) return
    onOpenChange(next)
  }

  const equipmentSelect = (
    id: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    disabled: boolean,
  ) => (
    <EnvSelect id={id} value={value} onChange={onChange} disabled={disabled}>
      <option value="">{placeholder}</option>
      {value && !equipmentById.has(value) ? <option value={value}>Equipment not found</option> : null}
      {equipment.map((e) => (
        <option key={e.id} value={e.id}>
          {[e.assetCode, e.name].filter((x) => x && x.trim()).join(' · ')}
        </option>
      ))}
    </EnvSelect>
  )

  const fieldsLocked = !canEditDraft || busy !== null
  const readingCounts = scale ? `x ${scale.nX} · y ${scale.nY}` : '—'
  const viewOnlyNote = !canEdit
    ? 'View only. Recording and verifying calibrations needs Edit on Microscope Calibration (or the Laboratory Director).'
    : status === 'draft' && !isNew && !isPerformer && !isDirector
      ? `Only ${calibration?.performedByName || 'the person who performed it'} (or the Laboratory Director) can change this draft. You can verify it.`
      : status === 'draft' && isPerformer
        ? 'You performed this calibration, so a second person must verify it.'
        : null

  return (
    <Dialog open={open} onOpenChange={closeIfIdle}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:pl-[268px]"
        className={cn(
          limsDialogClass,
          'flex w-[min(100%-1rem,84rem)] max-w-none max-h-[min(94dvh,60rem)] flex-col',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-white sm:text-lg">
              <span className="font-mono">{label}</span>
              {calibration ? <CalibrationStatusBadge status={calibration.status} /> : null}
              {validity ? <CalibrationValidityBadge validity={validity} /> : null}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              Draw at least 3 readings per axis on the stage micrometer image. µm per pixel holds only at the image
              resolution recorded here.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white p-3 sm:p-4">
          {image.status === 'ready' && image.hashOk === false ? (
            <p role="alert" className="flex items-start gap-2 border-2 border-red-700 bg-red-50 p-3 text-[13px] font-semibold text-red-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              The stored micrometer image does not match its recorded SHA-256. Do not verify or use this calibration;
              tell the Quality Manager.
            </p>
          ) : null}
          {calibration && image.status === 'ready' && image.file === null &&
          (image.width !== calibration.imageWidthPx || image.height !== calibration.imageHeightPx) ? (
            <MessageLine
              tone="error"
              text={`The image is ${resolutionText(image.width, image.height)} but the calibration records ${resolutionText(
                calibration.imageWidthPx,
                calibration.imageHeightPx,
              )}.`}
            />
          ) : null}
          <MessageLine tone="ok" text={notice} />
          <MessageLine text={viewOnlyNote} />
          <MessageLine tone="error" text={error} />

          <EnvPanel title="Equipment and optics">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Microscope *" htmlFor="msc-microscope">
                {equipmentSelect('msc-microscope', fields.microscopeId, (v) => set('microscopeId', v), 'Choose microscope', fieldsLocked)}
                <UsabilityLine option={microscopeOpt} onDate={microscopeDate} label="Microscope" />
              </Field>
              <Field label="Camera" htmlFor="msc-camera">
                {equipmentSelect('msc-camera', fields.cameraId, (v) => set('cameraId', v), 'No separate camera', fieldsLocked)}
                <UsabilityLine option={cameraOpt} onDate={microscopeDate} label="Camera" />
              </Field>
              <Field label="Stage micrometer *" htmlFor="msc-micrometer">
                {equipmentSelect('msc-micrometer', fields.micrometerId, (v) => set('micrometerId', v), 'Choose stage micrometer', fieldsLocked)}
                <UsabilityLine option={micrometerOpt} onDate={performedDate} label="Stage micrometer" />
              </Field>
              <Field label="Objective *" htmlFor="msc-objective">
                <Input
                  id="msc-objective"
                  value={fields.objective}
                  onChange={(e) => set('objective', e.target.value)}
                  placeholder="e.g. 10×"
                  disabled={fieldsLocked}
                  className={envInputClass}
                />
              </Field>
              <Field label="Total magnification (×)" htmlFor="msc-mag">
                <Input
                  id="msc-mag"
                  inputMode="decimal"
                  value={fields.totalMagnification}
                  onChange={(e) => set('totalMagnification', e.target.value)}
                  placeholder="e.g. 100"
                  disabled={fieldsLocked}
                  className={envInputClass}
                />
              </Field>
              <Field label="Reference length per reading (µm) *" htmlFor="msc-ref">
                <Input
                  id="msc-ref"
                  inputMode="decimal"
                  value={fields.referenceLengthUm}
                  onChange={(e) => set('referenceLengthUm', e.target.value)}
                  placeholder="e.g. 100"
                  disabled={fieldsLocked}
                  className={envInputClass}
                />
                <p className="text-[11.5px] text-stone-600">Distance on the micrometer scale between the two ends of every reading.</p>
              </Field>
            </div>
          </EnvPanel>

          <EnvPanel
            title="Micrometer image and readings"
            right={
              image.status === 'ready' ? (
                <span className="text-[11.5px] text-amber-100">
                  {image.fileName ? `${image.fileName} · ` : ''}
                  {resolutionText(image.width, image.height)}
                </span>
              ) : null
            }
          >
            {canEditDraft ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    limsOutlineBtnClass,
                    'inline-flex cursor-pointer items-center gap-1.5 border px-3 text-sm',
                    busy !== null && 'pointer-events-none opacity-50',
                  )}
                >
                  {busy === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                  {image.status === 'ready' ? 'Replace image' : 'Choose image'}
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    disabled={busy !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      void pickFile(file)
                    }}
                  />
                </label>
                <span className="text-[11.5px] text-stone-600">
                  PNG, JPEG, BMP or WebP, up to 25 MB. Use the image exactly as the camera saves it (no resizing).
                </span>
              </div>
            ) : null}

            {image.status === 'loading' ? (
              <p className="flex items-center gap-2 p-4 text-[13px] text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading and checking the micrometer image…
              </p>
            ) : image.status === 'error' ? (
              <MessageLine tone="error" text={image.message} />
            ) : image.status === 'none' ? (
              <div className="border border-dashed border-stone-400 bg-[#fffcf7] p-6 text-center text-[13px] text-stone-600">
                Choose the stage micrometer image taken with this microscope, objective and camera setting.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <MicrometerReadingsCanvas
                  imageUrl={image.url}
                  width={image.width}
                  height={image.height}
                  readings={fields.readings}
                  onChange={canEditDraft ? (next) => set('readings', next) : undefined}
                  readOnly={fieldsLocked}
                  selectedIndex={selected}
                  onSelect={setSelected}
                  onRejected={setError}
                />

                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                      Readings ({readingCounts})
                    </p>
                    {fields.readings.length === 0 ? (
                      <p className="border border-dashed border-stone-400 p-2 text-[12px] text-stone-600">
                        No readings yet. At least 3 along x and 3 along y.
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto border border-[#e7e0d4] bg-white">
                        <table className="w-full border-collapse text-[12px]">
                          <thead className="sticky top-0 bg-stone-800 text-[10.5px] uppercase tracking-wide text-amber-200">
                            <tr>
                              <th className="px-2 py-1 text-left">#</th>
                              <th className="px-2 py-1 text-left">From → to (px)</th>
                              <th className="px-2 py-1 text-right">Length px</th>
                              {canEditDraft ? <th className="w-8 px-1 py-1" aria-label="Remove" /> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {fields.readings.map((r, i) => {
                              const n = fields.readings.slice(0, i + 1).filter((o) => o.axis === r.axis).length
                              return (
                                <tr
                                  key={i}
                                  onClick={() => setSelected(selected === i ? null : i)}
                                  className={cn(
                                    'cursor-pointer border-t border-[#e7e0d4]',
                                    selected === i ? 'bg-amber-100' : 'hover:bg-[#f3e9d8]',
                                  )}
                                >
                                  <td className={cn('px-2 py-1 font-semibold', r.axis === 'x' ? 'text-amber-700' : 'text-sky-700')}>
                                    {r.axis}
                                    {n}
                                  </td>
                                  <td className="px-2 py-1 font-mono tabular-nums text-stone-700">
                                    ({r.x1.toFixed(1)}, {r.y1.toFixed(1)}) → ({r.x2.toFixed(1)}, {r.y2.toFixed(1)})
                                  </td>
                                  <td className="px-2 py-1 text-right font-mono tabular-nums">{fixed(readingLengthPx(r), 2)}</td>
                                  {canEditDraft ? (
                                    <td className="px-1 py-0.5 text-center">
                                      <button
                                        type="button"
                                        className="p-1 text-red-700 hover:bg-red-50 disabled:opacity-40"
                                        aria-label={`Remove reading ${r.axis}${n}`}
                                        disabled={fieldsLocked}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          removeReading(i)
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  ) : null}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Scale (live)</p>
                    <table className="w-full border-collapse bg-white">
                      <thead>
                        <tr className="bg-stone-800 text-[10.5px] uppercase tracking-wide text-amber-200">
                          <th className="px-2 py-1 text-left" />
                          <th className="px-2 py-1 text-right">X</th>
                          <th className="px-2 py-1 text-right">Y</th>
                        </tr>
                      </thead>
                      <tbody>
                        <StatRow label="Readings" x={scale?.nX ?? 0} y={scale?.nY ?? 0} />
                        <StatRow label="Mean length px" x={fixed(scale?.meanPxX, 4)} y={fixed(scale?.meanPxY, 4)} />
                        <StatRow label="s px" x={fixed(scale?.sPxX, 4)} y={fixed(scale?.sPxY, 4)} />
                        <StatRow label="µm / px" x={umPerPxText(scale?.umPerPxX)} y={umPerPxText(scale?.umPerPxY)} />
                        <StatRow label="u rel %" x={fixed(scale?.uRelPctX, 4)} y={fixed(scale?.uRelPctY, 4)} />
                      </tbody>
                    </table>
                    <p className="mt-1 text-[12px] text-stone-700">
                      Scale uncertainty (larger axis):{' '}
                      <span className="font-mono font-semibold tabular-nums">{fixed(scale?.uRelScalePct, 4)} %</span>
                    </p>
                    {canEditDraft && scale && scale.errors.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-amber-900">
                        {scale.errors.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </EnvPanel>

          <EnvPanel title="Validity and notes">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Valid from" htmlFor="msc-from">
                <Input
                  id="msc-from"
                  type="date"
                  value={fields.validFrom}
                  onChange={(e) => set('validFrom', e.target.value)}
                  disabled={fieldsLocked}
                  className={envInputClass}
                />
                <p className="text-[11.5px] text-stone-600">Empty = the reading date.</p>
              </Field>
              <Field label="Valid until *" htmlFor="msc-until">
                <Input
                  id="msc-until"
                  type="date"
                  value={fields.validUntil}
                  max={canWithdraw && calibration ? calibration.validUntil : undefined}
                  onChange={(e) => set('validUntil', e.target.value)}
                  disabled={!(canEditDraft || canWithdraw) || busy !== null}
                  className={envInputClass}
                />
                {canWithdraw ? <p className="text-[11.5px] text-stone-600">Can only be made earlier.</p> : null}
              </Field>
              <Field label="Notes" htmlFor="msc-notes" className="sm:col-span-2">
                <Textarea
                  id="msc-notes"
                  rows={2}
                  value={fields.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Camera setting, illumination, binning…"
                  disabled={fieldsLocked}
                  className="min-h-10 rounded-none border-stone-500 bg-stone-50 text-base sm:text-sm"
                />
              </Field>
            </div>
          </EnvPanel>

          {calibration ? (
            <EnvPanel title="Record">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-stone-500">Performed</dt>
                  <dd>
                    {calibration.performedByName || '—'} · {formatDateTime(calibration.performedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Verified</dt>
                  <dd>
                    {calibration.verifiedAt
                      ? `${calibration.verifiedByName || '—'} · ${formatDateTime(calibration.verifiedAt)}`
                      : 'Not yet'}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Stored µm/px X · Y · u rel</dt>
                  <dd className="font-mono tabular-nums">
                    {umPerPxText(calibration.umPerPxX)} · {umPerPxText(calibration.umPerPxY)} · {fixed(calibration.uRelScalePct, 4)} %
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Equipment</dt>
                  <dd>
                    {equipmentText(calibration.microscopeEquipmentId, equipmentById)}
                    {calibration.cameraEquipmentId ? ` · ${equipmentText(calibration.cameraEquipmentId, equipmentById)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Image SHA-256</dt>
                  <dd className="break-all font-mono text-[11.5px]" title={calibration.evidenceImageSha256}>
                    {calibration.evidenceImageSha256.slice(0, 16)}…
                    {image.status === 'ready' && image.file === null && image.hashOk ? ' · checked' : ''}
                  </dd>
                </div>
                {calibration.overrideReason ? (
                  <div>
                    <dt className="text-stone-500">Director override</dt>
                    <dd>{calibration.overrideReason}</dd>
                  </div>
                ) : null}
                {calibration.withdrawReason ? (
                  <div>
                    <dt className="text-stone-500">Withdrawn because</dt>
                    <dd>{calibration.withdrawReason}</dd>
                  </div>
                ) : null}
              </dl>
            </EnvPanel>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-3 py-2 sm:px-4">
          {canDelete ? (
            <Button type="button" className={cn(limsDeleteBtnClass, 'mr-auto px-3')} onClick={() => void remove()} disabled={busy !== null}>
              {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete draft
            </Button>
          ) : null}
          {canWithdraw ? (
            <Button type="button" className={cn(limsDeleteBtnClass, 'mr-auto px-3')} onClick={() => void withdraw()} disabled={busy !== null}>
              {busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Withdraw
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => closeIfIdle(false)}
            disabled={busy !== null}
          >
            Close
          </Button>
          {canWithdraw ? (
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'gap-1.5')}
              onClick={() => void shorten()}
              disabled={busy !== null || !calibration || fields.validUntil >= calibration.validUntil}
            >
              {busy === 'shorten' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Shorten validity
            </Button>
          ) : null}
          {canEditDraft ? (
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'gap-1.5')}
              onClick={() => void save()}
              disabled={busy !== null || (!isNew && !dirty)}
            >
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </Button>
          ) : null}
          {canVerify ? (
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'gap-1.5 bg-emerald-700 hover:bg-emerald-800')}
              onClick={() => void verify()}
              disabled={busy !== null || image.status !== 'ready' || image.hashOk === false}
            >
              {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Verify
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
