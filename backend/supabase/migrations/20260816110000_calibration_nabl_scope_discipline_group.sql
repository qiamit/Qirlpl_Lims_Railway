-- Calibration NABL Scope: Discipline Name + Group (NABL Scope of Accreditation columns)
-- Also extend nabl_scope_lookups kinds for manage/+ on the form.

ALTER TABLE public.calibration_nabl_scope
  ADD COLUMN IF NOT EXISTS discipline_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_calibration_nabl_scope_discipline
  ON public.calibration_nabl_scope USING btree (discipline_name);

CREATE INDEX IF NOT EXISTS idx_calibration_nabl_scope_group
  ON public.calibration_nabl_scope USING btree (group_name);

COMMENT ON COLUMN public.calibration_nabl_scope.discipline_name IS
  'Discipline Name (NABL Scope of Accreditation)';

COMMENT ON COLUMN public.calibration_nabl_scope.group_name IS
  'Group under the discipline (NABL Scope of Accreditation)';

-- Allow calibration-specific lookup kinds alongside testing kinds
ALTER TABLE public.nabl_scope_lookups
  DROP CONSTRAINT IF EXISTS nabl_scope_lookups_kind_check;

ALTER TABLE public.nabl_scope_lookups
  ADD CONSTRAINT nabl_scope_lookups_kind_check CHECK (
    kind = ANY (
      ARRAY[
        'discipline_group'::text,
        'materials_products'::text,
        'discipline_name'::text,
        'group_name'::text
      ]
    )
  );
