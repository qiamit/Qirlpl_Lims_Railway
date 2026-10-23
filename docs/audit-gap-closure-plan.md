# QIRLPL LIMS: audit gap-closure plan

Source: the October 2026 audit (security, ISO/IEC 17025:2017 gap assessment,
login/user management/Lab Settings plan, finance port). This file is the
working plan: each item has an ID from the audit, the work, what "done" means,
and whether it needs Amit's go-ahead because it touches production.

Rules for every item:

- Code goes on a branch and reaches production only by merging to `main`
  (auto-deploys to Railway) after Amit approves.
- Every migration is idempotent, carries its own GRANTs, and is applied by
  hand only with Amit's go-ahead, after a fresh Railway backup.
- Frontend changes must keep working before their migration is applied.
- New technical or quality tables get the audit-log trigger and the
  known-staff RLS gate.

Status key: **Done**, **Built** (on the branch, not deployed/applied),
**In progress**, **Planned**, **Needs approval** (a production step waiting
for Amit).

## Stage 0: production safety (this week)

| ID | Item | Status |
|---|---|---|
| B-1 | Daily and weekly Postgres backups, on-demand backup before changes | Done (22 Oct) |
| I-4 | Grants migration `20261022000000` (sale documents, registers) | Done (22 Oct) |
| H-1 | Turn off public sign-up: `GOTRUE_DISABLE_SIGNUP=true` on the auth service | Needs approval |
| H-1b | Review accounts that signed themselves up (security SQL checks 10, 11, 15) | Needs approval (read-only) |
| C-1 … L-6 | Apply `20261022120000_security_hardening.sql`, then smoke-test | Needs approval |
| DEP-1 | Merge the branch to `main` (PWA, responsive, security code, finance Phase 1 code) | Needs approval |
| L-8 | Set `PDF_ALLOWED_ORIGINS` on the PDF service | Needs approval |
| B-2 | Record one restore test (restore a backup into a new service, check, delete) | Planned |
| U-1 | Clean up duplicate logins and the orphan module-access rule | Planned (needs Amit's list of who keeps which login) |
| DEP-2 | Production frontend sends no security headers (served as a static site by Railpack's automatic SPA/Caddy mode). To serve through `frontend/server.mjs` (CSP, HSTS, X-Frame-Options): set `RAILPACK_NO_SPA=1`, remove `RAILPACK_SPA_OUTPUT_DIR`, and set the start command to `node server.mjs`. Verified on staging on 23 Oct 2026 (headers present). | Needs approval |
| GT-1 | GoTrue settings: SMTP (password reset emails), password minimum 10, MFA TOTP enable, refresh-token rotation, rate limits, site URL and `/auth/reset` in the allow list | Needs approval |

## Stage 1: integrity of records (Sprint 1–2)

| ID | Item | Clauses | Done means | Status |
|---|---|---|---|---|
| P1-1 | Audit trail on every technical and quality table, reason for change, append-only log, Audit Trail page for Director and QM | 7.5.2, 7.11, 8.4 | Any change to a technical record shows who, when, old → new, and why; the log cannot be edited | Built |
| P1-1b | Soft delete instead of hard delete (about 51 screens); block deleting issued/closed records in the database; Recycle Bin; next numbers skip deleted records; reason-for-change prompts on key screens | 7.5.2, 8.4 | Deleted records stay recoverable with who/why; issued records cannot be deleted | Built (more screens can get reason prompts) |
| P1-2 | Password re-entry when issuing a test report; who issued it stored; frozen archive copy with SHA-256 | 7.8.1, 7.8.2, 7.11 | Each issued report has an authenticated issuer and a hash-checked archived snapshot | Built |
| P1-2b | Re-print issued reports from the archive; same flow for calibration certificates | 7.8.2, 7.8.8 | A re-print matches the issued report even if masters change later | Built for test reports; calibration certificates planned |
| P1-12 | Calibration due date printed only when the customer asked for it (SRF flag) | 7.8.4.3 | No due date on certificates unless the SRF says so | Built |
| P1-12b | Amendment and reissue flow for calibration certificates | 7.8.8 | Amended certificate references the original | Built |
| P1-10 | Impartiality risk register and confidentiality records pages; yearly impartiality/COI and confidentiality declarations signed in the app | 4.1, 4.2 | Every active employee has signed both declarations this year; Director sees pending ones | Built |
| P1-10b | AI data guard: per-client consent, redaction before sending to AI providers, switch to turn AI off for client data | 4.2 | No client data reaches an AI provider without consent | Built |

### Migrations waiting to be applied (in this order, after a fresh backup)


1. `20261022120000_security_hardening.sql`
2. `20261023000001_finance_access_helpers.sql`
3. `20261023000002_finance_document_series.sql`
4. `20261024100000_audit_trail_expansion.sql`
5. `20261024100100_srf_customer_requests_due_date.sql`
6. `20261024100200_personnel_declarations.sql`
7. `20261024100300_report_issue_signature.sql`
8. `20261025100000_soft_delete.sql` (needs the audit trail migration first)
9. `20261025100100_calibration_certificate_amendments.sql`
10. `20261025100200_ai_data_guard.sql`
11. `20261026100000_decision_rules.sql`
12. `20261026100100_equipment_traceability.sql`
13. `20261026100200_environmental_monitoring.sql`
14. `20261026100300_result_environment.sql`
15. `20261027100000_proficiency_testing.sql`
16. `20261027100100_method_validation.sql`
17. `20261027100200_management_review_meetings.sql`
18. `20261027100300_lims_validation_registers.sql`
19. `20261027100400_personnel_competence.sql`
20. `20261028100000_document_control_and_retention.sql`
21. `20261028100100_risk_scoring_audit_coverage.sql`
22. `20261028100200_control_charts_equipment_acceptance.sql` (sets equipment with an open breakdown to Out of Service immediately)
23. `20261028100300_supplier_management.sql`
24. `20261029100000_login_security.sql`
25. `20261029100100_user_admin_lab_settings.sql`
26. `20261029100200_db_module_access.sql` (starts in 'log' mode; nothing is blocked)
27. `20261029100300_capa_opinions_observations.sql`
28. `20261030100000_finance_sale_books.sql` (only after finance users have synced their browsers)
29. `20261030100100_finance_gst_supply_mode.sql`
30. `20261030100200_backfill_sale_documents_to_finance.sql`
31. `20261030100300_document_series_typed_tables.sql`
32. `20261031100000_p3_good_practice.sql`
33. `20261031100100_equipment_history_tables.sql`
34. `20261101100000_finance_cancel_keeps_number.sql`
35. `20261101100100_report_number_unique.sql` (only lists duplicate report numbers if any exist; resolve them, then re-run)
36. `20261101100200_sampling.sql` (module stays off until switched on in Lab Settings)
37. `20261101100300_retention_minimum.sql`
38. `20261102100000_unique_key_reconciliation.sql` (adds the unique keys production never got; keys whose rows hold duplicates are listed and skipped, so clean the listed records and run it again)
39. `20261102100100_constraint_reconciliation.sql` (adds the 12 foreign keys and 62 CHECK rules production never got; rules that existing rows break are listed and skipped)
40. `20261102100200_sample_delete_roles.sql` (only the Laboratory Director, Quality Manager and Sample Cell staff can delete a sample; lab decision 23 Oct)
41. `20261102100300_amendment_reason_required.sql` (an amendment record must carry its reason; lab decision 23 Oct)
42. `20261102100400_ulr_cross_check.sql` (a test report and a calibration certificate never share a ULR; generators read every ULR in use; existing clashes are listed, not changed)
43. `20261102100500_certificate_number_unique.sql` (a calibration certificate number, amended or replaced ones included, is never given to another job)
44. `20261102100600_calibration_review_not_by_performer.sql` (the person who calibrated cannot approve its raw data; lab decision 23 Oct)

Every migration is idempotent and the frontend works before and after each one, so the branch can be merged first. Apply them on a staging copy of production first and run `docs/lims-validation/OQ-test-scripts.md` there.

## Stage 2: results and reporting (Sprint 3–4)

| ID | Item | Clauses | Status |
|---|---|---|---|
| P1-3 | Decision-rule master (ILAC G8), MU-aware conformity (result ± U), rule printed on reports and certificates; remove the hard-coded "no conformity statement" note | 7.1.3, 7.8.6 | Built |
| P1-8 | Equipment and CRMs used recorded on each result; block overdue/out-of-service equipment and expired CRMs; certificate acceptance record and calibration history | 6.4, 6.5, 7.5.1 | Built |
| P1-6 | Environmental monitoring: areas with limits, daily logs, alerts that open an NC, conditions on results and reports | 6.3, 7.8.3 | Built |

## Stage 3: people, methods, PT, management review (Sprint 5–6)

| ID | Item | Clauses | Status |
|---|---|---|---|
| P1-4 | Authorization matrix (employee × test/method × perform/review/sign/opinion) enforced at allocation, review and signing; structured competence, training and monitoring records | 6.2 | Built |
| P1-5 | PT/ILC module: 4-year plan, rounds, z/En scores, NC on unsatisfactory results | 7.7.2 | Built |
| P1-7 | Method verification and validation records; standard status (current/withdrawn) | 7.2 | Built |
| P1-11 | Management review meeting: attendance, minutes per input, outputs, actions | 8.9 | Built |
| P1-9 | LIMS validation pack, software change-control register, IT incident log (mostly documents plus small registers) | 7.11 | Built |

## Stage 4: P2 and P3 items

| ID | Item | Clauses | Status |
|---|---|---|---|
| P2-1 | Document control e-approval, periodic review, distribution and read acknowledgement, watermarks | 8.3 | Built |
| P2-2 | Risk scoring (inherent/residual), owner, review dates, heat map | 8.5, 4.1 | Built |
| P2-3 | Unified CAPA register, complaint → NC, hold on report issue while an NC is open | 7.9, 7.10, 8.7 | Built |
| P2-4 | IQC control charts with Westgard rules, NC on violation | 7.7.1, 7.7.3 | Built |
| P2-5 | Database-level module access (log → enforce_writes → enforce), idle timeout, MFA, auth event log | 7.11.3 a | Built |
| P2-6 | Approved suppliers, evaluations, receipt inspection, subcontracting with consent | 6.6 | Built |
| P2-7 | Equipment acceptance, breakdown → Out of Service, correction factors, seal fields | 6.4 | Built |
| P2-8 | Opinions and interpretations (authorized persons only) | 7.8.7 | Built |
| P2-9 | Internal audit coverage matrix, auditor independence check | 8.8 | Built |
| P2-10 | Records retention schedule | 8.4 | Built |
| P2-11 | Entered-by per result, raw-data attachments, sample custody log | 7.4, 7.5.1 | Built |
| P3-1 | Sampling plan and record | 7.3, 7.8.5 | Built, switched off until the lab starts sampling |
| P3-2, 3, 5, 6, 7, 9 | MU by range band, org chart + NABL ULR scope check, CRM opened-on/expiry, public complaints process + KPIs, objective KPIs, SRF contract change log | various | Built |
| P3-4, 8 | Equipment QR status labels; append-only maintenance and intermediate-check history | 6.4.8, 6.4.10 | Built |
| CF-04 | Results exactly on a tolerance limit now conform (floating-point fix) | 7.8.6 | Done |
| EV-1 | Calibration/IQC formulas evaluated without `new Function` (needed for the CSP) | 7.11 | Done |

## Login, security, user management, Lab Settings (runs alongside)

| ID | Item | Status |
|---|---|---|
| S-4 | Password policy of 10+ characters, same in UI, functions and GoTrue | Built (GoTrue setting needs approval) |
| S-5/6/7 | Change password, Director reset with must-change, forgot password by email | Built (reset email needs GoTrue SMTP) |
| S-8/9 | Rate limits, 30-minute idle timeout, MFA for Director and signatories | Built (MFA optional until enforced) |
| S-10/11/12 | All profile edits through one server function; keep at least one active Director; deactivate instead of delete | Built |
| S-14/15 | Database-level module access (view = read-only) | Built (starts in log mode) |
| S-16/17 | `lab_settings` writes through Director-only functions; sanitise letterhead and template HTML | Built |
| S-19 | Remove `'unsafe-inline'` from the CSP | Built (live only after DEP-2) |

## Finance (Consultancy Pro port)

| Phase | Status |
|---|---|
| 0 Profile production | Done (22 Oct) |
| 1 Access helpers, document numbering | Built (migrations not applied) |
| 2 Typed sale tables, GST supply mode, backfill | Built (apply after finance users sync browser records) |
| 3–8 | Planned (see `backend/scripts/finance-phase2-mapping.md` and the audit report) |

## Decisions (Amit, 22 Oct 2026)

- An amended calibration certificate keeps the original ULR (current behaviour of P1-12b).
- The amendment reason is printed on the amended certificate (current behaviour).
- PDFs of re-printed test reports without an archived copy keep the
  "Regenerated from current records" note, including when emailed to customers.
- Finish all stages first, then test everything together before anything goes to production.

## Decisions (Amit, 23 Oct 2026)

- SAC code for testing and calibration services: **9983**.
- Cancelled finance documents keep their number (cancel, never delete or reuse).
- Rounding follows **IS 2:1960** (round half to even; keep the declared decimals).
  This includes the spreadsheet functions `ROUND` and `MROUND` inside raw data
  sheet, column and point formulas (`ROUNDUP`/`ROUNDDOWN` stay directional).
- The lab does not sample today; the sampling module is built but switched off
  (Lab Settings → sampling in use) until needed. Until then the Quality Manual
  states the exclusion of 7.3.
- Every record is retained for **at least 3 years** (enforced in the retention
  schedule; the seeded rules are 6–8 years).
- Complaints are acknowledged within **5 working days** (public complaints page).
- Plan a Railway staging copy for full testing before production
  (`docs/staging-plan.md`).

Open after these decisions:
- Calibration raw data sheets and certificates have no frozen display copy,
  so reopening an old sheet whose value sits exactly on a half shows the
  IS 2 result.
