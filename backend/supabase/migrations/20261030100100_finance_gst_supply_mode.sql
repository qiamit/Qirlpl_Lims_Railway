-- Finance port, Phase 2b: GST place of supply (CGST + SGST or IGST).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- right after 20261030100000_finance_sale_books.sql. Safe to re-run.
--
--   gstin_is_valid(gstin)                  shape, state code and checksum
--                                          (same algorithm as
--                                          frontend/src/lib/indiaValidators.ts)
--   gst_state_code_for_name(state)         Indian state / UT name (or a
--                                          2-digit code) → GST state code;
--                                          NULL when unknown
--   sale_gst_supply_mode(supplier, recipient)
--                                          Consultancy Pro f2, unchanged
--                                          behaviour: same GSTIN state code →
--                                          'intra', different → 'inter', a
--                                          blank or invalid GSTIN → 'intra'
--   finance_gst_supply_mode_for(client_gstin, client_state)
--                                          lab vs a client snapshot: the
--                                          client's valid GSTIN decides,
--                                          otherwise its state name; unknown →
--                                          'intra' (never invents IGST)
--   sale_gst_supply_mode_for_client(client_id)
--                                          the same for a client record
--
-- The lab's state code comes from the Lab Settings GSTIN, else the Lab
-- Settings state name, else 22 (Chhattisgarh). Nothing here rewrites saved
-- documents; the grand total is the same in both modes, only the split of
-- the tax changes.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.gstin_is_valid(p_gstin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_states constant text[] := ARRAY[
    '01','02','03','04','05','06','07','08','09','10',
    '11','12','13','14','15','16','17','18','19','20',
    '21','22','23','24','26','27','28','29','30','31',
    '32','33','34','35','36','37','38','97'
  ];
  v_gstin text := upper(btrim(COALESCE(p_gstin, '')));
  v_sum integer := 0;
  v_code integer;
  v_product integer;
BEGIN
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     OR NOT (left(v_gstin, 2) = ANY (v_states)) THEN
    RETURN false;
  END IF;
  FOR v_i IN 0..13 LOOP
    v_code := position(substr(v_gstin, v_i + 1, 1) IN v_chars) - 1;
    IF v_code < 0 THEN
      RETURN false;
    END IF;
    v_product := v_code * (CASE WHEN v_i % 2 = 0 THEN 1 ELSE 2 END);
    v_sum := v_sum + (v_product / 36) + (v_product % 36);
  END LOOP;
  RETURN substr(v_gstin, 15, 1) = substr(v_chars, ((36 - (v_sum % 36)) % 36) + 1, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.sale_gst_supply_mode(p_supplier_gstin text, p_recipient_gstin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT public.gstin_is_valid(p_supplier_gstin) OR NOT public.gstin_is_valid(p_recipient_gstin) THEN 'intra'
    WHEN left(upper(btrim(p_supplier_gstin)), 2) = left(upper(btrim(p_recipient_gstin)), 2) THEN 'intra'
    ELSE 'inter'
  END;
$$;

-- GST state codes (CBIC list). Old names and common spellings are accepted.
CREATE OR REPLACE FUNCTION public.gst_state_code_for_name(p_state text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH n AS (
    SELECT regexp_replace(replace(lower(btrim(COALESCE(p_state, ''))), '&', 'and'), '[^a-z0-9]+', '', 'g') AS k
  )
  SELECT CASE
    WHEN n.k ~ '^[0-9]{1,2}$' AND lpad(n.k, 2, '0') = ANY (ARRAY[
      '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','97'])
      THEN CASE WHEN lpad(n.k, 2, '0') = '25' THEN '26' ELSE lpad(n.k, 2, '0') END
    ELSE (
      SELECT m.code FROM (VALUES
        ('jammuandkashmir', '01'), ('jammukashmir', '01'), ('jk', '01'),
        ('himachalpradesh', '02'), ('hp', '02'),
        ('punjab', '03'),
        ('chandigarh', '04'),
        ('uttarakhand', '05'), ('uttaranchal', '05'),
        ('haryana', '06'),
        ('delhi', '07'), ('newdelhi', '07'), ('nctofdelhi', '07'), ('nctdelhi', '07'),
        ('rajasthan', '08'),
        ('uttarpradesh', '09'), ('up', '09'),
        ('bihar', '10'),
        ('sikkim', '11'),
        ('arunachalpradesh', '12'),
        ('nagaland', '13'),
        ('manipur', '14'),
        ('mizoram', '15'),
        ('tripura', '16'),
        ('meghalaya', '17'),
        ('assam', '18'),
        ('westbengal', '19'), ('wb', '19'),
        ('jharkhand', '20'),
        ('odisha', '21'), ('orissa', '21'),
        ('chhattisgarh', '22'), ('chattisgarh', '22'), ('chhatisgarh', '22'), ('chattishgarh', '22'),
        ('chhattishgarh', '22'), ('cg', '22'),
        ('madhyapradesh', '23'), ('mp', '23'),
        ('gujarat', '24'), ('gujrat', '24'),
        ('damananddiu', '26'), ('dadraandnagarhaveli', '26'),
        ('dadraandnagarhavelianddamananddiu', '26'), ('dnhdd', '26'),
        ('maharashtra', '27'), ('maharastra', '27'),
        ('andhrapradeshold', '28'),
        ('karnataka', '29'),
        ('goa', '30'),
        ('lakshadweep', '31'),
        ('kerala', '32'),
        ('tamilnadu', '33'), ('tn', '33'),
        ('puducherry', '34'), ('pondicherry', '34'),
        ('andamanandnicobarislands', '35'), ('andamanandnicobar', '35'), ('andamannicobar', '35'),
        ('telangana', '36'),
        ('andhrapradesh', '37'), ('ap', '37'),
        ('ladakh', '38'),
        ('otherterritory', '97')
      ) AS m(name, code)
      WHERE m.name = n.k
    )
  END
  FROM n;
$$;

-- Lab's GST state code: Lab Settings GSTIN, else its state name, else 22.
CREATE OR REPLACE FUNCTION public.finance_lab_gst_state_code()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gstin text;
  v_state text;
BEGIN
  IF to_regclass('public.lab_settings') IS NOT NULL THEN
    SELECT ls.gst_number, ls.state INTO v_gstin, v_state
      FROM public.lab_settings ls
     ORDER BY ls.created_at DESC NULLS LAST
     LIMIT 1;
  END IF;
  IF public.gstin_is_valid(v_gstin) THEN
    RETURN left(upper(btrim(v_gstin)), 2);
  END IF;
  RETURN COALESCE(public.gst_state_code_for_name(v_state), '22');
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_gst_supply_mode_for(p_client_gstin text, p_client_state text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lab text := public.finance_lab_gst_state_code();
  v_client text;
BEGIN
  IF public.gstin_is_valid(p_client_gstin) THEN
    v_client := left(upper(btrim(p_client_gstin)), 2);
  ELSE
    v_client := public.gst_state_code_for_name(p_client_state);
  END IF;
  IF v_client IS NULL OR v_client = v_lab THEN
    RETURN 'intra';
  END IF;
  RETURN 'inter';
END;
$$;

CREATE OR REPLACE FUNCTION public.sale_gst_supply_mode_for_client(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gstin text;
  v_state text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.gst_number, c.state INTO v_gstin, v_state FROM public.clients c WHERE c.id = p_client_id;
  RETURN public.finance_gst_supply_mode_for(v_gstin, v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.gstin_is_valid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sale_gst_supply_mode(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gst_state_code_for_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_lab_gst_state_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_gst_supply_mode_for(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sale_gst_supply_mode_for_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gstin_is_valid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sale_gst_supply_mode(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gst_state_code_for_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_lab_gst_state_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_gst_supply_mode_for(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sale_gst_supply_mode_for_client(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
