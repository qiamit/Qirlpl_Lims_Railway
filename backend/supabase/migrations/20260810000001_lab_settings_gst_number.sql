-- Lab GST number on laboratory details

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS gst_number text;

COMMENT ON COLUMN public.lab_settings.gst_number IS
  'Laboratory GSTIN / GST number shown on invoices and quotations.';
