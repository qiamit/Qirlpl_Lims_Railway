-- Files: who may delete or replace them, and an audit trail (security and
-- operations re-check, 23 Oct 2026; ISO/IEC 17025 7.5, 8.4, 7.11.3). NOT
-- applied automatically. Safe to run more than once.
--
-- Ten buckets let any known staff member delete or overwrite any file
-- (policies limited only by bucket), and nothing recorded it. Now:
--   * in those buckets a file can be deleted or changed only by the person
--     who uploaded it, the Quality Manager or the Laboratory Director
--     (a restrictive policy, added to the existing ones);
--   * every upload, change and delete of a file, in every bucket, is written
--     to audit_log (table_name 'storage.objects', row_id 'bucket/path',
--     actor = signed-in user, old and new metadata).
-- Buckets with their own role rules (personnel-records, pt-reports,
-- sampling-files, method-validation-files, result-attachments) keep them.
-- The app uploads each file under a new name, so no flow overwrites another
-- person's file. Scripts and storage-api's own work (database owner) are not
-- limited.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects missing; nothing to do.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS lims_storage_owner_delete ON storage.objects;
  DROP POLICY IF EXISTS lims_storage_owner_update ON storage.objects;

  CREATE POLICY lims_storage_owner_delete ON storage.objects
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (
      bucket_id NOT IN (
        'audit-nc-evidence', 'calibration-files', 'calibration-srf-documents',
        'equipment-files', 'is-code-files', 'laboratory-files',
        'management-documents', 'quotation-signatures',
        'sample-client-references', 'test-method-notes'
      )
      OR owner = auth.uid()
      OR owner_id = auth.uid()::text
      OR public.app_is_laboratory_director()
      OR public.app_is_quality_manager()
    );

  CREATE POLICY lims_storage_owner_update ON storage.objects
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (
      bucket_id NOT IN (
        'audit-nc-evidence', 'calibration-files', 'calibration-srf-documents',
        'equipment-files', 'is-code-files', 'laboratory-files',
        'management-documents', 'quotation-signatures',
        'sample-client-references', 'test-method-notes'
      )
      OR owner = auth.uid()
      OR owner_id = auth.uid()::text
      OR public.app_is_laboratory_director()
      OR public.app_is_quality_manager()
    );
END $$;

CREATE OR REPLACE FUNCTION public.audit_storage_object_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := jsonb_build_object(
      'bucket_id', OLD.bucket_id, 'name', OLD.name, 'owner', OLD.owner,
      'owner_id', OLD.owner_id, 'version', OLD.version, 'metadata', OLD.metadata,
      'created_at', OLD.created_at, 'updated_at', OLD.updated_at);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := jsonb_build_object(
      'bucket_id', NEW.bucket_id, 'name', NEW.name, 'owner', NEW.owner,
      'owner_id', NEW.owner_id, 'version', NEW.version, 'metadata', NEW.metadata,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at);
  END IF;
  -- Reads (last_accessed_at) and repeated metadata writes are not changes.
  IF TG_OP = 'UPDATE'
     AND (v_old - 'updated_at') IS NOT DISTINCT FROM (v_new - 'updated_at') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log (actor, table_name, row_id, action, old_row, new_row)
  VALUES (
    auth.uid(),
    'storage.objects',
    coalesce(NEW.bucket_id, OLD.bucket_id) || '/' || coalesce(NEW.name, OLD.name),
    TG_OP,
    v_old,
    v_new
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_storage_object_change() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS lims_storage_objects_audit ON storage.objects;
  CREATE TRIGGER lims_storage_objects_audit
    AFTER INSERT OR UPDATE OR DELETE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.audit_storage_object_change();
END $$;
