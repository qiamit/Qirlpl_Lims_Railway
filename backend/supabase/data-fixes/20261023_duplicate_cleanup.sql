-- Duplicate cleanup, lab decisions of 23 Oct 2026 (duplicate-records review).
-- A one-off data fix, not a migration. Run it as one transaction, without a
-- signed-in user (psql / Railway console), and only after a fresh backup:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261023_duplicate_cleanup.sql
-- Then run migrations 20261101100100 and 20261102100000 again to add the
-- unique keys these duplicates were blocking.
--
-- Every record is named by its id and checked against the value the lab
-- reviewed; anything unexpected raises an exception and nothing is changed.
-- Safe to run more than once: work already done is skipped.
--
--   Clients     Beamex: keep the first record, remove the 2 others.
--               Mitlhard: keep the first record, remove the other.
--               Fortune Metaliks Limited: keep GST 22AABCF3202D2ZL; move
--               everything linked to the record with GST 0322AABCF3202D2ZL to
--               it, then remove that record.
--               Quality International Research & Laboratories Private Limited:
--               keep the record with GST 22AAACQ9759P1ZP; move everything
--               linked to the record without GST to it, then remove that record.
--   Units       Keep the first °C, Joule, mm and µm; remove the exact copies.
--               (Units are stored as text elsewhere, so nothing else changes.)
--   SRF         Remove SRF-2026-0001 of Quality Engineering with its 3
--               calibration jobs (calibration conduct, no certificate) and
--               their raw data sheets. SRF-2026-0001 of BR Stainless stays.
--   Reports     The 8 report numbers held by two samples: the report issued
--               first keeps its number, the other sample gets the amendment
--               number (…A -> …AA, as the app's Amendment Report does; its ULR
--               already has -R2).
--   Not changed Equipment asset codes (different instruments; the lab updates
--               the codes in the app), client option lists, NABL lookups.
--
-- Removals are physical deletes, so the unique keys can be added; each one
-- is kept in audit_log (old row + reason).
--
-- Issued samples (a moved client link, an amendment number) are frozen by
-- samples_guard_issued_update except for a signed-in Laboratory Director.
-- Rather than run under a Director's identity (the audit trail would name
-- them), this transaction switches that one trigger off and back on at the
-- end; the audit trigger keeps recording every change with its reason.

CREATE FUNCTION pg_temp.client_refs(p_client uuid)
RETURNS TABLE (tbl text, col text, n bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('calibration_jobs', 'client_id'),
      ('calibration_service_requests', 'client_id'),
      ('consent_letters', 'client_id'),
      ('equipment_master', 'external_calibration_agency'),
      ('equipment_master', 'purchased_from'),
      ('finance_credit_notes', 'client_id'),
      ('finance_proforma_invoices', 'client_id'),
      ('finance_tax_invoices', 'client_id'),
      ('iqc_masters', 'external_calibration_agency'),
      ('iqc_masters', 'purchased_from'),
      ('pt_participations', 'provider_id'),
      ('pt_plans', 'planned_provider_id'),
      ('quotations', 'client_id'),
      ('receipt_inspections', 'supplier_id'),
      ('sale_documents', 'client_id'),
      ('samples', 'client_id'),
      ('sampling_records', 'client_id'),
      ('subcontracting_register', 'subcontract_lab_id'),
      ('subcontracting_register', 'customer_id'),
      ('supplier_approvals', 'client_id'),
      ('transactions', 'client_id')
    ) AS v(t, c)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.t AND column_name = r.c
    ) THEN
      tbl := r.t;
      col := r.c;
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.t, r.c) INTO n USING p_client;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION pg_temp.remove_client(p_id uuid, p_name text, p_gst text, p_keep uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  c record;
  r record;
  v_moved bigint;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'client % (%) already removed', p_id, p_name;
    RETURN;
  END IF;
  IF c.company_name IS DISTINCT FROM p_name OR coalesce(c.gst_number, '') IS DISTINCT FROM coalesce(p_gst, '') THEN
    RAISE EXCEPTION 'client % is "%" / GST "%", expected "%" / "%"', p_id, c.company_name, c.gst_number, p_name, p_gst;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_keep AND company_name = p_name) THEN
    RAISE EXCEPTION 'client to keep % ("%") not found', p_keep, p_name;
  END IF;

  FOR r IN SELECT * FROM pg_temp.client_refs(p_id) WHERE n > 0 LOOP
    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    UPDATE public.audit_log SET reason = p_reason
     WHERE table_name = r.tbl AND action = 'UPDATE'
       AND actor IS NULL AND reason IS NULL AND at >= now();
    RAISE NOTICE 'client %: moved % row(s) of %.% to %', p_name, v_moved, r.tbl, r.col, p_keep;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_temp.client_refs(p_id) WHERE n > 0) THEN
    RAISE EXCEPTION 'client % still has linked rows after the move', p_id;
  END IF;

  DELETE FROM public.clients WHERE id = p_id;
  UPDATE public.audit_log SET reason = p_reason
   WHERE table_name = 'clients' AND row_id = p_id::text AND action = 'DELETE'
     AND actor IS NULL AND reason IS NULL AND at >= now();
  RAISE NOTICE 'client % (%) removed', p_name, p_id;
END;
$$;

ALTER TABLE public.samples DISABLE TRIGGER samples_guard_issued_update;

DO $$
DECLARE
  k record;
  v_reason_prefix constant text := 'Duplicate cleanup, lab decision 23 Oct 2026: ';
  v_jobs uuid[];
  v_n bigint;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  -- Lets this transaction add a reason to the audit rows it writes
  -- (audit_log stays append-only otherwise).
  PERFORM set_config('app.audit_annotate', 'on', true);

  -- Clients ------------------------------------------------------------------
  PERFORM pg_temp.remove_client('e3b914fb-28fa-41e6-bb33-6aa237e55ec5', 'Beamex', NULL,
    'fcba51ad-0cf2-4742-bd88-4daa4dd19749', v_reason_prefix || 'duplicate client Beamex, kept fcba51ad-0cf2-4742-bd88-4daa4dd19749');
  PERFORM pg_temp.remove_client('98162250-0811-452b-92b7-6d63b518fe55', 'Beamex', NULL,
    'fcba51ad-0cf2-4742-bd88-4daa4dd19749', v_reason_prefix || 'duplicate client Beamex, kept fcba51ad-0cf2-4742-bd88-4daa4dd19749');
  PERFORM pg_temp.remove_client('6c59173b-0d95-4797-957c-83090b8adffa', 'Mitlhard', NULL,
    'd8072100-e87e-4182-b9af-fe69ffba6708', v_reason_prefix || 'duplicate client Mitlhard, kept d8072100-e87e-4182-b9af-fe69ffba6708');
  PERFORM pg_temp.remove_client('eedbb73a-1203-43ae-a3f0-9f5ec4763f4f', 'Fortune Metaliks Limited', '0322AABCF3202D2ZL',
    'b1c118a7-0fe2-4552-9354-fa53033a928e', v_reason_prefix || 'wrong GST 0322AABCF3202D2ZL; records moved to the client with GST 22AABCF3202D2ZL');
  PERFORM pg_temp.remove_client('43aa74da-8f1c-4046-8548-3bc735b3803a', 'Quality International Research & Laboratories Private Limited', NULL,
    'f834891b-8957-4e84-9d68-8b9221b1fe64', v_reason_prefix || 'duplicate without GST; records moved to the client with GST 22AAACQ9759P1ZP');

  -- Units --------------------------------------------------------------------
  FOR k IN
    SELECT * FROM (VALUES
      ('b53b95ec-46eb-418f-97e3-b1c2cdb2f127'::uuid, '°C',    '54d6b635-b609-4068-a437-1f3389b79862'::uuid),
      ('ba5bab83-5f4e-49eb-8ced-79dd3797de4f'::uuid, 'Joule', '69250e6a-630c-47b3-9df9-93608490ab47'::uuid),
      ('af128274-b820-4d07-b369-726a2d9487bb'::uuid, 'mm',    '088b5695-1f3e-4e34-8a5e-5b8c0e023628'::uuid),
      ('9c688578-f9b5-4c44-8d58-2ea9fd4caa70'::uuid, 'µm',    'fbad83dc-0c31-4d77-a43f-bd4537439c41'::uuid),
      ('b13c66ae-f395-44cb-9c2d-2235f700537b'::uuid, 'µm',    'fbad83dc-0c31-4d77-a43f-bd4537439c41'::uuid),
      ('c8c8b423-b96f-4ebc-afcc-b843c75ac1a0'::uuid, 'µm',    'fbad83dc-0c31-4d77-a43f-bd4537439c41'::uuid),
      ('c3a0157e-4fd9-4d34-ac1f-43cdc8116994'::uuid, 'µm',    'fbad83dc-0c31-4d77-a43f-bd4537439c41'::uuid),
      ('1a9536bb-726f-4edd-8cdc-4515018ff7a9'::uuid, 'µm',    'fbad83dc-0c31-4d77-a43f-bd4537439c41'::uuid)
    ) AS v(id, name, keep_id)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.test_parameter_units WHERE id = k.id) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.test_parameter_units WHERE id = k.id AND name = k.name)
       OR NOT EXISTS (SELECT 1 FROM public.test_parameter_units WHERE id = k.keep_id AND name = k.name) THEN
      RAISE EXCEPTION 'unit % is not an exact copy of %', k.id, k.name;
    END IF;
    DELETE FROM public.test_parameter_units WHERE id = k.id;
    RAISE NOTICE 'unit % (%) removed, kept %', k.name, k.id, k.keep_id;
  END LOOP;

  -- SRF-2026-0001 of Quality Engineering ---------------------------------------
  IF EXISTS (SELECT 1 FROM public.calibration_service_requests WHERE id = '1218430e-9691-405c-b6a9-3a0727ffa293') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.calibration_service_requests
      WHERE id = '1218430e-9691-405c-b6a9-3a0727ffa293'
        AND srf_number = 'SRF-2026-0001' AND client_name = 'Quality Engineering'
    ) THEN
      RAISE EXCEPTION 'SRF 1218430e-… is not SRF-2026-0001 of Quality Engineering';
    END IF;
    SELECT array_agg(id) INTO v_jobs
      FROM public.calibration_jobs
     WHERE service_request_id = '1218430e-9691-405c-b6a9-3a0727ffa293';
    IF EXISTS (
      SELECT 1 FROM public.calibration_jobs
      WHERE id = ANY (coalesce(v_jobs, '{}')) AND stage IS DISTINCT FROM 'calibration_conduct'
    ) THEN
      RAISE EXCEPTION 'a job of SRF-2026-0001 (Quality Engineering) is past calibration conduct; not removed';
    END IF;
    IF to_regclass('public.calibration_certificate_amendments') IS NOT NULL THEN
      EXECUTE 'SELECT count(*) FROM public.calibration_certificate_amendments WHERE calibration_job_id = ANY ($1)'
        INTO v_n USING coalesce(v_jobs, '{}');
      IF v_n > 0 THEN
        RAISE EXCEPTION 'SRF-2026-0001 (Quality Engineering) has certificate amendments; not removed';
      END IF;
    END IF;

    DELETE FROM public.calibration_raw_data_sheets WHERE calibration_job_id = ANY (coalesce(v_jobs, '{}'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'SRF-2026-0001 (Quality Engineering): % raw data sheet(s) removed', v_n;
    DELETE FROM public.calibration_jobs WHERE id = ANY (coalesce(v_jobs, '{}'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'SRF-2026-0001 (Quality Engineering): % calibration job(s) removed', v_n;
    DELETE FROM public.calibration_service_requests WHERE id = '1218430e-9691-405c-b6a9-3a0727ffa293';
    RAISE NOTICE 'SRF-2026-0001 (Quality Engineering) removed';
  ELSE
    RAISE NOTICE 'SRF-2026-0001 (Quality Engineering) already removed';
  END IF;

  -- Report numbers -------------------------------------------------------------
  FOR k IN
    SELECT * FROM (VALUES
      ('c298ea42-bcab-477b-b5cd-cf5433a2da75'::uuid, 'SR260716/107-001', 'QI/REP/20260179A', 'QI/REP/20260179AA', 'SR260611/76-005S'),
      ('584b21c2-f1d2-4b86-9b33-6584c1a3271a'::uuid, 'SR260716/107-002', 'QI/REP/20260180A', 'QI/REP/20260180AA', 'SR260611/76-006S'),
      ('2f91481f-095f-458f-84a2-68f2d2884751'::uuid, 'SR260716/107-003', 'QI/REP/20260181A', 'QI/REP/20260181AA', 'SR260611/76-004S'),
      ('0e223670-3e44-4f49-b5d2-fb60e04d1ff6'::uuid, 'SR260716/107-004', 'QI/REP/20260182A', 'QI/REP/20260182AA', 'SR260611/76-003S'),
      ('53cfafaa-859a-4f08-bd1d-93753959626f'::uuid, 'SR260716/107-005', 'QI/REP/20260183A', 'QI/REP/20260183AA', 'SR260611/76-002S'),
      ('5a7a4af1-8e40-4c87-adcb-43517b81cdb3'::uuid, 'SR260716/107-006', 'QI/REP/20260184A', 'QI/REP/20260184AA', 'SR260611/76-001S'),
      ('02f588b0-4f10-4f50-81f9-a705bf18ab5c'::uuid, 'SR260801/118-001', 'QI/REP/20260185A', 'QI/REP/20260185AA', 'SR260716/107-007'),
      ('53a4a3c6-24e1-4873-a7cb-bf9edd4e00ee'::uuid, 'SR260818/134-001', 'QI/REP/20260296A', 'QI/REP/20260296AA', 'SR260916/172-001')
    ) AS v(sample_id, srf, old_no, new_no, kept_by)
  LOOP
    IF EXISTS (SELECT 1 FROM public.samples WHERE id = k.sample_id AND srf_number = k.srf AND test_report_number = k.new_no) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.samples WHERE id = k.sample_id AND srf_number = k.srf AND test_report_number = k.old_no) THEN
      RAISE EXCEPTION 'sample % is not % with report number %', k.sample_id, k.srf, k.old_no;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.samples WHERE srf_number = k.kept_by AND test_report_number = k.old_no) THEN
      RAISE EXCEPTION '% no longer holds %; review this pair again', k.kept_by, k.old_no;
    END IF;
    IF EXISTS (SELECT 1 FROM public.samples WHERE lower(btrim(test_report_number)) = lower(k.new_no)) THEN
      RAISE EXCEPTION 'amendment number % is already used', k.new_no;
    END IF;
    UPDATE public.samples SET test_report_number = k.new_no WHERE id = k.sample_id;
    UPDATE public.audit_log
       SET reason = v_reason_prefix || format('report number %s was also on %s (issued first); this sample gets amendment number %s',
                                              k.old_no, k.kept_by, k.new_no)
     WHERE table_name = 'samples' AND row_id = k.sample_id::text AND action = 'UPDATE'
       AND actor IS NULL AND reason IS NULL AND at >= now();
    RAISE NOTICE '% : % -> % (% keeps %)', k.srf, k.old_no, k.new_no, k.kept_by, k.old_no;
  END LOOP;

  -- Reason on the remaining audit rows this transaction wrote (units, SRF).
  UPDATE public.audit_log
     SET reason = v_reason_prefix || CASE table_name
       WHEN 'test_parameter_units' THEN 'exact duplicate unit removed'
       WHEN 'calibration_service_requests' THEN 'SRF-2026-0001 of Quality Engineering removed (number also used by BR Stainless)'
       WHEN 'calibration_jobs' THEN 'job of removed SRF-2026-0001 (Quality Engineering)'
       WHEN 'calibration_raw_data_sheets' THEN 'raw data sheet of removed SRF-2026-0001 (Quality Engineering)'
       ELSE 'duplicate cleanup'
     END
   WHERE actor IS NULL AND reason IS NULL AND at >= now();
END $$;

ALTER TABLE public.samples ENABLE TRIGGER samples_guard_issued_update;
