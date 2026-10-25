# Results review guard (migration 53): staging test

| | |
|---|---|
| Change | `20261102101500_results_review_guard.sql`: nobody reviews their own results; only the assigned reviewer (or the Laboratory Director, never for own results) approves; results locked while under review or approved |
| Clause | ISO/IEC 17025:2017 7.7.1 (review of results), 7.8.1.1 (reports reviewed and authorised), 7.5 (records) |
| Requirement | URS-TST-05 review before report |
| Environment | Staging only, 25 Oct 2026 (migration 53 applied 16:17 IST). **Production: not applied** |
| Run | `results_review_guard_test.mjs` (run MVNPFMUU), OQ test accounts through the staging gateway, as the screens write |
| Result | **22 of 22 pass** |

| Id | Check | Result | Detail |
|---|---|---|---|
| R-00 | Setup: sample, allocation to the engineer, 4 parameters | Pass | OQTEST/RVMVNPFMUU-001 |
| R-01 | Engineer enters a result; entered_by is the engineer | Pass | HTTP 200  |
| R-02 | Engineer cannot send own results for review to himself | Pass | HTTP 403 The person who entered the results cannot review them. Choose another reviewer. |
| R-03 | Engineer sends for review to the TM | Pass | HTTP 200  |
| R-04 | Result locked while under review (engineer) | Pass | HTTP 403 Results under review cannot be changed. Refer the section back from review first. |
| R-05 | Engineer cannot approve own result | Pass | HTTP 403 Results cannot be approved by the person who entered them. |
| R-06 | QM (not the assigned reviewer) cannot approve | Pass | HTTP 403 Only the assigned reviewer (OQ Technical Manager Mech) can approve these results. |
| R-07 | Another TM (not assigned) cannot approve | Pass | HTTP 403 Only the assigned reviewer (OQ Technical Manager Mech) can approve these results. |
| R-08 | Assigned TM approves | Pass | HTTP 200  |
| R-09 | Result locked after approval (engineer) | Pass | HTTP 403 Results already approved cannot be changed. Refer the section back from review first. |
| R-10 | TM refers back (status cleared) | Pass | HTTP 200  |
| R-11 | After refer-back the engineer can change the result | Pass | HTTP 200  |
| R-12 | Report fields (specific requirement, remark) stay editable | Pass | HTTP 200  |
| R-13 | TM cannot approve a result not sent for review | Pass | HTTP 403 These results have not been sent for review yet. |
| R-14 | Director may approve a result not sent for review (not the tester) | Pass | HTTP 200  |
| R-15a | Director enters a result (Director is the tester) | Pass | HTTP 200  |
| R-15 | Director cannot approve own result | Pass | HTTP 403 Results cannot be approved by the person who entered them. |
| R-16 | Director may still correct a result under review (audited) | Pass | HTTP 200  |
| R-17 | Engineer sends the section (3 rows, one empty) to the TM | Pass | HTTP 200  rows 3 |
| R-18 | TM approves the whole section in one update | Pass | HTTP 200  |
| R-19 | Tester cannot insert an approved copy of own result | Pass | HTTP 403 Results cannot be approved by the person who entered them. |
| R-20 | QM inserts the approved copy (report amendment) | Pass | HTTP 201  |

## Regression after migration 53 (staging)

| Run | Result |
|---|---|
| Role tests | 79 checks, 78 pass; F1 (this year's impartiality declaration already exists, 409) fails the same way as in earlier runs: test data |
| Report issue guard (migration 47) | 11 of 11, run on a report-preparation sample (the fixed sample of the earlier run has since been issued) |
| Calibration review guard (migration 44) | Not run: its fixed job SRF-2026-0004 is no longer on staging; migration 53 does not touch calibration tables |

## Screens

No screen change is needed: Samples Under Testing already shows a section sent
for review as locked, and Results Under Review shows the database message when
an approval is refused (for example "Only the assigned reviewer (…) can
approve these results.").

## Older rows

`entered_by` is empty on rows entered before migration `20261029100300` (applied at go-live, 25 Oct); for them the tester
is taken as the engineer the section is assigned to.
