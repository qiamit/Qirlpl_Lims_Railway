-- Non Conformity CAPA / action form (1:1 with checklist NC item)

CREATE TABLE IF NOT EXISTS public.audit_nc_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_item_id UUID NOT NULL REFERENCES public.audit_checklist_items (id) ON DELETE CASCADE,
    description_of_nc TEXT NOT NULL DEFAULT '',
    immediate_correction TEXT NOT NULL DEFAULT '',
    root_cause_analysis TEXT NOT NULL DEFAULT '',
    extent_check TEXT NOT NULL DEFAULT '',
    corrective_action_plan TEXT NOT NULL DEFAULT '',
    corrective_action_implemented TEXT NOT NULL DEFAULT '',
    review_of_effectiveness TEXT NOT NULL DEFAULT '',
    risk_opportunity_review TEXT NOT NULL DEFAULT '',
    changes_to_management_system TEXT NOT NULL DEFAULT '',
    objective_evidence TEXT NOT NULL DEFAULT '',
    verification_closure TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_nc_actions_checklist_item_unique UNIQUE (checklist_item_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_nc_actions_checklist_item_id
    ON public.audit_nc_actions (checklist_item_id);

DROP TRIGGER IF EXISTS trg_audit_nc_actions_updated_at ON public.audit_nc_actions;
CREATE TRIGGER trg_audit_nc_actions_updated_at
    BEFORE UPDATE ON public.audit_nc_actions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audit_nc_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_audit_nc_actions_authenticated_all ON public.audit_nc_actions;
CREATE POLICY lims_audit_nc_actions_authenticated_all ON public.audit_nc_actions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
