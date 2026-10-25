-- ISO/IEC 17025 gap P1-3: decision rule and statements of conformity
-- (clauses 7.1.3 and 7.8.6). NOT applied automatically. Apply on Railway
-- Postgres only when Amit asks, after 20261009063000 and 20261023000001.
-- Safe to run more than once. Until it is applied the frontend behaves as
-- before: the decision rule dropdowns are empty, SRFs save without
-- decision_rule_id and reports print without a decision rule statement.
--
-- What it adds:
--   * decision_rules: master list of the decision rules the laboratory uses
--     when it states conformity with a specification (ILAC-G8:09/2019).
--       rule_type          simple_acceptance | guard_band | non_binary
--       guard_band_factor  w = factor x U (U = expanded uncertainty of the
--                          result). Always 0 for simple acceptance. For a
--                          non-binary rule it is the width of the conditional
--                          zones on each side of the limit.
--       statement_text     the sentence printed on test reports and
--                          calibration certificates when the rule is selected.
--       applies_to         testing | calibration | both
--     Seeded with three rules (simple acceptance, guard band w = U and
--     non-binary Pass / Conditional Pass / Conditional Fail / Fail).
--     Everyone on the staff reads the list. Only the Laboratory Director and
--     the Quality Manager add, change or delete rules. A rule that an SRF uses
--     cannot be deleted (FK ON DELETE RESTRICT); set it inactive instead.
--   * samples.decision_rule_id and calibration_service_requests.decision_rule_id:
--     the rule agreed with the customer at contract review (7.1.3). The old
--     columns (samples.decision_rule_applied, calibration_service_requests.
--     decision_rule) stay and are still written by the app.
--   * Audit trail on decision_rules when write_audit_log() exists.
-- decision_rules is not added to the soft delete list.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Master table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'simple_acceptance',
  guard_band_factor numeric NOT NULL DEFAULT 0,
  statement_text text NOT NULL DEFAULT '',
  risk_note text,
  active boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'both',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_rules_code_key' AND conrelid = 'public.decision_rules'::regclass
  ) THEN
    ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_code_key UNIQUE (code);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_rules_rule_type_check' AND conrelid = 'public.decision_rules'::regclass
  ) THEN
    ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_rule_type_check
      CHECK (rule_type IN ('simple_acceptance', 'guard_band', 'non_binary'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_rules_applies_to_check' AND conrelid = 'public.decision_rules'::regclass
  ) THEN
    ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_applies_to_check
      CHECK (applies_to IN ('testing', 'calibration', 'both'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_rules_guard_band_check' AND conrelid = 'public.decision_rules'::regclass
  ) THEN
    -- w = factor x U: never negative, and exactly 0 for simple acceptance.
    ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_guard_band_check
      CHECK (
        guard_band_factor >= 0
        AND guard_band_factor <= 10
        AND (rule_type <> 'simple_acceptance' OR guard_band_factor = 0)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_rules_text_check' AND conrelid = 'public.decision_rules'::regclass
  ) THEN
    ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_text_check
      CHECK (btrim(code) <> '' AND btrim(name) <> '' AND btrim(statement_text) <> '');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decision_rules_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.decision_rules_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_decision_rules_touch_updated_at ON public.decision_rules;
CREATE TRIGGER trg_decision_rules_touch_updated_at
  BEFORE INSERT OR UPDATE ON public.decision_rules
  FOR EACH ROW EXECUTE FUNCTION public.decision_rules_touch_updated_at();

-- Seed rules (kept as edited if they already exist).
INSERT INTO public.decision_rules (code, name, rule_type, guard_band_factor, statement_text, risk_note, applies_to)
VALUES
  (
    'DR-SA',
    'Simple acceptance (shared risk)',
    'simple_acceptance',
    0,
    'Decision rule: simple acceptance (ILAC-G8:09/2019, 4.2.1). A result is stated as conforming when the measured value is within the specified limit; the measurement uncertainty is not taken into account.',
    'Shared risk. When the measured value is close to the limit the probability of a false accept can approach 50 %. Use only when agreed with the customer or required by the specification.',
    'both'
  ),
  (
    'DR-GB',
    'Guard band w = U (guarded acceptance)',
    'guard_band',
    1,
    'Decision rule: guarded acceptance with guard band w = U (ILAC-G8:09/2019, 4.2.2), where U is the expanded measurement uncertainty (k = 2, approx. 95 % coverage). A result is stated as conforming only when the measured value is inside the specified limit by at least U; otherwise it is stated as not conforming.',
    'Probability of false accept below 2.5 % (one-sided). Results inside the limit but closer than U are stated as not conforming, so the customer carries the false reject risk.',
    'both'
  ),
  (
    'DR-NB',
    'Non-binary (Pass / Conditional Pass / Conditional Fail / Fail)',
    'non_binary',
    1,
    'Decision rule: non-binary statement of conformity with guard band w = U (ILAC-G8:09/2019, 4.2.3), where U is the expanded measurement uncertainty (k = 2). Pass: measured value inside the limit by at least U. Conditional Pass: inside the limit by less than U. Conditional Fail: outside the limit by less than U. Fail: outside the limit by at least U.',
    'Conditional results carry a significant risk of false accept or false reject; the customer decides how to use them.',
    'both'
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Rule agreed at contract review (keep the old columns)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.samples') IS NOT NULL THEN
    ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS decision_rule_id uuid;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'samples_decision_rule_id_fkey' AND conrelid = 'public.samples'::regclass
    ) THEN
      ALTER TABLE public.samples ADD CONSTRAINT samples_decision_rule_id_fkey
        FOREIGN KEY (decision_rule_id) REFERENCES public.decision_rules (id) ON DELETE RESTRICT;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_samples_decision_rule_id
      ON public.samples (decision_rule_id) WHERE decision_rule_id IS NOT NULL;
  END IF;

  IF to_regclass('public.calibration_service_requests') IS NOT NULL THEN
    ALTER TABLE public.calibration_service_requests ADD COLUMN IF NOT EXISTS decision_rule_id uuid;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'calibration_service_requests_decision_rule_id_fkey'
        AND conrelid = 'public.calibration_service_requests'::regclass
    ) THEN
      ALTER TABLE public.calibration_service_requests
        ADD CONSTRAINT calibration_service_requests_decision_rule_id_fkey
        FOREIGN KEY (decision_rule_id) REFERENCES public.decision_rules (id) ON DELETE RESTRICT;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_calibration_service_requests_decision_rule_id
      ON public.calibration_service_requests (decision_rule_id) WHERE decision_rule_id IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.decision_rules ENABLE ROW LEVEL SECURITY;

-- Read: known staff (any signed-in user on an older database without the helper).
-- Write: Laboratory Director (app_is_admin, else app_is_laboratory_director) or
-- Quality Manager. Each helper only when it exists on this database.
DO $$
DECLARE
  read_expr text := 'auth.uid() IS NOT NULL';
  write_expr text := '';
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    read_expr := 'public.app_is_known_staff()';
  END IF;

  IF to_regprocedure('public.app_is_admin()') IS NOT NULL THEN
    write_expr := 'public.app_is_admin()';
  ELSIF to_regprocedure('public.app_is_laboratory_director()') IS NOT NULL THEN
    write_expr := 'public.app_is_laboratory_director()';
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    write_expr := CASE WHEN write_expr = '' THEN '' ELSE write_expr || ' OR ' END
      || 'public.app_is_quality_manager()';
  END IF;
  IF write_expr = '' THEN
    RAISE NOTICE 'No Director / Quality Manager helper: decision_rules is read-only through the API';
    write_expr := 'false';
  END IF;

  DROP POLICY IF EXISTS decision_rules_select_staff ON public.decision_rules;
  EXECUTE format(
    'CREATE POLICY decision_rules_select_staff ON public.decision_rules '
    'FOR SELECT TO authenticated USING (%s)',
    read_expr
  );

  DROP POLICY IF EXISTS decision_rules_insert_director_qm ON public.decision_rules;
  EXECUTE format(
    'CREATE POLICY decision_rules_insert_director_qm ON public.decision_rules '
    'FOR INSERT TO authenticated WITH CHECK (%s)',
    write_expr
  );

  DROP POLICY IF EXISTS decision_rules_update_director_qm ON public.decision_rules;
  EXECUTE format(
    'CREATE POLICY decision_rules_update_director_qm ON public.decision_rules '
    'FOR UPDATE TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    write_expr
  );

  DROP POLICY IF EXISTS decision_rules_delete_director_qm ON public.decision_rules;
  EXECUTE format(
    'CREATE POLICY decision_rules_delete_director_qm ON public.decision_rules '
    'FOR DELETE TO authenticated USING (%s)',
    write_expr
  );

  -- Same outer gate as every other public table (20261009063000).
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.decision_rules;
    CREATE POLICY lims_known_staff_only ON public.decision_rules
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

REVOKE ALL ON public.decision_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_rules TO authenticated;
GRANT ALL ON public.decision_rules TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Audit trail (ISO 17025 7.5). An existing trigger is kept.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'decision_rules_audit_log'
      AND tgrelid = 'public.decision_rules'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER decision_rules_audit_log
      AFTER INSERT OR UPDATE OR DELETE ON public.decision_rules
      FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
