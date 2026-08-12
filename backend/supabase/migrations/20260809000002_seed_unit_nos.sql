-- Default UOM for Product & Services forms
INSERT INTO public.test_parameter_units (name)
SELECT 'Nos'
WHERE NOT EXISTS (
  SELECT 1 FROM public.test_parameter_units WHERE lower(name) = 'nos'
);
