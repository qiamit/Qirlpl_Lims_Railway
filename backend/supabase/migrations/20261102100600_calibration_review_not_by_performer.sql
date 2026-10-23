-- The person who carried out a calibration does not review / approve its raw
-- data (ISO/IEC 17025 7.7, 7.8.1; lab decision 23 Oct 2026). On staging a
-- calibration engineer with Edit on Review Data could forward their own job;
-- only the authorization-matrix reason was asked. NOT applied automatically.
-- Safe to run more than once.
--
-- The performer is the engineer the job is allocated to, and whoever saved
-- the raw data (payload.entryBy.userId). Refused for a signed-in user who is
-- either: approving the raw data sheet, and moving the job out of Review Data
-- to Certificate Preparation / Certificates. Referring back stays allowed.
-- Scripts without a signed-in user (service role, psql) are not affected.

CREATE OR REPLACE FUNCTION public.app_is_calibration_performer(p_job_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.calibration_jobs j WHERE j.id = p_job_id AND j.allocated_engineer_id = p_user)
    OR EXISTS (
      SELECT 1 FROM public.calibration_raw_data_sheets s
      WHERE s.calibration_job_id = p_job_id
        AND s.payload #>> '{entryBy,userId}' = p_user::text
    )
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_calibration_performer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_calibration_performer(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_calibration_review_not_by_performer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'calibration_jobs' THEN
    IF NOT (OLD.stage = 'review_data' AND NEW.stage IN ('certificate_preparation', 'certificates')) THEN
      RETURN NEW;
    END IF;
    v_job := NEW.id;
  ELSE
    IF NEW.sheet_status IS DISTINCT FROM 'approved' OR OLD.sheet_status = 'approved' THEN
      RETURN NEW;
    END IF;
    v_job := NEW.calibration_job_id;
  END IF;

  IF public.app_is_calibration_performer(v_job, v_uid) THEN
    RAISE EXCEPTION 'You carried out this calibration; another authorised person must review and approve its raw data (ISO/IEC 17025 7.7, 7.8.1).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_calibration_review_not_by_performer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calibration_jobs_guard_review_not_by_performer ON public.calibration_jobs;
CREATE TRIGGER calibration_jobs_guard_review_not_by_performer
  BEFORE UPDATE OF stage ON public.calibration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_calibration_review_not_by_performer();

DROP TRIGGER IF EXISTS calibration_raw_data_sheets_guard_review_not_by_performer ON public.calibration_raw_data_sheets;
CREATE TRIGGER calibration_raw_data_sheets_guard_review_not_by_performer
  BEFORE UPDATE OF sheet_status ON public.calibration_raw_data_sheets
  FOR EACH ROW EXECUTE FUNCTION public.guard_calibration_review_not_by_performer();
