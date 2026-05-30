import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TestParameterHeaderBar({
  title = 'Test Parameter',
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
}: {
  title?: string
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (value: number) => void
  onNew: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">{title}</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end">
        <Button type="button" className="gap-2" onClick={onNew}>
          <Plus size={16} />
          Add New Test Parameter
        </Button>
      </div>
    </div>
  )
}
