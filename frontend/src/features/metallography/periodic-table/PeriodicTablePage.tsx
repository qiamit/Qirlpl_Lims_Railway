import { useSearchParams } from 'react-router-dom'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { PeriodicTable, PeriodicTableHeader } from './PeriodicTableView'
import { parseTempParam } from './periodicTable'

/** S6 Periodic Table (`/metallography/periodic-table`, optional `?temp=` °C, default 27 °C). Static reference; no database. */
export default function PeriodicTablePage() {
  const [searchParams] = useSearchParams()
  const initialTempC = parseTempParam(searchParams.get('temp'))

  return (
    <div className={limsPageShellClass}>
      <PeriodicTableHeader subtitle="Elements, phases at a set temperature and metallurgy notes." />
      {/* key: a new ?temp (e.g. back from an element page) starts the table at that temperature. */}
      <PeriodicTable key={initialTempC} initialTempC={initialTempC} />
    </div>
  )
}
