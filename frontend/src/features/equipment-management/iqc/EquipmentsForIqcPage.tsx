import EquipmentsForIqcMasterPage from './EquipmentsForIqcMasterPage'

/** Unified Testing + Calibration IQC under Equipment Management (single list, no tabs). */
export default function EquipmentsForIqcPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <EquipmentsForIqcMasterPage />
      </div>
    </div>
  )
}
