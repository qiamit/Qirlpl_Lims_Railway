-- Consent letters generated from Consent Letter master (client, IS code, test parameters).

CREATE TABLE IF NOT EXISTS public.consent_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_letter_no text NOT NULL,
    letter_date text NOT NULL,
    client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name text NOT NULL,
    client_address text,
    is_code_id uuid REFERENCES public.is_codes(id) ON DELETE SET NULL,
    is_code_label text,
    is_number text,
    revision_year text,
    product_title text,
    test_parameter_names text[] NOT NULL DEFAULT '{}',
    clause_summary text,
    sample_id uuid REFERENCES public.samples(id) ON DELETE SET NULL,
    srf_number text,
    generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    generated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_letters_generated_at
    ON public.consent_letters (generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_letters_consent_letter_no
    ON public.consent_letters (consent_letter_no);

DROP TRIGGER IF EXISTS trg_consent_letters_updated_at ON public.consent_letters;
CREATE TRIGGER trg_consent_letters_updated_at
    BEFORE UPDATE ON public.consent_letters
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.consent_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_consent_letters_authenticated_all ON public.consent_letters;
CREATE POLICY lims_consent_letters_authenticated_all ON public.consent_letters
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
