-- ISO/IEC 17025 gaps P2-1 (control of management system documents, 8.3) and
-- P2-10 (control of records: retention, 8.4).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and
-- 20261025100000_soft_delete.sql, while the lab is idle. Safe to re-run.
--
-- What it adds
--   management_documents (new columns)
--     prepared_by_id / prepared_at        who submitted the document for review
--     reviewed_by_id / reviewed_at / review_comment
--     approved_by_id / approved_at / approval_comment
--     review_period_months, next_review_due, last_periodic_review_at/_by/_note
--                                         periodic review (8.3.2 b)
--     distribution_user_ids, distribute_to_all
--                                         distribution list (8.3.2 c)
--     obsoleted_at / obsoleted_by         withdrawal date (8.3.2 e, f; retention)
--   The old text columns prepared_by / reviewed_by / approved_by stay and are
--   filled from the signed-in person's profile name by the workflow.
--
--   E-approval workflow (SECURITY DEFINER RPCs; the app asks for the login
--   password before calling review / approve)
--     app_mgmt_doc_submit(id)                       Draft -> Under review (author)
--     app_mgmt_doc_review(id, accept, comment)      reviewer (not the author);
--                                                   reject returns it to Draft
--     app_mgmt_doc_approve(id, accept, comment, effective_date)
--                                                   Laboratory Director or
--                                                   Quality Manager, after review;
--                                                   accept -> Active
--     app_mgmt_doc_start_change(id, change_type)    archive the current version
--                                                   (with content) and start a
--                                                   new revision / issue /
--                                                   amendment as Draft
--     app_mgmt_doc_periodic_review(id, note, next_due)
--     app_mgmt_doc_acknowledge(id)                  "I have read" for the current
--                                                   version
--     app_mgmt_doc_reading_list()                   my distributed active
--                                                   documents + acknowledgement
--   Guard trigger trg_management_documents_doc_control (app users only):
--     * workflow columns cannot be written directly;
--     * Active / Obsolete documents are read-only. Only the Director / QM may
--       change their status (Active -> Obsolete; Obsolete -> Active Director
--       only), distribution, review schedule, or attach a file when none is
--       attached. Content changes go through app_mgmt_doc_start_change;
--     * a document becomes Active only through app_mgmt_doc_approve, except
--       that the Director / QM may register an already approved (paper)
--       document directly as Active or Obsolete;
--     * changing the content of a reviewed document under review clears the
--       review.
--
--   management_document_acknowledgements (document_id, version, user_id,
--     acknowledged_at) read-acknowledgement records; append-only, one per
--     person per version; Director-only delete.
--   management_document_versions gains the workflow columns and draft_content
--     so a superseded version keeps its signatures and text (8.3.2 f).
--
--   record_retention_rules  retention schedule (8.4.2) seeded with defaults
--     for a NABL testing and calibration laboratory (edit to suit the lab).
--   app_retention_past_due_counts()
--     per rule, how many records in the linked table are past retention.
--     Read-only COUNT; nothing is ever deleted or changed by this migration
--     or by the RPC. Disposal stays a deliberate, recorded decision.
--
-- Access
--   Documents: as before (known staff) plus the workflow rules above.
--   Acknowledgements: known staff read; each person inserts only their own.
--   Retention rules: known staff read; Director / Quality Manager write;
--   Director deletes. Restrictive gate lims_known_staff_only on new tables.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.management_documents') IS NULL
     OR to_regclass('public.management_document_versions') IS NULL THEN
    RAISE EXCEPTION 'management_documents and management_document_versions must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Laboratory Director or Quality Manager.
CREATE OR REPLACE FUNCTION public.app_mgmt_doc_is_approver()
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
    RETURN coalesce(v_ok, false);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_is_approver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_is_approver() TO authenticated, service_role;

-- Profile name (or e-mail) of a user.
CREATE OR REPLACE FUNCTION public.app_mgmt_doc_user_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(nullif(btrim(up.full_name), ''), nullif(btrim(up.email), ''), p_user::text)
  FROM public.user_profiles up
  WHERE up.id = p_user
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_user_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_user_name(uuid) TO authenticated, service_role;

-- "Rev 01 / Issue 00 / Amd 00": the version a reader acknowledges.
CREATE OR REPLACE FUNCTION public.app_mgmt_doc_version_label(p_rev text, p_issue text, p_amd text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'Rev ' || coalesce(nullif(btrim(p_rev), ''), '00')
      || ' / Issue ' || coalesce(nullif(btrim(p_issue), ''), '00')
      || ' / Amd ' || coalesce(nullif(btrim(p_amd), ''), '00')
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_version_label(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_version_label(text, text, text) TO authenticated, service_role;

-- 00 -> 01, Rev-1 -> Rev-2, blank -> 01, ABC -> ABC-01 (same as the app).
CREATE OR REPLACE FUNCTION public.app_mgmt_doc_next_no(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := btrim(coalesce(p, ''));
  m text[];
BEGIN
  IF v = '' THEN
    RETURN '01';
  END IF;
  m := regexp_match(v, '^(.*?)([0-9]+)$');
  IF m IS NULL THEN
    RETURN v || '-01';
  END IF;
  RETURN m[1] || lpad(((m[2])::numeric + 1)::text, length(m[2]), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_next_no(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_next_no(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.management_documents
  ADD COLUMN IF NOT EXISTS prepared_by_id uuid,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS approved_by_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_comment text,
  ADD COLUMN IF NOT EXISTS review_period_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS next_review_due date,
  ADD COLUMN IF NOT EXISTS last_periodic_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_periodic_review_by uuid,
  ADD COLUMN IF NOT EXISTS last_periodic_review_note text,
  ADD COLUMN IF NOT EXISTS distribution_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS distribute_to_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obsoleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS obsoleted_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.management_documents'::regclass
      AND conname = 'management_documents_review_period_check'
  ) THEN
    ALTER TABLE public.management_documents
      ADD CONSTRAINT management_documents_review_period_check
      CHECK (review_period_months BETWEEN 1 AND 120);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_management_documents_next_review_due
  ON public.management_documents (next_review_due) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_management_documents_distribution
  ON public.management_documents USING gin (distribution_user_ids);

ALTER TABLE public.management_document_versions
  ADD COLUMN IF NOT EXISTS prepared_by_id uuid,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_content text,
  ADD COLUMN IF NOT EXISTS version_label text;

-- Backfill (only rows not filled yet, so a re-run changes nothing): review
-- due for active documents, withdrawal date for obsolete ones. Runs before the
-- guard trigger below exists; the audit trail records the fill.
UPDATE public.management_documents
   SET next_review_due = (coalesce(issue_date, revision_date, created_at::date)
                          + make_interval(months => review_period_months))::date
 WHERE status = 'active' AND next_review_due IS NULL;
UPDATE public.management_documents
   SET obsoleted_at = updated_at
 WHERE status = 'obsolete' AND obsoleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Guard trigger on management_documents
--    SECURITY INVOKER on purpose: current_user tells the app (authenticated /
--    anon) from the owner, service_role and the SECURITY DEFINER workflow RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.management_documents_doc_control()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_flow text[] := ARRAY[
    'prepared_by_id', 'prepared_at', 'reviewed_by_id', 'reviewed_at', 'review_comment',
    'approved_by_id', 'approved_at', 'approval_comment',
    'last_periodic_review_at', 'last_periodic_review_by', 'last_periodic_review_note',
    'obsoleted_at', 'obsoleted_by'];
  v_meta text[] := ARRAY[
    'updated_at', 'distribution_user_ids', 'distribute_to_all', 'review_period_months',
    'next_review_due', 'deleted_at', 'deleted_by', 'delete_reason'];
  v_sign text[] := ARRAY['status', 'prepared_by', 'reviewed_by', 'approved_by'];
  v_content_changed boolean;
  v_other_changed boolean;
  v_approver boolean;
BEGIN
  IF v_app THEN
    v_approver := public.app_mgmt_doc_is_approver();

    IF TG_OP = 'INSERT' THEN
      NEW.prepared_by_id := NULL;
      NEW.prepared_at := NULL;
      NEW.reviewed_by_id := NULL;
      NEW.reviewed_at := NULL;
      NEW.review_comment := NULL;
      NEW.approved_by_id := NULL;
      NEW.approved_at := NULL;
      NEW.approval_comment := NULL;
      NEW.last_periodic_review_at := NULL;
      NEW.last_periodic_review_by := NULL;
      NEW.last_periodic_review_note := NULL;
      NEW.obsoleted_at := NULL;
      NEW.obsoleted_by := NULL;
      IF NEW.status IN ('active', 'obsolete') AND NOT v_approver THEN
        RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can register an approved (Active / Obsolete) document directly.'
          USING ERRCODE = '42501',
                HINT = 'Save it as Draft and use Submit for review (ISO/IEC 17025 8.3.2 a).';
      END IF;
      IF NEW.status = 'under_review' THEN
        NEW.prepared_by_id := v_uid;
        NEW.prepared_at := now();
      END IF;
    ELSE
      -- Workflow columns are written only by the workflow RPCs.
      IF (SELECT bool_or((to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k))
            FROM unnest(v_flow) k) THEN
        RAISE EXCEPTION 'Preparation, review and approval details are recorded by the workflow and cannot be edited directly.'
          USING ERRCODE = '42501';
      END IF;

      v_content_changed :=
        (to_jsonb(NEW) - v_flow - v_meta - v_sign - 'file_path')
          IS DISTINCT FROM (to_jsonb(OLD) - v_flow - v_meta - v_sign - 'file_path');

      IF OLD.status IN ('active', 'obsolete') THEN
        IF v_content_changed
           OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           OR (OLD.file_path IS NOT NULL AND NEW.file_path IS DISTINCT FROM OLD.file_path) THEN
          RAISE EXCEPTION 'Approved documents are read-only. Start a New Revision, Issue or Amendment to change this document.'
            USING ERRCODE = '42501',
                  HINT = 'ISO/IEC 17025 8.3.2: changes are reviewed and approved before issue.';
        END IF;
        v_other_changed :=
          (to_jsonb(NEW) - 'updated_at' - 'deleted_at' - 'deleted_by' - 'delete_reason')
            IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'deleted_at' - 'deleted_by' - 'delete_reason');
        IF v_other_changed AND NOT v_approver THEN
          RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can change the status, distribution or review schedule of an approved document.'
            USING ERRCODE = '42501';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          IF NOT (
            (OLD.status = 'active' AND NEW.status = 'obsolete')
            OR (OLD.status = 'obsolete' AND NEW.status = 'active' AND public.app_is_laboratory_director())
          ) THEN
            RAISE EXCEPTION 'An approved document cannot go back to %. Start a New Revision, Issue or Amendment instead.', NEW.status
              USING ERRCODE = '42501';
          END IF;
        END IF;
      ELSE
        -- Draft / under review
        IF NEW.status = 'active' THEN
          RAISE EXCEPTION 'A document becomes Active only through Approve (Laboratory Director or Quality Manager, with password).'
            USING ERRCODE = '42501',
                  HINT = 'Submit for review, have it reviewed, then approve it.';
        END IF;
        IF NEW.status = 'obsolete' AND NOT v_approver THEN
          RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can withdraw a document.'
            USING ERRCODE = '42501';
        END IF;
        IF OLD.status = 'draft' AND NEW.status = 'under_review' THEN
          NEW.prepared_by_id := v_uid;
          NEW.prepared_at := now();
          NEW.reviewed_by_id := NULL;
          NEW.reviewed_at := NULL;
          NEW.approved_by_id := NULL;
          NEW.approved_at := NULL;
          NEW.reviewed_by := NULL;
          NEW.approved_by := NULL;
        ELSIF OLD.status = 'under_review' AND NEW.status = 'draft' THEN
          NEW.reviewed_by_id := NULL;
          NEW.reviewed_at := NULL;
          NEW.reviewed_by := NULL;
        ELSIF OLD.status = 'under_review' AND NEW.status = 'under_review'
              AND OLD.reviewed_by_id IS NOT NULL AND v_content_changed THEN
          -- The reviewed text changed: the review no longer applies.
          NEW.reviewed_by_id := NULL;
          NEW.reviewed_at := NULL;
          NEW.reviewed_by := NULL;
          NEW.review_comment := 'Review cleared: the document was changed after review.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Everyone (app, RPCs, service role): keep the printed names and the
  -- withdrawal date in step with the workflow.
  IF NEW.prepared_by_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.prepared_by_id IS DISTINCT FROM OLD.prepared_by_id) THEN
    NEW.prepared_by := coalesce(public.app_mgmt_doc_user_name(NEW.prepared_by_id), NEW.prepared_by);
  END IF;
  IF NEW.reviewed_by_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.reviewed_by_id IS DISTINCT FROM OLD.reviewed_by_id) THEN
    NEW.reviewed_by := coalesce(public.app_mgmt_doc_user_name(NEW.reviewed_by_id), NEW.reviewed_by);
  END IF;
  IF NEW.approved_by_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id) THEN
    NEW.approved_by := coalesce(public.app_mgmt_doc_user_name(NEW.approved_by_id), NEW.approved_by);
  END IF;
  IF NEW.status = 'obsolete' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'obsolete') THEN
    NEW.obsoleted_at := coalesce(NEW.obsoleted_at, now());
    NEW.obsoleted_by := coalesce(NEW.obsoleted_by, v_uid);
  ELSIF NEW.status <> 'obsolete' AND TG_OP = 'UPDATE' AND OLD.status = 'obsolete' THEN
    NEW.obsoleted_at := NULL;
    NEW.obsoleted_by := NULL;
  END IF;
  IF NEW.status = 'active' AND NEW.next_review_due IS NULL THEN
    NEW.next_review_due := (coalesce(NEW.issue_date, NEW.revision_date, current_date)
                            + make_interval(months => NEW.review_period_months))::date;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.management_documents_doc_control() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_management_documents_doc_control ON public.management_documents;
CREATE TRIGGER trg_management_documents_doc_control
  BEFORE INSERT OR UPDATE ON public.management_documents
  FOR EACH ROW EXECUTE FUNCTION public.management_documents_doc_control();

-- ---------------------------------------------------------------------------
-- 4. Workflow RPCs (SECURITY DEFINER; each checks the caller)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_mgmt_doc_lock(p_id uuid)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.management_documents
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN d;
END;
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_lock(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_submit(uuid);
CREATE FUNCTION public.app_mgmt_doc_submit(p_id uuid)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
BEGIN
  d := public.app_mgmt_doc_lock(p_id);
  IF d.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a Draft can be submitted for review (this one is %).', d.status
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.management_documents
     SET status = 'under_review',
         prepared_by_id = auth.uid(),
         prepared_at = now(),
         reviewed_by_id = NULL, reviewed_at = NULL, reviewed_by = NULL,
         approved_by_id = NULL, approved_at = NULL, approved_by = NULL,
         review_comment = NULL, approval_comment = NULL
   WHERE id = p_id
  RETURNING * INTO d;
  RETURN d;
END;
$$;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_review(uuid, boolean, text);
CREATE FUNCTION public.app_mgmt_doc_review(p_id uuid, p_accept boolean, p_comment text DEFAULT NULL)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  d := public.app_mgmt_doc_lock(p_id);
  IF d.status <> 'under_review' THEN
    RAISE EXCEPTION 'The document is not under review.' USING ERRCODE = '22023';
  END IF;
  IF d.reviewed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'The document has already been reviewed; it is waiting for approval.' USING ERRCODE = '22023';
  END IF;
  IF d.prepared_by_id IS NOT NULL AND d.prepared_by_id = auth.uid() THEN
    RAISE EXCEPTION 'The person who prepared the document cannot review it.'
      USING ERRCODE = '42501', HINT = 'Ask another authorised person to review it.';
  END IF;
  IF coalesce(p_accept, false) THEN
    UPDATE public.management_documents
       SET reviewed_by_id = auth.uid(),
           reviewed_at = now(),
           review_comment = v_comment
     WHERE id = p_id
    RETURNING * INTO d;
  ELSE
    IF v_comment IS NULL THEN
      RAISE EXCEPTION 'Give a reason when returning the document to the author.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.management_documents
       SET status = 'draft',
           reviewed_by_id = NULL, reviewed_at = NULL, reviewed_by = NULL,
           review_comment = 'Returned by ' || coalesce(public.app_mgmt_doc_user_name(auth.uid()), 'reviewer')
                            || ': ' || v_comment
     WHERE id = p_id
    RETURNING * INTO d;
  END IF;
  RETURN d;
END;
$$;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_approve(uuid, boolean, text, date);
CREATE FUNCTION public.app_mgmt_doc_approve(
  p_id uuid,
  p_accept boolean,
  p_comment text DEFAULT NULL,
  p_effective_date date DEFAULT NULL
)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  d := public.app_mgmt_doc_lock(p_id);
  IF NOT public.app_mgmt_doc_is_approver() THEN
    RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can approve documents.'
      USING ERRCODE = '42501';
  END IF;
  IF d.status <> 'under_review' THEN
    RAISE EXCEPTION 'The document is not under review.' USING ERRCODE = '22023';
  END IF;
  IF d.reviewed_by_id IS NULL THEN
    RAISE EXCEPTION 'The document must be reviewed before approval.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_accept, false) THEN
    UPDATE public.management_documents
       SET status = 'active',
           approved_by_id = auth.uid(),
           approved_at = now(),
           approval_comment = v_comment,
           issue_date = coalesce(p_effective_date, issue_date, current_date),
           next_review_due = (current_date + make_interval(months => review_period_months))::date,
           last_periodic_review_at = NULL,
           last_periodic_review_by = NULL,
           last_periodic_review_note = NULL
     WHERE id = p_id
    RETURNING * INTO d;
  ELSE
    IF v_comment IS NULL THEN
      RAISE EXCEPTION 'Give a reason when rejecting the document.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.management_documents
       SET status = 'draft',
           reviewed_by_id = NULL, reviewed_at = NULL, reviewed_by = NULL,
           approved_by_id = NULL, approved_at = NULL, approved_by = NULL,
           approval_comment = 'Rejected by ' || coalesce(public.app_mgmt_doc_user_name(auth.uid()), 'approver')
                              || ': ' || v_comment
     WHERE id = p_id
    RETURNING * INTO d;
  END IF;
  RETURN d;
END;
$$;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_start_change(uuid, text);
CREATE FUNCTION public.app_mgmt_doc_start_change(p_id uuid, p_change_type text)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
  v_type text := lower(btrim(coalesce(p_change_type, '')));
BEGIN
  d := public.app_mgmt_doc_lock(p_id);
  IF v_type NOT IN ('revision', 'issue', 'amendment') THEN
    RAISE EXCEPTION 'Change type must be revision, issue or amendment.' USING ERRCODE = '22023';
  END IF;
  IF d.status = 'obsolete' AND NOT public.app_mgmt_doc_is_approver() THEN
    RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can revise a withdrawn document.'
      USING ERRCODE = '42501';
  END IF;
  IF d.status = 'active' AND NOT public.app_mgmt_doc_is_approver()
     AND d.prepared_by_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the author, the Laboratory Director or the Quality Manager can start a change to an approved document.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.management_document_versions (
    document_id, doc_number, title, doc_type, status,
    revision_no, revision_date, issue_no, issue_date, amendment_no, amendment_date,
    prepared_by, reviewed_by, approved_by, owner_name, remark, file_path,
    change_type, changed_at, changed_by,
    prepared_by_id, prepared_at, reviewed_by_id, reviewed_at, approved_by_id, approved_at,
    draft_content, version_label
  ) VALUES (
    d.id, d.doc_number, d.title, d.doc_type, d.status,
    d.revision_no, d.revision_date, d.issue_no, d.issue_date, d.amendment_no, d.amendment_date,
    d.prepared_by, d.reviewed_by, d.approved_by, d.owner_name, d.remark, d.file_path,
    v_type, now(), auth.uid(),
    d.prepared_by_id, d.prepared_at, d.reviewed_by_id, d.reviewed_at, d.approved_by_id, d.approved_at,
    d.draft_content, public.app_mgmt_doc_version_label(d.revision_no, d.issue_no, d.amendment_no)
  );

  UPDATE public.management_documents
     SET revision_no = CASE WHEN v_type = 'revision' THEN public.app_mgmt_doc_next_no(revision_no) ELSE revision_no END,
         revision_date = CASE WHEN v_type = 'revision' THEN current_date ELSE revision_date END,
         issue_no = CASE WHEN v_type = 'revision' THEN '00'
                         WHEN v_type = 'issue' THEN public.app_mgmt_doc_next_no(issue_no)
                         ELSE issue_no END,
         issue_date = CASE WHEN v_type = 'revision' THEN NULL
                           WHEN v_type = 'issue' THEN current_date
                           ELSE issue_date END,
         amendment_no = CASE WHEN v_type = 'revision' THEN '00'
                             WHEN v_type = 'amendment' THEN public.app_mgmt_doc_next_no(amendment_no)
                             ELSE amendment_no END,
         amendment_date = CASE WHEN v_type = 'revision' THEN NULL
                               WHEN v_type = 'amendment' THEN current_date
                               ELSE amendment_date END,
         file_path = CASE WHEN v_type = 'revision' THEN NULL ELSE file_path END,
         status = 'draft',
         prepared_by = NULL, reviewed_by = NULL, approved_by = NULL,
         prepared_by_id = NULL, prepared_at = NULL,
         reviewed_by_id = NULL, reviewed_at = NULL, review_comment = NULL,
         approved_by_id = NULL, approved_at = NULL, approval_comment = NULL,
         next_review_due = NULL,
         last_periodic_review_at = NULL, last_periodic_review_by = NULL, last_periodic_review_note = NULL,
         obsoleted_at = NULL, obsoleted_by = NULL
   WHERE id = p_id
  RETURNING * INTO d;
  RETURN d;
END;
$$;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_periodic_review(uuid, text, date);
CREATE FUNCTION public.app_mgmt_doc_periodic_review(p_id uuid, p_note text, p_next_due date DEFAULT NULL)
RETURNS public.management_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  d := public.app_mgmt_doc_lock(p_id);
  IF NOT public.app_mgmt_doc_is_approver() THEN
    RAISE EXCEPTION 'Only the Laboratory Director or Quality Manager can record a periodic review.'
      USING ERRCODE = '42501';
  END IF;
  IF d.status <> 'active' THEN
    RAISE EXCEPTION 'Only an Active document is reviewed periodically.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Record the outcome of the review (e.g. "Reviewed, no change needed").' USING ERRCODE = '22023';
  END IF;
  IF p_next_due IS NOT NULL AND p_next_due <= current_date THEN
    RAISE EXCEPTION 'The next review date must be in the future.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.management_documents
     SET last_periodic_review_at = now(),
         last_periodic_review_by = auth.uid(),
         last_periodic_review_note = v_note,
         next_review_due = coalesce(p_next_due, (current_date + make_interval(months => review_period_months))::date)
   WHERE id = p_id
  RETURNING * INTO d;
  RETURN d;
END;
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.app_mgmt_doc_submit(uuid)',
    'public.app_mgmt_doc_review(uuid,boolean,text)',
    'public.app_mgmt_doc_approve(uuid,boolean,text,date)',
    'public.app_mgmt_doc_start_change(uuid,text)',
    'public.app_mgmt_doc_periodic_review(uuid,text,date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Read acknowledgements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.management_document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.management_documents (id) ON DELETE CASCADE,
  version text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_name text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT management_document_acknowledgements_version_check CHECK (btrim(version) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS management_document_acknowledgements_unique
  ON public.management_document_acknowledgements (document_id, version, user_id);
CREATE INDEX IF NOT EXISTS idx_management_document_acknowledgements_user
  ON public.management_document_acknowledgements (user_id, acknowledged_at DESC);

-- The signed-in person acknowledges the CURRENT version of an Active document.
CREATE OR REPLACE FUNCTION public.management_document_acknowledgements_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  d record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status, revision_no, issue_no, amendment_no INTO d
    FROM public.management_documents
   WHERE id = NEW.document_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;
  IF d.status <> 'active' THEN
    RAISE EXCEPTION 'Only an Active document can be acknowledged.' USING ERRCODE = '22023';
  END IF;
  NEW.user_id := auth.uid();
  NEW.acknowledged_at := now();
  NEW.version := public.app_mgmt_doc_version_label(d.revision_no, d.issue_no, d.amendment_no);
  NEW.user_name := coalesce(public.app_mgmt_doc_user_name(auth.uid()), NEW.user_name);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.management_document_acknowledgements_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_management_document_acknowledgements_before_insert
  ON public.management_document_acknowledgements;
CREATE TRIGGER trg_management_document_acknowledgements_before_insert
  BEFORE INSERT ON public.management_document_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.management_document_acknowledgements_before_insert();

ALTER TABLE public.management_document_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS management_document_acknowledgements_select ON public.management_document_acknowledgements;
CREATE POLICY management_document_acknowledgements_select ON public.management_document_acknowledgements
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS management_document_acknowledgements_insert ON public.management_document_acknowledgements;
CREATE POLICY management_document_acknowledgements_insert ON public.management_document_acknowledgements
  FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff() AND user_id = auth.uid());
DROP POLICY IF EXISTS management_document_acknowledgements_delete ON public.management_document_acknowledgements;
CREATE POLICY management_document_acknowledgements_delete ON public.management_document_acknowledgements
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

REVOKE ALL ON public.management_document_acknowledgements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.management_document_acknowledgements TO authenticated;
GRANT ALL ON public.management_document_acknowledgements TO service_role;

DROP FUNCTION IF EXISTS public.app_mgmt_doc_acknowledge(uuid);
CREATE FUNCTION public.app_mgmt_doc_acknowledge(p_id uuid)
RETURNS public.management_document_acknowledgements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.management_documents%ROWTYPE;
  a public.management_document_acknowledgements%ROWTYPE;
  v_version text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.management_documents WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;
  v_version := public.app_mgmt_doc_version_label(d.revision_no, d.issue_no, d.amendment_no);
  INSERT INTO public.management_document_acknowledgements (document_id, version, user_id)
  VALUES (p_id, v_version, auth.uid())
  ON CONFLICT (document_id, version, user_id) DO NOTHING;
  SELECT * INTO a FROM public.management_document_acknowledgements
   WHERE document_id = p_id AND version = v_version AND user_id = auth.uid();
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_acknowledge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_acknowledge(uuid) TO authenticated, service_role;

-- Active documents distributed to the caller, with the acknowledgement of the
-- current version (NULL = still to read). SECURITY INVOKER: the caller's RLS.
DROP FUNCTION IF EXISTS public.app_mgmt_doc_reading_list();
CREATE FUNCTION public.app_mgmt_doc_reading_list()
RETURNS TABLE (
  document_id uuid,
  level smallint,
  doc_number text,
  title text,
  doc_type text,
  version text,
  issue_date date,
  approved_at timestamptz,
  approved_by text,
  file_path text,
  distribute_to_all boolean,
  acknowledged_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.level, d.doc_number, d.title, d.doc_type,
         public.app_mgmt_doc_version_label(d.revision_no, d.issue_no, d.amendment_no),
         d.issue_date, d.approved_at, d.approved_by, d.file_path, d.distribute_to_all,
         a.acknowledged_at
  FROM public.management_documents d
  LEFT JOIN public.management_document_acknowledgements a
    ON a.document_id = d.id
   AND a.user_id = auth.uid()
   AND a.version = public.app_mgmt_doc_version_label(d.revision_no, d.issue_no, d.amendment_no)
  WHERE auth.uid() IS NOT NULL
    AND d.deleted_at IS NULL
    AND d.status = 'active'
    AND (d.distribute_to_all OR auth.uid() = ANY (d.distribution_user_ids))
  ORDER BY (a.acknowledged_at IS NOT NULL), d.level, d.doc_number
$$;

REVOKE ALL ON FUNCTION public.app_mgmt_doc_reading_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mgmt_doc_reading_list() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Records retention schedule (8.4.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.record_retention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text,
  record_type text NOT NULL,
  clause text,
  -- Optional link to a LIMS table for the "past retention" count.
  table_name text,
  date_column text,
  filter_column text,
  filter_values text[],
  retention_years numeric(5,2) NOT NULL,
  retention_starts text NOT NULL DEFAULT 'Date of the record',
  legal_basis text,
  disposal_method text,
  owner text,
  remarks text,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_retention_rules_type_check CHECK (btrim(record_type) <> ''),
  CONSTRAINT record_retention_rules_years_check CHECK (retention_years > 0 AND retention_years <= 100),
  CONSTRAINT record_retention_rules_ident_check CHECK (
    (table_name IS NULL OR table_name ~ '^[a-z_][a-z0-9_]{0,62}$')
    AND (date_column IS NULL OR date_column ~ '^[a-z_][a-z0-9_]{0,62}$')
    AND (filter_column IS NULL OR filter_column ~ '^[a-z_][a-z0-9_]{0,62}$')
  ),
  CONSTRAINT record_retention_rules_link_check CHECK (
    (table_name IS NULL AND date_column IS NULL AND filter_column IS NULL)
    OR (table_name IS NOT NULL AND date_column IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS record_retention_rules_rule_key_key
  ON public.record_retention_rules (rule_key);
CREATE UNIQUE INDEX IF NOT EXISTS record_retention_rules_type_ci_key
  ON public.record_retention_rules (lower(btrim(record_type)));

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_record_retention_rules_updated_at ON public.record_retention_rules;
  CREATE TRIGGER trg_record_retention_rules_updated_at
    BEFORE UPDATE ON public.record_retention_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
END $$;

-- Defaults for a NABL-accredited testing and calibration laboratory. Re-runs
-- never overwrite a rule the lab has edited (ON CONFLICT DO NOTHING).
-- NABL expects records to be kept for at least one full accreditation cycle;
-- 6 years covers the current and the previous cycle with margin. Keep longer
-- where a customer contract, BIS licence or regulator asks for it.
INSERT INTO public.record_retention_rules AS r
  (rule_key, sort_order, record_type, clause, table_name, date_column, filter_column, filter_values,
   retention_years, retention_starts, legal_basis, disposal_method, owner)
VALUES
  ('test_reports', 10, 'Issued test reports (archived copies)', '7.8, 8.4',
   'issued_report_archive', 'issued_at', NULL, NULL, 6, 'Date of issue',
   'ISO/IEC 17025 8.4.2; NABL: at least one full accreditation cycle; longer if the customer, BIS licence or a regulator requires',
   'Electronic: delete after Quality Manager approval, recorded in the disposal register. Paper: shred.',
   'Quality Manager'),
  ('test_raw_data', 20, 'Test raw data, observations and results', '7.5, 8.4',
   'test_allocation_parameters', 'created_at', NULL, NULL, 6, 'Date the test was recorded',
   'ISO/IEC 17025 7.5.1, 8.4.2; NABL: at least one full accreditation cycle',
   'Electronic: delete after Quality Manager approval, recorded in the disposal register. Paper: shred.',
   'Technical Manager'),
  ('sample_receipt', 30, 'Sample receipt, SRF and contract review records', '7.1, 7.4',
   'samples', 'date_of_sample_receiving', NULL, NULL, 6, 'Date of sample receipt',
   'ISO/IEC 17025 7.1.8, 7.4, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Sample In-charge'),
  ('calibration_certificates', 40, 'Issued calibration certificates', '7.8, 8.4',
   'calibration_jobs', 'stage_entered_at', 'stage', ARRAY['certificates'], 6, 'Date of issue',
   'ISO/IEC 17025 7.8.4, 8.4.2; NABL: at least one full accreditation cycle',
   'Electronic: delete after Quality Manager approval, recorded in the disposal register. Paper: shred.',
   'Quality Manager'),
  ('calibration_raw_data', 50, 'Calibration raw data sheets and uncertainty calculations', '7.5, 7.6',
   'calibration_raw_data_sheets', 'created_at', NULL, NULL, 6, 'Date of calibration',
   'ISO/IEC 17025 7.5.1, 7.6, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Technical Manager (Calibration)'),
  ('calibration_requests', 60, 'Calibration service requests and contract review', '7.1',
   'calibration_service_requests', 'srf_date', NULL, NULL, 6, 'Date of request',
   'ISO/IEC 17025 7.1.8, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Quality Manager'),
  ('equipment_records', 70, 'Equipment records (history card, maintenance, intermediate checks)', '6.4.13',
   'equipment_master', 'updated_at', 'equipment_status', ARRAY['Scrapped', 'Condemned', 'Disposed', 'Retired'], 6,
   'Disposal / scrapping of the equipment (life of equipment + 6 years)',
   'ISO/IEC 17025 6.4.13, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Technical Manager'),
  ('equipment_calibration_certs', 80, 'Calibration certificates of laboratory equipment (received)', '6.4.13 e, 6.5',
   'equipment_calibration_history', 'calibrated_on', NULL, NULL, 6, 'Date of calibration (keep the latest one for the life of the equipment)',
   'ISO/IEC 17025 6.4.13, 6.5, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Technical Manager'),
  ('equipment_breakdowns', 90, 'Equipment breakdown and repair records', '6.4.9, 6.4.13',
   'equipment_breakdown_register', 'breakdown_date', NULL, NULL, 6, 'Date of breakdown',
   'ISO/IEC 17025 6.4.9, 6.4.13 g, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Technical Manager'),
  ('personnel_records', 100, 'Personnel records (qualification, training, competence, authorisation, monitoring)', '6.2.5',
   'user_profiles', 'updated_at', 'status', ARRAY['Inactive', 'inactive'], 6,
   'End of employment (employment + 6 years)',
   'ISO/IEC 17025 6.2.5, 8.4.2; employment law where longer',
   'Return or shred personal files; delete electronic copies after HR and Quality Manager approval.',
   'Quality Manager / HR'),
  ('personnel_declarations', 110, 'Confidentiality and impartiality declarations', '4.1, 4.2',
   'personnel_declarations', 'signed_at', NULL, NULL, 6, 'Date signed (keep the latest one for the period of employment)',
   'ISO/IEC 17025 4.1, 4.2, 8.4.2',
   'Shred / delete after Quality Manager approval.',
   'Quality Manager'),
  ('environment_records', 120, 'Environmental monitoring records', '6.3',
   'environment_readings', 'recorded_at', NULL, NULL, 6, 'Date of reading',
   'ISO/IEC 17025 6.3.3, 8.4.2',
   'Electronic: delete after Quality Manager approval. Paper: shred.',
   'Technical Manager'),
  ('validity_checks', 130, 'Ensuring validity of results (IQC, replicate, intermediate checks)', '7.7.1',
   'result_validity_checks', 'check_date', NULL, NULL, 6, 'Date of check',
   'ISO/IEC 17025 7.7.1, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('pt_ilc', 140, 'Proficiency testing and inter-laboratory comparison records', '7.7.2',
   'pt_participations', 'created_at', NULL, NULL, 6, 'Date of participation',
   'ISO/IEC 17025 7.7.2, 8.4.2; NABL PT policy (participation over each accreditation cycle)',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('method_validation', 150, 'Method verification and validation records', '7.2',
   'method_verifications', 'created_at', NULL, NULL, 6, 'Method withdrawn from use (keep while the method is in use + 6 years)',
   'ISO/IEC 17025 7.2.1.5, 7.2.2.4, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Technical Manager'),
  ('nonconforming_work', 160, 'Nonconforming work and corrective action records', '7.10, 8.7',
   'nc_work_records', 'detected_at', NULL, NULL, 6, 'Date detected',
   'ISO/IEC 17025 7.10.2, 8.7.3, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('complaints', 170, 'Complaints', '7.9',
   'customer_complaints', 'received_at', NULL, NULL, 6, 'Date received',
   'ISO/IEC 17025 7.9, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('customer_feedback', 180, 'Customer feedback', '8.6',
   'customer_feedback', 'received_at', NULL, NULL, 6, 'Date received',
   'ISO/IEC 17025 8.6.2, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('internal_audits', 190, 'Internal audit records', '8.8',
   'audit_plans', 'proposed_to', NULL, NULL, 6, 'Date of audit',
   'ISO/IEC 17025 8.8.2 f, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('management_reviews', 200, 'Management review records', '8.9',
   'mrm_plans', 'planned_to', NULL, NULL, 6, 'Date of review',
   'ISO/IEC 17025 8.9.3, 8.4.2',
   'Electronic: delete after Laboratory Director approval.',
   'Quality Manager'),
  ('obsolete_documents', 210, 'Obsolete controlled documents (one archived copy)', '8.3',
   'management_documents', 'obsoleted_at', NULL, NULL, 6, 'Date withdrawn',
   'ISO/IEC 17025 8.3.2 e, f; keep at least one cycle after withdrawal',
   'Keep one archived copy marked OBSOLETE; destroy other copies on withdrawal.',
   'Quality Manager'),
  ('quotations', 220, 'Quotations and tenders', '7.1',
   'quotations', 'quotation_date', NULL, NULL, 8, 'Date of quotation',
   'Companies Act 2013 s.128(5) (books of account and supporting papers: 8 years)',
   'Delete after Accounts and Laboratory Director approval.',
   'Accounts'),
  ('financial_records', 230, 'Invoices and sale documents', '-',
   'sale_documents', 'document_date', NULL, NULL, 8, 'End of the financial year of the document',
   'Companies Act 2013 s.128(5): 8 years; CGST Act 2017 s.36: 72 months from the annual return due date',
   'Delete after Accounts and Laboratory Director approval.',
   'Accounts'),
  ('audit_trail', 240, 'Electronic audit trail of LIMS records', '7.5.2, 7.11',
   'audit_log', 'at', NULL, NULL, 8, 'Date of change (keep at least as long as the records it covers)',
   'ISO/IEC 17025 7.5.2, 7.11.3, 8.4.2',
   'Never deleted from the LIMS; purge only by deliberate database action approved by the Laboratory Director.',
   'Laboratory Director'),
  ('lims_validation', 250, 'LIMS validation, change control and backup / restore tests', '7.11',
   'validation_test_runs', 'executed_at', NULL, NULL, 6, 'Date of the test (keep while that software version is in use + 6 years)',
   'ISO/IEC 17025 7.11.2, 8.4.2',
   'Electronic: delete after Quality Manager approval.',
   'Quality Manager'),
  ('external_providers', 260, 'External provider evaluation and purchase records', '6.6',
   NULL, NULL, NULL, NULL, 6, 'Date of evaluation / purchase',
   'ISO/IEC 17025 6.6.2, 8.4.2',
   'Paper: shred after Quality Manager approval.',
   'Store / Purchase'),
  ('retained_samples_register', 270, 'Retained sample and disposal register', '7.4',
   NULL, NULL, NULL, NULL, 6, 'Date of disposal of the sample',
   'ISO/IEC 17025 7.4.1, 8.4.2 (physical test items are kept for the period agreed with the customer)',
   'Paper register: shred after Quality Manager approval.',
   'Sample In-charge')
ON CONFLICT (rule_key) DO NOTHING;

-- Who may maintain the schedule.
ALTER TABLE public.record_retention_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS record_retention_rules_select ON public.record_retention_rules;
CREATE POLICY record_retention_rules_select ON public.record_retention_rules
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS record_retention_rules_insert ON public.record_retention_rules;
CREATE POLICY record_retention_rules_insert ON public.record_retention_rules
  FOR INSERT TO authenticated WITH CHECK (public.app_mgmt_doc_is_approver());
DROP POLICY IF EXISTS record_retention_rules_update ON public.record_retention_rules;
CREATE POLICY record_retention_rules_update ON public.record_retention_rules
  FOR UPDATE TO authenticated
  USING (public.app_mgmt_doc_is_approver())
  WITH CHECK (public.app_mgmt_doc_is_approver());
DROP POLICY IF EXISTS record_retention_rules_delete ON public.record_retention_rules;
CREATE POLICY record_retention_rules_delete ON public.record_retention_rules
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

REVOKE ALL ON public.record_retention_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_retention_rules TO authenticated;
GRANT ALL ON public.record_retention_rules TO service_role;

-- Per rule: how many records in the linked table are past retention.
-- COUNT ONLY. Identifiers are checked against the catalog and quoted with %I;
-- filter values are bound parameters. Soft-deleted rows are counted too
-- (they are still held). Nothing is deleted.
DROP FUNCTION IF EXISTS public.app_retention_past_due_counts();
CREATE FUNCTION public.app_retention_past_due_counts()
RETURNS TABLE (
  rule_id uuid,
  tracked boolean,
  total_count bigint,
  past_retention_count bigint,
  oldest_record date,
  cutoff date,
  note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
DECLARE
  r public.record_retention_rules%ROWTYPE;
  v_rel regclass;
  v_type text;
  v_cutoff timestamptz;
  v_sql text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM public.record_retention_rules WHERE active ORDER BY sort_order, record_type LOOP
    rule_id := r.id;
    tracked := false;
    total_count := NULL;
    past_retention_count := NULL;
    oldest_record := NULL;
    v_cutoff := now() - make_interval(months => round(r.retention_years * 12)::int);
    cutoff := v_cutoff::date;
    note := NULL;

    IF r.table_name IS NULL THEN
      note := 'Not held in the LIMS (paper or external records).';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_rel := to_regclass(format('public.%I', r.table_name));
    IF v_rel IS NULL THEN
      note := format('Table %s is not on this database.', r.table_name);
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
      FROM pg_attribute a
     WHERE a.attrelid = v_rel AND a.attname = r.date_column AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_type IS NULL OR v_type NOT IN ('date', 'timestamp with time zone', 'timestamp without time zone') THEN
      note := format('Column %s.%s is missing or is not a date.', r.table_name, r.date_column);
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF r.filter_column IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = v_rel AND a.attname = r.filter_column AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      note := format('Column %s.%s is missing.', r.table_name, r.filter_column);
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_sql := format(
      'SELECT count(*), count(*) FILTER (WHERE %1$I < $1), min(%1$I)::date FROM public.%2$I WHERE %1$I IS NOT NULL',
      r.date_column, r.table_name);
    IF r.filter_column IS NOT NULL THEN
      v_sql := v_sql || format(' AND %I::text = ANY ($2)', r.filter_column);
    END IF;

    BEGIN
      EXECUTE v_sql INTO total_count, past_retention_count, oldest_record
        USING v_cutoff, coalesce(r.filter_values, ARRAY[]::text[]);
      tracked := true;
    EXCEPTION WHEN OTHERS THEN
      note := 'Could not count: ' || SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.app_retention_past_due_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_retention_past_due_counts() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Outer gate (same as every other public table) and audit trail
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['management_document_acknowledgements', 'record_retention_rules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: document control tables are not audited yet';
    RETURN;
  END IF;
  -- management_documents / management_document_versions are already audited
  -- (20261024100000).
  FOREACH rel IN ARRAY ARRAY['management_document_acknowledgements', 'record_retention_rules'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
