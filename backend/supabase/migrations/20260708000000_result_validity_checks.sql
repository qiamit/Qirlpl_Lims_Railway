-- ISO/IEC 17025:2017 Clause 7.7 — Ensuring the validity of results (internal monitoring register).

CREATE TABLE IF NOT EXISTS public.result_validity_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    check_ref text NOT NULL,
    check_type text NOT NULL,
    check_date date NOT NULL,
    status text NOT NULL DEFAULT 'planned',
    title text NOT NULL,
    sample_id uuid REFERENCES public.samples(id) ON DELETE SET NULL,
    srf_number text,
    test_parameter_name text,
    equipment_id uuid REFERENCES public.equipment_master(id) ON DELETE SET NULL,
    equipment_label text,
    iqc_master_id uuid REFERENCES public.iqc_masters(id) ON DELETE SET NULL,
    iqc_label text,
    performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_by_name text,
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_by_name text,
    predefined_criteria text,
    check_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    conclusion text,
    action_taken text,
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT result_validity_checks_check_type_chk CHECK (
        check_type IN (
            '7_7_a', '7_7_b', '7_7_c', '7_7_d', '7_7_e',
            '7_7_f', '7_7_g', '7_7_h', '7_7_i', '7_7_j', '7_7_k'
        )
    ),
    CONSTRAINT result_validity_checks_status_chk CHECK (
        status IN ('planned', 'in_progress', 'satisfactory', 'unsatisfactory')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_result_validity_checks_check_ref
    ON public.result_validity_checks (check_ref);

CREATE INDEX IF NOT EXISTS idx_result_validity_checks_check_date
    ON public.result_validity_checks (check_date DESC);

CREATE INDEX IF NOT EXISTS idx_result_validity_checks_check_type
    ON public.result_validity_checks (check_type, check_date DESC);

CREATE INDEX IF NOT EXISTS idx_result_validity_checks_status
    ON public.result_validity_checks (status);

DROP TRIGGER IF EXISTS trg_result_validity_checks_updated_at ON public.result_validity_checks;
CREATE TRIGGER trg_result_validity_checks_updated_at
    BEFORE UPDATE ON public.result_validity_checks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.result_validity_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_result_validity_checks_authenticated_all ON public.result_validity_checks;
CREATE POLICY lims_result_validity_checks_authenticated_all ON public.result_validity_checks
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

INSERT INTO public.lab_prefixes (name, prefix, last_number)
SELECT 'Result Validity Check', 'QI/RVC-', 0
WHERE NOT EXISTS (
    SELECT 1 FROM public.lab_prefixes WHERE name = 'Result Validity Check'
);

COMMENT ON TABLE public.result_validity_checks IS
    'ISO 17025 Clause 7.7 internal result validity monitoring records (checks a–k).';
