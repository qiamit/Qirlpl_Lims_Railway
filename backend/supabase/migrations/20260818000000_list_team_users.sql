-- Railway: list users + auth emails without hosted Edge Functions.
-- Only Laboratory Director can execute (same rule as former list-users function).

CREATE OR REPLACE FUNCTION public.list_team_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  mobile text,
  designation text,
  department_name text,
  division text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  caller_designation text;
BEGIN
  SELECT trim(both FROM COALESCE(up.designation, ''))
  INTO caller_designation
  FROM public.user_profiles up
  WHERE up.id = auth.uid();

  IF lower(COALESCE(caller_designation, '')) <> 'laboratory director' THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(u.email, ''::text),
    COALESCE(p.full_name, ''::text),
    COALESCE(p.mobile, ''::text),
    COALESCE(p.designation, ''::text),
    COALESCE(p.department_name, ''::text),
    COALESCE(p.division, ''::text),
    COALESCE(p.status, 'Active'::text)
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_team_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_users() TO service_role;

NOTIFY pgrst, 'reload schema';
