import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsFieldClass } from '@/lib/limsThemeUi'

/** 6-digit authenticator code input. */
export function MfaCodeField({
  id,
  value,
  onChange,
  onEnter,
  disabled,
  autoFocus = true,
  label = 'Authenticator code',
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  disabled?: boolean
  autoFocus?: boolean
  label?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder="123456"
        className={`${limsFieldClass} font-mono tracking-[0.3em]`}
        disabled={disabled}
      />
    </div>
  )
}
