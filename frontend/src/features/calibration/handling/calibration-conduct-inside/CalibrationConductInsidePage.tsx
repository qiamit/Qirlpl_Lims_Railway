import { CalibrationJobStageMasterPage } from '../jobs/CalibrationJobStageMasterPage'

export default function CalibrationConductInsidePage() {
  return (
    <CalibrationJobStageMasterPage
      stage="calibration_conduct"
      locationFilter="In Lab"
      titleOverride="Calibration Conduct Inside"
    />
  )
}
