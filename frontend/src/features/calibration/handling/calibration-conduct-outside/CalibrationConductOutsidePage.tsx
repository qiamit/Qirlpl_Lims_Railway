import { CalibrationJobStageMasterPage } from '../jobs/CalibrationJobStageMasterPage'

export default function CalibrationConductOutsidePage() {
  return (
    <CalibrationJobStageMasterPage
      stage="calibration_conduct"
      locationFilter="On Site"
      titleOverride="Calibration Conduct Outside"
    />
  )
}
