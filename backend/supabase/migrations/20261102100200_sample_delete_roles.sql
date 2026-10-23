-- Who may delete a sample (SRF): only the Laboratory Director, the Quality
-- Manager and Sample Cell staff (Receptionist, Sample Incharge). Lab decision
-- of 23 Oct 2026 (OQ-04 step 2; staging API test D1 found that every testing
-- engineer could delete, because Module Access gives them Edit on Sample
-- Receiving). NOT applied automatically. Safe to run more than once.
--
-- A delete is still a soft delete (20261025100000): the row goes to the
-- Recycle Bin and only the Director restores it. Issued samples stay
-- Director-only (samples_guard_issued_delete).
--
-- Not affected: scripts run without a signed-in user (service role, psql,
-- Railway console), and deletes cascaded from a parent row.

CREATE OR REPLACE FUNCTION public.app_can_delete_samples()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_laboratory_director()
      OR public.app_is_quality_manager()
      OR EXISTS (
        SELECT 1
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
          AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
          AND lower(btrim(coalesce(up.department_name, ''))) = 'sample cell'
          AND lower(btrim(coalesce(up.designation, ''))) IN ('receptionist', 'sample incharge')
      );
$$;

REVOKE ALL ON FUNCTION public.app_can_delete_samples() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_delete_samples() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_sample_delete_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF NOT public.app_can_delete_samples() THEN
    RAISE EXCEPTION 'Only the Laboratory Director, the Quality Manager or Sample Cell staff can delete a sample (%).',
      coalesce(OLD.srf_number, OLD.id::text)
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_sample_delete_role() FROM PUBLIC, anon, authenticated;

-- Fires before samples_guard_issued_delete and zzz_soft_delete (alphabetical).
DROP TRIGGER IF EXISTS samples_guard_delete_role ON public.samples;
CREATE TRIGGER samples_guard_delete_role
  BEFORE DELETE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.guard_sample_delete_role();
