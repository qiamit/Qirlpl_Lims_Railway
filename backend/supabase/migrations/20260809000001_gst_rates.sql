-- GST rate master (reusable rates for Product & Services and finance)
CREATE TABLE IF NOT EXISTS public.gst_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric(6, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gst_rates_rate_key UNIQUE (rate),
  CONSTRAINT gst_rates_rate_range CHECK (rate >= 0 AND rate <= 100)
);

CREATE INDEX IF NOT EXISTS idx_gst_rates_rate
  ON public.gst_rates USING btree (rate);

ALTER TABLE public.gst_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_gst_rates_authenticated_all ON public.gst_rates;
CREATE POLICY lims_gst_rates_authenticated_all
  ON public.gst_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Common India GST slabs
INSERT INTO public.gst_rates (rate)
VALUES (0), (5), (12), (18), (28)
ON CONFLICT (rate) DO NOTHING;
