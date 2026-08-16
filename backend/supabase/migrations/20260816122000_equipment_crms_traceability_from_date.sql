-- Traceability From: text → date (nullable)
ALTER TABLE public.equipment_crms
  ALTER COLUMN traceability_from DROP NOT NULL;

ALTER TABLE public.equipment_crms
  ALTER COLUMN traceability_from DROP DEFAULT;

ALTER TABLE public.equipment_crms
  ALTER COLUMN traceability_from TYPE date
  USING (
    CASE
      WHEN traceability_from IS NULL OR btrim(traceability_from) = '' THEN NULL
      WHEN traceability_from ~ '^\d{4}-\d{2}-\d{2}$' THEN traceability_from::date
      ELSE NULL
    END
  );
