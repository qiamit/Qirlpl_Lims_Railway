import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  formatProposedRange,
  formatTeamAuditee,
  formatTeamAuditor,
  formatTeamCriteria,
  type AuditPlanRow,
  type AuditTeamRow,
} from './types'

function OrgCard({
  title,
  division,
  department,
  designation,
  legacy,
}: {
  title: string
  division: string
  department: string
  designation: string
  legacy?: string
}) {
  const hasStructured = Boolean(division || department || designation)
  return (
    <div className="border border-stone-500 bg-[#f7f3eb] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      {hasStructured ? (
        <dl className="mt-2 space-y-1 text-sm text-stone-900">
          <div>
            <dt className="inline font-medium text-stone-500">Division: </dt>
            <dd className="inline">{division || '—'}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-stone-500">Department: </dt>
            <dd className="inline">{department || '—'}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-stone-500">Designation: </dt>
            <dd className="inline">{designation || '—'}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-stone-900">{(legacy ?? '').trim() || '—'}</p>
      )}
    </div>
  )
}

function CriteriaCard({ row }: { row: AuditTeamRow }) {
  const clauses = row.criteriaClauseNos ?? []
  const criteria = formatTeamCriteria(row)
  return (
    <div className="border border-stone-500 bg-[#f7f3eb] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Criteria</p>
      {clauses.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {clauses.map((no) => (
            <Badge
              key={no}
              variant="secondary"
              className="rounded-none border border-stone-400 bg-white font-mono text-[11px] font-normal text-stone-800"
            >
              {no}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-900">{criteria || '—'}</p>
      )}
    </div>
  )
}

export function AuditPlanTeamViewDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: AuditPlanRow | null
}) {
  const teamRows = row && Array.isArray(row.team_rows) ? row.team_rows : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:pl-[268px]"
        className={cn(
          limsDialogClass,
          'flex w-[min(100%-1.5rem,42rem)] max-h-[min(90dvh,44rem)] flex-col',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {row ? `Team Details — ${row.audit_id}` : 'Team Details'}
              </DialogTitle>
              {row ? (
                <p className="text-sm text-stone-300">
                  {auditTypeLabel(row.audit_type)} ·{' '}
                  {formatProposedRange(row.proposed_from, row.proposed_to)}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
          {!row ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No audit plan selected.</p>
          ) : teamRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No team rows on this plan.</p>
          ) : (
            <div className="space-y-4">
              {teamRows.map((team, index) => (
                <div key={`team-view-${index}`} className="space-y-2">
                  {teamRows.length > 1 ? (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      Team row {index + 1}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <OrgCard
                      title="Auditee"
                      division={team.auditeeDivision}
                      department={team.auditeeDepartment}
                      designation={team.auditeeDesignation}
                      legacy={formatTeamAuditee(team)}
                    />
                    <OrgCard
                      title="Auditor"
                      division={team.auditorDivision}
                      department={team.auditorDepartment}
                      designation={team.auditorDesignation}
                      legacy={formatTeamAuditor(team)}
                    />
                  </div>
                  <CriteriaCard row={team} />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
