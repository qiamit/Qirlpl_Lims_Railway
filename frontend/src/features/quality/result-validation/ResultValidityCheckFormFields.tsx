import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getCheckTypeMeta, RESULT_VALIDITY_CHECK_TYPES } from './checkTypes'
import { ResultValidationSearchSelect, ResultValidationYesNoSelect } from './ResultValidationSearchSelect'
import { RetestTestParameterPickerDialog } from './RetestTestParameterPickerDialog'
import { RetestSelectedParametersTable } from './RetestSelectedParametersTable'
import { fetchRetestParametersByAllocationIds } from './fetchSampleTestParametersForRetest'
import { fetchRetestSectionOptions, type RetestSectionOption } from './fetchRetestSectionOptions'
import {
  mergeRetestParameterEntries,
  parseRetestParameters,
  retestOptionToEntry,
  retestParameterLabels,
  retestParametersToCheckData,
  retestStatusFromResult,
} from './retestParameters'
import type { RetestSampleTestParameterOption } from './fetchSampleTestParametersForRetest'
import type {
  EquipmentOption,
  IqcOption,
  ResultValidityCheckForm,
  ResultValidityCheckType,
  RetestParameterEntry,
  SampleOption,
  UserOption,
} from './types'

function Field({
  label,
  children,
  hint,
  compact = false,
}: {
  label: string
  children: ReactNode
  hint?: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'min-w-0 space-y-1' : 'space-y-1.5'}>
      <Label
        className={
          compact
            ? 'block text-[10px] leading-tight font-medium text-muted-foreground'
            : 'text-xs'
        }
      >
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </Field>
  )
}

function setData(
  form: ResultValidityCheckForm,
  onChange: (next: ResultValidityCheckForm) => void,
  key: string,
  value: string,
) {
  onChange({ ...form, checkData: { ...form.checkData, [key]: value } })
}

function dataStr(form: ResultValidityCheckForm, key: string): string {
  const v = form.checkData[key]
  return v == null ? '' : String(v)
}

function syncRetestParameters(
  form: ResultValidityCheckForm,
  onChange: (next: ResultValidityCheckForm) => void,
  entries: RetestParameterEntry[],
) {
  const labels = retestParameterLabels(entries)
  onChange({
    ...form,
    testParameterName: labels.join(', '),
    checkData: retestParametersToCheckData(form.checkData, entries),
  })
}

export function ResultValidityCheckFormFields({
  form,
  onChange,
  users,
  equipment,
  iqcMasters,
  samples,
  isNewRecord = false,
  fixedCheckType,
  onCheckTypeChange,
}: {
  form: ResultValidityCheckForm
  onChange: (next: ResultValidityCheckForm) => void
  users: UserOption[]
  equipment: EquipmentOption[]
  iqcMasters: IqcOption[]
  samples: SampleOption[]
  isNewRecord?: boolean
  fixedCheckType?: ResultValidityCheckType
  onCheckTypeChange?: (type: ResultValidityCheckType) => void
}) {
  const meta = getCheckTypeMeta(form.checkType)
  const [retestPickerOpen, setRetestPickerOpen] = useState(false)
  const [sectionOptions, setSectionOptions] = useState<RetestSectionOption[]>([])
  const enrichAttemptRef = useRef('')

  const isRetestCheck = form.checkType === '7_7_g'
  const selectedSectionCode = dataStr(form, 'section_code')
  const selectedTestAllocationId = dataStr(form, 'test_allocation_id')

  const retestParameters = useMemo(() => parseRetestParameters(form.checkData), [form.checkData])
  const retestParameterAddedIds = useMemo(
    () => new Set(retestParameters.map((row) => row.id)),
    [retestParameters],
  )

  const update = (patch: Partial<ResultValidityCheckForm>) => onChange({ ...form, ...patch })

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])

  const applyPerformedBy = (id: string) => {
    const user = userById.get(id)
    update({
      performedBy: id,
      performedByDepartment: user?.departmentName ?? '',
      performedByDesignation: user?.designation ?? '',
    })
  }

  const applyReviewedBy = (id: string) => {
    const user = userById.get(id)
    update({
      reviewedBy: id,
      reviewedByDepartment: user?.departmentName ?? '',
      reviewedByDesignation: user?.designation ?? '',
    })
  }

  const userSelectLabel = (user: UserOption) => {
    const parts = [user.fullName]
    if (user.departmentName) parts.push(user.departmentName)
    if (user.designation) parts.push(user.designation)
    return parts.join(' · ')
  }

  const clearRetestSectionData = (checkData: ResultValidityCheckForm['checkData']) => ({
    ...checkData,
    section_code: '',
    test_allocation_id: '',
    sample_allocation_id: '',
    retest_parameters: [],
    retest_parameter_ids: [],
    retest_parameter_labels: [],
    retained_quantity: '',
  })

  const applySampleSelection = (id: string) => {
    const sample = samples.find((s) => s.id === id)
    onChange({
      ...form,
      sampleId: id,
      srfNumber: sample?.srfNumber ?? '',
      testParameterName: '',
      performedBy: '',
      performedByDepartment: '',
      performedByDesignation: '',
      reviewedBy: '',
      reviewedByDepartment: '',
      reviewedByDesignation: '',
      checkData: clearRetestSectionData(form.checkData),
    })
  }

  const applySectionSelection = (sectionCode: string) => {
    const section = sectionOptions.find((option) => option.sectionCode === sectionCode)
    if (!section) return

    const performer = section.assignedEmployeeId ? userById.get(section.assignedEmployeeId) : undefined

    onChange({
      ...form,
      performedBy: section.assignedEmployeeId ?? '',
      performedByDepartment: section.department || performer?.departmentName || '',
      performedByDesignation: section.designation || performer?.designation || '',
      reviewedBy: section.resultsReviewerId ?? '',
      reviewedByDepartment: section.reviewerDepartment,
      reviewedByDesignation: section.reviewerDesignation,
      testParameterName: '',
      checkData: {
        ...clearRetestSectionData(form.checkData),
        section_code: section.sectionCode,
        test_allocation_id: section.testAllocationId,
        sample_allocation_id: section.sampleAllocationId,
        retained_quantity: section.quantity,
      },
    })
  }

  useEffect(() => {
    if (!isRetestCheck || !form.sampleId.trim()) {
      setSectionOptions([])
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const options = await fetchRetestSectionOptions(form.sampleId)
        if (!cancelled) setSectionOptions(options)
      } catch {
        if (!cancelled) setSectionOptions([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [form.sampleId, isRetestCheck])

  useEffect(() => {
    if (!isRetestCheck || !selectedSectionCode.trim() || sectionOptions.length === 0) return

    const section = sectionOptions.find((option) => option.sectionCode === selectedSectionCode)
    if (!section) return

    const patch: Partial<ResultValidityCheckForm> = {}

    if (!form.reviewedBy.trim() && section.resultsReviewerId) {
      patch.reviewedBy = section.resultsReviewerId
    }
    if (!form.reviewedByDepartment.trim() && section.reviewerDepartment) {
      patch.reviewedByDepartment = section.reviewerDepartment
    }
    if (!form.reviewedByDesignation.trim() && section.reviewerDesignation) {
      patch.reviewedByDesignation = section.reviewerDesignation
    }
    if (!form.performedBy.trim() && section.assignedEmployeeId) {
      patch.performedBy = section.assignedEmployeeId
    }
    if (!form.performedByDepartment.trim() && section.department) {
      patch.performedByDepartment = section.department
    }
    if (!form.performedByDesignation.trim() && section.designation) {
      patch.performedByDesignation = section.designation
    }

    if (Object.keys(patch).length === 0) return
    update(patch)
  }, [
    form.performedBy,
    form.performedByDepartment,
    form.performedByDesignation,
    form.reviewedBy,
    form.reviewedByDepartment,
    form.reviewedByDesignation,
    isRetestCheck,
    sectionOptions,
    selectedSectionCode,
  ])

  useEffect(() => {
    enrichAttemptRef.current = ''
  }, [form.sampleId, selectedSectionCode])

  useEffect(() => {
    if (form.checkType !== '7_7_g' || !form.sampleId.trim() || retestParameters.length === 0) {
      return
    }

    const needsEnrich = retestParameters.some(
      (row) =>
        !row.testMethod.trim() ||
        !row.unit.trim() ||
        !row.oldResult.trim() ||
        !row.uncertainty.trim(),
    )
    if (!needsEnrich) return

    const attemptKey = `${form.sampleId}:${retestParameters.map((r) => r.id).join(',')}`
    if (enrichAttemptRef.current === attemptKey) return
    enrichAttemptRef.current = attemptKey

    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchRetestParametersByAllocationIds(
          retestParameters.map((r) => r.id),
          form.sampleId,
          selectedTestAllocationId,
        )
        if (cancelled || fetched.length === 0) return
        syncRetestParameters(form, onChange, mergeRetestParameterEntries(retestParameters, fetched))
      } catch {
        // Keep editable rows even if enrichment fails.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [form, form.checkType, form.sampleId, onChange, retestParameters, selectedTestAllocationId])

  const addRetestParameters = (selected: RetestSampleTestParameterOption[]) => {
    const byId = new Map(retestParameters.map((row) => [row.id, row]))
    for (const item of selected) {
      if (byId.has(item.id)) continue
      byId.set(item.id, retestOptionToEntry(item))
    }
    syncRetestParameters(form, onChange, [...byId.values()])
  }

  const updateRetestParameters = (entries: RetestParameterEntry[]) => {
    syncRetestParameters(form, onChange, entries)
  }

  const removeRetestParameter = (id: string) => {
    syncRetestParameters(
      form,
      onChange,
      retestParameters.filter((row) => row.id !== id),
    )
  }

  const updateAcceptanceCriteria = (value: string) => {
    const criteria = value.trim()
    const nextRows =
      criteria.length === 0
        ? retestParameters
        : retestParameters.map((row) => ({
            ...row,
            status: row.newResult.trim()
              ? retestStatusFromResult(row.newResult, criteria)
              : row.status,
          }))

    onChange({
      ...form,
      predefinedCriteria: value,
      checkData: retestParametersToCheckData(form.checkData, nextRows),
    })
  }

  return (
    <div className="space-y-5">
      {isRetestCheck ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 items-end">
          <Field label="Check Date">
            <Input type="date" value={form.checkDate} onChange={(e) => update({ checkDate: e.target.value })} />
          </Field>
          <Field label="Linked SRF / Sample">
            <ResultValidationSearchSelect
              value={form.sampleId}
              onValueChange={applySampleSelection}
              options={samples.map((s) => ({ id: s.id, label: s.srfNumber }))}
              placeholder="Type SRF number…"
              listId="rvc-sample"
            />
          </Field>
          <Field label="Section Code">
            <ResultValidationSearchSelect
              value={selectedSectionCode}
              onValueChange={applySectionSelection}
              options={sectionOptions.map((section) => ({
                id: section.sectionCode,
                label: section.sectionCode,
              }))}
              placeholder={form.sampleId.trim() ? 'Type section code…' : 'Select SRF first'}
              listId="rvc-section-code"
              disabled={!form.sampleId.trim()}
            />
          </Field>
          <TextField
            label="Acceptance Criteria"
            value={form.predefinedCriteria}
            onChange={updateAcceptanceCriteria}
            placeholder="Limits / acceptance criteria"
          />
          <Field label="Test Parameters">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full gap-1.5"
              disabled={!form.sampleId.trim() || !selectedSectionCode.trim()}
              onClick={() => setRetestPickerOpen(true)}
            >
              <Plus size={14} />
              Add Test Parameter
            </Button>
          </Field>
          <TextField
            label="Retained Quantity"
            value={dataStr(form, 'retained_quantity')}
            onChange={(v) => setData(form, onChange, 'retained_quantity', v)}
          />
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {!fixedCheckType ? (
            <Field label="Check Type">
              {isNewRecord ? (
                <ResultValidationSearchSelect
                  value={form.checkType}
                  onValueChange={(id) => onCheckTypeChange?.(id as ResultValidityCheckType)}
                  options={RESULT_VALIDITY_CHECK_TYPES.map((t) => ({ id: t.id, label: t.label }))}
                  placeholder="Type check type…"
                  listId="rvc-check-type"
                  allowEmpty={false}
                />
              ) : (
                <Input value={meta.label} readOnly disabled className="bg-muted/40" />
              )}
            </Field>
          ) : null}
          <Field label="Check Date">
            <Input type="date" value={form.checkDate} onChange={(e) => update({ checkDate: e.target.value })} />
          </Field>
          <Field label="Performed By">
            <ResultValidationSearchSelect
              value={form.performedBy}
              onValueChange={applyPerformedBy}
              options={users.map((u) => ({ id: u.id, label: userSelectLabel(u) }))}
              placeholder="Type user name…"
              listId="rvc-performed-by"
            />
          </Field>
          <Field label="Reviewed By">
            <ResultValidationSearchSelect
              value={form.reviewedBy}
              onValueChange={applyReviewedBy}
              options={users.map((u) => ({ id: u.id, label: userSelectLabel(u) }))}
              placeholder="Type reviewer name…"
              listId="rvc-reviewed-by"
            />
          </Field>
        </div>
      )}

      {isRetestCheck ? (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 items-end">
          <Field label="Dept. (Performed)" compact>
            <Input value={form.performedByDepartment} readOnly disabled className="bg-muted/40 h-9" />
          </Field>
          <Field label="Desig. (Performed)" compact>
            <Input value={form.performedByDesignation} readOnly disabled className="bg-muted/40 h-9" />
          </Field>
          <Field label="Performed By" compact>
            <ResultValidationSearchSelect
              value={form.performedBy}
              onValueChange={applyPerformedBy}
              options={users.map((u) => ({ id: u.id, label: userSelectLabel(u) }))}
              placeholder="User…"
              listId="rvc-performed-by"
            />
          </Field>
          <Field label="Dept. (Reviewed)" compact>
            <Input value={form.reviewedByDepartment} readOnly disabled className="bg-muted/40 h-9" />
          </Field>
          <Field label="Desig. (Reviewed)" compact>
            <Input value={form.reviewedByDesignation} readOnly disabled className="bg-muted/40 h-9" />
          </Field>
          <Field label="Reviewed By" compact>
            <ResultValidationSearchSelect
              value={form.reviewedBy}
              onValueChange={applyReviewedBy}
              options={users.map((u) => ({ id: u.id, label: userSelectLabel(u) }))}
              placeholder="Reviewer…"
              listId="rvc-reviewed-by"
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Department (Performed By)">
            <Input value={form.performedByDepartment} readOnly disabled className="bg-muted/40" />
          </Field>
          <Field label="Designation (Performed By)">
            <Input value={form.performedByDesignation} readOnly disabled className="bg-muted/40" />
          </Field>
          <Field label="Department (Reviewed By)">
            <Input value={form.reviewedByDepartment} readOnly disabled className="bg-muted/40" />
          </Field>
          <Field label="Designation (Reviewed By)">
            <Input value={form.reviewedByDesignation} readOnly disabled className="bg-muted/40" />
          </Field>
        </div>
      )}

      {meta.usesSample && form.checkType === '7_7_g' && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <RetestSelectedParametersTable
            rows={retestParameters}
            acceptanceCriteria={form.predefinedCriteria}
            onChange={updateRetestParameters}
            onRemove={removeRetestParameter}
          />
          <RetestTestParameterPickerDialog
            open={retestPickerOpen}
            onOpenChange={setRetestPickerOpen}
            sampleId={form.sampleId}
            srfNumber={form.srfNumber}
            testAllocationId={selectedTestAllocationId}
            alreadyAddedIds={retestParameterAddedIds}
            onConfirm={addRetestParameters}
          />
        </div>
      )}
      {meta.usesSample && form.checkType !== '7_7_g' && (
        <div className="border-t border-border/60 pt-4">
          <Field label="Linked SRF / Sample">
            <ResultValidationSearchSelect
              value={form.sampleId}
              onValueChange={(id) => {
                const sample = samples.find((s) => s.id === id)
                update({ sampleId: id, srfNumber: sample?.srfNumber ?? '' })
              }}
              options={samples.map((s) => ({ id: s.id, label: s.srfNumber }))}
              placeholder="Type SRF number…"
              listId="rvc-sample"
            />
          </Field>
        </div>
      )}
      {(meta.usesEquipment || meta.usesTestParameter) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 border-t border-border/60 pt-4">
          {meta.usesTestParameter && (
            <TextField label="Test Parameter" value={form.testParameterName} onChange={(v) => update({ testParameterName: v })} />
          )}
          {meta.usesEquipment && (
            <Field label="Equipment">
              <ResultValidationSearchSelect
                value={form.equipmentId}
                onValueChange={(id) => {
                  const eq = equipment.find((e) => e.id === id)
                  update({ equipmentId: id, equipmentLabel: eq?.label ?? '' })
                }}
                options={equipment.map((e) => ({ id: e.id, label: e.label }))}
                placeholder="Type equipment…"
                listId="rvc-equipment"
              />
            </Field>
          )}
        </div>
      )}
      {meta.usesIqc && (
        <div className="grid gap-4 sm:grid-cols-2 border-t border-border/60 pt-4">
          <Field label="IQC / Reference Material">
            <ResultValidationSearchSelect
              value={form.iqcMasterId}
              onValueChange={(id) => {
                const iqc = iqcMasters.find((i) => i.id === id)
                update({ iqcMasterId: id, iqcLabel: iqc?.label ?? '' })
              }}
              options={iqcMasters.map((i) => ({ id: i.id, label: i.label }))}
              placeholder="Type IQC master…"
              listId="rvc-iqc"
            />
          </Field>
        </div>
      )}

      {form.checkType !== '7_7_g' && (
      <div className="border-t border-border/60 pt-4 space-y-4">
        <p className="text-xs font-semibold text-foreground">Check-specific readings & observations</p>
        {form.checkType === '7_7_a' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="QC Material / Batch" value={dataStr(form, 'material_batch')} onChange={(v) => setData(form, onChange, 'material_batch', v)} />
            <TextField label="Expected Value" value={dataStr(form, 'expected_value')} onChange={(v) => setData(form, onChange, 'expected_value', v)} />
            <TextField label="Observed Value" value={dataStr(form, 'observed_value')} onChange={(v) => setData(form, onChange, 'observed_value', v)} />
            <TextField label="Recovery / Deviation (%)" value={dataStr(form, 'deviation_pct')} onChange={(v) => setData(form, onChange, 'deviation_pct', v)} />
          </div>
        )}
        {form.checkType === '7_7_b' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary Instrument">
              <ResultValidationSearchSelect
                value={dataStr(form, 'primary_equipment_id')}
                onValueChange={(id) => setData(form, onChange, 'primary_equipment_id', id)}
                options={equipment.map((e) => ({ id: e.id, label: e.label }))}
                placeholder="Type equipment…"
                listId="rvc-primary-equipment"
              />
            </Field>
            <Field label="Alternate Instrument">
              <ResultValidationSearchSelect
                value={dataStr(form, 'alternate_equipment_id')}
                onValueChange={(id) => setData(form, onChange, 'alternate_equipment_id', id)}
                options={equipment.map((e) => ({ id: e.id, label: e.label }))}
                placeholder="Type equipment…"
                listId="rvc-alternate-equipment"
              />
            </Field>
            <TextField label="Result — Primary" value={dataStr(form, 'result_primary')} onChange={(v) => setData(form, onChange, 'result_primary', v)} />
            <TextField label="Result — Alternate" value={dataStr(form, 'result_alternate')} onChange={(v) => setData(form, onChange, 'result_alternate', v)} />
            <TextField label="Difference / % Deviation" value={dataStr(form, 'difference')} onChange={(v) => setData(form, onChange, 'difference', v)} />
          </div>
        )}
        {form.checkType === '7_7_c' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Functional Check Points" value={dataStr(form, 'check_points')} onChange={(v) => setData(form, onChange, 'check_points', v)} placeholder="e.g. Zero check, span check, leak test" />
            <TextField label="Observed Readings" value={dataStr(form, 'observed_readings')} onChange={(v) => setData(form, onChange, 'observed_readings', v)} />
            <Field label="All Points Satisfactory?">
              <ResultValidationYesNoSelect
                value={dataStr(form, 'all_passed')}
                onValueChange={(v) => setData(form, onChange, 'all_passed', v)}
                listId="rvc-all-passed"
              />
            </Field>
          </div>
        )}
        {form.checkType === '7_7_d' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Working Standard ID" value={dataStr(form, 'working_standard')} onChange={(v) => setData(form, onChange, 'working_standard', v)} />
            <TextField label="Control Chart Reference" value={dataStr(form, 'control_chart_ref')} onChange={(v) => setData(form, onChange, 'control_chart_ref', v)} />
            <TextField label="Reading / Point Value" value={dataStr(form, 'reading')} onChange={(v) => setData(form, onChange, 'reading', v)} />
            <TextField label="UCL / LCL" value={dataStr(form, 'control_limits')} onChange={(v) => setData(form, onChange, 'control_limits', v)} placeholder="e.g. UCL 1.02 / LCL 0.98" />
            <Field label="In Statistical Control?">
              <ResultValidationYesNoSelect
                value={dataStr(form, 'in_control')}
                onValueChange={(v) => setData(form, onChange, 'in_control', v)}
                listId="rvc-in-control"
              />
            </Field>
          </div>
        )}
        {form.checkType === '7_7_e' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Check Method / Procedure" value={dataStr(form, 'check_method')} onChange={(v) => setData(form, onChange, 'check_method', v)} />
            <TextField label="Reference Value" value={dataStr(form, 'reference_value')} onChange={(v) => setData(form, onChange, 'reference_value', v)} />
            <TextField label="Observed Value" value={dataStr(form, 'observed_value')} onChange={(v) => setData(form, onChange, 'observed_value', v)} />
            <TextField label="Next Intermediate Check Due" value={dataStr(form, 'next_due')} onChange={(v) => setData(form, onChange, 'next_due', v)} placeholder="YYYY-MM-DD" />
          </div>
        )}
        {form.checkType === '7_7_f' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Number of Replicates" value={dataStr(form, 'replicate_count')} onChange={(v) => setData(form, onChange, 'replicate_count', v)} />
            <TextField label="Replicate Values" value={dataStr(form, 'replicate_values')} onChange={(v) => setData(form, onChange, 'replicate_values', v)} placeholder="Comma-separated readings" />
            <TextField label="Mean" value={dataStr(form, 'mean_value')} onChange={(v) => setData(form, onChange, 'mean_value', v)} />
            <TextField label="RSD / SD (%)" value={dataStr(form, 'rsd_pct')} onChange={(v) => setData(form, onChange, 'rsd_pct', v)} />
            <TextField label="Method Used" value={dataStr(form, 'method_used')} onChange={(v) => setData(form, onChange, 'method_used', v)} />
          </div>
        )}
        {form.checkType === '7_7_h' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Characteristics Compared" value={dataStr(form, 'characteristics')} onChange={(v) => setData(form, onChange, 'characteristics', v)} placeholder="e.g. Compressive strength vs density" />
            <TextField label="Result Set A" value={dataStr(form, 'result_set_a')} onChange={(v) => setData(form, onChange, 'result_set_a', v)} />
            <TextField label="Result Set B" value={dataStr(form, 'result_set_b')} onChange={(v) => setData(form, onChange, 'result_set_b', v)} />
            <Field label="Correlation Acceptable?">
              <ResultValidationYesNoSelect
                value={dataStr(form, 'correlation_ok')}
                onValueChange={(v) => setData(form, onChange, 'correlation_ok', v)}
                listId="rvc-correlation-ok"
              />
            </Field>
          </div>
        )}
        {form.checkType === '7_7_i' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Report Number" value={dataStr(form, 'report_number')} onChange={(v) => setData(form, onChange, 'report_number', v)} />
            <TextField label="Review Date" value={dataStr(form, 'review_date')} onChange={(v) => setData(form, onChange, 'review_date', v)} placeholder="YYYY-MM-DD" />
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Review Findings</Label>
              <Textarea value={dataStr(form, 'review_findings')} onChange={(e) => setData(form, onChange, 'review_findings', e.target.value)} rows={3} />
            </div>
          </div>
        )}
        {form.checkType === '7_7_j' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Comparison Type" value={dataStr(form, 'comparison_type')} onChange={(v) => setData(form, onChange, 'comparison_type', v)} placeholder="Personnel / Method / Equipment" />
            <TextField label="Participant A" value={dataStr(form, 'participant_a')} onChange={(v) => setData(form, onChange, 'participant_a', v)} />
            <TextField label="Participant B" value={dataStr(form, 'participant_b')} onChange={(v) => setData(form, onChange, 'participant_b', v)} />
            <TextField label="Result A" value={dataStr(form, 'result_a')} onChange={(v) => setData(form, onChange, 'result_a', v)} />
            <TextField label="Result B" value={dataStr(form, 'result_b')} onChange={(v) => setData(form, onChange, 'result_b', v)} />
            <TextField label="Z-Score / En Number" value={dataStr(form, 'z_score')} onChange={(v) => setData(form, onChange, 'z_score', v)} />
          </div>
        )}
        {form.checkType === '7_7_k' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Blind Sample ID" value={dataStr(form, 'blind_sample_id')} onChange={(v) => setData(form, onChange, 'blind_sample_id', v)} />
            <TextField label="Assigned Analyst" value={dataStr(form, 'assigned_analyst')} onChange={(v) => setData(form, onChange, 'assigned_analyst', v)} />
            <TextField label="Reported Result" value={dataStr(form, 'reported_result')} onChange={(v) => setData(form, onChange, 'reported_result', v)} />
            <TextField label="Revealed Expected Value" value={dataStr(form, 'revealed_expected')} onChange={(v) => setData(form, onChange, 'revealed_expected', v)} />
          </div>
        )}
      </div>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 border-t border-border/60 pt-4">
        <Field label="Conclusion">
          <Textarea value={form.conclusion} onChange={(e) => update({ conclusion: e.target.value })} rows={2} placeholder="Overall conclusion of this validity check" />
        </Field>
        <Field label="Action Taken (required if unsatisfactory — Clause 7.7.3)" hint="Document corrective action when results are outside predefined criteria.">
          <Textarea value={form.actionTaken} onChange={(e) => update({ actionTaken: e.target.value })} rows={2} />
        </Field>
        <Field label="Remarks">
          <Textarea value={form.remarks} onChange={(e) => update({ remarks: e.target.value })} rows={2} />
        </Field>
      </div>
    </div>
  )
}
