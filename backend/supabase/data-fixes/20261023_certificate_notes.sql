-- Calibration certificate notes per instrument (OQ-02 staging run, 23 Oct
-- 2026). The Certificate Format of every instrument (278 equipment, 293
-- formats with the ranges) holds the force testing machine notes ("class of
-- machine … IS 1828 Part 1", "lower limit of the machine", "two work
-- areas"), because those were the app's default; a vernier caliper
-- certificate printed them. A one-off data fix, not a migration. Run it as one
-- transaction, without a signed-in user, after a fresh backup:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261023_certificate_notes.sql
--
-- Only formats whose notes are still exactly that default text (md5
-- dba1ca8f3da56bdc7013ec0a15308d7a) change, and only on instruments that are
-- not force testing machines; UTMs, tensile and compression testing machines
-- keep the IS 1828 notes. The new notes hold the conformity line, which the
-- certificate fills from the SRF. A format the lab edited is left alone.
-- The remark "done at the Site of Customer" is not changed here: the app now
-- writes the place of calibration from the job. Safe to run more than once.

DO $$
DECLARE
  v_legacy constant text := 'dba1ca8f3da56bdc7013ec0a15308d7a';
  v_notes constant text := '1. No statement of conformity was requested by the customer.';
  r record;
  v_cfg jsonb;
  v_ranges jsonb;
  v_formats integer := 0;
  v_rows integer := 0;
  i integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  PERFORM set_config('app.audit_annotate', 'on', true);

  FOR r IN
    SELECT id, equipment_name, certificate_template_config, measurement_ranges
    FROM public.equipment_master
    WHERE equipment_name !~* '(testing machine|tasting machine|\mutm\M)'
    FOR UPDATE
  LOOP
    v_cfg := r.certificate_template_config;
    v_ranges := r.measurement_ranges;
    IF md5(v_cfg ->> 'defaultNotes') = v_legacy THEN
      v_cfg := jsonb_set(v_cfg, '{defaultNotes}', to_jsonb(v_notes));
      v_formats := v_formats + 1;
    END IF;
    FOR i IN 0 .. coalesce(jsonb_array_length(v_ranges), 0) - 1 LOOP
      IF md5(v_ranges #>> ARRAY[i::text, 'certificate_template_config', 'defaultNotes']) = v_legacy THEN
        v_ranges := jsonb_set(v_ranges, ARRAY[i::text, 'certificate_template_config', 'defaultNotes'], to_jsonb(v_notes));
        v_formats := v_formats + 1;
      END IF;
    END LOOP;
    IF v_cfg IS DISTINCT FROM r.certificate_template_config OR v_ranges IS DISTINCT FROM r.measurement_ranges THEN
      UPDATE public.equipment_master
         SET certificate_template_config = v_cfg, measurement_ranges = v_ranges
       WHERE id = r.id;
      UPDATE public.audit_log
         SET reason = 'Certificate notes: machine (IS 1828) notes replaced by the general notes, OQ-02 23 Oct 2026'
       WHERE table_name = 'equipment_master' AND row_id = r.id::text AND action = 'UPDATE'
         AND actor IS NULL AND reason IS NULL AND at >= now();
      v_rows := v_rows + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'certificate formats changed: %, equipment records: %', v_formats, v_rows;
END $$;
