-- Persist historical MU calculations per test parameter (append on each Save MU).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'test_parameters'
      AND column_name = 'uncertainty_mu_history'
  ) THEN
    ALTER TABLE public.test_parameters
      ADD COLUMN uncertainty_mu_history jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.test_parameters.uncertainty_mu_history IS
  'Array of past uncertainty (MU) saves: { id, recordedAt, uncertaintyMu, calculationData, savedByName }';
