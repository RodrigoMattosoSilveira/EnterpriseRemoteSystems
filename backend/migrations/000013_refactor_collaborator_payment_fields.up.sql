ALTER TABLE collaborator_journeys ADD COLUMN fixed_monthly_brl_amount REAL NULL;
ALTER TABLE collaborator_journeys ADD COLUMN daily_brl_amount REAL NULL;
ALTER TABLE collaborator_journeys ADD COLUMN gold_commission_percent REAL NULL;
ALTER TABLE collaborator_journeys ADD COLUMN time_off_gold_split_percent REAL NULL;
ALTER TABLE collaborator_journeys ADD COLUMN sick_day_off_replacement_gold_grams REAL NULL;

UPDATE collaborator_journeys
SET daily_brl_amount = payment_value
WHERE payment_method_id IN (
  SELECT id FROM reference_data
  WHERE type = 'method'
    AND code IN ('DAILY', 'DAILY_WAGES', 'DAILY_BRL')
);

UPDATE collaborator_journeys
SET fixed_monthly_brl_amount = payment_value
WHERE payment_method_id IN (
  SELECT id FROM reference_data
  WHERE type = 'method'
    AND code IN ('SALARY', 'FIXED_BRL')
);

UPDATE collaborator_journeys
SET gold_commission_percent = payment_value,
    time_off_gold_split_percent = COALESCE(time_off_gold_split_percent, 50.0),
    sick_day_off_replacement_gold_grams = COALESCE(sick_day_off_replacement_gold_grams, 1.0)
WHERE payment_method_id IN (
  SELECT id FROM reference_data
  WHERE type = 'method'
    AND code IN ('COMMISSION', 'GOLD_COMMISSION')
);
