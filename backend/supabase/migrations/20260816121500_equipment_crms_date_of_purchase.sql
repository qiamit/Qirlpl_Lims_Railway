-- Convert CRM Year of Purchase (integer) → Date of Purchase (date)
ALTER TABLE public.equipment_crms
  DROP CONSTRAINT IF EXISTS equipment_crms_year_check;

ALTER TABLE public.equipment_crms
  ADD COLUMN IF NOT EXISTS date_of_purchase date;

UPDATE public.equipment_crms
SET date_of_purchase = make_date(year_of_purchase, 1, 1)
WHERE year_of_purchase IS NOT NULL
  AND date_of_purchase IS NULL;

ALTER TABLE public.equipment_crms
  DROP COLUMN IF EXISTS year_of_purchase;
