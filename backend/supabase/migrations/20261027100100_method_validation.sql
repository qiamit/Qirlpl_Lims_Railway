-- ISO/IEC 17025 gap P1-7: selection, verification and validation of methods
-- (7.2.1.4 latest valid edition, 7.2.1.5 verification of standard methods,
-- 7.2.2 validation of non-standard / lab-developed / modified methods).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and
-- 20261024100300_report_issue_signature.sql (app_jwt_password_auth_at, used
-- when present), while the lab is idle. Safe to re-run.
--
-- What it adds
--   is_codes.standard_status   current | withdrawn | superseded | under_review
--   is_codes.superseded_by     the standard that replaces it (free text)
--   is_codes.last_reviewed_on  when the lab last checked it is the latest
--   is_codes.next_review_due   valid edition (7.2.1.4); the IS code master
--                              shows a "review due" badge from these.
--   method_verifications       one record per verification (standard method,
--                              7.2.1.5) or validation (non-standard, lab
--                              developed or modified method, 7.2.2): protocol,
--                              performance characteristics with acceptance
--                              criterion / observed value / pass, conclusion,
--                              performed / reviewed / approved, attachments
--                              (bucket method-validation-files), valid until.
--                              Record numbers MV-YYYY-NNN (verification) and
--                              VAL-YYYY-NNN (validation) are set by the
--                              database.
--   nabl_scope.method_verification_id
--   calibration_nabl_scope.method_verification_id
--                              optional explicit link from a scope row to the
--                              verification / validation that covers it.
--   method_verification_status_for_scope()
--                              every NABL scope row (testing + calibration,
--                              deleted rows excluded) with the approved
--                              verification / validation that covers it and a
--                              coverage of verified | expired | not_fit |
--                              missing. SECURITY INVOKER (caller's RLS).
--   method_verification_check(scope_kind, method, parameter, linked_id)
--                              same rule for one (possibly unsaved) scope row;
--                              used by the NABL scope screens before saving.
--
-- Approval and versions
--   Only the Laboratory Director, the Quality Manager or a Technical Manager
--   may approve (status -> approved). Approval needs a password confirmation
--   (approved_reauthenticated_at; the JWT password time wins when present, as
--   for report issue) and is stamped by the database: approved_by =
--   auth.uid(), approved_by_name from user_profiles, approved_on = today.
--   Approved and superseded records are read-only for app users (guard
--   trigger). A change is a NEW VERSION: insert a row with supersedes_id =
--   the approved record; it keeps the record number, gets version + 1, and
--   when it is approved the previous version becomes "superseded"
--   automatically. An approver may also retire an approved record on its own
--   (approved -> superseded, nothing else changed). Only draft / under review
--   records can be deleted (by their author or an approver).
--
-- Matching a scope row to a verification (in this order)
--   1. linked   scope.method_verification_id -> the latest approved version of
--               that record number.
--   2. parameter  approved record whose method (method_reference, the linked
--               test parameter's test_method, or the linked IS code number +
--               year) equals the scope method AND whose test parameter name
--               equals the scope parameter (testing only).
--   3. method   same method text, any parameter.
--   4. method_edition  same method once a trailing edition year is ignored
--               (e.g. "IS 516 (Part 1/Sec 1)" vs "... :2021"); the UI shows it
--               as a weaker match so the edition can be checked (7.2.1.4).
--   Method texts are compared case-insensitively ignoring spaces/punctuation.
--
-- Gate choice (accredited scope without approved verification)
--   SOFT gate, deliberately. Production already has accredited scope rows
--   without any verification record, and the lab needs time to record them.
--   Triggers on nabl_scope (rows with scope_status = 'Accredited') and
--   calibration_nabl_scope raise a WARNING (not an error) when a row is added
--   or set accredited, or its method / link changes, and nothing covers it.
--   The UI calls method_verification_check() and shows a warning badge; the
--   Scope Verification Status page lists the gaps. Existing rows are never
--   touched. To turn it into a hard block for NEW / CHANGED rows later,
--   replace app_mv_scope_gate_mode() to return 'block' (one statement).
--
-- Access
--   Read: known staff. Create / edit drafts: known staff. Approve: Director,
--   Quality Manager, Technical Manager. Restrictive gate lims_known_staff_only
--   like every other public table. Audit trail on method_verifications.
--   Soft delete (20261025100000) is not applied to method_verifications (that
--   migration has no per-table setup function); only drafts can be deleted
--   and the delete stays in the audit trail.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.is_codes') IS NULL
     OR to_regclass('public.test_parameters') IS NULL
     OR to_regclass('public.nabl_scope') IS NULL
     OR to_regclass('public.calibration_nabl_scope') IS NULL THEN
    RAISE EXCEPTION 'is_codes, test_parameters, nabl_scope and calibration_nabl_scope must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. IS codes: standard status and review dates (7.2.1.4)
-- ---------------------------------------------------------------------------

ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS standard_status text NOT NULL DEFAULT 'current';
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS superseded_by text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS last_reviewed_on date;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS next_review_due date;

ALTER TABLE public.is_codes DROP CONSTRAINT IF EXISTS is_codes_standard_status_check;
ALTER TABLE public.is_codes ADD CONSTRAINT is_codes_standard_status_check
  CHECK (standard_status IN ('current', 'withdrawn', 'superseded', 'under_review'));

CREATE INDEX IF NOT EXISTS idx_is_codes_next_review_due
  ON public.is_codes (next_review_due) WHERE next_review_due IS NOT NULL;

COMMENT ON COLUMN public.is_codes.standard_status IS
  'current | withdrawn | superseded | under_review (ISO/IEC 17025 7.2.1.4 latest valid edition).';
COMMENT ON COLUMN public.is_codes.superseded_by IS 'Standard that replaces this one, e.g. "IS 456:2000".';
COMMENT ON COLUMN public.is_codes.last_reviewed_on IS 'When the lab last confirmed this is the latest valid edition.';
COMMENT ON COLUMN public.is_codes.next_review_due IS 'When the edition must be checked again.';

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Director, Quality Manager or a Technical Manager.
CREATE OR REPLACE FUNCTION public.app_mv_can_approve()
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

REVOKE ALL ON FUNCTION public.app_mv_can_approve() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mv_can_approve() TO authenticated, service_role;

-- Method text for comparison: lower case, letters and digits only.
CREATE OR REPLACE FUNCTION public.app_mv_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]+', '', 'g'));
$$;

-- Same, without a trailing edition / reaffirmation year
-- ("IS 516 (Part 1/Sec 1):2021", "IS 383 - 2016 RA 2021" -> no year).
CREATE OR REPLACE FUNCTION public.app_mv_norm_base(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.app_mv_norm(
    regexp_replace(
      coalesce(p, ''),
      '([[:space:]]*(RA|reaffirmed|reaff\.?)?[[:space:]]*[:,/(–-]?[[:space:]]*(19|20)[0-9]{2}[[:space:]]*\)?)+[[:space:]]*$',
      '',
      'i'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.app_mv_norm(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_mv_norm_base(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mv_norm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_mv_norm_base(text) TO authenticated, service_role;

-- 'warn' (default): a scope row without an approved verification only raises
-- a WARNING. Replace with 'block' to refuse NEW / CHANGED accredited rows.
CREATE OR REPLACE FUNCTION public.app_mv_scope_gate_mode()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'warn'::text;
$$;

REVOKE ALL ON FUNCTION public.app_mv_scope_gate_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mv_scope_gate_mode() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. method_verifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.method_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_no text NOT NULL,
  version int NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.method_verifications (id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'verification',
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE SET NULL,
  is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  method_reference text NOT NULL,
  method_type text NOT NULL DEFAULT 'standard',
  scope_note text,
  protocol text,
  -- [{"characteristic": "repeatability", "acceptance_criterion": "RSD <= 2 %",
  --   "observed": "1.4", "unit": "%", "pass": true}]
  performance_characteristics jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion text,
  performed_by text,
  performed_on date,
  reviewed_by text,
  approved_by uuid DEFAULT NULL,
  approved_by_name text,
  approved_on date,
  approved_reauthenticated_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  -- [{"path": "<id>/<uuid>_report.pdf", "name": "report.pdf", "uploaded_at": "..."}]
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_until date,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT method_verifications_kind_check CHECK (kind IN ('verification', 'validation')),
  CONSTRAINT method_verifications_method_type_check
    CHECK (method_type IN ('standard', 'non_standard', 'lab_developed', 'modified_standard')),
  -- 7.2.1.5: a standard method used as published is verified;
  -- 7.2.2.1: anything else is validated.
  CONSTRAINT method_verifications_kind_type_check CHECK (
    (kind = 'verification' AND method_type = 'standard')
    OR (kind = 'validation' AND method_type <> 'standard')
  ),
  CONSTRAINT method_verifications_conclusion_check
    CHECK (conclusion IS NULL OR conclusion IN ('fit_for_purpose', 'not_fit', 'conditional')),
  CONSTRAINT method_verifications_status_check
    CHECK (status IN ('draft', 'under_review', 'approved', 'superseded')),
  CONSTRAINT method_verifications_method_check CHECK (btrim(method_reference) <> ''),
  CONSTRAINT method_verifications_pc_check CHECK (jsonb_typeof(performance_characteristics) = 'array'),
  CONSTRAINT method_verifications_attachments_check CHECK (jsonb_typeof(attachments) = 'array'),
  CONSTRAINT method_verifications_version_check CHECK (version >= 1),
  CONSTRAINT method_verifications_approved_check CHECK (
    status NOT IN ('approved', 'superseded') OR (conclusion IS NOT NULL AND approved_on IS NOT NULL)
  ),
  CONSTRAINT method_verifications_valid_until_check
    CHECK (valid_until IS NULL OR performed_on IS NULL OR valid_until >= performed_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS method_verifications_record_version_key
  ON public.method_verifications (record_no, version);
CREATE INDEX IF NOT EXISTS idx_method_verifications_status ON public.method_verifications (status);
CREATE INDEX IF NOT EXISTS idx_method_verifications_tp ON public.method_verifications (test_parameter_id);
CREATE INDEX IF NOT EXISTS idx_method_verifications_is_code ON public.method_verifications (is_code_id);
CREATE INDEX IF NOT EXISTS idx_method_verifications_supersedes ON public.method_verifications (supersedes_id);
CREATE INDEX IF NOT EXISTS idx_method_verifications_method_norm
  ON public.method_verifications (public.app_mv_norm(method_reference));

COMMENT ON TABLE public.method_verifications IS
  'Verification (ISO/IEC 17025 7.2.1.5) and validation (7.2.2) records of test / calibration methods. Approved rows are read-only; changes are new versions (supersedes_id).';

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_method_verifications_updated_at ON public.method_verifications;
  CREATE TRIGGER trg_method_verifications_updated_at
    BEFORE UPDATE ON public.method_verifications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
END $$;

-- ---------------------------------------------------------------------------
-- 4. Guard: numbering, versions, approval, read-only once approved
-- ---------------------------------------------------------------------------

-- Profile name of a user (user_profiles may be hidden by RLS).
CREATE OR REPLACE FUNCTION public.app_mv_profile_name(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(up.full_name), '') FROM public.user_profiles up WHERE up.id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.app_mv_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mv_profile_name(uuid) TO authenticated, service_role;

-- SECURITY INVOKER on purpose: callers running as authenticated / anon are
-- "the app"; the owner (e.g. the after-approve trigger below), service_role
-- and scripts are not limited.
CREATE OR REPLACE FUNCTION public.method_verifications_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_uid uuid := auth.uid();
  old_rec public.method_verifications%ROWTYPE;
  v_prefix text;
  v_year text;
  v_next int;
  v_name text;
  v_pw_at timestamptz;
  v_bad_pc int;
  v_fail int;
BEGIN
  IF NOT v_app THEN
    IF TG_OP = 'INSERT' AND (NEW.record_no IS NULL OR btrim(NEW.record_no) = '') THEN
      NULL; -- numbered below
    ELSE
      RETURN coalesce(NEW, OLD);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('draft', 'under_review') THEN
      RAISE EXCEPTION 'An approved verification / validation record cannot be deleted.'
        USING ERRCODE = '42501',
              HINT = 'Create a new version instead (ISO/IEC 17025 7.5.2).';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_app THEN
      NEW.created_by := v_uid;
      NEW.created_at := now();
      IF NEW.status NOT IN ('draft', 'under_review') THEN
        RAISE EXCEPTION 'A new verification / validation record starts as draft or under review.'
          USING ERRCODE = '42501';
      END IF;
      NEW.approved_by := NULL;
      NEW.approved_by_name := NULL;
      NEW.approved_on := NULL;
      NEW.approved_reauthenticated_at := NULL;
    END IF;

    IF NEW.supersedes_id IS NOT NULL THEN
      SELECT * INTO old_rec FROM public.method_verifications WHERE id = NEW.supersedes_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The record being revised does not exist' USING ERRCODE = '23503';
      END IF;
      IF old_rec.status <> 'approved' THEN
        RAISE EXCEPTION 'Only an approved record can be revised (record % is %).', old_rec.record_no, old_rec.status
          USING ERRCODE = '42501';
      END IF;
      IF old_rec.kind <> NEW.kind THEN
        RAISE EXCEPTION 'A new version must keep the kind (%).', old_rec.kind USING ERRCODE = '22023';
      END IF;
      NEW.record_no := old_rec.record_no;
      NEW.version := old_rec.version + 1;
      IF EXISTS (
        SELECT 1 FROM public.method_verifications m
        WHERE m.record_no = old_rec.record_no AND m.version = NEW.version
      ) THEN
        RAISE EXCEPTION 'Version % of % is already being prepared.', NEW.version, old_rec.record_no
          USING ERRCODE = '23505';
      END IF;
    ELSE
      NEW.version := 1;
      v_prefix := CASE WHEN NEW.kind = 'validation' THEN 'VAL' ELSE 'MV' END;
      v_year := to_char(coalesce(NEW.performed_on, current_date), 'YYYY');
      PERFORM pg_advisory_xact_lock(hashtext('method_verifications:' || v_prefix || v_year));
      SELECT coalesce(max(substring(m.record_no FROM '([0-9]+)$')::int), 0) + 1
        INTO v_next
        FROM public.method_verifications m
       WHERE m.record_no ~ ('^' || v_prefix || '-' || v_year || '-[0-9]+$');
      NEW.record_no := v_prefix || '-' || v_year || '-' || lpad(v_next::text, 3, '0');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by an app user
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.record_no IS DISTINCT FROM OLD.record_no
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.supersedes_id IS NOT NULL AND NEW.kind IS DISTINCT FROM OLD.kind) THEN
    RAISE EXCEPTION 'Record number, version, kind of a revision and author cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('approved', 'superseded') THEN
    IF OLD.status = 'approved' AND NEW.status = 'superseded'
       AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      IF NOT public.app_mv_can_approve() THEN
        RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can retire an approved record.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Approved verification / validation records are read-only. Create a new version instead.'
      USING ERRCODE = '42501',
            HINT = 'ISO/IEC 17025 7.2.1.5 / 7.2.2.4 / 7.5.2.';
  END IF;

  IF NEW.status = 'superseded' THEN
    RAISE EXCEPTION 'A draft cannot be marked superseded. Delete it or approve it.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'approved' THEN
    IF NOT public.app_mv_can_approve() THEN
      RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can approve.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.conclusion IS NULL THEN
      RAISE EXCEPTION 'Record the conclusion before approval.' USING ERRCODE = '23514';
    END IF;
    IF jsonb_array_length(NEW.performance_characteristics) = 0 THEN
      RAISE EXCEPTION 'Record at least one performance characteristic before approval.' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) FILTER (
             WHERE jsonb_typeof(e) <> 'object'
                OR btrim(coalesce(e ->> 'characteristic', '')) = ''
                OR jsonb_typeof(e -> 'pass') IS DISTINCT FROM 'boolean'),
           count(*) FILTER (WHERE jsonb_typeof(e) = 'object' AND (e -> 'pass') = 'false'::jsonb)
      INTO v_bad_pc, v_fail
      FROM jsonb_array_elements(NEW.performance_characteristics) e;
    IF v_bad_pc > 0 THEN
      RAISE EXCEPTION 'Every performance characteristic needs a name and a pass / fail decision before approval.'
        USING ERRCODE = '23514';
    END IF;
    IF v_fail > 0 AND NEW.conclusion = 'fit_for_purpose' THEN
      RAISE EXCEPTION '% characteristic(s) failed: the conclusion cannot be "fit for purpose". Use "conditional" or "not fit".', v_fail
        USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_reauthenticated_at IS NULL THEN
      RAISE EXCEPTION 'Confirm your password to approve.' USING ERRCODE = '28000';
    END IF;
    IF to_regprocedure('public.app_jwt_password_auth_at()') IS NOT NULL THEN
      EXECUTE 'SELECT public.app_jwt_password_auth_at()' INTO v_pw_at;
    END IF;
    IF v_pw_at IS NOT NULL THEN
      IF v_pw_at < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'Password confirmation has expired. Confirm your password again to approve.'
          USING ERRCODE = '28000';
      END IF;
      NEW.approved_reauthenticated_at := v_pw_at;
    ELSE
      NEW.approved_reauthenticated_at := LEAST(NEW.approved_reauthenticated_at, now());
    END IF;
    v_name := public.app_mv_profile_name(v_uid);
    NEW.approved_by := v_uid;
    NEW.approved_by_name := coalesce(v_name, nullif(btrim(NEW.approved_by_name), ''));
    NEW.approved_on := current_date;
    RETURN NEW;
  END IF;

  -- Still draft / under review: approval fields stay empty.
  NEW.approved_by := NULL;
  NEW.approved_by_name := NULL;
  NEW.approved_on := NULL;
  NEW.approved_reauthenticated_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.method_verifications_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_method_verifications_guard ON public.method_verifications;
CREATE TRIGGER trg_method_verifications_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.method_verifications
  FOR EACH ROW EXECUTE FUNCTION public.method_verifications_guard();

-- When a new version is approved, the previous approved version is superseded.
CREATE OR REPLACE FUNCTION public.method_verifications_after_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.method_verifications
       SET status = 'superseded'
     WHERE record_no = NEW.record_no
       AND id <> NEW.id
       AND version < NEW.version
       AND status = 'approved';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.method_verifications_after_approve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_method_verifications_after_approve ON public.method_verifications;
CREATE TRIGGER trg_method_verifications_after_approve
  AFTER UPDATE OF status ON public.method_verifications
  FOR EACH ROW EXECUTE FUNCTION public.method_verifications_after_approve();

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.method_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS method_verifications_select ON public.method_verifications;
CREATE POLICY method_verifications_select ON public.method_verifications
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS method_verifications_insert ON public.method_verifications;
CREATE POLICY method_verifications_insert ON public.method_verifications
  FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS method_verifications_update ON public.method_verifications;
CREATE POLICY method_verifications_update ON public.method_verifications
  FOR UPDATE TO authenticated
  USING (status IN ('draft', 'under_review') OR public.app_mv_can_approve())
  WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS method_verifications_delete ON public.method_verifications;
CREATE POLICY method_verifications_delete ON public.method_verifications
  FOR DELETE TO authenticated
  USING (status IN ('draft', 'under_review') AND (created_by = auth.uid() OR public.app_mv_can_approve()));

DROP POLICY IF EXISTS lims_known_staff_only ON public.method_verifications;
CREATE POLICY lims_known_staff_only ON public.method_verifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff());

REVOKE ALL ON public.method_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.method_verifications TO authenticated;
GRANT ALL ON public.method_verifications TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Links from the NABL scope
-- ---------------------------------------------------------------------------

ALTER TABLE public.nabl_scope
  ADD COLUMN IF NOT EXISTS method_verification_id uuid
  REFERENCES public.method_verifications (id) ON DELETE SET NULL;
ALTER TABLE public.calibration_nabl_scope
  ADD COLUMN IF NOT EXISTS method_verification_id uuid
  REFERENCES public.method_verifications (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nabl_scope_method_verification
  ON public.nabl_scope (method_verification_id) WHERE method_verification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calibration_nabl_scope_method_verification
  ON public.calibration_nabl_scope (method_verification_id) WHERE method_verification_id IS NOT NULL;

COMMENT ON COLUMN public.nabl_scope.method_verification_id IS
  'Verification / validation record covering this scope row (ISO/IEC 17025 7.2.1.5 / 7.2.2). Optional: rows are also matched by method text.';
COMMENT ON COLUMN public.calibration_nabl_scope.method_verification_id IS
  'Verification / validation record covering this scope row (ISO/IEC 17025 7.2.1.5 / 7.2.2). Optional: rows are also matched by method text.';

-- ---------------------------------------------------------------------------
-- 7. Matching and coverage
-- ---------------------------------------------------------------------------

-- Best approved record for a scope row. SECURITY INVOKER: caller's RLS.
DROP FUNCTION IF EXISTS public.app_mv_best_for(text, text, text, uuid);
CREATE FUNCTION public.app_mv_best_for(
  p_scope_kind text,
  p_method text,
  p_parameter text,
  p_linked_id uuid
)
RETURNS TABLE (verification_id uuid, match_source text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH arg AS (
    SELECT public.app_mv_norm(p_method) AS m,
           public.app_mv_norm_base(p_method) AS mb,
           public.app_mv_norm(p_parameter) AS p,
           (SELECT l.record_no FROM public.method_verifications l WHERE l.id = p_linked_id) AS linked_no
  ),
  cand AS (
    SELECT mv.id, mv.approved_on, mv.version, mv.conclusion,
           ARRAY[
             public.app_mv_norm(mv.method_reference),
             public.app_mv_norm(tp.test_method),
             public.app_mv_norm(ic.is_number || coalesce(':' || nullif(btrim(ic.revision_year), ''), ''))
           ] AS ms,
           ARRAY[
             public.app_mv_norm_base(mv.method_reference),
             public.app_mv_norm_base(tp.test_method),
             public.app_mv_norm(ic.is_number)
           ] AS mbs,
           public.app_mv_norm(tp.item_name) AS tp_name
    FROM public.method_verifications mv
    LEFT JOIN public.test_parameters tp ON tp.id = mv.test_parameter_id
    LEFT JOIN public.is_codes ic ON ic.id = mv.is_code_id
    WHERE mv.status = 'approved'
  ),
  ranked AS (
    SELECT c.*,
           CASE
             WHEN a.linked_no IS NOT NULL
                  AND c.id IN (SELECT x.id FROM public.method_verifications x WHERE x.record_no = a.linked_no) THEN 1
             WHEN a.m <> '' AND a.m = ANY (c.ms) AND p_scope_kind = 'testing'
                  AND a.p <> '' AND c.tp_name = a.p THEN 2
             WHEN a.m <> '' AND a.m = ANY (c.ms) THEN 3
             WHEN a.mb <> '' AND a.mb = ANY (c.mbs) THEN 4
           END AS rnk
    FROM cand c CROSS JOIN arg a
  )
  SELECT r.id,
         CASE r.rnk WHEN 1 THEN 'linked' WHEN 2 THEN 'parameter' WHEN 3 THEN 'method' ELSE 'method_edition' END
  FROM ranked r
  WHERE r.rnk IS NOT NULL
  ORDER BY r.rnk,
           (r.conclusion IN ('fit_for_purpose', 'conditional')) DESC,
           r.approved_on DESC NULLS LAST,
           r.version DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.app_mv_best_for(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mv_best_for(text, text, text, uuid) TO authenticated, service_role;

-- Coverage of one scope row (saved or not yet saved).
DROP FUNCTION IF EXISTS public.method_verification_check(text, text, text, uuid);
CREATE FUNCTION public.method_verification_check(
  p_scope_kind text,
  p_method text,
  p_parameter text DEFAULT NULL,
  p_linked_id uuid DEFAULT NULL
)
RETURNS TABLE (
  covered boolean,
  coverage text,
  verification_id uuid,
  record_no text,
  version int,
  kind text,
  conclusion text,
  approved_on date,
  valid_until date,
  match_source text,
  standard_status text,
  pending_record_no text,
  message text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH best AS (
    SELECT b.verification_id, b.match_source
    FROM public.app_mv_best_for(coalesce(p_scope_kind, 'testing'), p_method, p_parameter, p_linked_id) b
  ),
  mv AS (
    SELECT m.*, best.match_source, ic.standard_status AS ic_status
    FROM best
    JOIN public.method_verifications m ON m.id = best.verification_id
    LEFT JOIN public.is_codes ic ON ic.id = m.is_code_id
  ),
  pending AS (
    SELECT m.record_no
    FROM public.method_verifications m
    WHERE m.status IN ('draft', 'under_review')
      AND (
        m.id = p_linked_id
        OR (public.app_mv_norm(p_method) <> '' AND public.app_mv_norm(m.method_reference) = public.app_mv_norm(p_method))
        OR (public.app_mv_norm_base(p_method) <> '' AND public.app_mv_norm_base(m.method_reference) = public.app_mv_norm_base(p_method))
      )
    ORDER BY m.updated_at DESC
    LIMIT 1
  ),
  res AS (
    SELECT mv.id, mv.record_no, mv.version, mv.kind, mv.conclusion, mv.approved_on, mv.valid_until,
           mv.match_source, mv.ic_status,
           CASE
             WHEN mv.id IS NULL THEN 'missing'
             WHEN mv.conclusion = 'not_fit' THEN 'not_fit'
             WHEN mv.valid_until IS NOT NULL AND mv.valid_until < current_date THEN 'expired'
             ELSE 'verified'
           END AS cov
    FROM (SELECT 1) one
    LEFT JOIN mv ON true
  )
  SELECT res.cov = 'verified',
         res.cov,
         res.id,
         res.record_no,
         res.version,
         res.kind,
         res.conclusion,
         res.approved_on,
         res.valid_until,
         res.match_source,
         res.ic_status,
         (SELECT pending.record_no FROM pending),
         CASE res.cov
           WHEN 'verified' THEN
             'Covered by ' || res.record_no || ' v' || res.version
             || CASE WHEN res.match_source = 'method_edition' THEN ' (different edition of the method: check it is the latest valid edition)' ELSE '' END
             || CASE WHEN res.ic_status IN ('withdrawn', 'superseded') THEN ' — the standard is marked ' || res.ic_status ELSE '' END
           WHEN 'expired' THEN res.record_no || ' expired on ' || to_char(res.valid_until, 'DD-Mon-YYYY') || '. Re-verify the method.'
           WHEN 'not_fit' THEN res.record_no || ' concluded the method is NOT fit for purpose.'
           ELSE 'No approved verification / validation for this method (ISO/IEC 17025 7.2.1.5 / 7.2.2).'
         END
  FROM res;
$$;

REVOKE ALL ON FUNCTION public.method_verification_check(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.method_verification_check(text, text, text, uuid) TO authenticated, service_role;

-- Coverage of the whole NABL scope (testing + calibration, deleted rows excluded).
DROP FUNCTION IF EXISTS public.method_verification_status_for_scope();
CREATE FUNCTION public.method_verification_status_for_scope()
RETURNS TABLE (
  scope_kind text,
  scope_id uuid,
  s_no int,
  discipline text,
  item text,
  parameter text,
  method text,
  scope_status text,
  linked_verification_id uuid,
  covered boolean,
  coverage text,
  verification_id uuid,
  record_no text,
  version int,
  kind text,
  conclusion text,
  approved_on date,
  valid_until date,
  match_source text,
  standard_status text,
  pending_record_no text,
  message text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH rows AS (
    SELECT 'testing'::text AS scope_kind,
           s.id AS scope_id,
           s.s_no,
           s.discipline_group AS discipline,
           s.materials_products AS item,
           s.component_parameter AS parameter,
           s.test_method_specification AS method,
           s.scope_status,
           s.method_verification_id AS linked_id
    FROM public.nabl_scope s
    WHERE (to_jsonb(s) ->> 'deleted_at') IS NULL
    UNION ALL
    SELECT 'calibration'::text,
           c.id,
           c.s_no,
           coalesce(nullif(btrim(to_jsonb(c) ->> 'discipline_name'), ''), nullif(btrim(to_jsonb(c) ->> 'group_name'), '')),
           nullif(btrim(to_jsonb(c) ->> 'group_name'), ''),
           c.measurand,
           c.calibration_method,
           'Accredited'::text,
           c.method_verification_id
    FROM public.calibration_nabl_scope c
    WHERE (to_jsonb(c) ->> 'deleted_at') IS NULL
  )
  SELECT r.scope_kind, r.scope_id, r.s_no, r.discipline, r.item, r.parameter, r.method, r.scope_status,
         r.linked_id,
         k.covered, k.coverage, k.verification_id, k.record_no, k.version, k.kind, k.conclusion,
         k.approved_on, k.valid_until, k.match_source, k.standard_status, k.pending_record_no, k.message
  FROM rows r
  CROSS JOIN LATERAL public.method_verification_check(r.scope_kind, r.method, r.parameter, r.linked_id) k
  ORDER BY r.scope_kind DESC, r.s_no;
$$;

REVOKE ALL ON FUNCTION public.method_verification_status_for_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.method_verification_status_for_scope() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Soft gate on the NABL scope (WARNING; see header)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nabl_scope_method_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text := CASE WHEN TG_TABLE_NAME = 'calibration_nabl_scope' THEN 'calibration' ELSE 'testing' END;
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_method_col text := CASE WHEN v_kind = 'calibration' THEN 'calibration_method' ELSE 'test_method_specification' END;
  v_param_col text := CASE WHEN v_kind = 'calibration' THEN 'measurand' ELSE 'component_parameter' END;
  v_relevant boolean;
  r record;
BEGIN
  -- Scripts / service role are not checked; deleted rows are not checked.
  IF auth.uid() IS NULL OR (v_new ->> 'deleted_at') IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF v_kind = 'testing' AND coalesce(v_new ->> 'scope_status', '') <> 'Accredited' THEN
    RETURN NEW;
  END IF;
  v_relevant := TG_OP = 'INSERT'
    OR (v_new ->> 'scope_status') IS DISTINCT FROM (v_old ->> 'scope_status')
    OR (v_new ->> v_method_col) IS DISTINCT FROM (v_old ->> v_method_col)
    OR (v_new ->> v_param_col) IS DISTINCT FROM (v_old ->> v_param_col)
    OR (v_new ->> 'method_verification_id') IS DISTINCT FROM (v_old ->> 'method_verification_id');
  IF NOT v_relevant THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r
  FROM public.method_verification_check(
    v_kind, v_new ->> v_method_col, v_new ->> v_param_col, (v_new ->> 'method_verification_id')::uuid);

  IF r.covered IS NOT TRUE THEN
    IF public.app_mv_scope_gate_mode() = 'block' THEN
      RAISE EXCEPTION 'Scope row "%": %', v_new ->> v_method_col, r.message
        USING ERRCODE = '23514',
              HINT = 'Approve a method verification / validation first (ISO/IEC 17025 7.2.1.5 / 7.2.2).';
    END IF;
    RAISE WARNING 'Scope row "%": %', v_new ->> v_method_col, r.message;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.nabl_scope_method_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_nabl_scope_method_gate ON public.nabl_scope;
CREATE TRIGGER trg_nabl_scope_method_gate
  BEFORE INSERT OR UPDATE ON public.nabl_scope
  FOR EACH ROW EXECUTE FUNCTION public.nabl_scope_method_gate();

DROP TRIGGER IF EXISTS trg_calibration_nabl_scope_method_gate ON public.calibration_nabl_scope;
CREATE TRIGGER trg_calibration_nabl_scope_method_gate
  BEFORE INSERT OR UPDATE ON public.calibration_nabl_scope
  FOR EACH ROW EXECUTE FUNCTION public.nabl_scope_method_gate();

-- ---------------------------------------------------------------------------
-- 9. Attachments bucket (private, signed URLs; same pattern as is-code-files).
--    Path: <method_verifications.id>/<uuid>_<file name>.
--    Files of an approved / superseded record cannot be deleted.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; method-validation-files bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'method-validation-files',
    'method-validation-files',
    false,
    52428800,
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/octet-stream'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_method_validation_files_select ON storage.objects;
  CREATE POLICY lims_method_validation_files_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'method-validation-files' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_method_validation_files_insert ON storage.objects;
  CREATE POLICY lims_method_validation_files_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'method-validation-files' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_method_validation_files_delete ON storage.objects;
  CREATE POLICY lims_method_validation_files_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'method-validation-files'
      AND public.app_is_known_staff()
      AND NOT EXISTS (
        SELECT 1
        FROM public.method_verifications mv
        WHERE mv.status IN ('approved', 'superseded')
          AND mv.attachments @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- 10. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: method_verifications is not audited yet';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS method_verifications_audit_log ON public.method_verifications;
  CREATE TRIGGER method_verifications_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON public.method_verifications
    FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
END $$;

NOTIFY pgrst, 'reload schema';
