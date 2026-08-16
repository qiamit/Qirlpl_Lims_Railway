-- Add mobile number for MRM agenda communication recipients
ALTER TABLE public.mrm_plan_recipients
  ADD COLUMN IF NOT EXISTS mobile TEXT NOT NULL DEFAULT '';
