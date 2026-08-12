-- Allow richer physical-condition values on SRF (Details + office-use field).

ALTER TABLE public.calibration_service_requests
  DROP CONSTRAINT IF EXISTS calibration_service_requests_physical_condition_check;

ALTER TABLE public.calibration_service_requests
  ADD CONSTRAINT calibration_service_requests_physical_condition_check
  CHECK (
    physical_condition IS NULL
    OR physical_condition IN (
      'Ok',
      'Good',
      'Satisfactory',
      'Fair',
      'Damaged',
      'Needs Repair',
      'Not Ok'
    )
  );
