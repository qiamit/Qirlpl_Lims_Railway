import { KeyRound, Smartphone } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { openAccountDialog } from '@/lib/accountDialogs'
import { isMfaMarkedUnavailable } from '@/lib/mfa'

/** "Change password" and "Two-step verification" entries for the profile menu. */
export function AccountSecurityMenuItems() {
  const mfaUnavailable = isMfaMarkedUnavailable()
  return (
    <>
      <DropdownMenuItem onSelect={() => openAccountDialog('change-password')} className="flex items-center gap-2">
        <KeyRound size={14} />
        Change password
      </DropdownMenuItem>
      {mfaUnavailable ? null : (
        <DropdownMenuItem onSelect={() => openAccountDialog('two-step')} className="flex items-center gap-2">
          <Smartphone size={14} />
          Two-step verification
        </DropdownMenuItem>
      )}
    </>
  )
}
