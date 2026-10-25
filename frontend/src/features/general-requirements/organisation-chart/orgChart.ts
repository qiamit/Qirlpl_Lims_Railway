/**
 * Organisation chart with deputies (ISO/IEC 17025 5.5, 6.2; gap P3-3).
 * Table org_positions (20261031100000_p3_good_practice.sql).
 */
import { escapeHtml } from '@/lib/htmlText'

export type OrgPosition = {
  id: string
  title: string
  department: string | null
  holder_user_id: string | null
  deputy_user_id: string | null
  reports_to: string | null
  responsibilities: string | null
  authority: string | null
  key_personnel: boolean
  sort_order: number
  active: boolean
}

export type OrgPerson = { id: string; full_name: string | null; designation: string | null; status?: string | null }

export type OrgNode = { position: OrgPosition; children: OrgNode[]; depth: number }

export function normalizePosition(r: Record<string, unknown>): OrgPosition {
  const s = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v))
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    department: s(r.department),
    holder_user_id: s(r.holder_user_id),
    deputy_user_id: s(r.deputy_user_id),
    reports_to: s(r.reports_to),
    responsibilities: s(r.responsibilities),
    authority: s(r.authority),
    key_personnel: r.key_personnel === true,
    sort_order: Number(r.sort_order ?? 0) || 0,
    active: r.active !== false,
  }
}

function byOrder(a: OrgPosition, b: OrgPosition) {
  return a.sort_order - b.sort_order || a.title.localeCompare(b.title)
}

/**
 * Tree of positions. A position whose manager is missing (or not in the
 * list) is shown as a root, so nothing disappears from the chart.
 */
export function buildOrgTree(positions: OrgPosition[]): OrgNode[] {
  const ids = new Set(positions.map((p) => p.id))
  const children = new Map<string, OrgPosition[]>()
  const roots: OrgPosition[] = []
  for (const p of positions) {
    if (p.reports_to && ids.has(p.reports_to) && p.reports_to !== p.id) {
      const list = children.get(p.reports_to)
      if (list) list.push(p)
      else children.set(p.reports_to, [p])
    } else {
      roots.push(p)
    }
  }
  const seen = new Set<string>()
  const make = (p: OrgPosition, depth: number): OrgNode => {
    seen.add(p.id)
    const kids = (children.get(p.id) ?? []).filter((c) => !seen.has(c.id)).sort(byOrder)
    return { position: p, depth, children: kids.map((c) => make(c, depth + 1)) }
  }
  const tree = roots.sort(byOrder).map((p) => make(p, 0))
  // Anything left (a cycle saved before the database check existed) becomes a root.
  for (const p of positions.filter((x) => !seen.has(x.id)).sort(byOrder)) tree.push(make(p, 0))
  return tree
}

/** Ids of a position and everything below it (cannot be chosen as its manager). */
export function descendantIds(positions: OrgPosition[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const p of positions) {
      if (p.reports_to && out.has(p.reports_to) && !out.has(p.id)) {
        out.add(p.id)
        grew = true
      }
    }
  }
  return out
}

export function personName(people: Map<string, OrgPerson>, id: string | null): string {
  if (!id) return ''
  const p = people.get(id)
  return p?.full_name?.trim() || 'Unknown user'
}

/** Key personnel positions without a deputy, or with a vacant holder. */
export function orgGaps(positions: OrgPosition[]): { noDeputy: OrgPosition[]; vacant: OrgPosition[] } {
  const active = positions.filter((p) => p.active)
  return {
    noDeputy: active.filter((p) => p.key_personnel && !p.deputy_user_id),
    vacant: active.filter((p) => !p.holder_user_id),
  }
}

export function buildOrgChartPrintHtml(
  tree: OrgNode[],
  people: Map<string, OrgPerson>,
  opts: { labName?: string; printedOn: string },
): string {
  const node = (n: OrgNode): string => {
    const p = n.position
    const holder = personName(people, p.holder_user_id) || 'Vacant'
    const deputy = personName(people, p.deputy_user_id)
    return `<li><div class="box${p.key_personnel ? ' key' : ''}">
<div class="t">${escapeHtml(p.title)}${p.key_personnel ? ' <span class="k">Key</span>' : ''}</div>
<div>${escapeHtml(holder)}</div>
${deputy ? `<div class="d">Deputy: ${escapeHtml(deputy)}</div>` : ''}
${p.department ? `<div class="d">${escapeHtml(p.department)}</div>` : ''}
</div>${n.children.length ? `<ul>${n.children.map(node).join('')}</ul>` : ''}</li>`
  }
  const flat: OrgNode[] = []
  const walk = (ns: OrgNode[]) => ns.forEach((n) => { flat.push(n); walk(n.children) })
  walk(tree)
  const rows = flat
    .map((n) => {
      const p = n.position
      return `<tr><td style="padding-left:${6 + n.depth * 14}px">${escapeHtml(p.title)}</td>
<td>${escapeHtml(personName(people, p.holder_user_id) || 'Vacant')}</td>
<td>${escapeHtml(personName(people, p.deputy_user_id) || '—')}</td>
<td>${p.key_personnel ? 'Yes' : ''}</td>
<td>${escapeHtml(p.responsibilities ?? '')}${p.authority ? `<br/><i>Authority:</i> ${escapeHtml(p.authority)}` : ''}</td></tr>`
    })
    .join('')
  return `<!doctype html><html><head><title>Organisation Chart</title>
<style>
  body{font-family:sans-serif;font-size:11px;color:#1c1917;margin:16px}
  h1{font-size:16px;margin:0 0 4px} .meta{color:#57534e;margin-bottom:12px}
  ul.tree, ul.tree ul{list-style:none;margin:0;padding-left:22px}
  ul.tree{padding-left:0}
  ul.tree li{position:relative;margin:6px 0}
  ul.tree ul li::before{content:'';position:absolute;left:-14px;top:0;bottom:50%;border-left:1px solid #78716c;border-bottom:1px solid #78716c;width:12px}
  .box{display:inline-block;border:1px solid #44403c;padding:4px 8px;min-width:180px;background:#fafaf9}
  .box.key{border-width:2px;border-color:#b45309}
  .t{font-weight:700} .d{color:#57534e;font-size:10px} .k{font-size:9px;color:#b45309;text-transform:uppercase}
  table{border-collapse:collapse;width:100%;margin-top:18px;page-break-inside:auto}
  th,td{border:1px solid #444;padding:4px;vertical-align:top;text-align:left}
  th{background:#292524;color:#fde68a;text-transform:uppercase;font-size:10px}
</style></head><body>
<h1>Organisation Chart</h1>
<div class="meta">${escapeHtml(opts.labName ?? '')}${opts.labName ? ' · ' : ''}Printed ${escapeHtml(opts.printedOn)} · ISO/IEC 17025 clause 5.5</div>
<ul class="tree">${tree.map(node).join('')}</ul>
<table><thead><tr><th>Position</th><th>Holder</th><th>Deputy</th><th>Key</th><th>Responsibilities / authority</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`
}
