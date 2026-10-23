-- Storage tables closed to the REST API (security re-check, 23 Oct 2026).
-- NOT applied automatically. Safe to run more than once.
--
-- PostgREST served the storage schema (PGRST_DB_SCHEMAS=public,storage), and
-- storage.buckets, storage.migrations and the s3_multipart / analytics /
-- vector tables had row level security off with ALL privileges for anon and
-- authenticated: anyone holding the public anon key could read the bucket
-- list and, by the grants, make a bucket public or change storage's own
-- tables. Files themselves (storage.objects) already had RLS.
--
-- The REST side is closed by the rest service setting PGRST_DB_SCHEMAS=public
-- (a Railway setting, not part of this file). This migration closes the
-- database side, so the tables stay safe even if the schema is exposed again:
--   * anon: no privileges on any storage table;
--   * authenticated: read-only on storage.buckets (storage-api checks the
--     bucket of each upload / download as the signed-in user); objects keep
--     their own policies but lose TRUNCATE / TRIGGER / REFERENCES; no access
--     to storage.migrations, s3_multipart_* and the analytics / vector tables;
--   * row level security on every storage table, with one policy: signed-in
--     users may read storage.buckets.
-- storage-api connects as the database owner for its own work (bucket
-- creation, migrations, signed URLs), which RLS does not limit; migrations
-- that create buckets run as the owner too.

DO $$
DECLARE
  t text;
BEGIN
  IF to_regnamespace('storage') IS NULL THEN
    RAISE NOTICE 'storage schema missing; nothing to do.';
    RETURN;
  END IF;

  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE storage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE storage.%I FROM anon', t);
    IF t = 'objects' THEN
      EXECUTE 'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE storage.objects FROM authenticated';
    ELSIF t = 'buckets' THEN
      EXECUTE 'REVOKE ALL ON TABLE storage.buckets FROM authenticated';
      EXECUTE 'GRANT SELECT ON TABLE storage.buckets TO authenticated';
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE storage.%I FROM authenticated', t);
    END IF;
  END LOOP;

  DROP POLICY IF EXISTS lims_storage_buckets_read ON storage.buckets;
  CREATE POLICY lims_storage_buckets_read ON storage.buckets
    FOR SELECT TO authenticated
    USING (true);
END $$;
