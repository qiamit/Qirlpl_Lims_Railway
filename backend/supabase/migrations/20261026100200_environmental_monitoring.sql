-- ISO/IEC 17025 gap P1-6: facilities and environmental conditions (6.3.1 - 6.3.4).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager) and
-- 20261024100000_audit_trail_expansion.sql (write_audit_log), while the lab
-- is idle. Safe to re-run.
--
-- What it adds
--   lab_areas              Areas / rooms with their environmental limits
--                          (temperature, RH, optional other limits such as
--                          differential pressure), readings expected per day,
--                          the data logger / hygrometer (equipment_master) and
--                          whether entry is restricted (6.3.4 a).
--   environment_readings   Monitoring records (6.3.3). within_limits and
--                          limit_snapshot are set by the database from the
--                          area's limits at the time of recording, so a later
--                          change of limits never rewrites history.
--                          Append-only for API users: the only change allowed
--                          is linking a nonconforming work record
--                          (nc_record_id). A wrong reading is corrected by a
--                          new reading with remarks. The Laboratory Director
--                          may delete a reading entered in error (the delete
--                          stays in the audit trail).
--   area_access_log        Entry to restricted areas (6.3.4 a).
--   housekeeping_log       Cleaning / housekeeping of areas (6.3.4 c).
--   environment_conditions_for(area, from, to)
--                          Min / max / avg temperature and RH, count and
--                          "any reading out of limits" for a period, plus the
--                          last reading before the period. For test results,
--                          certificates and reports (7.8.2.1 / 6.3.3).
--
-- Access
--   Read: known staff. Readings, access and housekeeping entries: any known
--   staff member. Areas (the limits): Laboratory Director, Quality Manager or
--   a Technical Manager. Deletes: Laboratory Director only.
--   Restrictive gate lims_known_staff_only like every other public table.
--
-- Soft delete (20261025100000) is NOT applied to these tables: that migration
-- has no per-table setup function (its setup is an anonymous DO block over
-- soft_delete_tables). Physical deletes stay Director-only and are recorded
-- by write_audit_log. Readings reference areas with ON DELETE RESTRICT, so an
-- area that has readings is set inactive instead of being deleted.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.equipment_master') IS NULL OR to_regclass('public.nc_work_records') IS NULL THEN
    RAISE EXCEPTION 'equipment_master and nc_work_records must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may maintain areas and limits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_env_can_manage_areas()
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

REVOKE ALL ON FUNCTION public.app_env_can_manage_areas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_env_can_manage_areas() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lab_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  department text,
  description text,
  temp_min numeric,
  temp_max numeric,
  rh_min numeric,
  rh_max numeric,
  -- {"pressure": {"label": "Differential pressure", "unit": "Pa", "min": 10, "max": null}}
  other_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  readings_per_day int NOT NULL DEFAULT 2,
  logger_equipment_id uuid REFERENCES public.equipment_master (id) ON DELETE SET NULL,
  access_restricted boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_areas_code_check CHECK (btrim(code) <> ''),
  CONSTRAINT lab_areas_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT lab_areas_temp_range_check CHECK (temp_min IS NULL OR temp_max IS NULL OR temp_min <= temp_max),
  CONSTRAINT lab_areas_rh_range_check CHECK (
    (rh_min IS NULL OR rh_min BETWEEN 0 AND 100)
    AND (rh_max IS NULL OR rh_max BETWEEN 0 AND 100)
    AND (rh_min IS NULL OR rh_max IS NULL OR rh_min <= rh_max)
  ),
  CONSTRAINT lab_areas_readings_per_day_check CHECK (readings_per_day BETWEEN 0 AND 48),
  CONSTRAINT lab_areas_other_limits_check CHECK (jsonb_typeof(other_limits) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS lab_areas_code_ci_key ON public.lab_areas (lower(btrim(code)));
CREATE INDEX IF NOT EXISTS idx_lab_areas_active ON public.lab_areas (active);

CREATE TABLE IF NOT EXISTS public.environment_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.lab_areas (id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  temperature numeric,
  humidity numeric,
  -- {"pressure": 12.5}; keys match lab_areas.other_limits
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid DEFAULT auth.uid(),
  recorded_by_name text,
  source text NOT NULL DEFAULT 'manual',
  within_limits boolean,
  limit_snapshot jsonb,
  remarks text,
  nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT environment_readings_source_check CHECK (source IN ('manual', 'csv', 'logger')),
  CONSTRAINT environment_readings_humidity_check CHECK (humidity IS NULL OR humidity BETWEEN 0 AND 100),
  CONSTRAINT environment_readings_temperature_check CHECK (temperature IS NULL OR temperature BETWEEN -100 AND 400),
  CONSTRAINT environment_readings_other_check CHECK (jsonb_typeof(other) = 'object'),
  CONSTRAINT environment_readings_value_check CHECK (
    temperature IS NOT NULL OR humidity IS NOT NULL OR other <> '{}'::jsonb
  )
);

CREATE INDEX IF NOT EXISTS idx_environment_readings_area_time
  ON public.environment_readings (area_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_environment_readings_time
  ON public.environment_readings (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_environment_readings_out
  ON public.environment_readings (area_id, recorded_at DESC) WHERE within_limits IS FALSE;
CREATE INDEX IF NOT EXISTS idx_environment_readings_nc
  ON public.environment_readings (nc_record_id) WHERE nc_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.area_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.lab_areas (id) ON DELETE RESTRICT,
  person_name text NOT NULL,
  user_id uuid,
  purpose text,
  time_in timestamptz NOT NULL DEFAULT now(),
  time_out timestamptz,
  escorted_by text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT area_access_log_person_check CHECK (btrim(person_name) <> ''),
  CONSTRAINT area_access_log_time_check CHECK (time_out IS NULL OR time_out >= time_in)
);

CREATE INDEX IF NOT EXISTS idx_area_access_log_area_time
  ON public.area_access_log (area_id, time_in DESC);

CREATE TABLE IF NOT EXISTS public.housekeeping_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.lab_areas (id) ON DELETE RESTRICT,
  done_on date NOT NULL DEFAULT current_date,
  activity text NOT NULL,
  done_by text,
  verified_by text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT housekeeping_log_activity_check CHECK (btrim(activity) <> '')
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_log_area_date
  ON public.housekeeping_log (area_id, done_on DESC);

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['lab_areas', 'area_access_log', 'housekeeping_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Readings: limits check on insert, append-only afterwards.
-- ---------------------------------------------------------------------------

-- Text that is a plain decimal number, else NULL (never raises).
CREATE OR REPLACE FUNCTION public.app_env_num(p jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric
    WHEN jsonb_typeof(p) = 'string' AND btrim(p #>> '{}') ~ '^[-+]?[0-9]+(\.[0-9]+)?$' THEN btrim(p #>> '{}')::numeric
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.environment_readings_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a public.lab_areas%ROWTYPE;
  v_checked boolean := false;
  v_bad boolean := false;
  v_key text;
  v_lim jsonb;
  v_val numeric;
  v_min numeric;
  v_max numeric;
  v_name text;
BEGIN
  SELECT * INTO a FROM public.lab_areas WHERE id = NEW.area_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown area' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.recorded_by := auth.uid();
    NEW.created_at := now();
    NEW.nc_record_id := NULL;
    IF NEW.recorded_at > now() + interval '1 hour' THEN
      RAISE EXCEPTION 'A reading cannot be recorded in the future (%).', NEW.recorded_at
        USING ERRCODE = '22007';
    END IF;
  END IF;
  NEW.other := coalesce(NEW.other, '{}'::jsonb);

  -- The signed-in person's profile name wins over a name sent by the client.
  IF NEW.recorded_by IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(up.full_name), ''), nullif(btrim(NEW.recorded_by_name), ''), up.email)
      INTO v_name
      FROM public.user_profiles up
     WHERE up.id = NEW.recorded_by;
    IF v_name IS NOT NULL THEN
      NEW.recorded_by_name := v_name;
    END IF;
  END IF;

  IF NEW.temperature IS NOT NULL AND (a.temp_min IS NOT NULL OR a.temp_max IS NOT NULL) THEN
    v_checked := true;
    IF NEW.temperature < a.temp_min OR NEW.temperature > a.temp_max THEN
      v_bad := true;
    END IF;
  END IF;
  IF NEW.humidity IS NOT NULL AND (a.rh_min IS NOT NULL OR a.rh_max IS NOT NULL) THEN
    v_checked := true;
    IF NEW.humidity < a.rh_min OR NEW.humidity > a.rh_max THEN
      v_bad := true;
    END IF;
  END IF;
  FOR v_key, v_lim IN SELECT key, value FROM jsonb_each(coalesce(a.other_limits, '{}'::jsonb)) LOOP
    CONTINUE WHEN jsonb_typeof(v_lim) <> 'object';
    v_val := public.app_env_num(NEW.other -> v_key);
    v_min := public.app_env_num(v_lim -> 'min');
    v_max := public.app_env_num(v_lim -> 'max');
    CONTINUE WHEN v_val IS NULL OR (v_min IS NULL AND v_max IS NULL);
    v_checked := true;
    IF v_val < v_min OR v_val > v_max THEN
      v_bad := true;
    END IF;
  END LOOP;

  -- NULL = nothing to check (no limits set for the values recorded).
  NEW.within_limits := CASE WHEN v_bad THEN false WHEN v_checked THEN true ELSE NULL END;
  NEW.limit_snapshot := jsonb_build_object(
    'area_code', a.code,
    'area_name', a.name,
    'temp_min', a.temp_min,
    'temp_max', a.temp_max,
    'rh_min', a.rh_min,
    'rh_max', a.rh_max,
    'other_limits', coalesce(a.other_limits, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.environment_readings_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_environment_readings_before_insert ON public.environment_readings;
CREATE TRIGGER trg_environment_readings_before_insert
  BEFORE INSERT ON public.environment_readings
  FOR EACH ROW EXECUTE FUNCTION public.environment_readings_before_insert();

-- Callers running as authenticated / anon are "the app". The owner,
-- service_role and FK actions (nc_record_id ON DELETE SET NULL) are not limited.
CREATE OR REPLACE FUNCTION public.environment_readings_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'Environment readings cannot be deleted. Record a new reading with remarks instead.'
        USING ERRCODE = '42501',
              HINT = 'Only the Laboratory Director can remove a reading entered in error (ISO/IEC 17025 7.5).';
    END IF;
    RETURN OLD;
  END IF;

  IF (to_jsonb(NEW) - 'nc_record_id') IS DISTINCT FROM (to_jsonb(OLD) - 'nc_record_id') THEN
    RAISE EXCEPTION 'Environment readings cannot be changed. Record a new reading with remarks instead.'
      USING ERRCODE = '42501',
            HINT = 'Monitoring records are append-only (ISO/IEC 17025 6.3.3, 7.5.2).';
  END IF;
  IF OLD.nc_record_id IS NOT NULL
     AND NEW.nc_record_id IS DISTINCT FROM OLD.nc_record_id
     AND NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'This reading is already linked to a nonconforming work record'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.environment_readings_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_environment_readings_append_only ON public.environment_readings;
CREATE TRIGGER trg_environment_readings_append_only
  BEFORE UPDATE OR DELETE ON public.environment_readings
  FOR EACH ROW EXECUTE FUNCTION public.environment_readings_append_only();

-- ---------------------------------------------------------------------------
-- 4. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.lab_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_log ENABLE ROW LEVEL SECURITY;

-- lab_areas
DROP POLICY IF EXISTS lab_areas_select ON public.lab_areas;
CREATE POLICY lab_areas_select ON public.lab_areas
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS lab_areas_insert ON public.lab_areas;
CREATE POLICY lab_areas_insert ON public.lab_areas
  FOR INSERT TO authenticated WITH CHECK (public.app_env_can_manage_areas());
DROP POLICY IF EXISTS lab_areas_update ON public.lab_areas;
CREATE POLICY lab_areas_update ON public.lab_areas
  FOR UPDATE TO authenticated
  USING (public.app_env_can_manage_areas())
  WITH CHECK (public.app_env_can_manage_areas());
DROP POLICY IF EXISTS lab_areas_delete ON public.lab_areas;
CREATE POLICY lab_areas_delete ON public.lab_areas
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- environment_readings
DROP POLICY IF EXISTS environment_readings_select ON public.environment_readings;
CREATE POLICY environment_readings_select ON public.environment_readings
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS environment_readings_insert ON public.environment_readings;
CREATE POLICY environment_readings_insert ON public.environment_readings
  FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS environment_readings_link_nc ON public.environment_readings;
CREATE POLICY environment_readings_link_nc ON public.environment_readings
  FOR UPDATE TO authenticated
  USING (public.app_is_known_staff())
  WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS environment_readings_delete ON public.environment_readings;
CREATE POLICY environment_readings_delete ON public.environment_readings
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- area_access_log, housekeeping_log
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['area_access_log', 'housekeeping_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_is_laboratory_director())',
      rel || '_delete', rel);
  END LOOP;
END $$;

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['lab_areas', 'environment_readings', 'area_access_log', 'housekeeping_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

REVOKE ALL ON public.lab_areas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.environment_readings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.area_access_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.housekeeping_log FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_areas TO authenticated;
-- Readings: insert and read; the only column an app user may update is the
-- NC link. Deletes are limited to the Laboratory Director by policy.
GRANT SELECT, INSERT, DELETE ON public.environment_readings TO authenticated;
GRANT UPDATE (nc_record_id) ON public.environment_readings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_access_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeping_log TO authenticated;

GRANT ALL ON public.lab_areas TO service_role;
GRANT ALL ON public.environment_readings TO service_role;
GRANT ALL ON public.area_access_log TO service_role;
GRANT ALL ON public.housekeeping_log TO service_role;

REVOKE ALL ON FUNCTION public.app_env_num(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_env_num(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Conditions for a period (results, certificates, reports).
--    SECURITY INVOKER: the caller's RLS applies (known staff).
--    One row when the area exists and is visible, none otherwise.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.environment_conditions_for(uuid, timestamptz, timestamptz);
CREATE FUNCTION public.environment_conditions_for(
  p_area_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  area_id uuid,
  area_code text,
  area_name text,
  period_from timestamptz,
  period_to timestamptz,
  reading_count integer,
  temperature_min numeric,
  temperature_max numeric,
  temperature_avg numeric,
  humidity_min numeric,
  humidity_max numeric,
  humidity_avg numeric,
  any_out_of_limits boolean,
  out_of_limit_count integer,
  first_reading_at timestamptz,
  last_reading_at timestamptz,
  current_limits jsonb,
  last_before_at timestamptz,
  last_before_temperature numeric,
  last_before_humidity numeric,
  last_before_within_limits boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT least(coalesce($2, '-infinity'::timestamptz), coalesce($3, now())) AS f,
           greatest(coalesce($2, '-infinity'::timestamptz), coalesce($3, now())) AS t
  ),
  agg AS (
    SELECT count(*)::int AS n,
           min(r.temperature) AS tmin,
           max(r.temperature) AS tmax,
           round(avg(r.temperature), 2) AS tavg,
           min(r.humidity) AS hmin,
           max(r.humidity) AS hmax,
           round(avg(r.humidity), 2) AS havg,
           coalesce(bool_or(r.within_limits IS FALSE), false) AS anyout,
           (count(*) FILTER (WHERE r.within_limits IS FALSE))::int AS nout,
           min(r.recorded_at) AS first_at,
           max(r.recorded_at) AS last_at
    FROM public.environment_readings r, bounds b
    WHERE r.area_id = $1
      AND r.recorded_at >= b.f
      AND r.recorded_at <= b.t
  ),
  prev AS (
    SELECT r.recorded_at, r.temperature, r.humidity, r.within_limits
    FROM public.environment_readings r, bounds b
    WHERE r.area_id = $1
      AND r.recorded_at < b.f
    ORDER BY r.recorded_at DESC
    LIMIT 1
  )
  SELECT a.id, a.code, a.name, b.f, b.t,
         agg.n, agg.tmin, agg.tmax, agg.tavg, agg.hmin, agg.hmax, agg.havg,
         agg.anyout, agg.nout, agg.first_at, agg.last_at,
         jsonb_build_object(
           'temp_min', a.temp_min, 'temp_max', a.temp_max,
           'rh_min', a.rh_min, 'rh_max', a.rh_max,
           'other_limits', a.other_limits
         ),
         prev.recorded_at, prev.temperature, prev.humidity, prev.within_limits
  FROM public.lab_areas a
  CROSS JOIN bounds b
  CROSS JOIN agg
  LEFT JOIN prev ON true
  WHERE a.id = $1;
$$;

REVOKE ALL ON FUNCTION public.environment_conditions_for(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.environment_conditions_for(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: environment tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['lab_areas', 'environment_readings', 'area_access_log', 'housekeeping_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
