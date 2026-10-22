-- Finance port, Phase 0: read-only profile of production finance data.
-- Every statement is a SELECT; nothing here changes data. Run it as an admin
-- role (psql or the Railway query tab) before applying any finance migration,
-- and keep the output with the change record.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f backend/scripts/finance_phase0_profile.sql
--
-- What to look for is written above each query.

BEGIN TRANSACTION READ ONLY;

-- 1. Prerequisite migrations. Expect all four functions/tables to exist.
--    20261009063000 defines app_is_known_staff / app_is_laboratory_director,
--    20261009120000 creates sale_documents, 20261022000000 grants it.
SELECT
  to_regprocedure('public.app_is_known_staff()') IS NOT NULL         AS has_known_staff_fn,
  to_regprocedure('public.app_is_laboratory_director()') IS NOT NULL AS has_director_fn,
  to_regclass('public.sale_documents') IS NOT NULL                   AS has_sale_documents,
  to_regclass('public.document_series') IS NOT NULL                  AS has_document_series,
  has_table_privilege('authenticated', 'public.sale_documents', 'INSERT') AS sale_documents_granted;

-- 2. Quotations by status. Statuses 'Proforma' / 'Invoice' have no linked
--    document yet; Phase 3 conversion must handle them.
SELECT status, count(*) AS quotations, min(quotation_date) AS first, max(quotation_date) AS last
FROM public.quotations
GROUP BY status
ORDER BY count(*) DESC;

-- 3. Sale documents by kind and status (invoices, proformas, credit notes,
--    receipts). If this is empty while users have created invoices, those
--    rows are still in browsers' localStorage: ask each user to open every
--    sale page once after the grants migration so they upload.
SELECT document_kind, status, count(*) AS documents, sum(grand_total) AS total,
       min(document_date) AS first, max(document_date) AS last
FROM public.sale_documents
GROUP BY document_kind, status
ORDER BY document_kind, count(*) DESC;

-- 4. Numbers renamed on import collisions (…-LOCAL) or by the quotation
--    de-duplication (…-R2, TMPQTN-…). The backfill must keep these as they are.
SELECT 'sale_documents' AS source, document_kind AS kind, document_number AS number
FROM public.sale_documents
WHERE document_number ~* '(-LOCAL|-R[0-9]+)$'
UNION ALL
SELECT 'quotations', 'quotation', quotation_number
FROM public.quotations
WHERE quotation_number ~* '(^TMPQTN-|-R[0-9]+$)'
ORDER BY 1, 2, 3;

-- 5. Number formats in use per kind: the prefix (everything before the
--    trailing digits), how many rows use it, and the highest serial.
--    20261023000002_finance_document_series.sql seeds the series from this.
WITH numbers AS (
  SELECT 'quotation'::text AS kind, btrim(quotation_number) AS number FROM public.quotations
  UNION ALL
  SELECT document_kind, btrim(document_number) FROM public.sale_documents
)
SELECT kind,
       substring(number FROM '^(.*?)[0-9]+$') AS prefix,
       count(*) AS rows,
       max(substring(number FROM '([0-9]+)$')::bigint) AS highest_serial,
       max(length(number)) AS longest
FROM numbers
WHERE number ~ '[0-9]+$'
GROUP BY 1, 2
ORDER BY 1, rows DESC;

-- 6. Numbers longer than 16 characters (GST rule for tax invoices).
SELECT document_kind, document_number, length(document_number) AS chars
FROM public.sale_documents
WHERE length(btrim(document_number)) > 16
ORDER BY 1, 2;

-- 7. Payload shape: which keys the jsonb payload carries, per kind. The
--    Phase 2 backfill maps each of these to a column or to extra.
SELECT d.document_kind, k.key, count(*) AS rows_with_key
FROM public.sale_documents d
CROSS JOIN LATERAL jsonb_object_keys(d.payload) AS k(key)
GROUP BY 1, 2
ORDER BY 1, 3 DESC, 2;

-- 8. Payment methods and line counts inside payloads. Payment receipts keep
--    the payment method in reference_no; other kinds keep a free-text reference.
SELECT document_kind,
       CASE WHEN document_kind = 'paymentReceipt' THEN payload->>'reference_no' END AS payment_method,
       count(*) AS documents,
       sum(jsonb_array_length(COALESCE(payload->'line_items', '[]'::jsonb))) AS line_items
FROM public.sale_documents
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- 9. Documents whose client no longer exists in clients.
SELECT d.document_kind, d.document_number, d.client_id, d.client_name
FROM public.sale_documents d
LEFT JOIN public.clients c ON c.id = d.client_id
WHERE d.client_id IS NOT NULL AND c.id IS NULL
ORDER BY 1, 2;

-- 10. Lab Settings prefixes: the quotation prefix seeds the QUOTATION series.
SELECT name, prefix, last_number FROM public.lab_prefixes ORDER BY name;

-- 11. Who can reach finance today. Non-directors need a /finance rule in
--     module_access_rules; the new database checks follow the same rules.
SELECT subject_type, subject_key, subject_label, module_key, access_level
FROM public.module_access_rules
WHERE module_key = '/' OR module_key LIKE '/finance%'
ORDER BY subject_type, subject_key, module_key;

-- 12. Subjects that have a module matrix but no finance rule at all. These
--     users are blocked from finance in the UI already; listed for review.
SELECT DISTINCT r.subject_type, r.subject_key, r.subject_label
FROM public.module_access_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM public.module_access_rules f
  WHERE f.subject_type = r.subject_type
    AND f.subject_key = r.subject_key
    AND f.module_key LIKE '/finance%'
)
ORDER BY 1, 2;

ROLLBACK;
