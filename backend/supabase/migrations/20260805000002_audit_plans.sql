-- Audit Plan master (ISO 17025 internal / external audit scheduling)

CREATE TABLE IF NOT EXISTS public.audit_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_type TEXT NOT NULL DEFAULT 'internal'
        CHECK (audit_type IN ('internal', 'external')),
    proposed_from DATE NOT NULL,
    proposed_to DATE NOT NULL,
    audit_id TEXT NOT NULL,
    next_audit_date DATE NOT NULL,
    team_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_plans_audit_id_unique UNIQUE (audit_id),
    CONSTRAINT audit_plans_proposed_range_check CHECK (proposed_from <= proposed_to)
);

CREATE INDEX IF NOT EXISTS idx_audit_plans_audit_type
    ON public.audit_plans (audit_type);

CREATE INDEX IF NOT EXISTS idx_audit_plans_proposed_from
    ON public.audit_plans (proposed_from DESC);

CREATE INDEX IF NOT EXISTS idx_audit_plans_created_at
    ON public.audit_plans (created_at DESC);

DROP TRIGGER IF EXISTS trg_audit_plans_updated_at ON public.audit_plans;
CREATE TRIGGER trg_audit_plans_updated_at
    BEFORE UPDATE ON public.audit_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audit_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_audit_plans_authenticated_all ON public.audit_plans;
CREATE POLICY lims_audit_plans_authenticated_all ON public.audit_plans
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
