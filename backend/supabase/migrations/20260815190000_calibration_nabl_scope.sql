-- Calibration NABL Scope of Accreditation (ISO/IEC 17025 / NABL calibration fields)
-- Columns align with NABL "2.2 Scope of Accreditation" guidance for calibration.

CREATE TABLE IF NOT EXISTS public.calibration_nabl_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  s_no integer NOT NULL,
  measurand text NOT NULL,
  calibration_method text NOT NULL,
  measurement_range text NOT NULL DEFAULT '',
  cmc text NOT NULL DEFAULT '',
  facility_type text NOT NULL DEFAULT 'Permanent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_nabl_scope_s_no_key UNIQUE (s_no),
  CONSTRAINT calibration_nabl_scope_facility_type_check CHECK (
    facility_type = ANY (
      ARRAY[
        'Permanent'::text,
        'Site'::text,
        'Mobile'::text,
        'Permanent Site facility'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_calibration_nabl_scope_measurand
  ON public.calibration_nabl_scope USING btree (measurand);

CREATE INDEX IF NOT EXISTS idx_calibration_nabl_scope_method
  ON public.calibration_nabl_scope USING btree (calibration_method);

DROP TRIGGER IF EXISTS trg_calibration_nabl_scope_updated_at ON public.calibration_nabl_scope;
CREATE TRIGGER trg_calibration_nabl_scope_updated_at
  BEFORE UPDATE ON public.calibration_nabl_scope
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.calibration_nabl_scope ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_calibration_nabl_scope_authenticated_all ON public.calibration_nabl_scope;
CREATE POLICY lims_calibration_nabl_scope_authenticated_all
  ON public.calibration_nabl_scope
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.calibration_nabl_scope IS
  'Calibration laboratory NABL Scope of Accreditation (§2.2) — measurand, method, range, CMC, facility type';

COMMENT ON COLUMN public.calibration_nabl_scope.measurand IS
  'Measurand / reference material / instrument / quantity measured';

COMMENT ON COLUMN public.calibration_nabl_scope.calibration_method IS
  'Calibration or measurement method or procedure (latest standard version)';

COMMENT ON COLUMN public.calibration_nabl_scope.measurement_range IS
  'Measurement range and additional parameters (range and frequency) where applicable';

COMMENT ON COLUMN public.calibration_nabl_scope.cmc IS
  'Calibration and Measurement Capability (CMC) expressed as uncertainty (±) at ~95% confidence';

COMMENT ON COLUMN public.calibration_nabl_scope.facility_type IS
  'Type of calibration facility: Permanent / Site / Mobile / Permanent Site facility';
