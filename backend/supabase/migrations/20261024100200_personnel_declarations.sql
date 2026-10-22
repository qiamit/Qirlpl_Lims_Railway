-- ISO/IEC 17025 clauses 4.1 (impartiality) and 4.2 (confidentiality), gap item P1-10.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20260816093000, 20261009063000, 20261009103000 and 20261023000001,
-- while the lab is idle. Safe to run more than once.
--
-- 1. gr_impartiality_risks: likelihood x severity scoring (1-5 each) and a
--    stored risk_score.
-- 2. gr_impartiality_risks / gr_confidentiality_records: explicit grants and
--    known-staff policies instead of USING (true).
-- 3. personnel_declarations: one signed record per employee, type and year
--    (impartiality / conflict of interest, and confidentiality). Staff insert
--    and read their own rows. The Laboratory Director and the Quality Manager
--    read everyone's. Nobody updates or deletes through the API: a signed
--    declaration is a quality record.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Impartiality risk scoring
-- ---------------------------------------------------------------------------

ALTER TABLE public.gr_impartiality_risks
  ADD COLUMN IF NOT EXISTS likelihood int,
  ADD COLUMN IF NOT EXISTS severity int;

ALTER TABLE public.gr_impartiality_risks
  ADD COLUMN IF NOT EXISTS risk_score int GENERATED ALWAYS AS (likelihood * severity) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gr_impartiality_risks_likelihood_check'
      AND conrelid = 'public.gr_impartiality_risks'::regclass
  ) THEN
    ALTER TABLE public.gr_impartiality_risks
      ADD CONSTRAINT gr_impartiality_risks_likelihood_check
      CHECK (likelihood IS NULL OR likelihood BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gr_impartiality_risks_severity_check'
      AND conrelid = 'public.gr_impartiality_risks'::regclass
  ) THEN
    ALTER TABLE public.gr_impartiality_risks
      ADD CONSTRAINT gr_impartiality_risks_severity_check
      CHECK (severity IS NULL OR severity BETWEEN 1 AND 5);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Grants and known-staff policies on the two 4.1 / 4.2 registers.
--    Without app_is_known_staff() (older database) the original policies stay.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RAISE NOTICE 'app_is_known_staff() missing: gr_impartiality_risks / gr_confidentiality_records policies left unchanged';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['gr_impartiality_risks', 'gr_confidentiality_records'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_%s_authenticated_all ON public.%I', rel, rel);
    EXECUTE format('DROP POLICY IF EXISTS lims_%s_known_staff_all ON public.%I', rel, rel);
    EXECUTE format(
      'CREATE POLICY lims_%s_known_staff_all ON public.%I FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel, rel
    );
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel
    );
  END LOOP;
END $$;

REVOKE ALL ON public.gr_impartiality_risks FROM PUBLIC, anon;
REVOKE ALL ON public.gr_confidentiality_records FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gr_impartiality_risks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gr_confidentiality_records TO authenticated;
GRANT ALL ON public.gr_impartiality_risks TO service_role;
GRANT ALL ON public.gr_confidentiality_records TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Annual personnel declarations
-- ---------------------------------------------------------------------------

-- ON DELETE RESTRICT: a person who has signed declarations is set Inactive,
-- not deleted, so the signed records are kept.
CREATE TABLE IF NOT EXISTS public.personnel_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  declaration_type text NOT NULL,
  period_year int NOT NULL,
  statement_version text NOT NULL,
  statement_text text NOT NULL,
  conflicts_declared text,
  accepted boolean NOT NULL DEFAULT false,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_declarations_type_check
    CHECK (declaration_type IN ('impartiality_coi', 'confidentiality')),
  CONSTRAINT personnel_declarations_year_check
    CHECK (period_year BETWEEN 2000 AND 2100),
  CONSTRAINT personnel_declarations_statement_check
    CHECK (btrim(statement_text) <> '' AND btrim(statement_version) <> ''),
  CONSTRAINT personnel_declarations_user_type_year_key
    UNIQUE (user_id, declaration_type, period_year)
);

CREATE INDEX IF NOT EXISTS idx_personnel_declarations_year
  ON public.personnel_declarations (period_year, declaration_type);

-- Signing time comes from the server, and the name falls back to the profile.
-- Rows written without a user session (service_role backfill) keep their values.
CREATE OR REPLACE FUNCTION public.personnel_declarations_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.signed_at := now();
    NEW.created_at := now();
  END IF;
  IF btrim(coalesce(NEW.signed_name, '')) = '' THEN
    SELECT coalesce(nullif(btrim(up.full_name), ''), up.email, '')
      INTO NEW.signed_name
      FROM public.user_profiles up
     WHERE up.id = NEW.user_id;
    NEW.signed_name := coalesce(NEW.signed_name, '');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.personnel_declarations_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personnel_declarations_before_insert ON public.personnel_declarations;
CREATE TRIGGER trg_personnel_declarations_before_insert
  BEFORE INSERT ON public.personnel_declarations
  FOR EACH ROW EXECUTE FUNCTION public.personnel_declarations_before_insert();

ALTER TABLE public.personnel_declarations ENABLE ROW LEVEL SECURITY;

-- Insert: only for yourself, accepted, for last / this / next calendar year.
DROP POLICY IF EXISTS personnel_declarations_insert_own ON public.personnel_declarations;
CREATE POLICY personnel_declarations_insert_own ON public.personnel_declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND accepted IS TRUE
    AND period_year BETWEEN extract(year FROM now())::int - 1 AND extract(year FROM now())::int + 1
  );

-- Select: own rows; all rows for the Laboratory Director and Quality Manager
-- (each helper only when it exists on this database).
DO $$
DECLARE
  expr text := 'user_id = auth.uid()';
BEGIN
  IF to_regprocedure('public.app_is_laboratory_director()') IS NOT NULL THEN
    expr := expr || ' OR public.app_is_laboratory_director()';
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    expr := expr || ' OR public.app_is_quality_manager()';
  END IF;
  DROP POLICY IF EXISTS personnel_declarations_select_own_or_reviewer ON public.personnel_declarations;
  EXECUTE format(
    'CREATE POLICY personnel_declarations_select_own_or_reviewer ON public.personnel_declarations '
    'FOR SELECT TO authenticated USING (%s)',
    expr
  );
END $$;

-- No UPDATE or DELETE policy: both are refused for every API user.

-- Same outer gate as every other public table (20261009063000).
DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.personnel_declarations;
    CREATE POLICY lims_known_staff_only ON public.personnel_declarations
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

REVOKE ALL ON public.personnel_declarations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.personnel_declarations TO authenticated;
GRANT ALL ON public.personnel_declarations TO service_role;

-- Every insert (and any service_role correction) is recorded (ISO 17025 7.5).
-- A trigger that already exists (for example from 20261024100000) is kept.
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['personnel_declarations', 'gr_impartiality_risks', 'gr_confidentiality_records'] LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = rel || '_audit_log'
        AND tgrelid = ('public.' || rel)::regclass
        AND NOT tgisinternal
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
