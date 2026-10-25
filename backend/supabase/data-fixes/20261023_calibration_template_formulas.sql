-- Calibration raw data templates: repair the formulas that stopped working
-- (OQ-02 staging run, 23 Oct 2026). A one-off data fix, not a migration. Run
-- it as one transaction, without a signed-in user, after a fresh backup:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261023_calibration_template_formulas.sql
--
-- Vernier Caliper QI-EQ-0002 (equipment template and ranges 0–150, 0–200 LC
-- 0.01, 0–300, 0–450, 0–600): columns were renamed ("DUC Reading 1 mm" →
-- "DUC Reading E1 mm", "Average Reading mm" → "Average Reading External Jaws
-- mm") and "Master Reading Observed mm" was removed, but the formulas kept the
-- old names, so Average and Observed Error stayed empty and the sheet could
-- not be saved. Range 0–300 also had damaged text ("=[DUC Reading E1
-- mm]verage(…)", "=AVERAGE [..],[..],[..]" without brackets, an unclosed
-- MAX). Range 0–200 LC 0.02 still has its old column names and works: not
-- changed.
--
-- Vernier Caliper 300 QI-EQ-0196 (equipment template and its range): all
-- three tables had a column named "Average", so [Average] in the Internal
-- Jaws and Depth errors took the External Jaws average; those two columns are
-- renamed "Average I" / "Average D". The parallelism formula "=Max[A],[B],[C]
-- -Min[A],[B],[C]" (comma operator, kept only the last value) becomes
-- MAX(…)−MIN(…).
--
-- Observed error is written as Average − Master reading (indication minus
-- reference value, VIM 2.16), as in the lab's own Internal / Depth formulas.
-- Vernier Caliper range 0–200 LC 0.02 still uses Master − Average: for the
-- lab to align.
--
-- Not changed: the MU templates of these instruments (placeholder entries,
-- to be built by the lab) and raw data sheets already started for jobs.
--
-- Each row is checked first: the column must still have its old label and
-- formula (or already the new ones, then it is skipped); anything else stops
-- the fix without changing anything. Safe to run more than once.

CREATE OR REPLACE FUNCTION pg_temp.fix_template_column(
  tpl jsonb, p_key text, p_old_label text, p_old_expr text,
  p_new_label text, p_new_expr text, p_new_sources jsonb,
  OUT result jsonb, OUT state text)
LANGUAGE plpgsql AS $$
DECLARE
  tables text[] := ARRAY['{columns}'];
  t text;
  i integer;
  col jsonb;
  path text[];
BEGIN
  result := tpl;
  FOR i IN 0 .. coalesce(jsonb_array_length(tpl->'extraTables'), 0) - 1 LOOP
    tables := tables || format('{extraTables,%s,columns}', i);
  END LOOP;
  FOREACH t IN ARRAY tables LOOP
    FOR i IN 0 .. coalesce(jsonb_array_length(tpl #> t::text[]), 0) - 1 LOOP
      path := t::text[] || i::text;
      col := tpl #> path;
      CONTINUE WHEN col->>'key' IS DISTINCT FROM p_key;
      IF col->>'label' = p_new_label AND col #>> '{formula,expression}' = p_new_expr THEN
        state := 'already';
        RETURN;
      END IF;
      IF col->>'label' IS DISTINCT FROM p_old_label OR col #>> '{formula,expression}' IS DISTINCT FROM p_old_expr THEN
        state := format('changed meanwhile: label %L, formula %L', col->>'label', col #>> '{formula,expression}');
        RETURN;
      END IF;
      result := jsonb_set(result, path || '{label}'::text[], to_jsonb(p_new_label));
      result := jsonb_set(result, path || '{formula,expression}'::text[], to_jsonb(p_new_expr));
      IF p_new_sources IS NOT NULL THEN
        result := jsonb_set(result, path || '{formula,sources}'::text[], p_new_sources);
      END IF;
      state := 'fixed';
      RETURN;
    END LOOP;
  END LOOP;
  state := 'column not found';
END $$;

DO $$
DECLARE
  k record;
  r record;
  v_tpl jsonb;
  v_ranges jsonb;
  v_idx integer;
  v_fixed integer := 0;
  v_already integer := 0;
  v_touched uuid[] := '{}';
  -- Vernier Caliper QI-EQ-0002 ranges with the renamed columns (not 0–200 LC 0.02).
  vc_ranges constant text[] := ARRAY[
    'equipment',
    '2aca2474-ec4c-4de7-9e43-ded5d2be7a8f', '298f8e57-cd44-4d8d-90cf-5e2b7db31a5a',
    '618642d4-8159-465b-a683-85d2907e6332', 'd31a8dd0-6422-4552-9f0b-33d4bee9357a',
    '125510e5-06b6-4cb6-a287-dbac8339d417', '373a95e7-57de-4e4e-9c44-740069321fa2'];
  vc_300  constant text := 'e8ed834e-3ca4-4b97-805d-65d1049fb38d';
  vc300_scopes constant text[] := ARRAY['equipment', '70fa84c9-7d2a-41e4-b7de-5b7287afef92'];
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  PERFORM set_config('app.audit_annotate', 'on', true);

  CREATE TEMP TABLE fixes (
    equipment_id uuid, scope text, col_key text, old_label text, old_expr text,
    new_label text, new_expr text, new_sources jsonb) ON COMMIT DROP;

  -- Vernier Caliper QI-EQ-0002, External Jaws (equipment template + 6 ranges).
  INSERT INTO fixes
  SELECT '34bb7745-685c-4f61-ad13-8c803a5b5515', s, v.*
  FROM unnest(vc_ranges) s,
  (VALUES
    ('col_415aec739a', 'Average Reading External Jaws mm',
     '=Average([DUC Reading 1 mm],[DUC Reading 2 mm],[DUC Reading 3 mm])',
     'Average Reading External Jaws mm',
     '=AVERAGE([DUC Reading E1 mm],[DUC Reading E2 mm],[DUC Reading E3 mm])',
     '["col_fe8478c543","col_228a066f38","col_04ffbd4e6b"]'::jsonb),
    ('col_5f8d35fdcd', 'Observed Error  External Jaws  mm',
     '=[Master Reading Observed mm]-[Average Reading mm]',
     'Observed Error  External Jaws  mm',
     '=[Average Reading External Jaws mm]-[Master Reading Actual mm]',
     '["col_415aec739a","col_9c31e3f86a"]'::jsonb)
  ) v;

  -- Vernier Caliper QI-EQ-0002, range 0–300 (own labels and damaged text).
  INSERT INTO fixes VALUES
    ('34bb7745-685c-4f61-ad13-8c803a5b5515', vc_300, 'col_415aec739a', 'Average Reading External Jaws in mm',
     '=[DUC Reading E1 mm]verage([DUC Reading 1 mm],[DUC Reading 2 mm],[DUC Reading 3 mm])',
     'Average Reading External Jaws in mm',
     '=AVERAGE([DUC Reading E1 mm],[DUC Reading E2 mm],[DUC Reading E3 mm])',
     '["col_fe8478c543","col_228a066f38","col_04ffbd4e6b"]'),
    ('34bb7745-685c-4f61-ad13-8c803a5b5515', vc_300, 'col_5f8d35fdcd', 'Observed Error External Jaw',
     '=[Master Reading Observed mm]-[Average Reading mm]',
     'Observed Error External Jaw',
     '=[Average Reading External Jaws in mm]-[Master Reading Actual External  mm]',
     '["col_415aec739a","col_9c31e3f86a"]'),
    ('34bb7745-685c-4f61-ad13-8c803a5b5515', vc_300, 'col_98ff8be3d3', 'Average Reading Internal  Jaws in mm',
     '=Average [DUC Reading I1 mm],[DUC Reading I2 mm],[DUC Reading I3 mm])',
     'Average Reading Internal  Jaws in mm',
     '=AVERAGE([DUC Reading I1 mm],[DUC Reading I2 mm],[DUC Reading I3 mm])', NULL),
    ('34bb7745-685c-4f61-ad13-8c803a5b5515', vc_300, 'col_39d4ccad14', 'Average Reading Depth  Jaws in mm',
     '=AVERAGE [DUC Reading D1 mm],[DUC Reading D2 mm],[DUC Reading D3 mm]',
     'Average Reading Depth  Jaws in mm',
     '=AVERAGE([DUC Reading D1 mm],[DUC Reading D2 mm],[DUC Reading D3 mm])', NULL),
    ('34bb7745-685c-4f61-ad13-8c803a5b5515', vc_300, 'col_5a4ba1e9f5', 'Error ( Max-Min )',
     '=MAX([Reading A],[Reading B],[Reading C]-MIN([Reading A],[Reading B],[Reading C])',
     'Error ( Max-Min )',
     '=MAX([Reading A],[Reading B],[Reading C])-MIN([Reading A],[Reading B],[Reading C])', NULL);

  -- Vernier Caliper 300 QI-EQ-0196 (equipment template + its range).
  INSERT INTO fixes
  SELECT '23efd150-4baa-4d52-bf20-d0a641704705', s, v.*
  FROM unnest(vc300_scopes) s,
  (VALUES
    ('col_f92de46aa0', 'Average',
     '=Average([Observed Readings I1],[Observed Readings I2],[Observed Readings I3])',
     'Average I',
     '=AVERAGE([Observed Readings I1],[Observed Readings I2],[Observed Readings I3])', NULL::jsonb),
    ('col_b0c0909b72', 'Error', '=[Average]-[Master I]', 'Error', '=[Average I]-[Master I]',
     '["col_f92de46aa0","col_79d3dac1bc"]'::jsonb),
    ('col_d4d50e11c4', 'Average',
     '=Average([Observed Readings D1],[Observed Readings D2],[Observed Readings D3])',
     'Average D',
     '=AVERAGE([Observed Readings D1],[Observed Readings D2],[Observed Readings D3])', NULL),
    ('col_3389bc5c9d', 'Error', '=[Average]-[Master D]', 'Error', '=[Average D]-[Master D]',
     '["col_d4d50e11c4","col_25b3908a47"]'),
    ('col_866cfbf92f', 'Error (Max-Min)',
     '=Max[Reading A],[Reading B],[Reading C]-Min[Reading A],[Reading B],[Reading C]',
     'Error (Max-Min)',
     '=MAX([Reading A],[Reading B],[Reading C])-MIN([Reading A],[Reading B],[Reading C])', NULL)
  ) v;

  FOR r IN SELECT DISTINCT equipment_id FROM fixes LOOP
    SELECT raw_data_sheet_template, measurement_ranges INTO v_tpl, v_ranges
    FROM public.equipment_master WHERE id = r.equipment_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'equipment % not found', r.equipment_id;
    END IF;

    FOR k IN SELECT * FROM fixes WHERE equipment_id = r.equipment_id LOOP
      DECLARE
        v_res record;
      BEGIN
        IF k.scope = 'equipment' THEN
          SELECT * INTO v_res FROM pg_temp.fix_template_column(v_tpl, k.col_key, k.old_label, k.old_expr,
            k.new_label, k.new_expr, k.new_sources);
          v_tpl := v_res.result;
        ELSE
          SELECT (o - 1)::integer INTO v_idx
          FROM jsonb_array_elements(v_ranges) WITH ORDINALITY e(x, o) WHERE x->>'id' = k.scope;
          IF v_idx IS NULL THEN
            RAISE EXCEPTION 'equipment %: range % not found', r.equipment_id, k.scope;
          END IF;
          SELECT * INTO v_res FROM pg_temp.fix_template_column(v_ranges #> ARRAY[v_idx::text, 'raw_data_sheet_template'],
            k.col_key, k.old_label, k.old_expr, k.new_label, k.new_expr, k.new_sources);
          v_ranges := jsonb_set(v_ranges, ARRAY[v_idx::text, 'raw_data_sheet_template'], v_res.result);
        END IF;
        IF v_res.state = 'fixed' THEN
          v_fixed := v_fixed + 1;
        ELSIF v_res.state = 'already' THEN
          v_already := v_already + 1;
        ELSE
          RAISE EXCEPTION 'equipment % (%), column %: %', r.equipment_id, k.scope, k.col_key, v_res.state;
        END IF;
      END;
    END LOOP;

    UPDATE public.equipment_master
       SET raw_data_sheet_template = v_tpl, measurement_ranges = v_ranges
     WHERE id = r.equipment_id
       AND (raw_data_sheet_template IS DISTINCT FROM v_tpl OR measurement_ranges IS DISTINCT FROM v_ranges);
    IF FOUND THEN
      v_touched := v_touched || r.equipment_id;
    END IF;
  END LOOP;

  UPDATE public.audit_log
     SET reason = 'Raw data template formulas repaired (renamed columns, damaged formulas), OQ-02 23 Oct 2026'
   WHERE table_name = 'equipment_master' AND row_id = ANY (v_touched::text[]) AND action = 'UPDATE'
     AND actor IS NULL AND reason IS NULL AND at >= now();

  RAISE NOTICE 'template formulas fixed: %, already fixed: %, equipment records changed: %',
    v_fixed, v_already, cardinality(v_touched);
END $$;
