-- Ensure consent letter numbers stay unique.

CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_letters_consent_letter_no_unique
    ON public.consent_letters (consent_letter_no);
