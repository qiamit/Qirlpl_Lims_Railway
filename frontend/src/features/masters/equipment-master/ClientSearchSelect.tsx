import { useState, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Option {
  id: string
  company_name: string
}

export function ClientSearchSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select client...",
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
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.id === value)
  const displayValue = selectedOption ? selectedOption.company_name : ''

  useEffect(() => {
    if (!open) {
      setSearchQuery(displayValue)
    }
  }, [value, open, displayValue])

  const filteredOptions = options.filter((opt) =>
    opt.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setSearchQuery('')
          }}
          className="pr-10"
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
              filteredOptions.map((opt) => {
                const isSelected = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onValueChange(opt.id)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-900 text-left cursor-pointer transition-colors"
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
