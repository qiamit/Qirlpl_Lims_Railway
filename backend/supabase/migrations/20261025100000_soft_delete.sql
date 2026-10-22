-- ISO/IEC 17025 gap P1-1b: soft delete instead of hard delete (clauses 7.5.2, 8.4).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261024100000_audit_trail_expansion.sql (audit_log.reason,
-- app_annotate_audit, app_can_read_audit_log), while the lab is idle.
-- Safe to re-run.
--
-- Why: technical and quality records must stay retrievable after a user
-- "deletes" them. The ~50 existing supabase `.delete()` calls stay unchanged:
-- the database turns a delete by a signed-in user into a soft delete.
--
-- How it behaves
--   * Delete. A BEFORE DELETE trigger (zzz_soft_delete, fires after the
--     existing guards such as samples_guard_issued_delete) runs
--     UPDATE ... SET deleted_at = now(), deleted_by = auth.uid() and returns
--     NULL, so the physical delete is cancelled. PostgREST DELETE (with or
--     without RETURNING) succeeds and simply reports 0 rows.
--     Child rows that used to go with the parent through ON DELETE CASCADE
--     (pg_constraint confdeltype = 'c', both tables in soft_delete_tables) are
--     soft-deleted in the same statement with the SAME deleted_at, recursively
--     (samples -> sample_allocations -> test_allocations -> parameters,
--     quotations -> line items, audit plans -> checklist -> NC actions, ...).
--   * Audit. The soft delete is an UPDATE, so write_audit_log() records it as
--     action 'UPDATE' with deleted_at / deleted_by going from null to a value
--     (old_row keeps the full record). No extra 'DELETE' marker row is written,
--     so app_annotate_audit(table, row_id, reason) right after the delete puts
--     the "reason for delete" on exactly that audit row. Restores are logged
--     the same way (deleted_at back to null) with the reason
--     "Restored from the Recycle Bin" (or the Director's own text).
--   * Read. RESTRICTIVE policy soft_delete_hide (FOR SELECT, deleted_at IS
--     NULL) on every covered table: every existing list, embed and count stops
--     showing deleted rows, for every role subject to RLS. Recycle Bin RPCs
--     below are the only way to see them.
--   * Update. RESTRICTIVE policy soft_delete_no_update (USING deleted_at IS
--     NULL) + trigger zzz_soft_delete_guard: a deleted row cannot be changed,
--     and deleted_at / deleted_by / delete_reason can only be set by delete /
--     restore (callers running as authenticated or anon cannot write them;
--     on INSERT they are forced to NULL, so copying a row with select('*')
--     keeps working).
--   * Numbers are not reused. Unique indexes still cover deleted rows. Instead
--     of a bare "duplicate key" error, trigger zzz_soft_delete_reuse raises
--     23505 "... is already used by a deleted record in the Recycle Bin ...".
--     Restoring therefore never collides with a live row.
--   * Issued / closed records. Rows matching soft_delete_tables.locked_when
--     (issued samples, closed NC records, complaints, feedback, CSRs,
--     breakdowns, compliance and GR registers, certified calibration jobs,
--     approved raw-data sheets, completed validity checks, communicated MRM
--     plans, active/obsolete controlled documents, report amendments, signed
--     declarations) can be deleted only by the Laboratory Director (42501 with
--     a clear message). Samples were already guarded by
--     samples_guard_issued_delete; the rule here also covers report issue
--     timestamps.
--   * Admin purge. When auth.uid() IS NULL (service_role key, psql, Railway
--     console) the trigger lets the physical DELETE through. Use that only for
--     a deliberate purge, e.g.
--       DELETE FROM public.samples WHERE deleted_at < now() - interval '10 years';
--     A physical delete is still recorded by write_audit_log as 'DELETE'.
--     Older guards still apply to a purge: samples_guard_issued_delete refuses
--     completed samples when no Director is signed in, and issued_report_archive
--     (FK RESTRICT) keeps archived samples.
--     Physical FK cascades from a parent that was hard-deleted
--     (pg_trigger_depth() > 1) also go through, so no orphan rows can appear.
--
-- Recycle Bin RPCs (SECURITY DEFINER)
--   app_deleted_counts()                          Director + Quality Manager
--   app_list_deleted(p_table, p_limit, p_offset)  Director + Quality Manager
--   app_restore_deleted(p_table, p_row_id, p_reason default null)
--                                                 Laboratory Director only;
--                                                 restores the row and the
--                                                 children deleted with it.
--   app_set_delete_reason(p_table, p_row_id, p_reason)
--                                                 the person who deleted, within
--                                                 10 minutes, once.
--   app_deleted_keys(p_table, p_column)           known staff: the values of a
--                                                 unique key column held by
--                                                 deleted rows, so "next number"
--                                                 generators can skip them.
--
-- Covered tables (mode 'soft': a direct delete becomes a soft delete)
--   samples, issued_report_amendments, consent_letters, test_parameters,
--   is_codes, nabl_scope, calibration_nabl_scope,
--   calibration_service_requests, calibration_jobs (hard while still at
--   job_allocation, see below), calibration_raw_data_sheets,
--   equipment_master, equipment_for_calibration, equipment_crms,
--   equipment_breakdown_register, iqc_masters, iqc_plan_items,
--   result_validity_checks, nc_work_records, nc_work_corrective_actions,
--   nc_work_responsibility_matrix, customer_complaints, customer_feedback,
--   audit_plans, audit_checklist_items, audit_nc_actions, mrm_plans,
--   gr_confidentiality_records, gr_impartiality_risks, gr_improvements,
--   gr_objectives, gr_risk_opportunities, management_documents,
--   management_document_versions, compliance_registers, sale_documents,
--   quotations, clients, personnel_declarations.
--
-- Excluded from soft delete (mode 'line': a direct delete stays physical and
-- is still recorded by the audit trail; the rows are only hidden/restored
-- together with a soft-deleted parent)
--   sample_allocations          SampleAllocationMasterPage save deletes every
--                               section of the SRF and re-inserts them;
--                               refer-back deletes sections.
--   test_allocations            refer-back (referbackFlow.ts) deletes them and
--                               "send to test allocation" creates new ones.
--   test_allocation_parameters  TestAllocationMasterPage save deletes all
--                               parameters of the allocation and re-inserts
--                               them; insertAllocatedTestsIntoSection too.
--                               Issued results stay protected by
--                               tap_guard_issued_delete.
--   quotation_line_items        deleted and re-inserted on every quotation
--                               save.
--   mrm_agenda_items,           MrmAgendaMasterPage save deletes and
--   mrm_plan_recipients         re-inserts them; unique (plan_id,
--                               clause_letter) / (plan_id, user_id) would
--                               break the save if old rows were kept.
--   is_code_files               the app removes the storage object first, so a
--                               kept row would point at a missing file.
--   calibration_jobs at stage   referback to Service Request deletes them and
--   'job_allocation'            re-allocation re-creates the same
--                               (service_request_id, equipment_line_index).
-- Not covered at all: dropdown/option lists, lab settings, AI config, users,
-- module access, document_series, reminders/tasks, audit_log and
-- issued_report_archive (both already append-only).
-- Tables that do not exist, have no `id` column or have RLS disabled are
-- skipped with a NOTICE (RLS is never switched on here).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.audit_log'::regclass AND attname = 'reason' AND NOT attisdropped
     )
     OR to_regprocedure('public.app_annotate_audit(text,text,text)') IS NULL
     OR to_regprocedure('public.app_can_read_audit_log()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL
     OR to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql and 20261024100000_audit_trail_expansion.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Configuration: which tables, how, and what is locked.
--    hard_when / locked_when are SQL boolean expressions over the row's
--    columns (unqualified). Only the owner can change this table.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.soft_delete_tables (
  table_name text PRIMARY KEY,
  label text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('soft', 'line')),
  hard_when text,
  locked_when text,
  locked_message text,
  summary_cols text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.soft_delete_tables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.soft_delete_tables FROM PUBLIC, anon, authenticated;

INSERT INTO public.soft_delete_tables AS s (table_name, label, mode, hard_when, locked_when, locked_message, summary_cols)
VALUES
  -- Samples, testing and results (7.4, 7.5, 7.8)
  ('samples', 'Samples (SRF)', 'soft', NULL,
   $x$stage = 'completed' OR test_report_issued_at IS NOT NULL OR test_report_nabl_issued_at IS NOT NULL OR test_report_non_nabl_issued_at IS NOT NULL$x$,
   'Issued samples (test report issued) can only be deleted by the Laboratory Director',
   ARRAY['srf_number', 'client_name', 'stage', 'test_report_number', 'date_of_sample_receiving', 'sample_description']),
  ('sample_allocations', 'Sample allocations', 'line', NULL, NULL, NULL,
   ARRAY['section_code', 'department', 'designation', 'allocation_date']),
  ('test_allocations', 'Test allocations', 'line', NULL, NULL, NULL,
   ARRAY['srf_number', 'section_code', 'department', 'assigned_employee_name']),
  ('test_allocation_parameters', 'Test results (parameters)', 'line', NULL, NULL, NULL,
   ARRAY['test_label', 'results', 'results_review_status']),
  ('issued_report_amendments', 'Issued report amendments', 'soft', NULL, 'true',
   'Issued report amendment records can only be deleted by the Laboratory Director',
   ARRAY['srf_number', 'issue_kind', 'section_code', 'remark']),
  ('consent_letters', 'Consent letters', 'soft', NULL, NULL, NULL,
   ARRAY['consent_letter_no', 'letter_date', 'client_name', 'srf_number']),
  ('test_parameters', 'Test parameters', 'soft', NULL, NULL, NULL,
   ARRAY['item_name', 'is_code_label', 'clause_no', 'test_method', 'department']),
  ('is_codes', 'IS codes', 'soft', NULL, NULL, NULL,
   ARRAY['is_number', 'revision_year', 'title']),
  ('is_code_files', 'IS code files', 'line', NULL, NULL, NULL,
   ARRAY['file_name']),
  ('nabl_scope', 'NABL scope (testing)', 'soft', NULL, NULL, NULL,
   ARRAY['s_no', 'discipline_group', 'materials_products', 'component_parameter']),
  ('calibration_nabl_scope', 'NABL scope (calibration)', 'soft', NULL, NULL, NULL,
   ARRAY['s_no', 'discipline_name', 'measurand', 'measurement_range']),
  -- Calibration (6.4, 6.5, 7.8)
  ('calibration_service_requests', 'Calibration service requests', 'soft', NULL,
   $x$status = 'Closed'$x$,
   'Closed calibration service requests can only be deleted by the Laboratory Director',
   ARRAY['srf_number', 'srf_date', 'client_name', 'status']),
  ('calibration_jobs', 'Calibration jobs', 'soft',
   $x$stage = 'job_allocation'$x$,
   $x$stage = 'certificates'$x$,
   'Calibration jobs with an issued certificate can only be deleted by the Laboratory Director',
   ARRAY['srf_number', 'equipment_label', 'client_name', 'stage']),
  ('calibration_raw_data_sheets', 'Calibration raw data sheets', 'soft', NULL,
   $x$sheet_status = 'approved'$x$,
   'Approved raw data sheets can only be deleted by the Laboratory Director',
   ARRAY['sheet_status', 'calibration_job_id', 'reviewed_at']),
  -- Equipment and reference materials (6.4, 6.5)
  ('equipment_master', 'Equipment master', 'soft', NULL, NULL, NULL,
   ARRAY['asset_code', 'equipment_name', 'manufacturer', 'serial_number']),
  ('equipment_for_calibration', 'Equipment for calibration', 'soft', NULL, NULL, NULL,
   ARRAY['asset_code', 'equipment_name', 'manufacturer', 'serial_number']),
  ('equipment_crms', 'Equipment CRMs', 'soft', NULL, NULL, NULL,
   ARRAY['s_no', 'id_no', 'crm_type', 'make', 'valid_upto']),
  ('equipment_breakdown_register', 'Equipment breakdown register', 'soft', NULL,
   $x$status = 'Closed'$x$,
   'Closed breakdown records can only be deleted by the Laboratory Director',
   ARRAY['register_no', 'equipment_name', 'asset_code', 'breakdown_date', 'status']),
  -- Validity of results (7.7)
  ('iqc_masters', 'IQC masters', 'soft', NULL, NULL, NULL,
   ARRAY['asset_code', 'equipment_name', 'manufacturer', 'serial_number']),
  ('iqc_plan_items', 'IQC plan items', 'soft', NULL, NULL, NULL,
   ARRAY['check_name', 'frequency', 'status', 'next_due']),
  ('result_validity_checks', 'Result validity checks', 'soft', NULL,
   $x$status IN ('satisfactory', 'unsatisfactory')$x$,
   'Completed result validity checks can only be deleted by the Laboratory Director',
   ARRAY['check_ref', 'check_type', 'check_date', 'title', 'status']),
  -- Nonconforming work and corrective action (7.10, 8.7)
  ('nc_work_records', 'Nonconforming work', 'soft', NULL,
   $x$status = 'Closed'$x$,
   'Closed nonconforming work records can only be deleted by the Laboratory Director',
   ARRAY['nc_id', 'detected_at', 'source_area', 'description', 'status']),
  ('nc_work_corrective_actions', 'NC corrective actions', 'soft', NULL, NULL, NULL,
   ARRAY['description_of_nc', 'corrective_action_plan']),
  ('nc_work_responsibility_matrix', 'NC responsibility matrix', 'soft', NULL, NULL, NULL,
   ARRAY['role_label', 'authority_type', 'employee_name', 'department']),
  -- Complaints and feedback (7.9, 8.6)
  ('customer_complaints', 'Customer complaints', 'soft', NULL,
   $x$status = 'Closed' OR closed_at IS NOT NULL$x$,
   'Closed complaints can only be deleted by the Laboratory Director',
   ARRAY['complaint_id', 'received_at', 'complainant_name', 'complainant_org', 'status']),
  ('customer_feedback', 'Customer feedback', 'soft', NULL,
   $x$status = 'Closed'$x$,
   'Closed feedback records can only be deleted by the Laboratory Director',
   ARRAY['feedback_id', 'received_at', 'customer_name', 'customer_org', 'status']),
  -- Internal audit and management review (8.8, 8.9)
  ('audit_plans', 'Internal audit plans', 'soft', NULL, NULL, NULL,
   ARRAY['audit_id', 'audit_type', 'proposed_from', 'proposed_to']),
  ('audit_checklist_items', 'Audit checklist items', 'soft', NULL, NULL, NULL,
   ARRAY['clause_no', 'clause_matter', 'conformity']),
  ('audit_nc_actions', 'Audit NC actions', 'soft', NULL, NULL, NULL,
   ARRAY['description_of_nc', 'verification_closure']),
  ('mrm_plans', 'MRM plans', 'soft', NULL,
   $x$status = 'communicated'$x$,
   'Communicated MRM plans can only be deleted by the Laboratory Director',
   ARRAY['plan_code', 'planned_from', 'venue', 'status']),
  ('mrm_agenda_items', 'MRM agenda items', 'line', NULL, NULL, NULL,
   ARRAY['clause_letter', 'title']),
  ('mrm_plan_recipients', 'MRM plan recipients', 'line', NULL, NULL, NULL,
   ARRAY['name', 'email', 'designation']),
  -- General requirements, risks and improvement (4, 8.5, 8.6)
  ('gr_confidentiality_records', 'Confidentiality records', 'soft', NULL,
   $x$lower(coalesce(status, '')) = 'closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['record_id', 'recorded_at', 'record_type', 'subject_party', 'status']),
  ('gr_impartiality_risks', 'Impartiality risks', 'soft', NULL,
   $x$lower(coalesce(status, '')) = 'closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['risk_id', 'identified_at', 'risk_description', 'status']),
  ('gr_improvements', 'Improvements', 'soft', NULL,
   $x$lower(coalesce(status, '')) = 'closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['improvement_id', 'identified_at', 'description', 'status']),
  ('gr_objectives', 'Quality objectives', 'soft', NULL,
   $x$lower(coalesce(status, '')) = 'closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['objective_id', 'title', 'target_date', 'status']),
  ('gr_risk_opportunities', 'Risks and opportunities', 'soft', NULL,
   $x$lower(coalesce(status, '')) = 'closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['item_id', 'identified_at', 'item_type', 'description', 'status']),
  -- Documents and records (8.3, 8.4)
  ('management_documents', 'Management documents', 'soft', NULL,
   $x$status IN ('active', 'obsolete')$x$,
   'Active or obsolete controlled documents can only be deleted by the Laboratory Director',
   ARRAY['level', 'doc_number', 'title', 'revision_no', 'status']),
  ('management_document_versions', 'Management document versions', 'soft', NULL, NULL, NULL,
   ARRAY['doc_number', 'title', 'revision_no', 'change_type', 'changed_at']),
  ('compliance_registers', 'Compliance registers', 'soft', NULL,
   $x$status = 'Closed'$x$,
   'Closed register entries can only be deleted by the Laboratory Director',
   ARRAY['module_key', 'reference_no', 'title', 'status']),
  -- Customers, contracts and issued documents (7.1)
  ('sale_documents', 'Sale documents', 'soft', NULL, NULL, NULL,
   ARRAY['document_kind', 'document_number', 'document_date', 'client_name', 'status', 'grand_total']),
  ('quotations', 'Quotations', 'soft', NULL, NULL, NULL,
   ARRAY['quotation_number', 'quotation_date', 'client_name', 'status', 'grand_total']),
  ('quotation_line_items', 'Quotation line items', 'line', NULL, NULL, NULL,
   ARRAY['line_no', 'description', 'quantity', 'amount']),
  ('clients', 'Clients', 'soft', NULL, NULL, NULL,
   ARRAY['company_name', 'contact_person_name', 'district', 'state']),
  -- Personnel (6.2, 4.1, 4.2)
  ('personnel_declarations', 'Personnel declarations', 'soft', NULL, 'true',
   'Signed declarations can only be deleted by the Laboratory Director',
   ARRAY['declaration_type', 'period_year', 'signed_name', 'signed_at'])
ON CONFLICT (table_name) DO UPDATE
SET label = EXCLUDED.label,
    mode = EXCLUDED.mode,
    hard_when = EXCLUDED.hard_when,
    locked_when = EXCLUDED.locked_when,
    locked_message = EXCLUDED.locked_message,
    summary_cols = EXCLUDED.summary_cols;

-- ---------------------------------------------------------------------------
-- 2. Cascade (soft delete or restore) along ON DELETE CASCADE foreign keys
--    between covered tables. Returns the number of child rows changed.
--    Restore only touches children deleted at the same instant as the parent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_soft_delete_cascade(
  p_parent regclass,
  p_row jsonb,
  p_at timestamptz,
  p_by uuid,
  p_restore boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fk record;
  v_where text;
  v_rows jsonb;
  v_child jsonb;
  v_count integer := 0;
BEGIN
  FOR fk IN
    SELECT c.conrelid, cl.relname::text AS child, c.conkey, c.confkey
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN public.soft_delete_tables sdt ON sdt.table_name = cl.relname
    WHERE c.contype = 'f'
      AND c.confrelid = p_parent
      AND c.confdeltype = 'c'
    ORDER BY c.conname
  LOOP
    SELECT string_agg(
             format('c.%I = ($1 ->> %L)::%s', ca.attname, pa.attname, format_type(ca.atttypid, ca.atttypmod)),
             ' AND ' ORDER BY k.ord)
    INTO v_where
    FROM unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS k(ck, pk, ord)
    JOIN pg_attribute ca ON ca.attrelid = fk.conrelid AND ca.attnum = k.ck
    JOIN pg_attribute pa ON pa.attrelid = p_parent AND pa.attnum = k.pk;

    IF p_restore THEN
      EXECUTE format(
        'WITH u AS (UPDATE public.%I c SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL '
        'WHERE %s AND c.deleted_at = $2 RETURNING to_jsonb(c) AS j) '
        'SELECT coalesce(jsonb_agg(u.j), ''[]''::jsonb) FROM u',
        fk.child, v_where)
      INTO v_rows
      USING p_row, p_at;
    ELSE
      EXECUTE format(
        'WITH u AS (UPDATE public.%I c SET deleted_at = $2, deleted_by = $3 '
        'WHERE %s AND c.deleted_at IS NULL RETURNING to_jsonb(c) AS j) '
        'SELECT coalesce(jsonb_agg(u.j), ''[]''::jsonb) FROM u',
        fk.child, v_where)
      INTO v_rows
      USING p_row, p_at, p_by;
    END IF;

    FOR v_child IN SELECT e FROM jsonb_array_elements(v_rows) AS e LOOP
      v_count := v_count + 1
        + public.app_soft_delete_cascade(fk.conrelid::regclass, v_child, p_at, p_by, p_restore);
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.app_soft_delete_cascade(regclass, jsonb, timestamptz, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Label of a covered parent table (ON DELETE CASCADE) whose referenced row is
-- itself deleted, or NULL. Such a row can only come back with its parent.
CREATE OR REPLACE FUNCTION public.app_soft_delete_parent_label(p_table text, p_row jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fk record;
  v_where text;
  v_deleted boolean;
BEGIN
  FOR fk IN
    SELECT c.confrelid, pcl.relname::text AS parent, sdt.label, c.conkey, c.confkey, c.conrelid
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_class pcl ON pcl.oid = c.confrelid
    JOIN public.soft_delete_tables sdt ON sdt.table_name = pcl.relname
    WHERE c.contype = 'f'
      AND cl.relname = p_table
      AND c.confdeltype = 'c'
    ORDER BY c.conname
  LOOP
    SELECT string_agg(
             format('p.%I = ($1 ->> %L)::%s', pa.attname, ca.attname, format_type(pa.atttypid, pa.atttypmod)),
             ' AND ' ORDER BY k.ord)
    INTO v_where
    FROM unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS k(ck, pk, ord)
    JOIN pg_attribute ca ON ca.attrelid = fk.conrelid AND ca.attnum = k.ck
    JOIN pg_attribute pa ON pa.attrelid = fk.confrelid AND pa.attnum = k.pk;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I p WHERE %s AND p.deleted_at IS NOT NULL)', fk.parent, v_where)
    INTO v_deleted
    USING p_row;
    IF v_deleted THEN
      RETURN fk.label;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_soft_delete_parent_label(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. BEFORE DELETE: lock check, then soft delete (or let a physical delete
--    through for scripts / FK cascades / 'line' tables / hard_when).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at timestamptz := now();
  cfg public.soft_delete_tables%ROWTYPE;
  v_flag boolean;
BEGIN
  SELECT * INTO cfg FROM public.soft_delete_tables sdt WHERE sdt.table_name = TG_TABLE_NAME;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- service_role / psql / Railway console: deliberate physical purge.
  IF v_uid IS NULL THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    -- Already in the Recycle Bin. A physical cascade from a hard-deleted
    -- parent must still remove it; anything else is a no-op.
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RETURN NULL;
  END IF;

  IF cfg.locked_when IS NOT NULL AND NOT public.app_is_laboratory_director() THEN
    EXECUTE format('SELECT (%s)::boolean FROM (SELECT ($1).*) r', cfg.locked_when) INTO v_flag USING OLD;
    IF coalesce(v_flag, false) THEN
      RAISE EXCEPTION '%', coalesce(cfg.locked_message, 'Only the Laboratory Director can delete this record')
        USING ERRCODE = '42501',
              HINT = 'Issued and closed records stay on file (ISO/IEC 17025 7.5, 8.4).';
    END IF;
  END IF;

  -- Physical ON DELETE CASCADE from a parent that was really deleted
  -- (a 'line' table, hard_when, or a purge): follow it, never orphan rows.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF cfg.mode = 'line' THEN
    RETURN OLD;
  END IF;

  IF cfg.hard_when IS NOT NULL THEN
    EXECUTE format('SELECT (%s)::boolean FROM (SELECT ($1).*) r', cfg.hard_when) INTO v_flag USING OLD;
    IF coalesce(v_flag, false) THEN
      RETURN OLD;
    END IF;
  END IF;

  EXECUTE format('UPDATE public.%I SET deleted_at = $1, deleted_by = $2 WHERE id = $3', TG_TABLE_NAME)
    USING v_at, v_uid, OLD.id;
  PERFORM public.app_soft_delete_cascade(TG_RELID::regclass, to_jsonb(OLD), v_at, v_uid, false);

  -- Cancel the physical delete. PostgREST reports 0 deleted rows, no error.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_soft_delete() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. BEFORE INSERT OR UPDATE (invoker): deleted rows are read-only and the
--    soft-delete columns belong to delete / restore. Callers running as
--    authenticated or anon are "the app"; SECURITY DEFINER code (the soft
--    delete trigger, Recycle Bin RPCs) and service_role are not restricted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_soft_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
    NEW.delete_reason := NULL;
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This record is in the Recycle Bin and cannot be changed'
      USING ERRCODE = '42501',
            HINT = 'Ask the Laboratory Director to restore it first.';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason THEN
    RAISE EXCEPTION 'deleted_at, deleted_by and delete_reason are set only by Delete and the Recycle Bin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.app_soft_delete_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. BEFORE INSERT (definer): a key held by a deleted row is not reused.
--    Gives a clear message instead of a bare unique-violation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_soft_delete_reuse_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_any boolean;
  idx record;
  v_exprs text;
  v_hit text;
  v_key text;
  v_label text;
BEGIN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE deleted_at IS NOT NULL)', TG_TABLE_NAME) INTO v_any;
  IF NOT v_any THEN
    RETURN NEW;
  END IF;

  FOR idx IN
    SELECT i.indexrelid,
           i.indnkeyatts,
           pg_get_expr(i.indpred, i.indrelid, true) AS pred,
           coalesce((to_jsonb(i) ->> 'indnullsnotdistinct')::boolean, false) AS nnd
    FROM pg_index i
    WHERE i.indrelid = TG_RELID
      AND i.indisunique
      AND NOT i.indisprimary
      AND i.indisvalid
  LOOP
    SELECT string_agg(pg_get_indexdef(idx.indexrelid, k, true), ', ' ORDER BY k)
    INTO v_exprs
    FROM generate_series(1, idx.indnkeyatts) AS k;

    EXECUTE format(
      'SELECT x.id::text, n.k::text FROM public.%1$I x, '
      '(SELECT ROW(%2$s) AS k FROM (SELECT ($1).*) r WHERE %3$s) n '
      'WHERE x.deleted_at IS NOT NULL AND (%3$s) AND ROW(%2$s) %4$s n.k LIMIT 1',
      TG_TABLE_NAME, v_exprs, coalesce(idx.pred, 'true'),
      CASE WHEN idx.nnd THEN 'IS NOT DISTINCT FROM' ELSE '=' END)
    INTO v_hit, v_key
    USING NEW;

    IF v_hit IS NOT NULL THEN
      SELECT sdt.label INTO v_label FROM public.soft_delete_tables sdt WHERE sdt.table_name = TG_TABLE_NAME;
      RAISE EXCEPTION '% is already used by a deleted record in the Recycle Bin (%)',
        btrim(v_key, '()'), coalesce(v_label, TG_TABLE_NAME)
        USING ERRCODE = '23505',
              DETAIL = format('Numbers and keys of deleted records are not reused (unique index %s, deleted row %s).',
                              idx.indexrelid::regclass, v_hit),
              HINT = 'Use a new number, or ask the Laboratory Director to restore the deleted record from the Recycle Bin.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.app_soft_delete_reuse_check() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Attach columns, index, policies and triggers to every covered table.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cfg record;
  rel_oid regclass;
  v_ok boolean;
  v_cols text[];
BEGIN
  FOR cfg IN SELECT * FROM public.soft_delete_tables ORDER BY table_name LOOP
    rel_oid := to_regclass(format('public.%I', cfg.table_name));
    v_ok := rel_oid IS NOT NULL
      AND (SELECT c.relkind = 'r' AND c.relrowsecurity FROM pg_class c WHERE c.oid = rel_oid)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel_oid AND a.attname = 'id' AND NOT a.attisdropped);
    IF NOT coalesce(v_ok, false) THEN
      RAISE NOTICE 'soft delete: % skipped (missing, not a plain table, no id column or RLS disabled)', cfg.table_name;
      DELETE FROM public.soft_delete_tables WHERE table_name = cfg.table_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', cfg.table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by uuid', cfg.table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason text', cfg.table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at) WHERE deleted_at IS NOT NULL',
                   left(cfg.table_name, 50) || '_deleted_idx', cfg.table_name);

    -- Expressions that do not fit this database's columns are dropped, so a
    -- schema difference never makes every delete fail.
    IF cfg.locked_when IS NOT NULL THEN
      BEGIN
        EXECUTE format('SELECT (%s)::boolean FROM public.%I r LIMIT 0', cfg.locked_when, cfg.table_name);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'soft delete: locked_when of % ignored: %', cfg.table_name, SQLERRM;
        UPDATE public.soft_delete_tables SET locked_when = NULL WHERE table_name = cfg.table_name;
      END;
    END IF;
    IF cfg.hard_when IS NOT NULL THEN
      BEGIN
        EXECUTE format('SELECT (%s)::boolean FROM public.%I r LIMIT 0', cfg.hard_when, cfg.table_name);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'soft delete: hard_when of % ignored: %', cfg.table_name, SQLERRM;
        UPDATE public.soft_delete_tables SET hard_when = NULL WHERE table_name = cfg.table_name;
      END;
    END IF;
    SELECT coalesce(array_agg(c ORDER BY o), '{}')
    INTO v_cols
    FROM unnest(cfg.summary_cols) WITH ORDINALITY AS u(c, o)
    WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel_oid AND a.attname = u.c AND NOT a.attisdropped);
    UPDATE public.soft_delete_tables SET summary_cols = v_cols WHERE table_name = cfg.table_name;

    EXECUTE format('DROP POLICY IF EXISTS soft_delete_hide ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE POLICY soft_delete_hide ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (deleted_at IS NULL)',
      cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS soft_delete_no_update ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE POLICY soft_delete_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO PUBLIC '
      'USING (deleted_at IS NULL) WITH CHECK (true)',
      cfg.table_name);
    EXECUTE format('DROP POLICY IF EXISTS soft_delete_no_delete ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE POLICY soft_delete_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO PUBLIC USING (deleted_at IS NULL)',
      cfg.table_name);

    -- zzz_ so they fire after the existing BEFORE triggers (alphabetical).
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_soft_delete ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE TRIGGER zzz_soft_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_soft_delete()',
      cfg.table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_soft_delete_guard ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE TRIGGER zzz_soft_delete_guard BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.app_soft_delete_guard()',
      cfg.table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_soft_delete_reuse ON public.%I', cfg.table_name);
    EXECUTE format(
      'CREATE TRIGGER zzz_soft_delete_reuse BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.app_soft_delete_reuse_check()',
      cfg.table_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Recycle Bin RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_deleted_counts()
RETURNS TABLE (table_name text, label text, mode text, deleted_count bigint, direct_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  cfg record;
  v_total bigint;
  v_direct bigint;
BEGIN
  IF NOT public.app_can_read_audit_log() THEN
    RAISE EXCEPTION 'Only the Laboratory Director and Quality Managers can open the Recycle Bin'
      USING ERRCODE = '42501';
  END IF;
  FOR cfg IN SELECT * FROM public.soft_delete_tables sdt ORDER BY sdt.label LOOP
    CONTINUE WHEN to_regclass(format('public.%I', cfg.table_name)) IS NULL;
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE public.app_soft_delete_parent_label(%L, to_jsonb(t)) IS NULL) '
      'FROM public.%I t WHERE t.deleted_at IS NOT NULL',
      cfg.table_name, cfg.table_name)
    INTO v_total, v_direct;
    table_name := cfg.table_name;
    label := cfg.label;
    mode := cfg.mode;
    deleted_count := v_total;
    direct_count := v_direct;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_list_deleted(p_table text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (
  table_name text,
  row_id text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  delete_reason text,
  summary jsonb,
  deleted_with text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  cfg public.soft_delete_tables%ROWTYPE;
BEGIN
  IF NOT public.app_can_read_audit_log() THEN
    RAISE EXCEPTION 'Only the Laboratory Director and Quality Managers can open the Recycle Bin'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg FROM public.soft_delete_tables sdt WHERE sdt.table_name = p_table;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table % is not covered by the Recycle Bin', p_table USING ERRCODE = '22023';
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH d AS (
      SELECT t.id::text AS row_id, t.deleted_at, t.deleted_by, t.delete_reason, to_jsonb(t) AS j
      FROM public.%1$I t
      WHERE t.deleted_at IS NOT NULL
    )
    SELECT %2$L::text,
           d.row_id,
           d.deleted_at,
           d.deleted_by,
           nullif(btrim(up.full_name), ''),
           coalesce(
             d.delete_reason,
             (SELECT al.reason
                FROM public.audit_log al
               WHERE al.table_name = %2$L
                 AND al.row_id = d.row_id
                 AND al.reason IS NOT NULL
                 AND al.at >= d.deleted_at
               ORDER BY al.at, al.seq
               LIMIT 1)
           ),
           (SELECT coalesce(jsonb_object_agg(k.c, d.j -> k.c), '{}'::jsonb)
              FROM unnest($1::text[]) AS k(c)
             WHERE d.j ? k.c),
           public.app_soft_delete_parent_label(%2$L, d.j),
           count(*) OVER ()
    FROM d
    LEFT JOIN public.user_profiles up ON up.id = d.deleted_by
    ORDER BY d.deleted_at DESC, d.row_id
    LIMIT $2 OFFSET $3
  $q$, cfg.table_name, cfg.table_name)
  USING cfg.summary_cols,
        least(greatest(coalesce(p_limit, 50), 1), 500),
        greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_restore_deleted(p_table text, p_row_id text, p_reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cfg public.soft_delete_tables%ROWTYPE;
  v_at timestamptz;
  v_row jsonb;
  v_parent text;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can restore deleted records' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg FROM public.soft_delete_tables sdt WHERE sdt.table_name = p_table;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table % is not covered by the Recycle Bin', p_table USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT t.deleted_at, to_jsonb(t) FROM public.%I t WHERE t.id::text = $1 FOR UPDATE', cfg.table_name)
  INTO v_at, v_row
  USING p_row_id;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Record % not found in %', p_row_id, cfg.label USING ERRCODE = 'P0002';
  END IF;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'This record is not deleted' USING ERRCODE = '22023';
  END IF;

  v_parent := public.app_soft_delete_parent_label(cfg.table_name, v_row);
  IF v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'This record belongs to a deleted record in %. Restore that record first.', v_parent
      USING ERRCODE = '22023';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL WHERE id::text = $1',
    cfg.table_name)
  USING p_row_id;
  v_count := 1 + public.app_soft_delete_cascade(
    to_regclass(format('public.%I', cfg.table_name)), v_row, v_at, NULL, true);

  -- Reason on the restore's own audit row (written by write_audit_log above).
  PERFORM public.app_annotate_audit(
    cfg.table_name, p_row_id,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Restored from the Recycle Bin'));

  RETURN v_count;
END;
$$;

-- The person who deleted a record may add the reason within 10 minutes, once.
-- The reason is stored on the row and on the soft-delete audit entry.
CREATE OR REPLACE FUNCTION public.app_set_delete_reason(p_table text, p_row_id text, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := left(btrim(coalesce(p_reason, '')), 2000);
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.soft_delete_tables sdt WHERE sdt.table_name = p_table) THEN
    RAISE EXCEPTION 'Table % is not covered by the Recycle Bin', p_table USING ERRCODE = '22023';
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM public.%I t WHERE t.id::text = $1 AND t.deleted_by = $2 '
    'AND t.deleted_at >= now() - interval ''10 minutes'' AND t.delete_reason IS NULL',
    p_table)
  INTO v_count
  USING p_row_id, v_uid;
  IF v_count = 0 THEN
    RETURN false;
  END IF;

  -- First the soft-delete audit row (still the caller's latest change) ...
  PERFORM public.app_annotate_audit(p_table, p_row_id, v_reason);
  -- ... then the row itself (logged as its own small UPDATE).
  EXECUTE format('UPDATE public.%I SET delete_reason = $2 WHERE id::text = $1', p_table)
  USING p_row_id, v_reason;
  RETURN true;
END;
$$;

-- Values of a unique key column held by deleted rows (for "next number"
-- generators that read only visible rows). Only key columns are exposed,
-- plus samples.test_report_number (a document number that is never reused
-- although it has no unique index).
CREATE OR REPLACE FUNCTION public.app_deleted_keys(p_table text, p_column text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rel regclass;
  v_keys text[];
BEGIN
  IF NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.soft_delete_tables sdt WHERE sdt.table_name = p_table) THEN
    RETURN '{}';
  END IF;
  v_rel := to_regclass(format('public.%I', p_table));
  IF v_rel IS NULL OR (
    (p_table, p_column) NOT IN (('samples', 'test_report_number'))
    AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = v_rel
      AND i.indisunique
      AND NOT i.indisprimary
      AND a.attname = p_column
  ) AND NOT EXISTS (
    -- expression indexes such as lower(btrim(srf_number))
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = v_rel
      AND i.indisunique
      AND NOT i.indisprimary
      AND i.indexprs IS NOT NULL
      AND pg_get_indexdef(i.indexrelid) ~ ('\m' || p_column || '\M')
    )
  ) THEN
    RAISE EXCEPTION 'Column % is not a unique key of %', p_column, p_table USING ERRCODE = '22023';
  END IF;

  EXECUTE format(
    'SELECT coalesce(array_agg(DISTINCT t.%I::text) FILTER (WHERE t.%I IS NOT NULL), ''{}'') '
    'FROM public.%I t WHERE t.deleted_at IS NOT NULL',
    p_column, p_column, p_table)
  INTO v_keys;
  RETURN v_keys;
END;
$$;

REVOKE ALL ON FUNCTION public.app_deleted_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_list_deleted(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_restore_deleted(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_set_delete_reason(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_deleted_keys(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_deleted_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_list_deleted(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_restore_deleted(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_set_delete_reason(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_deleted_keys(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
