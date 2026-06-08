import { useEffect, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type FilterComboboxOption = { id: string; label: string }

export type FilterComboboxExtraAction = {
  key: string
  label: string
  onSelect: () => void
  className?: string
}

export function FilterCombobox({
  value,
  onValueChange,
  options,
  onSelectOption,
  open,
  onOpenChange,
  placeholder,
  extraActions = [],
  className,
  inputClassName,
  listId,
  disabled,
}: {
  value: string
  onValueChange: (value: string) => void
  options: FilterComboboxOption[]
  onSelectOption: (option: FilterComboboxOption) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  placeholder?: string
  extraActions?: FilterComboboxExtraAction[]
  className?: string
  inputClassName?: string
  listId?: string
  disabled?: boolean
}) {
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const optionListId = listId ?? 'filter-combobox-list'

  const itemCount = options.length + extraActions.length
  const showList = open && itemCount > 0

  useEffect(() => {
    if (!open) {
      setHighlightIndex(-1)
    }
  }, [open])

  useEffect(() => {
    setHighlightIndex((current) => {
      if (itemCount === 0) return -1
      if (current < 0) return current
      return Math.min(current, itemCount - 1)
    })
  }, [itemCount])

  const selectIndex = (index: number) => {
    if (index < 0) return
    if (index < options.length) {
      onSelectOption(options[index])
      onOpenChange(false)
      setHighlightIndex(-1)
      return
    }
    const extra = extraActions[index - options.length]
    if (extra) {
      extra.onSelect()
      onOpenChange(false)
      setHighlightIndex(-1)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) onOpenChange(true)
      if (itemCount === 0) return
      setHighlightIndex((current) => (current < 0 ? 0 : Math.min(current + 1, itemCount - 1)))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open || itemCount === 0) return
      setHighlightIndex((current) => (current <= 0 ? 0 : current - 1))
      return
    }

    if (e.key === 'Enter') {
      if (!open || highlightIndex < 0) return
      e.preventDefault()
      selectIndex(highlightIndex)
      return
    }

    if (e.key === 'Escape') {
      if (!open) return
      e.preventDefault()
      onOpenChange(false)
      setHighlightIndex(-1)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onValueChange(e.target.value)
          onOpenChange(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => onOpenChange(true)}
        onBlur={() => setTimeout(() => onOpenChange(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? optionListId : undefined}
        aria-activedescendant={
          showList && highlightIndex >= 0 ? `${optionListId}-option-${highlightIndex}` : undefined
        }
      />
      {showList && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <ul id={optionListId} role="listbox" className="max-h-48 overflow-auto text-sm">
            {options.map((opt, index) => (
              <li key={opt.id} role="presentation">
                <button
                  id={`${optionListId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={highlightIndex === index}
                  className={cn(
                    'w-full px-3 py-2 text-left',
                    highlightIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => selectIndex(index)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
            {extraActions.map((action, actionIndex) => {
              const index = options.length + actionIndex
              return (
                <li key={action.key} role="presentation">
                  <button
                    id={`${optionListId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={highlightIndex === index}
                    className={cn(
                      'w-full px-3 py-2 text-left text-primary',
                      highlightIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                      action.className,
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectIndex(index)}
                  >
                    {action.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
