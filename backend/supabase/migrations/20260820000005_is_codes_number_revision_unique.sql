-- Fix IS Codes upsert (42P10): PostgREST ON CONFLICT (is_number, revision_year)
-- requires a matching unique index/constraint. Baseline defined this index, but it
-- may be missing on Railway if migrations were partially applied.

CREATE UNIQUE INDEX IF NOT EXISTS idx_is_codes_number_revision_unique
  ON public.is_codes USING btree (is_number, revision_year) NULLS NOT DISTINCT;
