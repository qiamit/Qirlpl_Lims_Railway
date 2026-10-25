-- Finance port, Phase 2d: numbering counts above the typed sale books.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- right after 20261030100200_backfill_sale_documents_to_finance.sql.
-- Safe to re-run.
--
-- document_series_highest_serial (20261023000002) looked at quotations and
-- sale_documents only. From Phase 2 the screens save proformas, invoices,
-- credit notes and receipts in finance_* / transactions, so the highest
-- saved serial is now the larger of:
--   * the typed table (finance_proforma_invoices.proforma_number,
--     finance_tax_invoices.tax_invoice_number,
--     finance_credit_notes.credit_note_number,
--     transactions.receipt_number with payment_flow 'in'), and
--   * sale_documents (legacy, read-only after the backfill), including rows
--     in the Recycle Bin, so no number is ever handed out twice.
-- Numbers with a suffix (…-LOCAL, …-LEGACY, …-R2) do not count, as before.
-- Same signature, so peek/next_document_number pick it up unchanged.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.document_series_highest_serial(p_doc_type text, p_prefix text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := upper(btrim(COALESCE(p_doc_type, '')));
  v_prefix text := lower(COALESCE(p_prefix, ''));
  v_len integer := length(COALESCE(p_prefix, ''));
  v_kind text;
  v_table text;
  v_col text;
  v_filter text := '';
  v_max bigint;
  v_legacy bigint;
BEGIN
  IF v_type = 'QUOTATION' THEN
    SELECT max(substr(btrim(q.quotation_number), v_len + 1)::bigint)
      INTO v_max
      FROM public.quotations q
     WHERE lower(left(btrim(q.quotation_number), v_len)) = v_prefix
       AND substr(btrim(q.quotation_number), v_len + 1) ~ '^[0-9]{1,15}$';
    RETURN COALESCE(v_max, 0);
  END IF;

  SELECT x.kind, x.tbl, x.col
    INTO v_kind, v_table, v_col
    FROM (VALUES
      ('PROFORMA', 'proformaInvoice', 'finance_proforma_invoices', 'proforma_number'),
      ('TAX_INVOICE', 'invoice', 'finance_tax_invoices', 'tax_invoice_number'),
      ('CREDIT_NOTE', 'creditNote', 'finance_credit_notes', 'credit_note_number'),
      ('PAYMENT_RECEIPT', 'paymentReceipt', 'transactions', 'receipt_number')
    ) AS x(doc_type, kind, tbl, col)
   WHERE x.doc_type = v_type;
  IF v_kind IS NULL THEN
    RETURN 0;
  END IF;
  IF v_table = 'transactions' THEN
    v_filter := ' AND payment_flow = ''in''';
  END IF;

  IF to_regclass('public.' || v_table) IS NOT NULL THEN
    EXECUTE format(
      'SELECT max(substr(btrim(%1$I), $2 + 1)::bigint) FROM public.%2$I '
      'WHERE %1$I IS NOT NULL AND lower(left(btrim(%1$I), $2)) = $1 '
      'AND substr(btrim(%1$I), $2 + 1) ~ ''^[0-9]{1,15}$''%3$s',
      v_col, v_table, v_filter)
      INTO v_max
      USING v_prefix, v_len;
  END IF;

  IF to_regclass('public.sale_documents') IS NOT NULL THEN
    SELECT max(substr(btrim(s.document_number), v_len + 1)::bigint)
      INTO v_legacy
      FROM public.sale_documents s
     WHERE s.document_kind = v_kind
       AND lower(left(btrim(s.document_number), v_len)) = v_prefix
       AND substr(btrim(s.document_number), v_len + 1) ~ '^[0-9]{1,15}$';
  END IF;

  RETURN GREATEST(COALESCE(v_max, 0), COALESCE(v_legacy, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.document_series_highest_serial(text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
