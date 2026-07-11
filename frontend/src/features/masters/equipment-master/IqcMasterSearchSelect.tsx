import { useMemo, useState } from 'react'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'

type IqcMasterOption = {
  id: string
  equipment_name?: string | null
  asset_code?: string | null
}

export function IqcMasterSearchSelect({
  iqcMasters,
  selectedMasterIds,
  onSelectedMasterIdsChange,
  disabled,
}: {
  iqcMasters: IqcMasterOption[]
  selectedMasterIds: string[]
  onSelectedMasterIdsChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [open, setOpen] = useState(false)

  const options = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return iqcMasters
      .filter((master) => !selectedMasterIds.includes(master.id))
      .filter((master) => {
        if (!query) return true
        const name = (master.equipment_name ?? '').toLowerCase()
        const code = (master.asset_code ?? '').toLowerCase()
        return name.includes(query) || code.includes(query)
      })
      .map((master) => ({
        id: master.id,
        label: `${master.equipment_name ?? 'Unnamed'} (${master.asset_code ?? '-'})`,
      }))
  }, [iqcMasters, selectedMasterIds, searchQuery])

  return (
    <FilterCombobox
      value={searchQuery}
      onValueChange={(value) => {
        setSearchQuery(value)
        setOpen(true)
      }}
      options={options}
      onSelectOption={(option) => {
        if (!selectedMasterIds.includes(option.id)) {
          onSelectedMasterIdsChange([...selectedMasterIds, option.id])
        }
        setSearchQuery('')
        setOpen(false)
      }}
      open={open}
      onOpenChange={setOpen}
      placeholder={
        iqcMasters.length === 0 ? 'No IQC Masters found' : 'Type to search IQC master…'
      }
      disabled={disabled || iqcMasters.length === 0}
      inputClassName="h-9 text-xs"
      listId="iqc-master-search-list"
      onInputFocus={() => setOpen(true)}
    />
  )
}
