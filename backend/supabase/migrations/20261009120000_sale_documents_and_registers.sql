-- Proforma, Invoice, Credit Note, and Payment Receipt leave the browser.
-- Personnel, Training, and Externally Providers registers get a shared table.
-- New tables are limited to known staff. Apply on Railway Postgres.

CREATE TABLE IF NOT EXISTS public.sale_documents (
  id uuid PRIMARY KEY,
  document_kind text NOT NULL CHECK (
    document_kind IN ('proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt')
  ),
  document_number text NOT NULL,
  client_id uuid,
  client_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Draft',
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sale_documents_kind_number_uidx
  ON public.sale_documents (document_kind, lower(btrim(document_number)));

CREATE INDEX IF NOT EXISTS sale_documents_kind_date_idx
  ON public.sale_documents (document_kind, document_date DESC);

DROP TRIGGER IF EXISTS trg_sale_documents_updated_at ON public.sale_documents;
CREATE TRIGGER trg_sale_documents_updated_at
  BEFORE UPDATE ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_documents_known_staff ON public.sale_documents;
CREATE POLICY sale_documents_known_staff
  ON public.sale_documents
  FOR ALL
  TO authenticated
  USING (public.app_is_known_staff())
  WITH CHECK (public.app_is_known_staff());

CREATE TABLE IF NOT EXISTS public.compliance_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  reference_no text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  person_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Draft',
  due_on date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_registers_module_idx
  ON public.compliance_registers (module_key, updated_at DESC);

DROP TRIGGER IF EXISTS trg_compliance_registers_updated_at ON public.compliance_registers;
CREATE TRIGGER trg_compliance_registers_updated_at
  BEFORE UPDATE ON public.compliance_registers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.compliance_registers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_registers_known_staff ON public.compliance_registers;
CREATE POLICY compliance_registers_known_staff
  ON public.compliance_registers
  FOR ALL
  TO authenticated
  USING (public.app_is_known_staff())
  WITH CHECK (public.app_is_known_staff());

NOTIFY pgrst, 'reload schema';
