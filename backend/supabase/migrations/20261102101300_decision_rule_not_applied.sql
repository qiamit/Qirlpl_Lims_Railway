-- Decision rule "DR-NR: Not required" (lab decision 25 Oct 2026). The lab
-- states in its manual that it does not apply a decision rule and gives no
-- opinions and interpretations. A new rule type 'not_applied' records that
-- choice on the SRF; the app shows nothing about a decision rule on reports
-- or certificates for it (results are judged as with no rule, as before).
-- Safe to run more than once.

DO $$
DECLARE
  c record;
BEGIN
  -- Replace the rule type list and the guard band rule, whatever their names.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.decision_rules'::regclass AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%guard_band_factor%'
            OR pg_get_constraintdef(oid) LIKE '%rule_type = ANY%')
  LOOP
    EXECUTE format('ALTER TABLE public.decision_rules DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.decision_rules
  ADD CONSTRAINT decision_rules_rule_type_check
  CHECK (rule_type = ANY (ARRAY['simple_acceptance', 'guard_band', 'non_binary', 'not_applied']));

ALTER TABLE public.decision_rules
  ADD CONSTRAINT decision_rules_guard_band_factor_check
  CHECK (guard_band_factor >= 0 AND guard_band_factor <= 10
         AND (rule_type NOT IN ('simple_acceptance', 'not_applied') OR guard_band_factor = 0));

INSERT INTO public.decision_rules (code, name, rule_type, guard_band_factor, statement_text, risk_note, active, applies_to)
SELECT 'DR-NR', 'Not required (no decision rule applied)', 'not_applied', 0,
       'Decision rule not applied: the laboratory does not apply a decision rule and gives no opinions and interpretations. Not printed on reports or certificates.',
       'Results are reported as found against the specified requirement; no statement based on measurement uncertainty is made.',
       true, 'both'
 WHERE NOT EXISTS (SELECT 1 FROM public.decision_rules WHERE upper(btrim(code)) = 'DR-NR');
