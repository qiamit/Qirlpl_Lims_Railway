-- Fixes common PATCH /rest/v1/samples 400 errors:
-- (1) invalid input value for enum samples.stage — add all LIMS stage labels the app sends.
-- (2) missing results_reviewer_id — used when sending results for review.

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS results_reviewer_id uuid;

COMMENT ON COLUMN public.samples.results_reviewer_id IS 'User (auth.users.id) responsible for results review; set from Sample Under Testing.';

-- Dynamically extend the PostgreSQL enum used by public.samples.stage (if column is an enum).
DO $$
DECLARE
  r RECORD;
  val text;
  vals text[] := ARRAY[
    'receiving',
    'allocation',
    'test_allocation',
    'under_testing',
    'results_review',
    'report_preparation',
    'completed'
  ];
BEGIN
  SELECT n.nspname AS sch, t.typname AS typ
  INTO r
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace cn ON cn.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE cn.nspname = 'public'
    AND c.relname = 'samples'
    AND a.attname = 'stage'
    AND NOT a.attisdropped;

  IF NOT FOUND OR r.typ IS NULL THEN
    RAISE NOTICE 'samples.stage: column not found, skip enum patch';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type et
    JOIN pg_namespace en ON en.oid = et.typnamespace
    WHERE et.typname = r.typ
      AND en.nspname = r.sch
      AND et.typtype = 'e'
  ) THEN
    RAISE NOTICE 'samples.stage is not an enum (%.%), skip', r.sch, r.typ;
    RETURN;
  END IF;

  FOREACH val IN ARRAY vals LOOP
    BEGIN
      EXECUTE format('ALTER TYPE %I.%I ADD VALUE %L', r.sch, r.typ, val);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
