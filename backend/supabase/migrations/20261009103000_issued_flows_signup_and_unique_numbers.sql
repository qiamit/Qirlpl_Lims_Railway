-- Follow-up to 20261009063000.
-- The first migration is already on Railway. This file does not edit it.
-- 1. Signup metadata can no longer set designation, department, division, or status.
-- 2. Issued-sample lock still blocks result edits, and it still lets
--    Retain/Disposed and issued-report Referback finish.
-- 3. Non-directors cannot delete an issued sample or its parameter rows.
-- 4. Duplicate quotation numbers and ULR numbers are renamed, then the unique
--    indexes are created. A duplicate left behind fails this migration.
--    There is no unique_violation handler that skips the index.

-- ---------------------------------------------------------------------------
-- Signup cannot copy a role onto the new profile.
-- Director create-user still writes the profile through the service role
-- after this trigger runs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    mobile,
    designation,
    department_name,
    division,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    '',
    '',
    '',
    'Active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.user_profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    mobile = COALESCE(NULLIF(EXCLUDED.mobile, ''), public.user_profiles.mobile),
    updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_is_quality_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'quality manager'
      AND lower(btrim(coalesce(up.department_name, ''))) = 'quality assurance'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_quality_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_quality_manager() TO authenticated;

-- ---------------------------------------------------------------------------
-- Issued sample updates.
-- Director: any change.
-- Quality Manager: refer back, which moves stage off completed and clears
-- issue timestamps and retention. Report identity columns stay put.
-- Known staff: Retain / Disposed columns only, while stage stays completed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_issued_sample_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  frozen_new public.samples;
  frozen_old public.samples;
BEGIN
  IF OLD.stage IS DISTINCT FROM 'completed' OR public.app_is_laboratory_director() THEN
    RETURN NEW;
  END IF;

  frozen_new := NEW;
  frozen_old := OLD;
  frozen_new.stage := frozen_old.stage;
  frozen_new.test_report_issued_at := frozen_old.test_report_issued_at;
  frozen_new.test_report_nabl_issued_at := frozen_old.test_report_nabl_issued_at;
  frozen_new.test_report_non_nabl_issued_at := frozen_old.test_report_non_nabl_issued_at;
  frozen_new.sample_retention_due_date := frozen_old.sample_retention_due_date;
  frozen_new.sample_retention_status := frozen_old.sample_retention_status;
  frozen_new.quantity_retained := frozen_old.quantity_retained;
  frozen_new.quantity_disposed := frozen_old.quantity_disposed;
  frozen_new.sample_disposed_at := frozen_old.sample_disposed_at;
  frozen_new.sample_disposal_outcome := frozen_old.sample_disposal_outcome;
  frozen_new.updated_at := frozen_old.updated_at;

  IF frozen_new IS DISTINCT FROM frozen_old THEN
    RAISE EXCEPTION 'Issued samples can only be changed by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.stage IS DISTINCT FROM 'completed' THEN
    IF public.app_is_quality_manager() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Issued samples can only be changed by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;

  IF public.app_is_known_staff() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Issued samples can only be changed by the Laboratory Director'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_issued_parameter_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  frozen_new public.test_allocation_parameters;
  frozen_old public.test_allocation_parameters;
  parent_issued boolean;
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.test_allocations ta
    JOIN public.sample_allocations sa ON sa.id = ta.sample_allocation_id
    JOIN public.samples s ON s.id = sa.sample_id
    WHERE ta.id = OLD.test_allocation_id
      AND s.stage = 'completed'
  ) INTO parent_issued;

  IF NOT parent_issued THEN
    RETURN NEW;
  END IF;

  frozen_new := NEW;
  frozen_old := OLD;
  frozen_new.results_reviewer_id := frozen_old.results_reviewer_id;
  frozen_new.results_reviewer_name := frozen_old.results_reviewer_name;
  frozen_new.results_review_status := frozen_old.results_review_status;
  frozen_new.updated_at := frozen_old.updated_at;

  IF frozen_new IS NOT DISTINCT FROM frozen_old AND public.app_is_quality_manager() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Issued results can only be changed by the Laboratory Director'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_issued_sample_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.stage = 'completed' AND NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Issued samples can only be deleted by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS samples_guard_issued_delete ON public.samples;
CREATE TRIGGER samples_guard_issued_delete
  BEFORE DELETE ON public.samples
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_sample_delete();

CREATE OR REPLACE FUNCTION public.guard_issued_parameter_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.test_allocations ta
    JOIN public.sample_allocations sa ON sa.id = ta.sample_allocation_id
    JOIN public.samples s ON s.id = sa.sample_id
    WHERE ta.id = OLD.test_allocation_id
      AND s.stage = 'completed'
  ) THEN
    RAISE EXCEPTION 'Issued results can only be deleted by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tap_guard_issued_delete ON public.test_allocation_parameters;
CREATE TRIGGER tap_guard_issued_delete
  BEFORE DELETE ON public.test_allocation_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_parameter_delete();

-- ---------------------------------------------------------------------------
-- Keep the oldest quotation in each duplicate group. Later copies get -R2,
-- -R3, and so on, so the unique index can be created.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE qtn_rank ON COMMIT DROP AS
SELECT
  id,
  btrim(quotation_number) AS trimmed,
  row_number() OVER (
    PARTITION BY lower(btrim(quotation_number))
    ORDER BY created_at, id
  ) AS rn
FROM public.quotations
WHERE btrim(coalesce(quotation_number, '')) <> '';

UPDATE public.quotations q
SET quotation_number = 'TMPQTN-' || q.id::text
FROM qtn_rank r
WHERE q.id = r.id
  AND r.rn > 1;

UPDATE public.quotations q
SET quotation_number = r.trimmed
FROM qtn_rank r
WHERE q.id = r.id
  AND r.rn = 1
  AND q.quotation_number IS DISTINCT FROM r.trimmed;

UPDATE public.quotations q
SET quotation_number = r.trimmed || '-R' || r.rn::text
FROM qtn_rank r
WHERE q.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX quotations_number_uidx
  ON public.quotations (lower(btrim(quotation_number)))
  WHERE btrim(coalesce(quotation_number, '')) <> '';

-- ---------------------------------------------------------------------------
-- Keep the issued copy of a duplicated ULR. Later copies get -R2 and so on.
-- ---------------------------------------------------------------------------

ALTER TABLE public.samples DISABLE TRIGGER samples_guard_issued_update;

CREATE TEMP TABLE ulr_rank ON COMMIT DROP AS
SELECT
  id,
  btrim(test_report_nabl_ulr_number) AS trimmed,
  row_number() OVER (
    PARTITION BY lower(btrim(test_report_nabl_ulr_number))
    ORDER BY test_report_issued_at NULLS LAST, created_at, id
  ) AS rn
FROM public.samples
WHERE btrim(coalesce(test_report_nabl_ulr_number, '')) <> '';

UPDATE public.samples s
SET test_report_nabl_ulr_number = 'TMPULR-' || s.id::text
FROM ulr_rank r
WHERE s.id = r.id
  AND r.rn > 1;

UPDATE public.samples s
SET test_report_nabl_ulr_number = r.trimmed
FROM ulr_rank r
WHERE s.id = r.id
  AND r.rn = 1
  AND s.test_report_nabl_ulr_number IS DISTINCT FROM r.trimmed;

UPDATE public.samples s
SET test_report_nabl_ulr_number = r.trimmed || '-R' || r.rn::text
FROM ulr_rank r
WHERE s.id = r.id
  AND r.rn > 1;

ALTER TABLE public.samples ENABLE TRIGGER samples_guard_issued_update;

CREATE UNIQUE INDEX samples_nabl_ulr_uidx
  ON public.samples (lower(btrim(test_report_nabl_ulr_number)))
  WHERE btrim(coalesce(test_report_nabl_ulr_number, '')) <> '';

NOTIFY pgrst, 'reload schema';
