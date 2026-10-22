-- ISO/IEC 17025 gap P1-4: personnel competence (6.2.2 - 6.2.6).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and the
-- test_parameters / calibration_nabl_scope tables, while the lab is idle.
-- Safe to re-run.
--
-- What it adds
--   competence_requirements   What each role (designation) needs: education,
--                             qualification, experience, training, skill,
--                             knowledge (6.2.2).
--   personnel_qualifications  Evidence held per person (degree, certificate,
--                             experience letter...), optionally linked to the
--                             requirement it meets, and its verification.
--   training_records          Trainings held (induction, internal, external,
--                             on the job), record_no TR-YYYY-NNN by the
--                             database when not given (6.2.5 b).
--   training_attendees        Who attended, score / pass, and the later
--                             effectiveness review (6.2.5 b, 7.1 of NABL 160).
--   competence_monitoring     Supervision / monitoring of competence by
--                             witnessing, replicate testing, retained or blind
--                             samples, PT / ILC and review of records
--                             (6.2.5 d, e).
--   personnel_authorizations  The authorization matrix (6.2.5 f, 6.2.6):
--                             person x activity x (test parameter | calibration
--                             scope line | discipline / group | whole
--                             activity), valid from / to, by whom, on what
--                             basis, and active / suspended / withdrawn.
--                             The person, activity and scope of a grant cannot
--                             be changed afterwards: withdraw it and grant
--                             again. Withdrawn is final.
--   authorization_exceptions  Every time the app let someone go ahead without
--                             a matching authorization: 'warn' (matrix not in
--                             use yet for that activity; anyone may record it
--                             with a reason) or 'override' (matrix in use; only
--                             the Laboratory Director). Append-only.
--   app_is_authorized(user, activity, test_parameter, calibration_scope, on)
--                             true when an active grant valid on that date
--                             matches, in this order: the exact parameter /
--                             scope line, else a discipline / group grant that
--                             covers it, else a whole-activity grant. With no
--                             parameter and no scope line, any active grant of
--                             that activity counts.
--                             Discipline / group matching (case-insensitive):
--                               testing      discipline = test_parameters.department,
--                                            group_name = IS code (is_codes.is_number
--                                            or test_parameters.is_code_label)
--                               calibration  discipline = calibration_nabl_scope.discipline_name,
--                                            group_name = calibration_nabl_scope.group_name
--   app_authorization_check(user, activity, parameter ids, scope ids, on)
--                             One call for the app: whether the matrix is in use
--                             for the activity (enforced), whether the person
--                             holds the activity at all and which of the given
--                             parameters / scope lines are not covered.
--   Storage bucket personnel-records (private) for certificates, training
--   material and other evidence.
--
-- Access
--   Read: known staff. Requirements, qualifications, trainings, attendees and
--   monitoring: Laboratory Director, Quality Manager or a Technical Manager.
--   Authorizations: Laboratory Director or Quality Manager only.
--   Deletes: Laboratory Director only (records are kept; use status / active).
--   Restrictive gate lims_known_staff_only like every other public table.
--
-- Foreign keys to test_parameters / calibration_nabl_scope are ON DELETE
-- RESTRICT: those masters are soft-deleted (20261025100000); purging a line
-- that is referenced by a competence record is refused.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.test_parameters') IS NULL
     OR to_regclass('public.calibration_nabl_scope') IS NULL THEN
    RAISE EXCEPTION 'user_profiles, test_parameters and calibration_nabl_scope must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may maintain competence records / grant authorizations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_competence_is_qm()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_quality_manager()' INTO v_ok;
  END IF;
  RETURN coalesce(v_ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_competence_can_authorize()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_laboratory_director() OR public.app_competence_is_qm();
$$;

CREATE OR REPLACE FUNCTION public.app_competence_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_competence_can_authorize()
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'technical manager'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
$$;

REVOKE ALL ON FUNCTION public.app_competence_is_qm() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_competence_can_authorize() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_competence_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_competence_is_qm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_competence_can_authorize() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_competence_can_manage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.competence_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  department text,
  requirement_type text NOT NULL,
  description text NOT NULL,
  minimum_level text,
  mandatory boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competence_requirements_role_check CHECK (btrim(role) <> ''),
  CONSTRAINT competence_requirements_description_check CHECK (btrim(description) <> ''),
  CONSTRAINT competence_requirements_type_check CHECK (
    requirement_type IN ('education', 'qualification', 'experience', 'training', 'skill', 'knowledge')
  )
);

CREATE INDEX IF NOT EXISTS idx_competence_requirements_role
  ON public.competence_requirements (lower(btrim(role)));

CREATE TABLE IF NOT EXISTS public.personnel_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  qualification_type text NOT NULL,
  title text NOT NULL,
  institution text,
  year int,
  requirement_id uuid REFERENCES public.competence_requirements (id) ON DELETE SET NULL,
  document_path text,
  verified_by uuid,
  verified_by_name text,
  verified_on date,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_qualifications_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT personnel_qualifications_type_check CHECK (
    qualification_type IN ('education', 'qualification', 'experience', 'training', 'skill', 'knowledge')
  ),
  CONSTRAINT personnel_qualifications_year_check CHECK (year IS NULL OR year BETWEEN 1940 AND 2100)
);

CREATE INDEX IF NOT EXISTS idx_personnel_qualifications_user
  ON public.personnel_qualifications (user_id);

CREATE TABLE IF NOT EXISTS public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_no text,
  title text NOT NULL,
  topic text,
  training_type text NOT NULL DEFAULT 'internal',
  trainer text,
  held_from date NOT NULL DEFAULT current_date,
  held_to date,
  duration_hours numeric,
  material_path text,
  evaluation_method text,
  requirement_id uuid REFERENCES public.competence_requirements (id) ON DELETE SET NULL,
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE RESTRICT,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_records_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT training_records_type_check CHECK (
    training_type IN ('induction', 'internal', 'external', 'on_the_job')
  ),
  CONSTRAINT training_records_dates_check CHECK (held_to IS NULL OR held_to >= held_from),
  CONSTRAINT training_records_duration_check CHECK (duration_hours IS NULL OR duration_hours BETWEEN 0 AND 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_records_record_no_key
  ON public.training_records (record_no) WHERE record_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_records_held
  ON public.training_records (held_from DESC);

CREATE TABLE IF NOT EXISTS public.training_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.training_records (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  attended boolean NOT NULL DEFAULT true,
  score numeric,
  passed boolean,
  effectiveness_review text,
  effectiveness_rating int,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_on date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_attendees_unique UNIQUE (training_id, user_id),
  CONSTRAINT training_attendees_rating_check CHECK (effectiveness_rating IS NULL OR effectiveness_rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_training_attendees_user
  ON public.training_attendees (user_id);

CREATE TABLE IF NOT EXISTS public.competence_monitoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  method text NOT NULL,
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE RESTRICT,
  calibration_scope_id uuid REFERENCES public.calibration_nabl_scope (id) ON DELETE RESTRICT,
  performed_on date NOT NULL DEFAULT current_date,
  result text NOT NULL,
  reference text,
  pt_participation_id uuid,
  observed_by uuid DEFAULT auth.uid(),
  observed_by_name text,
  remarks text,
  follow_up text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competence_monitoring_method_check CHECK (
    method IN ('witnessing', 'replicate_testing', 'retained_sample', 'pt_ilc', 'blind_sample', 'review_of_records')
  ),
  CONSTRAINT competence_monitoring_result_check CHECK (
    result IN ('satisfactory', 'needs_training', 'unsatisfactory')
  ),
  CONSTRAINT competence_monitoring_target_check CHECK (
    NOT (test_parameter_id IS NOT NULL AND calibration_scope_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_competence_monitoring_user
  ON public.competence_monitoring (user_id, performed_on DESC);

CREATE TABLE IF NOT EXISTS public.personnel_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE RESTRICT,
  activity text NOT NULL,
  scope_kind text,
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE RESTRICT,
  calibration_scope_id uuid REFERENCES public.calibration_nabl_scope (id) ON DELETE RESTRICT,
  discipline text,
  group_name text,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  authorized_by uuid DEFAULT auth.uid(),
  authorized_by_name text,
  authorized_on date NOT NULL DEFAULT current_date,
  basis text,
  status text NOT NULL DEFAULT 'active',
  withdrawn_reason text,
  status_changed_by uuid,
  status_changed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_authorizations_activity_check CHECK (
    activity IN ('perform_test', 'review_results', 'sign_report', 'give_opinion',
                 'calibrate', 'sign_certificate', 'develop_method', 'validate_method')
  ),
  CONSTRAINT personnel_authorizations_scope_kind_check CHECK (
    scope_kind IS NULL OR scope_kind IN ('testing', 'calibration')
  ),
  CONSTRAINT personnel_authorizations_target_check CHECK (
    NOT (test_parameter_id IS NOT NULL AND calibration_scope_id IS NOT NULL)
  ),
  CONSTRAINT personnel_authorizations_status_check CHECK (status IN ('active', 'suspended', 'withdrawn')),
  CONSTRAINT personnel_authorizations_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT personnel_authorizations_reason_check CHECK (
    status = 'active' OR nullif(btrim(withdrawn_reason), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_personnel_authorizations_user
  ON public.personnel_authorizations (user_id, activity);
CREATE INDEX IF NOT EXISTS idx_personnel_authorizations_activity_active
  ON public.personnel_authorizations (activity) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_personnel_authorizations_parameter
  ON public.personnel_authorizations (test_parameter_id) WHERE test_parameter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personnel_authorizations_scope
  ON public.personnel_authorizations (calibration_scope_id) WHERE calibration_scope_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.authorization_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity text NOT NULL,
  user_id uuid,
  user_name text,
  test_parameter_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  calibration_scope_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  mode text NOT NULL,
  reason text NOT NULL,
  record_table text,
  record_id text,
  record_label text,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorization_exceptions_activity_check CHECK (
    activity IN ('perform_test', 'review_results', 'sign_report', 'give_opinion',
                 'calibrate', 'sign_certificate', 'develop_method', 'validate_method')
  ),
  CONSTRAINT authorization_exceptions_mode_check CHECK (mode IN ('warn', 'override')),
  CONSTRAINT authorization_exceptions_reason_check CHECK (btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS idx_authorization_exceptions_created
  ON public.authorization_exceptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authorization_exceptions_user
  ON public.authorization_exceptions (user_id);

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['competence_requirements', 'personnel_qualifications', 'training_records',
                             'training_attendees', 'competence_monitoring', 'personnel_authorizations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Row triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_competence_profile_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(up.full_name), '') FROM public.user_profiles up WHERE up.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.app_competence_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_competence_profile_name(uuid) TO authenticated, service_role;

-- Training record number TR-YYYY-NNN (per year of held_from) when not given.
CREATE OR REPLACE FUNCTION public.training_records_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    IF nullif(btrim(NEW.record_no), '') IS NULL THEN
      v_prefix := 'TR-' || to_char(coalesce(NEW.held_from, current_date), 'YYYY') || '-';
      PERFORM pg_advisory_xact_lock(hashtext('training_records_record_no'));
      SELECT coalesce(max(substring(record_no FROM length(v_prefix) + 1)::int), 0) + 1
        INTO v_next
        FROM public.training_records
       WHERE record_no LIKE v_prefix || '%'
         AND substring(record_no FROM length(v_prefix) + 1) ~ '^[0-9]+$';
      NEW.record_no := v_prefix || lpad(v_next::text, 3, '0');
    ELSE
      NEW.record_no := btrim(NEW.record_no);
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.record_no := coalesce(nullif(btrim(NEW.record_no), ''), OLD.record_no);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.training_records_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_training_records_before_write ON public.training_records;
CREATE TRIGGER trg_training_records_before_write
  BEFORE INSERT OR UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.training_records_before_write();

-- Effectiveness review: the reviewer is the signed-in person.
CREATE OR REPLACE FUNCTION public.training_attendees_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
  END IF;
  IF nullif(btrim(NEW.effectiveness_review), '') IS NULL AND NEW.effectiveness_rating IS NULL THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_by_name := NULL;
    NEW.reviewed_on := NULL;
  ELSIF TG_OP = 'INSERT'
     OR NEW.effectiveness_review IS DISTINCT FROM OLD.effectiveness_review
     OR NEW.effectiveness_rating IS DISTINCT FROM OLD.effectiveness_rating THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.reviewed_by := auth.uid();
    END IF;
    NEW.reviewed_by_name := coalesce(public.app_competence_profile_name(NEW.reviewed_by), NEW.reviewed_by_name);
    NEW.reviewed_on := coalesce(NEW.reviewed_on, current_date);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.training_attendees_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_training_attendees_before_write ON public.training_attendees;
CREATE TRIGGER trg_training_attendees_before_write
  BEFORE INSERT OR UPDATE ON public.training_attendees
  FOR EACH ROW EXECUTE FUNCTION public.training_attendees_before_write();

-- Verification of a qualification: the verifier is the signed-in person.
CREATE OR REPLACE FUNCTION public.personnel_qualifications_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
  END IF;
  IF NEW.verified_on IS NULL THEN
    NEW.verified_by := NULL;
    NEW.verified_by_name := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.verified_on IS DISTINCT FROM OLD.verified_on OR OLD.verified_by IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.verified_by := auth.uid();
    END IF;
    NEW.verified_by_name := coalesce(public.app_competence_profile_name(NEW.verified_by), NEW.verified_by_name);
  ELSE
    NEW.verified_by := OLD.verified_by;
    NEW.verified_by_name := OLD.verified_by_name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.personnel_qualifications_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personnel_qualifications_before_write ON public.personnel_qualifications;
CREATE TRIGGER trg_personnel_qualifications_before_write
  BEFORE INSERT OR UPDATE ON public.personnel_qualifications
  FOR EACH ROW EXECUTE FUNCTION public.personnel_qualifications_before_write();

-- Monitoring: observer defaults to the signed-in person; name from profile.
CREATE OR REPLACE FUNCTION public.competence_monitoring_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    NEW.observed_by := coalesce(NEW.observed_by, auth.uid());
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  IF NEW.observed_by IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.observed_by IS DISTINCT FROM OLD.observed_by
          OR nullif(btrim(NEW.observed_by_name), '') IS NULL) THEN
    NEW.observed_by_name := coalesce(public.app_competence_profile_name(NEW.observed_by), NEW.observed_by_name);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.competence_monitoring_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_competence_monitoring_before_write ON public.competence_monitoring;
CREATE TRIGGER trg_competence_monitoring_before_write
  BEFORE INSERT OR UPDATE ON public.competence_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.competence_monitoring_before_write();

-- Authorizations: who granted, normalised scope, status rules.
-- SECURITY INVOKER on purpose: current_user tells the app (authenticated)
-- apart from the owner / service_role.
CREATE OR REPLACE FUNCTION public.personnel_authorizations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
BEGIN
  NEW.discipline := nullif(btrim(NEW.discipline), '');
  NEW.group_name := nullif(btrim(NEW.group_name), '');
  NEW.withdrawn_reason := nullif(btrim(NEW.withdrawn_reason), '');
  IF NEW.test_parameter_id IS NOT NULL THEN
    NEW.scope_kind := 'testing';
  ELSIF NEW.calibration_scope_id IS NOT NULL THEN
    NEW.scope_kind := 'calibration';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.authorized_by := auth.uid();
    END IF;
    NEW.authorized_by_name := coalesce(public.app_competence_profile_name(NEW.authorized_by), NEW.authorized_by_name);
    IF NEW.status <> 'active' THEN
      NEW.status_changed_by := auth.uid();
      NEW.status_changed_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF v_app THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.activity IS DISTINCT FROM OLD.activity
       OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
       OR NEW.test_parameter_id IS DISTINCT FROM OLD.test_parameter_id
       OR NEW.calibration_scope_id IS DISTINCT FROM OLD.calibration_scope_id
       OR NEW.discipline IS DISTINCT FROM OLD.discipline
       OR NEW.group_name IS DISTINCT FROM OLD.group_name
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
       OR NEW.authorized_on IS DISTINCT FROM OLD.authorized_on THEN
      RAISE EXCEPTION 'The person, activity, scope and grant date of an authorization cannot be changed. Withdraw it and grant a new one.'
        USING ERRCODE = '42501',
              HINT = 'Authorization records are kept as issued (ISO/IEC 17025 6.2.5 f, 7.5).';
    END IF;
    IF OLD.status = 'withdrawn' AND NEW.status IS DISTINCT FROM 'withdrawn' THEN
      RAISE EXCEPTION 'A withdrawn authorization cannot be reactivated. Grant a new one.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_app THEN
    NEW.authorized_by_name := OLD.authorized_by_name;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_by := coalesce(auth.uid(), NEW.status_changed_by);
    NEW.status_changed_at := now();
    IF NEW.status = 'active' THEN
      NEW.withdrawn_reason := NULL;
    END IF;
  ELSIF v_app THEN
    NEW.status_changed_by := OLD.status_changed_by;
    NEW.status_changed_at := OLD.status_changed_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.personnel_authorizations_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personnel_authorizations_before_write ON public.personnel_authorizations;
CREATE TRIGGER trg_personnel_authorizations_before_write
  BEFORE INSERT OR UPDATE ON public.personnel_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.personnel_authorizations_before_write();

-- Exceptions: who recorded it is the signed-in person; append-only for the app.
CREATE OR REPLACE FUNCTION public.authorization_exceptions_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  END IF;
  NEW.reason := btrim(NEW.reason);
  NEW.created_by_name := coalesce(public.app_competence_profile_name(NEW.created_by), NEW.created_by_name);
  IF NEW.user_id IS NOT NULL THEN
    NEW.user_name := coalesce(public.app_competence_profile_name(NEW.user_id), NEW.user_name);
  END IF;
  NEW.test_parameter_ids := coalesce(NEW.test_parameter_ids, '{}'::uuid[]);
  NEW.calibration_scope_ids := coalesce(NEW.calibration_scope_ids, '{}'::uuid[]);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.authorization_exceptions_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_authorization_exceptions_before_insert ON public.authorization_exceptions;
CREATE TRIGGER trg_authorization_exceptions_before_insert
  BEFORE INSERT ON public.authorization_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.authorization_exceptions_before_insert();

-- ---------------------------------------------------------------------------
-- 4. Authorization lookup
--    SECURITY DEFINER so it can be used from triggers / RLS later; it answers
--    only for known staff (and the owner / service_role, auth.uid() NULL).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.app_is_authorized(uuid, text, uuid, uuid, date);
CREATE FUNCTION public.app_is_authorized(
  p_user uuid,
  p_activity text,
  p_test_parameter_id uuid DEFAULT NULL,
  p_calibration_scope_id uuid DEFAULT NULL,
  p_on date DEFAULT current_date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tp AS (
    SELECT lower(btrim(coalesce(t.department, ''))) AS discipline,
           lower(btrim(coalesce(t.is_code_label, ''))) AS code_label,
           lower(btrim(coalesce(ic.is_number, ''))) AS code_no
    FROM public.test_parameters t
    LEFT JOIN public.is_codes ic ON ic.id = t.is_code_id
    WHERE t.id = p_test_parameter_id
  ),
  cs AS (
    SELECT lower(btrim(coalesce(c.discipline_name, ''))) AS discipline,
           lower(btrim(coalesce(c.group_name, ''))) AS grp
    FROM public.calibration_nabl_scope c
    WHERE c.id = p_calibration_scope_id
  )
  SELECT coalesce(p_user IS NOT NULL AND (auth.uid() IS NULL OR public.app_is_known_staff()), false)
     AND EXISTS (
    SELECT 1
    FROM public.personnel_authorizations a
    WHERE a.user_id = p_user
      AND a.activity = p_activity
      AND a.status = 'active'
      AND a.valid_from <= coalesce(p_on, current_date)
      AND (a.valid_to IS NULL OR a.valid_to >= coalesce(p_on, current_date))
      AND (
        -- nothing specific asked: the person holds the activity somewhere
        (p_test_parameter_id IS NULL AND p_calibration_scope_id IS NULL)
        -- whole-activity grant
        OR (a.test_parameter_id IS NULL AND a.calibration_scope_id IS NULL
            AND a.discipline IS NULL AND a.group_name IS NULL)
        -- exact line
        OR (p_test_parameter_id IS NOT NULL AND a.test_parameter_id = p_test_parameter_id)
        OR (p_calibration_scope_id IS NOT NULL AND a.calibration_scope_id = p_calibration_scope_id)
        -- discipline / group of a test parameter
        OR (p_test_parameter_id IS NOT NULL
            AND a.test_parameter_id IS NULL AND a.calibration_scope_id IS NULL
            AND a.scope_kind IS DISTINCT FROM 'calibration'
            AND (a.discipline IS NOT NULL OR a.group_name IS NOT NULL)
            AND EXISTS (
              SELECT 1 FROM tp
              WHERE (a.discipline IS NULL OR lower(a.discipline) = tp.discipline)
                AND (a.group_name IS NULL OR lower(a.group_name) IN (tp.code_label, tp.code_no))
            ))
        -- discipline / group of a calibration scope line
        OR (p_calibration_scope_id IS NOT NULL
            AND a.test_parameter_id IS NULL AND a.calibration_scope_id IS NULL
            AND a.scope_kind IS DISTINCT FROM 'testing'
            AND (a.discipline IS NOT NULL OR a.group_name IS NOT NULL)
            AND EXISTS (
              SELECT 1 FROM cs
              WHERE (a.discipline IS NULL OR lower(a.discipline) = cs.discipline)
                AND (a.group_name IS NULL OR lower(a.group_name) = cs.grp)
            ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_authorized(uuid, text, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_authorized(uuid, text, uuid, uuid, date) TO authenticated, service_role;

-- One round trip for the app:
-- {"enforced": bool, "authorized": bool, "holds_activity": bool,
--  "missing_test_parameter_ids": [...], "missing_calibration_scope_ids": [...]}
-- enforced = at least one active grant of this activity valid on that date
-- exists (for anyone): the matrix is in use for it.
DROP FUNCTION IF EXISTS public.app_authorization_check(uuid, text, uuid[], uuid[], date);
CREATE FUNCTION public.app_authorization_check(
  p_user uuid,
  p_activity text,
  p_test_parameter_ids uuid[] DEFAULT '{}'::uuid[],
  p_calibration_scope_ids uuid[] DEFAULT '{}'::uuid[],
  p_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT coalesce(p_on, current_date) AS on_date),
  params AS (
    SELECT DISTINCT x AS id FROM unnest(coalesce(p_test_parameter_ids, '{}'::uuid[])) x WHERE x IS NOT NULL
  ),
  scopes AS (
    SELECT DISTINCT x AS id FROM unnest(coalesce(p_calibration_scope_ids, '{}'::uuid[])) x WHERE x IS NOT NULL
  ),
  miss_p AS (
    SELECT coalesce(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb) AS ids
    FROM params p, d
    WHERE NOT public.app_is_authorized(p_user, p_activity, p.id, NULL, d.on_date)
  ),
  miss_s AS (
    SELECT coalesce(jsonb_agg(s.id ORDER BY s.id), '[]'::jsonb) AS ids
    FROM scopes s, d
    WHERE NOT public.app_is_authorized(p_user, p_activity, NULL, s.id, d.on_date)
  ),
  holds AS (
    SELECT public.app_is_authorized(p_user, p_activity, NULL, NULL, d.on_date) AS v FROM d
  ),
  enf AS (
    SELECT EXISTS (
      SELECT 1 FROM public.personnel_authorizations a, d
      WHERE a.activity = p_activity
        AND a.status = 'active'
        AND a.valid_from <= d.on_date
        AND (a.valid_to IS NULL OR a.valid_to >= d.on_date)
    ) AS v
  )
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND NOT public.app_is_known_staff() THEN NULL
    ELSE jsonb_build_object(
      'enforced', enf.v,
      'holds_activity', holds.v,
      'authorized', CASE
        WHEN NOT EXISTS (SELECT 1 FROM params) AND NOT EXISTS (SELECT 1 FROM scopes) THEN holds.v
        ELSE jsonb_array_length(miss_p.ids) = 0 AND jsonb_array_length(miss_s.ids) = 0
      END,
      'missing_test_parameter_ids', miss_p.ids,
      'missing_calibration_scope_ids', miss_s.ids
    )
  END
  FROM enf, holds, miss_p, miss_s;
$$;

REVOKE ALL ON FUNCTION public.app_authorization_check(uuid, text, uuid[], uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_authorization_check(uuid, text, uuid[], uuid[], date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.competence_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competence_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_exceptions ENABLE ROW LEVEL SECURITY;

-- Records maintained by Director / QM / Technical Manager.
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['competence_requirements', 'personnel_qualifications', 'training_records',
                             'training_attendees', 'competence_monitoring'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_competence_can_manage())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_competence_can_manage()) WITH CHECK (public.app_competence_can_manage())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_is_laboratory_director())',
      rel || '_delete', rel);
  END LOOP;
END $$;

-- Authorizations: Director / Quality Manager only.
DROP POLICY IF EXISTS personnel_authorizations_select ON public.personnel_authorizations;
CREATE POLICY personnel_authorizations_select ON public.personnel_authorizations
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS personnel_authorizations_insert ON public.personnel_authorizations;
CREATE POLICY personnel_authorizations_insert ON public.personnel_authorizations
  FOR INSERT TO authenticated WITH CHECK (public.app_competence_can_authorize());
DROP POLICY IF EXISTS personnel_authorizations_update ON public.personnel_authorizations;
CREATE POLICY personnel_authorizations_update ON public.personnel_authorizations
  FOR UPDATE TO authenticated
  USING (public.app_competence_can_authorize())
  WITH CHECK (public.app_competence_can_authorize());
DROP POLICY IF EXISTS personnel_authorizations_delete ON public.personnel_authorizations;
CREATE POLICY personnel_authorizations_delete ON public.personnel_authorizations
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- Exceptions: any known staff records a 'warn'; only the Director an 'override'.
DROP POLICY IF EXISTS authorization_exceptions_select ON public.authorization_exceptions;
CREATE POLICY authorization_exceptions_select ON public.authorization_exceptions
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS authorization_exceptions_insert ON public.authorization_exceptions;
CREATE POLICY authorization_exceptions_insert ON public.authorization_exceptions
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_known_staff() AND (mode = 'warn' OR public.app_is_laboratory_director()));

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['competence_requirements', 'personnel_qualifications', 'training_records',
                             'training_attendees', 'competence_monitoring', 'personnel_authorizations',
                             'authorization_exceptions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competence_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_attendees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competence_monitoring TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel_authorizations TO authenticated;
-- Append-only: no UPDATE / DELETE for app users.
GRANT SELECT, INSERT ON public.authorization_exceptions TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage: certificates, training material (private; signed URLs only).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; personnel-records bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'personnel-records',
    'personnel-records',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_personnel_records_select ON storage.objects;
  CREATE POLICY lims_personnel_records_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'personnel-records' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_personnel_records_insert ON storage.objects;
  CREATE POLICY lims_personnel_records_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'personnel-records' AND public.app_competence_can_manage());

  DROP POLICY IF EXISTS lims_personnel_records_update ON storage.objects;
  CREATE POLICY lims_personnel_records_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'personnel-records' AND public.app_competence_can_manage())
    WITH CHECK (bucket_id = 'personnel-records' AND public.app_competence_can_manage());

  DROP POLICY IF EXISTS lims_personnel_records_delete ON storage.objects;
  CREATE POLICY lims_personnel_records_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'personnel-records' AND public.app_is_laboratory_director());
END $$;

-- ---------------------------------------------------------------------------
-- 7. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: competence tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['competence_requirements', 'personnel_qualifications', 'training_records',
                             'training_attendees', 'competence_monitoring', 'personnel_authorizations',
                             'authorization_exceptions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
