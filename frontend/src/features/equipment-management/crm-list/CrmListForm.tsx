import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { AddClientDialog } from '@/features/sample-handling/receiving/AddClientDialog'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { CrmUncertaintyDialog } from './CrmUncertaintyDialog'
import { type CrmForm } from './types'

export function CrmListForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
}: {
  form: CrmForm
  onChange: (next: CrmForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [makeOpen, setMakeOpen] = useState(false)
  const [makeQuery, setMakeQuery] = useState(form.make)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addClientInitialName, setAddClientInitialName] = useState('')
  const handleAddClientOpenChange = useFormDialogOpenChange(setAddClientOpen)
  const [uncertaintyOpen, setUncertaintyOpen] = useState(false)
  const handleUncertaintyOpenChange = useFormDialogOpenChange(setUncertaintyOpen)

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name')
      .order('company_name')
    if (error) return
    setClientOptions(
      (data ?? [])
        .map((r) => ({
          id: r.id,
          label: String(r.company_name ?? '').trim(),
        }))
        .filter((o) => o.label.length > 0),
    )
  }, [])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  useEffect(() => {
    if (!makeOpen) setMakeQuery(form.make)
  }, [form.make, makeOpen])

  const filteredClients = useMemo(() => {
    const q = makeQuery.trim().toLowerCase()
    if (!q || !makeOpen) return clientOptions
    if (clientOptions.some((o) => o.label.trim().toLowerCase() === q)) return clientOptions
    return clientOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [clientOptions, makeQuery, makeOpen])

  const selectedMakeLabel = useMemo(() => {
    const exact = clientOptions.find(
      (o) => o.label.trim().toLowerCase() === form.make.trim().toLowerCase(),
    )
    return exact?.label ?? form.make
  }, [clientOptions, form.make])

  const openAddClient = () => {
    setAddClientInitialName(makeQuery.trim() || form.make.trim())
    setMakeOpen(false)
    setAddClientOpen(true)
  }

  const handleClientSaved = async (id: string) => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('company_name')
        .eq('id', id)
        .maybeSingle()
      const name = String(
        (data as { company_name?: string | null } | null)?.company_name ?? '',
      ).trim()
      if (name) {
        onChange({ ...form, make: name })
        setMakeQuery(name)
      }
    } finally {
      await loadClients()
    }
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="crm-id-no">ID No</Label>
          <Input
            id="crm-id-no"
            value={form.idNo}
            onChange={(e) => onChange({ ...form, idNo: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-date-of-purchase">Date of Purchase</Label>
          <Input
            id="crm-date-of-purchase"
            type="date"
            value={form.dateOfPurchase}
            onChange={(e) => onChange({ ...form, dateOfPurchase: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-trace-from">Traceability From</Label>
          <Input
            id="crm-trace-from"
            type="date"
            value={form.traceabilityFrom}
            onChange={(e) => onChange({ ...form, traceabilityFrom: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-valid-upto">Valid Up To</Label>
          <Input
            id="crm-valid-upto"
            type="date"
            value={form.validUpto}
            onChange={(e) => onChange({ ...form, validUpto: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="crm-type">CRM Type</Label>
          <Input
            id="crm-type"
            value={form.crmType}
            onChange={(e) => onChange({ ...form, crmType: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-make">Make</Label>
          <LimsFieldWithAdd
            addButton={
              <LimsFieldAddButton
                aria-label="Add new client"
                title="Add New Client"
                onClick={openAddClient}
              />
            }
          >
            <FilterCombobox
              inputId="crm-make"
              listId="crm-make-list"
              value={makeOpen ? makeQuery : selectedMakeLabel}
              onValueChange={(v) => {
                setMakeQuery(v)
                if (!makeOpen) setMakeOpen(true)
                if (!v.trim()) {
                  onChange({ ...form, make: '' })
                }
              }}
              options={filteredClients}
              onSelectOption={(opt) => {
                onChange({ ...form, make: opt.label })
                setMakeQuery(opt.label)
                setMakeOpen(false)
              }}
              open={makeOpen}
              onOpenChange={(open) => {
                setMakeOpen(open)
                if (open) setMakeQuery(selectedMakeLabel)
              }}
              placeholder="Type to search client…"
              extraActions={[
                {
                  key: 'add-client',
                  label: 'Add New Client',
                  onSelect: openAddClient,
                },
              ]}
            />
          </LimsFieldWithAdd>
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-trace-as-per">Traceability As Per</Label>
          <Input
            id="crm-trace-as-per"
            value={form.traceabilityAsPer}
            onChange={(e) => onChange({ ...form, traceabilityAsPer: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Uncertainty</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
            aria-label="Open CRM uncertainty table"
            title="Open CRM uncertainty table"
            onClick={() => setUncertaintyOpen(true)}
          >
            <ListChecks size={14} />
            Open Form
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
          disabled={!canSave || saveLoading}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <AddClientDialog
        open={addClientOpen}
        onOpenChange={handleAddClientOpenChange}
        nested
        initialCompanyName={addClientInitialName}
        onSaved={(id) => void handleClientSaved(id)}
        title="Add New Client"
      />

      <CrmUncertaintyDialog
        open={uncertaintyOpen}
        onOpenChange={handleUncertaintyOpenChange}
        rows={form.uncertaintyRows}
        onChange={(uncertaintyRows) => onChange({ ...form, uncertaintyRows })}
      />
    </div>
  )
}
