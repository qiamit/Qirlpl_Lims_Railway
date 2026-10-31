import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Atom, ExternalLink, RotateCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { EnvPanel, EnvSelect, envInputClass } from '@/features/environment/EnvironmentUi'
import { ElementDetailPanel } from './ElementDetailPanel'
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  ELEMENTS,
  PHASE_LABELS,
  PHASE_MARKERS,
  PHASE_STYLES,
  STP_TEMP_C,
  TEMP_MAX_C,
  TEMP_MIN_C,
  TEMP_UNIT_LABELS,
  celsiusToUnit,
  clampTempC,
  elementDetailUrl,
  findElementBySymbol,
  formatDensity,
  formatTemp,
  formatTempInUnit,
  getPhaseAtTemp,
  searchElements,
  unitToCelsius,
  type ElementCategory,
  type ElementPhase,
  type PeriodicElement,
  type TempUnit,
} from './periodicTable'
import './periodicTable.css'

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as ElementCategory[]
const PHASE_KEYS = Object.keys(PHASE_LABELS) as ElementPhase[]
const TEMP_UNITS: TempUnit[] = ['C', 'F', 'K']

/** Grid row 8 is a small gap between the main table and the f-block rows. */
function tileRow(gridRow: number): number {
  return gridRow >= 8 ? gridRow + 1 : gridRow
}

/** Phones get the full sheet straight away; the spotlight sits inside the wide grid. */
function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

/** Dark header bar shared by the table and the element page. */
export function PeriodicTableHeader({ subtitle, actions }: { subtitle?: string; actions?: ReactNode }) {
  return (
    <div className={limsPanelClass}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Atom className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                Metallurgy &amp; Metallography · Reference
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">Periodic Table</h1>
              {subtitle ? <p className="text-[11px] text-stone-300">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

function ElementTile({
  element,
  active,
  dimmed,
  tempC,
  onSelect,
  onOpen,
}: {
  element: PeriodicElement
  active: boolean
  dimmed: boolean
  tempC: number
  onSelect: (el: PeriodicElement) => void
  onOpen: (el: PeriodicElement) => void
}) {
  const phase = getPhaseAtTemp(element, tempC)
  const style = PHASE_STYLES[phase]

  return (
    <button
      type="button"
      className={cn('mg-pt-tile', active && 'mg-pt-tile-active', dimmed && 'mg-pt-tile-dimmed')}
      style={{
        backgroundColor: style.fill,
        borderColor: style.border,
        gridRow: tileRow(element.gridRow),
        gridColumn: element.gridCol,
      }}
      aria-pressed={active}
      aria-label={`${element.number} ${element.name}, ${PHASE_LABELS[phase].toLowerCase()} at ${formatTempInUnit(tempC, 'C')}`}
      title={`${element.number} ${element.name}: ${PHASE_LABELS[phase]} at ${formatTempInUnit(tempC, 'C')}`}
      onClick={() => onSelect(element)}
      onDoubleClick={() => onOpen(element)}
    >
      <span className="mg-pt-tile-number">{element.number}</span>
      <span className="mg-pt-tile-badge" style={{ borderColor: style.border }}>
        {PHASE_MARKERS[phase]}
      </span>
      <span className="mg-pt-tile-symbol">{element.symbol}</span>
      <span className="mg-pt-tile-name">{element.name}</span>
      <span className="mg-pt-tile-mass">{element.mass}</span>
      <span className="mg-pt-tile-meta">
        P{element.period} · G{element.group}
        {element.electronegativity !== null ? ` · χ${element.electronegativity}` : ''}
      </span>
    </button>
  )
}

/** Selected element, shown in the empty area above the transition metals (rows 1–3, columns 3–12). */
function ElementSpotlight({
  element,
  tempC,
  onOpenDetail,
}: {
  element: PeriodicElement
  tempC: number
  onOpenDetail: () => void
}) {
  const phase = getPhaseAtTemp(element, tempC)
  const style = PHASE_STYLES[phase]

  return (
    <div className="mg-pt-spotlight-slot" style={{ gridRow: '1 / 4', gridColumn: '3 / 13' }}>
      <div
        className="mg-pt-spotlight"
        style={{ backgroundColor: CATEGORY_COLORS[element.category], borderColor: style.border }}
        aria-live="polite"
      >
        <div className="mg-pt-spotlight-head">
          <div className="mg-pt-spotlight-identity">
            <span className="mg-pt-spotlight-number">{element.number}</span>
            <span className="mg-pt-spotlight-symbol">{element.symbol}</span>
            <span className="mg-pt-spotlight-name">{element.name}</span>
          </div>
          <span className="mg-pt-spotlight-phase" style={{ borderColor: style.border }}>
            <strong>{PHASE_MARKERS[phase]}</strong>
            {PHASE_LABELS[phase]}
          </span>
        </div>

        <dl className="mg-pt-spotlight-stats">
          <div className="mg-pt-spotlight-stat">
            <dt>Mass</dt>
            <dd>{element.mass}</dd>
          </div>
          <div className="mg-pt-spotlight-stat">
            <dt>Category</dt>
            <dd>{CATEGORY_LABELS[element.category]}</dd>
          </div>
          <div className="mg-pt-spotlight-stat">
            <dt>Density</dt>
            <dd>{formatDensity(element.density)}</dd>
          </div>
          <div className="mg-pt-spotlight-stat">
            <dt>Melts</dt>
            <dd>{formatTemp(element.meltingPointC)}</dd>
          </div>
          <div className="mg-pt-spotlight-stat">
            <dt>Boils</dt>
            <dd>{formatTemp(element.boilingPointC)}</dd>
          </div>
          <div className="mg-pt-spotlight-stat mg-pt-spotlight-stat-config">
            <dt>Configuration</dt>
            <dd>{element.electronConfiguration}</dd>
          </div>
        </dl>

        <button type="button" className="mg-pt-spotlight-cta" onClick={onOpenDetail}>
          Properties and metallurgy
        </button>
      </div>
    </div>
  )
}

/**
 * Interactive periodic table: search, category filter, temperature (°C / °F / K) that recolours the
 * tiles by phase, a spotlight for the selected element and the full sheet in a modal (Escape closes it).
 */
export function PeriodicTable({ initialTempC = STP_TEMP_C }: { initialTempC?: number }) {
  const [selected, setSelected] = useState<PeriodicElement | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ElementCategory | null>(null)
  const [tempC, setTempC] = useState(() => clampTempC(initialTempC))
  const [tempUnit, setTempUnit] = useState<TempUnit>('C')
  /** Text in the temperature box while typing ("-", "" …); null shows the current value. */
  const [tempDraft, setTempDraft] = useState<string | null>(null)

  const displayTemp = Math.round(celsiusToUnit(tempC, tempUnit) * 10) / 10
  const sliderMin = Math.ceil(celsiusToUnit(TEMP_MIN_C, tempUnit))
  const sliderMax = Math.floor(celsiusToUnit(TEMP_MAX_C, tempUnit))

  const matches = useMemo(() => new Set(searchElements(search).map((el) => el.number)), [search])
  const hasFilter = search.trim().length > 0 || categoryFilter !== null

  const matchCount = useMemo(
    () =>
      ELEMENTS.filter(
        (el) => (!categoryFilter || el.category === categoryFilter) && (!search.trim() || matches.has(el.number)),
      ).length,
    [categoryFilter, matches, search],
  )

  function isDimmed(el: PeriodicElement): boolean {
    if (categoryFilter && el.category !== categoryFilter) return true
    if (search.trim() && !matches.has(el.number)) return true
    return false
  }

  function selectElement(el: PeriodicElement) {
    setSelected(el)
    setDetailOpen(isPhoneWidth())
  }

  function openElement(el: PeriodicElement) {
    setSelected(el)
    setDetailOpen(true)
  }

  function onSearchChange(value: string) {
    setSearch(value)
    // An exact symbol or atomic number ("Fe", "26"), or a single hit: select it so the spotlight follows.
    const q = value.trim()
    if (!q) return
    const exact = findElementBySymbol(q) ?? ELEMENTS.find((el) => String(el.number) === q) ?? null
    const found = exact ? [exact] : searchElements(q)
    if (found.length === 1) setSelected(found[0])
  }

  function onTempTyped(value: string) {
    setTempDraft(value)
    const n = Number(value)
    if (value.trim() !== '' && Number.isFinite(n)) setTempC(clampTempC(unitToCelsius(n, tempUnit)))
  }

  function onSliderChange(value: number) {
    setTempDraft(null)
    setTempC(clampTempC(unitToCelsius(value, tempUnit)))
  }

  function resetTemp() {
    setTempDraft(null)
    setTempC(STP_TEMP_C)
  }

  return (
    <>
      <EnvPanel
        title="Elements"
        right={
          <span className="text-[11px] font-semibold text-stone-300" aria-live="polite">
            {hasFilter ? `${matchCount} of ${ELEMENTS.length} match` : `${ELEMENTS.length} elements`}
          </span>
        }
      >
        <div className="space-y-2">
          {/* Search and category */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500"
                aria-hidden
              />
              <Input
                type="search"
                aria-label="Search elements"
                placeholder="Name, symbol or atomic number"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className={cn(envInputClass, 'pl-8 pr-8')}
              />
              {search ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-stone-500 hover:text-stone-800"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <EnvSelect
              ariaLabel="Category"
              value={categoryFilter ?? ''}
              onChange={(v) => setCategoryFilter(v ? (v as ElementCategory) : null)}
              className="w-full basis-48 sm:w-56"
            >
              <option value="">All categories</option>
              {CATEGORY_KEYS.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </EnvSelect>
            {hasFilter ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={limsOutlineBtnClass}
                onClick={() => {
                  setSearch('')
                  setCategoryFilter(null)
                }}
              >
                <X /> Clear filters
              </Button>
            ) : null}
          </div>

          {/* Temperature */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-stone-300 py-2">
            <label
              htmlFor="mg-pt-temp-slider"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700"
            >
              Temperature
            </label>
            <input
              id="mg-pt-temp-slider"
              type="range"
              className="mg-pt-temp-slider"
              min={sliderMin}
              max={sliderMax}
              step={1}
              value={Math.min(sliderMax, Math.max(sliderMin, Math.round(displayTemp)))}
              onChange={(e) => onSliderChange(Number(e.target.value))}
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                aria-label={`Temperature in ${TEMP_UNIT_LABELS[tempUnit]}`}
                value={tempDraft ?? String(displayTemp)}
                onChange={(e) => onTempTyped(e.target.value)}
                onBlur={() => setTempDraft(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={cn(envInputClass, 'w-24 font-semibold tabular-nums')}
              />
              <EnvSelect
                ariaLabel="Temperature unit"
                value={tempUnit}
                onChange={(v) => {
                  setTempDraft(null)
                  setTempUnit(v as TempUnit)
                }}
                className="w-20"
              >
                {TEMP_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {TEMP_UNIT_LABELS[u]}
                  </option>
                ))}
              </EnvSelect>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={limsOutlineBtnClass}
                onClick={resetTemp}
                disabled={tempC === STP_TEMP_C}
                title={`Back to room temperature (${STP_TEMP_C} °C)`}
              >
                <RotateCcw /> {STP_TEMP_C} °C
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:ml-auto" role="group" aria-label="Phase colours">
              {PHASE_KEYS.map((phase) => (
                <span key={phase} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-stone-700">
                  <span
                    className="mg-pt-legend-swatch"
                    style={{ borderColor: PHASE_STYLES[phase].border, backgroundColor: PHASE_STYLES[phase].fill }}
                    aria-hidden
                  />
                  {PHASE_LABELS[phase]} ({PHASE_MARKERS[phase]})
                </span>
              ))}
            </div>
          </div>

          {/* Grid: scrolls sideways on narrow screens */}
          <div className="overflow-x-auto pb-1">
            <div className="mg-pt-grid">
              <div className="mg-pt-series-label" style={{ gridRow: 6, gridColumn: 3 }}>
                57–71
              </div>
              <div className="mg-pt-series-label" style={{ gridRow: 7, gridColumn: 3 }}>
                89–103
              </div>

              {selected ? (
                <ElementSpotlight element={selected} tempC={tempC} onOpenDetail={() => setDetailOpen(true)} />
              ) : null}

              {ELEMENTS.map((el) => (
                <ElementTile
                  key={el.number}
                  element={el}
                  active={selected?.number === el.number}
                  dimmed={isDimmed(el)}
                  tempC={tempC}
                  onSelect={selectElement}
                  onOpen={openElement}
                />
              ))}
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-stone-600">
            Click an element to see it above the table, then &ldquo;Properties and metallurgy&rdquo; (or double-click)
            for the full sheet. Phases are worked out from the melting and boiling points at normal pressure.
            Reference only; not used in any result.
          </p>
        </div>
      </EnvPanel>

      <Dialog open={detailOpen && selected !== null} onOpenChange={setDetailOpen}>
        {selected ? (
          <DialogContent className={cn(limsDialogClass, 'max-w-4xl overflow-y-auto')}>
            <DialogTitle className="sr-only">
              {selected.name} ({selected.symbol})
            </DialogTitle>
            <DialogDescription className="sr-only">
              Properties and metallurgy notes at {formatTempInUnit(tempC, 'C')}.
            </DialogDescription>
            <ElementDetailPanel element={selected} tempC={tempC} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-stone-700 bg-stone-800 px-3 py-2">
              <Button asChild size="sm" className={limsDarkBarBtnClass}>
                <Link to={elementDetailUrl(selected, tempC)}>
                  <ExternalLink /> Open as page
                </Link>
              </Button>
              <DialogClose asChild>
                <Button type="button" size="sm" className={limsDarkBarBtnClass}>
                  Close
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
