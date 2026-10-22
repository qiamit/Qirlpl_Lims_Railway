-- ISO/IEC 17025 gap P1-11: management review meetings (8.9.1 - 8.9.3).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20260815170000_mrm_plans.sql, 20261009063000_security_role_checks.sql
-- (app_is_known_staff, app_is_laboratory_director), 20261009103000
-- (app_is_quality_manager) and 20261024100000_audit_trail_expansion.sql
-- (write_audit_log), while the lab is idle. Safe to re-run.
--
-- What it adds
--   mrm_meetings            One management review meeting, held for an MRM
--                           plan (mrm_plans), with the review period, venue,
--                           chair and status:
--                             draft -> minutes_circulated -> closed
--                           Circulating the minutes and closing are done by
--                           the Laboratory Director (the app asks for the
--                           password first). Closing stamps approved_by /
--                           approved_at from the signed-in user.
--   mrm_meeting_attendance  Who was invited and who was present.
--   mrm_meeting_inputs      One row per review input a - o (8.9.2): a
--                           snapshot of the figures pulled from the LIMS for
--                           the review period (summary_data), the discussion
--                           and the conclusion.
--   mrm_meeting_outputs     Decisions and actions (8.9.3): effectiveness of
--                           the management system, improvement, resources,
--                           changes, other.
--   mrm_actions             Action items with owner, due date, status, closure
--                           evidence and an optional CAPA reference. They are
--                           reviewed at the next meeting (input d).
--
-- Closed meetings are read-only (trigger), including attendance, inputs and
-- outputs. Actions of a closed meeting can still be followed up: status,
-- closed_on, closure_evidence and capa_ref may change; the action text,
-- owner and due date may not.
--
-- Rules checked when a meeting is closed
--   * at least one attendee marked present,
--   * every input a - o recorded with a conclusion,
--   * at least one output decision.
--
-- Access
--   Read: known staff. Writes: Laboratory Director or Quality Manager.
--   The owner of an action (owner_user_id) may update its follow-up fields.
--   Status changes (circulate / close / back to draft): Laboratory Director.
--   Deleting a meeting: Laboratory Director, and only while it is a draft.
--   Restrictive gate lims_known_staff_only like every other public table.
--
-- Soft delete (20261025100000) is NOT applied to these tables (that
-- migration has no per-table setup function). Physical deletes are limited
-- as above and recorded by write_audit_log.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.mrm_plans') IS NULL THEN
    RAISE EXCEPTION 'mrm_plans must exist first (20260815170000_mrm_plans.sql)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may write.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_mrm_can_write()
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

REVOKE ALL ON FUNCTION public.app_mrm_can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mrm_can_write() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mrm_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mrm_plan_id uuid REFERENCES public.mrm_plans (id) ON DELETE SET NULL,
  meeting_no text NOT NULL,
  held_on date NOT NULL DEFAULT current_date,
  venue text NOT NULL DEFAULT '',
  chaired_by text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  period_from date,
  period_to date,
  closing_remarks text NOT NULL DEFAULT '',
  minutes_circulated_at timestamptz,
  minutes_circulated_by uuid,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  approved_reauthenticated_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrm_meetings_meeting_no_check CHECK (btrim(meeting_no) <> ''),
  CONSTRAINT mrm_meetings_status_check CHECK (status IN ('draft', 'minutes_circulated', 'closed')),
  CONSTRAINT mrm_meetings_period_check CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to)
);

CREATE UNIQUE INDEX IF NOT EXISTS mrm_meetings_meeting_no_ci_key ON public.mrm_meetings (lower(btrim(meeting_no)));
CREATE INDEX IF NOT EXISTS idx_mrm_meetings_held_on ON public.mrm_meetings (held_on DESC);
CREATE INDEX IF NOT EXISTS idx_mrm_meetings_plan ON public.mrm_meetings (mrm_plan_id);

CREATE TABLE IF NOT EXISTS public.mrm_meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.mrm_meetings (id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  designation text NOT NULL DEFAULT '',
  present boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrm_meeting_attendance_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_mrm_meeting_attendance_meeting
  ON public.mrm_meeting_attendance (meeting_id, sort_order);

CREATE TABLE IF NOT EXISTS public.mrm_meeting_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.mrm_meetings (id) ON DELETE CASCADE,
  input_code text NOT NULL,
  title text NOT NULL DEFAULT '',
  -- Figures pulled from the LIMS for the review period, frozen at pull time.
  summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pulled_at timestamptz,
  discussion text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrm_meeting_inputs_code_check CHECK (
    input_code IN ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o')
  ),
  CONSTRAINT mrm_meeting_inputs_summary_check CHECK (jsonb_typeof(summary_data) = 'object'),
  CONSTRAINT mrm_meeting_inputs_meeting_code_key UNIQUE (meeting_id, input_code)
);

CREATE TABLE IF NOT EXISTS public.mrm_meeting_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.mrm_meetings (id) ON DELETE CASCADE,
  output_type text NOT NULL,
  decision text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrm_meeting_outputs_type_check CHECK (
    output_type IN ('effectiveness', 'improvement', 'resources', 'changes', 'other')
  ),
  CONSTRAINT mrm_meeting_outputs_decision_check CHECK (btrim(decision) <> '')
);

CREATE INDEX IF NOT EXISTS idx_mrm_meeting_outputs_meeting
  ON public.mrm_meeting_outputs (meeting_id, sort_order);

CREATE TABLE IF NOT EXISTS public.mrm_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.mrm_meetings (id) ON DELETE CASCADE,
  action text NOT NULL,
  owner_user_id uuid,
  owner_name text NOT NULL DEFAULT '',
  due_on date,
  status text NOT NULL DEFAULT 'open',
  closed_on date,
  closure_evidence text NOT NULL DEFAULT '',
  capa_ref text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrm_actions_action_check CHECK (btrim(action) <> ''),
  CONSTRAINT mrm_actions_status_check CHECK (status IN ('open', 'done', 'overdue')),
  CONSTRAINT mrm_actions_done_check CHECK (
    status <> 'done' OR (closed_on IS NOT NULL AND btrim(closure_evidence) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_mrm_actions_meeting ON public.mrm_actions (meeting_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mrm_actions_open_due
  ON public.mrm_actions (due_on) WHERE status <> 'done';
CREATE INDEX IF NOT EXISTS idx_mrm_actions_owner ON public.mrm_actions (owner_user_id);

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['mrm_meetings', 'mrm_meeting_attendance', 'mrm_meeting_inputs',
                             'mrm_meeting_outputs', 'mrm_actions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Helpers for the guards (definer: they see the meeting / profile whatever
--    the caller's RLS; they answer known staff only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_mrm_meeting_status(p_meeting_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.status FROM public.mrm_meetings m
  WHERE m.id = p_meeting_id AND public.app_is_known_staff();
$$;

CREATE OR REPLACE FUNCTION public.app_mrm_user_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
  FROM public.user_profiles up
  WHERE up.id = p_user AND public.app_is_known_staff();
$$;

-- The guards below run as the caller, so authenticated needs EXECUTE.
REVOKE ALL ON FUNCTION public.app_mrm_meeting_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_mrm_user_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mrm_meeting_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_mrm_user_name(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Meeting guard: status workflow, approval stamp, closed = read-only.
--    SECURITY INVOKER so current_user tells the app (authenticated / anon)
--    apart from the owner, service_role and FK actions, which are not limited.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mrm_meetings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_missing text;
  v_pw_at timestamptz;
BEGIN
  IF NOT v_app THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Meeting % is %; only a draft meeting can be deleted.', OLD.meeting_no, OLD.status
        USING ERRCODE = '42501',
              HINT = 'Management review records are retained (ISO/IEC 17025 8.9.3, 7.5).';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'A new meeting starts as a draft' USING ERRCODE = '22023';
    END IF;
    NEW.created_by := auth.uid();
    NEW.created_at := now();
    NEW.minutes_circulated_at := NULL;
    NEW.minutes_circulated_by := NULL;
    NEW.approved_by := NULL;
    NEW.approved_by_name := NULL;
    NEW.approved_at := NULL;
    NEW.approved_reauthenticated_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'Meeting % is closed and cannot be changed.', OLD.meeting_no
      USING ERRCODE = '42501',
            HINT = 'Closed management review minutes are read-only (ISO/IEC 17025 8.9.3).';
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'Only the Laboratory Director can circulate, reopen or close management review minutes'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'minutes_circulated')
      OR (OLD.status = 'minutes_circulated' AND NEW.status IN ('draft', 'closed'))
    ) THEN
      RAISE EXCEPTION 'Meeting status cannot go from % to %', OLD.status, NEW.status
        USING ERRCODE = '22023',
              HINT = 'Circulate the minutes first, then close the meeting.';
    END IF;
  END IF;

  IF NEW.status = 'minutes_circulated' AND OLD.status = 'draft' THEN
    NEW.minutes_circulated_at := now();
    NEW.minutes_circulated_by := auth.uid();
  ELSIF NEW.status = 'draft' THEN
    NEW.minutes_circulated_at := NULL;
    NEW.minutes_circulated_by := NULL;
  ELSE
    NEW.minutes_circulated_at := OLD.minutes_circulated_at;
    NEW.minutes_circulated_by := OLD.minutes_circulated_by;
  END IF;

  IF NEW.status = 'closed' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mrm_meeting_attendance a WHERE a.meeting_id = NEW.id AND a.present) THEN
      RAISE EXCEPTION 'Mark at least one attendee as present before closing the meeting'
        USING ERRCODE = '23514';
    END IF;
    SELECT string_agg(c.code, ', ' ORDER BY c.code)
      INTO v_missing
      FROM unnest(ARRAY['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o']) AS c(code)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.mrm_meeting_inputs i
        WHERE i.meeting_id = NEW.id AND i.input_code = c.code AND btrim(i.conclusion) <> ''
     );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Record a conclusion for every review input before closing (missing: %)', v_missing
        USING ERRCODE = '23514',
              HINT = 'ISO/IEC 17025 8.9.2 inputs a - o shall be recorded. Write "Not applicable" where nothing arose.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.mrm_meeting_outputs o WHERE o.meeting_id = NEW.id) THEN
      RAISE EXCEPTION 'Record at least one output decision (8.9.3) before closing'
        USING ERRCODE = '23514';
    END IF;

    NEW.approved_by := auth.uid();
    NEW.approved_by_name := coalesce(public.app_mrm_user_name(auth.uid()), NEW.approved_by_name);
    NEW.approved_at := now();
    IF NEW.approved_reauthenticated_at IS NOT NULL THEN
      IF to_regprocedure('public.app_jwt_password_auth_at()') IS NOT NULL THEN
        EXECUTE 'SELECT public.app_jwt_password_auth_at()' INTO v_pw_at;
      END IF;
      IF v_pw_at IS NOT NULL THEN
        IF v_pw_at < now() - interval '15 minutes' THEN
          RAISE EXCEPTION 'Password confirmation has expired. Confirm your password again to close the meeting.'
            USING ERRCODE = '28000';
        END IF;
        NEW.approved_reauthenticated_at := v_pw_at;
      ELSE
        NEW.approved_reauthenticated_at := least(NEW.approved_reauthenticated_at, now());
      END IF;
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_by_name := NULL;
    NEW.approved_at := NULL;
    NEW.approved_reauthenticated_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mrm_meetings_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mrm_meetings_guard ON public.mrm_meetings;
CREATE TRIGGER trg_mrm_meetings_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.mrm_meetings
  FOR EACH ROW EXECUTE FUNCTION public.mrm_meetings_guard();

-- ---------------------------------------------------------------------------
-- 5. Child guard: attendance, inputs and outputs of a closed meeting are
--    read-only; a row never moves to another meeting.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mrm_meeting_child_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id THEN
    RAISE EXCEPTION 'A meeting record cannot be moved to another meeting' USING ERRCODE = '42501';
  END IF;
  v_meeting := CASE WHEN TG_OP = 'DELETE' THEN OLD.meeting_id ELSE NEW.meeting_id END;
  IF public.app_mrm_meeting_status(v_meeting) = 'closed' THEN
    RAISE EXCEPTION 'This management review meeting is closed; its minutes cannot be changed.'
      USING ERRCODE = '42501',
            HINT = 'Closed management review minutes are read-only (ISO/IEC 17025 8.9.3).';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.mrm_meeting_child_guard() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['mrm_meeting_attendance', 'mrm_meeting_inputs', 'mrm_meeting_outputs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_guard', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.mrm_meeting_child_guard()',
      'trg_' || rel || '_guard', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Action guard: follow-up of actions stays open after the meeting closes;
--    an action owner who is not Director / QM may only follow up.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mrm_actions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_followup_only boolean;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    NEW.owner_name := coalesce(NEW.owner_name, '');
    NEW.closure_evidence := coalesce(NEW.closure_evidence, '');
    NEW.capa_ref := coalesce(NEW.capa_ref, '');
    IF NEW.status = 'done' THEN
      NEW.closed_on := coalesce(NEW.closed_on, current_date);
    ELSE
      NEW.closed_on := NULL;
    END IF;
  END IF;

  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id THEN
    RAISE EXCEPTION 'An action cannot be moved to another meeting' USING ERRCODE = '42501';
  END IF;

  v_status := public.app_mrm_meeting_status(CASE WHEN TG_OP = 'DELETE' THEN OLD.meeting_id ELSE NEW.meeting_id END);
  v_followup_only := v_status = 'closed' OR NOT public.app_mrm_can_write();

  IF v_followup_only THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION '%',
        CASE WHEN v_status = 'closed'
          THEN 'The meeting is closed: actions can be followed up but not added or removed.'
          ELSE 'Only the Laboratory Director or Quality Manager can add or remove actions.' END
        USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status', 'closed_on', 'closure_evidence', 'capa_ref', 'updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'closed_on', 'closure_evidence', 'capa_ref', 'updated_at']) THEN
      RAISE EXCEPTION 'Only the status, closure date, closure evidence and CAPA reference of this action can be changed.'
        USING ERRCODE = '42501',
              HINT = 'Action text, owner and due date are part of the meeting minutes.';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.mrm_actions_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mrm_actions_guard ON public.mrm_actions;
CREATE TRIGGER trg_mrm_actions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.mrm_actions
  FOR EACH ROW EXECUTE FUNCTION public.mrm_actions_guard();

-- ---------------------------------------------------------------------------
-- 7. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.mrm_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrm_meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrm_meeting_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrm_meeting_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrm_actions ENABLE ROW LEVEL SECURITY;

-- mrm_meetings
DROP POLICY IF EXISTS mrm_meetings_select ON public.mrm_meetings;
CREATE POLICY mrm_meetings_select ON public.mrm_meetings
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS mrm_meetings_insert ON public.mrm_meetings;
CREATE POLICY mrm_meetings_insert ON public.mrm_meetings
  FOR INSERT TO authenticated WITH CHECK (public.app_mrm_can_write());
DROP POLICY IF EXISTS mrm_meetings_update ON public.mrm_meetings;
CREATE POLICY mrm_meetings_update ON public.mrm_meetings
  FOR UPDATE TO authenticated
  USING (public.app_mrm_can_write())
  WITH CHECK (public.app_mrm_can_write());
DROP POLICY IF EXISTS mrm_meetings_delete ON public.mrm_meetings;
CREATE POLICY mrm_meetings_delete ON public.mrm_meetings
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- attendance, inputs, outputs: read known staff, write Director / QM.
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['mrm_meeting_attendance', 'mrm_meeting_inputs', 'mrm_meeting_outputs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_mrm_can_write())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_mrm_can_write()) WITH CHECK (public.app_mrm_can_write())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_mrm_can_write())',
      rel || '_delete', rel);
  END LOOP;
END $$;

-- mrm_actions: the owner may also follow up (fields limited by the guard).
DROP POLICY IF EXISTS mrm_actions_select ON public.mrm_actions;
CREATE POLICY mrm_actions_select ON public.mrm_actions
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS mrm_actions_insert ON public.mrm_actions;
CREATE POLICY mrm_actions_insert ON public.mrm_actions
  FOR INSERT TO authenticated WITH CHECK (public.app_mrm_can_write());
DROP POLICY IF EXISTS mrm_actions_update ON public.mrm_actions;
CREATE POLICY mrm_actions_update ON public.mrm_actions
  FOR UPDATE TO authenticated
  USING (public.app_mrm_can_write() OR owner_user_id = auth.uid())
  WITH CHECK (public.app_mrm_can_write() OR owner_user_id = auth.uid());
DROP POLICY IF EXISTS mrm_actions_delete ON public.mrm_actions;
CREATE POLICY mrm_actions_delete ON public.mrm_actions
  FOR DELETE TO authenticated USING (public.app_mrm_can_write());

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['mrm_meetings', 'mrm_meeting_attendance', 'mrm_meeting_inputs',
                             'mrm_meeting_outputs', 'mrm_actions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['mrm_meetings', 'mrm_meeting_attendance', 'mrm_meeting_inputs',
                             'mrm_meeting_outputs', 'mrm_actions'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: management review tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['mrm_meetings', 'mrm_meeting_attendance', 'mrm_meeting_inputs',
                             'mrm_meeting_outputs', 'mrm_actions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
