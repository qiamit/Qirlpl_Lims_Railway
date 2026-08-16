import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  emptyNcActionForm,
  isNcActionStarted,
  mapNcActionForm,
  NC_ACTION_FIELDS,
  type NcActionForm,
} from '@/features/audit-mrm/non-conformities/types'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatSupabaseError } from '../shared'
import type { NcWorkRecordRow } from '../records/types'

export function NcWorkCapaDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: NcWorkRecordRow | null
  onSaved?: () => void
}) {
  const handleOpenChange = useFormDialogOpenChange(onOpenChange)
  const [form, setForm] = useState<NcActionForm>(() => emptyNcActionForm())
  const [existingId, setExistingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!record) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('nc_work_corrective_actions')
        .select('*')
        .eq('nc_work_record_id', record.id)
        .maybeSingle()
      if (err) throw err
      if (data) {
        setExistingId(String((data as { id: string }).id))
        setForm(mapNcActionForm(data as Record<string, unknown>))
      } else {
        setExistingId(null)
        setForm({
          ...emptyNcActionForm(),
          description_of_nc: record.description || '',
        })
      }
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }, [record])

  useEffect(() => {
    if (open && record) void load()
    if (!open) {
      setForm(emptyNcActionForm())
      setExistingId(null)
      setError(null)
    }
  }, [open, record, load])

  const handleSave = async () => {
    if (!record) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        nc_work_record_id: record.id,
        ...form,
      }
      if (existingId) {
        const { error: err } = await supabase
          .from('nc_work_corrective_actions')
          .update(payload)
          .eq('id', existingId)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase
          .from('nc_work_corrective_actions')
          .insert(payload)
          .select('id')
          .single()
        if (err) throw err
        setExistingId(String((data as { id: string }).id))
      }
      onSaved?.()
      handleOpenChange(false)
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white sm:text-lg">
              Corrective Action — {record?.nc_id ?? 'NCW'}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-stone-300">
              ISO 17025 §7.10.3
              {isNcActionStarted(form) ? ' · In progress' : ''}
            </p>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5',
            limsRegistryFormClass,
            'space-y-3',
          )}
        >
          {loading ? (
            <p className="py-10 text-center text-sm text-stone-600">Loading CAPA form…</p>
          ) : (
            <>
              {NC_ACTION_FIELDS.map(({ key, label, step }) => {
                const readOnly = key === 'description_of_nc'
                return (
                  <div key={key} className="border border-stone-500 bg-white p-3">
                    <Label
                      htmlFor={`ncw-capa-${key}`}
                      className="text-xs font-semibold uppercase tracking-wide text-stone-600"
                    >
                      {step}. {label}
                    </Label>
                    {readOnly ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-stone-900">
                        {form[key].trim() || '—'}
                      </p>
                    ) : (
                      <Textarea
                        id={`ncw-capa-${key}`}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        rows={3}
                        className="mt-2 !min-h-8 resize-y"
                      />
                    )}
                  </div>
                )
              })}
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
                  disabled={saving || !record}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Saving…' : 'Save CAPA'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
