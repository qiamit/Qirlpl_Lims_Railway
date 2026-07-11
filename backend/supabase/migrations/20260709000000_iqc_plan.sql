-- ISO/IEC 17025:2017 Clause 7.7 — IQC Plan schedule register.

CREATE TABLE IF NOT EXISTS public.iqc_plan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name text NOT NULL,
    check_type_slug text,
    frequency text NOT NULL DEFAULT '',
    acceptance_criteria text,
    last_done date,
    next_due date,
    status text NOT NULL DEFAULT 'planned',
    remarks text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT iqc_plan_items_status_chk CHECK (
        status IN ('planned', 'on_track', 'due_soon', 'overdue', 'inactive')
    )
);

CREATE INDEX IF NOT EXISTS idx_iqc_plan_items_next_due
    ON public.iqc_plan_items (next_due ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_iqc_plan_items_status
    ON public.iqc_plan_items (status);

DROP TRIGGER IF EXISTS trg_iqc_plan_items_updated_at ON public.iqc_plan_items;
CREATE TRIGGER trg_iqc_plan_items_updated_at
    BEFORE UPDATE ON public.iqc_plan_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.iqc_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_iqc_plan_items_authenticated_all ON public.iqc_plan_items;
CREATE POLICY lims_iqc_plan_items_authenticated_all ON public.iqc_plan_items
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.iqc_plan_items IS
    'ISO 17025 Clause 7.7 IQC plan — scheduled internal quality checks.';

-- Seed default plan rows for Clause 7.7.1 checks (excluding intermediate check).
INSERT INTO public.iqc_plan_items (check_name, check_type_slug, frequency, acceptance_criteria, status)
SELECT v.check_name, v.check_type_slug, v.frequency, v.acceptance_criteria, 'planned'
FROM (
    VALUES
        ('Reference Material Check', 'reference-material-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Alternate Instrument Check', 'alternate-instrument-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Functional Check', 'functional-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Control Chart', 'control-chart', 'As per SOP', 'Within Uncertainty Limit'),
        ('Replicate Check', 'replicate-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Retesting Check', 'retesting-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Correlation Check', 'correlation-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Results Review Check', 'results-review-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Intralab Check', 'intralab-check', 'As per SOP', 'Within Uncertainty Limit'),
        ('Blind Sampling Check', 'blind-sampling-check', 'As per SOP', 'Within Uncertainty Limit')
) AS v(check_name, check_type_slug, frequency, acceptance_criteria)
WHERE NOT EXISTS (SELECT 1 FROM public.iqc_plan_items LIMIT 1);
