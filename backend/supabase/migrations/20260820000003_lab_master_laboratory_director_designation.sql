-- Laboratory Director is the default designation; it must always exist and cannot be edited/deleted in UI.

INSERT INTO public.lab_master_options (category, label, value)
SELECT v.category, v.label, v.value
FROM (VALUES
  ('designation', 'Laboratory Director', 'lab-director')
) AS v(category, label, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lab_master_options existing
  WHERE existing.category = v.category
    AND lower(existing.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
