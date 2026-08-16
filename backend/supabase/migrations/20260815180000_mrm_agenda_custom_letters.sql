-- Allow custom agenda points beyond ISO a–o letters

ALTER TABLE public.mrm_agenda_items DROP CONSTRAINT IF EXISTS mrm_agenda_items_letter_check;
