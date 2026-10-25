import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Printer, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { printViaIframe } from '@/features/general-requirements/shared'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { fetchTeamUsers } from '@/lib/fetchTeamUsers'
import { escapeHtml } from '@/lib/htmlText'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  Badge,
  CompHeader,
  CompPanel,
  CompSelect,
  Field,
  MessageLine,
  MissingMigrationNotice,
  compCardClass,
  compInputClass,
  compTdClass,
  compTextareaClass,
  compThClass,
} from './CompetenceUi'
import {
  REQUIREMENT_TYPES,
  canManageCompetence,
  errText,
  isCompetenceMissingError,
  labelOf,
  norm,
  type CompetenceRequirement,
  type RequirementType,
} from './competenceShared'

type Draft = {
  id: string | null
  role: string
  department: string
  requirement_type: RequirementType
  description: string
  minimum_level: string
  mandatory: boolean
}

const EMPTY: Draft = {
  id: null,
  role: '',
  department: '',
  requirement_type: 'education',
  description: '',
  minimum_level: '',
  mandatory: true,
}

export default function CompetenceRequirementsPage() {
  const { designation, departmentName } = useAuth()
  const canManage = canManageCompetence(designation, departmentName)
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [rows, setRows] = useState<CompetenceRequirement[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [roleFilter, setRoleFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('competence_requirements')
        .select('*')
        .order('role')
        .order('sort_order')
        .order('created_at')
      if (err) {
        if (isCompetenceMissingError(err)) {
          setMissing(true)
          return
        }
        throw err
      }
      setMissing(false)
      setRows((data ?? []) as CompetenceRequirement[])
      const users = await fetchTeamUsers().catch(() => [])
      setRoles([...new Set(users.map((u) => u.designation).filter(Boolean))].sort())
      setDepartments([...new Set(users.map((u) => u.department_name).filter(Boolean))].sort())
    } catch (err) {
      setError(errText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const allRoles = useMemo(
    () => [...new Set([...roles, ...rows.map((r) => r.role)])].sort((a, b) => a.localeCompare(b)),
    [roles, rows],
  )

  const visible = useMemo(
    () =>
      rows.filter((r) => (showInactive || r.active) && (!roleFilter || norm(r.role) === norm(roleFilter))),
    [rows, roleFilter, showInactive],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, CompetenceRequirement[]>()
    for (const r of visible) {
      const key = r.department ? `${r.role} — ${r.department}` : r.role
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  const save = async () => {
    if (!draft.role.trim() || !draft.description.trim()) {
      setMessage('Enter the role and the requirement.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        role: draft.role.trim(),
        department: draft.department.trim() || null,
        requirement_type: draft.requirement_type,
        description: draft.description.trim(),
        minimum_level: draft.minimum_level.trim() || null,
        mandatory: draft.mandatory,
      }
      if (draft.id) {
        const reason = await askReason({
          title: 'Reason for changing a competence requirement',
          recordLabel: `${payload.role} · ${payload.description}`,
          quickPicks: ['Revised job description', 'Corrected wording', 'Management review decision'],
        })
        if (!reason) return
        const { error: err } = await supabase.from('competence_requirements').update(payload).eq('id', draft.id)
        if (err) throw err
        await recordReason('competence_requirements', draft.id, reason)
        setMessage('Requirement updated.')
      } else {
        const { error: err } = await supabase
          .from('competence_requirements')
          .insert({ ...payload, sort_order: rows.filter((r) => norm(r.role) === norm(payload.role)).length })
        if (err) throw err
        setMessage('Requirement added.')
      }
      setDraft((d) => ({ ...EMPTY, role: d.role, department: d.department }))
      await load()
    } catch (err) {
      setMessage(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: CompetenceRequirement) => {
    const { error: err } = await supabase.from('competence_requirements').update({ active: !r.active }).eq('id', r.id)
    if (err) setMessage(errText(err))
    else await load()
  }

  const remove = async (r: CompetenceRequirement) => {
    const reason = await askReason({
      title: 'Reason for deleting a competence requirement',
      recordLabel: `${r.role} · ${r.description}`,
      confirmLabel: 'Delete',
      quickPicks: ['Duplicate entry', 'Entered in error'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('competence_requirements').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? errText(err) : 'Not deleted (Laboratory Director only). Set it inactive instead.')
      return
    }
    await recordReason('competence_requirements', r.id, reason)
    await load()
  }

  const print = () => {
    const body = grouped
      .map(
        ([role, list]) => `<h2>${escapeHtml(role)}</h2><table><thead><tr><th>Type</th><th>Requirement</th><th>Minimum</th><th>Mandatory</th></tr></thead><tbody>${list
          .map(
            (r) =>
              `<tr><td>${escapeHtml(labelOf(REQUIREMENT_TYPES, r.requirement_type))}</td><td>${escapeHtml(r.description)}</td><td>${escapeHtml(r.minimum_level ?? '')}</td><td>${r.mandatory ? 'Yes' : 'Desirable'}</td></tr>`,
          )
          .join('')}</tbody></table>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Competence requirements</title>
<style>body{font-family:sans-serif;font-size:11px;margin:16px}h1{font-size:15px}h2{font-size:12px;margin:14px 0 4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}</style>
</head><body><h1>Competence requirements by role (ISO/IEC 17025 6.2.2)</h1>${body}</body></html>`)
  }

  return (
    <div className={limsPageShellClass}>
      <CompHeader
        title="Competence Requirements"
        clause="6.2.2"
        subtitle="Education, qualification, training, experience, skills and knowledge required for each role."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={print} disabled={!rows.length}>
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </>
        }
      />
      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />
      <datalist id="comp-roles">
        {allRoles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="comp-departments">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {!missing && canManage ? (
        <CompPanel title={draft.id ? 'Edit requirement' : 'Add requirement'}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Role / designation *" htmlFor="cr-role" className="lg:col-span-2">
              <Input id="cr-role" list="comp-roles" value={draft.role} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            </Field>
            <Field label="Department (blank = all)" htmlFor="cr-dept">
              <Input id="cr-dept" list="comp-departments" value={draft.department} className={compInputClass}
                onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            </Field>
            <Field label="Type *" htmlFor="cr-type">
              <CompSelect id="cr-type" value={draft.requirement_type}
                onChange={(v) => setDraft({ ...draft, requirement_type: v as RequirementType })}>
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </CompSelect>
            </Field>
            <Field label="Minimum level" htmlFor="cr-min">
              <Input id="cr-min" value={draft.minimum_level} placeholder="e.g. 2 years, Graduate" className={compInputClass}
                onChange={(e) => setDraft({ ...draft, minimum_level: e.target.value })} />
            </Field>
            <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={draft.mandatory}
                onChange={(e) => setDraft({ ...draft, mandatory: e.target.checked })} />
              Mandatory
            </label>
            <Field label="Requirement *" htmlFor="cr-desc" className="sm:col-span-2 lg:col-span-6">
              <Textarea id="cr-desc" value={draft.description} className={compTextareaClass}
                placeholder="e.g. B.Sc. (Chemistry) or B.E. (Civil); knowledge of IS 4031 test methods"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {draft.id ? (
              <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10 sm:h-8')} onClick={() => setDraft(EMPTY)}>
                <X className="h-4 w-4" /> Cancel
              </Button>
            ) : null}
            <Button className={cn(limsPrimaryBtnClass, 'h-10 sm:h-8')} onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CompPanel>
      ) : null}

      {!missing ? (
        <CompPanel
          title={`Requirements (${visible.length})`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <CompSelect value={roleFilter} onChange={setRoleFilter} ariaLabel="Filter by role" className="w-48 bg-white">
                <option value="">All roles</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </CompSelect>
              <label className="flex items-center gap-1.5 text-[12px] text-amber-100">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Inactive
              </label>
            </div>
          }
        >
          {grouped.length === 0 && !loading ? (
            <p className="p-4 text-center text-[13px] text-stone-600">No requirements defined yet.</p>
          ) : null}
          <div className="space-y-3">
            {grouped.map(([role, list]) => (
              <div key={role}>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-amber-900">{role}</p>
                <div className="space-y-1.5 md:hidden">
                  {list.map((r) => (
                    <div key={r.id} className={cn(compCardClass, !r.active && 'opacity-60')}>
                      <p className="font-semibold">{labelOf(REQUIREMENT_TYPES, r.requirement_type)}
                        {r.mandatory ? '' : ' · desirable'}</p>
                      <p>{r.description}</p>
                      {r.minimum_level ? <p className="text-[12px] text-stone-600">Minimum: {r.minimum_level}</p> : null}
                      {canManage ? (
                        <div className="mt-1 flex justify-end gap-1">
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={() => setDraft({
                            id: r.id, role: r.role, department: r.department ?? '', requirement_type: r.requirement_type,
                            description: r.description, minimum_level: r.minimum_level ?? '', mandatory: r.mandatory,
                          })}>
                            <Pencil className="h-4 w-4" /> Edit
                          </Button>
                          <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={() => void toggleActive(r)}>
                            {r.active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] border-collapse font-jakarta">
                    <thead>
                      <tr>
                        <th className={cn(compThClass, 'w-40')}>Type</th>
                        <th className={compThClass}>Requirement</th>
                        <th className={cn(compThClass, 'w-40')}>Minimum</th>
                        <th className={cn(compThClass, 'w-28')}>Mandatory</th>
                        {canManage ? <th className={cn(compThClass, 'w-44')}>Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={r.id} className={cn(i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]', !r.active && 'opacity-60')}>
                          <td className={compTdClass}>{labelOf(REQUIREMENT_TYPES, r.requirement_type)}</td>
                          <td className={compTdClass}>{r.description}</td>
                          <td className={compTdClass}>{r.minimum_level || '—'}</td>
                          <td className={cn(compTdClass, 'text-center')}>
                            {r.mandatory ? <Badge tone="amber">Mandatory</Badge> : <Badge tone="grey">Desirable</Badge>}
                            {!r.active ? <div className="mt-1"><Badge tone="grey">Inactive</Badge></div> : null}
                          </td>
                          {canManage ? (
                            <td className={cn(compTdClass, 'whitespace-nowrap text-center')}>
                              <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} aria-label="Edit"
                                onClick={() => setDraft({
                                  id: r.id, role: r.role, department: r.department ?? '', requirement_type: r.requirement_type,
                                  description: r.description, minimum_level: r.minimum_level ?? '', mandatory: r.mandatory,
                                })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>{' '}
                              <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-7 px-2 text-[12px]')} onClick={() => void toggleActive(r)}>
                                {r.active ? 'Deactivate' : 'Activate'}
                              </Button>{' '}
                              {isDirector ? (
                                <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 w-7')} aria-label="Delete" onClick={() => void remove(r)}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-700" />
                                </Button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </CompPanel>
      ) : null}
    </div>
  )
}
