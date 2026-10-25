-- Unique keys that the repository's migrations define but production never got
-- (staging step D, 23 Oct 2026). NOT applied automatically. Safe to run more
-- than once.
--
-- Production's public schema has 1 unique constraint and 7 unique indexes;
-- the migrations in this repository define 82. The tables were created in
-- production before those migrations ran, and CREATE TABLE IF NOT EXISTS
-- skipped their UNIQUE clauses. Effects:
--   * upserts with onConflict on these columns fail with 42P10 (new client,
--     equipment / IQC / product bulk save, calibration SRF, management
--     documents, audit NC action);
--   * two records can get the same asset code, complaint ID, NC ID, SRF
--     number, plan code, ...;
--   * app_deleted_keys (soft delete: numbers of deleted records are not
--     reused) refuses a column without a unique key, so pages fall back to
--     visible rows only.
--
-- For every key below, under the name the repository uses:
--   already there (by name, or an equal unique index under another name)
--                                      -> left alone;
--   table or column missing             -> NOTICE, skipped;
--   existing rows hold duplicates       -> NOTICE with the duplicate values,
--                                          skipped. Nothing is renamed or
--                                          deleted: resolve them in the app,
--                                          then run this file again;
--   otherwise                           -> unique key added (covers deleted
--                                          rows too, like the other keys).
-- samples.test_report_number is handled by 20261101100100.

DO $$
DECLARE
  k record;
  v_rel regclass;
  v_parts text[];
  v_part text;
  v_missing text;
  v_where text;
  v_covered text;
  v_dup_groups integer;
  v_examples text;
  v_added integer := 0;
  v_present integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR k IN
    SELECT *
    FROM (VALUES
    ('accreditation_bodies', 'accreditation_bodies_name_key', 'constraint', 'name', NULL),
    ('ai_skills', 'idx_ai_skills_name', 'index', 'name', NULL),
    ('audit_checklist_items', 'audit_checklist_items_plan_clause_unique', 'constraint', 'audit_plan_id, clause_no', NULL),
    ('audit_nc_actions', 'audit_nc_actions_checklist_item_unique', 'constraint', 'checklist_item_id', NULL),
    ('audit_plans', 'audit_plans_audit_id_unique', 'constraint', 'audit_id', NULL),
    ('calibration_jobs', 'calibration_jobs_srf_line_key', 'constraint', 'service_request_id, equipment_line_index', NULL),
    ('calibration_nabl_scope', 'calibration_nabl_scope_s_no_key', 'constraint', 's_no', NULL),
    ('calibration_raw_data_sheets', 'calibration_raw_data_sheets_calibration_job_id_key', 'constraint', 'calibration_job_id', NULL),
    ('calibration_service_requests', 'calibration_service_requests_srf_number_key', 'constraint', 'srf_number', NULL),
    ('client_master_options', 'idx_client_master_options_cat_label', 'index', 'category, label', NULL),
    ('clients', 'idx_clients_company_name', 'index', 'company_name', NULL),
    ('consent_letters', 'idx_consent_letters_consent_letter_no_unique', 'index', 'consent_letter_no', NULL),
    ('customer_complaints', 'customer_complaints_complaint_id_key', 'constraint', 'complaint_id', NULL),
    ('customer_feedback', 'customer_feedback_feedback_id_key', 'constraint', 'feedback_id', NULL),
    ('equipment_breakdown_register', 'equipment_breakdown_register_register_no_key', 'constraint', 'register_no', NULL),
    ('equipment_crms', 'equipment_crms_id_no_key', 'constraint', 'id_no', NULL),
    ('equipment_for_calibration', 'equipment_for_calibration_asset_code_key', 'constraint', 'asset_code', NULL),
    ('equipment_master', 'equipment_master_asset_code_key', 'constraint', 'asset_code', NULL),
    ('gr_confidentiality_records', 'gr_confidentiality_records_record_id_key', 'constraint', 'record_id', NULL),
    ('gr_impartiality_risks', 'gr_impartiality_risks_risk_id_key', 'constraint', 'risk_id', NULL),
    ('gr_improvements', 'gr_improvements_improvement_id_key', 'constraint', 'improvement_id', NULL),
    ('gr_objectives', 'gr_objectives_objective_id_key', 'constraint', 'objective_id', NULL),
    ('gr_risk_opportunities', 'gr_risk_opportunities_item_id_key', 'constraint', 'item_id', NULL),
    ('gst_rates', 'gst_rates_rate_key', 'constraint', 'rate', NULL),
    ('iqc_masters', 'iqc_masters_asset_code_key', 'constraint', 'asset_code', NULL),
    ('management_documents', 'management_documents_level_doc_number_unique', 'constraint', 'level, doc_number', NULL),
    ('module_access_rules', 'module_access_rules_subject_module_uq', 'constraint', 'subject_type, subject_key, module_key', NULL),
    ('mrm_agenda_items', 'mrm_agenda_items_plan_letter_unique', 'constraint', 'plan_id, clause_letter', NULL),
    ('mrm_plan_recipients', 'mrm_plan_recipients_plan_user_unique', 'constraint', 'plan_id, user_id', NULL),
    ('mrm_plans', 'mrm_plans_plan_code_unique', 'constraint', 'plan_code', NULL),
    ('nabl_scope', 'idx_nabl_scope_s_no', 'index', 's_no', NULL),
    ('nabl_scope_lookups', 'nabl_scope_lookups_kind_name_key', 'constraint', 'kind, name', NULL),
    ('nc_work_corrective_actions', 'nc_work_corrective_actions_record_unique', 'constraint', 'nc_work_record_id', NULL),
    ('nc_work_records', 'nc_work_records_nc_id_key', 'constraint', 'nc_id', NULL),
    ('physical_condition_options', 'physical_condition_options_name_key', 'constraint', 'name', NULL),
    ('product_item_categories', 'product_item_categories_name_key', 'constraint', 'name', NULL),
    ('product_makes', 'product_makes_name_key', 'constraint', 'name', NULL),
    ('products_services_master', 'products_services_master_item_code_key', 'constraint', 'item_code', NULL),
    ('quotation_notes', 'quotation_notes_one_default_per_kind', 'index', 'document_kind', 'is_default'),
    ('quotation_remarks', 'quotation_remarks_one_default', 'index', '(true)', 'is_default'),
    ('quotation_terms_conditions', 'quotation_terms_conditions_one_default_per_kind', 'index', 'document_kind', 'is_default'),
    ('quotations', 'quotations_quotation_number_key', 'constraint', 'quotation_number', NULL),
    ('result_validity_checks', 'idx_result_validity_checks_check_ref', 'index', 'check_ref', NULL),
    ('test_parameter_units', 'test_parameter_units_name_key', 'constraint', 'name', NULL)
    ) AS t(tbl, name, kind, key_cols, pred)
    ORDER BY tbl, name
  LOOP
    v_rel := to_regclass(format('public.%I', k.tbl));
    IF v_rel IS NULL THEN
      RAISE NOTICE '% skipped: table public.% missing', k.name, k.tbl;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF to_regclass(format('public.%I', k.name)) IS NOT NULL THEN
      v_present := v_present + 1;
      CONTINUE;
    END IF;

    v_parts := regexp_split_to_array(k.key_cols, ',\s*');

    SELECT string_agg(p, ', ') INTO v_missing
    FROM unnest(v_parts) p
    WHERE p ~ '^[a-z_][a-z0-9_]*$'
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = v_rel AND a.attname = p AND a.attnum > 0 AND NOT a.attisdropped
      );
    IF v_missing IS NOT NULL THEN
      RAISE NOTICE '% skipped: public.% has no column %', k.name, k.tbl, v_missing;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- An equal unique index under another name (plain columns, no predicate).
    IF k.pred IS NULL AND k.key_cols ~ '^[a-z0-9_, ]+$' THEN
      SELECT ic.relname INTO v_covered
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = v_rel
        AND i.indisunique
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
             WHERE a.attrelid = v_rel AND a.attnum = ANY (i.indkey))
            = (SELECT array_agg(p ORDER BY p) FROM unnest(v_parts) p)
      LIMIT 1;
      IF v_covered IS NOT NULL THEN
        RAISE NOTICE '% not added: % already covers public.%(%)', k.name, v_covered, k.tbl, k.key_cols;
        v_present := v_present + 1;
        CONTINUE;
      END IF;
    END IF;

    -- Rows the key would cover: every key value set, within the predicate.
    SELECT string_agg(format('(%s) IS NOT NULL', p), ' AND ') INTO v_where FROM unnest(v_parts) p;
    IF k.pred IS NOT NULL THEN
      v_where := v_where || format(' AND (%s)', k.pred);
    END IF;

    -- Key values are aliased k1, k2, ... so a constant key such as (true)
    -- can still be grouped.
    EXECUTE format(
      'SELECT count(*), string_agg(format(%L, key_value, copies), %L) '
      'FROM (SELECT concat_ws(%L, %s) AS key_value, count(*) AS copies '
      '      FROM (SELECT %s FROM public.%I WHERE %s) s GROUP BY %s HAVING count(*) > 1 '
      '      ORDER BY 2 DESC, 1) d',
      '%s (%s rows)', '; ', ' / ',
      (SELECT string_agg(format('k%s::text', o), ', ') FROM unnest(v_parts) WITH ORDINALITY u(p, o)),
      (SELECT string_agg(format('(%s) AS k%s', p, o), ', ') FROM unnest(v_parts) WITH ORDINALITY u(p, o)),
      k.tbl, v_where,
      (SELECT string_agg(format('k%s', o), ', ') FROM unnest(v_parts) WITH ORDINALITY u(p, o)))
    INTO v_dup_groups, v_examples;

    IF v_dup_groups > 0 THEN
      RAISE NOTICE '% skipped: % duplicate value(s) in public.%(%): %',
        k.name, v_dup_groups, k.tbl, k.key_cols, left(v_examples, 1500);
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      IF k.kind = 'constraint' THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)', k.tbl, k.name, k.key_cols);
      ELSE
        EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s)%s', k.name, k.tbl, k.key_cols,
                       CASE WHEN k.pred IS NULL THEN '' ELSE ' WHERE ' || k.pred END);
      END IF;
      v_added := v_added + 1;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE '% skipped: a duplicate appeared while adding it', k.name;
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RAISE NOTICE 'unique keys: % added, % already present, % skipped', v_added, v_present, v_skipped;
END $$;

NOTIFY pgrst, 'reload schema';
