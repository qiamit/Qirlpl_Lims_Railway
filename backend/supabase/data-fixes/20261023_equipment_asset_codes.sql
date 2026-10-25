-- Equipment asset codes, lab decision of 23 Oct 2026: the records sharing a
-- code are different instruments, so each gets its own code (suggestion sheet
-- equipment-code-suggestions-2026-10-23.xlsx, accepted as suggested).
-- A one-off data fix, not a migration. Run it as one transaction, without a
-- signed-in user, after a fresh backup:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261023_equipment_asset_codes.sql
-- Then run migration 20261102100000 again to add the asset code unique keys.
--
-- In each group the record linked to calibration jobs, used as a master or
-- with breakdowns keeps the code (otherwise the first one created); the others
-- get the next free number of the same series. Records refer to equipment by
-- id, not by code, so no other table changes.
--
-- Every row is checked first: the record must still carry its old code and
-- the new code must be free in that table, otherwise nothing is changed (for
-- example when equipment was added after 23 Oct and took one of these
-- numbers: regenerate the list). Safe to run more than once.

DO $$
DECLARE
  k record;
  v_reason constant text :=
    'Duplicate asset code, lab decision 23 Oct 2026: different instrument, new code given (was %s)';
  v_changed integer := 0;
  v_done integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  -- Lets this transaction add a reason to the audit rows it writes.
  PERFORM set_config('app.audit_annotate', 'on', true);

  FOR k IN
    SELECT *
    FROM (VALUES
      ('equipment_master', '23efd150-4baa-4d52-bf20-d0a641704705'::uuid, 'QI-EQ-0001', 'QI-EQ-0196'),
      ('equipment_master', '5ecbc13b-28ef-4299-a8e8-2e8728bd55de'::uuid, 'QI-EQ-0001', 'QI-EQ-0197'),
      ('equipment_master', 'ed5f3020-e69c-4bd7-819e-5a510d9bad80'::uuid, 'QI-EQ-0001', 'QI-EQ-0198'),
      ('equipment_master', 'eadf98a8-28f2-451d-8cc7-c12e2be2235d'::uuid, 'QI-EQ-0053', 'QI-EQ-0199'),
      ('equipment_master', 'fcafade3-3f5f-4b2d-b5bb-28481ddfb3c9'::uuid, 'QI-EQ-0064', 'QI-EQ-0200'),
      ('equipment_master', '906ef0b7-10ad-4db0-82e2-aeada9e45125'::uuid, 'QI-EQ-0069', 'QI-EQ-0201'),
      ('equipment_master', 'bc4cbe54-8243-49a2-ad51-6791058591bc'::uuid, 'QI-EQ-0091', 'QI-EQ-0202'),
      ('equipment_master', 'b1c7f16a-c70a-4894-84f1-bd437bcb84fd'::uuid, 'QI-EQ-0107', 'QI-EQ-0203'),
      ('equipment_master', 'a05e1867-71f3-4cb9-97ea-dd119b4504cd'::uuid, 'QI-EQ-0111', 'QI-EQ-0204'),
      ('equipment_master', 'c2ae36cc-7c05-4448-a5b0-8ac0bb181d4b'::uuid, 'QI-EQ-0112', 'QI-EQ-0205'),
      ('equipment_master', '6053f91d-922b-4d51-bac1-b5c8c88ad6db'::uuid, 'QI-EQ-0113', 'QI-EQ-0206'),
      ('equipment_master', '6bcad5a5-c5f4-488f-a5fb-301d54aa3ba9'::uuid, 'QI-EQ-0114', 'QI-EQ-0207'),
      ('equipment_master', '802de8e5-dcda-4a3a-843b-6332f5414a82'::uuid, 'QI-EQ-0115', 'QI-EQ-0208'),
      ('equipment_master', 'fbe53693-dbe4-435a-80f2-39e157611405'::uuid, 'QI-EQ-0116', 'QI-EQ-0209'),
      ('equipment_master', 'd345e99e-9c7e-4462-9750-9ee8ec046e35'::uuid, 'QI-EQ-0117', 'QI-EQ-0210'),
      ('equipment_master', '800e8fb5-91b0-4806-96a5-62202dff51d8'::uuid, 'QI-EQ-0118', 'QI-EQ-0211'),
      ('equipment_master', 'f9f9a853-87a9-4b13-a329-10f26e4d90b6'::uuid, 'QI-EQ-0119', 'QI-EQ-0212'),
      ('equipment_master', '8f61097c-00ed-478a-b077-fdc1a7faa912'::uuid, 'QI-EQ-0120', 'QI-EQ-0213'),
      ('equipment_master', 'd2a4885d-95fc-4b2a-8dda-b24558efd090'::uuid, 'QI-EQ-0121', 'QI-EQ-0214'),
      ('equipment_master', 'fbd323e1-1559-425a-bbf6-3e7cb16159f8'::uuid, 'QI-EQ-0122', 'QI-EQ-0215'),
      ('equipment_master', '3c7e7c75-1a27-4397-80e5-0c19bce97b1d'::uuid, 'QI-EQ-0123', 'QI-EQ-0216'),
      ('equipment_master', '97f6df1f-1f1e-4a4c-874d-9b7426dc3dee'::uuid, 'QI-EQ-0124', 'QI-EQ-0217'),
      ('equipment_master', 'b3b54b59-49b4-467c-90a3-907f76dc2e9c'::uuid, 'QI-EQ-0125', 'QI-EQ-0218'),
      ('equipment_master', '80b95ce0-f554-4816-a37e-10693f2df553'::uuid, 'QI-EQ-0126', 'QI-EQ-0219'),
      ('equipment_master', 'a39c79ed-a2b4-44f3-b8f4-a043f2af27b9'::uuid, 'QI-EQ-0129', 'QI-EQ-0220'),
      ('equipment_master', '68bd9af2-8ff2-4200-8dad-13461b4554d1'::uuid, 'QI-EQ-0132', 'QI-EQ-0221'),
      ('equipment_master', 'fa89a413-5d8d-4beb-9c2a-e7d3f60a44aa'::uuid, 'QI-EQ-0135', 'QI-EQ-0222'),
      ('equipment_master', '894f562b-0d72-4d97-a8d9-501cd28de340'::uuid, 'QI-EQ-0136', 'QI-EQ-0223'),
      ('equipment_master', 'c1ae4da9-4024-47e0-81d1-a95d69eef671'::uuid, 'QI-EQ-0137', 'QI-EQ-0224'),
      ('equipment_master', 'adea9382-2965-4da8-a3a8-66eaf0d564a5'::uuid, 'QI-EQ-0138', 'QI-EQ-0225'),
      ('equipment_master', 'e9690d4b-10f6-4f88-86c2-b8f5801d7e3c'::uuid, 'QI-EQ-0139', 'QI-EQ-0226'),
      ('equipment_master', 'a357be6e-2d9d-487b-84cb-f23c8d4d3b13'::uuid, 'QI-EQ-0140', 'QI-EQ-0227'),
      ('equipment_master', 'fe95c2cd-edd9-4138-a274-9cfc6caeaa2f'::uuid, 'QI-EQ-0141', 'QI-EQ-0228'),
      ('equipment_master', 'cd83e740-189c-47d1-b45b-522a7dd32a24'::uuid, 'QI-EQ-0143', 'QI-EQ-0229'),
      ('equipment_master', '83a685e4-a999-4212-84f2-c7a33c9d32bd'::uuid, 'QI-EQ-0144', 'QI-EQ-0230'),
      ('equipment_master', '295120de-faed-4ef0-afce-92de2f02fe19'::uuid, 'QI-EQ-0146', 'QI-EQ-0231'),
      ('equipment_master', 'e3c538ca-2adf-4cf4-aa05-db6264880fee'::uuid, 'QI-EQ-0147', 'QI-EQ-0232'),
      ('equipment_master', 'a20e0475-4cd2-457b-bec8-fa4feff54713'::uuid, 'QI-EQ-0148', 'QI-EQ-0233'),
      ('equipment_master', '8a3df3f0-708c-418b-938d-d94a052acb9c'::uuid, 'QI-EQ-0149', 'QI-EQ-0234'),
      ('equipment_master', 'd301b33e-a376-4ae0-8b70-3f2094758e47'::uuid, 'QI-EQ-0150', 'QI-EQ-0235'),
      ('equipment_master', 'fb0b7143-b9a7-428b-a0e4-8d81e8c58d03'::uuid, 'QI-EQ-0151', 'QI-EQ-0236'),
      ('equipment_master', '9f79d0a1-572b-4ccf-91d0-f319bb087890'::uuid, 'QI-EQ-0152', 'QI-EQ-0237'),
      ('equipment_master', 'fd248489-7b38-4a8a-986b-98ab2e55a0cd'::uuid, 'QI-EQ-0153', 'QI-EQ-0238'),
      ('equipment_master', '48f2e40d-5e7e-4d2a-b93e-7b4d1c007b45'::uuid, 'QI-EQ-0154', 'QI-EQ-0239'),
      ('equipment_master', '7cfbc041-fa95-4384-8d40-11e564a8d1d1'::uuid, 'QI-EQ-0155', 'QI-EQ-0240'),
      ('equipment_master', 'ce47827a-e7ac-417e-ae32-3b878e67422a'::uuid, 'QI-EQ-0156', 'QI-EQ-0241'),
      ('equipment_master', 'eada89b7-f87b-489d-a63c-8565d33baa6d'::uuid, 'QI-EQ-0157', 'QI-EQ-0242'),
      ('equipment_master', 'c284a35c-f995-472a-9d57-c895ee23c24a'::uuid, 'QI-EQ-0158', 'QI-EQ-0243'),
      ('equipment_master', '7449823a-13d8-4147-be20-1eb7425c8fbb'::uuid, 'QI-EQ-0159', 'QI-EQ-0244'),
      ('equipment_master', '883e8da9-3949-41b0-8cef-b06e7f432c86'::uuid, 'QI-EQ-0160', 'QI-EQ-0245'),
      ('equipment_master', 'e1ac36a7-0ca8-4a3b-b241-d6fe38459912'::uuid, 'QI-EQ-0161', 'QI-EQ-0246'),
      ('equipment_master', 'a18dd12c-3de1-44c8-8a19-5803e3ffe001'::uuid, 'QI-EQ-0162', 'QI-EQ-0247'),
      ('equipment_master', 'b4ada2eb-c3b6-48b3-9288-d840440c020a'::uuid, 'QI-EQ-0163', 'QI-EQ-0248'),
      ('equipment_master', 'd202ad93-401d-4a6a-a6ef-5a3b27256e3b'::uuid, 'QI-EQ-0164', 'QI-EQ-0249'),
      ('equipment_master', '77f11444-a6cc-4b2f-a92b-fe6ad55bfb59'::uuid, 'QI-EQ-0165', 'QI-EQ-0250'),
      ('equipment_master', 'ae2270f7-00e1-48f0-90a4-dd5b4c01a4cd'::uuid, 'QI-EQ-0166', 'QI-EQ-0251'),
      ('equipment_master', 'd996a287-b19f-4559-90d0-f01afb474a1d'::uuid, 'QI-EQ-0167', 'QI-EQ-0252'),
      ('equipment_master', 'b63a8c66-bc8b-4074-81f4-002521fe668e'::uuid, 'QI-EQ-0168', 'QI-EQ-0253'),
      ('equipment_master', 'ff2bc6bd-e481-484c-8a7a-2f99f411d114'::uuid, 'QI-EQ-0169', 'QI-EQ-0254'),
      ('equipment_master', 'cd740646-899c-4db0-9af5-981b93b59075'::uuid, 'QI-EQ-0170', 'QI-EQ-0255'),
      ('equipment_master', '4a828240-9b9e-4b64-beac-bd7712707a90'::uuid, 'QI-EQ-0171', 'QI-EQ-0256'),
      ('equipment_master', 'a35e9bbe-ebc2-4ed3-8a95-dc50df355058'::uuid, 'QI-EQ-0172', 'QI-EQ-0257'),
      ('equipment_master', 'b5b6935b-4725-48dd-b20a-626d2094d1ff'::uuid, 'QI-EQ-0173', 'QI-EQ-0258'),
      ('equipment_master', '9b42b31c-9350-455e-9e2a-0f6f47cf2208'::uuid, 'QI-EQ-0174', 'QI-EQ-0259'),
      ('equipment_master', 'fdc26a51-35ab-4453-9674-26f37e1427b6'::uuid, 'QI-EQ-0175', 'QI-EQ-0260'),
      ('equipment_master', 'c2c4a2eb-8012-4fb6-8070-a498be726022'::uuid, 'QI-EQ-0176', 'QI-EQ-0261'),
      ('equipment_master', '99a7a462-2e2a-4461-919d-6a0aa9242f06'::uuid, 'QI-EQ-0177', 'QI-EQ-0262'),
      ('equipment_master', 'd69b49fb-e40e-41ee-84da-02954943fa75'::uuid, 'QI-EQ-0178', 'QI-EQ-0263'),
      ('equipment_master', 'cbb46383-395f-4094-851f-7b3926d1c192'::uuid, 'QI-EQ-0179', 'QI-EQ-0264'),
      ('equipment_master', 'd207569e-a29e-4644-8194-aa659cc41298'::uuid, 'QI-EQ-0180', 'QI-EQ-0265'),
      ('equipment_master', 'df125672-4cf3-44b9-8c47-dfac8254e716'::uuid, 'QI-EQ-0181', 'QI-EQ-0266'),
      ('equipment_master', 'd9b1ebd6-000a-45f8-a11b-37103bf8e19a'::uuid, 'QI-EQ-0182', 'QI-EQ-0267'),
      ('equipment_master', '81c0573d-72ae-4a22-bb69-492a6d038813'::uuid, 'QI-EQ-0183', 'QI-EQ-0268'),
      ('equipment_master', '186c4132-ba3a-446e-8ed5-f38e981107a0'::uuid, 'QI-EQ-0184', 'QI-EQ-0269'),
      ('equipment_master', '31a24825-6ad0-4357-b479-926a96b604a8'::uuid, 'QI-EQ-0185', 'QI-EQ-0270'),
      ('equipment_master', '0c6d0638-a80f-4057-adc1-d324710a6ce6'::uuid, 'QI-EQ-0186', 'QI-EQ-0271'),
      ('equipment_master', 'dec1a689-e452-4095-9a1e-d5de28232fe6'::uuid, 'QI-EQ-0187', 'QI-EQ-0272'),
      ('equipment_master', 'ff9a2532-156b-4294-a649-62fdab1958db'::uuid, 'QI-EQ-0188', 'QI-EQ-0273'),
      ('equipment_master', 'f0e75b66-61a1-4c7f-88f5-8c01620ce28c'::uuid, 'QI-EQ-0189', 'QI-EQ-0274'),
      ('equipment_master', '6e2a316f-7823-4a35-8ecf-5c7a95663e67'::uuid, 'QI-EQ-0192', 'QI-EQ-0275'),
      ('equipment_master', '6349e1f1-d86e-44e0-a253-421060bf92b7'::uuid, 'QI-EQ-0193', 'QI-EQ-0276'),
      ('equipment_master', 'a7779dcb-ade7-4426-8e71-f295906c2e1f'::uuid, 'QI-EQ-0193', 'QI-EQ-0277'),
      ('equipment_master', '86328a12-7aac-43f4-8216-de390a6222f0'::uuid, 'QI/CVL/TS-18', 'QI/CVL/TS-48'),
      ('equipment_master', '9b2d4f31-022c-4d3e-909a-6daa2e3ea25b'::uuid, 'QI/CVL/TS-19', 'QI/CVL/TS-49'),
      ('equipment_master', '64c1f363-0115-45ab-b5ff-0b4e33d31f97'::uuid, 'QI/CVL/TS-20', 'QI/CVL/TS-50'),
      ('equipment_master', '7b73a6ae-736a-42ce-9b6f-ebafeb745775'::uuid, 'QI/CVL/TS-21', 'QI/CVL/TS-51'),
      ('equipment_master', '14807f7c-2721-4602-8aa2-4b15782aa7a3'::uuid, 'QI/CVL/TS-22', 'QI/CVL/TS-52'),
      ('equipment_master', '454f1347-e969-49e3-a17c-53c3787165d6'::uuid, 'QI/CVL/TS-23', 'QI/CVL/TS-53'),
      ('equipment_master', 'b01152ec-bb22-485a-b1a7-f20dadbd7bd9'::uuid, 'QI/CVL/TS-24', 'QI/CVL/TS-54'),
      ('equipment_master', '7df92cde-b740-463d-b45a-7cd8189fd20b'::uuid, 'QI/CVL/TS-25', 'QI/CVL/TS-55'),
      ('equipment_master', '4872c720-c130-4b27-8375-1d882eaa5773'::uuid, 'QI/CVL/TS-26', 'QI/CVL/TS-56'),
      ('equipment_master', 'af035cd5-8846-411a-8738-22c3a4863adc'::uuid, 'QI/CVL/TS-27', 'QI/CVL/TS-57'),
      ('equipment_master', '724b6271-941e-4f1f-8ff8-30d741b059c5'::uuid, 'QI/CVL/TS-28', 'QI/CVL/TS-58'),
      ('equipment_master', '9595e343-ba9b-43ef-8004-c53e3eab4657'::uuid, 'QI/CVL/TS-29', 'QI/CVL/TS-59'),
      ('equipment_master', 'aef99bc3-0a96-4b67-969b-615308831e46'::uuid, 'QI/CVL/TS-30', 'QI/CVL/TS-60'),
      ('equipment_for_calibration', 'bbd3b2cd-2484-4afb-9e28-02bc1eb2bf0b'::uuid, 'QI/DBC-03', 'QI/DBC-04'),
      ('equipment_for_calibration', 'f16fc331-6920-4f93-a905-befe0ffcbd34'::uuid, 'QI/DTM-02', 'QI/DTM-03'),
      ('equipment_for_calibration', 'ba9e62ed-167b-4eb5-9fdd-c6b7a37f0571'::uuid, 'QI/INS/14', 'QI/INS/41'),
      ('equipment_for_calibration', '54c35c50-9372-4a23-9366-11ed9480a6e8'::uuid, 'QI/INS/23', 'QI/INS/42'),
      ('equipment_for_calibration', '98c3e635-90a9-4a3f-8b62-d45808f7d0d6'::uuid, 'QI/INS/25', 'QI/INS/43'),
      ('equipment_for_calibration', 'c2936985-94a0-4bc3-8f62-1aabc9217493'::uuid, 'QI/INS/27', 'QI/INS/44'),
      ('equipment_for_calibration', '87b9ec2a-d7cd-4741-a948-802ec5bd10cb'::uuid, 'QI/INS/33', 'QI/INS/45'),
      ('equipment_for_calibration', 'cda3b654-e8bf-4d3c-8d1d-b64d0994f029'::uuid, 'QI/INS/39', 'QI/INS/46')
    ) AS t(tbl, id, old_code, new_code)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1 AND asset_code = $2', k.tbl)
      INTO v_done USING k.id, k.new_code;
    IF v_done = 1 THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1 AND asset_code = $2', k.tbl)
      INTO v_done USING k.id, k.old_code;
    IF v_done <> 1 THEN
      RAISE EXCEPTION '%: record % no longer has asset code %', k.tbl, k.id, k.old_code;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE lower(btrim(asset_code)) = lower($1)', k.tbl)
      INTO v_done USING k.new_code;
    IF v_done > 0 THEN
      RAISE EXCEPTION '%: new asset code % is already used; regenerate the list', k.tbl, k.new_code;
    END IF;

    EXECUTE format('UPDATE public.%I SET asset_code = $1 WHERE id = $2', k.tbl) USING k.new_code, k.id;
    UPDATE public.audit_log SET reason = format(v_reason, k.old_code)
     WHERE table_name = k.tbl AND row_id = k.id::text AND action = 'UPDATE'
       AND actor IS NULL AND reason IS NULL AND at >= now();
    v_changed := v_changed + 1;
  END LOOP;

  RAISE NOTICE 'equipment asset codes changed: %', v_changed;
END $$;
