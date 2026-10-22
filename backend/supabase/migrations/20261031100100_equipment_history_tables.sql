-- ISO/IEC 17025 gap item P3-8 (6.4.10 intermediate checks, 6.4.13 equipment
-- records): append-only registers for maintenance and intermediate checks.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261024100000_audit_trail_expansion.sql
-- (write_audit_log) and, ideally, 20261029100200_db_module_access.sql, while
-- the lab is idle. Safe to re-run.
--
-- Until now the maintenance history and the intermediate check history were
-- JSONB arrays on the equipment rows, rewritten by every save of the form:
--   equipment_master           maintenance_history, intermediate_check_history
--   equipment_for_calibration  maintenance_history, intermediate_check_history
--   iqc_masters                maintenance_history
-- (20260618000004/5, 20260725000001/2, 20260814081956). Any save could drop or
-- rewrite a past record.
--
-- What it adds
--   equipment_maintenance_events
--   equipment_intermediate_checks
--                          One row per history entry: source table + id,
--                          performed_on, performed_by, checklist / result,
--                          remarks, the entry as stored (entry), who recorded
--                          it (recorded_by, auth.uid()) and when. entry_key is
--                          an md5 of the entry normalised the way the app
--                          reads it (app_eqh_norm), without its client id, so
--                          re-saving an unchanged entry is not a change.
--                          Append-only: no UPDATE / DELETE grant or policy, and
--                          a trigger refuses UPDATE, DELETE and TRUNCATE for
--                          everyone (owner included; disable the trigger by
--                          hand for a supervised correction).
--   equipment_history_changes
--                          Log of every removed or modified entry (Laboratory
--                          Director corrections, service_role / owner writes)
--                          and of entries put back later. Append-only too.
--   Backfill               Every entry already in the JSONB columns, keyed by
--                          entry_key (ON CONFLICT DO NOTHING: re-running adds
--                          nothing).
--   Trigger on the three equipment tables (after INSERT / UPDATE of the
--   history columns): entries new in the JSONB are added to the registers.
--   An app user (role authenticated / anon) who removes or changes an entry
--   that was already recorded is refused, unless they are the Laboratory
--   Director; the Director's change is allowed and written to
--   equipment_history_changes (old entry, the entries that replaced it, who,
--   when). The register rows themselves are never changed: the original
--   stays, a corrected entry is a new row.
--   The "current" (latest) maintenance / check kept in the separate columns
--   (maintenance_checklist, intermediate_check_result, ...) is a working copy;
--   it enters the registers when the next session archives it to history.
--
-- Access
--   Read: known staff. Insert: known staff, as themselves (the app normally
--   writes through the JSONB and the trigger). No update / delete. Restrictive
--   gate lims_known_staff_only like every other public table. Every insert is
--   in the audit trail (write_audit_log).
--
-- Before this migration the app keeps working: the history dialogs fall back
-- to the JSONB arrays when the register tables are missing (42P01 / PGRST205).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '300s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.equipment_master') IS NULL THEN
    RAISE EXCEPTION 'equipment_master must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Normalisation (same rules as parseMaintenanceHistoryFromDb and
--    parseIntermediateCheckHistoryFromDb in frontend/src/features/masters/
--    equipment-master/*History.ts). An entry the app would not show
--    normalises to NULL and is not a register entry.
-- ---------------------------------------------------------------------------

-- First key present (JSON null counts as absent), as trimmed text, else ''.
CREATE OR REPLACE FUNCTION public.app_eqh_txt(p jsonb, VARIADIC p_keys text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  v text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '';
  END IF;
  FOREACH k IN ARRAY p_keys LOOP
    v := p ->> k;
    IF v IS NOT NULL THEN
      RETURN regexp_replace(v, '^\s+|\s+$', '', 'g');
    END IF;
  END LOOP;
  RETURN '';
END;
$$;

-- 'YYYY-MM-DD...' or 'DD-MM-YYYY' / 'DD/MM/YYYY' -> date, anything else NULL.
CREATE OR REPLACE FUNCTION public.app_eqh_date(p text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := btrim(coalesce(p, ''));
BEGIN
  IF v ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN left(v, 10)::date;
  END IF;
  IF v ~ '^\d{2}[-/.]\d{2}[-/.]\d{4}$' THEN
    RETURN make_date(substr(v, 7, 4)::int, substr(v, 4, 2)::int, substr(v, 1, 2)::int);
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_eqh_norm_maintenance(e jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  c jsonb;
  v_items jsonb := '[]'::jsonb;
  v_point text;
  v_status text;
  v_on text;
BEGIN
  IF e IS NULL OR jsonb_typeof(e) <> 'object' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(e -> 'checklist') = 'array' THEN
    FOR c IN SELECT x.value FROM jsonb_array_elements(e -> 'checklist') WITH ORDINALITY AS x(value, n) ORDER BY x.n LOOP
      CONTINUE WHEN jsonb_typeof(c) NOT IN ('object', 'array');
      v_point := public.app_eqh_txt(c, 'checkPoint', 'checkpoint');
      CONTINUE WHEN v_point = '';
      v_status := lower(public.app_eqh_txt(c, 'status'));
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'checkPoint', v_point,
        'status', CASE WHEN v_status IN ('not ok', 'notok') THEN 'Not OK' ELSE 'OK' END,
        'repairIfAny', public.app_eqh_txt(c, 'repairIfAny', 'repair_if_any')
      ));
    END LOOP;
  END IF;
  v_on := public.app_eqh_txt(e, 'conductedOn', 'conducted_on');
  IF v_on = '' OR jsonb_array_length(v_items) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'conductedOn', v_on,
    'doneBy', public.app_eqh_txt(e, 'doneBy', 'done_by'),
    'doneByName', public.app_eqh_txt(e, 'doneByName', 'done_by_name'),
    'nextDueDate', public.app_eqh_txt(e, 'nextDueDate', 'next_due_date'),
    'checklist', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_eqh_norm_readings(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN v_out;
  END IF;
  FOR r IN SELECT x.value FROM jsonb_array_elements(p) WITH ORDINALITY AS x(value, n) ORDER BY x.n LOOP
    CONTINUE WHEN jsonb_typeof(r) NOT IN ('object', 'array');
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'checkPointValue', public.app_eqh_txt(r, 'checkPointValue', 'checkPoint', 'checkpoint'),
      'std', public.app_eqh_txt(r, 'std'),
      'obs', public.app_eqh_txt(r, 'obs')
    ));
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_eqh_norm_intermediate(e jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  m jsonb;
  v_on text;
  v_readings jsonb;
  v_masters jsonb := '[]'::jsonb;
  v_match text[];
  v_parsed jsonb;
  v_temp text;
  v_rh text;
BEGIN
  IF e IS NULL OR jsonb_typeof(e) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_on := public.app_eqh_txt(e, 'conductedOn', 'conducted_on');
  IF v_on = '' THEN
    RETURN NULL;
  END IF;

  v_readings := public.app_eqh_norm_readings(e -> 'readings');
  -- Older entries kept only the encoded result text: "... [DATA:{...}]".
  IF jsonb_array_length(v_readings) = 0 AND coalesce(e ->> 'intermediateCheckResult', '') <> '' THEN
    v_match := regexp_match(e ->> 'intermediateCheckResult', '\[DATA:(.+)\]');
    IF v_match IS NOT NULL THEN
      BEGIN
        v_parsed := v_match[1]::jsonb;
      EXCEPTION WHEN others THEN
        v_parsed := NULL;
      END;
      IF jsonb_typeof(v_parsed) = 'object' THEN
        v_readings := public.app_eqh_norm_readings(v_parsed -> 'readings');
      END IF;
    END IF;
  END IF;
  IF jsonb_array_length(v_readings) = 0 THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(e -> 'masters') = 'array' THEN
    FOR m IN SELECT x.value FROM jsonb_array_elements(e -> 'masters') WITH ORDINALITY AS x(value, n) ORDER BY x.n LOOP
      CONTINUE WHEN jsonb_typeof(m) <> 'object' OR public.app_eqh_txt(m, 'id') = '';
      v_masters := v_masters || jsonb_build_array(jsonb_build_object(
        'id', public.app_eqh_txt(m, 'id'),
        'equipmentName', public.app_eqh_txt(m, 'equipmentName', 'equipment_name'),
        'assetCode', public.app_eqh_txt(m, 'assetCode', 'asset_code'),
        'rangeCapacity', public.app_eqh_txt(m, 'rangeCapacity', 'range_capacity'),
        'resolutionLeastCount', public.app_eqh_txt(m, 'resolutionLeastCount', 'resolution_least_count'),
        'acceptanceCriteria', public.app_eqh_txt(m, 'acceptanceCriteria', 'accuracy_acceptance_criteria'),
        'calibrationFrequency', public.app_eqh_txt(m, 'calibrationFrequency', 'calibration_frequency'),
        'lastCalibrationDate', public.app_eqh_txt(m, 'lastCalibrationDate', 'last_calibration_date'),
        'certificateNumber', public.app_eqh_txt(m, 'certificateNumber', 'calibration_certificate_number'),
        'nextCalibrationDue', public.app_eqh_txt(m, 'nextCalibrationDue', 'next_calibration_due')
      ));
    END LOOP;
  END IF;

  v_temp := public.app_eqh_txt(e, 'temperature');
  v_rh := public.app_eqh_txt(e, 'humidity');
  RETURN jsonb_build_object(
    'conductedOn', v_on,
    'doneBy', public.app_eqh_txt(e, 'doneBy', 'done_by'),
    'doneByName', public.app_eqh_txt(e, 'doneByName', 'done_by_name'),
    'status', CASE WHEN e ->> 'status' IN ('Satisfactory', 'Unsatisfactory') THEN e ->> 'status' ELSE 'N/A' END,
    'resultSummary', public.app_eqh_txt(e, 'resultSummary', 'result_summary'),
    'readings', v_readings,
    'nextDueDate', public.app_eqh_txt(e, 'nextDueDate', 'next_due_date'),
    'temperature', CASE WHEN v_temp = '' THEN '27' ELSE v_temp END,
    'humidity', CASE WHEN v_rh = '' THEN '65' ELSE v_rh END,
    'masters', v_masters
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_eqh_norm(p_kind text, e jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_kind
    WHEN 'maintenance' THEN public.app_eqh_norm_maintenance(e)
    WHEN 'intermediate_check' THEN public.app_eqh_norm_intermediate(e)
    ELSE NULL
  END;
$$;

-- The register entries of a JSONB history array: one row per distinct key
-- (first occurrence), entries the app would not show left out.
CREATE OR REPLACE FUNCTION public.app_eqh_entries(p_kind text, p_arr jsonb)
RETURNS TABLE (entry_key text, norm jsonb, raw jsonb, ord bigint)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (k) k, n, raw, ord
  FROM (
    SELECT md5(p_kind || ':' || n::text) AS k, n, x.value AS raw, x.ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_arr) = 'array' THEN p_arr ELSE '[]'::jsonb END)
         WITH ORDINALITY AS x(value, ord)
    CROSS JOIN LATERAL public.app_eqh_norm(p_kind, x.value) AS n
    WHERE n IS NOT NULL
  ) s
  ORDER BY k, ord;
$$;

REVOKE ALL ON FUNCTION public.app_eqh_txt(jsonb, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_date(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_norm_maintenance(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_norm_readings(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_norm_intermediate(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_norm(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_eqh_entries(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_eqh_txt(jsonb, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_date(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_norm_maintenance(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_norm_readings(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_norm_intermediate(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_norm(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_eqh_entries(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  entry_key text NOT NULL,
  entry_id text,
  performed_on date,
  performed_on_text text NOT NULL DEFAULT '',
  performed_by text,
  performed_by_ref text,
  next_due_on date,
  -- [{checkPoint, status 'OK' | 'Not OK', repairIfAny}]
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 'OK' when every check point is OK, else 'Not OK'
  result text,
  remarks text,
  -- the history entry as it was stored on the equipment row
  entry jsonb NOT NULL DEFAULT '{}'::jsonb,
  origin text NOT NULL DEFAULT 'app',
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_maintenance_events_source_check
    CHECK (source_table IN ('equipment_master', 'equipment_for_calibration', 'iqc_masters')),
  CONSTRAINT equipment_maintenance_events_origin_check CHECK (origin IN ('app', 'backfill', 'direct')),
  CONSTRAINT equipment_maintenance_events_checklist_check CHECK (jsonb_typeof(checklist) = 'array'),
  CONSTRAINT equipment_maintenance_events_result_check CHECK (result IS NULL OR result IN ('OK', 'Not OK'))
);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_maintenance_events_entry_key
  ON public.equipment_maintenance_events (source_table, source_id, entry_key);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_events_source
  ON public.equipment_maintenance_events (source_table, source_id, performed_on DESC);

CREATE TABLE IF NOT EXISTS public.equipment_intermediate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  entry_key text NOT NULL,
  entry_id text,
  performed_on date,
  performed_on_text text NOT NULL DEFAULT '',
  performed_by text,
  performed_by_ref text,
  next_due_on date,
  status text,
  -- {readings, masters, temperature, humidity, resultSummary}
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,
  entry jsonb NOT NULL DEFAULT '{}'::jsonb,
  origin text NOT NULL DEFAULT 'app',
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_intermediate_checks_source_check
    CHECK (source_table IN ('equipment_master', 'equipment_for_calibration', 'iqc_masters')),
  CONSTRAINT equipment_intermediate_checks_origin_check CHECK (origin IN ('app', 'backfill', 'direct')),
  CONSTRAINT equipment_intermediate_checks_result_check CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT equipment_intermediate_checks_status_check
    CHECK (status IS NULL OR status IN ('Satisfactory', 'Unsatisfactory', 'N/A'))
);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_intermediate_checks_entry_key
  ON public.equipment_intermediate_checks (source_table, source_id, entry_key);
CREATE INDEX IF NOT EXISTS idx_equipment_intermediate_checks_source
  ON public.equipment_intermediate_checks (source_table, source_id, performed_on DESC);

CREATE TABLE IF NOT EXISTS public.equipment_history_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  history_kind text NOT NULL,
  action text NOT NULL,
  entry_key text NOT NULL,
  old_entry jsonb,
  -- entries added by the same save (the corrected version, for 'modified')
  new_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_director boolean NOT NULL DEFAULT false,
  changed_by uuid DEFAULT auth.uid(),
  changed_by_name text NOT NULL DEFAULT '',
  db_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_history_changes_source_check
    CHECK (source_table IN ('equipment_master', 'equipment_for_calibration', 'iqc_masters')),
  CONSTRAINT equipment_history_changes_kind_check CHECK (history_kind IN ('maintenance', 'intermediate_check')),
  CONSTRAINT equipment_history_changes_action_check CHECK (action IN ('removed', 'modified', 'restored'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_history_changes_source
  ON public.equipment_history_changes (source_table, source_id, history_kind, created_at);

-- ---------------------------------------------------------------------------
-- 3. Append-only: recorder and time from the server; no UPDATE / DELETE /
--    TRUNCATE for anyone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_eqh_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.recorded_by := auth.uid();
  END IF;
  NEW.created_at := now();
  -- Written straight through the API (not by the history trigger).
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.origin := 'direct';
    IF btrim(coalesce(NEW.entry_key, '')) = '' THEN
      NEW.entry_key := md5(gen_random_uuid()::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_eqh_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: records cannot be changed, deleted or truncated', TG_TABLE_NAME
    USING ERRCODE = '42501',
          HINT = 'Equipment records are kept as recorded (ISO/IEC 17025 6.4.13, 7.5). Record a new entry instead.';
END;
$$;

REVOKE ALL ON FUNCTION public.app_eqh_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_eqh_append_only() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_before_insert', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_eqh_before_insert()',
      'trg_' || rel || '_before_insert', rel);
  END LOOP;
  FOREACH rel IN ARRAY ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks', 'equipment_history_changes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_append_only', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_eqh_append_only()',
      'trg_' || rel || '_append_only', rel);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_no_truncate', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.app_eqh_append_only()',
      'trg_' || rel || '_no_truncate', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Sync one history column change into the registers.
--    p_enforce: refuse removal / modification unless the caller is the
--    Laboratory Director (true for app users). Returns the rows added.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_eqh_sync(
  p_table text,
  p_id uuid,
  p_kind text,
  p_old jsonb,
  p_new jsonb,
  p_origin text,
  p_enforce boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removed jsonb;
  v_added jsonb;
  v_director boolean := false;
  v_name text := '';
  v_inserted integer := 0;
  v_label text := CASE p_kind WHEN 'maintenance' THEN 'maintenance' ELSE 'intermediate check' END;
BEGIN
  IF p_kind NOT IN ('maintenance', 'intermediate_check') THEN
    RAISE EXCEPTION 'Unknown history kind %', p_kind;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('key', o.entry_key, 'entry', o.raw) ORDER BY o.ord), '[]'::jsonb)
    INTO v_removed
    FROM public.app_eqh_entries(p_kind, p_old) o
   WHERE NOT EXISTS (SELECT 1 FROM public.app_eqh_entries(p_kind, p_new) n WHERE n.entry_key = o.entry_key);

  SELECT coalesce(jsonb_agg(jsonb_build_object('key', n.entry_key, 'entry', n.raw) ORDER BY n.ord), '[]'::jsonb)
    INTO v_added
    FROM public.app_eqh_entries(p_kind, p_new) n
   WHERE NOT EXISTS (SELECT 1 FROM public.app_eqh_entries(p_kind, p_old) o WHERE o.entry_key = n.entry_key);

  IF jsonb_array_length(v_removed) > 0 OR jsonb_array_length(v_added) > 0 THEN
    v_director := coalesce(public.app_is_laboratory_director(), false);
    IF auth.uid() IS NOT NULL THEN
      SELECT coalesce(nullif(btrim(up.full_name), ''), up.email, '') INTO v_name
        FROM public.user_profiles up WHERE up.id = auth.uid();
    END IF;
  END IF;

  IF jsonb_array_length(v_removed) > 0 THEN
    IF p_enforce AND NOT v_director THEN
      RAISE EXCEPTION 'A recorded % entry (% %) cannot be changed or removed. Reload the equipment and save again; only the Laboratory Director can correct a recorded entry.',
        v_label,
        jsonb_array_length(v_removed),
        CASE WHEN jsonb_array_length(v_removed) = 1 THEN 'entry' ELSE 'entries' END
        USING ERRCODE = '42501',
              HINT = 'Maintenance and intermediate check records are append-only (ISO/IEC 17025 6.4.13, 7.5).';
    END IF;
    INSERT INTO public.equipment_history_changes
      (source_table, source_id, history_kind, action, entry_key, old_entry, new_entries,
       by_director, changed_by, changed_by_name, db_role)
    SELECT p_table, p_id, p_kind,
           CASE WHEN jsonb_array_length(v_added) > 0 THEN 'modified' ELSE 'removed' END,
           r ->> 'key', r -> 'entry',
           (SELECT coalesce(jsonb_agg(a -> 'entry'), '[]'::jsonb) FROM jsonb_array_elements(v_added) a),
           v_director, auth.uid(), coalesce(v_name, ''), current_setting('role', true)
      FROM jsonb_array_elements(v_removed) r;
  END IF;

  -- An entry put back after a logged removal.
  IF jsonb_array_length(v_added) > 0 THEN
    INSERT INTO public.equipment_history_changes
      (source_table, source_id, history_kind, action, entry_key, old_entry, new_entries,
       by_director, changed_by, changed_by_name, db_role)
    SELECT p_table, p_id, p_kind, 'restored', a ->> 'key', NULL, jsonb_build_array(a -> 'entry'),
           v_director, auth.uid(), coalesce(v_name, ''), current_setting('role', true)
      FROM jsonb_array_elements(v_added) a
     WHERE (SELECT c.action FROM public.equipment_history_changes c
             WHERE c.source_table = p_table AND c.source_id = p_id AND c.history_kind = p_kind
               AND c.entry_key = a ->> 'key'
             ORDER BY c.seq DESC LIMIT 1) IN ('removed', 'modified');
  END IF;

  -- Every entry of the new array; existing keys are left as recorded.
  IF p_kind = 'maintenance' THEN
    INSERT INTO public.equipment_maintenance_events
      (source_table, source_id, entry_key, entry_id, performed_on, performed_on_text, performed_by,
       performed_by_ref, next_due_on, checklist, result, entry, origin)
    SELECT p_table, p_id, n.entry_key, nullif(public.app_eqh_txt(n.raw, 'id'), ''),
           public.app_eqh_date(n.norm ->> 'conductedOn'), n.norm ->> 'conductedOn',
           coalesce(nullif(n.norm ->> 'doneByName', ''), nullif(n.norm ->> 'doneBy', '')),
           nullif(n.norm ->> 'doneBy', ''),
           public.app_eqh_date(n.norm ->> 'nextDueDate'),
           n.norm -> 'checklist',
           CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(n.norm -> 'checklist') c WHERE c ->> 'status' = 'Not OK')
                THEN 'Not OK' ELSE 'OK' END,
           n.raw, p_origin
      FROM public.app_eqh_entries(p_kind, p_new) n
     ORDER BY n.ord
    ON CONFLICT (source_table, source_id, entry_key) DO NOTHING;
  ELSE
    INSERT INTO public.equipment_intermediate_checks
      (source_table, source_id, entry_key, entry_id, performed_on, performed_on_text, performed_by,
       performed_by_ref, next_due_on, status, result, remarks, entry, origin)
    SELECT p_table, p_id, n.entry_key, nullif(public.app_eqh_txt(n.raw, 'id'), ''),
           public.app_eqh_date(n.norm ->> 'conductedOn'), n.norm ->> 'conductedOn',
           coalesce(nullif(n.norm ->> 'doneByName', ''), nullif(n.norm ->> 'doneBy', '')),
           nullif(n.norm ->> 'doneBy', ''),
           public.app_eqh_date(n.norm ->> 'nextDueDate'),
           n.norm ->> 'status',
           jsonb_build_object(
             'readings', n.norm -> 'readings',
             'masters', n.norm -> 'masters',
             'temperature', n.norm -> 'temperature',
             'humidity', n.norm -> 'humidity',
             'resultSummary', n.norm -> 'resultSummary'),
           nullif(n.norm ->> 'resultSummary', ''),
           n.raw, p_origin
      FROM public.app_eqh_entries(p_kind, p_new) n
     ORDER BY n.ord
    ON CONFLICT (source_table, source_id, entry_key) DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.app_eqh_sync(text, uuid, text, jsonb, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_eqh_sync(text, uuid, text, jsonb, jsonb, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Backfill (idempotent: entry_key + ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  c text;
  v_kind text;
  v_rows bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment_master', 'equipment_for_calibration', 'iqc_masters'] LOOP
    CONTINUE WHEN to_regclass(format('public.%I', t)) IS NULL;
    FOREACH c IN ARRAY ARRAY['maintenance_history', 'intermediate_check_history'] LOOP
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = c AND data_type = 'jsonb');
      v_kind := CASE c WHEN 'maintenance_history' THEN 'maintenance' ELSE 'intermediate_check' END;
      EXECUTE format(
        'SELECT coalesce(sum(public.app_eqh_sync(%L, id, %L, NULL, %I, ''backfill'', false)), 0) '
        'FROM public.%I WHERE jsonb_typeof(%I) = ''array'' AND jsonb_array_length(%I) > 0',
        t, v_kind, c, t, c, c)
        INTO v_rows;
      RAISE NOTICE 'backfill %.%: % register row(s) added', t, c, v_rows;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. History trigger on the equipment tables.
--    SECURITY DEFINER so it can write the registers; app users are told apart
--    by the session role (PostgREST sets role authenticated / anon /
--    service_role), which a SECURITY DEFINER function does not change.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_eqh_parent_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_enforce boolean := coalesce(nullif(current_setting('role', true), ''), 'none') IN ('authenticated', 'anon');
BEGIN
  IF v_new ? 'maintenance_history'
     AND (v_old IS NULL OR (v_old -> 'maintenance_history') IS DISTINCT FROM (v_new -> 'maintenance_history')) THEN
    PERFORM public.app_eqh_sync(TG_TABLE_NAME, NEW.id, 'maintenance',
      v_old -> 'maintenance_history', v_new -> 'maintenance_history', 'app', v_enforce);
  END IF;
  IF v_new ? 'intermediate_check_history'
     AND (v_old IS NULL OR (v_old -> 'intermediate_check_history') IS DISTINCT FROM (v_new -> 'intermediate_check_history')) THEN
    PERFORM public.app_eqh_sync(TG_TABLE_NAME, NEW.id, 'intermediate_check',
      v_old -> 'intermediate_check_history', v_new -> 'intermediate_check_history', 'app', v_enforce);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_eqh_parent_after_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  v_cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment_master', 'equipment_for_calibration', 'iqc_masters'] LOOP
    CONTINUE WHEN to_regclass(format('public.%I', t)) IS NULL;
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t
       AND column_name IN ('maintenance_history', 'intermediate_check_history');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_history_register', t);
    CONTINUE WHEN v_cols IS NULL;
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %s ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.app_eqh_parent_after_write()',
      'trg_' || t || '_history_register', v_cols, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.equipment_maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_intermediate_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_history_changes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks', 'equipment_history_changes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    -- Same outer gate as every other public table (20261009063000).
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
  -- Registers: known staff add entries as themselves. No UPDATE / DELETE policy.
  FOREACH rel IN ARRAY ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (public.app_is_known_staff() AND recorded_by = auth.uid())',
      rel || '_insert', rel);
  END LOOP;
END $$;

REVOKE ALL ON public.equipment_maintenance_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.equipment_intermediate_checks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.equipment_history_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.equipment_maintenance_events TO authenticated;
GRANT SELECT, INSERT ON public.equipment_intermediate_checks TO authenticated;
GRANT SELECT ON public.equipment_history_changes TO authenticated;
GRANT ALL ON public.equipment_maintenance_events TO service_role;
GRANT ALL ON public.equipment_intermediate_checks TO service_role;
GRANT ALL ON public.equipment_history_changes TO service_role;

COMMENT ON TABLE public.equipment_maintenance_events IS
  'ISO 17025 6.4.13: append-only maintenance register, fed from the maintenance_history JSONB of equipment_master, equipment_for_calibration and iqc_masters.';
COMMENT ON TABLE public.equipment_intermediate_checks IS
  'ISO 17025 6.4.10 / 6.4.13: append-only intermediate check register, fed from intermediate_check_history.';
COMMENT ON TABLE public.equipment_history_changes IS
  'Removals / corrections of recorded maintenance or intermediate check entries (Laboratory Director only for app users).';

-- ---------------------------------------------------------------------------
-- 8. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: equipment history registers are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks', 'equipment_history_changes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Module access (20261029100200), when present: same screens as the
--    other equipment registers; re-install the module access policies.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_installed int;
BEGIN
  IF to_regclass('public.module_table_map') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.module_table_map WHERE source = 'seed:20261031100100';
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, 'edit', 'open', 'seed:20261031100100', 'equipment history registers'
  FROM unnest(ARRAY['equipment_maintenance_events', 'equipment_intermediate_checks', 'equipment_history_changes']) AS t
  CROSS JOIN unnest(ARRAY['/masters/equipment', '/calibration/equipments', '/calibration/equipment-for-calibration',
    '/equipment-management/iqc', '/masters/iqc', '/calibration/masters-for-iqc',
    '/equipment-management/maintenance-schedule', '/equipment-management/calibration-schedule']) AS p
  ON CONFLICT (table_name, module_path) DO NOTHING;
  SELECT count(*) INTO v_installed FROM public.app_module_access_install() WHERE status = 'installed';
  RAISE NOTICE 'module access re-installed on % tables', v_installed;
END $$;

NOTIFY pgrst, 'reload schema';
