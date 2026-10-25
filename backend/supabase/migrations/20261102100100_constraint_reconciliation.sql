-- Foreign keys and CHECK rules that the repository's migrations define but
-- production never got (staging step D follow-up, 23 Oct 2026). NOT applied
-- automatically. Safe to run more than once. Companion of 20261102100000
-- (unique keys).
--
-- 74 rules: 12 foreign keys (created_by / user_id style columns to
-- auth.users) and 62 CHECKs (allowed status / type values, ranges, non-empty
-- text). On the staging copy of production no existing row breaks any of
-- them, and each value list matches the options the app offers for that
-- field.
--
-- For every rule, under the name the repository uses:
--   already there (same name, or the same definition under another name)
--                                      -> left alone;
--   table or column missing             -> NOTICE, skipped;
--   existing rows break it              -> NOTICE with the offending values,
--                                          skipped (nothing is changed;
--                                          correct the rows and run again);
--   otherwise                           -> added and validated.

DO $$
DECLARE
  k record;
  v_rel regclass;
  v_expr text;
  v_fk text[];
  v_bad bigint;
  v_examples text;
  v_added integer := 0;
  v_present integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR k IN
    SELECT *
    FROM (VALUES
    ('audit_checklist_items', 'audit_checklist_items_conformity_check', 'CHECK ((conformity = ANY (ARRAY[''''::text, ''yes''::text, ''no''::text, ''na''::text])))'),
    ('audit_plans', 'audit_plans_audit_type_check', 'CHECK ((audit_type = ANY (ARRAY[''internal''::text, ''external''::text])))'),
    ('audit_plans', 'audit_plans_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('audit_plans', 'audit_plans_proposed_range_check', 'CHECK ((proposed_from <= proposed_to))'),
    ('calibration_jobs', 'calibration_jobs_calibration_location_check', 'CHECK ((calibration_location = ANY (ARRAY[''In Lab''::text, ''On Site''::text])))'),
    ('calibration_jobs', 'calibration_jobs_equipment_line_index_check', 'CHECK ((equipment_line_index >= 0))'),
    ('calibration_jobs', 'calibration_jobs_stage_check', 'CHECK ((stage = ANY (ARRAY[''job_allocation''::text, ''calibration_conduct''::text, ''review_data''::text, ''certificate_preparation''::text, ''certificates''::text])))'),
    ('calibration_nabl_scope', 'calibration_nabl_scope_facility_type_check', 'CHECK ((facility_type = ANY (ARRAY[''Permanent''::text, ''Site''::text, ''Mobile''::text, ''Permanent Site facility''::text])))'),
    ('calibration_raw_data_sheets', 'calibration_raw_data_sheets_sheet_status_check', 'CHECK ((sheet_status = ANY (ARRAY[''draft''::text, ''under_review''::text, ''approved''::text])))'),
    ('calibration_service_requests', 'calibration_service_requests_accreditation_status_check', 'CHECK (((accreditation_status IS NULL) OR (accreditation_status = ANY (ARRAY[''Accredited''::text, ''Non-Accredited''::text]))))'),
    ('calibration_service_requests', 'calibration_service_requests_calibration_location_check', 'CHECK ((calibration_location = ANY (ARRAY[''In Lab''::text, ''On Site''::text])))'),
    ('calibration_service_requests', 'calibration_service_requests_calibration_method_choice_check', 'CHECK (((calibration_method_choice IS NULL) OR (calibration_method_choice = ANY (ARRAY[''Lab Std. Method''::text, ''Customer Method''::text]))))'),
    ('calibration_service_requests', 'calibration_service_requests_quantity_check', 'CHECK ((quantity > 0))'),
    ('calibration_service_requests', 'calibration_service_requests_status_check', 'CHECK ((status = ANY (ARRAY[''Draft''::text, ''Under Review''::text, ''Accepted''::text, ''Rejected''::text, ''Closed''::text])))'),
    ('consent_letters', 'consent_letters_generated_by_fkey', 'FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('customer_complaints', 'customer_complaints_status_check', 'CHECK ((status = ANY (ARRAY[''Received''::text, ''Under Investigation''::text, ''Decision Pending''::text, ''Closed''::text, ''Not Related''::text])))'),
    ('customer_feedback', 'customer_feedback_eval_status_check', 'CHECK ((evaluation_status = ANY (ARRAY[''Pending''::text, ''In Progress''::text, ''Completed''::text])))'),
    ('customer_feedback', 'customer_feedback_status_check', 'CHECK ((status = ANY (ARRAY[''Open''::text, ''Under Evaluation''::text, ''Closed''::text])))'),
    ('customer_feedback', 'customer_feedback_type_check', 'CHECK ((feedback_type = ANY (ARRAY[''Praise''::text, ''Suggestion''::text, ''Concern''::text, ''Other''::text])))'),
    ('equipment_breakdown_register', 'equipment_breakdown_register_source_check', 'CHECK ((equipment_source = ANY (ARRAY[''testing''::text, ''calibration''::text, ''testing_iqc''::text, ''calibration_iqc''::text])))'),
    ('equipment_breakdown_register', 'equipment_breakdown_register_status_check', 'CHECK ((status = ANY (ARRAY[''Open''::text, ''Under Repair''::text, ''Awaiting Verification''::text, ''Closed''::text, ''Scrapped''::text])))'),
    ('equipment_crms', 'equipment_crms_s_no_positive', 'CHECK ((s_no > 0))'),
    ('equipment_for_calibration', 'equipment_for_calibration_equipment_status_check', 'CHECK ((equipment_status = ANY (ARRAY[''Active''::text, ''In Repair''::text, ''Idle''::text])))'),
    ('gr_confidentiality_records', 'gr_confidentiality_records_status_check', 'CHECK ((status = ANY (ARRAY[''Active''::text, ''Closed''::text])))'),
    ('gr_confidentiality_records', 'gr_confidentiality_records_type_check', 'CHECK ((record_type = ANY (ARRAY[''Commitment''::text, ''Public Disclosure''::text, ''Legal Release''::text, ''Third Party Info''::text, ''Personnel Acknowledgement''::text])))'),
    ('gr_impartiality_risks', 'gr_impartiality_risks_source_check', 'CHECK ((risk_source = ANY (ARRAY[''Activities''::text, ''Relationships''::text, ''Personnel''::text, ''Other''::text])))'),
    ('gr_impartiality_risks', 'gr_impartiality_risks_status_check', 'CHECK ((status = ANY (ARRAY[''Open''::text, ''Mitigated''::text, ''Closed''::text])))'),
    ('gr_improvements', 'gr_improvements_source_check', 'CHECK ((source = ANY (ARRAY[''Procedure Review''::text, ''Policy''::text, ''Objectives''::text, ''Audit''::text, ''Corrective Action''::text, ''Management Review''::text, ''Personnel Suggestion''::text, ''Risk Assessment''::text, ''Data Analysis''::text, ''Proficiency Testing''::text, ''Customer Feedback''::text, ''Other''::text])))'),
    ('gr_improvements', 'gr_improvements_status_check', 'CHECK ((status = ANY (ARRAY[''Identified''::text, ''In Progress''::text, ''Implemented''::text, ''Closed''::text])))'),
    ('gr_objectives', 'gr_objectives_status_check', 'CHECK ((status = ANY (ARRAY[''Planned''::text, ''In Progress''::text, ''Achieved''::text, ''Deferred''::text])))'),
    ('gr_risk_opportunities', 'gr_risk_opportunities_status_check', 'CHECK ((status = ANY (ARRAY[''Open''::text, ''In Progress''::text, ''Closed''::text])))'),
    ('gr_risk_opportunities', 'gr_risk_opportunities_type_check', 'CHECK ((item_type = ANY (ARRAY[''Risk''::text, ''Opportunity''::text])))'),
    ('gst_rates', 'gst_rates_rate_range', 'CHECK (((rate >= (0)::numeric) AND (rate <= (100)::numeric)))'),
    ('iqc_plan_items', 'iqc_plan_items_status_chk', 'CHECK ((status = ANY (ARRAY[''planned''::text, ''on_track''::text, ''due_soon''::text, ''overdue''::text, ''inactive''::text])))'),
    ('management_document_versions', 'management_document_versions_change_type_check', 'CHECK ((change_type = ANY (ARRAY[''revision''::text, ''issue''::text, ''amendment''::text, ''manual_save''::text])))'),
    ('management_document_versions', 'management_document_versions_changed_by_fkey', 'FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('management_documents', 'management_documents_level_check', 'CHECK (((level >= 1) AND (level <= 4)))'),
    ('management_documents', 'management_documents_status_check', 'CHECK ((status = ANY (ARRAY[''draft''::text, ''under_review''::text, ''active''::text, ''obsolete''::text])))'),
    ('master_clients', 'master_clients_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('module_access_rules', 'module_access_rules_access_level_check', 'CHECK ((access_level = ANY (ARRAY[''none''::text, ''view''::text, ''edit''::text])))'),
    ('module_access_rules', 'module_access_rules_subject_type_check', 'CHECK ((subject_type = ANY (ARRAY[''division''::text, ''department''::text, ''designation''::text, ''user''::text])))'),
    ('module_access_rules', 'module_access_rules_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('mrm_plan_recipients', 'mrm_plan_recipients_email_status_check', 'CHECK ((email_status = ANY (ARRAY[''pending''::text, ''sent''::text, ''failed''::text, ''skipped''::text])))'),
    ('mrm_plans', 'mrm_plans_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('mrm_plans', 'mrm_plans_planned_range_check', 'CHECK ((planned_from <= planned_to))'),
    ('mrm_plans', 'mrm_plans_status_check', 'CHECK ((status = ANY (ARRAY[''draft''::text, ''planned''::text, ''communicated''::text])))'),
    ('nabl_scope_lookups', 'nabl_scope_lookups_kind_check', 'CHECK ((kind = ANY (ARRAY[''discipline_group''::text, ''materials_products''::text, ''discipline_name''::text, ''group_name''::text])))'),
    ('nabl_scope', 'nabl_scope_type_of_test_check', 'CHECK (((type_of_test IS NULL) OR (type_of_test = ANY (ARRAY[''Quantitative''::text, ''Qualitative''::text]))))'),
    ('nc_work_records', 'nc_work_records_acceptability_check', 'CHECK ((acceptability_decision = ANY (ARRAY[''pending''::text, ''accepted''::text, ''not_accepted''::text])))'),
    ('nc_work_records', 'nc_work_records_risk_check', 'CHECK ((risk_level = ANY (ARRAY[''Low''::text, ''Medium''::text, ''High''::text])))'),
    ('nc_work_records', 'nc_work_records_source_area_check', 'CHECK ((source_area = ANY (ARRAY[''Testing''::text, ''Calibration''::text, ''Sample Handling''::text, ''Other''::text])))'),
    ('nc_work_records', 'nc_work_records_status_check', 'CHECK ((status = ANY (ARRAY[''Open''::text, ''Under Evaluation''::text, ''Decision Pending''::text, ''Closed''::text, ''CAPA Required''::text])))'),
    ('nc_work_responsibility_matrix', 'nc_work_responsibility_matrix_authority_check', 'CHECK ((authority_type = ANY (ARRAY[''manage_nc''::text, ''authorize_resumption''::text, ''both''::text])))'),
    ('products_services_master', 'products_services_master_item_type_check', 'CHECK ((item_type = ANY (ARRAY[''Product''::text, ''Service''::text])))'),
    ('profiles', 'profiles_id_fkey', 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('quotation_line_items', 'quotation_line_items_line_no_check', 'CHECK ((line_no >= 1))'),
    ('quotation_notes', 'quotation_notes_content_nonempty', 'CHECK ((length(TRIM(BOTH FROM content)) > 0))'),
    ('quotation_notes', 'quotation_notes_document_kind_chk', 'CHECK ((document_kind = ANY (ARRAY[''quotation''::text, ''proformaInvoice''::text, ''invoice''::text, ''creditNote''::text, ''paymentReceipt''::text])))'),
    ('quotation_notes', 'quotation_notes_label_nonempty', 'CHECK ((length(TRIM(BOTH FROM label)) > 0))'),
    ('quotation_remarks', 'quotation_remarks_content_nonempty', 'CHECK ((length(TRIM(BOTH FROM content)) > 0))'),
    ('quotation_remarks', 'quotation_remarks_label_nonempty', 'CHECK ((length(TRIM(BOTH FROM label)) > 0))'),
    ('quotation_terms_conditions', 'quotation_terms_conditions_content_nonempty', 'CHECK ((length(TRIM(BOTH FROM content)) > 0))'),
    ('quotation_terms_conditions', 'quotation_terms_conditions_document_kind_chk', 'CHECK ((document_kind = ANY (ARRAY[''quotation''::text, ''proformaInvoice''::text, ''invoice''::text, ''creditNote''::text, ''paymentReceipt''::text])))'),
    ('reminders', 'reminders_channel_check', 'CHECK ((channel = ANY (ARRAY[''browser''::text, ''email''::text, ''both''::text])))'),
    ('reminders', 'reminders_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('result_validity_checks', 'result_validity_checks_check_type_chk', 'CHECK ((check_type = ANY (ARRAY[''7_7_a''::text, ''7_7_b''::text, ''7_7_c''::text, ''7_7_d''::text, ''7_7_e''::text, ''7_7_f''::text, ''7_7_g''::text, ''7_7_h''::text, ''7_7_i''::text, ''7_7_j''::text, ''7_7_k''::text])))'),
    ('result_validity_checks', 'result_validity_checks_performed_by_fkey', 'FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('result_validity_checks', 'result_validity_checks_reviewed_by_fkey', 'FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('result_validity_checks', 'result_validity_checks_status_chk', 'CHECK ((status = ANY (ARRAY[''planned''::text, ''in_progress''::text, ''satisfactory''::text, ''unsatisfactory''::text])))'),
    ('sale_document_signature_defaults', 'sale_document_signature_defaults_kind_chk', 'CHECK ((document_kind = ANY (ARRAY[''quotation''::text, ''proformaInvoice''::text, ''invoice''::text, ''creditNote''::text, ''paymentReceipt''::text])))'),
    ('tasks', 'tasks_priority_check', 'CHECK ((priority = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text])))'),
    ('tasks', 'tasks_status_check', 'CHECK ((status = ANY (ARRAY[''todo''::text, ''in_progress''::text, ''done''::text])))'),
    ('tasks', 'tasks_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('user_profiles', 'user_profiles_id_fkey', 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE')
    ) AS t(tbl, name, def)
  LOOP
    v_rel := to_regclass(format('public.%I', k.tbl));
    IF v_rel IS NULL THEN
      RAISE NOTICE '% skipped: table public.% missing', k.name, k.tbl;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = v_rel
        AND (c.conname = k.name OR pg_get_constraintdef(c.oid) = k.def)
    ) THEN
      v_present := v_present + 1;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', k.tbl, k.name, k.def);
      v_added := v_added + 1;
    EXCEPTION
      WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '% skipped: %', k.name, SQLERRM;
        v_skipped := v_skipped + 1;
      WHEN check_violation THEN
        v_expr := regexp_replace(k.def, '^CHECK ', '');
        EXECUTE format(
          'SELECT count(*), string_agg(DISTINCT left(r::text, 120), %L) '
          'FROM (SELECT t AS r FROM public.%I t WHERE (%s) IS FALSE LIMIT 10) s',
          '; ', k.tbl, v_expr)
          INTO v_bad, v_examples;
        EXECUTE format('SELECT count(*) FROM public.%I WHERE (%s) IS FALSE', k.tbl, v_expr) INTO v_bad;
        RAISE NOTICE '% skipped: % row(s) of public.% break %. Examples: %',
          k.name, v_bad, k.tbl, k.def, v_examples;
        v_skipped := v_skipped + 1;
      WHEN foreign_key_violation THEN
        v_fk := regexp_match(k.def, '^FOREIGN KEY \((\w+)\) REFERENCES ([\w.]+)\((\w+)\)');
        EXECUTE format(
          'SELECT count(*), string_agg(DISTINCT s.%1$I::text, %4$L) FROM public.%5$I s '
          'WHERE s.%1$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %2$s r WHERE r.%3$I = s.%1$I)',
          v_fk[1], v_fk[2], v_fk[3], ', ', k.tbl)
          INTO v_bad, v_examples;
        RAISE NOTICE '% skipped: % row(s) of public.% point to a missing %: %',
          k.name, v_bad, k.tbl, v_fk[2], left(v_examples, 600);
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RAISE NOTICE 'constraints: % added, % already present, % skipped', v_added, v_present, v_skipped;
END $$;
