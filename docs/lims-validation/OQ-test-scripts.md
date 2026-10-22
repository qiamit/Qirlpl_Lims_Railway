# QIRLPL LIMS: Operational Qualification (OQ) test scripts

| | |
|---|---|
| Document | QIRLPL-LIMS-OQ |
| Version | 1.0 (draft for QM review) |
| Clause | ISO/IEC 17025:2017 7.11.2, 7.11.6 |
| Requirements | `URS.md` (numbers quoted per script) |

## How to use these scripts

1. **Where**: run on **staging** (a copy of the app with test data), never on
   the production database. Use test clients named `OQ TEST CLIENT …` and test
   samples so nothing reaches a real customer. If a script must be run on
   production (for example after go-live), use the OQ test client and delete
   the records afterwards through the Recycle Bin procedure.
2. **Version**: write down the version shown at the top right of any Quality →
   LIMS Validation page (for example `a46340b`). All results belong to that
   version.
3. **Accounts**: you need test accounts for these roles: Laboratory Director
   (DIR), Quality Manager (QM), Technical Manager (TM), Testing Engineer (ENG),
   Sample Cell (SC). Never use a real person's password for testing.
4. **Recording**: print this document or copy the tables into a sheet. For
   each step write the actual result, **P** (pass) or **F** (fail) and your
   initials. Take a screenshot where the step says [screenshot] (save as
   `OQ-xx-step-n.png`).
5. **Failures**: a failed step is a deviation. Write what happened, carry on
   if it is safe, and record the run as `fail` or `partial` with the
   deviations. A deviation that could affect results also gets an IT
   incident and, where needed, an NC record.
6. **Record the run**: Quality → LIMS Validation Runs → **Record run**, scope
   `OQ`, environment `staging`, the version, the number of steps passed and
   failed, the evidence files, and link it to the change being validated.

Abbreviations: SRF = sample / service request form, ULR = NABL unique lab
report number.

---

## OQ-01 Sample receiving to issued report and re-print

Requirements: URS-SMP-01…05, URS-TST-01…05, URS-RPT-01…07, URS-GEN-03.
Time: about 45 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | SC | Samples → Sample Receiving → new SRF for `OQ TEST CLIENT 1`, sample "Cement OPC 53", 2 tests (one NABL-scope numeric test with a "max" limit, one non-NABL), customer asks for a statement of conformity with decision rule "Guard band (w = 1·U)". Save. | SRF number is given automatically and is one higher than the last; status "received". [screenshot] | | | |
| 2 | SC | Try to save a second SRF with the client field empty. | Save is refused with a clear message. | | | |
| 3 | TM | Samples → Sample Allocation: allocate the sample to the section; Test Allocation: allocate both tests to ENG. | Sample moves to the next stage; ENG sees the tests in Sample Under Testing; other engineers do not. | | | |
| 4 | ENG | Sample Under Testing → enter results. For the numeric test enter readings 10.1, 10.3, 10.2 and choose "Average", 2 decimals. Pick the equipment used; try to pick an equipment item whose calibration is overdue. | Reported value 10.2 (average); s = 0.1; overdue equipment is blocked or clearly warned. [screenshot] | | | |
| 5 | ENG | Submit the results. Then try to change the submitted value. | Change asks for a reason; after saving, the reason is in the Audit Trail (OQ-03). | | | |
| 6 | TM | Results Under Review: review and approve. Check the conformity remark of the numeric test against the limit and its U as entered in the test parameter (work out by hand: accept only if result ≤ limit − U). | Remark matches the hand result (Confirm / Not Confirm). The decision rule is shown. [screenshot] | | | |
| 7 | QM | Test Report Preparation: open the report. Check every item: lab name and address, client, SRF and sample details, method, results with units, MU where relevant, decision rule statement, conditions, signatory, dates, page numbers "x of y", report number (prefix + serial + A for NABL tab, B for non-NABL tab) and the 19-character ULR (TC + cert + YY + 0 + 8 digits + F). | All items present and correct; ULR passes the format check. [screenshot] | | | |
| 8 | QM | Issue the report: enter a **wrong** password. | Issue is refused; nothing changes. | | | |
| 9 | QM | Issue again with the correct password. | Report moves to Issued Test Report; issuer name and time stored; an archived copy with SHA-256 is created. [screenshot] | | | |
| 10 | QM | Issued Test Report → re-print the report. Then change something in a master (for example the client address in Client Master) and re-print again. | Both re-prints match the issued report exactly (from the archived copy), not the new address. [screenshot] | | | |
| 11 | DIR | Start an amendment (Amendment Report) for the issued report, with a reason. | New report number ends in `AA`; it refers to the original report; the original stays issued and readable. | | | |
| 12 | ENG | Try to open or change the issued report's results. | Not possible. | | | |

## OQ-02 Calibration: SRF, raw data, MU, certificate, amendment

Requirements: URS-CAL-01…06, URS-GEN-03. Time: about 40 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | SC | Calibration Handling → Service Request: new SRF for `OQ TEST CLIENT 2`, instrument "Dial gauge 0–10 mm, LC 0.01", tick "customer wants due date on certificate" = **No**. Save. | SRF number given; due-date flag stored as No. | | | |
| 2 | TM | Job Allocation: allocate the job to ENG. | ENG sees the job. | | | |
| 3 | ENG | Calibration Conduct Inside: open the raw data sheet. At the 10 mm point enter readings 10.01, 10.02, 9.99, 10.00, 10.03. | Mean 10.01; error columns as per the template formula (work out by hand). [screenshot] | | | |
| 4 | ENG | Open the MU sheet for the job. Enter: certificate U of the gauge block 0.010 mm (k = 2), resolution 0.01 mm. | uA = 0.007071, uB(cert) = 0.005000, uB(res) = 0.002887, uc = 0.009129, U (k = 2) = 0.018 mm (same as calculation suite MU-02). [screenshot] | | | |
| 5 | ENG | Enter a formula with an error in a calibration point formula (for example `x +`). | Formula is refused; no point is generated. | | | |
| 6 | TM | Review Data: approve the raw data. | Status moves on; reviewer recorded. | | | |
| 7 | QM | Certificate Preparation: prepare and issue the certificate. Check ULR (CC + cert + YY + 0 + serial + F), results, U with k, traceability of standards, environmental conditions, **no calibration due date** (because step 1 said No). | All correct; no due date printed. [screenshot] | | | |
| 8 | DIR | Amend the certificate with a reason. | Amended certificate has a new number, refers to the original, keeps the original ULR, and prints the amendment reason. [screenshot] | | | |
| 9 | ENG | Try to edit the raw data of the issued job. | Not possible, or asks for a reason and is logged. | | | |

## OQ-03 Audit trail

Requirements: URS-GEN-03, URS-GEN-04, URS-QMS-03. Time: 15 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | QM | Audit & MRM → Audit Trail. Filter by the SRF of OQ-01. | Entries for create, allocation, results, review, issue: user, time, old → new values. [screenshot] | | | |
| 2 | QM | Find the change made in OQ-01 step 5. | The reason typed by ENG is shown with the entry. | | | |
| 3 | QM | Try to edit or delete an audit entry (look for any edit button; try through the browser if you know how). | Not possible. | | | |
| 4 | ENG | Open the Audit Trail page. | Not available to a Testing Engineer. | | | |
| 5 | QM | Filter by user = ENG and today's date. | Only ENG's changes of today are listed. | | | |

## OQ-04 Soft delete, Recycle Bin, restore

Requirements: URS-GEN-05, URS-GEN-06. Time: 15 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | SC | Create a test SRF `OQ DELETE TEST` (not allocated). Note its number. | Saved. | | | |
| 2 | ENG | Try to delete it. | Not allowed. | | | |
| 3 | DIR | Delete it, giving the reason "OQ-04 test". | Disappears from the list; reason asked. | | | |
| 4 | SC | Create another SRF. | It gets the **next** number, not the deleted number. | | | |
| 5 | DIR | Audit & MRM → Recycle Bin: find the deleted SRF and restore it. | SRF is back with all its data; the delete and restore are in the audit trail. [screenshot] | | | |
| 6 | DIR | Try to delete the **issued** report of OQ-01. | Refused by the database with a message. | | | |

## OQ-05 Annual declarations

Requirements: URS-QMS-01. Time: 10 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | ENG | Personnel → Annual Declarations: sign the impartiality / conflict of interest declaration for this year. | Saved with name and time. | | | |
| 2 | ENG | Try to sign the same declaration again or edit the signed one. | Not possible (one per person, type and year; no edits). | | | |
| 3 | DIR | Open the declarations page. | ENG shows as signed for impartiality and pending for confidentiality; other staff without declarations are listed as pending. [screenshot] | | | |
| 4 | TM | Try to see another person's declaration. | Only own declarations are visible. | | | |

## OQ-06 AI data guard

Requirements: URS-AI-01, URS-AI-02. Time: 15 minutes. Needs AI enabled on staging.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | DIR | Settings → AI: set client data to "Replace client details (redact)". | Saved. | | | |
| 2 | ENG | Ask the QI Assistant something that includes `OQ TEST CLIENT 1` and an SRF number. | Answer works; the request is marked as redacted; the client name was replaced by a placeholder before sending (check the "data sent" note / log). [screenshot] | | | |
| 3 | DIR | Set mode "Send only for clients who consented". Client Master: `OQ TEST CLIENT 1` consent = No. Repeat step 2. | Still redacted. | | | |
| 4 | DIR | Set the client's consent = Yes. Repeat step 2. | Sent unchanged and marked "consented". | | | |
| 5 | DIR | Set AI for client data to Off. Repeat step 2. | No client data is sent (refused or fully redacted, as the setting says). | | | |

## OQ-07 Access control (spot checks)

Requirements: URS-GEN-01, URS-GEN-02, URS-ITC-01…04. Time: 10 minutes.

| Step | Who | Action | Expected result | Actual | P/F | Init. |
|---|---|---|---|---|---|---|
| 1 | — | Open the app signed out; try a deep link such as `/samples/receiving`. | Sign-in page; no data shown. | | | |
| 2 | ENG | Open Quality → Software Change Control and IT Incidents. | Can read; no "New" buttons; saving through the browser is refused. | | | |
| 3 | QM | Record a test change (risk Medium, validation required), approve it, then try to mark it deployed. | Refused: "needs validation before it is deployed". | | | |
| 4 | QM | Record a validation run linked to that change with result Pass, then mark the change deployed. | Deployed; approved-by and deployed-by show QM's name. | | | |
| 5 | QM | Try to change the result of the saved validation run. | Refused: result and evidence cannot be changed. | | | |
| 6 | DIR | Delete the test change and test run, with reason "OQ-07 test data". | Deleted; entries in the audit trail. | | | |

---

## Run summary (fill in)

| Script | Steps | Passed | Failed | Deviations / incident no. |
|---|---|---|---|---|
| OQ-01 | 12 | | | |
| OQ-02 | 9 | | | |
| OQ-03 | 5 | | | |
| OQ-04 | 6 | | | |
| OQ-05 | 4 | | | |
| OQ-06 | 5 | | | |
| OQ-07 | 6 | | | |
| **Total** | **47** | | | |

Version tested: ____________ Environment: staging / production

Executed by: ____________ Date: ________ Reviewed by (QM): ____________ Date: ________
