-- ISO/IEC 17025 gap P1-1: audit trail (clauses 7.5.2, 7.11, 8.4).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000 (audit_log + write_audit_log) and 20261023000002,
-- while the lab is idle. Safe to re-run.
--
-- What it does:
--   1. write_audit_log() records the real primary key (trigger arguments, or
--      `id`, or the table's primary-key columns), strips secret-like columns
--      (api_key, password, secret, token) and ignores updated_at-only updates.
--   2. Attaches the audit trigger to every technical and quality-system table
--      that exists (list below). audit_log itself, AI config, reminders/tasks
--      and dropdown option lists are deliberately left out.
--   3. audit_log.reason + app_annotate_audit(table, row_id, reason): the actor
--      can add a "reason for change" to their own latest change of a record
--      within 10 minutes of saving it.
--   4. audit_log is append-only: UPDATE/DELETE/TRUNCATE raise, except the
--      reason annotation done inside app_annotate_audit().
--   5. Read access: active Laboratory Director and active Quality Managers
--      (app_can_read_audit_log()). anon has no access at all.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Table (normally created by 20261009063000) + reason column + indexes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb
);

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS reason text;
-- Insertion order, so "latest change" is exact even within one transaction.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_log_table_row_at_idx
  ON public.audit_log (table_name, row_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_at_idx
  ON public.audit_log (actor, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_at_idx
  ON public.audit_log (at DESC);

-- ---------------------------------------------------------------------------
-- Who may read the audit trail.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_can_read_audit_log()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) IN ('laboratory director', 'quality manager')
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
$$;

REVOKE ALL ON FUNCTION public.app_can_read_audit_log() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_read_audit_log() TO authenticated, service_role;

DROP POLICY IF EXISTS audit_log_select_director ON public.audit_log;
DROP POLICY IF EXISTS audit_log_select_auditors ON public.audit_log;
CREATE POLICY audit_log_select_auditors
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.app_can_read_audit_log());

REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- ---------------------------------------------------------------------------
-- Secret stripping + primary-key aware audit trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_audit_strip_secrets(p_row jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN p_row
    ELSE coalesce(
      (
        SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(p_row) e
        WHERE e.key !~* '(^|_)(api_?key|password|passwd|secret|token)(_|$)'
      ),
      '{}'::jsonb
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.app_audit_strip_secrets(jsonb) FROM PUBLIC, anon, authenticated;

-- Trigger arguments (optional) name the key columns, e.g.
--   EXECUTE FUNCTION public.write_audit_log('doc_type')
-- Without arguments: `id`, else the table's primary-key columns.
-- Composite keys are joined with ','.
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_key text;
  previous_row jsonb;
  next_row jsonb;
  key_source jsonb;
  key_cols text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    previous_row := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    next_row := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' AND (previous_row - 'updated_at') = (next_row - 'updated_at') THEN
    RETURN NEW;
  END IF;

  key_source := coalesce(next_row, previous_row);
  IF TG_NARGS > 0 THEN
    key_cols := TG_ARGV;
  ELSIF key_source ? 'id' THEN
    key_cols := ARRAY['id'];
  ELSE
    SELECT array_agg(a.attname::text ORDER BY k.ord)
    INTO key_cols
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    WHERE i.indrelid = TG_RELID
      AND i.indisprimary;
  END IF;

  IF key_cols IS NOT NULL THEN
    SELECT string_agg(coalesce(key_source ->> c.col, ''), ',' ORDER BY c.ord)
    INTO row_key
    FROM unnest(key_cols) WITH ORDINALITY AS c(col, ord);
  END IF;
  row_key := coalesce(row_key, '');

  previous_row := public.app_audit_strip_secrets(previous_row);
  next_row := public.app_audit_strip_secrets(next_row);

  INSERT INTO public.audit_log (actor, table_name, row_id, action, old_row, new_row)
  VALUES (auth.uid(), TG_TABLE_NAME, row_key, TG_OP, previous_row, next_row);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Append-only guard. The only allowed change is reason NULL -> text, and only
-- while app_annotate_audit() has set the transaction-local flag.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('app.audit_annotate', true), '') = 'on' THEN
    IF OLD.reason IS NULL
       AND NEW.reason IS NOT NULL
       AND (to_jsonb(NEW) - 'reason') = (to_jsonb(OLD) - 'reason') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_log_append_only ON public.audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_append_only();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Reason for change, added by the actor after saving.
-- Annotates the caller's latest change (all rows written in that same
-- transaction) of p_table/p_row_id in the last 10 minutes that has no reason.
-- Returns the number of audit rows annotated (0 when nothing matched).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_annotate_audit(p_table text, p_row_id text, p_reason text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := left(btrim(coalesce(p_reason, '')), 2000);
  v_latest uuid;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Reason is required' USING ERRCODE = '22023';
  END IF;

  -- Exactly one row: the caller's latest change. Rows written in one
  -- transaction share `at`, so `seq` breaks the tie.
  SELECT al.id
  INTO v_latest
  FROM public.audit_log al
  WHERE al.actor = v_uid
    AND al.table_name = p_table
    AND al.row_id = coalesce(p_row_id, '')
    AND al.at >= now() - interval '10 minutes'
  ORDER BY al.at DESC, al.seq DESC
  LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.audit_annotate', 'on', true);
  UPDATE public.audit_log al
  SET reason = v_reason
  WHERE al.id = v_latest
    AND al.reason IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.audit_annotate', 'off', true);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.app_annotate_audit(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_annotate_audit(text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attach the audit trigger to technical and quality-system tables that exist.
-- Tables whose primary key is not `id` get the key columns as arguments.
-- Excluded on purpose: audit_log, ai_models/ai_settings/ai_skills, reminders,
-- tasks, profiles (legacy) and the *_options / product_* dropdown lists.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
  rel_oid regclass;
  pk_cols text[];
  trigger_args text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    -- Samples, testing and results (7.4, 7.5, 7.8)
    'samples', 'sample_allocations', 'test_allocations', 'test_allocation_parameters',
    'test_parameters', 'test_parameter_units', 'is_codes', 'is_code_files',
    'nabl_scope', 'nabl_scope_lookups', 'issued_report_amendments', 'consent_letters',
    'sample_retention_disposal',
    -- Calibration (6.4, 6.5)
    'calibration_jobs', 'calibration_raw_data_sheets', 'calibration_service_requests',
    'calibration_nabl_scope',
    -- Equipment and reference materials (6.4, 6.5)
    'equipment_master', 'equipment_for_calibration', 'equipment_crms',
    'equipment_breakdown_register',
    -- Validity of results (7.7)
    'iqc_masters', 'iqc_plan_items', 'result_validity_checks',
    -- Nonconforming work and corrective action (7.10, 8.7)
    'nc_work_records', 'nc_work_corrective_actions', 'nc_work_responsibility_matrix',
    -- Complaints and feedback (7.9, 8.6)
    'customer_complaints', 'customer_feedback',
    -- Internal audit and management review (8.8, 8.9)
    'audit_plans', 'audit_checklist_items', 'audit_nc_actions',
    'mrm_plans', 'mrm_agenda_items', 'mrm_plan_recipients',
    -- General requirements, risks and improvement (4, 8.5, 8.6)
    'gr_confidentiality_records', 'gr_impartiality_risks', 'gr_improvements',
    'gr_objectives', 'gr_risk_opportunities',
    -- Documents and records (8.3, 8.4)
    'management_documents', 'management_document_versions', 'lab_documents',
    'compliance_registers', 'lab_accreditations', 'accreditation_bodies',
    -- Customers, contracts and issued documents (7.1)
    'clients', 'master_clients', 'quotations', 'quotation_line_items',
    'quotation_notes', 'quotation_remarks', 'quotation_terms_conditions',
    'sale_documents', 'sale_document_signature_defaults', 'products_services_master',
    'gst_rates', 'document_series',
    -- Lab configuration and access (6.2, 7.11)
    'lab_settings', 'lab_letterheads', 'lab_prefixes',
    'user_profiles', 'module_access_rules'
  ]
  LOOP
    rel_oid := to_regclass(format('public.%I', rel));
    CONTINUE WHEN rel_oid IS NULL;
    CONTINUE WHEN (SELECT c.relkind FROM pg_class c WHERE c.oid = rel_oid) NOT IN ('r', 'p');

    SELECT array_agg(a.attname::text ORDER BY k.ord)
    INTO pk_cols
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    WHERE i.indrelid = rel_oid
      AND i.indisprimary;

    IF pk_cols IS NULL OR pk_cols = ARRAY['id'] THEN
      trigger_args := '';
    ELSE
      SELECT string_agg(quote_literal(col), ', ') INTO trigger_args FROM unnest(pk_cols) AS col;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log(%s)',
      rel || '_audit_log', rel, trigger_args
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
