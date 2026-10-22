# Finance port, Phase 2: mapping plan

Based on the Phase 0 profile run on production on 22 Oct 2026
(`finance_phase0_profile.sql` plus a few read-only schema checks, all in a
`READ ONLY` transaction). Nothing was changed. Phase 2 moves invoices,
proformas, credit notes and payment receipts from the single JSON
`sale_documents` table to typed tables, as in Consultancy Pro.

## 1. What production holds today

| Item | Finding | What it means for Phase 2 |
|---|---|---|
| Prerequisite functions | `app_is_known_staff`, `app_is_laboratory_director` exist | 20261009063000 is applied; nothing to add. |
| `sale_documents` | Table exists, **0 rows**, and `authenticated` has **no INSERT grant** (20261022000000 not applied) | Every proforma, invoice, credit note and receipt made so far exists only in the browser of the person who made it (`localStorage` key `lims.saleDocuments.<kind>`). Clearing browser data or changing PC loses them. The backfill has nothing to copy until these records reach the database. |
| `document_series` | Not present | Phase 1 migrations not applied (expected). |
| Quotations | 3 rows: Draft 1, Sent 1, Finalized 1; 6 line items. One renamed number `QI/QTN/2026-0001-R2`; highest serial 2 | Quotations keep their table (same as the reference). The QUOTATION series seeds from `QI/QTN/2026-`, so the next one is `QI/QTN/2026-0003`. `…-R2` is left as it is. |
| Lab Settings prefixes | `Quotation Number = QI/QTN/2026-` plus 6 non-finance prefixes | Phase 1 seed picks the right row. |
| Line HSN/SAC | `9027` (instruments) ×3 and `998321` ×3, all at 18% GST | Keep HSN/SAC and GST % per line from the product master. Do not port the reference's fixed consultancy SAC 998393 or its "no GST on quotation/proforma" rule. The accountant should confirm the SAC for testing and calibration services. |
| Clients | 146 (145 Manufacturer, 1 Calibration Laboratory); 80 have a GSTIN; no `pan` or `archived_at` columns | GST supply mode: GSTIN for 80 clients, the state name for the other 66. Add `pan` and `archived_at` (additive) because ported functions use them. |
| Lab | GSTIN set; state Chhattisgarh (code 22) | Intra-state (CGST+SGST) when the client is in state 22, otherwise IGST. |
| Company types | Options include Supplier, Service Provider, PT Provider, Calibration Laboratory | Use these as vendor types in Phase 5 instead of the reference's "Vendor/Both". |
| Finance access | 6 active accounts (4 people, one of them a Laboratory Director) have Edit on all five sale pages, all as per-user rules. Two people each have two accounts with these rules. | Path-based database checks (Phase 1 helpers) match these rules, so no finance user is locked out. |
| Rule hygiene | 53 rules, all per-user; 26 user subjects, 1 belongs to a deleted account; several people have more than one login (one has 6) | User-management clean-up item (security report), not a Phase 2 blocker. Per-user rules must be copied when someone gets a new login. |

## 2. Order of work

1. **Apply `20261022000000_grant_sale_documents_and_registers.sql` soon** (needs your go-ahead). Until then finance records exist only in browsers.
2. Ask the six finance users to open Proforma Invoice, Invoice, Credit Note and Payment Receipt once, on every PC and browser they used. The existing importer uploads their browser records; clashing numbers get `-LOCAL`.
3. Re-run `finance_phase0_profile.sql` (queries 3–9) to see the real statuses, payment methods, payload keys and `-LOCAL` rows.
4. Apply Phase 1 (`20261023000001`, `20261023000002`).
5. Phase 2 migrations and frontend below.

## 3. Phase 2 migrations

| File | Contents |
|---|---|
| `20261024000001_finance_sale_books.sql` | `finance_proforma_invoices`, `finance_tax_invoices`, `finance_credit_notes`, each with a `_lines` table; `transactions` for money in and out. `clients.pan`, `clients.archived_at`. RLS with `app_can_view`/`app_can_edit` on the page paths, line tables gated by their parent, the restrictive known-staff policy, and grants in the same file. `write_audit_log` triggers on every table. |
| `20261024000002_finance_gst_supply_mode.sql` | Reference f2 `sale_gst_supply_mode(supplier_gstin, recipient_gstin)` with checksum validation, plus a LIMS wrapper `sale_gst_supply_mode_for_client(client_id)` that falls back to the client's state name when there is no GSTIN. |
| `20261024000003_backfill_sale_documents_to_finance.sql` | Copies `sale_documents` into the typed tables with the mapping below, keeping ids and numbers; `ON CONFLICT (id) DO NOTHING`, so it can run again after late browser uploads. `sale_documents` stays, read-only, until sign-off. |
| `20261024000004_document_series_typed_tables.sql` | `document_series_highest_serial` reads the new tables (and `sale_documents` as legacy), so numbering keeps counting above every saved number. |

### Header mapping (`sale_documents` → typed header)

| From (`sale_documents` / payload) | To | Note |
|---|---|---|
| `id` | `id` | Kept, so printed and linked numbers stay valid. |
| `document_number` | `proforma_number` / `tax_invoice_number` / `credit_note_number` / `transactions.receipt_number` | Unique, case-insensitive. |
| `document_date` | `*_date` | |
| `client_id`, `client_name` | `client_id` (FK to `clients`, `ON DELETE SET NULL`), `client_name` | |
| `status` | `*_status` (`pending` / `accepted` / `cancelled`) and `extra.ui_status` | Reference rule: Rejected or Expired → cancelled; Finalized, Accepted or Converted → accepted; everything else → pending. `ui_status` keeps the exact LIMS label (Draft, Sent, Proforma, Invoice) so the screens show what users chose. |
| `payload.subtotal`, `gst_amount`, `grand_total` | `subtotal`, `tax_total`, `grand_total` | numeric(14,2). |
| `payload.discount_amount`, `transportation_charges`, `packaging_charges` | `extra.charges` | |
| contact fields, `client_address`, `client_gst_number`, `subject`, `reference_no`, `valid_until`, `payment_terms`, `notes`, `remarks`, `signature_*` | `extra` | Same layout as the reference bridge columns. |
| (computed) | `gst_supply_mode` (`intra` / `inter`) | From the lab GSTIN and the client GSTIN or state. |
| whole payload | `extra.legacy_payload` | For audit and rollback. |
| `created_at` | `created_at`; `created_by` defaults to `auth.uid()` for new rows | |

### Line mapping (`payload.line_items[]` → `*_lines`)

| From | To |
|---|---|
| `line_no` | `line_no` |
| `description` | `item_description` |
| `unit` | `unit_of_item` (default `Nos`) |
| `quantity`, `rate` | `qty`, `unit_rate` (numeric) |
| `discount_percent` | `line_discount_percent` (numeric; the reference stores text) |
| `gst_percent` | `gst_rate` (numeric; the reference stores text) |
| `amount` | `line_subtotal`; `line_tax` and `line_total` computed |
| `hsn_sac`, `make`, `details`, `item_code`, `line_remarks`, `delivery_period` | `hsn_sac` column (needed for the HSN report), the rest in `extra` |

### Payment receipts (`paymentReceipt` → `transactions`, `payment_flow = 'in'`)

| From | To |
|---|---|
| `document_number` | `receipt_number` |
| `grand_total` | `amount` |
| `payload.reference_no` (holds the payment method) | `mode_of_payment`: Bank → `bank`, Cash → `cash`, UPI → `upi`, Cheque → `cheque`, Other → `other` |
| invoice reference, if any | `invoice_id` (real FK, an improvement over the reference's number-text match) and `extra.invoice_reference_no` |

Credit notes get the same `invoice_id` link.

## 4. Phase 2 frontend

- Replace `sale/shared/saleDocumentsApi.ts` with the reference version, adapted to the mapping above. The browser importer writes to the new tables instead of `sale_documents`.
- Port `lib/indiaValidators.ts` and the GST-mode and TDS parts of `financeRules.ts`; add the supply-mode field to the form and to the invoice print (CGST+SGST or IGST split).
- `clientSaleBalance.ts` reads the new tables.

## 5. Open questions for the lab

1. Which SAC should testing and calibration services use (for example 998346)? The quotation lines use 998321 today.
2. Is HSN 9027 (instruments) sold as goods? If yes, stock tracking (Phase 8) may matter.
3. Should cancelled documents keep their number (recommended for GST) instead of being deleted? Today the screens hard-delete.
