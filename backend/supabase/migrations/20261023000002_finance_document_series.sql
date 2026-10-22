-- Finance port, Phase 1b: document numbers handed out by the database.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- right after 20261023000001_finance_access_helpers.sql, while the lab is idle.
--
-- Today the browser takes "highest existing number + 1", so two people saving
-- at the same time can get the same number (the unique index then rejects
-- one of them). With this migration:
--   * peek_document_number(type) shows the next number without using it, for
--     the form preview.
--   * next_document_number(type) takes the next number under a row lock when
--     the document is saved, so nobody else can get it.
--   * Each number is at least one more than the highest number already saved
--     with the same prefix, so existing quotations and invoices are never
--     reused, even ones typed by hand.
--   * A prefix may contain {YYYY}, {YY} or {FY} (Indian financial year, e.g.
--     26-27). When the resolved prefix changes (new year), numbering restarts
--     after the highest number already saved under the new prefix.
--
-- Based on Consultancy Pro f1/f12 (document_series, next_document_number),
-- adapted to the LIMS tables: quotations.quotation_number and
-- sale_documents(document_kind, document_number). Existing numbers are not
-- changed. Phase 1 covers the five sale kinds; later phases add their own
-- doc types.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.document_series (
  doc_type text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  label text NOT NULL DEFAULT '',
  prefix text NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  pad_width integer NOT NULL DEFAULT 4,
  active_prefix text,
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_series_next_chk CHECK (next_number >= 1),
  CONSTRAINT document_series_pad_chk CHECK (pad_width BETWEEN 1 AND 8),
  CONSTRAINT document_series_prefix_chk CHECK (length(btrim(prefix)) BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.document_series IS
  'Finance document numbering. prefix may contain {YYYY}, {YY}, {FY}. Numbers come from next_document_number().';
COMMENT ON COLUMN public.document_series.active_prefix IS
  'The prefix as resolved for the last number handed out; when it changes the serial restarts.';

DROP TRIGGER IF EXISTS trg_document_series_updated_at ON public.document_series;
CREATE TRIGGER trg_document_series_updated_at
  BEFORE UPDATE ON public.document_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed. The quotation prefix comes from Lab Settings → Prefix's (same name
-- matching as quotationNumberPrefix.ts); the other kinds keep the prefixes
-- the app generates today (PI-2026-, INV-2026-, …) as year templates.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_quote_prefix text;
BEGIN
  IF to_regclass('public.lab_prefixes') IS NOT NULL THEN
    SELECT btrim(p.prefix) INTO v_quote_prefix
      FROM public.lab_prefixes p
     WHERE btrim(COALESCE(p.prefix, '')) <> ''
       AND lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) IN ('quotation number', 'quotation', 'qtn')
     ORDER BY array_position(
       ARRAY['quotation number', 'quotation', 'qtn'],
       lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
     )
     LIMIT 1;
    IF v_quote_prefix IS NULL THEN
      SELECT btrim(p.prefix) INTO v_quote_prefix
        FROM public.lab_prefixes p
       WHERE btrim(COALESCE(p.prefix, '')) <> ''
         AND lower(p.name) LIKE '%quotation%'
       ORDER BY p.name
       LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.document_series (doc_type, label, prefix, next_number, pad_width) VALUES
    ('QUOTATION', 'Quotation', COALESCE(v_quote_prefix, 'QTN-{YYYY}-'), 1, 4),
    ('PROFORMA', 'Proforma Invoice', 'PI-{YYYY}-', 1, 4),
    ('TAX_INVOICE', 'Tax Invoice', 'INV-{YYYY}-', 1, 4),
    ('CREDIT_NOTE', 'Credit Note', 'CN-{YYYY}-', 1, 4),
    ('PAYMENT_RECEIPT', 'Payment Receipt', 'PR-{YYYY}-', 1, 4)
  ON CONFLICT (doc_type) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Resolves {YYYY}, {YY} and {FY} for a date (India time). FY runs April–March.
CREATE OR REPLACE FUNCTION public.document_series_resolve_prefix(p_template text, p_on date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    SELECT
      extract(year FROM p_on)::int AS y,
      CASE WHEN extract(month FROM p_on) >= 4
           THEN extract(year FROM p_on)::int
           ELSE extract(year FROM p_on)::int - 1 END AS fy
  )
  SELECT replace(replace(replace(btrim(p_template),
           '{YYYY}', d.y::text),
           '{YY}', lpad((d.y % 100)::text, 2, '0')),
           '{FY}', lpad((d.fy % 100)::text, 2, '0') || '-' || lpad(((d.fy + 1) % 100)::text, 2, '0'))
  FROM d;
$$;

-- Module path whose Edit right lets a user take numbers of this type.
CREATE OR REPLACE FUNCTION public.document_series_module_path(p_doc_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE upper(btrim(COALESCE(p_doc_type, '')))
    WHEN 'QUOTATION' THEN '/finance/sale/quotation'
    WHEN 'PROFORMA' THEN '/finance/sale/proforma-invoice'
    WHEN 'TAX_INVOICE' THEN '/finance/sale/invoice'
    WHEN 'CREDIT_NOTE' THEN '/finance/sale/credit-note'
    WHEN 'PAYMENT_RECEIPT' THEN '/finance/sale/payment-receipt'
    ELSE NULL
  END;
$$;

-- Highest serial already saved under a resolved prefix (case-insensitive,
-- digits only after the prefix). 0 when none.
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
  v_max bigint;
BEGIN
  IF v_type = 'QUOTATION' THEN
    SELECT max(substr(btrim(q.quotation_number), v_len + 1)::bigint)
      INTO v_max
      FROM public.quotations q
     WHERE lower(left(btrim(q.quotation_number), v_len)) = v_prefix
       AND substr(btrim(q.quotation_number), v_len + 1) ~ '^[0-9]{1,15}$';
    RETURN COALESCE(v_max, 0);
  END IF;

  v_kind := CASE v_type
    WHEN 'PROFORMA' THEN 'proformaInvoice'
    WHEN 'TAX_INVOICE' THEN 'invoice'
    WHEN 'CREDIT_NOTE' THEN 'creditNote'
    WHEN 'PAYMENT_RECEIPT' THEN 'paymentReceipt'
    ELSE NULL
  END;
  IF v_kind IS NULL OR to_regclass('public.sale_documents') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT max(substr(btrim(s.document_number), v_len + 1)::bigint)
    INTO v_max
    FROM public.sale_documents s
   WHERE s.document_kind = v_kind
     AND lower(left(btrim(s.document_number), v_len)) = v_prefix
     AND substr(btrim(s.document_number), v_len + 1) ~ '^[0-9]{1,15}$';
  RETURN COALESCE(v_max, 0);
END;
$$;

-- Shared by peek and next: the number the series would hand out now.
CREATE OR REPLACE FUNCTION public.document_series_candidate(
  p_doc_type text,
  OUT resolved_prefix text,
  OUT serial bigint,
  OUT document_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.document_series%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_floor bigint;
BEGIN
  SELECT * INTO s FROM public.document_series WHERE doc_type = upper(btrim(p_doc_type));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document series % is not configured', p_doc_type USING ERRCODE = 'P0002';
  END IF;

  resolved_prefix := public.document_series_resolve_prefix(s.prefix, v_today);
  -- A new resolved prefix (new year, or the prefix was edited) starts at 1;
  -- the saved-number check below still keeps it above existing numbers.
  v_floor := CASE WHEN s.active_prefix IS NOT DISTINCT FROM resolved_prefix THEN s.next_number ELSE 1 END;
  serial := GREATEST(v_floor, public.document_series_highest_serial(s.doc_type, resolved_prefix) + 1);
  document_number := resolved_prefix || lpad(serial::text, s.pad_width, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_document_number(p_doc_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text := public.document_series_module_path(p_doc_type);
  c record;
BEGIN
  IF v_path IS NULL OR NOT public.app_can_view(v_path) THEN
    RAISE EXCEPTION 'No access to this document series' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.document_series_candidate(p_doc_type);
  RETURN c.document_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_document_number(p_doc_type text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := upper(btrim(COALESCE(p_doc_type, '')));
  v_path text := public.document_series_module_path(v_type);
  c record;
BEGIN
  IF v_path IS NULL OR NOT public.app_can_edit(v_path) THEN
    RAISE EXCEPTION 'No edit access for this document series' USING ERRCODE = '42501';
  END IF;

  -- Serialise allocations of this type.
  PERFORM 1 FROM public.document_series WHERE doc_type = v_type FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document series % is not configured', v_type USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO c FROM public.document_series_candidate(v_type);
  IF c.serial >= 2147483647 THEN
    RAISE EXCEPTION 'Document series % is exhausted', v_type;
  END IF;

  UPDATE public.document_series
     SET next_number = c.serial + 1,
         active_prefix = c.resolved_prefix,
         updated_by = auth.uid()
   WHERE doc_type = v_type;

  RETURN c.document_number;
END;
$$;

REVOKE ALL ON FUNCTION public.document_series_resolve_prefix(text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_series_module_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_series_highest_serial(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_series_candidate(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.peek_document_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_series_resolve_prefix(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Access: finance users read the series; only the Laboratory Director edits
-- prefixes, padding and the next number (Lab Settings). Taking a number goes
-- through next_document_number(), which runs as the owner.
-- ---------------------------------------------------------------------------

ALTER TABLE public.document_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_series_select ON public.document_series;
CREATE POLICY document_series_select ON public.document_series
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_view(
      '/finance/sale/quotation',
      '/finance/sale/proforma-invoice',
      '/finance/sale/invoice',
      '/finance/sale/credit-note',
      '/finance/sale/payment-receipt'
    ))
  );

DROP POLICY IF EXISTS document_series_insert ON public.document_series;
CREATE POLICY document_series_insert ON public.document_series
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.app_is_admin()));

DROP POLICY IF EXISTS document_series_update ON public.document_series;
CREATE POLICY document_series_update ON public.document_series
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));

DROP POLICY IF EXISTS document_series_delete ON public.document_series;
CREATE POLICY document_series_delete ON public.document_series
  FOR DELETE TO authenticated
  USING ((SELECT public.app_is_admin()));

-- Same outer gate as every other public table (20261009063000 / 20261022120000).
DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.document_series;
    CREATE POLICY lims_known_staff_only ON public.document_series
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

REVOKE ALL ON public.document_series FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_series TO authenticated;
GRANT ALL ON public.document_series TO service_role;

-- Every prefix change and every number handed out is recorded (ISO 17025 7.5).
DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS document_series_audit_log ON public.document_series;
    CREATE TRIGGER document_series_audit_log
      AFTER INSERT OR UPDATE OR DELETE ON public.document_series
      FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
