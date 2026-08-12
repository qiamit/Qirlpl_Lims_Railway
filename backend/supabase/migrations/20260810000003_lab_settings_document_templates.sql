-- Document print/PDF templates (Quotation, Proforma Invoice, Invoice, …)

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS document_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lab_settings.document_templates IS
  'Print/PDF layout templates for Quotation, Proforma Invoice, Invoice, etc.';
