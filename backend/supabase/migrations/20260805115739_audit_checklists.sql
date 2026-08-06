-- Audit Checklist items (one row per ISO 17025 clause per audit plan)

CREATE TABLE IF NOT EXISTS public.audit_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_plan_id UUID NOT NULL REFERENCES public.audit_plans (id) ON DELETE CASCADE,
    clause_no TEXT NOT NULL,
    clause_matter TEXT NOT NULL,
    conformity TEXT NOT NULL DEFAULT ''
        CHECK (conformity IN ('', 'yes', 'no', 'na')),
    remark TEXT NOT NULL DEFAULT '',
    non_conformity TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_checklist_items_plan_clause_unique UNIQUE (audit_plan_id, clause_no)
);

CREATE INDEX IF NOT EXISTS idx_audit_checklist_items_plan_id
    ON public.audit_checklist_items (audit_plan_id);

CREATE INDEX IF NOT EXISTS idx_audit_checklist_items_sort
    ON public.audit_checklist_items (audit_plan_id, sort_order);

DROP TRIGGER IF EXISTS trg_audit_checklist_items_updated_at ON public.audit_checklist_items;
CREATE TRIGGER trg_audit_checklist_items_updated_at
    BEFORE UPDATE ON public.audit_checklist_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audit_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_audit_checklist_items_authenticated_all ON public.audit_checklist_items;
CREATE POLICY lims_audit_checklist_items_authenticated_all ON public.audit_checklist_items
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
