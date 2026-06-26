PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_expenses_legacy_audit_method;

UPDATE expenses
SET
  price_list_item_code = NULL,
  item_type = NULL,
  item_description = NULL,
  quantity = NULL,
  unit_price_brl = NULL,
  currency_code = NULL,
  unit_price_amount = NULL,
  total_amount = NULL,
  calculation_method = NULL,
  calculation_details_json = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE price_list_item_id IS NULL
  AND calculation_method = 'LEGACY_DIRECT_ENTRY';
