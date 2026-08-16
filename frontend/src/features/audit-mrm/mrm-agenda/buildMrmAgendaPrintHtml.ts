import type { MrmAgendaItemForm, MrmPlanForm, MrmRecipientForm } from './types'
import { formatDate, formatPlannedRange, mrmStatusLabel } from './types'

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildMrmAgendaPrintHtml(opts: {
  labName: string
  plan: Pick<
    MrmPlanForm,
    'planCode' | 'plannedFrom' | 'plannedTo' | 'venue' | 'chairperson' | 'status' | 'notes'
  > & {
    agendaItems: MrmAgendaItemForm[]
    recipients: MrmRecipientForm[]
  }
}): string {
  const { labName, plan } = opts
  const included = plan.agendaItems.filter((i) => i.included)
  const agendaRows = included
    .map(
      (item, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td class="letter">${esc(item.clauseLetter)})</td>
        <td>${esc(item.title)}</td>
      </tr>`,
    )
    .join('')

  const recipientRows =
    plan.recipients.length === 0
      ? `<tr><td colspan="4" class="muted">No recipients selected.</td></tr>`
      : plan.recipients
          .map(
            (r) => `
      <tr>
        <td>${esc(r.name || '—')}</td>
        <td>${esc(r.designation || '—')}</td>
        <td>${esc(r.department || '—')}</td>
        <td>${esc(r.email || '—')}</td>
      </tr>`,
          )
          .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MRM Agenda — ${esc(plan.planCode)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c1917; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #57534e; font-size: 12px; margin-bottom: 16px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
    .meta dt { color: #78716c; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta dd { margin: 2px 0 0; font-weight: 600; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #57534e; margin: 18px 0 8px; border-bottom: 2px solid #a8a29e; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #78716c; padding: 6px 8px; vertical-align: top; }
    th { background: #292524; color: #fde68a; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    td.num, td.letter { width: 36px; text-align: center; font-weight: 600; }
    td.muted { text-align: center; color: #78716c; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${esc(labName || 'Laboratory')} — Management Review Meeting Agenda</h1>
  <p class="sub">ISO/IEC 17025 Clause 8.9.2 · Plan ${esc(plan.planCode)} · ${esc(mrmStatusLabel(plan.status))}</p>
  <dl class="meta">
    <div><dt>Planned dates</dt><dd>${esc(formatPlannedRange(plan.plannedFrom, plan.plannedTo))}</dd></div>
    <div><dt>Venue</dt><dd>${esc(plan.venue || '—')}</dd></div>
    <div><dt>Chairperson</dt><dd>${esc(plan.chairperson || '—')}</dd></div>
    <div><dt>Printed</dt><dd>${esc(formatDate(new Date().toISOString().slice(0, 10)))}</dd></div>
  </dl>
  <h2>Agenda inputs (Clause 8.9.2)</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Ref</th><th>Agenda point</th></tr>
    </thead>
    <tbody>
      ${agendaRows || `<tr><td colspan="3" class="muted">No agenda points included.</td></tr>`}
    </tbody>
  </table>
  <h2>Distribution / recipients</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Designation</th><th>Department</th><th>Email</th></tr>
    </thead>
    <tbody>${recipientRows}</tbody>
  </table>
</body>
</html>`
}
