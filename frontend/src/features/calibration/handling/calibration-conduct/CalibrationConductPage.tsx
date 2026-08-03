import { Navigate } from 'react-router-dom'

/** Legacy route — redirect to Inside conduct. */
export default function CalibrationConductPage() {
  return <Navigate to="/calibration/handling/calibration-conduct-inside" replace />
}
