import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type FilterComboboxOption = { id: string; label: string }

export type FilterComboboxExtraAction = {
  key: string
  label: string
  onSelect: () => void
  className?: string
}

type DropdownPlacement = 'auto' | 'top' | 'bottom'

type DropdownPosition = {
  left: number
  width: number
  top?: number
  bottom?: number
}

/** Portaled list — Dialog must ignore pointer/focus outside for this. */
export const FILTER_COMBOBOX_DROPDOWN_ATTR = 'data-filter-combobox-dropdown'

export function isFilterComboboxDropdownTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${FILTER_COMBOBOX_DROPDOWN_ATTR}]`))
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
  inputId,
  listId,
  disabled,
  dropdownPlacement = 'auto',
  onInputFocus,
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
  /** Lets a sibling <Label htmlFor> point at the inner input. */
  inputId?: string
  listId?: string
  disabled?: boolean
  dropdownPlacement?: DropdownPlacement
  onInputFocus?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectingRef = useRef(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null)
  const optionListId = listId ?? 'filter-combobox-list'

  const itemCount = options.length + extraActions.length
  const showList = open
  const showOptions = itemCount > 0

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

  const updateDropdownPosition = () => {
    const input = inputRef.current
    if (!input) return

    const rect = input.getBoundingClientRect()
    const estimatedHeight = Math.min(itemCount * 36, 192)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp =
      dropdownPlacement === 'top' ||
      (dropdownPlacement === 'auto' && spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow)

    setDropdownPosition(
      openUp
        ? {
            left: rect.left,
            width: rect.width,
            bottom: window.innerHeight - rect.top + 4,
          }
        : {
            left: rect.left,
            width: rect.width,
            top: rect.bottom + 4,
          },
    )
  }

  useLayoutEffect(() => {
    if (!showList) {
      setDropdownPosition(null)
      return
    }

    updateDropdownPosition()

    const handleReposition = () => updateDropdownPosition()
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [showList, itemCount, dropdownPlacement, value])

  const selectIndex = (index: number) => {
    if (index < 0) return
    selectingRef.current = true
    try {
      if (index < options.length) {
        const selected = options[index]
        onValueChange(selected.label)
        onSelectOption(selected)
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
    } finally {
      window.setTimeout(() => {
        selectingRef.current = false
      }, 0)
    }
  }

  const handleOptionPointerDown = (index: number) => (e: PointerEvent) => {
    // Prevent input blur + stop Dialog/DismissableLayer from treating portal click as "outside"
    e.preventDefault()
    e.stopPropagation()
    selectIndex(index)
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
      if (!open || itemCount === 0) return
      e.preventDefault()
      selectIndex(highlightIndex >= 0 ? highlightIndex : 0)
      return
    }

    if (e.key === 'Escape') {
      if (!open) return
      e.preventDefault()
      onOpenChange(false)
      setHighlightIndex(-1)
    }
  }

  const dropdownList = showList && dropdownPosition ? (
    <div
      {...{ [FILTER_COMBOBOX_DROPDOWN_ATTR]: '' }}
      className="fixed z-[200] rounded-md border border-border bg-popover shadow-lg"
      style={{
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        top: dropdownPosition.top,
        bottom: dropdownPosition.bottom,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ul id={optionListId} role="listbox" className="max-h-48 overflow-auto text-sm">
        {showOptions ? (
          <>
            {options.map((opt, index) => (
              <li key={opt.id} role="presentation">
                <button
                  id={`${optionListId}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={highlightIndex === index}
                  className={cn(
                    'w-full px-3 py-2 text-left',
                    highlightIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                  )}
                  onPointerDown={handleOptionPointerDown(index)}
                  onMouseEnter={() => setHighlightIndex(index)}
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
                    tabIndex={-1}
                    aria-selected={highlightIndex === index}
                    className={cn(
                      'w-full px-3 py-2 text-left text-primary',
                      highlightIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                      action.className,
                    )}
                    onPointerDown={handleOptionPointerDown(index)}
                    onMouseEnter={() => setHighlightIndex(index)}
                  >
                    {action.label}
                  </button>
                </li>
              )
            })}
          </>
        ) : (
          <li className="px-3 py-2 text-sm text-muted-foreground">No results found</li>
        )}
      </ul>
    </div>
  ) : null

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={inputRef}
        id={inputId}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onValueChange(e.target.value)
          onOpenChange(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => {
          onInputFocus?.()
          onOpenChange(true)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (selectingRef.current) return
            onOpenChange(false)
          }, 150)
        }}
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
      {dropdownList ? createPortal(dropdownList, document.body) : null}
    </div>
  )
}
