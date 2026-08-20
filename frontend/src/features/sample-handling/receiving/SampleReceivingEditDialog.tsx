import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  RECEIVING_REPORT_TYPES,
  addDays,
  emptySampleReceivingForm,
  normalizeText,
  type SampleReceivingForm as ReceivingFormState,
  type SampleRow,
} from '../types'
import { SampleReceivingForm } from './SampleReceivingForm'
import { AddClientDialog } from './AddClientDialog'
import { AddIsCodeDialog } from './AddIsCodeDialog'
import { generateNextSrfNumber } from './generateNextSrfNumber'
import { buildReceivingSrfFromReference, stripReceivingReportSuffix } from './receivingSrfFromReference'
import { isSampleReceivingEditLocked } from './sampleReceivingEditLock'
import { setSampleReceivingEditUnlocked } from './sampleReceivingEditUnlock'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  fetchSampleRowById,
  sampleRowToReceivingForm,
  saveSampleReceivingEdit,
} from './sampleReceivingRecord'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as { message?: string }
  return e.message ?? 'Unknown error'
}

export function SampleReceivingEditDialog({
  open,
  onOpenChange,
  sampleId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  onSaved?: (result: { sampleId: string; srfNumber: string | null }) => void
}) {
  const handleOpenChange = useFormDialogOpenChange(onOpenChange)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadLoading, setLoadLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [form, setForm] = useState<ReceivingFormState>(() => emptySampleReceivingForm())
  const [clientReferencesFile, setClientReferencesFile] = useState<File | null>(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addIsCodeOpen, setAddIsCodeOpen] = useState(false)
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([])
  const [isCodeOptions, setIsCodeOptions] = useState<Array<{ id: string; label: string }>>([])
  const [receivingOptions, setReceivingOptions] = useState<{
    test_required: Array<{ id: string; label: string }>
    mode_of_disposal: Array<{ id: string; label: string }>
    nature_of_sample: Array<{ id: string; label: string }>
    sample_receiving_status: Array<{ id: string; label: string }>
  }>({
    test_required: [],
    mode_of_disposal: [],
    nature_of_sample: [],
    sample_receiving_status: [],
  })
  const [srfSearchRows, setSrfSearchRows] = useState<SampleRow[]>([])
  const [loadedSampleId, setLoadedSampleId] = useState<string | null>(null)
  const [loadedRow, setLoadedRow] = useState<SampleRow | null>(null)
  const [preserveWorkflowStage, setPreserveWorkflowStage] = useState(false)
  const [unlockedForSession, setUnlockedForSession] = useState(false)

  const isNewReport = form.receivingReportType === RECEIVING_REPORT_TYPES[0]
  const canSave =
    !saveLoading &&
    Boolean(loadedSampleId) &&
    (normalizeText(form.sampleCode).length > 0 || form.customerId.trim().length > 0) &&
    (isNewReport || normalizeText(form.referencedSrfNumber).length > 0)

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data) ? (data as Array<{ id: string; company_name: string }>) : []
      setClientOptions(list.map((r) => ({ id: r.id, label: r.company_name ?? r.id })))
    } catch {
      setClientOptions([])
    }
  }

  const loadIsCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('is_codes')
        .select('id, is_number, revision_year')
        .order('is_number', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; is_number: string; revision_year: string | null }>)
        : []
      setIsCodeOptions(
        list.map((r) => ({
          id: r.id,
          label: formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.id,
        })),
      )
    } catch {
      setIsCodeOptions([])
    }
  }

  const loadReceivingOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('sample_receiving_options')
        .select('id, category, label')
        .order('label', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data) ? (data as Array<{ id: string; category: string; label: string }>) : []
      const byCat: Record<string, Array<{ id: string; label: string }>> = {
        test_required: [],
        mode_of_disposal: [],
        nature_of_sample: [],
        sample_receiving_status: [],
      }
      list.forEach((r) => {
        if (byCat[r.category]) byCat[r.category].push({ id: r.id, label: r.label })
      })
      setReceivingOptions({
        test_required: byCat.test_required ?? [],
        mode_of_disposal: byCat.mode_of_disposal ?? [],
        nature_of_sample: byCat.nature_of_sample ?? [],
        sample_receiving_status: byCat.sample_receiving_status ?? [],
      })
    } catch {
      /* keep defaults */
    }
  }

  const loadSrfSearchRows = async () => {
    try {
      const { data, error } = await supabase
        .from('samples')
        .select('id, srf_number, client_name, clients(company_name)')
        .order('srf_number', { ascending: false })
        .limit(500)
      if (error) throw error
      const list = (Array.isArray(data) ? data : []).map((r) => {
        const clients = (r as { clients?: { company_name?: string } | null }).clients
        return {
          id: String((r as { id: string }).id),
          srf_number: ((r as { srf_number?: string }).srf_number as string) ?? null,
          client_name: clients?.company_name ?? ((r as { client_name?: string }).client_name as string) ?? null,
        } as SampleRow
      })
      setSrfSearchRows(list)
    } catch {
      setSrfSearchRows([])
    }
  }

  useEffect(() => {
    if (!open) return
    void loadClients()
    void loadIsCodes()
    void loadReceivingOptions()
    void loadSrfSearchRows()
  }, [open])

  useEffect(() => {
    if (!open || !sampleId) {
      setLoadedSampleId(null)
      setLoadError(null)
      setSaveMessage(null)
      setClientReferencesFile(null)
      setUnlockedForSession(false)
      setPreserveWorkflowStage(false)
      return
    }

    let canceled = false
    setLoadLoading(true)
    setLoadError(null)
    setSaveMessage(null)
    setActiveTab('details')

    void (async () => {
      try {
        const row = await fetchSampleRowById(sampleId)
        if (canceled) return

        const { data: allocRows } = await supabase
          .from('sample_allocations')
          .select('sample_id')
          .eq('sample_id', sampleId)
          .limit(1)
        const inAllocation = Array.isArray(allocRows) && allocRows.length > 0
        const sampleIdsInAllocation = new Set(inAllocation ? [sampleId] : [])
        const preserve = String(row.stage ?? 'receiving').trim() !== 'receiving'
        const needsUnlock =
          preserve || isSampleReceivingEditLocked(row, sampleIdsInAllocation)

        if (needsUnlock) {
          await setSampleReceivingEditUnlocked(sampleId, true)
          if (!canceled) setUnlockedForSession(true)
        }

        if (canceled) {
          if (needsUnlock) await setSampleReceivingEditUnlocked(sampleId, false).catch(() => {})
          return
        }

        setPreserveWorkflowStage(preserve)
        setLoadedRow(row)
        setForm(sampleRowToReceivingForm(row))
        setLoadedSampleId(sampleId)
        setClientReferencesFile(null)
      } catch (err) {
        if (!canceled) setLoadError(formatSupabaseError(err))
      } finally {
        if (!canceled) setLoadLoading(false)
      }
    })()

    return () => {
      canceled = true
    }
  }, [open, sampleId])

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && unlockedForSession && loadedSampleId) {
      void setSampleReceivingEditUnlocked(loadedSampleId, false).finally(() => {
        setUnlockedForSession(false)
        handleOpenChange(false)
      })
      return
    }
    handleOpenChange(nextOpen)
  }

  const handleReportTypeChange = (reportType: string) => {
    void (async () => {
      if (reportType === RECEIVING_REPORT_TYPES[0]) {
        const srf = await generateNextSrfNumber(form.dateOfSampleReceiving)
        setForm((prev) => ({
          ...prev,
          receivingReportType: reportType,
          referencedSrfNumber: '',
          srfNumber: srf,
        }))
      } else {
        setForm((prev) => {
          const base =
            stripReceivingReportSuffix(prev.referencedSrfNumber) ||
            stripReceivingReportSuffix(prev.srfNumber)
          return {
            ...prev,
            receivingReportType: reportType,
            referencedSrfNumber: base,
            srfNumber: base ? buildReceivingSrfFromReference(base, reportType) : '',
          }
        })
      }
    })()
  }

  const handleSelectReferencedSrf = (refSampleId: string) => {
    const row = srfSearchRows.find((r) => r.id === refSampleId)
    if (!row) return
    const base = stripReceivingReportSuffix(row.srf_number ?? '')
    const filled = sampleRowToReceivingForm(row)
    filled.receivingReportType = form.receivingReportType
    filled.referencedSrfNumber = base
    filled.sampleCode = ''
    filled.clientReferencesPath = ''
    filled.srfNumber = buildReceivingSrfFromReference(base, form.receivingReportType)
    setForm(filled)
    setClientReferencesFile(null)
  }

  const handleSave = () => {
    if (!loadedSampleId) return
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const result = await saveSampleReceivingEdit({
          sampleId: loadedSampleId,
          form,
          clientReferencesFile,
          preserveWorkflowStage,
        })
        setUnlockedForSession(false)
        onSaved?.({ sampleId: loadedSampleId, srfNumber: result.srfNumber })
        handleOpenChange(false)
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const statusOptions = useMemo(
    () => [
      'Received',
      'Under Review',
      'Rejected',
      'Returned',
      ...receivingOptions.sample_receiving_status
        .map((o) => o.label)
        .filter((l) => !['Received', 'Under Review', 'Rejected', 'Returned'].includes(l)),
    ],
    [receivingOptions.sample_receiving_status],
  )

  const onAddReceivingOption = async (category: string, label: string) => {
    const { error } = await supabase
      .from('sample_receiving_options')
      .insert({ category, label: label.trim() })
    if (error) throw error
    await loadReceivingOptions()
  }

  const onUpdateReceivingOption = async (category: string, id: string, label: string) => {
    const { error } = await supabase
      .from('sample_receiving_options')
      .update({ label: label.trim() })
      .eq('id', id)
      .eq('category', category)
    if (error) throw error
    await loadReceivingOptions()
  }

  const onDeleteReceivingOption = async (category: string, id: string) => {
    const { error } = await supabase.from('sample_receiving_options').delete().eq('id', id)
    if (error) throw error
    await loadReceivingOptions()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          persistOnFocusLoss
          layer="nested"
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            'flex max-h-[92vh] w-[min(96vw,62.5rem)] max-w-[62.5rem] flex-col',
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Edit Sample Receiving — {form.srfNumber.trim() || 'SRF'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5 sm:py-5">
            {loadLoading && <p className="text-sm text-stone-600">Loading sample…</p>}
            {loadError && (
              <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {loadError}
              </p>
            )}
            {saveMessage && (
              <p className="mb-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            )}
            {!loadLoading && !loadError && loadedSampleId ? (
              <SampleReceivingForm
                form={form}
                onChange={setForm}
                onSave={handleSave}
                onClear={() => {
                  if (loadedRow) setForm(sampleRowToReceivingForm(loadedRow))
                }}
                onGoToReview={() => setActiveTab('review')}
                canSave={canSave}
                saveLoading={saveLoading}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                clientOptions={clientOptions}
                isCodeOptions={isCodeOptions}
                testRequiredOptions={receivingOptions.test_required}
                modeOfDisposalOptions={receivingOptions.mode_of_disposal}
                natureOfSampleOptions={receivingOptions.nature_of_sample}
                sampleReceivingStatusOptions={statusOptions}
                onAddClient={() => setAddClientOpen(true)}
                onAddIsCode={() => setAddIsCodeOpen(true)}
                onFileSelect={setClientReferencesFile}
                clientReferencesFileName={clientReferencesFile?.name}
                editingSampleId={loadedSampleId}
                srfSearchRows={srfSearchRows}
                onReportTypeChange={handleReportTypeChange}
                onSelectReferencedSrf={handleSelectReferencedSrf}
                onDateOfSampleReceivingChange={async (newDate) => {
                  const tent = addDays(newDate, 10)
                  if (form.receivingReportType === RECEIVING_REPORT_TYPES[0]) {
                    const srf = await generateNextSrfNumber(newDate)
                    setForm((prev) => ({
                      ...prev,
                      dateOfSampleReceiving: newDate,
                      srfNumber: srf,
                      tentativeDateRequired: tent,
                      tentativeDateByLab: tent,
                    }))
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      dateOfSampleReceiving: newDate,
                      tentativeDateRequired: tent,
                      tentativeDateByLab: tent,
                    }))
                  }
                }}
                onAddReceivingOption={onAddReceivingOption}
                onUpdateReceivingOption={onUpdateReceivingOption}
                onDeleteReceivingOption={onDeleteReceivingOption}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <AddClientDialog
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onSaved={(id) => {
          void loadClients()
          setForm((prev) => ({ ...prev, customerId: id }))
        }}
      />
      <AddIsCodeDialog
        open={addIsCodeOpen}
        onOpenChange={setAddIsCodeOpen}
        onSaved={(id) => {
          void loadIsCodes()
          setForm((prev) => ({ ...prev, testReportAsPerIsId: id }))
        }}
      />
    </>
  )
}
