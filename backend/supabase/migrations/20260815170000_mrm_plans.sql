-- MRM Plan & Agenda (ISO/IEC 17025 Clause 8.9.2 inputs)

CREATE TABLE IF NOT EXISTS public.mrm_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL,
  planned_from DATE NOT NULL,
  planned_to DATE NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  chairperson TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'planned', 'communicated')),
  notes TEXT NOT NULL DEFAULT '',
  communicated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mrm_plans_plan_code_unique UNIQUE (plan_code),
  CONSTRAINT mrm_plans_planned_range_check CHECK (planned_from <= planned_to)
);

CREATE INDEX IF NOT EXISTS idx_mrm_plans_planned_from
  ON public.mrm_plans (planned_from DESC);

CREATE INDEX IF NOT EXISTS idx_mrm_plans_status
  ON public.mrm_plans (status);

CREATE INDEX IF NOT EXISTS idx_mrm_plans_created_at
  ON public.mrm_plans (created_at DESC);

DROP TRIGGER IF EXISTS trg_mrm_plans_updated_at ON public.mrm_plans;
CREATE TRIGGER trg_mrm_plans_updated_at
  BEFORE UPDATE ON public.mrm_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mrm_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_mrm_plans_authenticated_all ON public.mrm_plans;
CREATE POLICY lims_mrm_plans_authenticated_all ON public.mrm_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mrm_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.mrm_plans (id) ON DELETE CASCADE,
  clause_letter TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL,
  included BOOLEAN NOT NULL DEFAULT true,
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mrm_agenda_items_plan_letter_unique UNIQUE (plan_id, clause_letter),
  CONSTRAINT mrm_agenda_items_letter_check CHECK (
    clause_letter IN (
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_mrm_agenda_items_plan_id
  ON public.mrm_agenda_items (plan_id, sort_order);

DROP TRIGGER IF EXISTS trg_mrm_agenda_items_updated_at ON public.mrm_agenda_items;
CREATE TRIGGER trg_mrm_agenda_items_updated_at
  BEFORE UPDATE ON public.mrm_agenda_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mrm_agenda_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_mrm_agenda_items_authenticated_all ON public.mrm_agenda_items;
CREATE POLICY lims_mrm_agenda_items_authenticated_all ON public.mrm_agenda_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mrm_plan_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.mrm_plans (id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  designation TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  marked_communicated_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mrm_plan_recipients_plan_user_unique UNIQUE (plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mrm_plan_recipients_plan_id
  ON public.mrm_plan_recipients (plan_id);

DROP TRIGGER IF EXISTS trg_mrm_plan_recipients_updated_at ON public.mrm_plan_recipients;
CREATE TRIGGER trg_mrm_plan_recipients_updated_at
  BEFORE UPDATE ON public.mrm_plan_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mrm_plan_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_mrm_plan_recipients_authenticated_all ON public.mrm_plan_recipients;
CREATE POLICY lims_mrm_plan_recipients_authenticated_all ON public.mrm_plan_recipients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
