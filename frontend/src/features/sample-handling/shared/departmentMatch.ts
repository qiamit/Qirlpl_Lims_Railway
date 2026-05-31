/** Normalize lab / allocation department labels for comparison. */
export function normalizeDepartmentName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** True when sample allocation department matches the logged-in user's department. */
export function departmentsMatch(
  allocationDepartment: string | null | undefined,
  userDepartment: string | null | undefined,
): boolean {
  const alloc = normalizeDepartmentName(allocationDepartment)
  const user = normalizeDepartmentName(userDepartment)
  if (!user) return false
  if (!alloc) return false
  return alloc === user
}
