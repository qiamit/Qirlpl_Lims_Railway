# QIRLPL LIMS: software change control procedure

| | |
|---|---|
| Document | QIRLPL-LIMS-CC |
| Version | 1.0 (draft for QM review) |
| Clause | ISO/IEC 17025:2017 7.11.2 (validated after changes), 7.11.3, 8.3 |
| Record | Quality → Software Change Control (register `software_changes`) and Quality → LIMS Validation Runs (`validation_test_runs`) |

## 1. What counts as a change

Anything that changes how the LIMS behaves or what it stores:

- new code deployed to production (a merge to `main`, which auto-deploys on
  Railway);
- a database migration;
- a change to Railway settings that affect the app (environment variables,
  database version, backups, domains);
- a change to a calculation template, MU sheet template, decision rule,
  report template or numbering prefix that the lab treats as configuration
  (record these too when they affect results).

Not a change for this procedure: entering or editing data through the app
(that is covered by the audit trail).

## 2. Steps

| # | Step | Who | Record |
|---|---|---|---|
| 1 | **Request.** Describe what changes and why, which modules, and the version / commit once known. | Anyone; recorded by QM or Director | New change (status *Requested*); number CHG-YYYY-NNN is given automatically |
| 2 | **Risk.** Rate the change Low / Medium / High using `risk-assessment.md`: High when it touches calculations, conformity, MU, numbering, report or certificate content, access control, or can lose data. | QM | Risk field |
| 3 | **Plan validation.** Decide what testing is needed (table below). For High risk write a rollback plan (the database refuses to approve a High-risk change without one). | QM | "Validation required", rollback plan |
| 4 | **Approve.** The Director or QM approves. The approver's name and time are stamped by the database. | Director / QM | Status *Approved* |
| 5 | **Build and test on staging.** The developer builds on a branch, runs `npm run build`, `npm run validate:calculations` (when calculations may be affected), and migration tests. The QM (or a delegate) runs the OQ scripts in scope on staging. | Developer, QM | Validation run(s) with result and evidence, linked to the change |
| 6 | **Backup.** Before a migration or High-risk deploy, take an on-demand Railway backup and note its label in the change remarks. | Director | Remarks |
| 7 | **Deploy.** Merge to `main` (auto-deploys) and apply migrations by hand, in the documented order, while the lab is idle. | Developer with Director's go-ahead | — |
| 8 | **Mark deployed.** Set the change to *Deployed*. The database refuses this while validation is required and there is no passed validation run linked and no validation reference. | QM / Director | Status *Deployed*; deployed date and person stamped |
| 9 | **Check after deploy.** Open the app, check the version shown on the LIMS Validation pages matches the deployed commit, and do a short smoke test of the changed area. | QM | Remarks, or a validation run with environment *production* |
| 10 | **If something goes wrong.** Follow the rollback plan (redeploy the previous Railway deployment; restore the backup only with the Director's decision), set the change to *Rolled back* with the reason, and record an IT incident. | Director | Status *Rolled back*; IT incident |

## 3. How much testing

| Risk | Before use | Run record |
|---|---|---|
| High | Calculation suite if calculations, rounding, numbering or conformity are touched; all OQ scripts of the affected flows on staging; reviewed by the QM; validation report (`validation-report-template.md`) signed | Required (scope OQ / calculation / regression) |
| Medium | OQ scripts of the affected flow on staging | Required (scope OQ or regression) |
| Low (text, layout, styling, no data or logic) | Developer check; "Validation required" may be unticked with a remark | Not required |

Emergency fixes (production down or data at risk): the Director may approve
and deploy first. Record the change the same day and validate within 5
working days; the change stays *Approved* (not *Deployed*) in the register
until a passed validation run is linked.

## 4. Version identification

- Every build shows its version (short git commit, or `VITE_APP_VERSION` when
  set) on the LIMS Validation pages, next to the page title.
- Railway provides the commit at build time (`RAILWAY_GIT_COMMIT_SHA`);
  locally the build asks git. A build showing `unknown` must not be used for
  validation records.
- Validation runs record the version and commit tested; change records hold
  the version and commit deployed. They must match.

## 5. Calculation validation suite

Run in `frontend/`:

```
npm run validate:calculations
```

- Offline, about 1 second. Checks the real calculation code against 42
  hand-calculated reference cases (MU budget, statistics and rounding,
  conformity under each decision rule, ULR and report numbers, finance number
  prefixes and the financial-year boundary). Every expected value says where
  it comes from (`frontend/scripts/validation/calculationCases.mjs`).
- Prints a table (PASS / KNOWN / FIXED / FAIL) and writes evidence to
  `frontend/scripts/validation/out/latest.json` (and a time-stamped copy).
- Exit code 0 = no failures. **KNOWN** = a deviation already reported to the
  QM (see `risk-assessment.md` section 3); it is listed in the evidence but
  does not fail the run. **FIXED** = a known deviation now gives the expected
  answer: remove its `known` entry. **FAIL** = stop; do not deploy.
- Record it: Quality → LIMS Validation Runs → Record run → **Import evidence
  JSON** → choose `latest.json` → check → Save. The run is then linked to the
  change.
- Adding a case: add an object to `CASES` with a new id, the hand-calculated
  `expected` value and its `source`. Never change an expected value to match
  the program: if the program disagrees, it is a finding.

## 6. Periodic review

Once a year (before the management review) the QM checks: all deployed
changes have validation where required; no change is stuck in *Approved*;
restore tests are within 90 days; open IT incidents. Summarise in the
management review input on "changes that could affect the management system".
