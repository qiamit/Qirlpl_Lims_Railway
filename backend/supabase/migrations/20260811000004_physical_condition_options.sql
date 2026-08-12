-- Manageable Physical Conditions master (Type & Select + add/edit/delete).
-- Custom labels must be allowed on SRF rows, so drop the enum CHECK.

ALTER TABLE public.calibration_service_requests
  DROP CONSTRAINT IF EXISTS calibration_service_requests_physical_condition_check;

CREATE TABLE IF NOT EXISTS public.physical_condition_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_condition_options_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_physical_condition_options_name
  ON public.physical_condition_options USING btree (name);

ALTER TABLE public.physical_condition_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_physical_condition_options_authenticated_all
  ON public.physical_condition_options;
CREATE POLICY lims_physical_condition_options_authenticated_all
  ON public.physical_condition_options
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.physical_condition_options (name)
VALUES
  ('Ok'),
  ('Good'),
  ('Satisfactory'),
  ('Fair'),
  ('Damaged'),
  ('Needs Repair'),
  ('Not Ok')
ON CONFLICT (name) DO NOTHING;
