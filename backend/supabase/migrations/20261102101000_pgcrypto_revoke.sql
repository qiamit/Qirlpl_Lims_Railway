-- pgcrypto functions closed to the API (security re-check, 23 Oct 2026).
-- NOT applied automatically. Safe to run more than once.
--
-- pgcrypto is installed in the public schema, so PostgREST offered crypt,
-- gen_salt, digest, hmac, pgp_* and the rest as /rest/v1/rpc calls to anyone
-- with the anon key (an easy way to load the database with expensive
-- hashing). Nothing in the app calls them: no function, view, policy or
-- default uses them except gen_random_uuid (75 column defaults), which stays
-- open. Revoked from PUBLIC, anon and authenticated; service_role and the
-- owner keep them.

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'pgcrypto'
     WHERE p.proname <> 'gen_random_uuid'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
