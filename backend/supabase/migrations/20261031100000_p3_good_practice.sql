-- ISO/IEC 17025 gap P3 (good practice): P3-2, P3-3, P3-5, P3-6, P3-7, P3-9.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20260830000001_nabl_scope_status.sql (nabl_scope.scope_status) and
-- 20261024100000_audit_trail_expansion.sql (write_audit_log), while the lab
-- is idle. Safe to re-run. Until it is applied every screen behaves as
-- before: the new sections are hidden and saves leave the new columns out.
--
-- What it adds
--   P3-2 (7.6)  test_parameter_mu_bands
--               Expanded uncertainty per measuring-range band of a test
--               parameter: range_from / range_to (NULL = open end), unit,
--               expanded_u as a number with u_unit 'abs' (same unit as the
--               result) or '%' (relative), coverage factor k, valid_from and
--               review_due (periodic MU review, 7.6.1 / 7.6.3).
--               mu_for_result(test_parameter, value, on_date) returns the
--               band that applies to a result and U as an absolute value.
--               Same selection as frontend muBands.ts selectMuBand():
--               value inside [range_from, range_to] (both inclusive); when
--               bands share a boundary or overlap the most specific wins
--               (highest range_from, then narrowest band, then the latest
--               valid_from). Bands with valid_from in the future and
--               inactive bands are ignored.
--   P3-3 (5)    org_positions
--               Organisation chart: position title, holder and deputy
--               (user_profiles), reports_to (another position, no cycles),
--               responsibilities / authority, key personnel flag (5.5,
--               6.2.4 deputies for key managerial personnel).
--               ulr_scope_check(sample, reported_only) lists the parameters
--               of a sample that are marked NABL in the test parameter
--               master (under_accreditation_ids -> an accreditation body
--               named NABL) but have no 'Accredited' nabl_scope row for the
--               parameter (issue 'not_in_scope') or none for its method
--               (issue 'method_not_in_scope'). A warning helper for the NABL
--               ULR: it never blocks anything by itself.
--   P3-5 (6.4/6.5) equipment_crms: opened_on, post_opening_validity_days,
--               storage_conditions, stock_quantity, stock_unit,
--               reorder_level. crm_expiry_alerts(within_days) lists CRMs
--               expired / expiring (certificate validity or opened-on +
--               post-opening validity, whichever is earlier) and low stock.
--   P3-6 (8.6)  customer_feedback.satisfaction_rating (1 - 5), optional,
--               for the satisfaction trend on the complaints KPI panel.
--   P3-7 (8.2)  objective_measurements: measured values of a quality
--               objective per period (target, actual, unit, direction,
--               status, remarks).
--   P3-9 (7.1)  srf_contract_changes: amendments to a testing SRF / contract
--               after work has started and deviations communicated to the
--               customer (7.1.4, 7.1.6): what changed, whether and when
--               the customer was informed, how, and whether they agreed.
--               The change itself cannot be rewritten afterwards (only the
--               communication fields); the Laboratory Director may correct
--               or delete an entry made in error (audit trail keeps both).
--
-- Access
--   Read: known staff. Restrictive gate lims_known_staff_only like every
--   other public table, explicit grants, write_audit_log on every new table.
--   MU bands, objective measurements: Laboratory Director, Quality Manager or
--   a Technical Manager (app_p3_can_manage). Organisation chart: Laboratory
--   Director or Quality Manager (app_p3_can_manage_org). SRF contract
--   changes: any known staff records them. Deletes: Laboratory Director only
--   (MU bands and positions also by app_p3_can_manage / _org).
--   Module access (20261029100200): mu bands, objective measurements, SRF
--   contract changes and org_positions (Organisation Chart,
--   /general-requirements/organisation-chart, in the module catalog seed) are
--   added to module_table_map when that table exists.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.test_parameters') IS NULL
     OR to_regclass('public.samples') IS NULL
     OR to_regclass('public.test_allocations') IS NULL
     OR to_regclass('public.test_allocation_parameters') IS NULL
     OR to_regclass('public.accreditation_bodies') IS NULL
     OR to_regclass('public.nabl_scope') IS NULL
     OR to_regclass('public.equipment_crms') IS NULL
     OR to_regclass('public.gr_objectives') IS NULL
     OR to_regclass('public.customer_feedback') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'test_parameters, samples, test_allocations, test_allocation_parameters, accreditation_bodies, nabl_scope, equipment_crms, gr_objectives, customer_feedback and user_profiles must exist first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nabl_scope' AND column_name = 'scope_status'
  ) THEN
    RAISE EXCEPTION 'Apply 20260830000001_nabl_scope_status.sql first (nabl_scope.scope_status)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Laboratory Director, Quality Manager or an active Technical Manager.
CREATE OR REPLACE FUNCTION public.app_p3_can_manage()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_quality_manager()' INTO v_ok;
    IF v_ok THEN
      RETURN true;
    END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'technical manager'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
END;
$$;

-- Laboratory Director or Quality Manager (organisation chart).
CREATE OR REPLACE FUNCTION public.app_p3_can_manage_org()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_quality_manager()' INTO v_ok;
    RETURN coalesce(v_ok, false);
  END IF;
  RETURN false;
END;
$$;

-- Letters and digits only, lower case (same as app_mv_norm, kept separate so
-- this file does not depend on the method validation migration).
CREATE OR REPLACE FUNCTION public.app_p3_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]+', '', 'g'));
$$;

-- Same, without a trailing edition / reaffirmation year ("IS 1608:2018").
CREATE OR REPLACE FUNCTION public.app_p3_norm_base(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.app_p3_norm(
    regexp_replace(
      coalesce(p, ''),
      '([[:space:]]*(RA|reaffirmed|reaff\.?)?[[:space:]]*[:,/(–-]?[[:space:]]*(19|20)[0-9]{2}[[:space:]]*\)?)+[[:space:]]*$',
      '',
      'i'
    )
  );
$$;

-- Accreditation body name counts as NABL (same rule as the browser's
-- isNablAccreditationBodyName: not "Non-NABL", not "Not accredited").
CREATE OR REPLACE FUNCTION public.app_p3_is_nabl_body(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_name, '')) = '' THEN false
    WHEN lower(p_name) ~ 'non[[:space:]-]*nabl' THEN false
    WHEN lower(p_name) LIKE '%not accredited%' THEN false
    ELSE lower(p_name) ~ '(^|[^a-z0-9])nabl([^a-z0-9]|$)'
  END;
$$;

REVOKE ALL ON FUNCTION public.app_p3_can_manage() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_p3_can_manage_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_p3_norm(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_p3_norm_base(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_p3_is_nabl_body(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_p3_can_manage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_p3_can_manage_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_p3_norm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_p3_norm_base(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_p3_is_nabl_body(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. P3-2: MU by range band
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.test_parameter_mu_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_parameter_id uuid NOT NULL REFERENCES public.test_parameters (id) ON DELETE CASCADE,
  range_from numeric,
  range_to numeric,
  unit text,
  expanded_u numeric NOT NULL,
  u_unit text NOT NULL DEFAULT 'abs',
  k numeric NOT NULL DEFAULT 2,
  confidence_level text DEFAULT '95%',
  valid_from date NOT NULL DEFAULT current_date,
  review_due date,
  basis text,
  active boolean NOT NULL DEFAULT true,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_parameter_mu_bands_range_check CHECK (
    range_from IS NULL OR range_to IS NULL OR range_from <= range_to
  ),
  CONSTRAINT test_parameter_mu_bands_u_check CHECK (expanded_u >= 0),
  CONSTRAINT test_parameter_mu_bands_u_unit_check CHECK (u_unit IN ('abs', '%')),
  CONSTRAINT test_parameter_mu_bands_pct_check CHECK (u_unit <> '%' OR expanded_u <= 100),
  CONSTRAINT test_parameter_mu_bands_k_check CHECK (k > 0 AND k <= 10),
  CONSTRAINT test_parameter_mu_bands_review_check CHECK (review_due IS NULL OR review_due >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_test_parameter_mu_bands_parameter
  ON public.test_parameter_mu_bands (test_parameter_id, range_from);
CREATE INDEX IF NOT EXISTS idx_test_parameter_mu_bands_review
  ON public.test_parameter_mu_bands (review_due) WHERE active AND review_due IS NOT NULL;

-- One band row per result. SECURITY INVOKER: the caller's RLS applies.
DROP FUNCTION IF EXISTS public.mu_for_result(uuid, numeric, date);
CREATE FUNCTION public.mu_for_result(
  p_test_parameter_id uuid,
  p_value numeric,
  p_on date DEFAULT current_date
)
RETURNS TABLE (
  band_id uuid,
  range_from numeric,
  range_to numeric,
  unit text,
  expanded_u numeric,
  u_unit text,
  k numeric,
  expanded_u_abs numeric,
  valid_from date,
  review_due date,
  review_overdue boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.range_from, b.range_to, b.unit, b.expanded_u, b.u_unit, b.k,
         CASE WHEN b.u_unit = '%' THEN abs($2) * b.expanded_u / 100 ELSE b.expanded_u END,
         b.valid_from, b.review_due,
         (b.review_due IS NOT NULL AND b.review_due < coalesce($3, current_date))
  FROM public.test_parameter_mu_bands b
  WHERE b.test_parameter_id = $1
    AND b.active
    AND b.valid_from <= coalesce($3, current_date)
    AND (b.range_from IS NULL OR $2 >= b.range_from)
    AND (b.range_to IS NULL OR $2 <= b.range_to)
  ORDER BY b.range_from DESC NULLS LAST,
           (b.range_to - b.range_from) ASC NULLS LAST,
           b.valid_from DESC,
           b.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mu_for_result(uuid, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mu_for_result(uuid, numeric, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. P3-3: organisation chart and the NABL ULR scope check
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text,
  holder_user_id uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  deputy_user_id uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  reports_to uuid REFERENCES public.org_positions (id) ON DELETE SET NULL,
  responsibilities text,
  authority text,
  key_personnel boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_positions_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT org_positions_deputy_check CHECK (
    holder_user_id IS NULL OR deputy_user_id IS NULL OR holder_user_id <> deputy_user_id
  ),
  CONSTRAINT org_positions_self_check CHECK (reports_to IS NULL OR reports_to <> id)
);

CREATE INDEX IF NOT EXISTS idx_org_positions_reports_to ON public.org_positions (reports_to);
CREATE INDEX IF NOT EXISTS idx_org_positions_holder ON public.org_positions (holder_user_id);
CREATE INDEX IF NOT EXISTS idx_org_positions_deputy ON public.org_positions (deputy_user_id);

-- No reporting cycles (A -> B -> A).
CREATE OR REPLACE FUNCTION public.org_positions_no_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur uuid := NEW.reports_to;
  v_depth int := 0;
BEGIN
  WHILE v_cur IS NOT NULL LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'A position cannot report to itself or to a position below it'
        USING ERRCODE = '23514';
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > 100 THEN
      RAISE EXCEPTION 'Organisation chart is deeper than 100 levels' USING ERRCODE = '23514';
    END IF;
    SELECT p.reports_to INTO v_cur FROM public.org_positions p WHERE p.id = v_cur;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.org_positions_no_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_positions_no_cycle ON public.org_positions;
CREATE TRIGGER trg_org_positions_no_cycle
  BEFORE INSERT OR UPDATE OF reports_to ON public.org_positions
  FOR EACH ROW EXECUTE FUNCTION public.org_positions_no_cycle();

-- Parameters of a sample marked NABL without an accredited scope row.
-- p_reported_only = true: only rows that go on the report (sent for testing
-- and with a result), like the report preparation screen.
-- SECURITY INVOKER: the caller's RLS applies (soft-deleted scope rows are
-- hidden by RLS; the to_jsonb check also skips them for the owner).
DROP FUNCTION IF EXISTS public.ulr_scope_check(uuid, boolean);
CREATE FUNCTION public.ulr_scope_check(
  p_sample_id uuid,
  p_reported_only boolean DEFAULT true
)
RETURNS TABLE (
  test_parameter_id uuid,
  parameter_name text,
  test_method text,
  issue text,
  detail text,
  row_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT tp.id AS tp_id,
           tp.item_name,
           tp.test_method,
           ic.is_number,
           count(*)::int AS n
    FROM public.test_allocations ta
    JOIN public.test_allocation_parameters tap ON tap.test_allocation_id = ta.id
    JOIN public.test_parameters tp ON tp.id = tap.test_parameter_id
    LEFT JOIN public.is_codes ic ON ic.id = tp.is_code_id
    WHERE ta.sample_id = $1
      AND (NOT coalesce($2, true)
           OR (ta.sent_for_testing AND nullif(btrim(coalesce(tap.results, '')), '') IS NOT NULL))
      AND EXISTS (
        SELECT 1 FROM public.accreditation_bodies ab
        WHERE ab.id = ANY (coalesce(tp.under_accreditation_ids, '{}'::uuid[]))
          AND public.app_p3_is_nabl_body(ab.name)
      )
    GROUP BY tp.id, tp.item_name, tp.test_method, ic.is_number
  ),
  scope AS (
    SELECT public.app_p3_norm(ns.component_parameter) AS sp,
           public.app_p3_norm_base(ns.test_method_specification) AS sm
    FROM public.nabl_scope ns
    WHERE ns.scope_status = 'Accredited'
      AND (to_jsonb(ns) ->> 'deleted_at') IS NULL
  ),
  scored AS (
    SELECT p.*,
           (SELECT count(*) FROM scope s, LATERAL (SELECT public.app_p3_norm(p.item_name) AS pp) x
             WHERE s.sp <> '' AND x.pp <> ''
               AND (s.sp = x.pp OR strpos(s.sp, x.pp) > 0 OR strpos(x.pp, s.sp) > 0)) AS param_hits,
           (SELECT count(*) FROM scope s,
                   LATERAL (SELECT public.app_p3_norm(p.item_name) AS pp,
                                   public.app_p3_norm_base(p.test_method) AS tm,
                                   public.app_p3_norm(p.is_number) AS isn) x
             WHERE s.sp <> '' AND x.pp <> ''
               AND (s.sp = x.pp OR strpos(s.sp, x.pp) > 0 OR strpos(x.pp, s.sp) > 0)
               AND (s.sm = ''
                    OR (x.tm <> '' AND (strpos(s.sm, x.tm) > 0 OR strpos(x.tm, s.sm) > 0))
                    OR (x.isn <> '' AND strpos(s.sm, x.isn) > 0))) AS full_hits
    FROM params p
  )
  SELECT s.tp_id,
         s.item_name,
         s.test_method,
         CASE WHEN s.param_hits = 0 THEN 'not_in_scope' ELSE 'method_not_in_scope' END,
         CASE WHEN s.param_hits = 0
              THEN 'Marked NABL but no accredited NABL scope row lists this parameter'
              ELSE 'Accredited scope rows list this parameter, but not for method '
                   || coalesce(nullif(btrim(s.test_method), ''), nullif(btrim(s.is_number), ''), '(none)')
         END,
         s.n
  FROM scored s
  WHERE s.full_hits = 0
  ORDER BY s.item_name;
$$;

REVOKE ALL ON FUNCTION public.ulr_scope_check(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ulr_scope_check(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. P3-5: CRM use, storage and stock
-- ---------------------------------------------------------------------------

ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS opened_on date;
ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS post_opening_validity_days integer;
ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS storage_conditions text;
ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS stock_quantity numeric;
ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS stock_unit text;
ALTER TABLE public.equipment_crms ADD COLUMN IF NOT EXISTS reorder_level numeric;

ALTER TABLE public.equipment_crms DROP CONSTRAINT IF EXISTS equipment_crms_post_opening_days_check;
ALTER TABLE public.equipment_crms ADD CONSTRAINT equipment_crms_post_opening_days_check
  CHECK (post_opening_validity_days IS NULL OR post_opening_validity_days BETWEEN 0 AND 3650);
ALTER TABLE public.equipment_crms DROP CONSTRAINT IF EXISTS equipment_crms_stock_check;
ALTER TABLE public.equipment_crms ADD CONSTRAINT equipment_crms_stock_check
  CHECK ((stock_quantity IS NULL OR stock_quantity >= 0) AND (reorder_level IS NULL OR reorder_level >= 0));

COMMENT ON COLUMN public.equipment_crms.opened_on IS
  'Date the CRM container was first opened (ISO/IEC 17025 6.4 / 6.5).';
COMMENT ON COLUMN public.equipment_crms.post_opening_validity_days IS
  'Validity after opening in days, from the certificate; expiry = least(valid_upto, opened_on + days).';

-- Expired / expiring CRMs and low stock. SECURITY INVOKER (caller's RLS).
DROP FUNCTION IF EXISTS public.crm_expiry_alerts(integer);
CREATE FUNCTION public.crm_expiry_alerts(p_within_days integer DEFAULT 30)
RETURNS TABLE (
  crm_id uuid,
  id_no text,
  crm_type text,
  valid_upto date,
  opened_on date,
  open_expiry date,
  effective_expiry date,
  days_left integer,
  status text,
  stock_quantity numeric,
  reorder_level numeric,
  low_stock boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH x AS (
    SELECT c.id, c.id_no, c.crm_type, c.valid_upto, c.opened_on,
           CASE WHEN c.opened_on IS NOT NULL AND c.post_opening_validity_days IS NOT NULL
                THEN c.opened_on + c.post_opening_validity_days END AS open_exp,
           c.stock_quantity, c.reorder_level
    FROM public.equipment_crms c
  ),
  y AS (
    SELECT x.*,
           CASE
             WHEN x.valid_upto IS NULL THEN x.open_exp
             WHEN x.open_exp IS NULL THEN x.valid_upto
             ELSE least(x.valid_upto, x.open_exp)
           END AS eff
    FROM x
  )
  SELECT y.id, y.id_no, y.crm_type, y.valid_upto, y.opened_on, y.open_exp, y.eff,
         (y.eff - current_date)::int,
         CASE WHEN y.eff < current_date THEN 'expired'
              WHEN y.eff <= current_date + greatest(coalesce($1, 30), 0) THEN 'expiring'
              ELSE 'ok' END,
         y.stock_quantity, y.reorder_level,
         (y.stock_quantity IS NOT NULL AND y.reorder_level IS NOT NULL AND y.stock_quantity <= y.reorder_level)
  FROM y
  WHERE (y.eff IS NOT NULL AND y.eff <= current_date + greatest(coalesce($1, 30), 0))
     OR (y.stock_quantity IS NOT NULL AND y.reorder_level IS NOT NULL AND y.stock_quantity <= y.reorder_level)
  ORDER BY y.eff NULLS LAST, y.id_no;
$$;

REVOKE ALL ON FUNCTION public.crm_expiry_alerts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_expiry_alerts(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. P3-6: satisfaction rating on customer feedback (optional, 1 - 5)
-- ---------------------------------------------------------------------------

ALTER TABLE public.customer_feedback ADD COLUMN IF NOT EXISTS satisfaction_rating smallint;
ALTER TABLE public.customer_feedback DROP CONSTRAINT IF EXISTS customer_feedback_satisfaction_rating_check;
ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_satisfaction_rating_check
  CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- 6. P3-7: measured values of quality objectives
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.objective_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.gr_objectives (id) ON DELETE CASCADE,
  period text NOT NULL,
  period_end date,
  target numeric,
  actual numeric,
  unit text,
  higher_is_better boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'Not measured',
  remarks text,
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT objective_measurements_period_check CHECK (btrim(period) <> ''),
  CONSTRAINT objective_measurements_status_check CHECK (
    status IN ('Met', 'Partly met', 'Not met', 'Not measured')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS objective_measurements_period_key
  ON public.objective_measurements (objective_id, lower(btrim(period)));
CREATE INDEX IF NOT EXISTS idx_objective_measurements_objective
  ON public.objective_measurements (objective_id, period_end);

-- ---------------------------------------------------------------------------
-- 7. P3-9: SRF / contract amendments after work starts, deviations told to
--    the customer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.srf_contract_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples (id) ON DELETE CASCADE,
  change_type text NOT NULL DEFAULT 'amendment',
  changed_at timestamptz NOT NULL DEFAULT now(),
  change text NOT NULL,
  reason text,
  customer_informed boolean NOT NULL DEFAULT false,
  informed_on date,
  method_of_communication text,
  customer_contact text,
  agreed_by_customer boolean,
  customer_response text,
  recorded_by uuid DEFAULT auth.uid(),
  recorded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srf_contract_changes_type_check CHECK (change_type IN ('amendment', 'deviation')),
  CONSTRAINT srf_contract_changes_change_check CHECK (btrim(change) <> ''),
  CONSTRAINT srf_contract_changes_method_check CHECK (
    method_of_communication IS NULL
    OR method_of_communication IN ('email', 'phone', 'letter', 'in_person', 'portal', 'other')
  ),
  CONSTRAINT srf_contract_changes_informed_check CHECK (
    (customer_informed AND informed_on IS NOT NULL)
    OR (NOT customer_informed AND informed_on IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_srf_contract_changes_sample
  ON public.srf_contract_changes (sample_id, changed_at DESC);

-- Profile name of a user (SECURITY DEFINER so the guard below can stay
-- SECURITY INVOKER: it must see current_user = authenticated for app calls).
CREATE OR REPLACE FUNCTION public.app_p3_profile_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(up.full_name), '') FROM public.user_profiles up WHERE up.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.app_p3_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_p3_profile_name(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.srf_contract_changes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.recorded_by := auth.uid();
      NEW.created_at := now();
      IF NEW.changed_at > now() + interval '1 hour' THEN
        RAISE EXCEPTION 'A change cannot be dated in the future (%).', NEW.changed_at USING ERRCODE = '22007';
      END IF;
    END IF;
    IF NEW.recorded_by IS NOT NULL THEN
      v_name := public.app_p3_profile_name(NEW.recorded_by);
      IF v_name IS NOT NULL THEN
        NEW.recorded_by_name := v_name;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by the app: who / when it was recorded never changes; the change
  -- itself only by the Laboratory Director (correction of an entry in error).
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.recorded_by := OLD.recorded_by;
    NEW.recorded_by_name := OLD.recorded_by_name;
    NEW.created_at := OLD.created_at;
    NEW.sample_id := OLD.sample_id;
    IF (NEW.change IS DISTINCT FROM OLD.change
        OR NEW.change_type IS DISTINCT FROM OLD.change_type
        OR NEW.changed_at IS DISTINCT FROM OLD.changed_at
        OR NEW.reason IS DISTINCT FROM OLD.reason)
       AND NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'The recorded change cannot be rewritten. Add a new entry instead.'
        USING ERRCODE = '42501',
              HINT = 'Only the customer communication fields can be updated (ISO/IEC 17025 7.1.6, 7.5).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.srf_contract_changes_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_srf_contract_changes_guard ON public.srf_contract_changes;
CREATE TRIGGER trg_srf_contract_changes_guard
  BEFORE INSERT OR UPDATE ON public.srf_contract_changes
  FOR EACH ROW EXECUTE FUNCTION public.srf_contract_changes_guard();

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['test_parameter_mu_bands', 'org_positions', 'objective_measurements',
                             'srf_contract_changes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.test_parameter_mu_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.srf_contract_changes ENABLE ROW LEVEL SECURITY;

-- test_parameter_mu_bands, objective_measurements: managers write.
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['test_parameter_mu_bands', 'objective_measurements'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_p3_can_manage())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_p3_can_manage()) WITH CHECK (public.app_p3_can_manage())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_p3_can_manage())',
      rel || '_delete', rel);
  END LOOP;
END $$;

-- org_positions: Director / Quality Manager write.
DROP POLICY IF EXISTS org_positions_select ON public.org_positions;
CREATE POLICY org_positions_select ON public.org_positions
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS org_positions_insert ON public.org_positions;
CREATE POLICY org_positions_insert ON public.org_positions
  FOR INSERT TO authenticated WITH CHECK (public.app_p3_can_manage_org());
DROP POLICY IF EXISTS org_positions_update ON public.org_positions;
CREATE POLICY org_positions_update ON public.org_positions
  FOR UPDATE TO authenticated
  USING (public.app_p3_can_manage_org())
  WITH CHECK (public.app_p3_can_manage_org());
DROP POLICY IF EXISTS org_positions_delete ON public.org_positions;
CREATE POLICY org_positions_delete ON public.org_positions
  FOR DELETE TO authenticated USING (public.app_p3_can_manage_org());

-- srf_contract_changes: any known staff records; Director deletes.
DROP POLICY IF EXISTS srf_contract_changes_select ON public.srf_contract_changes;
CREATE POLICY srf_contract_changes_select ON public.srf_contract_changes
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS srf_contract_changes_insert ON public.srf_contract_changes;
CREATE POLICY srf_contract_changes_insert ON public.srf_contract_changes
  FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS srf_contract_changes_update ON public.srf_contract_changes;
CREATE POLICY srf_contract_changes_update ON public.srf_contract_changes
  FOR UPDATE TO authenticated
  USING (public.app_is_known_staff())
  WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS srf_contract_changes_delete ON public.srf_contract_changes;
CREATE POLICY srf_contract_changes_delete ON public.srf_contract_changes
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['test_parameter_mu_bands', 'org_positions', 'objective_measurements',
                             'srf_contract_changes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

REVOKE ALL ON public.test_parameter_mu_bands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.org_positions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.objective_measurements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.srf_contract_changes FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_parameter_mu_bands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objective_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.srf_contract_changes TO authenticated;

GRANT ALL ON public.test_parameter_mu_bands TO service_role;
GRANT ALL ON public.org_positions TO service_role;
GRANT ALL ON public.objective_measurements TO service_role;
GRANT ALL ON public.srf_contract_changes TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
--    equipment_crms and customer_feedback are already audited
--    (20261024100000).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: P3 tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['test_parameter_mu_bands', 'org_positions', 'objective_measurements',
                             'srf_contract_changes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Module access (20261029100200), when present: map the new tables and
--     re-install the module access policies.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_installed int;
BEGIN
  IF to_regclass('public.module_table_map') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.module_table_map WHERE source = 'seed:20261031100000';
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, w, r, 'seed:20261031100000', n
  FROM (VALUES
    ('test_parameter_mu_bands', '/masters/test-parameter', 'edit', 'open', 'MU bands (read by results / reports)'),
    ('objective_measurements', '/general-requirements/list-of-objectives', 'edit', 'view', 'objective KPIs'),
    ('objective_measurements', '/audit-mrm/mrm-agenda', 'never', 'view', 'MRM inputs'),
    ('objective_measurements', '/audit-mrm/management-review-meeting', 'never', 'view', 'MRM inputs'),
    ('srf_contract_changes', '/samples/receiving', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/allocation', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/test-allocation', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/under-testing', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/results-review', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/report-preparation', 'edit', 'view', 'SRF contract amendments'),
    ('srf_contract_changes', '/samples/completed', 'never', 'view', 'SRF contract amendments'),
    ('org_positions', '/general-requirements/organisation-chart', 'edit', 'view', 'organisation chart')
  ) AS v(t, p, w, r, n)
  ON CONFLICT (table_name, module_path) DO NOTHING;
  SELECT count(*) INTO v_installed FROM public.app_module_access_install() WHERE status = 'installed';
  RAISE NOTICE 'module access re-installed on % tables', v_installed;
END $$;

NOTIFY pgrst, 'reload schema';
