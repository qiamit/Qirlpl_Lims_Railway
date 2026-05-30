import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { UserManagementHeaderBar } from './UserManagementHeaderBar'
import { UserManagementTable } from './UserManagementTable'
import { UserManagementForm } from './UserManagementForm'
import type { UserAccount, UserForm } from './types'

export default function UserManagementMasterPage() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null)
  const [userUpdateLoadingId, setUserUpdateLoadingId] = useState<string | null>(null)
  const [userUpdateError, setUserUpdateError] = useState<string | null>(null)
  const [passwordResetLoadingId, setPasswordResetLoadingId] = useState<string | null>(null)
  const [passwordResetMessage, setPasswordResetMessage] = useState<string | null>(null)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserAccount | null>(null)
  const [userDeleteTarget, setUserDeleteTarget] = useState<UserAccount | null>(null)

  const [designations, setDesignations] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem('userManagement.departments')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : []
  })

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

      const uniqueDesignations = Array.from(
        new Set(
          mapped
            .map((u) => u.designation)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => d.trim()),
        ),
      ).sort((a, b) => a.localeCompare(b))

      setDesignations((prev) => (uniqueDesignations.length > 0 ? uniqueDesignations : prev))
      if (uniqueDesignations.length > 0) {
        try {
          window.localStorage.setItem('userManagement.designations', JSON.stringify(uniqueDesignations))
        } catch {
          /* ignore */
        }
      }

      const uniqueDepartments = Array.from(
        new Set(
          mapped
            .map((u) => u.departmentName)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => d.trim()),
        ),
      ).sort((a, b) => a.localeCompare(b))

      setDepartments((prev) => {
        const merged = Array.from(new Set([...(prev ?? []), ...uniqueDepartments]))
          .map((d) => d.trim())
          .filter((d) => d.length > 0)
          .sort((a, b) => a.localeCompare(b))
        window.localStorage.setItem('userManagement.departments', JSON.stringify(merged))
        return merged
      })

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

    const uniqueDesignations = Array.from(
      new Set(
        mapped
          .map((u) => u.designation)
          .filter((d) => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim()),
      ),
    ).sort((a, b) => a.localeCompare(b))

    setDesignations(uniqueDesignations)
    if (uniqueDesignations.length > 0) {
      try {
        window.localStorage.setItem('userManagement.designations', JSON.stringify(uniqueDesignations))
      } catch {
        /* ignore */
      }
    }

    const uniqueDepartments = Array.from(
      new Set(
        mapped
          .map((u) => u.departmentName)
          .filter((d) => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim()),
      ),
    ).sort((a, b) => a.localeCompare(b))

    setDepartments((prev) => {
      const merged = Array.from(new Set([...(prev ?? []), ...uniqueDepartments]))
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
        .sort((a, b) => a.localeCompare(b))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('userManagement.departments', JSON.stringify(merged))
      }
      return merged
    })

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

      await reloadUsers()
    } catch (err) {
      setUserUpdateError(err instanceof Error ? err.message : 'Unable to update user')
    } finally {
      setUserUpdateLoadingId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <UserManagementHeaderBar
        userDialogOpen={userDialogOpen}
        setUserDialogOpen={setUserDialogOpen}
      />

      {usersLoadError && <p className="text-sm text-destructive">{usersLoadError}</p>}
      {userUpdateError && <p className="text-sm text-destructive">{userUpdateError}</p>}
      {passwordResetMessage && (
        <p className={passwordResetMessage.toLowerCase().includes('sent') ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
          {passwordResetMessage}
        </p>
      )}

      <UserManagementTable
        users={users}
        designations={designations}
        departments={departments}
        userUpdateLoadingId={userUpdateLoadingId}
        passwordResetLoadingId={passwordResetLoadingId}
        updateUser={updateUser}
        onEdit={(user: UserAccount) => {
          setEditTarget(user)
          setEditDialogOpen(true)
        }}
        onDelete={(user: UserAccount) => setUserDeleteTarget(user)}
        onResetPassword={(user: UserAccount) => {
          if (!user?.email) {
            setPasswordResetMessage('Missing email for the selected user.')
            return
          }

          void (async () => {
            setPasswordResetMessage(null)
            setPasswordResetLoadingId(user.id)

            try {
              const {
                data: { session: latestSession },
              } = await supabase.auth.getSession()

              const accessToken = latestSession?.access_token ?? session?.access_token
              if (!accessToken) {
                throw new Error('Session expired. Please log in again.')
              }

              const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-password`
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
                  email: user.email,
                  redirect_to: `${window.location.origin}/auth`,
                }),
              })

              const payload = (await response.json().catch(() => null)) as unknown
              if (!response.ok) {
                const message =
                  typeof payload === 'object' && payload && 'error' in payload
                    ? String((payload as { error?: unknown }).error)
                    : `Reset password failed (${response.status})`
                throw new Error(message)
              }

              setPasswordResetMessage(`Password reset email sent to ${user.email}.`)
            } catch (err) {
              setPasswordResetMessage(err instanceof Error ? err.message : 'Unable to reset password')
            } finally {
              setPasswordResetLoadingId(null)
            }
          })()
        }}
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
          const {
            data: { session: latestSession },
          } = await supabase.auth.getSession()

          const accessToken = latestSession?.access_token ?? session?.access_token
          if (!accessToken) {
            throw new Error('Session expired. Please log in again.')
          }

          const mobileFormatted = `${countryCode} ${formData.mobile.trim()}`

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

          setDepartments((prev) => {
            if (!formData.department.trim()) return prev
            if (prev.some((item) => item.toLowerCase() === formData.department.toLowerCase())) return prev
            const next = [...prev, formData.department]
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
            }
            return next
          })

          await reloadUsers()
        }}
      />

      <UserManagementForm
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
        onSave={async (formData: UserForm) => {
          if (!editTarget) return

          setUserUpdateError(null)
          setUserUpdateLoadingId(editTarget.id)

          setDepartments((prev) => {
            if (!formData.department.trim()) return prev
            if (prev.some((item) => item.toLowerCase() === formData.department.toLowerCase())) return prev
            const next = [...prev, formData.department]
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
            }
            return next
          })

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
                mobile: formData.mobile.trim(),
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

            setEditDialogOpen(false)
            setEditTarget(null)
            await reloadUsers()
          } catch (err) {
            setUserUpdateError(err instanceof Error ? err.message : 'Unable to update user')
          } finally {
            setUserUpdateLoadingId(null)
          }
        }}
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
