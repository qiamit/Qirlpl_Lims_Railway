import { formatDate, formatDateTime } from '@/lib/utils'
import {
  MRM_OUTPUT_TYPES,
  actionStatusLabel,
  effectiveActionStatus,
  formatPeriod,
  meetingStatusLabel,
  type MrmMeetingForm,
  type MrmMeetingRow,
} from './types'

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function para(value: string) {
  const t = value.trim()
  return t ? esc(t).replace(/\n/g, '<br />') : '<span class="muted">—</span>'
}

/** A4 minutes of a management review meeting (ISO/IEC 17025 8.9), same print style as the MRM agenda. */
export function buildMrmMinutesPrintHtml(opts: {
  labName: string
  meeting: MrmMeetingRow
  form: MrmMeetingForm
}): string {
  const { labName, meeting, form } = opts
  const draft = meeting.status !== 'closed'

  const present = form.attendance.filter((a) => a.present)
  const absent = form.attendance.filter((a) => !a.present)
  const attendanceRows =
    form.attendance.length === 0
      ? `<tr><td colspan="4" class="muted">No attendance recorded.</td></tr>`
      : [...present, ...absent]
          .map(
            (a, i) => `<tr><td class="num">${i + 1}</td><td>${esc(a.name)}</td><td>${esc(a.designation || '—')}</td><td class="c">${a.present ? 'Present' : 'Absent'}</td></tr>`,
          )
          .join('')

  const inputRows = form.inputs
    .map((i) => {
      const figs = i.summary.figures.length
        ? `<div class="figs">${i.summary.figures.map((f) => `<span>${esc(f.label)}: <b>${esc(f.value)}</b></span>`).join('')}</div>`
        : ''
      const items = i.summary.items.length
        ? `<ul>${i.summary.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : ''
      return `<tr class="keep">
        <td class="letter">${esc(i.code)})</td>
        <td><div class="ttl">${esc(i.title)}</div>${figs}${items}</td>
        <td>${para(i.discussion)}</td>
        <td>${para(i.conclusion)}</td>
      </tr>`
    })
    .join('')

  const outputRows = MRM_OUTPUT_TYPES.map((t) => {
    const list = form.outputs.filter((o) => o.outputType === t.value && o.decision.trim())
    if (list.length === 0) return ''
    return list
      .map(
        (o, idx) => `<tr class="keep">${idx === 0 ? `<td rowspan="${list.length}" class="otype">${esc(t.label)}</td>` : ''}<td>${para(o.decision)}</td></tr>`,
      )
      .join('')
  }).join('')

  const actionRows =
    form.actions.length === 0
      ? `<tr><td colspan="7" class="muted">No actions.</td></tr>`
      : form.actions
          .map((a, i) => {
            const st = effectiveActionStatus(a)
            return `<tr class="keep">
              <td class="num">${i + 1}</td>
              <td>${para(a.action)}</td>
              <td>${esc(a.ownerName || '—')}</td>
              <td class="c">${esc(a.dueOn ? formatDate(a.dueOn) : '—')}</td>
              <td class="c">${esc(actionStatusLabel(st))}${a.closedOn ? `<br /><span class="small">${esc(formatDate(a.closedOn))}</span>` : ''}</td>
              <td>${para(a.closureEvidence)}</td>
              <td>${esc(a.capaRef || '—')}</td>
            </tr>`
          })
          .join('')

  const approval = meeting.status === 'closed'
    ? `<p>Approved and closed by <b>${esc(meeting.approvedByName || '—')}</b> on ${esc(formatDateTime(meeting.approvedAt))}${meeting.approvedReauthenticatedAt ? ' (password confirmed)' : ''}.</p>`
    : `<p class="draftnote">${esc(meetingStatusLabel(meeting.status))} — not yet approved. These minutes are not final.</p>`

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MRM Minutes — ${esc(form.meetingNo)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c1917; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #57534e; font-size: 12px; margin-bottom: 16px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
    .meta dt { color: #78716c; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta dd { margin: 2px 0 0; font-weight: 600; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #57534e; margin: 18px 0 8px; border-bottom: 2px solid #a8a29e; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #78716c; padding: 5px 7px; vertical-align: top; }
    th { background: #292524; color: #fde68a; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    thead { display: table-header-group; }
    tr.keep { page-break-inside: avoid; }
    td.num, td.letter { width: 28px; text-align: center; font-weight: 600; }
    td.c { text-align: center; }
    td.otype { width: 26%; font-weight: 600; }
    td.muted, .muted { text-align: center; color: #78716c; }
    .ttl { font-weight: 600; margin-bottom: 3px; }
    .figs { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 10px; color: #44403c; }
    ul { margin: 3px 0 0 14px; padding: 0; font-size: 10px; color: #44403c; }
    .small { font-size: 9px; color: #57534e; }
    .draftnote { border: 2px dashed #b45309; color: #92400e; padding: 6px 10px; font-weight: 600; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; font-size: 12px; }
    .sign div { border-top: 1px solid #1c1917; padding-top: 4px; }
    ${draft ? '.wm { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 96px; color: rgba(180, 83, 9, 0.08); transform: rotate(-24deg); pointer-events: none; }' : ''}
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  ${draft ? '<div class="wm">DRAFT</div>' : ''}
  <h1>${esc(labName || 'Laboratory')} — Minutes of Management Review Meeting</h1>
  <p class="sub">ISO/IEC 17025:2017 Clause 8.9 · Meeting ${esc(form.meetingNo)}${meeting.planCode ? ` · Plan ${esc(meeting.planCode)}` : ''} · ${esc(meetingStatusLabel(meeting.status))}</p>
  <dl class="meta">
    <div><dt>Held on</dt><dd>${esc(formatDate(form.heldOn))}</dd></div>
    <div><dt>Venue</dt><dd>${esc(form.venue || '—')}</dd></div>
    <div><dt>Chaired by</dt><dd>${esc(form.chairedBy || '—')}</dd></div>
    <div><dt>Review period</dt><dd>${esc(formatPeriod(form.periodFrom, form.periodTo, formatDate))}</dd></div>
    <div><dt>Minutes circulated</dt><dd>${esc(meeting.minutesCirculatedAt ? formatDateTime(meeting.minutesCirculatedAt) : '—')}</dd></div>
    <div><dt>Printed</dt><dd>${esc(formatDateTime(new Date().toISOString()))}</dd></div>
  </dl>

  <h2>Attendance</h2>
  <table>
    <thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Attendance</th></tr></thead>
    <tbody>${attendanceRows}</tbody>
  </table>

  <h2>Review inputs (Clause 8.9.2)</h2>
  <table>
    <thead><tr><th>Ref</th><th style="width:34%">Input and data for the period</th><th>Discussion</th><th>Conclusion</th></tr></thead>
    <tbody>${inputRows}</tbody>
  </table>

  <h2>Outputs — decisions (Clause 8.9.3)</h2>
  <table>
    <thead><tr><th>Output</th><th>Decision</th></tr></thead>
    <tbody>${outputRows || `<tr><td colspan="2" class="muted">No decisions recorded.</td></tr>`}</tbody>
  </table>

  <h2>Action items</h2>
  <table>
    <thead><tr><th>#</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Closure evidence</th><th>CAPA</th></tr></thead>
    <tbody>${actionRows}</tbody>
  </table>

  <h2>Closing remarks</h2>
  <p style="font-size:12px">${para(form.closingRemarks)}</p>
  ${approval}
  <div class="sign">
    <div>Prepared by (Quality Manager)</div>
    <div>Approved by (Laboratory Director)${meeting.status === 'closed' ? `: ${esc(meeting.approvedByName)}` : ''}</div>
  </div>
</body>
</html>`
}

/** Hidden iframe print (same pattern as the MRM agenda / audit plan) avoids pop-up blockers. */
export function openPrintWindow(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const cleanup = () => {
    try {
      document.body.removeChild(iframe)
    } catch {
      // ignore
    }
  }
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    cleanup()
    throw new Error('Unable to open print preview.')
  }
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(cleanup, 800)
    }
  }
  iframe.onload = () => doPrint()
  doc.open()
  doc.write(html)
  doc.close()
  window.setTimeout(doPrint, 300)
}
