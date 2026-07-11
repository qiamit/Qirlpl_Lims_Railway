import { useEffect, useMemo, useState } from 'react'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'

export type SearchSelectOption = { id: string; label: string }

export function ResultValidationSearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Type to search…',
  disabled,
  listId,
  allowEmpty = true,
}: {
  value: string
  onValueChange: (id: string) => void
  options: SearchSelectOption[]
  placeholder?: string
  disabled?: boolean
  listId: string
  allowEmpty?: boolean
}) {
  const selected = options.find((o) => o.id === value)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? '')
    }
  }, [open, selected?.label])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = options.filter((o) => !q || o.label.toLowerCase().includes(q))
    if (!allowEmpty) return matched
    if (!q || '—'.includes(q)) {
      return [{ id: '', label: '—' }, ...matched]
    }
    return matched
  }, [allowEmpty, options, query])

  return (
    <FilterCombobox
      value={query}
      onValueChange={(next) => {
        setQuery(next)
        setOpen(true)
      }}
      options={filteredOptions}
      onSelectOption={(option) => {
        onValueChange(option.id)
        setQuery(option.id ? option.label : '')
        setOpen(false)
      }}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      disabled={disabled}
      listId={listId}
      onInputFocus={() => setOpen(true)}
    />
  )
}

export function ResultValidationYesNoSelect({
  value,
  onValueChange,
  listId,
}: {
  value: string
  onValueChange: (value: string) => void
  listId: string
}) {
  return (
    <ResultValidationSearchSelect
      value={value}
      onValueChange={onValueChange}
      options={[
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ]}
      placeholder="Type Yes or No…"
      listId={listId}
      allowEmpty
    />
  )
}
