-- Finance port, Phase 2a: typed sale books (proforma, tax invoice, credit
-- note, payment receipt) instead of the single JSON table sale_documents.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after Phase 1 (20261023000001_finance_access_helpers.sql,
-- 20261023000002_finance_document_series.sql), while the lab is idle.
-- Safe to re-run. Plan: backend/scripts/finance-phase2-mapping.md.
--
-- What it adds
--   finance_proforma_invoices (+ _lines)   Proforma Invoice page
--   finance_tax_invoices      (+ _lines)   Invoice page
--   finance_credit_notes      (+ _lines)   Credit Note page; invoice_id links
--                                          the invoice being credited
--   transactions                           Payment Receipt page
--                                          (payment_flow = 'in'); 'out' is
--                                          reserved for payments made and
--                                          refunds (later phases). invoice_id
--                                          links the invoice being paid, TDS
--                                          columns, bank_account_id (FK comes
--                                          with the bank-accounts phase).
--   clients.pan, clients.archived_at       additive; later finance reports
--                                          (TDS by PAN, ledgers) use them.
--
--   Columns follow Consultancy Pro (public-columns.json + the
--   finance_sale_documents_bridge `extra` column) with these deliberate
--   differences: rates, discounts and GST % are numeric (the reference stores
--   text); each line has hsn_sac as a column (HSN report); credit notes and
--   receipts link the invoice by a real FK instead of matching number text;
--   headers keep client_name and gst_supply_mode ('intra' = CGST + SGST,
--   'inter' = IGST). `extra` keeps everything else from the screens,
--   including extra.ui_status (the exact LIMS status label: Draft, Sent,
--   Proforma, Invoice, ...) and, for rows copied from sale_documents,
--   extra.legacy_payload.
--
-- Access (module rules from Lab Settings → Module Access, via the Phase 1
-- helpers; the Laboratory Director always has Edit):
--   read   proforma        View on Proforma Invoice or Invoice
--          tax invoice     View on Invoice, Credit Note or Payment Receipt
--          credit note     View on Invoice, Credit Note or Payment Receipt
--          receipt (in)    View on Invoice, Credit Note or Payment Receipt
--          (the three sales-ledger pages read each other's books for the
--           client balance and the invoice links)
--   write  each book needs Edit on its own page. transactions with
--          payment_flow 'out' are Laboratory Director only until the
--          purchase / refund pages exist.
--   lines  follow their parent (read when the parent is readable, write
--          with Edit on the parent's page).
--   Every table also gets the RESTRICTIVE lims_known_staff_only gate,
--   explicit grants (nothing for anon) and the write_audit_log trigger.
--
-- Soft delete (20261025100000) is NOT applied to these tables: that
-- migration has no per-table setup function (its setup is an anonymous DO
-- block over soft_delete_tables). A delete here is physical and is recorded
-- in audit_log (old_row keeps the whole record). Numbers are not reused:
-- document_series.next_number only moves forward.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_can_view(text[])') IS NULL
     OR to_regprocedure('public.app_can_edit(text[])') IS NULL
     OR to_regprocedure('public.app_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261023000001_finance_access_helpers.sql first';
  END IF;
  IF to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.clients') IS NULL OR to_regclass('public.quotations') IS NULL THEN
    RAISE EXCEPTION 'clients and quotations must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. clients: PAN and archive flag (additive).
-- ---------------------------------------------------------------------------

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pan text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_pan_format_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_pan_format_chk
  CHECK (pan IS NULL OR btrim(pan) = '' OR upper(btrim(pan)) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$') NOT VALID;

COMMENT ON COLUMN public.clients.pan IS 'Permanent Account Number (10 characters). Used for TDS reporting.';
COMMENT ON COLUMN public.clients.archived_at IS 'Set when a party is no longer used in finance; finance reports skip archived parties.';

-- ---------------------------------------------------------------------------
-- 2. Proforma invoices.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_proforma_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_number text NOT NULL,
  proforma_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until_date date,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  proforma_status text NOT NULL DEFAULT 'pending',
  gst_supply_mode text,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_proforma_invoices_number_chk CHECK (length(btrim(proforma_number)) BETWEEN 1 AND 60),
  CONSTRAINT finance_proforma_invoices_status_chk CHECK (proforma_status IN ('pending', 'accepted', 'cancelled')),
  CONSTRAINT finance_proforma_invoices_supply_chk CHECK (gst_supply_mode IS NULL OR gst_supply_mode IN ('intra', 'inter')),
  CONSTRAINT finance_proforma_invoices_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

CREATE TABLE IF NOT EXISTS public.finance_proforma_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_invoice_id uuid NOT NULL REFERENCES public.finance_proforma_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  product_master_item_id uuid,
  item_description text NOT NULL DEFAULT '',
  hsn_sac text,
  unit_of_item text NOT NULL DEFAULT 'Nos',
  qty numeric(14, 3) NOT NULL DEFAULT 1,
  unit_rate numeric(16, 4) NOT NULL DEFAULT 0,
  line_discount_percent numeric(5, 2) NOT NULL DEFAULT 0,
  gst_rate numeric(5, 2) NOT NULL DEFAULT 0,
  line_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  line_tax numeric(14, 2) NOT NULL DEFAULT 0,
  line_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_proforma_invoice_lines_discount_chk CHECK (line_discount_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_proforma_invoice_lines_gst_chk CHECK (gst_rate BETWEEN 0 AND 100),
  CONSTRAINT finance_proforma_invoice_lines_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

-- ---------------------------------------------------------------------------
-- 3. Tax invoices.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_tax_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_invoice_number text NOT NULL,
  tax_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until_date date,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  proforma_invoice_id uuid REFERENCES public.finance_proforma_invoices(id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  tax_status text NOT NULL DEFAULT 'pending',
  gst_supply_mode text,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tax_invoices_number_chk CHECK (length(btrim(tax_invoice_number)) BETWEEN 1 AND 60),
  CONSTRAINT finance_tax_invoices_status_chk CHECK (tax_status IN ('pending', 'accepted', 'cancelled')),
  CONSTRAINT finance_tax_invoices_supply_chk CHECK (gst_supply_mode IS NULL OR gst_supply_mode IN ('intra', 'inter')),
  CONSTRAINT finance_tax_invoices_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

CREATE TABLE IF NOT EXISTS public.finance_tax_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_invoice_id uuid NOT NULL REFERENCES public.finance_tax_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  product_master_item_id uuid,
  item_description text NOT NULL DEFAULT '',
  hsn_sac text,
  unit_of_item text NOT NULL DEFAULT 'Nos',
  qty numeric(14, 3) NOT NULL DEFAULT 1,
  unit_rate numeric(16, 4) NOT NULL DEFAULT 0,
  line_discount_percent numeric(5, 2) NOT NULL DEFAULT 0,
  gst_rate numeric(5, 2) NOT NULL DEFAULT 0,
  line_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  line_tax numeric(14, 2) NOT NULL DEFAULT 0,
  line_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tax_invoice_lines_discount_chk CHECK (line_discount_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_tax_invoice_lines_gst_chk CHECK (gst_rate BETWEEN 0 AND 100),
  CONSTRAINT finance_tax_invoice_lines_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

-- ---------------------------------------------------------------------------
-- 4. Credit notes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL,
  credit_note_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until_date date,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  invoice_id uuid REFERENCES public.finance_tax_invoices(id) ON DELETE SET NULL,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  credit_note_status text NOT NULL DEFAULT 'pending',
  gst_supply_mode text,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_credit_notes_number_chk CHECK (length(btrim(credit_note_number)) BETWEEN 1 AND 60),
  CONSTRAINT finance_credit_notes_status_chk CHECK (credit_note_status IN ('pending', 'accepted', 'cancelled')),
  CONSTRAINT finance_credit_notes_supply_chk CHECK (gst_supply_mode IS NULL OR gst_supply_mode IN ('intra', 'inter')),
  CONSTRAINT finance_credit_notes_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

CREATE TABLE IF NOT EXISTS public.finance_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.finance_credit_notes(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  product_master_item_id uuid,
  item_description text NOT NULL DEFAULT '',
  hsn_sac text,
  unit_of_item text NOT NULL DEFAULT 'Nos',
  qty numeric(14, 3) NOT NULL DEFAULT 1,
  unit_rate numeric(16, 4) NOT NULL DEFAULT 0,
  line_discount_percent numeric(5, 2) NOT NULL DEFAULT 0,
  gst_rate numeric(5, 2) NOT NULL DEFAULT 0,
  line_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  line_tax numeric(14, 2) NOT NULL DEFAULT 0,
  line_total numeric(14, 2) NOT NULL DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_credit_note_lines_discount_chk CHECK (line_discount_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_credit_note_lines_gst_chk CHECK (gst_rate BETWEEN 0 AND 100),
  CONSTRAINT finance_credit_note_lines_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

-- ---------------------------------------------------------------------------
-- 5. Money book: payment receipts now, payments made and refunds later.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_flow text NOT NULL,
  receipt_number text,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  invoice_id uuid REFERENCES public.finance_tax_invoices(id) ON DELETE SET NULL,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'completed',
  mode_of_payment text NOT NULL DEFAULT 'bank',
  bank_account_id uuid,
  tds_percent numeric(5, 2),
  tds_section text,
  tds_amount numeric(14, 2) NOT NULL DEFAULT 0,
  tds_taxable_amount numeric(14, 2) NOT NULL DEFAULT 0,
  description text,
  notes text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_flow_chk CHECK (payment_flow IN ('in', 'out')),
  CONSTRAINT transactions_receipt_number_chk CHECK (receipt_number IS NULL OR length(btrim(receipt_number)) BETWEEN 1 AND 60),
  CONSTRAINT transactions_amount_chk CHECK (amount >= 0),
  CONSTRAINT transactions_status_chk CHECK (status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT transactions_mode_chk CHECK (mode_of_payment IN ('bank', 'neft_rtgs', 'cash', 'upi', 'cheque', 'card', 'other')),
  CONSTRAINT transactions_tds_percent_chk CHECK (tds_percent IS NULL OR tds_percent BETWEEN 0 AND 100),
  CONSTRAINT transactions_tds_amount_nonnegative_ck CHECK (tds_amount >= 0),
  CONSTRAINT transactions_tds_taxable_nonnegative_ck CHECK (tds_taxable_amount >= 0),
  CONSTRAINT transactions_tds_section_length_ck CHECK (tds_section IS NULL OR length(btrim(tds_section)) <= 32),
  CONSTRAINT transactions_extra_chk CHECK (jsonb_typeof(extra) = 'object')
);

COMMENT ON TABLE public.transactions IS
  'Money book. payment_flow in = payment receipt (Payment Receipt page). out = payments made / refunds (later phases, extra.book).';
COMMENT ON COLUMN public.transactions.bank_account_id IS
  'Bank account the money went to; the foreign key is added with the bank-accounts phase.';
COMMENT ON COLUMN public.transactions.invoice_id IS
  'Invoice this receipt settles (optional). extra.invoice_reference_no keeps the number as typed.';

-- ---------------------------------------------------------------------------
-- 6. Indexes: unique numbers (case-insensitive, trimmed), lookups.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS finance_proforma_invoices_number_uidx
  ON public.finance_proforma_invoices (lower(btrim(proforma_number)));
CREATE UNIQUE INDEX IF NOT EXISTS finance_tax_invoices_number_uidx
  ON public.finance_tax_invoices (lower(btrim(tax_invoice_number)));
CREATE UNIQUE INDEX IF NOT EXISTS finance_credit_notes_number_uidx
  ON public.finance_credit_notes (lower(btrim(credit_note_number)));
CREATE UNIQUE INDEX IF NOT EXISTS transactions_receipt_number_in_uidx
  ON public.transactions (lower(btrim(receipt_number)))
  WHERE payment_flow = 'in' AND receipt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_proforma_invoices_date_idx ON public.finance_proforma_invoices (proforma_date DESC);
CREATE INDEX IF NOT EXISTS finance_proforma_invoices_client_idx ON public.finance_proforma_invoices (client_id);
CREATE INDEX IF NOT EXISTS finance_tax_invoices_date_idx ON public.finance_tax_invoices (tax_date DESC);
CREATE INDEX IF NOT EXISTS finance_tax_invoices_client_idx ON public.finance_tax_invoices (client_id);
CREATE INDEX IF NOT EXISTS finance_credit_notes_date_idx ON public.finance_credit_notes (credit_note_date DESC);
CREATE INDEX IF NOT EXISTS finance_credit_notes_client_idx ON public.finance_credit_notes (client_id);
CREATE INDEX IF NOT EXISTS finance_credit_notes_invoice_idx ON public.finance_credit_notes (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_proforma_invoice_lines_parent_idx ON public.finance_proforma_invoice_lines (proforma_invoice_id, line_no);
CREATE INDEX IF NOT EXISTS finance_tax_invoice_lines_parent_idx ON public.finance_tax_invoice_lines (tax_invoice_id, line_no);
CREATE INDEX IF NOT EXISTS finance_credit_note_lines_parent_idx ON public.finance_credit_note_lines (credit_note_id, line_no);
CREATE INDEX IF NOT EXISTS transactions_flow_date_idx ON public.transactions (payment_flow, txn_date DESC);
CREATE INDEX IF NOT EXISTS transactions_client_idx ON public.transactions (client_id);
CREATE INDEX IF NOT EXISTS transactions_invoice_idx ON public.transactions (invoice_id) WHERE invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers, RLS, grants and audit triggers on all seven tables.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_proforma_invoices', 'finance_proforma_invoice_lines',
    'finance_tax_invoices', 'finance_tax_invoice_lines',
    'finance_credit_notes', 'finance_credit_note_lines',
    'transactions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || t || '_updated_at', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    IF to_regprocedure('public.write_audit_log()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit_log', t);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()', t || '_audit_log', t);
    END IF;
  END LOOP;
END $$;

-- Header policies: read set per book, write = Edit on the book's own page.
DO $$
DECLARE
  b record;
BEGIN
  FOR b IN
    SELECT * FROM (VALUES
      ('finance_proforma_invoices', 'finance_proforma_invoice_lines', 'proforma_invoice_id',
       '/finance/sale/proforma-invoice',
       $p$'/finance/sale/proforma-invoice', '/finance/sale/invoice'$p$),
      ('finance_tax_invoices', 'finance_tax_invoice_lines', 'tax_invoice_id',
       '/finance/sale/invoice',
       $p$'/finance/sale/invoice', '/finance/sale/credit-note', '/finance/sale/payment-receipt'$p$),
      ('finance_credit_notes', 'finance_credit_note_lines', 'credit_note_id',
       '/finance/sale/credit-note',
       $p$'/finance/sale/invoice', '/finance/sale/credit-note', '/finance/sale/payment-receipt'$p$)
    ) AS v(tbl, lines_tbl, parent_fk, edit_path, view_paths)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.tbl || '_select', b.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view(%s)))',
      b.tbl || '_select', b.tbl, b.view_paths);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.tbl || '_insert', b.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%L)))',
      b.tbl || '_insert', b.tbl, b.edit_path);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.tbl || '_update', b.tbl);
    EXECUTE format(
      'CREATE POLICY %1$I ON public.%2$I FOR UPDATE TO authenticated '
      'USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%3$L))) '
      'WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%3$L)))',
      b.tbl || '_update', b.tbl, b.edit_path);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.tbl || '_delete', b.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
      'USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%L)))',
      b.tbl || '_delete', b.tbl, b.edit_path);

    -- Lines follow the parent: readable when the parent is readable (the
    -- parent's own RLS applies inside EXISTS), writable with Edit on the page.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.lines_tbl || '_select', b.lines_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (EXISTS (SELECT 1 FROM public.%I h WHERE h.id = %I))',
      b.lines_tbl || '_select', b.lines_tbl, b.tbl, b.parent_fk);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.lines_tbl || '_insert', b.lines_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%L))) '
      'AND EXISTS (SELECT 1 FROM public.%I h WHERE h.id = %I))',
      b.lines_tbl || '_insert', b.lines_tbl, b.edit_path, b.tbl, b.parent_fk);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.lines_tbl || '_update', b.lines_tbl);
    EXECUTE format(
      'CREATE POLICY %1$I ON public.%2$I FOR UPDATE TO authenticated '
      'USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%3$L))) '
      'WITH CHECK (((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%3$L))) '
      'AND EXISTS (SELECT 1 FROM public.%4$I h WHERE h.id = %5$I))',
      b.lines_tbl || '_update', b.lines_tbl, b.edit_path, b.tbl, b.parent_fk);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.lines_tbl || '_delete', b.lines_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
      'USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(%L)))',
      b.lines_tbl || '_delete', b.lines_tbl, b.edit_path);
  END LOOP;
END $$;

-- transactions: receipts (in) by page rule; money out is Director-only until
-- its pages exist.
DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (payment_flow = 'in' AND (SELECT public.app_can_view(
      '/finance/sale/invoice', '/finance/sale/credit-note', '/finance/sale/payment-receipt')))
  );

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (payment_flow = 'in' AND (SELECT public.app_can_edit('/finance/sale/payment-receipt')))
  );

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (payment_flow = 'in' AND (SELECT public.app_can_edit('/finance/sale/payment-receipt')))
  )
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (payment_flow = 'in' AND (SELECT public.app_can_edit('/finance/sale/payment-receipt')))
  );

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (payment_flow = 'in' AND (SELECT public.app_can_edit('/finance/sale/payment-receipt')))
  );

NOTIFY pgrst, 'reload schema';
