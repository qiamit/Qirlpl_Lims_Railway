-- Ensure module_access_rules upserts can use ON CONFLICT (subject_type, subject_key, module_key).

DELETE FROM public.module_access_rules a
USING public.module_access_rules b
WHERE a.id > b.id
  AND a.subject_type = b.subject_type
  AND a.subject_key = b.subject_key
  AND a.module_key = b.module_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'module_access_rules_subject_module_uq'
      AND conrelid = 'public.module_access_rules'::regclass
  ) THEN
    ALTER TABLE public.module_access_rules
      ADD CONSTRAINT module_access_rules_subject_module_uq
      UNIQUE (subject_type, subject_key, module_key);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
