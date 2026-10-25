-- ISO/IEC 17025 gap P2-6: externally provided products and services (6.6.1 - 6.6.3).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager) and
-- 20261024100000_audit_trail_expansion.sql (write_audit_log), while the lab
-- is idle. Safe to re-run.
--
-- What it adds
--   supplier_criteria_templates  Evaluation criteria (criterion + weight) per
--                                supplier category, with the score thresholds
--                                for "approved" and "conditional". Seeded once
--                                (ON CONFLICT DO NOTHING); the lab may edit.
--   supplier_approvals           Approved supplier list (6.6.2 b, c): one row
--                                per supplier (clients row) and category, with
--                                scope, accreditation, approval and the next
--                                re-evaluation date. approved is derived from
--                                status (approved / conditional = true).
--   supplier_evaluations         Evaluation / re-evaluation (6.6.2 c, d).
--                                criteria = [{criterion, weight, score 1-5}].
--                                total_score (percent) is computed by the
--                                database; an empty decision is filled from
--                                the category thresholds. The latest
--                                evaluation sets the approval's status, last
--                                score and next_evaluation_due
--                                (evaluated_on + evaluation_interval_months).
--   receipt_inspections          Verification of purchased items before use
--                                (6.6.2 c, 6.4.4): consumables, CRMs,
--                                equipment. An item with a failed check or one
--                                that had expired on receipt cannot be marked
--                                accepted without remarks / at all.
--   subcontracting_register      Work sent to an external laboratory (6.6.1 c,
--                                7.1.1 e). Customer consent is required before
--                                a sent date can be entered.
--
-- Access
--   Read: known staff. Insert / update: Laboratory Director, Quality Manager
--   or a Technical Manager (app_supplier_can_manage). Delete: Laboratory
--   Director only. Restrictive gate lims_known_staff_only like every other
--   public table. Every table is audited by write_audit_log.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'clients must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may maintain suppliers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_supplier_can_manage()
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

REVOKE ALL ON FUNCTION public.app_supplier_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_supplier_can_manage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_criteria_templates (
  category text PRIMARY KEY,
  -- [{"criterion": "Accreditation valid and scope covers our needs", "weight": 3}]
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  pass_score numeric NOT NULL DEFAULT 70,
  conditional_score numeric NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_criteria_templates_category_check CHECK (category IN (
    'calibration_lab', 'crm_supplier', 'pt_provider', 'consumables', 'subcontract_lab',
    'it_hosting', 'ai_provider', 'equipment', 'service', 'other')),
  CONSTRAINT supplier_criteria_templates_criteria_check CHECK (jsonb_typeof(criteria) = 'array'),
  CONSTRAINT supplier_criteria_templates_scores_check CHECK (
    pass_score BETWEEN 0 AND 100 AND conditional_score BETWEEN 0 AND 100 AND conditional_score <= pass_score)
);

CREATE TABLE IF NOT EXISTS public.supplier_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  category text NOT NULL,
  scope text,
  accreditation_body text,
  accreditation_no text,
  accreditation_valid_until date,
  approved boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_by_user_id uuid,
  approved_on date,
  evaluation_interval_months int NOT NULL DEFAULT 12,
  next_evaluation_due date,
  last_evaluated_on date,
  last_score numeric,
  status text NOT NULL DEFAULT 'not_approved',
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_approvals_category_check CHECK (category IN (
    'calibration_lab', 'crm_supplier', 'pt_provider', 'consumables', 'subcontract_lab',
    'it_hosting', 'ai_provider', 'equipment', 'service', 'other')),
  CONSTRAINT supplier_approvals_status_check CHECK (status IN ('approved', 'conditional', 'suspended', 'not_approved')),
  CONSTRAINT supplier_approvals_interval_check CHECK (evaluation_interval_months BETWEEN 1 AND 60),
  CONSTRAINT supplier_approvals_approved_check CHECK (approved = (status IN ('approved', 'conditional')))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_approvals_client_category_key
  ON public.supplier_approvals (client_id, category);
CREATE INDEX IF NOT EXISTS idx_supplier_approvals_status ON public.supplier_approvals (status);
CREATE INDEX IF NOT EXISTS idx_supplier_approvals_due ON public.supplier_approvals (next_evaluation_due);

CREATE TABLE IF NOT EXISTS public.supplier_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.supplier_approvals (id) ON DELETE RESTRICT,
  evaluated_on date NOT NULL DEFAULT current_date,
  period text,
  -- [{"criterion": "...", "weight": 3, "score": 4}]
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_score numeric,
  decision text,
  evaluated_by text,
  evaluated_by_user_id uuid DEFAULT auth.uid(),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_evaluations_criteria_check CHECK (jsonb_typeof(criteria) = 'array'),
  CONSTRAINT supplier_evaluations_decision_check CHECK (
    decision IS NULL OR decision IN ('approved', 'conditional', 'suspended', 'not_approved'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_evaluations_approval
  ON public.supplier_evaluations (approval_id, evaluated_on DESC);

CREATE TABLE IF NOT EXISTS public.receipt_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  item_type text NOT NULL DEFAULT 'consumable',
  item_description text NOT NULL,
  po_or_invoice_ref text,
  received_on date NOT NULL DEFAULT current_date,
  quantity numeric,
  unit text,
  batch_lot text,
  expiry_date date,
  certificate_ref text,
  -- [{"check": "Packaging intact", "result": "pass" | "fail" | "na", "note": "..."}]
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- NULL = decision pending
  accepted boolean,
  supplier_approved_at_receipt boolean,
  inspected_by text,
  inspected_by_user_id uuid DEFAULT auth.uid(),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_inspections_item_type_check CHECK (item_type IN ('consumable', 'crm', 'equipment', 'reagent', 'other')),
  CONSTRAINT receipt_inspections_item_check CHECK (btrim(item_description) <> ''),
  CONSTRAINT receipt_inspections_quantity_check CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT receipt_inspections_checks_check CHECK (jsonb_typeof(checks) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_receipt_inspections_received ON public.receipt_inspections (received_on DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_inspections_supplier ON public.receipt_inspections (supplier_id);

CREATE TABLE IF NOT EXISTS public.subcontracting_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_description text NOT NULL,
  sample_or_srf_ref text,
  customer_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  subcontract_lab_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  customer_consent boolean NOT NULL DEFAULT false,
  consent_ref text,
  consent_on date,
  sent_on date,
  lab_approved_at_send boolean,
  report_received_on date,
  report_ref text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontracting_register_work_check CHECK (btrim(work_description) <> ''),
  CONSTRAINT subcontracting_register_consent_date_check CHECK (NOT customer_consent OR consent_on IS NOT NULL),
  CONSTRAINT subcontracting_register_consent_before_send_check CHECK (
    sent_on IS NULL OR (customer_consent AND consent_on <= sent_on)),
  CONSTRAINT subcontracting_register_report_check CHECK (
    report_received_on IS NULL OR (sent_on IS NOT NULL AND report_received_on >= sent_on))
);

CREATE INDEX IF NOT EXISTS idx_subcontracting_register_lab ON public.subcontracting_register (subcontract_lab_id);
CREATE INDEX IF NOT EXISTS idx_subcontracting_register_created ON public.subcontracting_register (created_at DESC);

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['supplier_criteria_templates', 'supplier_approvals', 'supplier_evaluations',
                             'receipt_inspections', 'subcontracting_register'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Criteria templates (seed only; never overwrites the lab's edits).
-- ---------------------------------------------------------------------------

INSERT INTO public.supplier_criteria_templates (category, criteria) VALUES
  ('calibration_lab', '[
    {"criterion": "Accreditation (ISO/IEC 17025) valid and scope covers our equipment", "weight": 3},
    {"criterion": "Certificate quality: traceability, uncertainty, results as required", "weight": 3},
    {"criterion": "Turnaround time", "weight": 2},
    {"criterion": "Handling and transport of equipment", "weight": 1},
    {"criterion": "Response to queries and complaints", "weight": 1},
    {"criterion": "Cost", "weight": 1}]'::jsonb),
  ('crm_supplier', '[
    {"criterion": "Producer accredited to ISO 17034 / certified values traceable", "weight": 3},
    {"criterion": "Certificate complete: values, uncertainty, traceability, expiry", "weight": 3},
    {"criterion": "Delivery time", "weight": 2},
    {"criterion": "Packaging and condition on receipt", "weight": 2},
    {"criterion": "Remaining shelf life on receipt", "weight": 1},
    {"criterion": "Price", "weight": 1}]'::jsonb),
  ('pt_provider', '[
    {"criterion": "Accreditation to ISO/IEC 17043", "weight": 3},
    {"criterion": "Schemes cover our scope / sub-disciplines", "weight": 3},
    {"criterion": "Timeliness of rounds and reports", "weight": 2},
    {"criterion": "Report clarity and statistical design", "weight": 2},
    {"criterion": "Cost", "weight": 1}]'::jsonb),
  ('consumables', '[
    {"criterion": "Conformance to specification / grade", "weight": 3},
    {"criterion": "Delivery time", "weight": 2},
    {"criterion": "Packaging and condition on receipt", "weight": 2},
    {"criterion": "Documents supplied (CoA, SDS, batch, expiry)", "weight": 2},
    {"criterion": "Price", "weight": 1},
    {"criterion": "Response to complaints", "weight": 1}]'::jsonb),
  ('subcontract_lab', '[
    {"criterion": "Accreditation and scope cover the subcontracted work", "weight": 3},
    {"criterion": "Report quality and compliance with the method", "weight": 3},
    {"criterion": "Turnaround time", "weight": 2},
    {"criterion": "Confidentiality and impartiality arrangements", "weight": 2},
    {"criterion": "Communication", "weight": 1}]'::jsonb),
  ('it_hosting', '[
    {"criterion": "Availability / uptime", "weight": 3},
    {"criterion": "Data security, backup and restore", "weight": 3},
    {"criterion": "Data location and confidentiality agreement", "weight": 2},
    {"criterion": "Support response", "weight": 2},
    {"criterion": "Cost", "weight": 1}]'::jsonb),
  ('ai_provider', '[
    {"criterion": "Data protection terms (no training on lab / customer data)", "weight": 3},
    {"criterion": "Confidentiality / data processing agreement", "weight": 3},
    {"criterion": "Output fitness, verified by the lab before use", "weight": 2},
    {"criterion": "Availability", "weight": 1},
    {"criterion": "Cost", "weight": 1}]'::jsonb),
  ('equipment', '[
    {"criterion": "Conformance to specification", "weight": 3},
    {"criterion": "Installation, commissioning and training", "weight": 2},
    {"criterion": "Calibration certificate supplied at delivery", "weight": 2},
    {"criterion": "After-sales service", "weight": 2},
    {"criterion": "Delivery time", "weight": 1},
    {"criterion": "Price", "weight": 1}]'::jsonb),
  ('service', '[
    {"criterion": "Quality of service", "weight": 3},
    {"criterion": "Timeliness", "weight": 2},
    {"criterion": "Competence of personnel", "weight": 2},
    {"criterion": "Documentation / records supplied", "weight": 1},
    {"criterion": "Cost", "weight": 1}]'::jsonb),
  ('other', '[
    {"criterion": "Quality", "weight": 3},
    {"criterion": "Delivery / timeliness", "weight": 2},
    {"criterion": "Documentation", "weight": 1},
    {"criterion": "Cost", "weight": 1}]'::jsonb)
ON CONFLICT (category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Scoring: weighted percent of the maximum (all criteria scored 5 = 100).
--    Raises on a malformed criteria list.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_supplier_score(p_criteria jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
  v_w numeric;
  v_s numeric;
  v_sum numeric := 0;
  v_wsum numeric := 0;
BEGIN
  IF p_criteria IS NULL OR jsonb_typeof(p_criteria) <> 'array' OR jsonb_array_length(p_criteria) = 0 THEN
    RETURN NULL;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_criteria) LOOP
    IF jsonb_typeof(item) <> 'object' OR btrim(coalesce(item ->> 'criterion', '')) = '' THEN
      RAISE EXCEPTION 'Each criterion needs a name' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item -> 'weight') <> 'number' OR (item ->> 'weight')::numeric <= 0 THEN
      RAISE EXCEPTION 'Weight for "%" must be a number above 0', item ->> 'criterion' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item -> 'score') <> 'number'
       OR (item ->> 'score')::numeric NOT IN (1, 2, 3, 4, 5) THEN
      RAISE EXCEPTION 'Score for "%" must be 1 to 5', item ->> 'criterion' USING ERRCODE = '22023';
    END IF;
    v_w := (item ->> 'weight')::numeric;
    v_s := (item ->> 'score')::numeric;
    v_sum := v_sum + v_w * v_s;
    v_wsum := v_wsum + v_w;
  END LOOP;
  RETURN round(100 * v_sum / (5 * v_wsum), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.app_supplier_score(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_supplier_score(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Approvals: approved follows status; who approved and when.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_approvals_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_was boolean := false;
BEGIN
  NEW.approved := NEW.status IN ('approved', 'conditional');
  IF TG_OP = 'UPDATE' THEN
    v_was := OLD.approved;
  ELSE
    -- Filled from evaluations only.
    NEW.last_evaluated_on := NULL;
    NEW.last_score := NULL;
  END IF;
  IF NEW.approved AND NOT v_was THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.approved_by_user_id := auth.uid();
      SELECT coalesce(nullif(btrim(up.full_name), ''), up.email) INTO v_name
        FROM public.user_profiles up WHERE up.id = auth.uid();
      IF nullif(btrim(coalesce(NEW.approved_by, '')), '') IS NULL THEN
        NEW.approved_by := v_name;
      END IF;
    END IF;
    NEW.approved_on := coalesce(NEW.approved_on, current_date);
  END IF;
  NEW.scope := nullif(btrim(coalesce(NEW.scope, '')), '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_approvals_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_approvals_before_write ON public.supplier_approvals;
CREATE TRIGGER trg_supplier_approvals_before_write
  BEFORE INSERT OR UPDATE ON public.supplier_approvals
  FOR EACH ROW EXECUTE FUNCTION public.supplier_approvals_before_write();

-- ---------------------------------------------------------------------------
-- 6. Evaluations: total score, default decision, then refresh the approval.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_evaluations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.supplier_criteria_templates%ROWTYPE;
  v_cat text;
  v_name text;
BEGIN
  NEW.criteria := coalesce(NEW.criteria, '[]'::jsonb);
  NEW.total_score := public.app_supplier_score(NEW.criteria);
  IF NEW.decision IS NULL AND NEW.total_score IS NOT NULL THEN
    SELECT a.category INTO v_cat FROM public.supplier_approvals a WHERE a.id = NEW.approval_id;
    SELECT * INTO t FROM public.supplier_criteria_templates WHERE category = v_cat;
    NEW.decision := CASE
      WHEN NEW.total_score >= coalesce(t.pass_score, 70) THEN 'approved'
      WHEN NEW.total_score >= coalesce(t.conditional_score, 50) THEN 'conditional'
      ELSE 'not_approved'
    END;
  END IF;
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.evaluated_by_user_id := auth.uid();
    IF nullif(btrim(coalesce(NEW.evaluated_by, '')), '') IS NULL THEN
      SELECT coalesce(nullif(btrim(up.full_name), ''), up.email) INTO v_name
        FROM public.user_profiles up WHERE up.id = auth.uid();
      NEW.evaluated_by := v_name;
    END IF;
  END IF;
  IF NEW.evaluated_on > current_date + 1 THEN
    RAISE EXCEPTION 'An evaluation cannot be dated in the future (%).', NEW.evaluated_on USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_evaluations_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_evaluations_before_write ON public.supplier_evaluations;
CREATE TRIGGER trg_supplier_evaluations_before_write
  BEFORE INSERT OR UPDATE ON public.supplier_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.supplier_evaluations_before_write();

-- Latest evaluation (by date, then entry time) drives the approval.
-- p_apply_decision: copy its decision into the approval's status (not on delete).
CREATE OR REPLACE FUNCTION public.app_supplier_refresh_approval(p_approval_id uuid, p_apply_decision boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e public.supplier_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO e
    FROM public.supplier_evaluations
   WHERE approval_id = p_approval_id
   ORDER BY evaluated_on DESC, created_at DESC, id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    UPDATE public.supplier_approvals
       SET last_evaluated_on = NULL, last_score = NULL
     WHERE id = p_approval_id
       AND (last_evaluated_on IS NOT NULL OR last_score IS NOT NULL);
    RETURN;
  END IF;
  UPDATE public.supplier_approvals a
     SET last_evaluated_on = e.evaluated_on,
         last_score = e.total_score,
         next_evaluation_due = (e.evaluated_on + make_interval(months => a.evaluation_interval_months))::date,
         status = CASE WHEN p_apply_decision AND e.decision IS NOT NULL THEN e.decision ELSE a.status END
   WHERE a.id = p_approval_id;
END;
$$;

REVOKE ALL ON FUNCTION public.app_supplier_refresh_approval(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_evaluations_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.app_supplier_refresh_approval(OLD.approval_id, false);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.approval_id IS DISTINCT FROM NEW.approval_id THEN
    PERFORM public.app_supplier_refresh_approval(OLD.approval_id, false);
  END IF;
  SELECT id INTO v_latest
    FROM public.supplier_evaluations
   WHERE approval_id = NEW.approval_id
   ORDER BY evaluated_on DESC, created_at DESC, id DESC
   LIMIT 1;
  -- Only the latest evaluation changes the status; a back-dated entry only
  -- refreshes the dates.
  PERFORM public.app_supplier_refresh_approval(NEW.approval_id, v_latest = NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_evaluations_after_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_evaluations_after_write ON public.supplier_evaluations;
CREATE TRIGGER trg_supplier_evaluations_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.supplier_evaluations_after_write();

-- ---------------------------------------------------------------------------
-- 7. Receipt inspection rules.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.receipt_inspections_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
  v_failed int := 0;
  v_name text;
BEGIN
  NEW.checks := coalesce(NEW.checks, '[]'::jsonb);
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.checks) LOOP
    IF jsonb_typeof(item) <> 'object' OR btrim(coalesce(item ->> 'check', '')) = '' THEN
      RAISE EXCEPTION 'Each receipt check needs a name' USING ERRCODE = '22023';
    END IF;
    IF coalesce(item ->> 'result', '') NOT IN ('pass', 'fail', 'na') THEN
      RAISE EXCEPTION 'Result for "%" must be pass, fail or na', item ->> 'check' USING ERRCODE = '22023';
    END IF;
    IF item ->> 'result' = 'fail' THEN
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  IF NEW.accepted IS TRUE THEN
    IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < NEW.received_on THEN
      RAISE EXCEPTION 'The item had expired on receipt (%) and cannot be accepted.', NEW.expiry_date
        USING ERRCODE = '23514';
    END IF;
    IF v_failed > 0 AND nullif(btrim(coalesce(NEW.remarks, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A check failed: record the justification in remarks before accepting.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Snapshot of the supplier's approval at the time of receipt.
  IF TG_OP = 'INSERT' OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
    NEW.supplier_approved_at_receipt := EXISTS (
      SELECT 1 FROM public.supplier_approvals a
       WHERE a.client_id = NEW.supplier_id AND a.approved);
  END IF;

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.inspected_by_user_id := auth.uid();
    IF nullif(btrim(coalesce(NEW.inspected_by, '')), '') IS NULL THEN
      SELECT coalesce(nullif(btrim(up.full_name), ''), up.email) INTO v_name
        FROM public.user_profiles up WHERE up.id = auth.uid();
      NEW.inspected_by := v_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.receipt_inspections_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_receipt_inspections_before_write ON public.receipt_inspections;
CREATE TRIGGER trg_receipt_inspections_before_write
  BEFORE INSERT OR UPDATE ON public.receipt_inspections
  FOR EACH ROW EXECUTE FUNCTION public.receipt_inspections_before_write();

-- ---------------------------------------------------------------------------
-- 8. Subcontracting: snapshot whether the lab was approved when work was sent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.subcontracting_register_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sent_on IS NULL THEN
    NEW.lab_approved_at_send := NULL;
  ELSIF TG_OP = 'INSERT'
     OR OLD.sent_on IS NULL
     OR OLD.subcontract_lab_id IS DISTINCT FROM NEW.subcontract_lab_id THEN
    NEW.lab_approved_at_send := EXISTS (
      SELECT 1 FROM public.supplier_approvals a
       WHERE a.client_id = NEW.subcontract_lab_id
         AND a.approved
         AND a.category IN ('subcontract_lab', 'calibration_lab'));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.subcontracting_register_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_subcontracting_register_before_write ON public.subcontracting_register;
CREATE TRIGGER trg_subcontracting_register_before_write
  BEFORE INSERT OR UPDATE ON public.subcontracting_register
  FOR EACH ROW EXECUTE FUNCTION public.subcontracting_register_before_write();

-- ---------------------------------------------------------------------------
-- 9. Row level security and grants
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['supplier_criteria_templates', 'supplier_approvals', 'supplier_evaluations',
                             'receipt_inspections', 'subcontracting_register'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_supplier_can_manage())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_supplier_can_manage()) WITH CHECK (public.app_supplier_can_manage())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_is_laboratory_director())',
      rel || '_delete', rel);

    -- Same outer gate as every other public table (20261009063000).
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

-- Computed / snapshot columns are set by the database only.
REVOKE UPDATE ON public.supplier_approvals FROM authenticated;
GRANT UPDATE (client_id, category, scope, accreditation_body, accreditation_no, accreditation_valid_until,
              approved_by, approved_on, evaluation_interval_months, next_evaluation_due, status, remarks)
  ON public.supplier_approvals TO authenticated;
REVOKE UPDATE ON public.supplier_evaluations FROM authenticated;
GRANT UPDATE (approval_id, evaluated_on, period, criteria, decision, evaluated_by, remarks)
  ON public.supplier_evaluations TO authenticated;
REVOKE UPDATE ON public.receipt_inspections FROM authenticated;
GRANT UPDATE (supplier_id, item_type, item_description, po_or_invoice_ref, received_on, quantity, unit,
              batch_lot, expiry_date, certificate_ref, checks, accepted, inspected_by, remarks)
  ON public.receipt_inspections TO authenticated;
REVOKE UPDATE ON public.subcontracting_register FROM authenticated;
GRANT UPDATE (work_description, sample_or_srf_ref, customer_id, subcontract_lab_id, customer_consent,
              consent_ref, consent_on, sent_on, report_received_on, report_ref, remarks)
  ON public.subcontracting_register TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: supplier tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['supplier_criteria_templates', 'supplier_approvals', 'supplier_evaluations',
                             'receipt_inspections', 'subcontracting_register'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
