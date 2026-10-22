-- ISO/IEC 17025:2017 clause 4.2 (confidentiality), gap item P1-10b: AI data guard.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks.
--
-- The QI Assistant sends page context to third-party LLM providers (OpenAI,
-- DeepSeek, OpenRouter, ...). This migration adds the switches the frontend
-- guard (frontend/src/lib/aiDataGuard.ts) and the functions service
-- (backend/functions/server.mjs) read:
--
--   * lab_settings.ai_client_data_mode
--       'off'                -> client / sample record context is never sent;
--                               the assistant answers general questions only.
--       'redact' (default)   -> client names, contacts, e-mails, phones,
--                               GSTIN/PAN, addresses, PIN codes and SRF /
--                               report / ULR numbers are replaced with
--                               placeholders before sending; free-text remarks
--                               are dropped. Results, units and specs are kept.
--       'allow_with_consent' -> sent as-is only when every client in the
--                               context has consented; otherwise redacted.
--   * clients.ai_data_consent / ai_data_consent_at / ai_data_consent_by
--       The client's consent to processing by AI assistants, and when / by
--       whom the flag was last changed.
--
-- Idempotent: safe to run more than once. Grants are unchanged (new columns
-- inherit the table grants). The frontend treats missing columns as mode
-- 'redact' and consent false, so it keeps working before this is applied.

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS ai_client_data_mode text NOT NULL DEFAULT 'redact';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lab_settings_ai_client_data_mode_check'
      AND conrelid = 'public.lab_settings'::regclass
  ) THEN
    ALTER TABLE public.lab_settings
      ADD CONSTRAINT lab_settings_ai_client_data_mode_check
      CHECK (ai_client_data_mode IN ('off', 'redact', 'allow_with_consent'));
  END IF;
END
$$;

COMMENT ON COLUMN public.lab_settings.ai_client_data_mode IS
  'ISO 17025 4.2: client data sent to AI providers. off = never send client/sample context; redact (default) = placeholders for identifying data; allow_with_consent = send as-is only for clients who consented.';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_data_consent boolean NOT NULL DEFAULT false;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_data_consent_at timestamptz;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_data_consent_by uuid;

COMMENT ON COLUMN public.clients.ai_data_consent IS
  'ISO 17025 4.2: client consents to its data being processed by AI assistants (third-party LLM providers).';

COMMENT ON COLUMN public.clients.ai_data_consent_at IS
  'When the AI data consent flag was last changed.';

COMMENT ON COLUMN public.clients.ai_data_consent_by IS
  'auth user id of the staff member who last changed the AI data consent flag.';

NOTIFY pgrst, 'reload schema';
