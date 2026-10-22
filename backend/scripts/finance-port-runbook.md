# Finance port runbook (Phases 0–1)

Reference app: Consultancy Pro (`Consultancy Management`). Full plan and gap
matrix: the audit report and `finance-gap.md` in the session notes. Nothing here
runs automatically; every production step needs Amit's go-ahead and should be
done while the lab is idle.

## Phase 0: prerequisites (no code changes)

1. Take a Postgres snapshot on Railway (Backups → Create), and note its name.
2. Run the read-only profile and keep the output:
   ```
   psql "$DATABASE_URL" -f backend/scripts/finance_phase0_profile.sql > finance_phase0_$(date +%F).txt
   ```
   Check query 1 first. If `has_known_staff_fn` is false, apply
   `20261009063000_security_role_checks.sql` before anything else.
3. If `sale_documents_granted` is false, apply
   `20261022000000_grant_sale_documents_and_registers.sql`. Then ask each finance
   user to open Proforma, Invoice, Credit Note and Payment Receipt once, so any
   records still kept in their browser upload. Re-run queries 3–5.
4. Apply `20261022120000_security_hardening.sql` and run its smoke test (see the
   audit report).
5. Review queries 11–12: anyone who should use finance needs a `/finance/...`
   rule in Lab Settings → Module Access (the Laboratory Director always has it).

## Phase 1: access helpers and document numbering

Apply in this order:

1. `20261023000001_finance_access_helpers.sql`: `app_is_admin`,
   `app_module_level`, `app_can_view`, `app_can_edit`. Read-only helpers; no
   policy changes.
2. `20261023000002_finance_document_series.sql`: `document_series` table,
   `peek_document_number`, `next_document_number`.

Check afterwards (read-only):

```sql
SELECT doc_type, prefix, next_number, pad_width, active_prefix FROM public.document_series ORDER BY doc_type;
-- As a signed-in finance user in the app: open a new Quotation and a new Invoice.
-- The number shown must be one more than the highest saved number with that prefix.
```

Then in the app (frontend deployed from the branch):

- Lab Settings → Prefix's shows **Finance document numbering**. Set the
  prefixes the lab wants (e.g. `QI/{FY}/INV/`; tax invoice numbers must stay
  within 16 characters) and save each row.
- Save one test quotation as a finance user and confirm the number. Delete it
  afterwards if it was only a test.

How numbering behaves after Phase 1:

- Opening a form shows a preview; the number is taken when the document is
  saved, so a cancelled form uses up no number.
- A number typed by hand is kept, and later numbers jump above it.
- Before the migration is applied, the forms keep the old browser-side
  numbering, so the frontend can be deployed first.

Rollback (if needed): the frontend falls back on its own when the functions are
missing, so dropping them is enough:

```sql
DROP FUNCTION IF EXISTS public.next_document_number(text), public.peek_document_number(text),
  public.document_series_candidate(text), public.document_series_highest_serial(text, text),
  public.document_series_module_path(text), public.document_series_resolve_prefix(text, date);
DROP TABLE IF EXISTS public.document_series;
```

## Phase 0 result (22 Oct 2026)

The profile was run read-only on production. `sale_documents` is empty and not
yet granted, so all proformas, invoices, credit notes and receipts are still in
users' browsers. Findings and the Phase 2 mapping: `finance-phase2-mapping.md`.

## Next: Phase 2

Typed sale tables (`finance_tax_invoices`, `finance_proforma_invoices`,
`finance_credit_notes` with lines) and `transactions`, GST supply mode, and a
backfill from `sale_documents`. Needs the Phase 0 profile output first, to map
statuses, payment modes and payload keys.
