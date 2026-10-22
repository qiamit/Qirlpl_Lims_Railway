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

## Stage 1: integrity of records (Sprint 1–2)

| ID | Item | Clauses | Done means | Status |
|---|---|---|---|---|
| P1-1 | Audit trail on every technical and quality table, reason for change, append-only log, Audit Trail page for Director and QM | 7.5.2, 7.11, 8.4 | Any change to a technical record shows who, when, old → new, and why; the log cannot be edited | In progress |
| P1-1b | Soft delete instead of hard delete (about 51 screens); block deleting issued/closed records in the database | 7.5.2, 8.4 | Deleted records stay recoverable with who/why; issued records cannot be deleted | Planned |
| P1-2 | Password re-entry when issuing a test report; who issued it stored; frozen archive copy with SHA-256 | 7.8.1, 7.8.2, 7.11 | Each issued report has an authenticated issuer and a hash-checked archived snapshot | In progress |
| P1-2b | Re-print issued reports from the archive; same flow for calibration certificates | 7.8.2, 7.8.8 | A re-print matches the issued report even if masters change later | Planned |
| P1-12 | Calibration due date printed only when the customer asked for it (SRF flag) | 7.8.4.3 | No due date on certificates unless the SRF says so | In progress |
| P1-12b | Amendment and reissue flow for calibration certificates | 7.8.8 | Amended certificate references the original | Planned |
| P1-10 | Impartiality risk register and confidentiality records pages; yearly impartiality/COI and confidentiality declarations signed in the app | 4.1, 4.2 | Every active employee has signed both declarations this year; Director sees pending ones | In progress |
| P1-10b | AI data guard: per-client consent, redaction before sending to AI providers, switch to turn AI off for client data | 4.2 | No client data reaches an AI provider without consent | Planned |

## Stage 2: results and reporting (Sprint 3–4)

| ID | Item | Clauses | Status |
|---|---|---|---|
| P1-3 | Decision-rule master (ILAC G8), MU-aware conformity (result ± U), rule printed on reports and certificates; remove the hard-coded "no conformity statement" note | 7.1.3, 7.8.6 | Planned |
| P1-8 | Equipment and CRMs used recorded on each result; block overdue/out-of-service equipment and expired CRMs; certificate acceptance record and calibration history | 6.4, 6.5, 7.5.1 | Planned |
| P1-6 | Environmental monitoring: areas with limits, daily logs, alerts that open an NC, conditions on results and reports | 6.3, 7.8.3 | Planned |

## Stage 3: people, methods, PT, management review (Sprint 5–6)

| ID | Item | Clauses | Status |
|---|---|---|---|
| P1-4 | Authorization matrix (employee × test/method × perform/review/sign/opinion) enforced at allocation, review and signing; structured competence, training and monitoring records | 6.2 | Planned |
| P1-5 | PT/ILC module: 4-year plan, rounds, z/En scores, NC on unsatisfactory results | 7.7.2 | Planned |
| P1-7 | Method verification and validation records; standard status (current/withdrawn) | 7.2 | Planned |
| P1-11 | Management review meeting: attendance, minutes per input, outputs, actions | 8.9 | Planned |
| P1-9 | LIMS validation pack, software change-control register, IT incident log (mostly documents plus small registers) | 7.11 | Planned |

## Stage 4: P2 and P3 items

Document-control e-approval (8.3), risk scoring and heat map (8.5), unified
CAPA register (8.7), control charts (7.7), database-level module access
(7.11.3 a), supplier module (6.6), equipment acceptance and correction factors
(6.4), opinions section (7.8.7), audit coverage matrix (8.8), retention
schedule (8.4), then the P3 list in the audit report.

## Login, security, user management, Lab Settings (runs alongside)

| ID | Item | Status |
|---|---|---|
| S-4 | Password policy of 10+ characters, same in UI, functions and GoTrue | Planned |
| S-5/6/7 | Change password, Director reset with must-change, forgot password by email | Planned |
| S-8/9 | Rate limits, 30-minute idle timeout, MFA for Director and signatories | Planned |
| S-10/11/12 | All profile edits through one server function; keep at least one active Director; deactivate instead of delete | Planned |
| S-14/15 | Database-level module access (view = read-only) | Planned |
| S-16/17 | `lab_settings` writes through Director-only functions; sanitise letterhead and template HTML | Planned |
| S-19 | Remove `'unsafe-inline'` from the CSP | Planned |

## Finance (Consultancy Pro port)

| Phase | Status |
|---|---|
| 0 Profile production | Done (22 Oct) |
| 1 Access helpers, document numbering | Built (migrations not applied) |
| 2 Typed sale tables, GST supply mode, backfill | Planned: waits for finance users to sync browser records |
| 3–8 | Planned (see `backend/scripts/finance-phase2-mapping.md` and the audit report) |
