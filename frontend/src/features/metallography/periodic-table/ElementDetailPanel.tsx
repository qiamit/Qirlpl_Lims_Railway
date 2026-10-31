import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  formatDensity,
  formatTemp,
  formatTempInUnit,
  getMaterialClass,
  getPhaseAtTemp,
  getPhaseTransitionNote,
  isMetalCategory,
  PHASE_LABELS,
  PHASE_STYLES,
  type PeriodicElement,
} from './periodicTable'
import './periodicTable.css'

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mg-pt-detail-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function DetailSection({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={cn('mg-pt-detail-section', wide && 'mg-pt-detail-section-wide')}>
      <h3 className="mg-pt-detail-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** All sections of the element sheet: phase at the set temperature, classification, properties, metallurgy. */
export function ElementDetailBody({ element, tempC }: { element: PeriodicElement; tempC: number }) {
  const phase = getPhaseAtTemp(element, tempC)
  const transitionNote = getPhaseTransitionNote(element, tempC)

  return (
    <div className="mg-pt-detail-sections">
      <DetailSection title="Temperature and phase" wide>
        <p className="mg-pt-detail-phase-note" style={{ borderLeftColor: PHASE_STYLES[phase].border }}>
          {transitionNote}
        </p>
        <dl className="mg-pt-detail-facts mg-pt-detail-facts-3">
          <DetailFact label="Set temperature" value={formatTempInUnit(tempC, 'C')} />
          <DetailFact label="Phase at set temperature" value={PHASE_LABELS[phase]} />
          <DetailFact label="Phase at room temperature" value={PHASE_LABELS[element.phase]} />
        </dl>
      </DetailSection>

      <DetailSection title="Metallurgy and materials" wide>
        <p className="mg-pt-detail-prose">{element.metallurgyNote}</p>
        {isMetalCategory(element.category) ? <p className="mg-pt-detail-prose">{transitionNote}</p> : null}
      </DetailSection>

      <DetailSection title="Classification">
        <dl className="mg-pt-detail-facts">
          <DetailFact label="Category" value={CATEGORY_LABELS[element.category]} />
          <DetailFact label="Material class" value={getMaterialClass(element.category)} />
          <DetailFact label="Block" value={`${element.block.toUpperCase()}-block`} />
          <DetailFact label="Atomic number" value={String(element.number)} />
          <DetailFact label="Period" value={String(element.period)} />
          <DetailFact label="Group" value={String(element.group)} />
        </dl>
      </DetailSection>

      <DetailSection title="Physical properties">
        <dl className="mg-pt-detail-facts">
          <DetailFact label="Atomic mass" value={element.mass} />
          <DetailFact label="Density" value={formatDensity(element.density)} />
          <DetailFact label="Melting point" value={formatTemp(element.meltingPointC)} />
          <DetailFact label="Boiling point" value={formatTemp(element.boilingPointC)} />
        </dl>
      </DetailSection>

      <DetailSection title="Chemical and electronic">
        <dl className="mg-pt-detail-facts">
          <DetailFact
            label="Electronegativity (Pauling)"
            value={element.electronegativity !== null ? String(element.electronegativity) : '—'}
          />
          <DetailFact label="Electron configuration" value={element.electronConfiguration} />
        </dl>
      </DetailSection>

      <DetailSection title="Discovery">
        <dl className="mg-pt-detail-facts">
          <DetailFact label="Discovered" value={element.discovered} />
          <DetailFact label="Symbol" value={element.symbol} />
        </dl>
      </DetailSection>
    </div>
  )
}

/** Element sheet with a hero coloured by category. Used in the table's modal and on the element page. */
export function ElementDetailPanel({
  element,
  tempC,
  titleId,
}: {
  element: PeriodicElement
  tempC: number
  /** id for the name heading (aria-labelledby on a surrounding dialog or page). */
  titleId?: string
}) {
  const phase = getPhaseAtTemp(element, tempC)

  return (
    <div className="mg-pt-detail">
      <header className="mg-pt-detail-hero" style={{ backgroundColor: CATEGORY_COLORS[element.category] }}>
        <div className="mg-pt-detail-hero-main">
          <span className="mg-pt-detail-number" aria-label={`Atomic number ${element.number}`}>
            {element.number}
          </span>
          <div>
            <div className="mg-pt-detail-symbol" aria-hidden>
              {element.symbol}
            </div>
            <h2 id={titleId} className="mg-pt-detail-name">
              {element.name} <span className="sr-only">({element.symbol})</span>
            </h2>
          </div>
        </div>
        <div className="mg-pt-detail-hero-meta">
          <span className="mg-pt-detail-chip">{CATEGORY_LABELS[element.category]}</span>
          <span className="mg-pt-detail-chip" style={{ borderColor: PHASE_STYLES[phase].border }}>
            {PHASE_LABELS[phase]} at {formatTempInUnit(tempC, 'C')}
          </span>
        </div>
      </header>

      <div className="mg-pt-detail-body">
        <ElementDetailBody element={element} tempC={tempC} />
      </div>
    </div>
  )
}
