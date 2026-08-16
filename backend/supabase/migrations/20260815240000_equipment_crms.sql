-- List of CRMs (Certified Reference Materials) under Equipment Management
CREATE TABLE IF NOT EXISTS public.equipment_crms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  s_no integer NOT NULL,
  id_no text NOT NULL,
  crm_type text NOT NULL DEFAULT '',
  make text NOT NULL DEFAULT '',
  year_of_purchase integer,
  traceability_from text NOT NULL DEFAULT '',
  traceability_as_per text NOT NULL DEFAULT '',
  uncertainty text NOT NULL DEFAULT '',
  valid_upto date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_crms_id_no_key UNIQUE (id_no),
  CONSTRAINT equipment_crms_s_no_positive CHECK (s_no > 0),
  CONSTRAINT equipment_crms_year_check CHECK (
    year_of_purchase IS NULL
    OR (year_of_purchase >= 1900 AND year_of_purchase <= 2100)
  )
);

CREATE INDEX IF NOT EXISTS idx_equipment_crms_s_no ON public.equipment_crms (s_no);
CREATE INDEX IF NOT EXISTS idx_equipment_crms_valid_upto ON public.equipment_crms (valid_upto);

DROP TRIGGER IF EXISTS trg_equipment_crms_updated_at ON public.equipment_crms;
CREATE TRIGGER trg_equipment_crms_updated_at
  BEFORE UPDATE ON public.equipment_crms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.equipment_crms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_equipment_crms_authenticated_all ON public.equipment_crms;
CREATE POLICY lims_equipment_crms_authenticated_all
  ON public.equipment_crms
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
