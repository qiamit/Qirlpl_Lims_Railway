import { useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import { limsOutlineBtnClass, limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  aiFillBreakdownField,
  type BreakdownAiFieldKey,
} from './breakdownAiFill'
import { PostRepairCalibrationDialog } from './PostRepairCalibrationDialog'
import {
  BREAKDOWN_STATUSES,
  matchesSourceFilter,
  type BreakdownRegisterForm,
  type BreakdownStatus,
  type EquipmentPickOption,
  type EquipmentSource,
  type EquipmentSourceFilter,
} from './types'

type EmployeeOption = { id: string; full_name: string }

function EmployeePicker({
  employees,
  employeeId,
  displayName,
  onPick,
  listId,
  placeholder,
}: {
  employees: EmployeeOption[]
  employeeId: string
  displayName: string
  onPick: (id: string, name: string) => void
  listId: string
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedLabel =
    employees.find((e) => e.id === employeeId)?.full_name || displayName || ''

  const options = useMemo<FilterComboboxOption[]>(() => {
    const q = (open ? query : selectedLabel).trim().toLowerCase()
    return employees
      .filter((e) => !q || e.full_name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((e) => ({ id: e.id, label: e.full_name }))
  }, [employees, open, query, selectedLabel])

  return (
    <FilterCombobox
      listId={listId}
      value={open ? query : selectedLabel}
      onValueChange={(v) => {
        setQuery(v)
        if (!open) setOpen(true)
        if (!v.trim()) onPick('', '')
      }}
      options={options}
      onSelectOption={(opt) => {
        onPick(opt.id, opt.label)
        setQuery(opt.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery(selectedLabel)
      }}
      placeholder={placeholder}
    />
  )
}

export function EquipmentBreakdownForm({
  form,
  onChange,
  equipmentOptions,
  employees,
  canSave,
  saveLoading,
  onSave,
}: {
  form: BreakdownRegisterForm
  onChange: (next: BreakdownRegisterForm) => void
  equipmentOptions: EquipmentPickOption[]
  employees: EmployeeOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const showAiButtons = useShowAiButtons()
  const [eqOpen, setEqOpen] = useState(false)
  const [eqQuery, setEqQuery] = useState('')
  const [calFormOpen, setCalFormOpen] = useState(false)
  const [aiFillingField, setAiFillingField] = useState<BreakdownAiFieldKey | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const formRef = useRef(form)
  formRef.current = form

  const handleAiFill = async (targetKey: BreakdownAiFieldKey) => {
    if (aiFillingField != null) return
    setAiFillingField(targetKey)
    setAiError(null)
    try {
      const value = await aiFillBreakdownField({
        targetKey,
        form: formRef.current,
      })
      onChange({ ...formRef.current, [targetKey]: value })
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI fill failed.')
    } finally {
      setAiFillingField(null)
    }
  }

  const renderAiFillButton = (targetKey: BreakdownAiFieldKey, label: string) => {
    if (!showAiButtons) return null
    const aiBusy = aiFillingField === targetKey
    const anyAiBusy = aiFillingField != null
    return (
      <Button
        type="button"
        size="sm"
        className={cn(limsPrimaryBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
        disabled={anyAiBusy}
        onClick={() => void handleAiFill(targetKey)}
        aria-label={`AI fill ${label}`}
        title="AI fills this field only (reads other form fields)"
      >
        {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {aiBusy ? 'AI…' : 'AI Fill'}
      </Button>
    )
  }

  const selectedEqLabel = form.equipmentId
    ? `${form.equipmentName} (${form.assetCode})`
    : form.equipmentName
      ? `${form.equipmentName}${form.assetCode ? ` (${form.assetCode})` : ''}`
      : ''

  const equipmentComboboxOptions = useMemo<FilterComboboxOption[]>(() => {
    const q = (eqOpen ? eqQuery : selectedEqLabel).trim().toLowerCase()
    return equipmentOptions
      .filter((e) => matchesSourceFilter(e.source, form.equipmentSourceFilter))
      .filter((e) => {
        if (!q) return true
        return `${e.equipment_name} ${e.asset_code} ${e.manufacturer} ${e.serial_number}`
          .toLowerCase()
          .includes(q)
      })
      .slice(0, 40)
      .map((e) => ({
        id: `${e.source}:${e.id}`,
        label: `${e.equipment_name} (${e.asset_code})`,
        secondaryLabel:
          e.source === 'testing_iqc'
            ? 'Testing IQC'
            : e.source === 'calibration_iqc'
              ? 'Calibration IQC'
              : e.current_location || e.equipment_status || undefined,
      }))
  }, [equipmentOptions, form.equipmentSourceFilter, eqOpen, eqQuery, selectedEqLabel])

  const pickEquipment = (compositeId: string) => {
    const sep = compositeId.indexOf(':')
    const source = (sep > 0 ? compositeId.slice(0, sep) : form.equipmentSource) as EquipmentSource
    const id = sep > 0 ? compositeId.slice(sep + 1) : compositeId
    const eq = equipmentOptions.find((e) => e.id === id && e.source === source)
    if (!eq) return
    onChange({
      ...form,
      equipmentSource: eq.source,
      equipmentId: eq.id,
      assetCode: eq.asset_code,
      equipmentName: eq.equipment_name,
      manufacturer: eq.manufacturer,
      modelNumber: eq.model_number,
      serialNumber: eq.serial_number,
      currentLocation: eq.current_location,
    })
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="ebr-reg-no">Breakdown ID</Label>
          <Input id="ebr-reg-no" value={form.registerNo} readOnly className="bg-stone-100 font-mono" />
        </div>
        <div className="space-y-2">
          <Label>Equipment Source</Label>
          <Select
            value={form.equipmentSourceFilter}
            onValueChange={(v) =>
              onChange({
                ...form,
                equipmentSourceFilter: v as EquipmentSourceFilter,
                equipmentSource:
                  v === 'iqc' ? 'testing_iqc' : (v as EquipmentSource),
                equipmentId: '',
                assetCode: '',
                equipmentName: '',
                manufacturer: '',
                modelNumber: '',
                serialNumber: '',
                currentLocation: '',
              })
            }
          >
            <SelectTrigger aria-label="Equipment source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="testing">Testing Equipment Master</SelectItem>
              <SelectItem value="calibration">Calibration Master Equipment</SelectItem>
              <SelectItem value="iqc">Equipments for IQC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Equipment Name</Label>
          <FilterCombobox
            listId="ebr-equipment-search"
            value={eqOpen ? eqQuery : selectedEqLabel}
            onValueChange={(v) => {
              setEqQuery(v)
              if (!eqOpen) setEqOpen(true)
              if (!v.trim()) {
                onChange({
                  ...form,
                  equipmentId: '',
                  assetCode: '',
                  equipmentName: '',
                  manufacturer: '',
                  modelNumber: '',
                  serialNumber: '',
                  currentLocation: '',
                })
              }
            }}
            options={equipmentComboboxOptions}
            onSelectOption={(opt) => {
              pickEquipment(opt.id)
              setEqQuery(opt.label)
              setEqOpen(false)
            }}
            open={eqOpen}
            onOpenChange={(next) => {
              setEqOpen(next)
              if (next) setEqQuery(selectedEqLabel)
            }}
            placeholder="Type to search asset code or equipment name…"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="ebr-start">Breakdown Start Date & Time *</Label>
          <Input
            id="ebr-start"
            type="datetime-local"
            value={
              form.breakdownDate
                ? `${form.breakdownDate}T${form.breakdownTime || '00:00'}`
                : ''
            }
            onChange={(e) => {
              const raw = e.target.value
              if (!raw) {
                onChange({ ...form, breakdownDate: '', breakdownTime: '' })
                return
              }
              const [datePart, timePart = ''] = raw.split('T')
              onChange({
                ...form,
                breakdownDate: datePart ?? '',
                breakdownTime: timePart.slice(0, 5),
              })
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Reported By</Label>
          <EmployeePicker
            employees={employees}
            employeeId={form.reportedByEmployeeId}
            displayName={form.reportedByName}
            listId="ebr-reporter-search"
            placeholder="Type to search employee…"
            onPick={(id, name) =>
              onChange({ ...form, reportedByEmployeeId: id, reportedByName: name })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => onChange({ ...form, status: v as BreakdownStatus })}
          >
            <SelectTrigger aria-label="Breakdown status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BREAKDOWN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Authorized By (Return to Service)</Label>
          <EmployeePicker
            employees={employees}
            employeeId={form.authorizedByEmployeeId}
            displayName={form.authorizedByName}
            listId="ebr-authorizer-search"
            placeholder="Type to search employee…"
            onPick={(id, name) =>
              onChange({ ...form, authorizedByEmployeeId: id, authorizedByName: name })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-nature">Nature of Breakdown *</Label>
            {renderAiFillButton('natureOfBreakdown', 'Nature of Breakdown')}
          </div>
          <Textarea
            id="ebr-nature"
            value={form.natureOfBreakdown}
            onChange={(e) => onChange({ ...form, natureOfBreakdown: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-symptoms">Symptoms / Observation</Label>
            {renderAiFillButton('symptoms', 'Symptoms / Observation')}
          </div>
          <Textarea
            id="ebr-symptoms"
            value={form.symptoms}
            onChange={(e) => onChange({ ...form, symptoms: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-impact">Impact on Work</Label>
            {renderAiFillButton('impactOnWork', 'Impact on Work')}
          </div>
          <Textarea
            id="ebr-impact"
            value={form.impactOnWork}
            onChange={(e) => onChange({ ...form, impactOnWork: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-immediate">Immediate Action Taken</Label>
            {renderAiFillButton('immediateAction', 'Immediate Action Taken')}
          </div>
          <Textarea
            id="ebr-immediate"
            value={form.immediateAction}
            onChange={(e) => onChange({ ...form, immediateAction: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-repair">Repair Action / Work Done</Label>
            {renderAiFillButton('repairAction', 'Repair Action / Work Done')}
          </div>
          <Textarea
            id="ebr-repair"
            value={form.repairAction}
            onChange={(e) => onChange({ ...form, repairAction: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ebr-verify">Verification Notes</Label>
            {renderAiFillButton('verificationNotes', 'Verification Notes')}
          </div>
          <Textarea
            id="ebr-verify"
            value={form.verificationNotes}
            onChange={(e) => onChange({ ...form, verificationNotes: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      {aiError ? <p className="text-sm text-rose-700">{aiError}</p> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="ebr-repaired-by">Repaired By</Label>
          <Input
            id="ebr-repaired-by"
            value={form.repairedBy}
            onChange={(e) => onChange({ ...form, repairedBy: e.target.value })}
            placeholder="Internal employee / external agency"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ebr-spares">Spare Parts Used</Label>
          <Input
            id="ebr-spares"
            value={form.sparePartsUsed}
            onChange={(e) => onChange({ ...form, sparePartsUsed: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ebr-cost">Repair Cost</Label>
          <Input
            id="ebr-cost"
            inputMode="decimal"
            value={form.repairCost}
            onChange={(e) => onChange({ ...form, repairCost: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ebr-rts">Return to Service Date & Time</Label>
          <Input
            id="ebr-rts"
            type="datetime-local"
            value={form.returnToServiceDate}
            onChange={(e) => onChange({ ...form, returnToServiceDate: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Post-repair Calibration</Label>
          <Select
            value={form.postRepairCheckRequired ? 'required' : 'not_required'}
            onValueChange={(v) => {
              const required = v === 'required'
              onChange({
                ...form,
                postRepairCheckRequired: required,
                postRepairCheckDone: required ? form.postRepairCheckDone : false,
              })
              if (!required) setCalFormOpen(false)
            }}
          >
            <SelectTrigger aria-label="Post-repair calibration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Calibration Required</SelectItem>
              <SelectItem value="not_required">Calibration Not Required</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.postRepairCheckRequired ? (
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('h-8 w-full gap-1.5 px-3', limsOutlineBtnClass)}
              disabled={!form.equipmentId}
              title={
                form.equipmentId
                  ? 'Open Calibration Form to update equipment calibration'
                  : 'Select equipment first'
              }
              aria-label="Open Calibration Form"
              onClick={() => setCalFormOpen(true)}
            >
              <ClipboardCheck size={14} />
              Calibration Form
              {form.postRepairCheckDone ? ' ✓' : ''}
            </Button>
          </div>
        ) : null}
      </div>

      <PostRepairCalibrationDialog
        open={calFormOpen}
        onOpenChange={setCalFormOpen}
        equipmentSource={form.equipmentSource}
        equipmentId={form.equipmentId}
        equipmentLabel={selectedEqLabel}
        onSaved={() => onChange({ ...formRef.current, postRepairCheckDone: true })}
      />

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
          disabled={!canSave}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
