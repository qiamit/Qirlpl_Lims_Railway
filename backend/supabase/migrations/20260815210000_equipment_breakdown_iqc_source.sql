-- Allow IQC equipment sources on breakdown register
ALTER TABLE public.equipment_breakdown_register
  DROP CONSTRAINT IF EXISTS equipment_breakdown_register_source_check;

ALTER TABLE public.equipment_breakdown_register
  ADD CONSTRAINT equipment_breakdown_register_source_check CHECK (
    equipment_source = ANY (
      ARRAY[
        'testing'::text,
        'calibration'::text,
        'testing_iqc'::text,
        'calibration_iqc'::text
      ]
    )
  );
