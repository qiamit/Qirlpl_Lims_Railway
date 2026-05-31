import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import {
  ensureLabMasterOptionByLabel,
  fetchDesignationAndDepartmentLabels,
} from '@/features/settings/lab-settings/labMasterOptions'
import { UserManagementHeaderBar } from './UserManagementHeaderBar'
import { UserManagementTable } from './UserManagementTable'
import { UserManagementForm } from './UserManagementForm'
import type { UserAccount, UserForm } from './types'

async function syncUserOptionsToLabMaster(users: UserAccount[]) {
  for (const u of users) {
    if (u.designation.trim()) {
      await ensureLabMasterOptionByLabel('designation', u.designation)
    }
    if (u.departmentName.trim()) {
      await ensureLabMasterOptionByLabel('department', u.departmentName)
    }
  }
}

function formatMobileForSave(mobile: string, countryCode?: string): string {
  const trimmed = mobile.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return trimmed
  if (countryCode) return `${countryCode} ${trimmed}`.trim()
  return trimmed
}

export default function UserManagementMasterPage() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null)
  const [userUpdateLoadingId, setUserUpdateLoadingId] = useState<string | null>(null)
  const [userUpdateError, setUserUpdateError] = useState<string | null>(null)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserAccount | null>(null)
  const [userDeleteTarget, setUserDeleteTarget] = useState<UserAccount | null>(null)

  const [designations, setDesignations] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])

  const refreshLabOptions = useCallback(async () => {
    const { designations: des, departments: dept } = await fetchDesignationAndDepartmentLabels()
    setDesignations(des)
    setDepartments(dept)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('userManagement.designations', JSON.stringify(des))
      window.localStorage.setItem('userManagement.departments', JSON.stringify(dept))
    }
  }, [])

  useEffect(() => {
    void refreshLabOptions().catch(() => {
      /* defaults from lab_master_options fetch */
    })
  }, [refreshLabOptions])

  useEffect(() => {
    let canceled = false

    const loadUsers = async () => {
      setUsersLoadError(null)

      const {
        data: { session: latestSession },
      } = await supabase.auth.getSession()

      const accessToken = latestSession?.access_token ?? session?.access_token
      if (!accessToken) {
        if (!canceled) setUsersLoadError('Session expired. Please log in again.')
        return
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const payload = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: unknown }).error)
            : `Unable to load users (${response.status})`

        if (!canceled) setUsersLoadError(message)
        return
      }

      const rows =
        typeof payload === 'object' && payload && 'users' in payload
          ? ((payload as { users?: unknown }).users as unknown)
          : []

      const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []

      if (canceled) return
      const mapped = list
        .map((row) => ({
          id: String(row.id ?? ''),
          name: String(row.full_name ?? ''),
          email: String(row.email ?? ''),
          mobile: String(row.mobile ?? ''),
          password: '',
          designation: String(row.designation ?? ''),
          departmentName: String((row as { department_name?: unknown }).department_name ?? ''),
          status: (String(row.status ?? 'Active') as 'Active' | 'Inactive') ?? 'Active',
        }))
        .filter((u) => u.id)

      setUsers(mapped)

      try {
        await syncUserOptionsToLabMaster(mapped)
        if (!canceled) await refreshLabOptions()
      } catch {
        /* keep UI usable if sync fails */
      }

      const designationByDepartment: Record<string, string[]> = {}
      for (const u of mapped) {
        const dept = u.departmentName?.trim()
        const des = u.designation?.trim()
        if (dept && des) {
          if (!designationByDepartment[dept]) designationByDepartment[dept] = []
          if (!designationByDepartment[dept].includes(des)) designationByDepartment[dept].push(des)
        }
      }
      for (const k of Object.keys(designationByDepartment)) {
        designationByDepartment[k].sort((a, b) => a.localeCompare(b))
      }
      try {
        window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
      } catch {
        /* ignore */
      }
    }

    void loadUsers()

    return () => {
      canceled = true
    }
  }, [session])

  const reloadUsers = async () => {
    setUsersLoadError(null)

    const {
      data: { session: latestSession },
    } = await supabase.auth.getSession()

    const accessToken = latestSession?.access_token ?? session?.access_token
    if (!accessToken) {
      setUsersLoadError('Session expired. Please log in again.')
      return
    }

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users`
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'x-user-jwt': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const payload = (await response.json().catch(() => null)) as unknown

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : `Unable to load users (${response.status})`

      setUsersLoadError(message)
      return
    }

    const rows =
      typeof payload === 'object' && payload && 'users' in payload
        ? ((payload as { users?: unknown }).users as unknown)
        : []

    const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []

    const mapped = list
      .map((row) => ({
        id: String(row.id ?? ''),
        name: String(row.full_name ?? ''),
        email: String(row.email ?? ''),
        mobile: String(row.mobile ?? ''),
        password: '',
        designation: String(row.designation ?? ''),
        departmentName: String((row as { department_name?: unknown }).department_name ?? ''),
        status: (String(row.status ?? 'Active') as 'Active' | 'Inactive') ?? 'Active',
      }))
      .filter((u) => u.id)

    setUsers(mapped)

    try {
      await syncUserOptionsToLabMaster(mapped)
      await refreshLabOptions()
    } catch {
      /* keep UI usable if sync fails */
    }

    const designationByDepartment: Record<string, string[]> = {}
    for (const u of mapped) {
      const dept = u.departmentName?.trim()
      const des = u.designation?.trim()
      if (dept && des) {
        if (!designationByDepartment[dept]) designationByDepartment[dept] = []
        if (!designationByDepartment[dept].includes(des)) designationByDepartment[dept].push(des)
      }
    }
    for (const k of Object.keys(designationByDepartment)) {
      designationByDepartment[k].sort((a, b) => a.localeCompare(b))
    }
    try {
      window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
    } catch {
      /* ignore */
    }
  }

  const updateUser = async (
    userId: string,
    patch: { status?: 'Active' | 'Inactive'; designation?: string; departmentName?: string },
  ) => {
    setUserUpdateError(null)
    setUserUpdateLoadingId(userId)

    setUsers((prev) =>
      prev.map((user) =>
        user.id !== userId
          ? user
          : {
              ...user,
              ...(patch.status !== undefined ? { status: patch.status } : {}),
              ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
              ...(patch.departmentName !== undefined ? { departmentName: patch.departmentName } : {}),
            },
      ),
    )

    try {
      const {
        data: { session: latestSession },
      } = await supabase.auth.getSession()

      const accessToken = latestSession?.access_token ?? session?.access_token
      if (!accessToken) {
        throw new Error('Session expired. Please log in again.')
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
          ...(patch.departmentName !== undefined ? { department_name: patch.departmentName } : {}),
        }),
      })

      const payload = (await response.json().catch(() => null)) as unknown
      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: unknown }).error)
            : `Update failed (${response.status})`
        throw new Error(message)
      }

      if (patch.designation) {
        await ensureLabMasterOptionByLabel('designation', patch.designation)
      }
      if (patch.departmentName) {
        await ensureLabMasterOptionByLabel('department', patch.departmentName)
      }
      await refreshLabOptions()
      await reloadUsers()
    } catch (err) {
      setUserUpdateError(err instanceof Error ? err.message : 'Unable to update user')
    } finally {
      setUserUpdateLoadingId(null)
    }
  }

  const persistUserLabOptions = async (formData: UserForm) => {
    if (formData.designation.trim()) {
      await ensureLabMasterOptionByLabel('designation', formData.designation)
    }
    if (formData.department.trim()) {
      await ensureLabMasterOptionByLabel('department', formData.department)
    }
    await refreshLabOptions()
  }

  return (
    <div className="p-6 space-y-5">
      <UserManagementHeaderBar
        userDialogOpen={userDialogOpen}
        setUserDialogOpen={setUserDialogOpen}
      />

      {usersLoadError && <p className="text-sm text-destructive">{usersLoadError}</p>}
      {userUpdateError && <p className="text-sm text-destructive">{userUpdateError}</p>}
      <UserManagementTable
        users={users}
        designations={designations}
        departments={departments}
        userUpdateLoadingId={userUpdateLoadingId}
        updateUser={updateUser}
        onEdit={(user: UserAccount) => {
          setEditTarget(user)
          setEditDialogOpen(true)
        }}
        onDelete={(user: UserAccount) => setUserDeleteTarget(user)}
      />

      <UserManagementForm
        mode="create"
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        designations={designations}
        setDesignations={setDesignations}
        departments={departments}
        setDepartments={setDepartments}
        onSave={async (formData: UserForm, countryCode?: string) => {
          await persistUserLabOptions(formData)

          const {
            data: { session: latestSession },
          } = await supabase.auth.getSession()

          const accessToken = latestSession?.access_token ?? session?.access_token
          if (!accessToken) {
            throw new Error('Session expired. Please log in again.')
          }

          const mobileFormatted = formatMobileForSave(formData.mobile, countryCode ?? '+91')

          const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              'x-user-jwt': accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: formData.email.trim(),
              password: formData.password.trim(),
              full_name: formData.name.trim(),
              mobile: mobileFormatted,
              designation: formData.designation,
              department_name: formData.department,
              status: formData.status,
            }),
          })

          const payload = (await response.json().catch(() => null)) as unknown
          if (!response.ok) {
            const message =
              typeof payload === 'object' && payload && 'error' in payload
                ? String((payload as { error?: unknown }).error)
                : `Edge Function returned ${response.status}`
            throw new Error(message)
          }

          await reloadUsers()
        }}
        onOptionsChanged={refreshLabOptions}
      />

      <UserManagementForm
        key={editTarget?.id || 'edit-placeholder'}
        mode="edit"
        open={editDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setEditDialogOpen(false)
            setEditTarget(null)
          }
        }}
        initialData={editTarget}
        designations={designations}
        setDesignations={setDesignations}
        departments={departments}
        setDepartments={setDepartments}
        onSave={async (formData: UserForm, countryCode?: string) => {
          if (!editTarget) return

          setUserUpdateError(null)
          setUserUpdateLoadingId(editTarget.id)

          await persistUserLabOptions(formData)

          const mobileFormatted = formatMobileForSave(formData.mobile, countryCode)

          try {
            const {
              data: { session: latestSession },
            } = await supabase.auth.getSession()

            const accessToken = latestSession?.access_token ?? session?.access_token
            if (!accessToken) {
              throw new Error('Session expired. Please log in again.')
            }

            const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

            const response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'x-user-jwt': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_id: editTarget.id,
                email: formData.email.trim(),
                full_name: formData.name.trim(),
                mobile: mobileFormatted,
                designation: formData.designation,
                department_name: formData.department,
                status: formData.status,
              }),
            })

            const payload = (await response.json().catch(() => null)) as unknown
            if (!response.ok) {
              const message =
                typeof payload === 'object' && payload && 'error' in payload
                  ? String((payload as { error?: unknown }).error)
                  : `Update failed (${response.status})`
              throw new Error(message)
            }
            if (
              typeof payload === 'object' &&
              payload &&
              'warning' in payload &&
              String((payload as { warning?: unknown }).warning ?? '').trim()
            ) {
              setUserUpdateError(String((payload as { warning?: unknown }).warning))
            }

            setEditDialogOpen(false)
            setEditTarget(null)
            await reloadUsers()
          } catch (err) {
            setUserUpdateError(err instanceof Error ? err.message : 'Unable to update user')
          } finally {
            setUserUpdateLoadingId(null)
          }
        }}
        onOptionsChanged={refreshLabOptions}
        loading={userUpdateLoadingId === editTarget?.id}
      />

      {userDeleteTarget && (
        <UserManagementForm
          mode="delete"
          open={!!userDeleteTarget}
          onOpenChange={(open: boolean) => !open && setUserDeleteTarget(null)}
          initialData={userDeleteTarget}
          designations={designations}
          setDesignations={setDesignations}
          departments={departments}
          setDepartments={setDepartments}
          onSave={async () => {
            if (!userDeleteTarget) return

            setUserUpdateError(null)
            setUserUpdateLoadingId(userDeleteTarget.id)

            try {
              const {
                data: { session: latestSession },
              } = await supabase.auth.getSession()

              const accessToken = latestSession?.access_token ?? session?.access_token
              if (!accessToken) {
                throw new Error('Session expired. Please log in again.')
              }

              const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`
              const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

              const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                  apikey: anonKey,
                  Authorization: `Bearer ${anonKey}`,
                  'x-user-jwt': accessToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userDeleteTarget.id }),
              })

              const payload = (await response.json().catch(() => null)) as unknown
              if (!response.ok) {
                const message =
                  typeof payload === 'object' && payload && 'error' in payload
                    ? String((payload as { error?: unknown }).error)
                    : `Delete failed (${response.status})`
                throw new Error(message)
              }

              setUserDeleteTarget(null)
              await reloadUsers()
            } catch (err) {
              setUserUpdateError(err instanceof Error ? err.message : 'Unable to delete user')
            } finally {
              setUserUpdateLoadingId(null)
            }
          }}
        />
      )}
    </div>
  )
}
