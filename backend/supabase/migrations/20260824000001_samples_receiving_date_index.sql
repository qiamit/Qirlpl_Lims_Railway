-- Speed up Sample Receiving / dashboard sorts by receiving date.
CREATE INDEX IF NOT EXISTS idx_samples_date_of_sample_receiving
  ON public.samples (date_of_sample_receiving DESC NULLS LAST, created_at DESC);
