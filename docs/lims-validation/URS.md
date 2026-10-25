# QIRLPL LIMS: User Requirements Specification (URS)

| | |
|---|---|
| Document | QIRLPL-LIMS-URS |
| Version | 1.0 (draft for QM review) |
| Prepared | October 2026 |
| Clause | ISO/IEC 17025:2017 7.11.2 (LIMS validated before use), 7.11.3, 7.11.6 |
| Owner | Quality Manager |
| Approved by | Laboratory Director (sign and date when approved) |

## 1. Purpose

This document lists what the laboratory needs the QIRLPL LIMS to do. Each
requirement has a number (URS-xxx-nn). The validation tests in
`OQ-test-scripts.md` and the calculation suite (`npm run validate:calculations`)
quote these numbers, so you can show an assessor which test proves which
requirement. The risk of each function is rated in `risk-assessment.md`.

Priority: **M** = must have (affects validity of results or a 17025
requirement), **S** = should have, **C** = convenience.

## 2. Users and roles

| Role | What they do in the LIMS |
|---|---|
| Laboratory Director | Everything; the only role that deletes records and changes numbering and users |
| Quality Manager (Quality Assurance) | Reviews, quality registers, audit trail, validation registers, refers back issued reports |
| Technical Manager (Mechanical / Chemical) | Allocates work, reviews results, maintains limits and methods |
| Testing Engineer | Enters results and raw data for allocated work |
| Sample Cell (Receptionist, Sample Incharge) | Registers samples and service requests |
| Finance users | Quotations, invoices, receipts (module access rules) |

## 3. General requirements (all modules)

| No. | Requirement | Priority |
|---|---|---|
| URS-GEN-01 | Only signed-in, active staff known to the laboratory can see laboratory data. Anyone else sees nothing. | M |
| URS-GEN-02 | Each user can only change what their role allows; the database enforces this, not just the screen. | M |
| URS-GEN-03 | Every change to a technical or quality record is logged: who, when, old value, new value. The log cannot be edited by anyone. | M |
| URS-GEN-04 | When a submitted technical record is changed, the user must give a reason, and the reason is stored with the log entry. | M |
| URS-GEN-05 | Records are not destroyed when "deleted": they go to a Recycle Bin and can be restored by the Director. Issued or closed records cannot be deleted. | M |
| URS-GEN-06 | Numbers (SRF, report, ULR, certificate, invoice) are never reused, also after a deletion. | M |
| URS-GEN-07 | The running software version (build id) is visible in the app so records can state which version produced them. | M |
| URS-GEN-08 | The app works on desktop and phone browsers used in the lab. | S |
| URS-GEN-09 | Data is backed up daily and weekly, and a backup can be restored and checked (see backup procedure). | M |
| URS-GEN-10 | Every change to the software is recorded, risk-assessed, approved and, where needed, validated before use. | M |
| URS-GEN-11 | LIMS failures and IT incidents are recorded with their effect on data and the actions taken. | M |

## 4. Sample handling and testing (clause 7.4, 7.5, 7.8)

| No. | Requirement | Priority |
|---|---|---|
| URS-SMP-01 | Register a sample / SRF with client, description, condition on receipt, quantity, tests requested and due date. | M |
| URS-SMP-02 | Give each SRF a unique number automatically. | M |
| URS-SMP-03 | Record the customer's requests (e.g. statement of conformity, due date) at contract review. | M |
| URS-SMP-04 | Allocate samples to a section and tests to an engineer; only allocated people enter results. | M |
| URS-SMP-05 | Track the sample stage (received → allocated → under testing → review → report → issued) and retention / disposal. | M |
| URS-TST-01 | Enter results as readings; calculate mean, standard deviation, CV, range and comparisons correctly. | M |
| URS-TST-02 | Round reported results to the decimals chosen for the parameter. | M |
| URS-TST-03 | Record the equipment / CRM used for each result and block overdue or out-of-service equipment. | M |
| URS-TST-04 | Record environmental conditions for the period of testing where the method needs them. | M |
| URS-TST-05 | Results go to review before a report can be prepared; the reviewer is recorded. | M |
| URS-RPT-01 | Prepare the test report with all items of 7.8.2 (lab, client, sample, method, results, units, MU when relevant, signatory, dates). | M |
| URS-RPT-02 | Give a unique report number (prefix + serial + scope letter A/B) and a NABL ULR for accredited parameters. | M |
| URS-RPT-03 | Report numbers and ULRs are never repeated. | M |
| URS-RPT-04 | Issuing a report needs the issuer to re-enter their password; the issuer and time are stored. | M |
| URS-RPT-05 | An issued report is archived as a frozen copy with a SHA-256 hash; a re-print comes from the archived copy. | M |
| URS-RPT-06 | Statement of conformity follows the decision rule agreed with the customer (simple acceptance, guard band, non-binary per ILAC-G8); blank requirement gives "Not Applicable". | M |
| URS-RPT-07 | Amended / revised / supplementary reports carry the right suffix and refer to the original. | M |

## 5. Calibration (clause 7.4, 7.6, 7.8.4)

| No. | Requirement | Priority |
|---|---|---|
| URS-CAL-01 | Register a calibration service request (SRF) with the customer's requests, including whether a due date is wanted on the certificate. | M |
| URS-CAL-02 | Raw data sheet per job from the equipment template; formula columns calculate correctly and round to their decimals. | M |
| URS-CAL-03 | Measurement uncertainty sheet: Type A, Type B, combined and expanded uncertainty (k) calculate correctly (GUM). | M |
| URS-CAL-04 | Calibration point formulas evaluate correctly; an invalid formula or division by zero never produces a point. | M |
| URS-CAL-05 | Certificate shows ULR, results, MU, traceability, conditions; due date only when the customer asked. | M |
| URS-CAL-06 | Amended certificates reference the original and print the amendment reason. | M |

## 6. Quality and management system (clauses 4, 6, 8)

| No. | Requirement | Priority |
|---|---|---|
| URS-QMS-01 | Annual impartiality / conflict-of-interest and confidentiality declarations signed in the app; pending ones visible to the Director. | M |
| URS-QMS-02 | Nonconforming work records with evaluation, actions and decisions. | M |
| URS-QMS-03 | Audit trail page for the Director and QM: search by table, record, user and date. | M |
| URS-QMS-04 | Decision rules master maintained by the Director / QM. | M |
| URS-QMS-05 | Environmental limits per area; out-of-limit readings flagged and can open an NC. | M |
| URS-QMS-06 | Document control, complaints, training, competence and equipment registers. | S |

## 7. AI assistant (clause 4.2 confidentiality)

| No. | Requirement | Priority |
|---|---|---|
| URS-AI-01 | Client data is not sent to an AI provider unless the setting allows it and the client consented; otherwise identifiers are replaced before sending. | M |
| URS-AI-02 | The Director can switch AI use for client data off. | M |

## 7a. MCP connector for AI assistants (clauses 4.2, 7.11) — added 25 Oct 2026

| No. | Requirement | Priority |
|---|---|---|
| URS-MCP-01 | Only the Laboratory Director, Quality Manager and Technical Managers can sign in, each with their own LIMS login; everyone else is refused. | M |
| URS-MCP-02 | The connector gives no more access than the app: row level security, database guards and the user's Module Access apply. | M |
| URS-MCP-03 | Only the Director can change data; submitting or approving results, issuing or signing reports and certificates, and deleting are never possible through the connector. | M |
| URS-MCP-04 | Client names and addresses are replaced for the QM and TMs; the Director sees them (lab decision 25 Oct). | M |
| URS-MCP-05 | Every call is logged (who, tool, table, outcome); changes show "via MCP" in the Audit Trail. | M |
| URS-MCP-06 | The Director can switch the connector off; off refuses sign-in and every call. | M |

## 8. Finance

| No. | Requirement | Priority |
|---|---|---|
| URS-FIN-01 | Quotation, proforma, invoice, credit note and receipt numbers come from a database series; prefixes with {YYYY}, {YY}, {FY} resolve in India time, with the financial year changing on 1 April. | S |
| URS-FIN-02 | GST amounts calculate correctly. | S |

## 9. LIMS control (clause 7.11)

| No. | Requirement | Priority |
|---|---|---|
| URS-ITC-01 | Software change register with risk, approval, validation reference and deployment date (Quality → Software Change Control). A change that needs validation cannot be marked deployed without a passed validation run or a validation reference. | M |
| URS-ITC-02 | Validation run register with version tested, environment, result and evidence; the result cannot be edited afterwards. | M |
| URS-ITC-03 | IT incident register with category, effect on data, corrective action and link to an NC record. | M |
| URS-ITC-04 | Backup restore test register; the page warns when no successful restore test is recorded in the last 90 days. | M |
| URS-ITC-05 | A repeatable, offline check of the calculation code against reference values, with JSON evidence. | M |

## 10. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Prepared (QM) | | | |
| Approved (Laboratory Director) | | | |
