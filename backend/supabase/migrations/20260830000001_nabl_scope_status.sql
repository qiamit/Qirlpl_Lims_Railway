-- NABL Scope: Status of Scope (Accredited | Draft Scope)
-- Existing rows → Accredited; new inserts default → Draft Scope.

ALTER TABLE public.nabl_scope
  ADD COLUMN IF NOT EXISTS scope_status text;

UPDATE public.nabl_scope
SET scope_status = 'Accredited'
WHERE scope_status IS NULL OR btrim(scope_status) = '';

ALTER TABLE public.nabl_scope
  ALTER COLUMN scope_status SET DEFAULT 'Draft Scope';

ALTER TABLE public.nabl_scope
  ALTER COLUMN scope_status SET NOT NULL;

ALTER TABLE public.nabl_scope
  DROP CONSTRAINT IF EXISTS nabl_scope_scope_status_check;

ALTER TABLE public.nabl_scope
  ADD CONSTRAINT nabl_scope_scope_status_check
  CHECK (scope_status = ANY (ARRAY['Accredited'::text, 'Draft Scope'::text]));

COMMENT ON COLUMN public.nabl_scope.scope_status IS
  'Status of Scope: Accredited or Draft Scope. New entries default to Draft Scope.';
