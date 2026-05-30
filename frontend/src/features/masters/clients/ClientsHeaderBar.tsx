import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ClientsHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">Client Directory</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 / page</SelectItem>
              <SelectItem value="10">10 / page</SelectItem>
              <SelectItem value="20">20 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" asChild>
            <a href="https://services.gst.gov.in/services/searchtp" target="_blank" rel="noreferrer">
              Verify GST Number
            </a>
          </Button>
          <Button type="button" className="gap-2" onClick={onNew}>
            <Plus size={16} />
            Add New Client
          </Button>
        </div>
      </div>
    </div>
  )
}
