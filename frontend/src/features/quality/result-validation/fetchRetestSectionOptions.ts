import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'

export type RetestSectionOption = {
  sampleAllocationId: string
  testAllocationId: string
  sectionCode: string
  department: string
  designation: string
  quantity: string
  assignedEmployeeId: string | null
  resultsReviewerId: string | null
  resultsReviewerName: string | null
  reviewerDepartment: string
  reviewerDesignation: string
}

type ReviewerRef = {
  id: string | null
  name: string | null
}

type UserProfileSnapshot = {
  id: string
  fullName: string
  departmentName: string
  designation: string
}

function pickMostCommonReviewer(refs: ReviewerRef[]): ReviewerRef | null {
  if (refs.length === 0) return null

  const counts = new Map<string, { count: number; ref: ReviewerRef }>()
  for (const ref of refs) {
    const id = ref.id?.trim() ?? ''
    const name = ref.name?.trim() ?? ''
    const key = id ? `id:${id}` : name ? `name:${name.toLowerCase()}` : ''
    if (!key) continue
    const current = counts.get(key)
    if (current) current.count += 1
    else counts.set(key, { count: 1, ref: { id: id || null, name: name || null } })
  }

  let best: ReviewerRef | null = null
  let bestCount = 0
  for (const { count, ref } of counts.values()) {
    if (count > bestCount) {
      best = ref
      bestCount = count
    }
  }
  return best
}

async function loadUserProfilesByIds(ids: string[]): Promise<Map<string, UserProfileSnapshot>> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, department_name, designation')
    .in('id', uniqueIds)

  if (error) throw new Error(formatSupabaseError(error))

  const map = new Map<string, UserProfileSnapshot>()
  for (const raw of data ?? []) {
    const row = raw as {
      id: string
      full_name?: string | null
      department_name?: string | null
      designation?: string | null
    }
    map.set(row.id, {
      id: row.id,
      fullName: String(row.full_name ?? '').trim(),
      departmentName: String(row.department_name ?? '').trim(),
      designation: String(row.designation ?? '').trim(),
    })
  }
  return map
}

async function loadUserProfilesByNames(names: string[]): Promise<Map<string, UserProfileSnapshot>> {
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (uniqueNames.length === 0) return new Map()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, department_name, designation')

  if (error) throw new Error(formatSupabaseError(error))

  const wanted = new Set(uniqueNames.map((name) => name.toLowerCase()))
  const map = new Map<string, UserProfileSnapshot>()

  for (const raw of data ?? []) {
    const row = raw as {
      id: string
      full_name?: string | null
      department_name?: string | null
      designation?: string | null
    }
    const fullName = String(row.full_name ?? '').trim()
    if (!fullName || !wanted.has(fullName.toLowerCase())) continue
    map.set(fullName.toLowerCase(), {
      id: row.id,
      fullName,
      departmentName: String(row.department_name ?? '').trim(),
      designation: String(row.designation ?? '').trim(),
    })
  }

  return map
}

function resolveReviewerMeta(
  ref: ReviewerRef | null,
  profileById: Map<string, UserProfileSnapshot>,
  profileByName: Map<string, UserProfileSnapshot>,
): {
  id: string | null
  name: string | null
  department: string
  designation: string
} {
  if (!ref) {
    return { id: null, name: null, department: '', designation: '' }
  }

  const id = ref.id?.trim() || null
  const name = ref.name?.trim() || null

  if (id) {
    const profile = profileById.get(id)
    if (profile) {
      return {
        id: profile.id,
        name: profile.fullName || name,
        department: profile.departmentName,
        designation: profile.designation,
      }
    }
  }

  if (name) {
    const profile = profileByName.get(name.toLowerCase())
    if (profile) {
      return {
        id: profile.id,
        name: profile.fullName || name,
        department: profile.departmentName,
        designation: profile.designation,
      }
    }
  }

  return { id, name, department: '', designation: '' }
}

export async function fetchRetestSectionOptions(sampleId: string): Promise<RetestSectionOption[]> {
  const sid = sampleId.trim()
  if (!sid) return []

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, section_code, department, designation, quantity')
    .eq('sample_id', sid)
    .order('section_code')

  if (allocErr) throw new Error(formatSupabaseError(allocErr))

  const allocations = (allocRows ?? []) as Array<{
    id: string
    section_code?: string | null
    department?: string | null
    designation?: string | null
    quantity?: string | null
  }>

  if (allocations.length === 0) return []

  const allocById = new Map(
    allocations.map((alloc) => [
      alloc.id,
      {
        sectionCode: String(alloc.section_code ?? '').trim(),
        department: String(alloc.department ?? '').trim(),
        designation: String(alloc.designation ?? '').trim(),
        quantity: String(alloc.quantity ?? '').trim(),
      },
    ]),
  )

  const allocIds = allocations.map((alloc) => alloc.id)

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id, assigned_employee_id')
    .in('sample_allocation_id', allocIds)

  if (taErr) throw new Error(formatSupabaseError(taErr))

  const testAllocs = (taRows ?? []) as Array<{
    id: string
    sample_allocation_id: string
    assigned_employee_id?: string | null
  }>

  const taByAllocId = new Map(testAllocs.map((ta) => [ta.sample_allocation_id, ta]))

  const taIds = testAllocs.map((ta) => ta.id)
  const reviewerByTaId = new Map<string, ReviewerRef | null>()

  if (taIds.length > 0) {
    const { data: paramRows, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select('test_allocation_id, results_reviewer_id, results_reviewer_name')
      .in('test_allocation_id', taIds)

    if (paramErr) throw new Error(formatSupabaseError(paramErr))

    const grouped = new Map<string, ReviewerRef[]>()
    for (const raw of paramRows ?? []) {
      const row = raw as {
        test_allocation_id?: string
        results_reviewer_id?: string | null
        results_reviewer_name?: string | null
      }
      const taId = String(row.test_allocation_id ?? '').trim()
      const reviewerId = String(row.results_reviewer_id ?? '').trim()
      const reviewerName = String(row.results_reviewer_name ?? '').trim()
      if (!taId || (!reviewerId && !reviewerName)) continue
      if (reviewerName === 'Approved') continue

      const list = grouped.get(taId) ?? []
      list.push({ id: reviewerId || null, name: reviewerName || null })
      grouped.set(taId, list)
    }

    for (const [taId, refs] of grouped) {
      reviewerByTaId.set(taId, pickMostCommonReviewer(refs))
    }
  }

  const reviewerIds: string[] = []
  const reviewerNames: string[] = []
  for (const ref of reviewerByTaId.values()) {
    if (!ref) continue
    if (ref.id) reviewerIds.push(ref.id)
    else if (ref.name) reviewerNames.push(ref.name)
  }

  const [profileById, profileByName] = await Promise.all([
    loadUserProfilesByIds(reviewerIds),
    loadUserProfilesByNames(reviewerNames),
  ])

  const options: RetestSectionOption[] = []

  for (const alloc of allocations) {
    const meta = allocById.get(alloc.id)
    if (!meta?.sectionCode) continue

    const ta = taByAllocId.get(alloc.id)
    const reviewerRef = ta?.id ? (reviewerByTaId.get(ta.id) ?? null) : null
    const reviewerMeta = resolveReviewerMeta(reviewerRef, profileById, profileByName)

    options.push({
      sampleAllocationId: alloc.id,
      testAllocationId: ta?.id ?? '',
      sectionCode: meta.sectionCode,
      department: meta.department,
      designation: meta.designation,
      quantity: meta.quantity,
      assignedEmployeeId: ta?.assigned_employee_id?.trim() || null,
      resultsReviewerId: reviewerMeta.id,
      resultsReviewerName: reviewerMeta.name,
      reviewerDepartment: reviewerMeta.department,
      reviewerDesignation: reviewerMeta.designation,
    })
  }

  return options.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
}
