import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Option {
  id: string
  company_name: string
}

export function ClientSearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select client...',
  onAddNewClientClick,
}: {
  value: string | null
  onValueChange: (val: string) => void
  options: Option[]
  placeholder?: string
  onAddNewClientClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.id === value)
  const displayValue = selectedOption ? selectedOption.company_name : ''

  useEffect(() => {
    if (!open) {
      setSearchQuery(displayValue)
      setHighlightIndex(-1)
    }
  }, [value, open, displayValue])

  const filteredOptions = options.filter((opt) =>
    opt.company_name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  useEffect(() => {
    setHighlightIndex((current) => {
      if (filteredOptions.length === 0) return -1
      if (current < 0) return current
      return Math.min(current, filteredOptions.length - 1)
    })
  }, [filteredOptions.length])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectOption = (opt: Option) => {
    onValueChange(opt.id)
    setSearchQuery(opt.company_name)
    setOpen(false)
    setHighlightIndex(-1)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (filteredOptions.length === 0) return
      setHighlightIndex((current) => (current < 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1)))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open || filteredOptions.length === 0) return
      setHighlightIndex((current) => (current <= 0 ? 0 : current - 1))
      return
    }

    if (e.key === 'Enter') {
      if (!open || filteredOptions.length === 0) return
      e.preventDefault()
      selectOption(filteredOptions[highlightIndex >= 0 ? highlightIndex : 0])
      return
    }

    if (e.key === 'Escape') {
      if (!open) return
      e.preventDefault()
      setOpen(false)
      setHighlightIndex(-1)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setOpen(true)
            setHighlightIndex(-1)
          }}
          onFocus={() => {
            setOpen(true)
            setSearchQuery('')
            setHighlightIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          className="pr-10"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground">
          <ChevronsUpDown size={16} />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border text-popover-foreground border-border rounded-md shadow-md max-h-60 overflow-y-auto bg-white dark:bg-slate-950">
          {onAddNewClientClick && (
            <button
              type="button"
              onClick={() => {
                onAddNewClientClick()
                setOpen(false)
              }}
              className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-primary border-b border-border hover:bg-slate-100 dark:hover:bg-slate-900 text-left cursor-pointer transition-colors"
            >
              <Plus size={14} />
              Add New Client
            </button>
          )}
          <div className="py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                No clients found
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectOption(opt)}
                    className={cn(
                      'flex items-center justify-between w-full px-3 py-2 text-xs text-left cursor-pointer transition-colors',
                      highlightIndex === index
                        ? 'bg-slate-100 dark:bg-slate-900 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-900',
                    )}
                  >
                    <span className="truncate">{opt.company_name}</span>
                    {isSelected && <Check size={14} className="text-primary flex-shrink-0 ml-2" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
