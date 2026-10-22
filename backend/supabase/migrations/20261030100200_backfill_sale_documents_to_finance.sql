-- Finance port, Phase 2c: copy sale_documents into the typed sale books.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261030100000 and 20261030100100, while the lab is idle and only
-- after every finance user has opened Proforma Invoice, Invoice, Credit Note
-- and Payment Receipt once on each PC/browser they used (so their browser
-- records reach sale_documents). Safe to re-run.
--
-- What it does (mapping: backend/scripts/finance-phase2-mapping.md)
--   * Each live sale_documents row is copied once, keeping its id, number,
--     date, client and totals:
--       proformaInvoice → finance_proforma_invoices (+ lines)
--       invoice         → finance_tax_invoices      (+ lines)
--       creditNote      → finance_credit_notes      (+ lines)
--       paymentReceipt  → transactions (payment_flow 'in')
--   * Status: Rejected / Expired → cancelled; Finalized / Accepted /
--     Converted → accepted; anything else → pending. extra.ui_status keeps
--     the exact label (Draft, Sent, Proforma, Invoice, ...). Receipts:
--     cancelled when Rejected / Expired, otherwise completed.
--   * Payment method (receipts keep it in payload.reference_no): Bank → bank,
--     Cash → cash, UPI → upi, Cheque → cheque, Other → other; blank or
--     unknown → bank (what the screen showed).
--   * payload.line_items[] become line rows (new line ids; the old id is kept
--     in extra.legacy_line_id). line_subtotal = amount less the line
--     discount; line_tax and line_total are computed from gst_percent.
--   * Charges go to extra.charges; contact, address, GSTIN, reference,
--     remarks and signature image to extra; subject → scope_of_work,
--     payment terms → terms_and_conditions, signature text → seal_and_sign;
--     the whole payload to extra.legacy_payload.
--   * gst_supply_mode from the lab GSTIN/state and the client's GSTIN
--     (document snapshot first, then the client record) or state name.
--   * Credit notes and receipts get invoice_id when their invoice reference
--     matches an invoice number (case-insensitive).
--   * A client_id that no longer exists becomes NULL (the name is kept).
--   * A number already used by a different typed row gets "-LEGACY"
--     (extra.legacy_number keeps the original).
--
-- Re-running
--   finance_backfill_log remembers every copied sale_documents id, so a
--   re-run copies only rows that arrived since (late browser uploads) and
--   never brings back a typed row that was deleted afterwards. Run it again
--   with:   SELECT * FROM public.finance_backfill_sale_documents();
--   Soft-deleted sale_documents rows (Recycle Bin) are skipped and not
--   logged, so a restored row is copied by the next run. Later edits to an
--   already copied sale_documents row are NOT carried over.
--   sale_documents itself is left in place, unchanged.
--
-- Rollback: DELETE the typed rows whose id is in finance_backfill_log, then
-- TRUNCATE finance_backfill_log.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '300s';

DO $$
BEGIN
  IF to_regclass('public.finance_tax_invoices') IS NULL
     OR to_regprocedure('public.finance_gst_supply_mode_for(text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261030100000_finance_sale_books.sql and 20261030100100_finance_gst_supply_mode.sql first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.finance_backfill_log (
  source_id uuid PRIMARY KEY,
  document_kind text NOT NULL,
  target_table text NOT NULL,
  target_number text,
  renamed boolean NOT NULL DEFAULT false,
  copied_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_backfill_log IS
  'sale_documents rows already copied into the typed finance tables (20261030100200). Owner only.';

ALTER TABLE public.finance_backfill_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_backfill_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.finance_backfill_log TO service_role;

CREATE OR REPLACE FUNCTION public.finance_try_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN replace(btrim(p_value), ',', '')::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_try_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
    RETURN NULL;
  END IF;
  RETURN left(btrim(p_value), 10)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Unpacks payload.line_items[] into a lines table.
CREATE OR REPLACE FUNCTION public.finance_backfill_lines(
  p_lines_table text,
  p_parent_fk text,
  p_parent_id uuid,
  p_items jsonb,
  p_created_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN 0;
  END IF;
  EXECUTE format($sql$
    INSERT INTO public.%1$I (%2$I, line_no, item_description, hsn_sac, unit_of_item, qty, unit_rate,
                            line_discount_percent, gst_rate, line_subtotal, line_tax, line_total, extra,
                            created_at, updated_at)
    SELECT $1, b.line_no, b.descr, b.hsn, b.unit, b.qty, b.rate, b.disc, b.gst,
           b.sub, round(b.sub * b.gst / 100, 2), b.sub + round(b.sub * b.gst / 100, 2),
           b.extra || jsonb_build_object('gross_amount', b.gross), $2, $2
    FROM (
      SELECT a.*,
             round(a.gross * (1 - a.disc / 100), 2) AS sub
      FROM (
        SELECT
          COALESCE(round(public.finance_try_numeric(li ->> 'line_no'))::int, o::int) AS line_no,
          COALESCE(li ->> 'description', '') AS descr,
          NULLIF(btrim(li ->> 'hsn_sac'), '') AS hsn,
          COALESCE(NULLIF(btrim(li ->> 'unit'), ''), 'Nos') AS unit,
          COALESCE(public.finance_try_numeric(li ->> 'quantity'), 1) AS qty,
          COALESCE(public.finance_try_numeric(li ->> 'rate'), 0) AS rate,
          LEAST(100, GREATEST(0, COALESCE(public.finance_try_numeric(li ->> 'discount_percent'), 0))) AS disc,
          LEAST(100, GREATEST(0, COALESCE(public.finance_try_numeric(li ->> 'gst_percent'), 0))) AS gst,
          round(COALESCE(
            public.finance_try_numeric(li ->> 'amount'),
            COALESCE(public.finance_try_numeric(li ->> 'quantity'), 1) * COALESCE(public.finance_try_numeric(li ->> 'rate'), 0)
          ), 2) AS gross,
          jsonb_strip_nulls(jsonb_build_object(
            'make', NULLIF(btrim(li ->> 'make'), ''),
            'details', NULLIF(btrim(li ->> 'details'), ''),
            'item_code', NULLIF(btrim(li ->> 'item_code'), ''),
            'line_remarks', NULLIF(btrim(li ->> 'line_remarks'), ''),
            'delivery_period', NULLIF(btrim(li ->> 'delivery_period'), ''),
            'legacy_line_id', NULLIF(li ->> 'id', '')
          )) AS extra
        FROM jsonb_array_elements($3) WITH ORDINALITY AS e(li, o)
        WHERE jsonb_typeof(li) = 'object'
      ) a
    ) b
  $sql$, p_lines_table, p_parent_fk)
  USING p_parent_id, p_created_at, p_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_backfill_sale_documents()
RETURNS TABLE (document_kind text, copied integer, renamed integer, skipped integer)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  s record;
  p jsonb;
  v_kinds constant text[] := ARRAY['proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt'];
  v_copied integer[] := ARRAY[0, 0, 0, 0];
  v_renamed integer[] := ARRAY[0, 0, 0, 0];
  v_skipped integer[] := ARRAY[0, 0, 0, 0];
  v_i integer;
  v_table text;
  v_number_col text;
  v_number text;
  v_is_renamed boolean;
  v_exists boolean;
  v_ui text;
  v_db text;
  v_client uuid;
  v_client_name text;
  v_client_gstin text;
  v_client_state text;
  v_mode text;
  v_extra jsonb;
  v_ref text;
  v_invoice uuid;
  v_method text;
  v_pay text;
  v_items jsonb;
  v_rows integer;
BEGIN
  IF to_regclass('public.sale_documents') IS NULL THEN
    RETURN;
  END IF;

  FOR s IN
    SELECT sd.*, to_jsonb(sd) ->> 'deleted_at' AS deleted_marker
      FROM public.sale_documents sd
     WHERE NOT EXISTS (SELECT 1 FROM public.finance_backfill_log l WHERE l.source_id = sd.id)
     ORDER BY array_position(v_kinds, sd.document_kind), sd.document_date, sd.created_at, sd.id
  LOOP
    v_i := array_position(v_kinds, s.document_kind);
    CONTINUE WHEN v_i IS NULL;
    IF s.deleted_marker IS NOT NULL THEN
      v_skipped[v_i] := v_skipped[v_i] + 1;
      CONTINUE;
    END IF;

    v_table := CASE s.document_kind
      WHEN 'proformaInvoice' THEN 'finance_proforma_invoices'
      WHEN 'invoice' THEN 'finance_tax_invoices'
      WHEN 'creditNote' THEN 'finance_credit_notes'
      ELSE 'transactions' END;
    v_number_col := CASE s.document_kind
      WHEN 'proformaInvoice' THEN 'proforma_number'
      WHEN 'invoice' THEN 'tax_invoice_number'
      WHEN 'creditNote' THEN 'credit_note_number'
      ELSE 'receipt_number' END;

    -- Already there (e.g. written by the new screens with the same id).
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', v_table) INTO v_exists USING s.id;
    IF v_exists THEN
      INSERT INTO public.finance_backfill_log (source_id, document_kind, target_table, target_number)
      VALUES (s.id, s.document_kind, v_table, NULL);
      v_skipped[v_i] := v_skipped[v_i] + 1;
      CONTINUE;
    END IF;

    p := CASE WHEN jsonb_typeof(s.payload) = 'object' THEN s.payload ELSE '{}'::jsonb END;

    -- Number: keep it unless a different typed row already holds it.
    v_number := btrim(s.document_number);
    v_is_renamed := false;
    FOR attempt IN 1..3 LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE lower(btrim(%I)) = lower($1)%s)',
        v_table, v_number_col, CASE WHEN v_table = 'transactions' THEN ' AND payment_flow = ''in''' ELSE '' END)
        INTO v_exists USING v_number;
      EXIT WHEN NOT v_exists;
      v_is_renamed := true;
      v_number := CASE attempt
        WHEN 1 THEN btrim(s.document_number) || '-LEGACY'
        ELSE btrim(s.document_number) || '-LEGACY-' || left(s.id::text, 8) || CASE WHEN attempt = 3 THEN '-' || substr(md5(random()::text), 1, 4) ELSE '' END
      END;
    END LOOP;

    -- Status
    v_ui := COALESCE(NULLIF(btrim(s.status), ''), 'Draft');
    v_db := CASE
      WHEN lower(v_ui) IN ('rejected', 'expired') THEN 'cancelled'
      WHEN lower(v_ui) IN ('finalized', 'accepted', 'converted') THEN 'accepted'
      ELSE 'pending' END;

    -- Client (keep the name even when the record is gone)
    v_client := NULL;
    v_client_gstin := NULL;
    v_client_state := NULL;
    IF s.client_id IS NOT NULL THEN
      SELECT c.id, c.gst_number, c.state INTO v_client, v_client_gstin, v_client_state
        FROM public.clients c WHERE c.id = s.client_id;
    END IF;
    v_client_name := COALESCE(NULLIF(btrim(s.client_name), ''), NULLIF(btrim(p ->> 'client_name'), ''), '');
    v_mode := public.finance_gst_supply_mode_for(
      COALESCE(NULLIF(btrim(p ->> 'client_gst_number'), ''), v_client_gstin), v_client_state);

    v_extra := jsonb_strip_nulls(jsonb_build_object(
      'ui_status', v_ui,
      'client_name', NULLIF(v_client_name, ''),
      'contact_person', NULLIF(btrim(p ->> 'contact_person'), ''),
      'contact_email', NULLIF(btrim(p ->> 'contact_email'), ''),
      'contact_mobile', NULLIF(btrim(p ->> 'contact_mobile'), ''),
      'client_address', NULLIF(btrim(p ->> 'client_address'), ''),
      'client_gst_number', NULLIF(btrim(p ->> 'client_gst_number'), ''),
      'remarks', NULLIF(btrim(p ->> 'remarks'), ''),
      'signature_image_path', NULLIF(btrim(p ->> 'signature_image_path'), ''),
      'legacy_source', 'sale_documents',
      'legacy_number', CASE WHEN v_is_renamed THEN btrim(s.document_number) END,
      'backfilled_at', now()
    ));

    IF s.document_kind = 'paymentReceipt' THEN
      v_method := lower(btrim(COALESCE(NULLIF(btrim(p ->> 'payment_method'), ''), p ->> 'reference_no', '')));
      v_pay := CASE v_method
        WHEN 'bank' THEN 'bank' WHEN 'cash' THEN 'cash' WHEN 'upi' THEN 'upi'
        WHEN 'cheque' THEN 'cheque' WHEN 'other' THEN 'other' ELSE 'bank' END;
      v_ref := COALESCE(
        NULLIF(btrim(p ->> 'invoice_reference_no'), ''),
        NULLIF(btrim(p ->> 'against_invoice_no'), ''),
        NULLIF(btrim(p ->> 'invoice_number'), ''),
        CASE WHEN lower(btrim(COALESCE(p ->> 'reference_no', ''))) NOT IN ('', 'bank', 'cash', 'upi', 'cheque', 'other')
             THEN btrim(p ->> 'reference_no') END);
      v_invoice := NULL;
      IF v_ref IS NOT NULL THEN
        SELECT t.id INTO v_invoice FROM public.finance_tax_invoices t
         WHERE lower(btrim(t.tax_invoice_number)) = lower(v_ref) LIMIT 1;
      END IF;

      INSERT INTO public.transactions (
        id, payment_flow, receipt_number, txn_date, client_id, client_name, invoice_id, amount,
        currency, status, mode_of_payment, tds_percent, tds_section, tds_amount, tds_taxable_amount,
        description, notes, extra, created_by, created_at, updated_at)
      VALUES (
        s.id, 'in', v_number, s.document_date, v_client, v_client_name, v_invoice,
        GREATEST(0, COALESCE(s.grand_total, public.finance_try_numeric(p ->> 'grand_total'), 0)),
        'INR',
        CASE WHEN v_db = 'cancelled' THEN 'cancelled' ELSE 'completed' END,
        v_pay,
        CASE WHEN public.finance_try_numeric(p ->> 'tds_percent') BETWEEN 0 AND 100
             THEN public.finance_try_numeric(p ->> 'tds_percent') END,
        left(NULLIF(btrim(p ->> 'tds_section'), ''), 32),
        GREATEST(0, COALESCE(public.finance_try_numeric(p ->> 'tds_amount'), 0)),
        GREATEST(0, COALESCE(public.finance_try_numeric(p ->> 'tds_taxable_amount'), 0)),
        NULLIF(btrim(p ->> 'subject'), ''),
        NULLIF(btrim(p ->> 'notes'), ''),
        v_extra
          || jsonb_strip_nulls(jsonb_build_object(
               'payment_method', CASE v_pay WHEN 'bank' THEN 'Bank' WHEN 'cash' THEN 'Cash' WHEN 'upi' THEN 'UPI'
                                            WHEN 'cheque' THEN 'Cheque' ELSE 'Other' END,
               'invoice_reference_no', v_ref,
               'payment_terms', NULLIF(btrim(p ->> 'payment_terms'), ''),
               'signature_text', NULLIF(btrim(p ->> 'signature_text'), '')))
          || jsonb_build_object('legacy_payload', s.payload),
        NULL, s.created_at, s.updated_at)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    ELSE
      v_extra := v_extra || jsonb_strip_nulls(jsonb_build_object(
        'reference_no', NULLIF(btrim(p ->> 'reference_no'), ''),
        'gst_percent', public.finance_try_numeric(p ->> 'gst_percent'),
        'charges', jsonb_build_object(
          'discount_percent', COALESCE(public.finance_try_numeric(p ->> 'discount_percent'), 0),
          'discount_amount', COALESCE(public.finance_try_numeric(p ->> 'discount_amount'), 0),
          'transportation_charges', COALESCE(public.finance_try_numeric(p ->> 'transportation_charges'), 0),
          'packaging_charges', COALESCE(public.finance_try_numeric(p ->> 'packaging_charges'), 0))));

      IF s.document_kind = 'proformaInvoice' THEN
        INSERT INTO public.finance_proforma_invoices (
          id, proforma_number, proforma_date, valid_until_date, client_id, client_name, proforma_status,
          gst_supply_mode, notes, terms_and_conditions, scope_of_work, seal_and_sign,
          subtotal, tax_total, grand_total, extra, created_by, created_at, updated_at)
        VALUES (
          s.id, v_number, s.document_date, public.finance_try_date(p ->> 'valid_until'), v_client, v_client_name, v_db,
          v_mode, NULLIF(btrim(p ->> 'notes'), ''), NULLIF(btrim(p ->> 'payment_terms'), ''),
          NULLIF(btrim(p ->> 'subject'), ''), NULLIF(btrim(p ->> 'signature_text'), ''),
          COALESCE(public.finance_try_numeric(p ->> 'subtotal'), 0),
          COALESCE(public.finance_try_numeric(p ->> 'gst_amount'), 0),
          COALESCE(s.grand_total, public.finance_try_numeric(p ->> 'grand_total'), 0),
          v_extra || jsonb_build_object('legacy_payload', s.payload),
          NULL, s.created_at, s.updated_at)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
          v_items := COALESCE(p -> 'line_items', p -> 'lines');
          PERFORM public.finance_backfill_lines('finance_proforma_invoice_lines', 'proforma_invoice_id', s.id, v_items, s.created_at);
        END IF;
      ELSIF s.document_kind = 'invoice' THEN
        INSERT INTO public.finance_tax_invoices (
          id, tax_invoice_number, tax_date, valid_until_date, client_id, client_name, tax_status,
          gst_supply_mode, notes, terms_and_conditions, scope_of_work, seal_and_sign,
          subtotal, tax_total, grand_total, extra, created_by, created_at, updated_at)
        VALUES (
          s.id, v_number, s.document_date, public.finance_try_date(p ->> 'valid_until'), v_client, v_client_name, v_db,
          v_mode, NULLIF(btrim(p ->> 'notes'), ''), NULLIF(btrim(p ->> 'payment_terms'), ''),
          NULLIF(btrim(p ->> 'subject'), ''), NULLIF(btrim(p ->> 'signature_text'), ''),
          COALESCE(public.finance_try_numeric(p ->> 'subtotal'), 0),
          COALESCE(public.finance_try_numeric(p ->> 'gst_amount'), 0),
          COALESCE(s.grand_total, public.finance_try_numeric(p ->> 'grand_total'), 0),
          v_extra || jsonb_build_object('legacy_payload', s.payload),
          NULL, s.created_at, s.updated_at)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
          v_items := COALESCE(p -> 'line_items', p -> 'lines');
          PERFORM public.finance_backfill_lines('finance_tax_invoice_lines', 'tax_invoice_id', s.id, v_items, s.created_at);
        END IF;
      ELSE
        v_ref := COALESCE(
          NULLIF(btrim(p ->> 'invoice_reference_no'), ''),
          NULLIF(btrim(p ->> 'against_invoice_no'), ''),
          NULLIF(btrim(p ->> 'reference_no'), ''));
        v_invoice := NULL;
        IF v_ref IS NOT NULL THEN
          SELECT t.id INTO v_invoice FROM public.finance_tax_invoices t
           WHERE lower(btrim(t.tax_invoice_number)) = lower(v_ref) LIMIT 1;
        END IF;
        INSERT INTO public.finance_credit_notes (
          id, credit_note_number, credit_note_date, valid_until_date, client_id, client_name, invoice_id,
          credit_note_status, gst_supply_mode, notes, terms_and_conditions, scope_of_work, seal_and_sign,
          subtotal, tax_total, grand_total, extra, created_by, created_at, updated_at)
        VALUES (
          s.id, v_number, s.document_date, public.finance_try_date(p ->> 'valid_until'), v_client, v_client_name, v_invoice,
          v_db, v_mode, NULLIF(btrim(p ->> 'notes'), ''), NULLIF(btrim(p ->> 'payment_terms'), ''),
          NULLIF(btrim(p ->> 'subject'), ''), NULLIF(btrim(p ->> 'signature_text'), ''),
          COALESCE(public.finance_try_numeric(p ->> 'subtotal'), 0),
          COALESCE(public.finance_try_numeric(p ->> 'gst_amount'), 0),
          COALESCE(s.grand_total, public.finance_try_numeric(p ->> 'grand_total'), 0),
          v_extra
            || CASE WHEN v_invoice IS NOT NULL THEN jsonb_build_object('invoice_reference_no', v_ref) ELSE '{}'::jsonb END
            || jsonb_build_object('legacy_payload', s.payload),
          NULL, s.created_at, s.updated_at)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
          v_items := COALESCE(p -> 'line_items', p -> 'lines');
          PERFORM public.finance_backfill_lines('finance_credit_note_lines', 'credit_note_id', s.id, v_items, s.created_at);
        END IF;
      END IF;
    END IF;

    IF v_rows = 0 THEN
      -- Number still taken (very unlikely after the renames above): not
      -- logged, so the next run tries again.
      v_skipped[v_i] := v_skipped[v_i] + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.finance_backfill_log (source_id, document_kind, target_table, target_number, renamed)
    VALUES (s.id, s.document_kind, v_table, v_number, v_is_renamed);
    v_copied[v_i] := v_copied[v_i] + 1;
    IF v_is_renamed THEN
      v_renamed[v_i] := v_renamed[v_i] + 1;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT k, v_copied[o::int], v_renamed[o::int], v_skipped[o::int]
      FROM unnest(v_kinds) WITH ORDINALITY AS u(k, o);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_try_numeric(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_try_date(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_backfill_lines(text, text, uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_backfill_sale_documents() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public.finance_backfill_sale_documents() LOOP
    RAISE NOTICE 'finance backfill %: copied %, renamed %, skipped %', r.document_kind, r.copied, r.renamed, r.skipped;
  END LOOP;
END $$;
