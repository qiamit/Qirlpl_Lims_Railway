# QIRLPL LIMS: validation summary pack for QM sign-off

| | |
|---|---|
| Report no. | VR-2026-10-GOLIVE |
| Clause | ISO/IEC 17025:2017 7.11.2 (validated before use), 7.11.3, 7.11.6, 8.5 |
| Software | QIRLPL LIMS, branch `claude/priceless-ramanujan-5f501a`; application code as of commit `1afa449` (23 Oct 2026). Later commits on the branch change documents and the separate backup job only |
| Change validated | Go-live of the audit gap closure: 49 database migrations, 5 data fixes, frontend, gateway, functions and PDF changes (102 commits after `main`) |
| Environment | Staging environment on Railway, loaded with copies of production data (23 Oct morning; fresh copy again for the go-live dry run on 23 Oct evening) |
| Period | 22–23 Oct 2026 |
| Prepared by | Amit (with Claude) |
| For | Quality Manager (review), Laboratory Director (approval for use) |

This pack collects in one place what the QM needs to sign: the requirements,
the risk assessment, every test result, the go-live rehearsal and the
restore test. The detailed records it refers to are in `docs/staging-plan.md`,
`docs/go-live-runbook.md`, `docs/lims-validation/restore-test-B2.md` and
`docs/lims-validation/file-backup-plan.md`.

## 1. Basis

| Document | Version | State |
|---|---|---|
| User requirements `URS.md` (QIRLPL-LIMS-URS) | 1.0 | Draft, **to be signed** (section 10 of the URS) |
| Risk assessment `risk-assessment.md` (QIRLPL-LIMS-RA) | 1.0 + the update in section 6 below | Draft, **to be signed** |
| Test scripts `OQ-test-scripts.md` | 1.0 | OQ-01, OQ-02 run on screen; OQ-03…07 covered by API tests (section 4.3) |
| Calculation suite `frontend/scripts/validation/calculationCases.mjs` | at `1afa449` | 68 cases |
| Backup and restore `backup-restore-procedure.md` (QIRLPL-LIMS-BKP) | 1.1 | Draft |
| Change control `change-control-procedure.md` | 1.0 | Draft |

## 2. Test environment

| Item | Detail |
|---|---|
| App | https://frontend-staging-1898.up.railway.app (staging; own login keys, no email, AI off, own file bucket) |
| Database | Staging Postgres 18, copy of production with all 49 migrations and the 5 data fixes |
| Test accounts | 10 OQ accounts, one per role: Director, QM, Technical Manager (mechanical; calibration electrical), Testing Engineer (mechanical; electrical), Calibration Engineer, Sample Incharge, Receptionist, Auditor. Each with the module access of a real colleague in the same role. Passwords are not recorded here |
| Browser | Chromium (Claude desktop browser), desktop and 375 px phone width |
| Test data | Records named `OQ TEST` / `OQTEST`, `Oq Test Client 1`, SR261023/217-001, SRF-2026-0004…0008 (staging only) |

## 3. Summary of results

| Test | Cases / steps | Result |
|---|---|---|
| Calculation suite (`npm run validate:calculations`) | 68 | **68 pass**, 0 known deviations, 0 fail. Evidence `calculation-validation-2026-10-23T16-28-29-780Z.json` (sha256 d26cc80d52da1874…) |
| OQ-01 Sample to issued report and re-print (screen) | 12 | **12 pass** after fixes (step 11 amendment failed first; fixed, re-run passed) |
| OQ-02 Calibration to certificate (screen) | 9 | **7 pass, 2 blocked** by lab data (steps 4 MU and 7 certificate need real MU templates; the software now refuses a certificate without U) |
| API role tests, ten roles (`role_tests.mjs`) | 79 | **78 pass** on staging and after the restore test; the one failure is the once-a-year declaration rule refusing a second signature (expected). On the fresh go-live copy: 77 pass, the 2 failures expected because the dummy calibration data was removed |
| Security checks after the 23 Oct fixes (`extra_checks.mjs`) | 7 | **7 pass** |
| Report issue guard, database (`report_issue_guard_test.mjs`) | 11 | **11 pass** |
| File delete rule and audit, database (`storage_rule_test.mjs`) | 5 | **5 pass** |
| Go-live dry run on a fresh copy of production | Runbook steps 1–9 | **Pass**: 49 migrations, 5 data fixes, re-runs, checks, smoke test (section 7) |
| Restore test B-2 | Parts A, B, C | **Partial on 23 Oct**: database recovery proven; files had no backup. File backup added the same day and its restore proven (section 8) |

## 4. Results in detail

### 4.1 OQ-01 Sample to issued report (screen, 23 Oct)

| Step | Result |
|---|---|
| 1–2 SRF, client required | Pass: number given automatically; no save without a client |
| 3 Allocation | Pass; the authorization matrix asks for a reason when the engineer is not on it |
| 4 Results | Pass: average 570.20, s = 0.10 as worked by hand; equipment In Repair blocked |
| 5 Submit | Pass: results read-only for the engineer after submission |
| 6 Review | Pass: remark matches the hand result; decision rule DR-GB shown |
| 7 Report | Pass: report number with A, 19-character ULR, page numbering, NABL 133 scope warning |
| 8–9 Issue | Pass: wrong password refused; issuer stamped; archive with SHA-256 that verifies |
| 10 Re-print | Pass: from the archived copy; later client address change not taken |
| 11 Amendment | Failed first (amendment refused, 409). Fixed: amended report gets ULR `-R1`, reason required (migration 41). Re-run: SR261023/217-001A issued with TC1544226000000400F-R1 |
| 12 Engineer and issued report | Pass (API test C11) |

### 4.2 OQ-02 Calibration to certificate (screen, 23 Oct)

| Step | Result |
|---|---|
| 1 SRF | Pass: "customer requests due date" off by default and stored |
| 2 Job allocation | Pass; engineer sees only the assigned job |
| 3 Raw data | Failed first (readings rounded to whole numbers; formulas broke on column rename; malformed formulas accepted). Fixed and re-run: Pass (50.01 / 50.02 / 49.99 kept; average 50.01, error 0.01) |
| 4 MU | **Blocked (lab data)**: the instrument's MU template holds placeholders. The MU engine itself passes the suite (MU-01…05) |
| 5 Formula error | Pass after fix: malformed formulas refused |
| 6 Review | Pass; the person who calibrated cannot approve their own raw data (database rule, migration 44) |
| 7 Certificate | Failed first (testing ULR prefix, U from the master, no environment, wrong notes). Fixed: CC ULR in its own series, U only from the MU sheet, password on issue, environment required, notes by instrument (migrations 42–45). Re-run with test U: QI/CC/2026/0005 issued, ULR CC0303926000000003F, issuer stamped. **Real certificates wait for real MU templates** |
| 8 Amendment | Pass: reason required; "Amendment No. 1 — replaces certificate …" printed; original kept |
| 9 Engineer edit after issue | Pass: refused (403) |

### 4.3 OQ-03…OQ-07: covered by API role tests

These scripts were not yet run on screen by lab staff. The same rules were
tested through the staging API with each role's login (the database enforces
them, so the screen cannot bypass them):

| Script | Covered by | Result |
|---|---|---|
| OQ-03 Audit trail | E1 entries present for the OQ sample (QM view); E2 engineer cannot read them; E3 entries cannot be edited | Pass. Screen steps 1, 2, 5 (filters, reason shown) to be done by the QM |
| OQ-04 Soft delete, Recycle Bin | D1/D1b engineers, TM, calibration engineer, auditor cannot delete; D1c Sample Cell and QM can (to the Recycle Bin); D2 Director deletes; D3/D4 the number is not given again; D5 restore; C15/C16 issued record cannot be deleted | Pass |
| OQ-05 Declarations | F1 sign; F2 second one refused; F3 no edit; F4 TM cannot see another's; F5 Director sees it | Pass |
| OQ-06 AI data guard | Not run on staging (AI is switched off there so no client data can reach a provider) | **Open**: run before AI is used for client data; until then AI for client data stays off |
| OQ-07 Access control | A5, X4, X5 signed-out access refused; X6 pgcrypto refused to staff; K1–K7 change control (deploy refused before validation, validation result cannot be changed); H6/K4 engineers cannot invoice or record changes | Pass |

### 4.4 Calculation suite (68 cases)

| Module | Cases | What |
|---|---|---|
| TR | 8 | Test result statistics and rounding |
| IS | 12 | IS 2:1960 rounding |
| CF, GB, NB | 8, 5, 3 | Statement of conformity; guard band; non-binary (ILAC-G8) |
| MU | 5 | Measurement uncertainty: Type A, Type B, uc, U |
| RD, PF, CN | 6, 5, 2 | Raw data sheet, calibration point formulas, certificate notes |
| RN, ULR | 3, 6 | Report numbers; NABL ULR incl. `-R1` revisions |
| SG | 1 | Report signatories from the people who did the work |
| DS | 4 | Finance document series |

The known deviations of the first run (22 Oct: CF-04, TR-05, TR-06, TR-07,
MU-05, RN-03) were decided and closed on 23 Oct: tolerance limits are
inclusive (CF-04), IS 2 rounding with exact halves to even and declared
decimals kept (TR-05/06/07, MU-05, lab decision), a report-number serial
grows instead of being cut and the report number has a unique index (RN-03,
migration 35).

## 5. Traceability: requirement → evidence

| Requirement | Evidence | Result |
|---|---|---|
| URS-GEN-01 known staff only | A5, X4, X5; RLS on all 142 tables, no anon write grants (dry run step 7) | Pass |
| URS-GEN-02 database enforces roles | D1/D1b, H6, K4, X1, X2, X7; guard tests 11/11 and 5/5 | Pass |
| URS-GEN-03 audit log, not editable | E1–E3; file uploads/deletes audited (migration 49) | Pass |
| URS-GEN-04 reason for changes | Amendment reason required (migration 41); reason prompts on the screens | Pass; screen check in OQ-03 step 2 by the QM |
| URS-GEN-05 Recycle Bin; issued records not deletable | D2–D5, C15, C16 | Pass |
| URS-GEN-06 numbers never reused | D3, D4, H3–H5; ULR cross-check and certificate-number guards (migrations 42, 43) | Pass |
| URS-GEN-07 version visible | Every build embeds its commit (shown on LIMS Validation pages) | Pass |
| URS-GEN-08 desktop and phone | 105 pages at 375 px: no overflow, no script errors; PWA | Pass |
| URS-GEN-09 backups and restore | B-2 (section 8); nightly file and database backup | Pass (restore proven); files from 24 Oct |
| URS-GEN-10 change control | K1–K7 | Pass |
| URS-GEN-11 IT incidents | Register built (migration 18) | Built; not separately exercised |
| URS-SMP-01…05 sample registration to issue | OQ-01 steps 1–9; C1–C10 | Pass |
| URS-TST-01, 02 calculations and rounding | Suite TR, IS; OQ-01 step 4 | Pass |
| URS-TST-03 equipment on results | OQ-01 step 4 (In Repair blocked) | Pass |
| URS-TST-04 environment | Required on calibration raw data (tested); for testing the lab has no areas yet (0 areas, 0 readings) | **Partial (lab data)** |
| URS-TST-05 review before report | OQ-01 step 6 | Pass |
| URS-RPT-01 report content (7.8.2) | OQ-01 step 7; signatories from tester, reviewer, issuer (SG-01; staging test) | Pass |
| URS-RPT-02, 03 report number, ULR, never repeated | Suite RN, ULR; OQ-01 step 7; unique indexes and guards | Pass |
| URS-RPT-04 issue with password | OQ-01 steps 8–9; database guard 11/11 (migration 47); X1, X2 | Pass |
| URS-RPT-05 archive with SHA-256, re-print | OQ-01 steps 9–10; C13–C15 | Pass |
| URS-RPT-06 conformity and decision rules | Suite CF, GB, NB; missing-U warning tested on staging | Pass |
| URS-RPT-07 amendments | OQ-01 step 11 (re-run) | Pass |
| URS-CAL-01 calibration SRF | OQ-02 step 1; G1, G2 | Pass |
| URS-CAL-02 raw data sheet | OQ-02 step 3 (re-run); suite RD | Pass |
| URS-CAL-03 MU sheet | Suite MU-01…05; OQ-02 step 4 blocked by placeholder templates | **Pass in software; blocked by lab data** |
| URS-CAL-04 point formulas | Suite PF | Pass |
| URS-CAL-05 certificate content | OQ-02 step 7 (re-run with test U) | Pass in software; real certificates need MU templates |
| URS-CAL-06 amended certificates | OQ-02 step 8 | Pass |
| URS-QMS-01 declarations | F1–F5 | Pass |
| URS-QMS-02 nonconforming work | Register built; report issue held while an NC is open (database) | Built; not exercised on screen |
| URS-QMS-03 audit trail page | Opened on staging as Director (no errors); E1–E3 | Pass; filters in OQ-03 by the QM |
| URS-QMS-04 decision rules master | DR-SA, DR-GB, DR-NB used in tests | Pass |
| URS-QMS-05 environmental limits | Built; no areas configured yet | **Built; lab data** |
| URS-QMS-06 registers | Built | Built |
| URS-AI-01, 02 AI data guard | OQ-06 not run | **Open** (AI for client data stays off) |
| URS-FIN-01, 02 numbering, GST | Suite DS; H1–H8 | Pass |
| URS-ITC-01, 02 change and validation registers | K1–K7 | Pass |
| URS-ITC-03 IT incidents | Built | Built |
| URS-ITC-04 restore test register | Built; first test to be entered after go-live | Built |
| URS-ITC-05 calculation check with evidence | This suite, JSON evidence | Pass |

## 6. Risk assessment: update for sign-off

Changes to `risk-assessment.md` proposed with this pack:

| # | Function | Change |
|---|---|---|
| F-02 | Statement of conformity | Add control: under a guard band / non-binary rule a result without U is flagged and must be acknowledged before issue. CF-04 closed |
| F-03 | MU sheet | Add control: a calibration certificate cannot be issued without U taken from the MU sheet (migration 45). Residual risk: MU templates not yet complete (lab) |
| F-05 | Report number, ULR | Testing and calibration ULRs in separate series that never meet (migration 42); report number unique (migration 35). RN-03 closed |
| F-06 | Report issue | Password time taken from the sign-in token, issuer's right to sign checked by the database (migration 47) |
| F-10 | Access control | Storage tables closed to the API, pgcrypto closed (migrations 46, 48); module access in log mode for two weeks after go-live, then enforced (lab decision) |
| F-16 | Backups and restore | Evidence: B-2 on 23 Oct (restore about 1 minute); nightly backup of files and database from 24 Oct. Open item closed |
| F-19 (new) | Uploaded files | Can be deleted or replaced only by the uploader, QM or Director; every upload, change and delete audited (migration 49); nightly copy with history. S 2, L 1: **Low** |
| — | MFA | Lab decision 23 Oct: not required; available for anyone who wants it |

## 7. Go-live dry run (23 Oct, fresh copy of production)

Every step of `docs/go-live-runbook.md` passed on a copy of production taken
read-only the same evening:

| Step | Result |
|---|---|
| Copy | Counts equal to production (samples 335, clients 146, logins 27, files 385, equipment 489, audit 11,153); restore 0 errors |
| New code on old schema | Pages open; missing tables answered 404 and the pages fell back |
| Migrations 1–49 | All OK, 87 s; notices as expected (8 duplicate report numbers, 37 keys added / 7 skipped, 74 rules added) |
| Data fixes 1–5 | All OK on that day's data (103 asset codes, 29 formulas, 285 certificate formats, 3 dummy SRFs removed) |
| Migrations 35, 38 again | Report-number index added; 44 of 44 unique keys |
| Checks | RLS on all tables, no anon write grants, no unsafe functions, no invalid indexes |
| Smoke test | Signed-out 401/406/404/403; security headers; role tests; 7 of 7 security checks; Director screens open |

Database work from the first migration to the end: about 2.5 minutes.

## 8. Restore test B-2 and file backup (23 Oct)

| Part | Result |
|---|---|
| A. Railway backup → restore (staging) | Backup, marker after it, restore and deploy: database back in **about 1 min 10 s**; marker gone; every figure equal; app and role tests work |
| B. Production data read out | Read-only dump of production restored into a scratch database: 0 errors, every figure equal |
| C. Production backups | Daily (kept 6 days) and weekly (kept 27 days) in place; daily of 23 Oct present; first weekly due 25 Oct |
| Files | Nightly job from 24 Oct 02:00 IST: mirror with history plus database dump in a separate bucket. Manual production run: 453 files, no differences; dump restored and equal to production. Restore of a deleted file tested on staging (file and its record back, opens in the app, same SHA-256) |

B-2 was recorded **partial** because files had no backup at the time; with the
file backup in place, the next 90-day test (by 21 Jan 2027) covers files too.

## 9. Deviations found during validation and how they were closed

| # | Found in | Deviation | Effect | Closed by |
|---|---|---|---|---|
| 1 | Role tests | A testing engineer could delete a sample that was not issued | Record loss risk | Migration 40 (Director, QM, Sample Cell only), lab decision |
| 2 | OQ-02 step 3 | Raw data readings rounded to whole numbers | Wrong calibration results | Decimals from the least count (35dd718) |
| 3 | OQ-02 step 3, 5 | Formulas broke on column rename; malformed formulas accepted | Wrong or missing calibration values | Rename updates formulas; malformed refused; template data fix |
| 4 | OQ-01 step 11 | Amendment refused (ULR copied); reason optional | Amendments impossible | ULR `-R1`; reason required (migration 41) |
| 5 | OQ-02 step 7 | Calibration ULR used the testing prefix and could equal a test report ULR | Duplicate ULRs | Separate CC series; cross-check guard (migration 42) |
| 6 | OQ-02 | Certificate number could be reused after an amendment | Duplicate numbers | Migration 43 |
| 7 | OQ-02 step 6 | Engineer could approve own raw data | Independence of review | Migration 44 |
| 8 | OQ-02 step 7 | Certificate U from the master, no password, no environment, wrong notes | Wrong certificate content | Migration 45 and fixes |
| 9 | OQ-01 | Report signatories printed from Print Setting, not the real people | Wrong signatories (7.8.2.1 o) | Signatories from tester, reviewer, issuer (SG-01) |
| 10 | Security review | Storage tables reachable with the public key | Data exposure risk | Migration 46 + rest setting S-20 |
| 11 | Security review | Report issue not checked by the database | Unauthorised issue | Migration 47 |
| 12 | Security review | pgcrypto callable by anyone | Load risk | Migration 48 |
| 13 | Security review | DOMPurify with known flaws | XSS risk | 3.4.17 |
| 14 | Review | Any staff could delete any file, no trace | Record loss | Migration 49 |
| 15 | Review | Missing U silent under a guard band rule | Misleading conformity | Warning and acknowledgement at issue |
| 16 | Review | "Confirms", "Laboartory", "Evidance" on reports | Wording | Corrected; issued reports keep their wording |
| 17 | Staging | "Access Denied" right after sign-in | Usability | Fixed (370b1d5) |
| 18 | Staging test of fix 14 | IS Code file delete showed "File deleted" and removed the record while the file stayed | Lost link to a file | Fixed (e185b51); record restored on staging |
| 19 | QM review, 24 Oct | 32 pages the branch adds (Audit Trail, Recycle Bin, Software Changes, Validation Runs, Backup Tests, IT Incidents, Authorization Matrix, Environment Log, suppliers, PT …) are in no staff member's module access, so only the Director could open them; the QM got "Access Denied" on the Audit Trail | QM and staff cannot use the new registers | Data fix `20261025_module_access_new_pages.sql` (per-user rules by designation; only adds), tested on staging: QM opens Audit Trail, Software Changes, Validation Runs, Backup Tests, Recycle Bin. Runs at go-live |

## 10. Restrictions and open items at sign-off

| # | Item | Effect on use | Owner |
|---|---|---|---|
| 1 | Calibration MU templates are placeholders | No calibration certificate can be issued until the instrument's MU template is complete (the software refuses without U). Calibration has not started on production | Lab (TM calibration) |
| 2 | 277 of 320 NABL test parameters have no MU | Under a guard band rule those results are judged by simple acceptance and flagged at issue | Lab (TM testing) |
| 3 | OQ-06 AI data guard not run | AI for client data stays off until OQ-06 passes | QM |
| 4 | OQ-03 screen steps 1, 2, 5 | Done 24 Oct (section 10a): pass | — |
| 5 | Environment areas and logs not configured | Conditions not printed on test reports until areas and daily logs exist | Lab |
| 6 | Authorization matrix empty | Anyone may act after giving a reason (recorded); enforced once grants exist | QM |
| 7 | Module access | Log mode for two weeks after go-live, then enforced (lab decision) | Director |
| 8 | Dashboard speed | 4–11 s; no effect on results | Developer |

## 10a. QM review checks run on 24 Oct 2026

At the lab's request (Amit, 24 Oct: "ye aap run karo, bas mujhe report me
pass ya fail bata dena") the open review checks were run on staging. The
signatures in section 12 remain the QM's and the Director's own.

| Check | Result |
|---|---|
| OQ-03 step 1: Audit Trail, filter by record | Pass: OQTEST/MVL36WJO-002 showed its 3 entries (created by OQ Sample Incharge, deleted and restored by OQ Director) with user, time and changed fields |
| OQ-03 step 2: reason shown with the entry | Pass: "OQ test restore" shown in the Reason column |
| OQ-03 step 5: filter by user and date | Pass: user OQ Sample Incharge + 23 Oct gave 36 entries, all by that user on that date |
| QM access to the new registers | **Failed first** (deviation 19): QM got "Access Denied" on the Audit Trail. After the module access data fix: QM opens Audit Trail, Software Changes, Validation Runs, Backup Tests and Recycle Bin. Pass |
| Production email for password reset | Already set on production (Resend SMTP, sender info@qirlpl.com); public sign-up already off on production |
| OQ-06 AI data guard | Not run: staging holds a copy of real client data, so AI stays off there; restriction 3 stands |

**Review result: PASS with restrictions** (section 10, items 1–3), provided
the module access data fix runs at go-live.

## 11. Conclusion

Proposed (QM to tick one):

- [ ] The LIMS at commit `1afa449` is **fit for its intended use**.
- [x] **Fit for use with restrictions**: items 1–3 of section 10 (no
      calibration certificate without a real MU template; results without MU
      flagged under guard band rules; AI for client data off until OQ-06).
- [ ] **Not fit** for use.

## 12. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by | | | |
| Reviewed by (Quality Manager) | | | |
| Approved for use (Laboratory Director) | | | |

Also to sign with this pack: `URS.md` section 10 and `risk-assessment.md`
section 4 (with the update in section 6). After approval: record the
validation run in Quality → LIMS Validation Runs (after go-live), mark the
go-live software change deployed, and enter the B-2 restore test in Quality →
Backup Restore Tests.
