# QIRLPL LIMS: validation report (template)

Copy this file for each validation (for example
`validation-report-2026-11-CHG-2026-004.md`), fill in every field, print or
export to PDF, sign, and keep it with the validation run record
(Quality → LIMS Validation Runs). Delete the guidance lines in *italics*.

| | |
|---|---|
| Report no. | VR-__________ *(same as the run number VAL-YYYY-NNN when there is one run)* |
| Clause | ISO/IEC 17025:2017 7.11.2, 7.11.6 |
| Software | QIRLPL LIMS, version / commit __________ *(shown on the LIMS Validation pages)* |
| Change(s) validated | CHG-__________ *(or "initial validation")* |
| Environment | staging / production / local |
| Period | from ________ to ________ |

## 1. Purpose and scope

*What was validated and why: initial validation before use, or validation
after change CHG-… . List the modules in scope and those deliberately out of
scope (with the reason, for example "not changed, risk Low").*

## 2. Basis

- User requirements: `URS.md` version ____
- Risk assessment: `risk-assessment.md` version ____ (functions F-__ in scope)
- Test scripts: `OQ-test-scripts.md` version ____ ; calculation suite
  `frontend/scripts/validation/calculationCases.mjs` at the commit above

## 3. Test environment

| Item | Detail |
|---|---|
| App URL | |
| Database | *staging Postgres / restored copy / production* |
| Test data | *OQ test clients, samples, equipment used* |
| Browsers / devices | *e.g. Chrome 130 on Windows; Safari on iPhone* |
| Test accounts used | *roles only, never passwords* |

## 4. Results

| Test | Run no. | Cases / steps | Passed | Failed | Known deviations | Result |
|---|---|---|---|---|---|---|
| Calculation suite (`npm run validate:calculations`) | VAL- | | | | | pass / fail |
| OQ-01 Sample to issued report | VAL- | 12 | | | | |
| OQ-02 Calibration to certificate | VAL- | 9 | | | | |
| OQ-03 Audit trail | VAL- | 5 | | | | |
| OQ-04 Soft delete / restore | VAL- | 6 | | | | |
| OQ-05 Declarations | VAL- | 4 | | | | |
| OQ-06 AI data guard | VAL- | 5 | | | | |
| OQ-07 Access control | VAL- | 6 | | | | |

Evidence: *list the evidence files (JSON from the calculation suite, signed
script sheets, screenshots) and where they are stored.*

## 5. Deviations

| No. | Test / step | What happened | Effect on results | Action (incident / NC / change no.) | Closed? |
|---|---|---|---|---|---|
| 1 | | | | | |

*Known deviations from the calculation suite (status KNOWN) are listed here
with the QM's decision: accepted with justification, or a change request
raised.*

## 6. Conclusion

*Choose one and give the reason:*

- [ ] The LIMS version ______ is **fit for its intended use** in the scope above.
- [ ] Fit for use **with restrictions**: ______________________ (e.g. "do not use ± tolerance limits until CHG-… is deployed; check those remarks by hand").
- [ ] **Not fit** for use; the change must not be deployed / must be rolled back.

## 7. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by | | | |
| Reviewed by (Quality Manager) | | | |
| Approved for use (Laboratory Director) | | | |

After approval: mark the change(s) **Deployed** in Software Change Control
(the database refuses this until a passed run is linked or a validation
reference is entered), and mark the validation run(s) **Reviewed**.
