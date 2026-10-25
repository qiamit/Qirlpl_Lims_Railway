# QIRLPL LIMS: risk assessment of functions (validity of results)

| | |
|---|---|
| Document | QIRLPL-LIMS-RA |
| Version | 1.1 (25 Oct 2026: F-19 and F-20 added; draft for QM review) |
| Clause | ISO/IEC 17025:2017 8.5, 7.11.2, 7.11.6 |
| Review | Every year, and before any High-risk change is deployed |

## 1. How the risk is rated

For each LIMS function: what could go wrong, and what it would do to the
**validity of results** (a wrong or misleading report or certificate), to
**records** (lost or changed data), or to **confidentiality / impartiality**.

- **Severity (S)**: 3 = a wrong result, conformity statement, MU or number
  reaches a customer; 2 = a record is lost, changed without trace, or delayed;
  1 = inconvenience only.
- **Likelihood (L)**: 3 = calculations or logic written in the LIMS that run on
  every record; 2 = depends on user input or configuration; 1 = protected by
  the database or rarely used.
- **Risk = S × L**: 6–9 **High**, 3–4 **Medium**, 1–2 **Low**.

The risk decides how much testing a change needs (see
`change-control-procedure.md`):

| Risk | Validation before a change to that function is used |
|---|---|
| High | Calculation suite (if calculations are touched) + the OQ scripts of that flow, on staging, recorded as a validation run, reviewed by the QM |
| Medium | The OQ scripts of that flow on staging (or a documented check), recorded |
| Low | Developer check; recorded in the change register |

## 2. Functions

| # | Function | What can go wrong | S | L | Risk | Controls in place | Validation evidence |
|---|---|---|---|---|---|---|---|
| F-01 | Test result statistics and rounding (`testResultValues.ts`) | Wrong mean / s / CV; wrong rounding of reported value | 3 | 3 | High | Fixed reference cases; reviewer checks results | Calculation suite TR-01…08 (TR-05/06/07 known deviations) |
| F-02 | Statement of conformity and decision rules (`evaluateResultConformity.ts`) | Pass reported for a failing result or the reverse; rule not applied | 3 | 3 | High | Decision-rule master; rule printed on report; reviewer | Suite CF, GB, NB cases (CF-04 known deviation); OQ-01 step 6 |
| F-03 | MU sheet: Type A, Type B, uc, U (`muCalcEngine.ts`, `rawDataSheetTypes.ts`) | Wrong uncertainty on a certificate | 3 | 3 | High | Template review by Technical Manager; reviewer | Suite MU-01…05 (MU-05 known deviation); OQ-02 |
| F-04 | Raw data sheet formula columns, calibration point formulas (`pointFormula.ts`) | Wrong error / correction / calibration point | 3 | 3 | High | Formula validation refuses invalid formulas | Suite PF-01…05, MU-05; OQ-02 |
| F-05 | Report number and NABL ULR (`formattedTestReportNumber.ts`, `nablUlrNumber.ts`) | Duplicate or malformed number; wrong scope letter | 3 | 2 | High | Unique index on ULR; numbers of deleted records skipped | Suite RN, ULR cases (RN-03 known deviation); OQ-01 |
| F-06 | Report issue with password, archive copy, re-print | Unauthorised issue; re-print differs from issued report | 3 | 2 | High | Password re-entry; SHA-256 archive | OQ-01 steps 8–10 |
| F-07 | Amendment of reports / certificates | Amended document does not reference original | 3 | 1 | Medium | Database function builds the amendment | OQ-01 step 11, OQ-02 step 8 |
| F-08 | Audit trail | Change without trace | 2 | 1 | Low | Database triggers; log not editable | OQ-03 |
| F-09 | Soft delete / Recycle Bin | Record lost; issued record deleted | 2 | 2 | Medium | Database blocks deleting issued/closed records | OQ-04 |
| F-10 | Access control (RLS) | Unauthorised person sees or changes data | 3 | 1 | Medium | Known-staff gate on every table; role checks in the database | OQ-07; PGlite migration tests |
| F-11 | Equipment traceability on results | Overdue equipment used without notice | 3 | 2 | High | Picker blocks overdue / out-of-service equipment | OQ-01 step 4 |
| F-12 | Environmental conditions | Out-of-limit condition not seen | 2 | 2 | Medium | Database flags readings; NC from reading | Environment pages; OQ-01 step 4 |
| F-13 | Declarations (impartiality, confidentiality) | Missing declaration not noticed | 2 | 2 | Medium | Pending list for Director | OQ-05 |
| F-14 | AI data guard | Client data sent to an AI provider without consent | 2 | 2 | Medium | Redaction, consent flag, off switch | OQ-06 |
| F-15 | Finance numbering (`documentSeriesApi.ts`) | Wrong FY in invoice number; duplicate | 2 | 2 | Medium | Database series; India-time rule | Suite DS-01…04 |
| F-16 | Backups and restore | Data lost; backup unusable | 3 | 1 | Medium | Daily + weekly Railway volume backups | Restore test register (none yet: **open**) |
| F-17 | Hosting / availability (Railway) | Lab cannot work; data entry delayed | 1 | 2 | Low | Paper fallback forms; incident register | IT incident register |
| F-18 | Display, navigation, theming | Inconvenience | 1 | 2 | Low | — | Developer check |
| F-19 | Uploaded files (storage) | File deleted or replaced without trace | 2 | 1 | Low | Only the uploader, QM or Director can delete or replace; every upload, change and delete audited (migration 49); nightly copy with history | Storage rule tests; B-2 file restore |
| F-20 | MCP connector for AI assistants (Claude; Grok Bot via Cursor) | Client data reaches an AI provider outside India (for the Director unredacted); a wrong change made through an AI; access with a stolen connector token | 2 | 2 | Medium | Own LIMS login, Director / QM / TM only; RLS, guards and Module Access as in the app; writes Director only, never results, issue/sign or delete; client name and address replaced for QM and TM; every call logged, changes "via MCP" in the Audit Trail; Director's on/off switch; sessions end after 8 hours or when the LIMS sign-in ends; callback addresses allow-listed. Lab decision 25 Oct to allow Grok Bot (plan section 9) | OQ-08 (45/45, staging); production checks 25 Oct |

## 3. Findings from the first calculation validation (22 Oct 2026)

The calculation suite found these known deviations. They are not counted as
failures of the run, but each needs a decision by the Quality Manager and,
if accepted as a defect, a change request:

| Case | Finding | Suggested action |
|---|---|---|
| CF-04 | A result exactly on a ± tolerance limit (5.2 against "5 ± 0.2") is reported **Not Confirm**, because of binary floating point (5.2 − 5 = 0.20000000000000018). Applies with no decision rule and with simple acceptance. | Fix in `evaluateResultConformity.ts` (compare with a small tolerance like the guard-band branch). High priority. |
| TR-07, MU-05 | Values with a trailing 5 can round one step low (1.015 → 1.01; 0.0125 → 0.012). | Decide rounding method; consider decimal rounding. |
| TR-06 | Exact halves round up (2.5 → 3); IS 2 rounds to even (2.5 → 2). | Lab policy: state the rounding rule in the quality manual or change code. |
| TR-05 | Trailing zeros are dropped (10.20 → 10.2). | Decide whether reports must show declared decimals. |
| RN-03 | A report-number prefix of 14 characters leaves 1 serial digit, so serials repeat after 9. No unique index on `samples.test_report_number`. | Keep prefix to 9–10 characters; consider a unique index. |

## 4. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Prepared (QM) | | | |
| Approved (Laboratory Director) | | | |
