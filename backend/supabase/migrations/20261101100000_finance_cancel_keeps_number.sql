-- Finance: a cancelled document keeps its number; SAC 9983 for lab services.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261030100000_finance_sale_books.sql (and the rest of finance
-- Phase 2), while the lab is idle. Safe to re-run.
--
-- Lab decision (Amit, 23 Oct 2026), GST practice: a number once given to a
-- proforma, tax invoice, credit note or payment receipt is never reused and
-- never disappears without trace. A wrong document is CANCELLED, not deleted.
--
-- How it behaves
--   * Delete becomes Cancel. BEFORE DELETE trigger zzz_finance_cancel_keeps_number
--     on finance_proforma_invoices, finance_tax_invoices, finance_credit_notes
--     and transactions (rows with a receipt_number). For a signed-in user it
--     runs UPDATE ... SET <status> = 'cancelled',
--       extra = extra || {ui_status: 'Cancelled', cancelled_at, cancelled_by,
--                         status_before_cancel}
--     and returns NULL, so the row (and its number) stays. PostgREST DELETE
--     succeeds and reports 0 rows, like the soft-delete trigger
--     (20261025100000). Lines are not touched: they stay with their cancelled
--     header. The cancel is an UPDATE in audit_log, so the reason is added with
--     app_annotate_audit(table, id, reason) right after (the screens do this).
--     Deleting an already cancelled document is a no-op.
--   * Still physical: transactions without a receipt number (nothing was
--     numbered), line rows (the screens replace lines on every save), and
--     deletes without a signed-in user (service_role / psql / Railway console
--     purge). Every header carries a NOT NULL number, so there is no
--     "unnumbered draft" header to remove.
--   * Cancel from the screens. The finance pages cancel with an UPDATE that
--     sets the status to cancelled and extra.cancelled_at (+ cancel_reason).
--     Trigger zzz_finance_cancel_guard (BEFORE UPDATE) stamps cancelled_at /
--     cancelled_by / ui_status from the server, and refuses any later change
--     to a cancelled document by the app (authenticated / anon), including
--     its lines (zzz_finance_cancel_lines_guard). Issue a new document (or a
--     credit note) instead.
--   * Numbering. document_series_highest_serial (20261030100300) reads the
--     typed tables without a status filter, so cancelled documents keep
--     counting and next_document_number never hands their number out again.
--   * Balances. Cancelled documents have the database status 'cancelled';
--     the client balance (clientSaleBalance.ts) already skips them.
--
-- Quotations / sale_documents. Both are under soft delete (20261025100000):
-- a deleted row keeps its number in the Recycle Bin. So that a cancelled
-- quotation stays visible with a "Cancelled" state instead of disappearing,
-- quotations.status also accepts 'Cancelled' (the Quotation page cancels by
-- setting it). sale_documents.status is free text already (legacy store, only
-- used before Phase 2).
--
-- SAC for the lab's testing and calibration services is 9983 (Amit,
-- 23 Oct 2026). A new Service in products_services_master without an HSN/SAC
-- gets 9983 (trigger, INSERT only: saved values are never overwritten).
-- Goods keep their own HSN (e.g. 9027).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('public.finance_tax_invoices') IS NULL
     OR to_regclass('public.finance_proforma_invoices') IS NULL
     OR to_regclass('public.finance_credit_notes') IS NULL
     OR to_regclass('public.transactions') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261030100000_finance_sale_books.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. BEFORE DELETE: cancel instead of delete. TG_ARGV[0] = status column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finance_cancel_instead_of_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status_col text := TG_ARGV[0];
  v_old jsonb := to_jsonb(OLD);
  v_extra jsonb := coalesce(to_jsonb(OLD) -> 'extra', '{}'::jsonb);
BEGIN
  -- service_role / psql / Railway console: deliberate physical purge.
  IF v_uid IS NULL THEN
    RETURN OLD;
  END IF;

  -- Money book rows without a number (payments made, later phases).
  IF TG_TABLE_NAME = 'transactions' AND nullif(btrim(coalesce(v_old ->> 'receipt_number', '')), '') IS NULL THEN
    RETURN OLD;
  END IF;

  -- Already cancelled: nothing to do, the row stays.
  IF v_old ->> v_status_col = 'cancelled' AND v_extra ? 'cancelled_at' THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %I = ''cancelled'', extra = coalesce(extra, ''{}''::jsonb) || $1 WHERE id = $2',
    TG_TABLE_NAME, v_status_col)
  USING jsonb_build_object(
          'ui_status', 'Cancelled',
          'cancelled_at', now(),
          'cancelled_by', v_uid,
          'status_before_cancel', coalesce(v_extra -> 'ui_status', to_jsonb(v_old ->> v_status_col))
        ),
        OLD.id;

  -- Cancel the physical delete. PostgREST reports 0 deleted rows, no error.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_cancel_instead_of_delete() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. BEFORE UPDATE (invoker): a cancel from the screens is stamped by the
--    server; a cancelled document is read-only for the app.
--    TG_ARGV[0] = status column. Callers running as authenticated or anon are
--    "the app"; SECURITY DEFINER code (the trigger above) and service_role are
--    not restricted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finance_cancel_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status_col text := TG_ARGV[0];
  v_old_extra jsonb := coalesce(OLD.extra, '{}'::jsonb);
  v_new_extra jsonb := coalesce(NEW.extra, '{}'::jsonb);
  v_number text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF v_old_extra ? 'cancelled_at' THEN
    v_number := coalesce(
      to_jsonb(OLD) ->> 'proforma_number', to_jsonb(OLD) ->> 'tax_invoice_number',
      to_jsonb(OLD) ->> 'credit_note_number', to_jsonb(OLD) ->> 'receipt_number', '');
    RAISE EXCEPTION '% is cancelled and cannot be changed', nullif(v_number, '')
      USING ERRCODE = '42501',
            HINT = 'A cancelled finance document keeps its number. Issue a new document (or a credit note) instead.';
  END IF;

  IF v_new_extra ? 'cancelled_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      v_status_col, 'cancelled',
      'extra', v_new_extra || jsonb_build_object(
        'ui_status', 'Cancelled',
        'cancelled_at', now(),
        'cancelled_by', auth.uid(),
        'status_before_cancel', coalesce(v_old_extra -> 'ui_status', to_jsonb(to_jsonb(OLD) ->> v_status_col))
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_cancel_guard() FROM PUBLIC, anon, authenticated;

-- Lines of a cancelled document stay as they were. TG_ARGV[0] = parent table,
-- TG_ARGV[1] = parent FK column.
CREATE OR REPLACE FUNCTION public.finance_cancel_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent text;
  v_cancelled boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  FOR v_parent IN
    SELECT DISTINCT p FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ->> TG_ARGV[1] END,
      CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ->> TG_ARGV[1] END
    ]) AS p WHERE p IS NOT NULL
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I h WHERE h.id = $1::uuid AND coalesce(h.extra, ''{}''::jsonb) ? ''cancelled_at'')', TG_ARGV[0])
      INTO v_cancelled
      USING v_parent;
    IF v_cancelled THEN
      RAISE EXCEPTION 'The document is cancelled; its lines cannot be changed'
        USING ERRCODE = '42501',
              HINT = 'A cancelled finance document keeps its number and lines. Issue a new document instead.';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_cancel_lines_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Attach. zzz_ so they fire after any other BEFORE trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  b record;
BEGIN
  FOR b IN
    SELECT * FROM (VALUES
      ('finance_proforma_invoices', 'proforma_status', 'finance_proforma_invoice_lines', 'proforma_invoice_id'),
      ('finance_tax_invoices', 'tax_status', 'finance_tax_invoice_lines', 'tax_invoice_id'),
      ('finance_credit_notes', 'credit_note_status', 'finance_credit_note_lines', 'credit_note_id'),
      ('transactions', 'status', NULL, NULL)
    ) AS v(tbl, status_col, lines_tbl, parent_fk)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_finance_cancel_keeps_number ON public.%I', b.tbl);
    EXECUTE format(
      'CREATE TRIGGER zzz_finance_cancel_keeps_number BEFORE DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.finance_cancel_instead_of_delete(%L)',
      b.tbl, b.status_col);

    EXECUTE format('DROP TRIGGER IF EXISTS zzz_finance_cancel_guard ON public.%I', b.tbl);
    EXECUTE format(
      'CREATE TRIGGER zzz_finance_cancel_guard BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.finance_cancel_guard(%L)',
      b.tbl, b.status_col);

    IF b.lines_tbl IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zzz_finance_cancel_lines_guard ON public.%I', b.lines_tbl);
      EXECUTE format(
        'CREATE TRIGGER zzz_finance_cancel_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.finance_cancel_lines_guard(%L, %L)',
        b.lines_tbl, b.tbl, b.parent_fk);
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.finance_cancel_instead_of_delete() IS
  'BEFORE DELETE on the numbered finance books: a signed-in delete cancels the document (number kept). See 20261101100000.';

-- ---------------------------------------------------------------------------
-- 4. Quotations: 'Cancelled' is a status (the row stays visible).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.quotations') IS NOT NULL THEN
    ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_status_check
      CHECK (status = ANY (ARRAY[
        'Draft'::text, 'Sent'::text, 'Finalized'::text, 'Proforma'::text, 'Invoice'::text,
        'Accepted'::text, 'Rejected'::text, 'Expired'::text, 'Converted'::text, 'Cancelled'::text
      ]));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. SAC 9983 for a new Service without HSN/SAC (INSERT only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.products_services_default_sac()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.item_type = 'Service' AND nullif(btrim(coalesce(NEW.hsn_code, '')), '') IS NULL THEN
    NEW.hsn_code := '9983';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.products_services_default_sac() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.products_services_master') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS products_services_default_sac ON public.products_services_master;
    CREATE TRIGGER products_services_default_sac
      BEFORE INSERT ON public.products_services_master
      FOR EACH ROW EXECUTE FUNCTION public.products_services_default_sac();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
