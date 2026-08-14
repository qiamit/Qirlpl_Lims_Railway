-- NABL Scope lookup masters: Discipline / Group + Materials or Products Tested
-- Managed via + button on Product Services (NABL Scope) form.

CREATE TABLE IF NOT EXISTS public.nabl_scope_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['discipline_group'::text, 'materials_products'::text])),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nabl_scope_lookups_kind_name_key UNIQUE (kind, name)
);

CREATE INDEX IF NOT EXISTS idx_nabl_scope_lookups_kind_name
  ON public.nabl_scope_lookups USING btree (kind, name);

ALTER TABLE public.nabl_scope_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_nabl_scope_lookups_authenticated_all ON public.nabl_scope_lookups;
CREATE POLICY lims_nabl_scope_lookups_authenticated_all
  ON public.nabl_scope_lookups
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed from existing scope rows
INSERT INTO public.nabl_scope_lookups (kind, name)
SELECT DISTINCT 'discipline_group', trim(discipline_group)
FROM public.nabl_scope
WHERE trim(discipline_group) <> ''
ON CONFLICT (kind, name) DO NOTHING;

INSERT INTO public.nabl_scope_lookups (kind, name)
SELECT DISTINCT 'materials_products', trim(materials_products)
FROM public.nabl_scope
WHERE trim(materials_products) <> ''
ON CONFLICT (kind, name) DO NOTHING;
