# Metallurgy & Metallography module: design (v0.1, 31 Oct 2026)

Status: design agreed for building **Phase 1** (foundation + ring test end to end + periodic table) on the branch and staging. Nothing goes to production without the lab's explicit OK.

Defaults taken for Phase 1 until the lab decides otherwise (section 3.12):
- Analysis runs in the browser; no new Railway service.
- Ring test first; the module is **off** by default (`metallography_settings.enabled = false`).
- Only the Director sees the pages until Module Access grants are given.
- Results are "Indicative" with a Non NABL suggestion until a method validation record is linked.
- Ring test writes values (t1–t8, TM %); the pass/fail verdict is shown, not written as the conformity statement.
- Upload only (no live camera); PNG/JPEG/BMP/WebP up to 25 MB; no TIFF.
- AI off. The old Metallurgy Software keeps running until the lab decides to archive and switch it off.

Source: map of the Metallurgy Software (commit d1f9745) and of the LIMS, three independent designs and a judge panel.


## 2. Facts re-checked in the LIMS worktree (read-only, 31 Oct 2026)

- **Migrations:** the latest is `20261102101600_result_nabl_scope_override.sql` (migration 54). The next free name is **`20261102101700_metallurgy_module.sql`** (migration 55).
- **`frontend/server.mjs`:**
  - line 10: `APP_PREFIXES`;
  - line 66: `Permissions-Policy: camera=(), …`;
  - line 71: `script-src 'self'`, with no `wasm-unsafe-eval`;
  - line 77: `worker-src 'self'`.
- **`method_verifications`** (`20261027100100_method_validation.sql`):
  - has `test_parameter_id`;
  - `status` is one of draft, under_review, approved, superseded;
  - `conclusion` is one of fit_for_purpose, not_fit, conditional;
  - has `valid_until`.
- **Client consent:** `clients.ai_data_consent` exists (`20261025100200_ai_data_guard.sql:49`).
- **Existing helpers:** `equipment_usable_on(uuid, date)`, `app_module_level_full(text)` and `app_is_quality_manager()` exist.
  - **There is no SQL helper for Technical Manager**, so TM rights go through module access (`app_module_level_full`).
- **Soft delete:** `test_allocation_parameters` is soft-delete mode `'line'`, so a direct delete is still physical.
- **Validation suite:** `MODULE_FILES` is at `calculationCases.mjs:33-47`. The case prefixes in use are CF, CN, DS, GB, IS, MU, NB, PF, RD, RN, SC, SG, TR, ULR. The new prefixes below do not collide with them.

---

## 3. Final design

### 3.1 Architecture decision

**Context.**
- The Metallurgy Software is a separate stack: FastAPI + OpenCV, Next.js and Electron. It has its own users and organisations, storage and AI keys.
- It has critical security flaws: an unauthenticated `/files` route with path traversal, wildcard CORS with credentials, a default JWT secret and open registration.
- Its engines have known errors: planimetric G is about 4 too high, the decarb smoothing does nothing, a 1 µm/px scale is used silently when none is set, and annotations are analysed.
- Its ratings do not follow the standards, and none of its methods are validated.
- The lab needs this testing done inside the LIMS, under its login, roles, module access, audit trail, equipment and sample workflow, with production protected.

**Decision.**
1. **Location.** "Metallurgy & Metallography" is an ordinary LIMS feature folder, `frontend/src/features/metallography/`, inside the existing SPA. Nothing of the old auth, organisations, admin, storage or worker is kept.
2. **Where analysis runs.** In the user's browser, as DOM-free TypeScript engines in a Vite Web Worker, loaded with `new Worker(new URL('./analysis.worker.ts', import.meta.url), {type:'module'})`. CSP `worker-src 'self'` already allows this.
   - The same modules are bundled by `npm run validate:calculations` and run in Node.
   - Each engine is versioned (`grain_size@1.0.0`). A released version is never edited in place; a change becomes a new version.
3. **The analyst confirms every result.** Each engine proposes marks on a vector layer: intercept hits, particles, the decarb transition, ring edges.
   - The analyst adds, removes or moves marks. The reported value is computed from the confirmed marks.
   - Every mark records whether it came from the engine or the operator.
4. **Raw data is immutable.**
   - Original image bytes go to a private bucket with a SHA-256 hash and are never overwritten.
   - Brightness, contrast, zoom and pan only change the view.
   - Crop, rotation, exclusion areas and field ROIs are recorded as vectors and re-applied each time the engine runs.
   - Annotations (text, arrows) form a separate vector layer and are never analysed.
5. **Every read and write uses the user's own JWT** through supabase-js. No service-role path writes metallography records or results. As a result, the following apply unchanged:
   - RLS and `lims_known_staff_only`;
   - the module-access restrictive policies;
   - `tap_stamp_result_entry` and `tap_verify_review_rules`;
   - the issue freeze;
   - `write_audit_log`.
6. **Results reach the LIMS through the normal Enter Results Save.**
   - The parameter row stores `metallography_analysis_id`.
   - The database refuses a saved result that differs from the linked analysis's `reported_value`.
7. **One review path: LIMS Results Under Review.** The old per-job approve/reject is dropped. The reviewer can "Re-check": re-run the stored engine version on the stored originals, with the outcome stamped in an append-only table.
8. **Method governance.**
   - A mapping is reportable only when it links to a `method_verifications` record that is approved, has a conclusion other than not_fit, and is in date.
   - Otherwise the result is marked Indicative, and Enter Results proposes the remark "Indicative – method not yet validated" plus `nabl_scope_override = Non NABL`, which the engineer can edit.
9. **Default off.** The module is off by default (`metallography_settings.enabled = false`) and hidden from Enter Results until the Director turns it on.
10. **AI is off.** If the lab later opts in, it runs as one route in the **existing** functions service, under the lab's AI client-data policy.

**Reasons.**
- **No new Railway service in Phases 1–5.** This meets the staging-first constraint and the rule that a new service needs the user's approval. It also adds no running cost.
- **Not OpenCV.js.** It would need `'wasm-unsafe-eval'` in `script-src` (a production security-header change) and 8–10 MB of WASM, and it would not bundle cleanly into the Node validation runner.
- **Not porting the Python engines as-is.** They report wrong or non-standard numbers. Rewriting them with the fixes and hand-calculated validation cases gives the ISO/IEC 17025 7.11 evidence the lab already imports in Quality → LIMS Validation Runs.
- **Signed-in writers.** The existing result guards only check writers who are signed in (`auth.uid()` set). Writing as the user keeps them effective.
- **Security.** Retiring the old stack removes its security problems instead of carrying them over.

**Trade-offs accepted.**
- Results are computed on the client. This is mitigated by:
  - immutable hashed originals;
  - pinned engine versions;
  - DB recompute wherever the step is plain arithmetic (µm/px from readings, the ring-test decision);
  - reviewer re-check by a second person;
  - the full audit trail.

  It is weaker than a server recompute. That is why Phase 6 (a server engine) stays as an option.
- The image operations are hand-written: Gaussian, CLAHE, Canny, morphology, thinning, Otsu, labelling and moments. They need their own validation cases.
- Browser memory limits apply. Images above 25 MP are refused.

**Rejected:**
- A Python service now (Design A): a new service, a gateway change and a shared secret.
- Embedding the old app in an iframe: `X-Frame-Options DENY` and `frame-src` block it.
- A manual-only first release (Design B): it does not deliver "the whole software".

| Concern | Runs in |
|---|---|
| Login, session, MFA | GoTrue (existing) |
| Records | PostgREST + RLS (existing) |
| Images, overlays, feature lists | storage-api, new private bucket `metallography-images` |
| Image analysis | Browser Web Worker |
| Worksheet PDF | Existing pdf-service via `report-preparation/downloadHtmlAsPdf.ts` |
| AI advisory (optional, Phase 5) | Existing functions service, new route |
| Backup | Existing backup-job; `backup.sh:47-61` mirrors the whole object store |

---

### 3.2 Data model

**Migration 55: `backend/supabase/migrations/20261102101700_metallurgy_module.sql`.** Add it as item 55 to `docs/audit-gap-closure-plan.md:52-108`.

**File conventions**, as in `20261101100200_sampling.sql:1-85`:
- Header text: "NOT applied automatically… Safe to re-run", followed by the list of migrations it depends on.
- `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'`.
- A `DO` block that raises if any dependency is missing:
  - functions: `write_audit_log()`, `app_is_known_staff()`, `app_is_laboratory_director()`, `app_is_quality_manager()`, `app_profile_name(uuid)`, `equipment_usable_on(uuid,date)`, `app_module_level_full(text)`, `app_module_access_install()`, `set_updated_at()`;
  - tables: `samples`, `test_allocations`, `test_allocation_parameters`, `test_parameters`, `equipment_master`, `method_verifications`.
- Idempotent statements throughout: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` then `CREATE POLICY`, and named constraints guarded through `pg_constraint`.
- Every function is `SECURITY DEFINER SET search_path = public, pg_temp`, with `REVOKE ALL … FROM PUBLIC, anon`.
  - Callable RPCs then get `GRANT EXECUTE … TO authenticated, service_role`.
  - Trigger functions are also revoked from `authenticated`.
- `COMMENT ON TABLE` on every table (MCP `list_tables` shows it).
- Ends with `NOTIFY pgrst, 'reload schema'`.

**Applying it:** by hand with `psql --single-transaction -v ON_ERROR_STOP=1`, after a backup, on staging first (`go-live-runbook.md:103-115`). Then run the post-apply checks: RLS on every table, no anon grants, no SECURITY DEFINER function without a search_path, no invalid indexes (`:395, :477`).

#### Tables

**1. `metallography_settings`** (singleton)
- Columns:
  - `id smallint PK DEFAULT 1 CHECK (id=1)`
  - `enabled boolean NOT NULL DEFAULT false`
  - `ai_mode text NOT NULL DEFAULT 'off' CHECK IN ('off','numeric_only','image')`
  - `updated_by`, `updated_at`
- The row is seeded with `INSERT … ON CONFLICT DO NOTHING`.
- Update: Laboratory Director only.

**2. `metallography_parameter_methods`** (which test parameters are metallography tests and how to run them). The Test Parameter master is left unchanged.
- Columns:
  - `id uuid PK`
  - `test_parameter_id uuid NOT NULL UNIQUE REFERENCES test_parameters ON DELETE RESTRICT`
  - `analysis_kind text NOT NULL CHECK IN ('ring_test','grain_size','inclusion','decarburization','microstructure','macro')`
  - `method_variant text` (for example intercept, planimetric, comparison, point_count, threshold)
  - `standard_ref text NOT NULL`, prefilled from `test_parameters.test_method`
  - `reported_quantity text NOT NULL` (for example G, mean_depth_mm, worst_field_ratings, ring_values)
  - `reported_unit text`, `decimals int`
  - `min_fields int NOT NULL DEFAULT 1 CHECK (>0)`, `min_counts_per_field int`
  - `scale_mode text NOT NULL DEFAULT 'calibration' CHECK IN ('calibration','in_image_reference')`; `in_image_reference` is allowed only for ring_test and macro
  - `settings jsonb NOT NULL DEFAULT '{}'`, which holds:
    - ring-test limits: defaults 0.07d / 0.15d and 30–50 % from the old code, flagged "verify against IS 1786";
    - ring-test gaps and angular correction;
    - grain test-line pattern;
    - **inclusion rating limits, entered and verified by the TM from the lab's licensed standard.** The code contains no chart values, and the engine refuses to rate when they are missing.
  - `method_verification_id uuid REFERENCES method_verifications ON DELETE SET NULL`
  - `active boolean NOT NULL DEFAULT true`
  - `created_by`, `created_at`, `updated_at`
- Write: the Director, or `app_module_level_full('/metallography/methods')='edit'`, checked in a guard trigger.
- A delete is refused once any analysis references the row; deactivate it instead.

**3. `metallography_scale_calibrations`** (the µm/px record; ISO/IEC 17025 6.4, 6.5, 7.5)
- Identity and equipment:
  - `id`, `cal_code text UNIQUE` (MSC-YYYY-NNN, set by trigger)
  - `microscope_equipment_id uuid NOT NULL REFERENCES equipment_master ON DELETE RESTRICT`
  - `camera_equipment_id uuid REFERENCES equipment_master`
  - `stage_micrometer_equipment_id uuid NOT NULL REFERENCES equipment_master`
- Optics:
  - `objective text NOT NULL`, `total_magnification numeric`
  - `image_width_px int NOT NULL`, `image_height_px int NOT NULL`: µm/px is valid only at this resolution
  - `camera_settings jsonb`
- Readings and scale:
  - `reference_length_um numeric NOT NULL CHECK (>0)`
  - `readings jsonb NOT NULL`, as `[{axis:'x'|'y', x1,y1,x2,y2, length_px}]`, at least 3 per axis (trigger)
  - `um_per_px_x`, `um_per_px_y numeric NOT NULL CHECK (>0 AND <1000)`. **The trigger recomputes both from the readings**, so a typed value cannot disagree with them.
  - `u_rel_scale numeric` (trigger: s / mean of the readings)
  - Always µm. There is no free `unit` field, which removes the old mm/µm error.
- Evidence: `evidence_image_path text NOT NULL`, `evidence_image_sha256 text NOT NULL`
- People and status:
  - `performed_by`, `performed_by_name`, `performed_at` (stamped)
  - `verified_by`, `verified_by_name`, `verified_at`
  - `status text NOT NULL DEFAULT 'draft' CHECK IN ('draft','verified','withdrawn')`
- Validity and other: `valid_from date`, `valid_until date NOT NULL`, `override_reason`, `withdraw_reason`, `notes`, `created_at`, `updated_at`
- Guard rules:
  - The verifier must not be the performer.
  - Verifying needs edit on `/metallography/scale-calibrations`.
  - At verification, `equipment_usable_on(stage_micrometer, performed_at::date)` and `equipment_usable_on(microscope, valid_from)` must both be true, unless the Director records an `override_reason`.
  - Once verified, readings, image and geometry are immutable. The only allowed changes are withdraw (with a reason) or shortening `valid_until`.
  - Delete: drafts only, by the performer or the Director.

**4. `metallography_analyses`** (one technical record behind one result; ISO/IEC 17025 7.5.1)
- Identity and links:
  - `id uuid PK DEFAULT gen_random_uuid()`. The browser may supply it so storage paths can be built first.
  - `analysis_no text UNIQUE` (MA-YYYY-NNNNN, trigger)
  - `purpose text NOT NULL DEFAULT 'sample' CHECK IN ('sample','validation','iqc','training')`
  - `test_allocation_parameter_id uuid REFERENCES test_allocation_parameters ON DELETE RESTRICT`, required when `purpose='sample'` and null otherwise
  - `sample_id`, `test_allocation_id`, `test_parameter_id`: **always derived by the trigger** from the parameter row; client values are ignored
- Method:
  - `method_id uuid REFERENCES metallography_parameter_methods`
  - `method_snapshot jsonb`: kind, standard, settings and reportable flag at creation, so later edits to the method do not change past records
  - `analysis_kind text NOT NULL`
  - `indicative boolean NOT NULL`
- Scale and equipment:
  - `scale_calibration_id uuid REFERENCES metallography_scale_calibrations`
  - `scale_snapshot jsonb` (cal_code, µm/px x and y, objective, resolution, validity, u_rel)
  - `in_image_scale jsonb`: reference line(s), length in mm, and `ruler_equipment_id`, for ring and macro photos
  - `microscope_equipment_id`, `camera_equipment_id uuid REFERENCES equipment_master`
  - `equipment_snapshot jsonb`, in the `EquipmentUsedSnapshot` shape (`lib/equipmentTraceability.ts:15-33`)
- Specimen: `magnification text`, `etchant text`, `specimen_prep jsonb` (orientation L/T, polish, etch time, location), `test_date date NOT NULL`
- Engine and result:
  - `engine_version text`, `engine_params jsonb NOT NULL DEFAULT '{}'`
  - `result_summary jsonb`: per-field values, n, mean, s, 95 % CI, %RA, ratings tables, depths, ring metrics and the engine verdict
  - `reported_value text`: the exact text that goes to `results`
  - `reported_unit text`
- Status:
  - `status text NOT NULL DEFAULT 'in_progress' CHECK IN ('in_progress','completed','superseded','void')`
  - `completed_by`, `completed_at`
  - `superseded_by uuid REFERENCES metallography_analyses`
  - `void_reason`, `voided_by`, `voided_at`
- Report and stamps: `include_in_report boolean NOT NULL DEFAULT false` (micrograph annex), `performed_by DEFAULT auth.uid()`, `performed_by_name`, `created_at`, `updated_at`
- Indexes:
  - partial unique index on `(test_allocation_parameter_id) WHERE status='in_progress'`
  - partial unique index on `(test_allocation_parameter_id) WHERE status='completed'`
  - `(sample_id)`, `(analysis_kind, created_at DESC)`, `(status, created_at DESC)`

**5. `metallography_fields`** (one original image or field of view)
- Image:
  - `id`, `analysis_id uuid NOT NULL REFERENCES metallography_analyses ON DELETE RESTRICT`
  - `field_no int NOT NULL`, with `UNIQUE (analysis_id, field_no)`
  - `raw_image_path text NOT NULL`, `raw_image_sha256 text NOT NULL CHECK (~ '^[0-9a-f]{64}$')`
  - `raw_image_bytes bigint`, `raw_image_mime text`, `original_file_name text`
  - `image_width_px int`, `image_height_px int`, `captured_at timestamptz`, `location_on_specimen text`
- Edits and marks:
  - `display_settings jsonb`: view only
  - `operator_adjustments jsonb`: crop ROI, rotation, exclusion polygons
  - `marks jsonb NOT NULL DEFAULT '{}'`: vector marks, each with an origin of engine or operator
  - `annotations jsonb`: text and arrows, never analysed
- Outputs:
  - `measurements jsonb`
  - `features_path text`, `features_sha256 text`: large particle and intercept lists are kept as JSON in the bucket, which keeps `audit_log` small
  - `rendered_overlay_path text`
- Flags and stamps: `include_in_report boolean DEFAULT false`, `excluded boolean DEFAULT false`, `exclude_reason`, `uploaded_by` (stamped), `created_at`, `updated_at`
- The raw path is not unique: a superseding analysis re-uses the same stored original by reference.

**6. `metallography_rechecks`** (append-only evidence for ISO/IEC 17025 7.7)
- Columns: `id`, `analysis_id REFERENCES metallography_analyses`, `engine_version`, `hashes_verified boolean`, `match boolean`, `details jsonb`, `run_by DEFAULT auth.uid()`, `run_by_name`, `run_at`
- Insert allowed for: the parameter row's assigned reviewer (`results_reviewer_id = auth.uid()`), the QM or the Director, **and never the performer**.
- No update. Delete by the Director only.

**7. `metallography_counters(kind text, year int, last int, PK(kind, year))`** with `metallography_next_number(kind)`.
- RLS is on with no policies, and nothing is granted to `authenticated`.

**8. Change to an existing table:** `ALTER TABLE test_allocation_parameters ADD COLUMN IF NOT EXISTS metallography_analysis_id uuid REFERENCES metallography_analyses ON DELETE RESTRICT`.
- The column is nullable and additive.

#### Functions and triggers

- **`app_metallography_enabled()`, `app_metallography_can_run()`** (Director, or `app_module_level_full('/metallography/analyses')='edit'`) and **`app_metallography_method_reportable(p_method uuid)`**.
  - The last one checks that the linked `method_verifications` status is 'approved', its conclusion is not 'not_fit', and `valid_until` is null or not before today.
- **`app_metallography_result_locked(p_tap uuid)`.** True when `results_review_status IN ('under_review','approved')` or `samples.stage='completed'`. These are the same lock states as migrations 53/54 and the issued-row freeze.
- **`metallography_analyses_guard`** (BEFORE INSERT/UPDATE/DELETE). Like the existing tap_* guards, it is skipped when `auth.uid()` is NULL (psql maintenance). It applies these rules:
  - **On insert:**
    - the module must be enabled (or the caller is the Director), and `can_run` must be true;
    - for purpose 'sample': derive the links, require an active mapping for the parameter, and refuse if the row is locked;
    - snapshot the method and set `indicative`;
    - force `status='in_progress'`, number the record and stamp the performer.
  - **Immutable fields:** links, purpose, performer, number and method snapshot.
  - **While `in_progress`:** only the performer or the Director may edit.
  - **`in_progress → completed`** requires all of:
    - non-excluded fields ≥ `min_fields`;
    - a calibration that is verified and valid on `test_date`, with every field's resolution equal to its `image_width_px` × `image_height_px`. Alternatively, `in_image_scale` with a ruler equipment id, where `scale_mode` allows it;
    - `equipment_usable_on(microscope, test_date)`, unless the Director gives a reason;
    - `test_date` between the day the analysis started and today (lab date); an earlier date only by the Director with a reason;
    - the module switched on (or the Director) and the right to run analyses at completion, not only at creation;
    - `reported_value` not null.

    For ring_test, it also **recomputes the decision** from `result_summary`:
    - all 8 `thickness_mm` values must lie within the limits × d;
    - TM share = area_tm / (area_tm + area_fp) × 100 must lie within the limits;
    - rounding is fixed (thickness 3, TM share 2 decimals) and never read from the summary; the stored share must be the share of the stored areas within 0.005 %, and both limits are judged on the stored values, so the client's `overall_pass` must agree exactly (no tolerance on the verdict);
    - a TM area of 0 is a valid FAIL;
    - fewer than 8 valid points is refused;
    - `reported_value` must be the text built from `result_summary` (v 2 entries t1–t8 and TM, reported "t1 … mm, …; TM … %"), so the linked result cannot differ from the checked values.

    On completion, any earlier 'completed' analysis of the same parameter row becomes 'superseded'.
  - **`completed → void`:** needs a reason, and the caller must be the performer or the Director.
  - **Locks:** any change is refused while the linked parameter row is locked, except by the Director (audited).
  - **Delete:** an `in_progress` analysis with no fields, by the performer, or by the Director.
- **`metallography_fields_guard`.** Insert, update and delete are allowed only while the parent is `in_progress`, by the performer or the Director. The `raw_image_*` columns can never change.
- **`metallography_scale_calibrations_guard`** and **`metallography_parameter_methods_guard`** apply the rules given with their tables.
- **`tap_metallography_link_guard`** (BEFORE INSERT OR UPDATE on `test_allocation_parameters`; the update checks are skipped when `auth.uid()` IS NULL):
  - A new row (INSERT, e.g. the report amendment copy) never carries a link: the trigger clears it, and Use result links it again.
  - When `metallography_analysis_id` or `results` changes, or `results_review_status` moves to 'under_review' or 'approved', and the link is not null, three things must hold:
    - the analysis is 'completed';
    - it belongs to this row;
    - `NEW.results IS NOT DISTINCT FROM reported_value`.

    Otherwise it raises: "Result comes from metallography analysis MA-…; change it there or unlink".
  - Changing or clearing the link is refused while `OLD.results_review_status IN ('under_review','approved')`. `tap_verify_review_rules` does not cover this new column.
  - The source of a result under review, approved or issued cannot be superseded (completing a newer analysis) or voided, even by the Director: refer it back first. A result whose analysis was superseded or voided before review cannot be sent for review or approved until it is re-linked or unlinked.
  - The issued-row freeze already compares the whole row.
- **Storage helpers:**
  - `app_metallography_can_upload(p_name)`: the path is `analyses/<id>/…` for an `in_progress` analysis the caller performs, or `calibrations/<id>/…` for a draft calibration the caller performs.
  - `app_metallography_object_deletable(p_name)`: no field or calibration row references the path.
- **RPC `app_metallography_record_recheck(p_analysis, p_match, p_details)`.**
- **`set_updated_at` triggers** on all business tables.

#### RLS and grants (pattern of `sampling.sql:756-775`)

Applied to every table:
- `ENABLE ROW LEVEL SECURITY`;
- the RESTRICTIVE `lims_known_staff_only` policy;
- `REVOKE ALL FROM PUBLIC, anon, authenticated`, then explicit `GRANT SELECT, INSERT, UPDATE[, DELETE] TO authenticated` and `GRANT ALL TO service_role`.

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| settings | known staff | none (seeded) | Director | none |
| parameter_methods | known staff | Director / methods edit | Director / methods edit | Director / methods edit; guard refuses if referenced |
| scale_calibrations | known staff | calibrations edit, `performed_by = auth.uid()` | performer, verifier, Director (guard decides) | draft by performer, or Director |
| analyses | known staff | `performed_by = auth.uid() AND app_metallography_can_run()` | performer, QM, Director (guard decides) | as the guard allows |
| fields | known staff | performer of the parent | performer of the parent | performer of the parent while `in_progress`, or Director |
| rechecks | known staff | assigned reviewer / QM / Director, not the performer | none | Director |
| counters | none | none | none | none |

**No Recycle Bin.** This matches every table created after `20261025100000_soft_delete.sql`: records are voided or withdrawn, and physical deletes are limited to drafts and the Director and recorded by `write_audit_log`.

#### Audit

- `<table>_audit_log AFTER INSERT OR UPDATE OR DELETE … EXECUTE FUNCTION public.write_audit_log()` on tables 1–6, guarded by `to_regprocedure` (`sampling.sql:833-848`).
- Bucket uploads and deletes are logged automatically by `lims_storage_objects_audit` (`20261102101100…:61-118`).
- `recordReason()` (`lib/auditReason.ts:39-83`) runs after void, withdraw, unlink and every Director override.
- Labels go into `features/audit-trail/auditTrailDiff.ts` `AUDITED_TABLES`.

#### Bucket

Inside a `DO` block guarded by `to_regclass('storage.buckets')`, as at `20261029100300…:779-841`:
- Bucket **`metallography-images`**:
  - `public=false`;
  - `file_size_limit 26214400` (25 MB, the same as `validateUpload.ts`); raise it only on the user's decision;
  - `allowed_mime_types {image/jpeg, image/png, image/webp, image/bmp, image/tiff, application/json}`;
  - `ON CONFLICT DO UPDATE SET public=false…`.
- Paths:
  - `analyses/<analysis_id>/fields/<field_no>_<sha16>.<ext>`;
  - `analyses/<id>/overlay_<field_no>.png`;
  - `analyses/<id>/features_<field_no>.json`;
  - `calibrations/<cal_id>/micrometer_<sha16>.<ext>`.
- Policies on `storage.objects`:
  - `lims_metallography_images_select`: bucket AND `app_is_known_staff()`;
  - `_insert`: bucket AND `app_metallography_can_upload(name)`;
  - **no update policy**, so originals are never overwritten;
  - `_delete`: bucket AND (Director OR (owner = auth.uid() AND `app_metallography_object_deletable(name)`)). This allows clean-up after a failed insert.
- The new bucket is not in the ten-bucket list of `lims_storage_owner_delete`, so it relies on these policies.

#### Module access map

As at `sampling.sql:855-878`: `DELETE FROM module_table_map WHERE source='seed:20261102101700'`, INSERT the rows below with that source, then `PERFORM app_module_access_install()`.

| Table | Module path | Write | Read |
|---|---|---|---|
| metallography_analyses, metallography_fields | /metallography/analyses | edit | view |
| same | /samples/under-testing, /samples/results-review, /samples/report-preparation, /samples/completed | never | view |
| metallography_scale_calibrations | /metallography/scale-calibrations | edit | view |
| same | /metallography/analyses, /samples/results-review | never | view |
| metallography_parameter_methods, metallography_settings | /metallography/methods | edit | view |
| same | /metallography/analyses, /samples/under-testing, /samples/results-review | never | view |
| metallography_rechecks | /samples/results-review | edit | view |
| same | /metallography/analyses | never | view |

- Mapping matters for two reasons: an unmapped table is unrestricted (`app_module_table_decision` returns true), and it is readable by every MCP role.
- `/samples/under-testing` gives **view only**. Running analyses needs an explicit `/metallography/analyses` edit grant (personnel competence, 6.2).

#### MCP policy (`backend/mcp-server/lib/policy.mjs`; redeploy after the migration)

- `HIDDEN_TABLES` (:7-16): `metallography_counters`.
- `WRITE_BLOCKED_TABLES` (:26-47): `metallography_settings`, `metallography_parameter_methods`, `metallography_scale_calibrations`, `metallography_analyses`, `metallography_fields`, `metallography_rechecks`, and later `metallography_ai_runs`. Reason: "metallography raw data and settings are made only in the app".
- `CREATE_BLOCKED_TABLES` (:50-62): `metallography_analyses`, `metallography_scale_calibrations` (numbered records).
- `test_allocation_parameters` is already write-blocked, so the new column is covered.

#### Outside the migration

- **Data fix `backend/supabase/data-fixes/20261103_module_access_metallography.sql`**, modelled on `20261025_module_access_new_pages.sql:1-102`:
  - it refuses to run when `auth.uid()` is set, inserts only for active users who already have rules, and uses `ON CONFLICT DO NOTHING`;
  - edit on `/metallography/analyses` for the designations the lab names;
  - edit on `/metallography/scale-calibrations` and `/metallography/methods` for the TM and QM;
  - view on all of them for reviewers.
- **Then** the Director presses "Sync module catalog" on `/lab-settings/module-access-enforcement`.
- The legacy allowlists (`moduleAccess.ts`, SQL `app_legacy_allowed_paths`) are **not** changed. Until rules are granted, only the Director sees the pages, which is safe by default.
- **Later migration (Phase 5, only if AI is opted in):** `metallography_ai_runs`, using the next free number at that time (see 3.6).

---

### 3.3 Screens, routes, sidebar and module keys

**Sidebar.** In `frontend/src/lib/appNav.ts`, Testing LIMS section (:523-586), add a new group **after the Sample Handling group (children end at :575) and before Consent Letter (:576)**. Icons come from the lucide-react import block (:2-77).

```ts
{ label: 'Metallurgy & Metallography', icon: Microscope, clause: '7.2', children: [
  { label: 'Analyses',                       to: '/metallography/analyses',           icon: Microscope, clause: '7.5' },
  { label: 'Microscope Calibration (µm/px)', to: '/metallography/scale-calibrations', icon: Ruler,      clause: '6.4' },
  { label: 'Method Setup',                   to: '/metallography/methods',            icon: Settings2,  clause: '7.2' },
  { label: 'Periodic Table',                 to: '/metallography/periodic-table',     icon: Atom },
]}
```

- `flattenNavModules()` (:717-737) turns each `to` into a module key.
- Sub-routes inherit their key by longest-prefix matching (`moduleCatalog.ts:42-61`).
- There are no `requiredDesignations`; module access decides.
- The path avoids `/calibration`, which is already the Calibration LIMS prefix.

**Registration, for every page:**
- lazy page and `*Route` wrapper in `routes/routeElements.tsx` (pattern of `SamplingPlansRoute` :493-495);
- `<Route>`s in `App.tsx` inside `AuthenticatedShell` (:154-438), plus `<Route path="metallography" element={<Navigate to="/metallography/analyses" replace/>}/>`;
- `ROUTE_LABELS` in `GlobalLayout.tsx` (:172-304);
- **`'/metallography'` in `APP_PREFIXES` in `frontend/server.mjs`**, without which deep links return 404 in production;
- entries in `features/help/helpContent.ts`.

**On every page:**
- A "Metallography is not in use" gate (pattern of `sampling/SamplingUi.tsx:26-59`) when the setting is off. `MissingMigrationNotice` when migration 55 is absent (`lib/missingSchema.ts`).
- The `EnvHeader` / `EnvPanel` / `MessageLine` / `Field` kit (`features/environment/EnvironmentUi.tsx`).
- Save buttons use `limsPrimaryBtnClass` and void/withdraw buttons use `limsDeleteBtnClass`, so view-only users are blocked (`index.css:161-168`).
- The workbench canvas also calls `useCanEditCurrentModule()` to disable the marking tools.

| # | Screen | Route | Module key | Files (under `features/metallography/`) | Replaces |
|---|---|---|---|---|---|
| S1 | **Analyses register** | `/metallography/analyses` | `/metallography/analyses` | `MetallographyMasterPage.tsx`, `…HeaderBar.tsx`, `…Table.tsx`, `…FooterBar.tsx` | Analysis & Jobs, JobsList, JobsFilterDropdown, Dashboard |
| S2 | **Analysis workbench** (full page) | `/metallography/analyses/:id` | inherits S1 | `workbench/MetallographyWorkbench.tsx`, `ImageStage.tsx`, `FieldStrip.tsx`, `ScalePanel.tsx`, `ResultPanel.tsx`, `panels/{RingTestPanel, GrainSizePanel, InclusionPanel, DecarbPanel, PhasePanel, MacroPanel}.tsx` | Capture Studio, Ring Test New Test, Job detail |
| S2d | **Workbench dialog** (same component) | none; opened from Enter Results | `/samples/under-testing` for the page; writes need `/metallography/analyses` edit | `workbench/MetallographyAnalysisDialog.tsx` | none |
| S3 | **Analysis view** (read-only, re-check) | inside S2 when read-only; dialog from review | inherits | `view/MetallographyAnalysisView.tsx` | Job detail, ring-test report |
| S4 | **Microscope Calibration** | `/metallography/scale-calibrations` | same | `calibrations/MicroscopeCalibration{MasterPage,HeaderBar,Table,Form,FooterBar}.tsx` | Calibrations page and capture calibration modal |
| S5 | **Method Setup** | `/metallography/methods` | same | `methods/MethodSetupPage.tsx` | Analysis module catalogue, ring-test settings, admin "ai" |
| S6 | **Periodic Table** | `/metallography/periodic-table`, `/metallography/periodic-table/:symbol` | `/metallography/periodic-table` | `periodic-table/*` | Periodic table pages |
| S7 | **Worksheet print** | dialog from S2 and S3 | inherits | `worksheet/metallographyWorksheetHtml.ts` | `reports.py`, ring-test report page |

**S1 Analyses register**
- A stat strip (in progress, completed and not sent to results, calibrations expiring within 15 days), which replaces the old dashboard.
- **Pending** tab:
  - lists saved parameter rows whose test parameter is mapped and active, with empty results, not locked, in the user's allocations (the Director sees all);
  - joins SRF and section;
  - "Analyse" opens S2d.
- **Analyses** tab:
  - quick filter by kind (All, Ring test, Grain size, Inclusion, Decarburization, Microstructure, Macro), plus status, date, SRF and analyst; filters live in the URL;
  - phone card list (`md:hidden`) plus desktop table (`hidden md:block`);
  - columns: Analysis No, SRF/Sample, Parameter, Standard, Scale, Status, Reported value, Linked to result, Re-check, Performed by/at;
  - a "New validation / IQC analysis" action for analyses with purpose ≠ sample.
- Footer: Export CSV, Print, and Void (with a reason).
- `QiAssistant` gets counts only.

**S2 / S2d Workbench.** Steps: Image → Scale & equipment → Analyse → Review marks → Complete → Use result.
- **Left: fields.**
  - Upload the original with `assertAllowedUpload` and a metallography extension set (png, jpg, jpeg, bmp, webp, plus tif/tiff only if a decoder is approved).
  - SHA-256 is computed in the browser before upload.
  - Each field shows size, pixels, captured-at, location, and exclude-with-reason.
  - The original is re-hashed on every open, with a red banner if it does not match.
- **Centre: image stage.**
  - The image is loaded with `storage.download()` as a blob, so the canvas is not tainted.
  - Zoom and pan use CSS transforms, with view-only brightness and contrast.
  - Scale bar drawn from the calibration; ROI and exclusion polygons.
  - Mark layers: engine proposals in one colour, operator marks in another.
  - Annotation layer for text and arrows.
  - Tools: select, pan, field ROI, exclusion polygon, measure line, intercept mark, particle edit, surface polyline, ring tools, text, arrow.
- **Right: scale and equipment.**
  - Calibration select: only verified calibrations valid on `test_date` whose resolution matches the field.
  - Microscope and camera are prefilled from the calibration, with a usability badge from `checkEquipmentUsableOn`.
  - Magnification, etchant, specimen preparation, test date.
- **Result panel:**
  - per-field values, n, mean, s, 95 % CI, %RA;
  - warnings below `min_fields` or `min_counts_per_field`;
  - the reported value preview;
  - an "Indicative" badge when the method is not reportable.
- **Actions:**
  - Save draft;
  - Complete (checked by the server);
  - Supersede (creates a new analysis that copies the fields by reference);
  - Void;
  - **Use result** (S2d returns the value to Enter Results; S2 sets it to be picked up there);
  - Print worksheet.
- **Ring test panel:** RingEditor in LIMS chrome.
  - The scale comes from `in_image_scale` (known-length line plus ruler equipment) or a calibration.
  - The nominal d is entered and prefilled from the sample where it is available.
  - Use result is blocked until t1–t8 are applied.

**S3 Analysis view**
- Originals and overlays via signed URLs (600 s) or blobs; marks; calibration snapshot; equipment with certificate numbers; statistics; engine version; hashes; supersede chain.
- **Re-check:** re-downloads the originals, verifies the hashes, re-runs the **stored** engine version with the stored parameters and adjustments, compares with `result_summary` at the reported rounding, and stamps `metallography_rechecks`.

**S4 Microscope Calibration**
- Equipment pickers from `loadEquipmentOptions()` for the microscope, camera and stage micrometer.
- Upload the micrometer image and draw at least 3 readings per axis on it; µm/px and u_rel are computed live.
- Validity dates; Verify (by a second person); Withdraw (with a reason).
- An "expires in N days" warning.

**S5 Method Setup**, with four tabs:
- **Test parameters:** the Test Parameter master list (item, IS code, clause, `test_method`, NABL scope), with map/unmap to a kind and the settings from table 2.
- **Method validation:** link to a `method_verifications` record; shows Reportable or Indicative.
- **Module settings:** enabled flag and AI mode. Director only (RLS plus `LaboratoryDirectorOnly`).
- **Engines:** the engine versions bundled in this build, with a link to Quality → LIMS Validation Runs.

**S6 Periodic Table:** a reference only. Fixes: a missing `?temp` defaults to 27 °C, and Escape closes the detail modal.

**S7 Worksheet** (the internal raw-data record), printed through pdf-service:
- letterhead;
- SRF, sample, parameter, standard and clause;
- scale calibration and equipment with asset codes, certificate numbers and due dates;
- engine version and hashes;
- per-field thumbnails with marks;
- values, statistics and the reported value;
- performed by, completed by, reviewed by.

Images are embedded as data URLs by generalising `embedPrintImageAsDataUrl` (`embedPrintImages.ts:3,14-18`), which today parses only the `laboratory-files` bucket.

**Changes to existing screens:**
- Enter Results and Results Under Review (3.4).
- Optional micrograph annex in the test report print (`buildPaginatedTestReportHtml.ts`, Phase 4).
- Dashboard cards in `features/dashboard/DashboardPage.tsx` `testing.push(...)` (Phase 4).

**Dropped, because the LIMS already has an equivalent:**
- landing, login and register pages;
- AppShell;
- the admin sections lab, users, roles, ai, contact and help;
- the `/app/jobs` redirect;
- the old per-job approve/reject;
- the Electron bridge;
- RingTestNav and the ring-test reports list (replaced by S1 filtered to Ring test, plus S3 and S7).

---

### 3.4 Enter Results integration

1. **Setup.** The TM maps parameters once in Method Setup.
2. **Launch link.**
   - When `SectionResultsEntryDialog` opens, it loads the mappings for its rows' `testParameterId`s in one query, like the NABL-scope load at :461-492. It shows nothing if the table is missing.
   - In each row's result cell, the **word** "Metallography" is added to the `TestResultsEntryCell` footer next to Attach, so the row reads "Calculator | Attach | Metallography" (slot at `TestResultsEntryCell.tsx:293-306`; cell at `SectionResultsEntryDialog.tsx:1271-1307`).
   - It is shown only when all of these hold:
     - the module is enabled (RPC `app_metallography_enabled()`);
     - the parameter is mapped;
     - the row is saved (`paramRowId` not null, the same rule as `ResultObservationMeta.tsx:27-60`);
     - the dialog is not read-only.
   - The hover text shows the analysis number and status.
3. **Click.**
   - Opens S2d as a stacked full-height dialog (`layer="stacked"`, `overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"`), so the Enter Results draft stays in place.
   - Creates the analysis if none is in progress, otherwise reopens the draft.
   - Has an "Open in full page" link. If the analyst finishes there, Enter Results refetches on window focus (`mergeSectionDraftPreservingEdits`) and the link reads "MA-… completed — Use result".
4. **Use result** returns `{ results, metallographyAnalysisId, suggestedEquipmentIds, indicative }` to the row draft through `updateDraft`. The value is built by `formatResult.ts`:
   - Single values are plain text in the parameter's unit, rounded with `lib/is2Rounding.ts` to the mapped decimals. Examples: grain size "7.5", decarburization "0.18".
   - Multi-value results become a `StructuredTestResult` with `entries` and `reported` (`testResultValues.ts:49-57`, serialize :175+). Examples: the inclusion worst-field ratings per type and series; the ring test t1–t8 in mm plus TM %.
   - The engine's verdict, for example the ring test pass/fail, is **shown but not written as the conformity statement**. Conformity stays with the existing decision rule (`evaluateResultConformity.ts`), unless the user decides otherwise.
   - If `indicative`, the row proposes the report remark "Indicative – method not yet validated (metallography)" and `nabl_scope_override='Non NABL'`. The engineer can edit both.
5. **Equipment.** `suggestedIds` (microscope, camera) pre-select the `EquipmentUsedPickerDialog`. The existing usability check runs at save (`SectionResultsEntryDialog.tsx:774-817`).
6. **Save is the normal path:** `SampleUnderTestingMasterPage.handleSaveSectionResults` (:1036-1200). The only change is that the update payload adds `metallography_analysis_id`, keeping the existing retry-without-column pattern. Because the user's JWT writes the row:
   - `tap_stamp_result_entry` stamps entered_by;
   - `tap_verify_review_rules` applies;
   - `tap_metallography_link_guard` checks that results equal `reported_value`;
   - a reason is asked for referred-back rows; `recordReason` and `advanceSampleStageIfNeeded` run as now.
7. **Linked rows.**
   - The result box is read-only and labelled "from MA-…".
   - "Unlink" asks for a reason (`useReasonForChange`) and is refused while the row is under review or approved.
   - A stale dialog that tries to overwrite a linked value is refused by the database with a clear message.
8. **Review.**
   - Results Under Review uses the dialog read-only (`ResultsUnderReviewMasterPage.tsx`, `ResultsReviewedSrfsDialog.tsx`). The same footer shows "View analysis", which opens S3 with Re-check.
   - Self-review and non-assigned reviewers are already refused by the database (migrations 53/54).
   - While the row is under review or approved, or the sample is issued, every analysis, field and link change is refused (Director exempt, audited).
   - Referral back unlocks the row. The analyst then supersedes the analysis, completes it, and uses the new result.
9. **What the LIMS can read.**
   - The reported value is in `test_allocation_parameters.results`, like every other result: Results Under Review, Report Preparation, Issued reports, dashboards, and MCP read-only.
   - The full raw data is in the new tables and the bucket, readable from the review, report and completed pages through `module_table_map`.

---

### 3.5 Equipment traceability (6.4, 6.5, 7.5.1)

- **Identifying the instruments.** `equipment_master` has no category column. The microscope, camera, stage micrometer and the ruler for macro and ring photos are ordinary `testing`-kind rows, identified by being chosen on a scale calibration or an in-image scale. No equipment schema change is needed.
- **Calibration chain:**
  - The stage micrometer's certificate is already in `equipment_master` and `equipment_calibration_history`.
  - At verification of a scale calibration, the micrometer must be usable on the reading date and the microscope on `valid_from`; the Director may override with a reason.
- **At completion of an analysis:**
  - the calibration must be verified and in date on `test_date`, with matching resolution;
  - the microscope must pass `equipment_usable_on(id, test_date)`, which checks status, calibration overdue, open breakdown and deleted;
  - otherwise only the Director may proceed, with a reason.
- **Stored with each analysis:** `microscope_equipment_id`, `camera_equipment_id`, `scale_snapshot` and `equipment_snapshot` in the `snapshotFromOption` shape.
- **In the result row:** the snapshot is offered to the existing picker and saved in `equipment_used`. Equipment stays optional for saving a result, as it has been since 26 Oct, but the analysis always records it.
- **Due dates:** an expired or withdrawn scale calibration cannot be selected. Calibrations due within 15 days show in S1 and S4 (dashboard card in Phase 4).
- **Environment:** the existing `environment_snapshot` on the result row applies unchanged.

---

### 3.6 Analysis engines and the fixes that come with the port

All engines live in `features/metallography/engines/`. They are DOM-free: input is a `GrayImage {width, height, data: Uint8Array}`, plus x and y µm/px, parameters and adjustments. Output is the result, vector marks and features. Shared operations live in `imageOps.ts`.

| Kind | What the engine does | Fixes vs the Metallurgy Software | Reported as |
|---|---|---|---|
| Ring test (IS 1786) | Ported `analysis/index.ts` maths and `detect-ring.ts` edge scans (on ImageData, not `document.createElement('canvas')`). | Keeps the aspect ratio (no 590×590 stretch). Polygon areas by shoelace. One source for d. Thickness points required. Raw image and full geometry saved. Decision recomputed in SQL. | t1–t8 values, TM % (verdict shown, not written) |
| Grain size (ISO 643) | Intercept on a test-line pattern; planimetric; comparison-chart entry (chart reference + G per field). | G = log2(m) − 3 for planimetric (was log2(na)+1, about +4). One count per boundary (close, then thin, before counting crossings). x and y µm/px used separately. End segments counted 0.5. Exclusion masks. Multi-field statistics. null instead of G=0. Intercept constants in the ISO 643 form, checked against the scan. | G, with ℓ̄ and statistics in the analysis |
| Inclusion (ISO 4967) | Field-based rating on a 0.50 mm² ROI; particles from labelling plus moments; stringer grouping; thin/heavy series. | Major and minor axes from moments, so diagonal stringers are no longer typed D. Minimum size in µm, not 8 px. No invented 0–5 severity. Rating limits come from Method Setup (entered by the lab). The operator confirms each type. | Worst-field rating per type and series (structured) |
| Decarburization (ISO 3887) | Operator-drawn surface polyline; N profiles normal to the surface; core reference; partial and complete markers. | Correctly oriented 1-D Gaussian (was ksize (1,31)). No "surface at column 0". Mean and maximum reported. | Mean and maximum depth in mm |
| Microstructure | Point-count grid, or operator multi-threshold with histogram; % per phase with CI. | Replaces the single Otsu split. Indicative until validated. | % per phase, or text observation |
| Macro | Measurement aid (lengths and counts on a calibrated photo). | Not labelled an IS 10138 rating. | Text observation plus measurements |

---

### 3.7 AI advisory data control (Phase 5, only if the lab opts in)

- **Where it runs:** a new route `POST /metallography-ai` in the **existing** `backend/functions/server.mjs` route map (:1032-1043), behind `requireKnownStaff` (:127-161).
  - The model comes from LIMS AI Settings: the default active `ai_models` row, read with the service role as `handleQiAssistant` does. The browser never sees a key.
  - `handleQiAssistant` is text-only, so a vision-capable model and a new handler are needed. Providers the existing handler refuses stay refused.
- **What may be sent**, checked on the server:

  | `metallography_settings.ai_mode` | `lab_settings.ai_client_data_mode` | Client consent (`clients.ai_data_consent`) | Sent |
  |---|---|---|---|
  | off | any | any | nothing |
  | any | off | any | nothing |
  | numeric_only, or any with redact | redact / allow_with_consent | any | numeric `result_summary` only; no sample, client or file identifiers |
  | image | allow_with_consent | yes (or purpose ≠ sample) | image downscaled to ≤1024 px and re-encoded without EXIF, plus µm/px and the numeric summary |

- **What happens to the answer:**
  - Every call is appended to a new table **`metallography_ai_runs`** (next free migration number in Phase 5). It records analysis_id, field_id, provider, model, data_sent, consent basis, response, comparison, an error code (never the provider's error body), run_by and run_at. It is audited, MCP write-blocked and mapped `/metallography/analyses` never/view.
  - **AI output is never written into `result_summary`, `reported_value` or `results`.** A re-run never changes analysis status.
  - The comparison uses an absolute difference for G and does not double-count complementary phase fractions.
- **Ring-test AI hints:** `ring-schema.ts` can back this route later, still off by default.
- **QiAssistant** on metallography pages gets numeric context only, through the existing `aiDataGuard`.

---

### 3.8 File-by-file porting table

MS = `/Users/amitkumar/Documents/Softwares/Metallurgy Software` (commit d1f9745). Targets are under the LIMS `frontend/src/` unless they start with `backend/`. **Reuse** = copy with import and style changes only; **Adapt** = keep the logic, change the interfaces; **Rewrite** = same purpose, new code; **Drop** = not carried over.

| MS source | LIMS target | Action |
|---|---|---|
| `apps/api/app/main.py`, `core/config.py`, `core/database.py`, `core/security.py` | GoTrue + PostgREST + RLS | Drop (removes unauthenticated `/files`, CORS `*`, default secret, `ssl=disable`) |
| `app/models/db.py` | migration 55 | Rewrite |
| `app/schemas.py` | `features/metallography/types.ts` | Drop / Rewrite |
| `routers/auth.py` | LIMS users and module access | Drop |
| `routers/calibrations.py` | `metallographyApi.ts` + S4 | Rewrite |
| `routers/analysis.py` | dashboard → S1 strip; samples → LIMS samples; jobs → `metallographyApi.ts`; review → LIMS review; report.pdf → S7; ai/lab settings → LIMS settings | Rewrite / Drop |
| `routers/ring_tests.py` | analyses with kind ring_test | Rewrite |
| `services/pipeline.py` | `engines/runEngine.ts`, `engines/analysis.worker.ts` | Rewrite |
| `services/grain_size.py` | `engines/grainSize.ts` | Rewrite with fixes |
| `services/phase2_analysis.py` | `engines/inclusionRating.ts`, `decarburization.ts`, `phaseFraction.ts`, `macroMeasure.ts` | Rewrite with fixes |
| `services/ai_compare.py` | `backend/functions/server.mjs` `handleMetallographyAi` (PROMPTS reused) | Adapt in Phase 5 |
| `services/ai_settings.py`, `services/lab_settings.py`, `services/storage.py` | LIMS AI Settings, Lab Settings, bucket | Drop |
| `services/reports.py` | `worksheet/metallographyWorksheetHtml.ts` | Rewrite |
| `requirements.txt`, `apps/api/Dockerfile`, `railway.toml`, `apps/worker/*`, `packages/shared` | none (kept only as a reference for the optional Phase 6) | Drop |
| `apps/desktop/*` (Electron) | browser camera, Phase 4 | Drop |
| `apps/web/src/app/layout.tsx`, `app/page.tsx`, `app/login`, `app/register`, `components/AppShell.tsx`, `lib/auth.tsx`, `lib/text.ts` | LIMS shell | Drop |
| `lib/api.ts` | `metallographyApi.ts`, `metallographyStorage.ts` (pattern of `resultObservationRecords.ts:102-151`) | Rewrite |
| `lib/types.ts` | `types.ts` | Adapt |
| `app/globals.css` | capture grid → Tailwind in the workbench; periodic-table CSS → scoped `periodic-table/periodicTable.css` in stone/amber; rest dropped | Adapt / Drop |
| `app/app/page.tsx` | S1 stat strip; dashboard cards in Phase 4 | Rewrite |
| `app/app/capture/page.tsx` | `workbench/MetallographyWorkbench.tsx`, `ImageStage.tsx`, `useCamera.ts` (Phase 4) | Adapt: original pixels analysed; vector marks and annotations; no 40× ImageData history; camera stops on unmount; decode errors shown |
| `lib/imageEditor.ts` | `workbench/displayAdjustments.ts` (view only) | Adapt |
| `lib/imageCanvasUtils.ts` | `workbench/imageCanvasUtils.ts` | Reuse (`floodFillCanvas`, `drawDiamond` dropped) |
| `components/ImageEditToolbar.tsx` | `workbench/ImageEditToolbar.tsx` | Adapt (LIMS classes; tool set from S2) |
| `app/app/calibrations/page.tsx` | `calibrations/*` | Rewrite |
| `app/app/analysis/page.tsx` | S1 + S5 | Rewrite |
| `components/JobsList.tsx`, `components/JobsFilterDropdown.tsx` | `MetallographyTable.tsx`, `MetallographyHeaderBar.tsx` | Adapt (role-aware; no dead Edit link or checkboxes; URL filters) |
| `app/app/jobs/page.tsx` | none | Drop |
| `app/app/jobs/[id]/page.tsx` | `view/MetallographyAnalysisView.tsx` | Rewrite |
| `app/app/admin/page.tsx` | LIMS settings; AI mode in S5 | Drop |
| `lib/periodicTable.ts` | `periodic-table/periodicTable.ts` | Reuse |
| `components/PeriodicTable.tsx`, `components/ElementDetailPanel.tsx`, `app/app/periodic-table/page.tsx`, `element/[symbol]/page.tsx` | `periodic-table/*` | Adapt (react-router, 27 °C default, Escape) |
| `lib/ring-test/analysis/index.ts` | `engines/ringTest/ringMaths.ts` | Reuse + polygon areas + single d |
| `lib/ring-test/analysis/detect-ring.ts` | `engines/ringTest/detectRing.ts` | Adapt (ImageData input) |
| `lib/ring-test/types.ts`, `utils.ts` | `engines/ringTest/types.ts`; `cn` from `@/lib/utils` | Reuse |
| `lib/ring-test/settings.ts` | method settings (DB); display colours stay in localStorage with try/catch | Adapt |
| `lib/ring-test/draft.ts` | geometry-only draft; no image in sessionStorage | Adapt |
| `lib/ring-test/save.ts` | `metallographyApi.saveAnalysis` | Rewrite |
| `components/ring-test/RingEditor.tsx` | `workbench/panels/ring/RingEditor.tsx` | Adapt (LIMS tokens; remove dead `/api/ai/analyze-ring` fetch :1539; define `pill-neutral`/`card-subtle`) |
| `components/ring-test/RingTestWorkflow.tsx` | `workbench/panels/RingTestPanel.tsx` | Adapt |
| `components/ring-test/RingTestNav.tsx`, `app/app/ring-test/{page,settings,help,reports,reports/[id]}` | S1 filter, S5, `helpContent.ts`, S3/S7 | Drop / Rewrite |
| `lib/ring-test/ai/*`, `analysis/ai-ring-refinement.ts` | Phase 5 functions route | Defer |
| `standards/*.pdf`, PNGs | not copied (licensed); PNGs used in OQ evidence once provenance is confirmed | none |

**LIMS files changed or added**
- **Frontend:**
  - `lib/appNav.ts`, `components/layout/GlobalLayout.tsx`, `routes/routeElements.tsx`, `App.tsx`, `frontend/server.mjs` (APP_PREFIXES; camera header in Phase 4 only);
  - `features/sample-handling/sample-under-testing/{SectionResultsEntryDialog.tsx, sectionParameterRows.ts, SampleUnderTestingMasterPage.tsx}`;
  - `lib/validateUpload.ts` (metallography extension set);
  - `features/audit-trail/auditTrailDiff.ts`, `features/help/helpContent.ts`;
  - `report-preparation/embedPrintImages.ts`;
  - Phase 4: `buildPaginatedTestReportHtml.ts`, `features/dashboard/DashboardPage.tsx`;
  - new folder `features/metallography/**`.
- **Backend:** migration 55, the data fix, `backend/mcp-server/lib/policy.mjs`; Phase 5: `backend/functions/server.mjs`.
- **Validation:** `frontend/scripts/validation/calculationCases.mjs`.
- **Docs:** `docs/lims-validation/OQ-09-metallography.md`, `docs/audit-gap-closure-plan.md`, `docs/go-live-runbook.md`.

---

### 3.9 Delivery phases

Every phase follows the same route:
1. Branch, then PR to main.
2. Staging: migration by psql, post-apply checks, frontend deploy, MCP redeploy.
3. OQ-09 on staging, then QM review.
4. Production **only after the user's explicit OK**, while the lab is idle and after a backup.
5. After deploy, the Director syncs the module catalog and runs the data fix.
6. `enabled` stays false until the QM signs off OQ-09.

**No phase up to 5 creates a Railway service.**

**Phase 0: decisions and method groundwork** (2–3 days, nothing deployed)
- Answers to section 3.12.
- List the metallography parameters with their `test_method` and NABL scope.
- Read the scanned standards (`standards/Scan-0122…0138.pdf`) to confirm:
  - the G constants and statistics;
  - ring limits and boundary inclusivity;
  - decarb definitions;
  - inclusion method details.
- Hand-calculate the validation expectations.
- Open a change-control record (`change-control-procedure.md:26-52`).
- Where the old service still runs, record its outputs on the reference images as "before" evidence.

**Phase 1: foundation + ring test end to end** (buildable on a branch and testable on staging without a new service; about 12–15 developer-days)
- **1a. Foundation:**
  - migration 55 (all tables, the tap column and guard, bucket, map);
  - nav, routes, labels, APP_PREFIXES, gate;
  - Method Setup;
  - Microscope Calibration with readings and verification;
  - S1 register;
  - Periodic Table (reuse, about 1 day);
  - MCP policy, audit labels, help;
  - staging data fix.
  - **1a can be deployed alone: the Enter Results link stays hidden while the module is off.**
- **1b. Ring test vertical slice:**
  - workbench shell: upload, hash, fields, image stage, scale bar, in-image scale;
  - ring engine port and RingTestPanel;
  - SQL decision recompute;
  - Enter Results link, Use result and the save-path change;
  - S3 view with Re-check;
  - S7 worksheet;
  - RT, MC and MF validation cases;
  - OQ-09 parts A–C.
- **Result:** TMT ring tests are done entirely in the LIMS on staging, from allocation through Enter Results, review, report and locks.

**Phase 2: grain size** (10–12 days)
- `imageOps.ts`, `grainSize.ts` and worker plumbing.
- Intercept and planimetric methods plus comparison-chart entry, with mark editing and multi-field statistics.
- Resolution enforcement.
- MG cases, including synthetic images.
- OQ against `Grain Size 7.png`, with an acceptance window set by the QM.
- Side-by-side comparison with the old Python output, where the expected differences are documented.

**Phase 3: inclusion rating and decarburization** (12–15 days)
- Rating limits entered and verified by the lab before release.
- Field ROI, operator-confirmed types, worst-field reporting.
- Surface polyline, normal profiles, mean and maximum depth.
- MI and MD cases; OQ.

**Phase 4: microstructure, macro aid, camera, annex, dashboard** (6–8 days)
- Phase-fraction engine; macro measurement aid.
- Live camera with a device picker. **This needs the production security-header change `camera=()` to `camera=(self)` at `frontend/server.mjs:66`, with the user's OK.**
- Micrograph annex through `include_in_report`, if wanted.
- Dashboard cards.
- TIFF decoder, if approved.

**Phase 5 (optional): AI advisory** (4–5 days)
- `metallography_ai_runs` migration.
- Functions route, consent checks and advisory panel.
- Existing service only.

**Phase 6 (only if needed): server-side engine.** This would be a **new Railway service**, `backend/metallurgy-engine` (Python/OpenCV or Node, stateless, user JWT only, no service-role key). It needs the user's approval, and is warranted only if one of these happens:
- the browser engines fail validation for an analysis kind;
- the lab or its assessor requires server recomputation of image-derived results;
- images routinely exceed browser memory.

**Decommissioning.** Once Phases 1–3 are live:
1. Export the old database and storage as a read-only archive (CSV plus images), or import it as superseded or legacy rows if the user wants.
2. Stop the old API, web, worker and Redis services.

**Total for Phases 1–4:** about 8–10 developer-weeks.

---

### 3.10 Test plan

**A. Calculation validation** (`npm run validate:calculations`; evidence imported in Quality → LIMS Validation Runs)
- Add to `MODULE_FILES` (`calculationCases.mjs:33-47`):
  - `mgScale: 'src/features/metallography/calc/scaleCalibration.ts'`
  - `mgStats: '…/calc/fieldStatistics.ts'`
  - `mgRing: '…/engines/ringTest/ringMaths.ts'`
  - `mgRingDetect: '…/engines/ringTest/detectRing.ts'`
  - `mgOps: '…/engines/imageOps.ts'`
  - `mgGrain: '…/engines/grainSize.ts'`
  - `mgIncl: '…/engines/inclusionRating.ts'`
  - `mgDecarb: '…/engines/decarburization.ts'`
  - `mgPhase: '…/engines/phaseFraction.ts'`
  - `mgFormat: '…/formatResult.ts'`
- Engines must not import `@/lib/supabaseClient`; the runner stubs it.
- New, never-reused ids. Each expected value is hand-calculated and given a source, and **an expected value is never changed to match the program**.

| Id | Input | Expected (hand calculation) |
|---|---|---|
| MC-01 | 100 µm over 199, 200, 201 px | mean 200 px → 0.5000 µm/px; s = 1 px; u_rel = 0.50 % |
| MC-02 | field values 10, 12, 11, 13, 9 | mean 11.000; s = 1.581; CI95 = 2.776 × 1.581 / √5 = 1.963; %RA = 17.8 |
| RT-01 | outer r 300 px, inner 210 px, 0.02 mm/px, d 12 mm, 1 px gaps | t = (299 − 211) px = 88 px = 1.76 mm, in 0.84–1.80; TM = 45900/90000 = 51.0 % → FAIL |
| RT-02 | as RT-01 with inner r 225 px | t = 73 px = 1.46 mm in range; TM = 39375/90000 = 43.75 % → PASS |
| RT-03 | inner square 100 px, outer square 200 px, 0.1 mm/px (polygons) | TM 300 mm², F&P 100 mm², share 75.0 % (shoelace, not circles) |
| RT-04 | thickness exactly 0.07d | in or out according to the inclusivity confirmed against IS 1786 in Phase 0 |
| RT-05 | as RT-02 with 20 × 25 µm/px (separate x / y scale) | t1/t5 = 73 × 0.025 = 1.825 mm, t3/t7 = 73 × 0.020 = 1.460 mm, 45° = 1.653 mm; areas π r² sx sy; share 43.75 %; 1.825 > 1.80 → FAIL |
| RT-06 | RT-02 geometry, nominal d 10 mm, a 600 px diameter line at 0.02 mm/px | limits stay 0.70–1.50 mm; d_measured 12.000 mm is information only |
| RT-07 | RT-02 geometry, thickness points not applied | 0 valid points → FAIL although TM 43.75 % is in range |
| RT-08 | thickness exactly 0.15d (inner r 208) | 1.800 mm: in when inclusive, out when exclusive |
| RT-09 | inner r 300/√2 and 300·√0.7 | share 50.00 % and 30.00 %: in when inclusive, out when exclusive |
| RTD-01 | drawn ring: light core r 110 px, dark rim to r 150 px | detected edges within 3 px of 110 / 150, centre (200, 200) |
| MG-01 | ℓ̄ = 0.020 mm | G = −6.6439·log10(0.020) − 3.2877 = 8.00 (constants confirmed in Phase 0) |
| MG-02 | m = 1024 grains/mm² at 1× (31.25 µm squares) | G = log2(1024) − 3 = 7 |
| MG-03 | synthetic 1000×1000, 1 px dark lines every 20 px, 1 µm/px | ℓ̄ = 20.0 µm (±0.5), G ≈ 8.0. A double-boundary count would give 10 µm and G ≈ 10.0 |
| MD-01 | step profile, transition at 200 px, 0.5 µm/px, surface at x = 0 | 100 µm (±1 px) |
| MD-02 | same, surface polyline at x = 50 | 75 µm. Catches the old "surface at column 0" bug |
| MI-01 | ellipse 60 × 6 µm rotated 30° | aspect from moments ≈ 10. The old axis-aligned box gives ≈ 1.7 |
| MI-02 | rating lookup with a test table supplied in the case (not the standard's values) | expected step per the table |
| MP-01 | 100-point grid, 37 hits on phase | 37.0 % |
| MP-02 | synthetic half black / half white | 50.0 % |
| MF-01 | G 7.46 at 1 decimal | "7.5" via `is2Rounding.ts` |
| MF-02 | ring t 1.805 mm at d 12, method decimals 2 | reported "1.805 mm" (ring values keep 3 / 2 decimals, the precision of the verdict), verdict FAIL |

**B. Database and integration checks on staging (OQ-09)**
1. Anon cannot read or write any metallography table or the bucket. A user without module access is refused once enforcement is on, and logged in 'log' mode.
2. A calibration cannot be verified by its performer. µm/px typed by hand is overwritten from the readings. Withdrawn or expired calibrations cannot be selected or used.
3. Originals cannot be overwritten (no update policy), the hash is re-checked on open, and a field's raw columns are immutable.
4. Completion is refused below `min_fields`, with a resolution mismatch, or with unusable equipment. A Director override needs a reason and appears in the audit trail.
5. Ring test: a client `overall_pass` that disagrees with the SQL recompute is refused.
6. Enter Results:
   - the link is hidden when the module is off, the table is missing or the row is unsaved;
   - Use result plus Save stamps entered_by;
   - a stale overwrite of a linked row is refused;
   - unlink is refused under review.
7. Locks: under_review, approved and issued block analysis, field and link changes, except for the Director. Referral back allows supersede.
8. Reviewer re-check: the performer cannot insert a re-check; the assigned reviewer can.
9. MCP: list_tables shows the comments, writes are refused, and counters are hidden.
10. Audit Trail shows every insert, update, delete and upload with the real user. Reasons are attached.
11. View-only module access disables the save and void buttons and the marking tools.

**C. Regression**
- OQ-01 to OQ-07, with Enter Results, review and report on non-metallography parameters unchanged.
- The existing 71 calculation cases still pass.
- The frontend works both before and after migration 55 (`missingSchema`).
- Post-apply checks: RLS, anon grants, search_path, invalid indexes.

**D. Engine evidence**
- Reference images (`Grain Size 7.png`, `Ring Test Image.png`, once their provenance is confirmed).
- Side-by-side comparison with the old outputs, where every difference is explained by a listed fix.
- Re-check reproducibility across Chrome and Edge on lab PCs.

**E. Performance**
- A 20 MP image in the worker on the slowest lab PC: time and memory recorded. The 25 MP cap is enforced.

---

### 3.11 Risks

1. **Results computed in the browser.** An altered client could submit fabricated marks.
   - Mitigations: immutable hashed originals, pinned engine versions, SQL recompute of arithmetic decisions, mandatory second-person review with re-check, and user-attributed audit.
   - Residual risk: lower than before, but not equal to a server recompute. Phase 6 is the escalation path.
2. **The TypeScript re-implementation of OpenCV operations may be wrong.**
   - Mitigations: hand-calculated synthetic-image cases, reference images, and side-by-side comparison with the old outputs. OpenCV is not installed locally, so the comparison needs the old service or its exported results.
3. **Standards not yet checked.** The scans have not been read, and the constants, ring limits and inclusion limits come from general knowledge or the old code.
   - Mitigations: Phase 0 reading; limits held as data entered by the lab; licensed text and charts never committed.
4. **Method validation and NABL (7.2.2).** Software-assisted methods are modified or new methods.
   - Mitigations: reportable only with an approved, in-date `method_verifications` record; Indicative remark plus Non NABL suggestion until then.
5. **Enter Results is the busiest path in production.**
   - Mitigations: the link is hidden when the module is off; the column is additive and the guard acts only when it is set; retry-without-column is kept; full OQ-01 to OQ-07 regression on staging.
6. **FK `ON DELETE RESTRICT` to `test_allocation_parameters`** (soft-delete mode 'line', so deletes are physical). An allocation edit that deletes a parameter line with an analysis behind it will fail.
   - Blocked flows: removing the parameter in Test Allocation edit, refer-back from Test Allocation to Sample Allocation, and the Director's sample delete, once the row or section has any analysis (void ones too, since analyses are kept records).
   - Mitigation: a BEFORE DELETE trigger on `test_allocation_parameters` and `test_allocations` refuses with a plain message ("Metallography analysis MA-… belongs to parameter "…". Analysis records are kept, so … cannot be removed."); test these flows on staging.
7. **Module access rollout.** Until the catalog sync and the data fix, only the Director sees the pages. Both steps must be in the release runbook.
8. **Browser limits.** Large images, memory on older PCs, and TIFF, which browsers do not decode (a new dependency would be needed).
9. **Camera.** Changing `camera=(self)` widens a production security header. USB/UVC cameras only; vendor-SDK cameras stay "save, then upload".
10. **Storage growth.** At 5–25 MB per field over a few thousand analyses a year, the object store and rclone backup times grow. Retention needs a records-retention category.
11. **Client data and AI.** Images cannot be redacted. Default off; enforced on the server; every call logged; the vision model the old code named may not exist.
12. **RingEditor port** (3307 lines). Tailwind v4 to 3.4.19 and lucide 1.x to 0.575 may cause visual regressions; a manual OQ pass is needed.
13. **The old Metallurgy Software stays exposed** (unauthenticated `/files`, open registration, possibly a default secret) until it is decommissioned. Schedule the switch-off.
14. **Scope expectation.** Deliberately not carried over:
    - the old login and admin;
    - the per-job approve/reject;
    - the Electron bridge;
    - annotations baked into analysed images;
    - AI on by default.

---

### 3.12 Decisions only the user can make

1. **Architecture:** approve analysis in the browser with **no new Railway service** for Phases 1–5. A server engine (a new Railway service) would come back to you only if validation shows it is needed.
2. **Phase order:** ring test first, then grain size, then inclusion and decarb. Or is another test more frequent?
3. **People:** which section and designations run metallography, who verifies microscope calibrations, and who maintains Method Setup (for the Module Access grants). Should the LIMS also check the personnel Authorization Matrix?
4. **Methods and reporting:**
   - which Test Parameter rows are metallography tests and which standard editions they follow;
   - which are in the NABL scope and who signs method validation;
   - is "Indicative / Non NABL" acceptable until then;
   - should the ring test write values only, or also "Satisfactory / Not satisfactory"?
5. **Accept the deliberate changes from the old software:**
   - planimetric G corrected (about 4 lower);
   - a calibration becomes mandatory;
   - annotations are no longer analysed;
   - the decarb surface is drawn instead of assumed;
   - one LIMS review instead of a separate job approve/reject.
6. **Camera:** upload-only, or change the security header to `camera=(self)` for live capture (Phase 4)?
7. **Image files:** formats and sizes from the microscope camera. TIFF needs a new decoder dependency, and files over 25 MB need a larger bucket limit.
8. **Test reports:** print micrographs as an annex on the client test report, or keep them only as raw data and on the worksheet?
9. **AI:** keep it off? If it is turned on, images go only for consenting clients, through the existing functions service.
10. **Old system:** archive or import its history, and the date to switch off its Railway services.