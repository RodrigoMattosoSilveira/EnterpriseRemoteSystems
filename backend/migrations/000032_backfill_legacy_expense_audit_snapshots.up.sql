PRAGMA foreign_keys = ON;

-- Backfill legacy direct-entry expenses created before the Bite 21 price-list
-- workflow. These rows did not originate from a price-list item, so the
-- migration intentionally does not invent price_list_item_id values. Instead it
-- records a legacy audit snapshot so reports and filters can classify historic
-- records while preserving their original category, unit, amount, and notes.
UPDATE expenses
SET
  price_list_item_code = CASE
    WHEN COALESCE((
      SELECT UPPER(TRIM(code))
      FROM reference_data
      WHERE reference_data.id = expenses.expense_category_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'expense_category'
      LIMIT 1
    ), '') = 'CANTEEN' THEN 'LEGACY_CANTEEN_DIRECT_ENTRY'
    ELSE 'LEGACY_ADMINISTRATIVE_DIRECT_ENTRY'
  END,
  item_type = CASE
    WHEN COALESCE((
      SELECT UPPER(TRIM(code))
      FROM reference_data
      WHERE reference_data.id = expenses.expense_category_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'expense_category'
      LIMIT 1
    ), '') = 'CANTEEN' THEN 'CANTEEN'
    ELSE 'ADMINISTRATIVE'
  END,
  item_description = COALESCE(
    NULLIF(TRIM(description), ''),
    (
      SELECT label || ' legacy expense'
      FROM reference_data
      WHERE reference_data.id = expenses.expense_category_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'expense_category'
      LIMIT 1
    ),
    'Legacy expense'
  ),
  quantity = 1,
  unit_price_brl = CASE
    WHEN COALESCE((
      SELECT UPPER(TRIM(code))
      FROM reference_data
      WHERE reference_data.id = expenses.value_unit_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'value_unit'
      LIMIT 1
    ), '') = 'BRL' THEN amount
    ELSE unit_price_brl
  END,
  currency_code = COALESCE((
    SELECT UPPER(TRIM(code))
    FROM reference_data
    WHERE reference_data.id = expenses.value_unit_id
      AND reference_data.tenant_id = expenses.tenant_id
      AND reference_data.type = 'value_unit'
    LIMIT 1
  ), currency_code),
  unit_price_amount = amount,
  total_amount = amount,
  calculation_method = 'LEGACY_DIRECT_ENTRY',
  calculation_details_json = json_object(
    'calculationVersion', 1,
    'calculationMethod', 'LEGACY_DIRECT_ENTRY',
    'source', 'migration_000032_backfill_legacy_expense_audit_snapshots',
    'legacyExpenseCategoryId', expense_category_id,
    'legacyExpenseCategoryCode', COALESCE((
      SELECT UPPER(TRIM(code))
      FROM reference_data
      WHERE reference_data.id = expenses.expense_category_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'expense_category'
      LIMIT 1
    ), ''),
    'legacyValueUnitId', value_unit_id,
    'currencyCode', COALESCE((
      SELECT UPPER(TRIM(code))
      FROM reference_data
      WHERE reference_data.id = expenses.value_unit_id
        AND reference_data.tenant_id = expenses.tenant_id
        AND reference_data.type = 'value_unit'
      LIMIT 1
    ), ''),
    'quantity', 1,
    'unitPriceAmount', amount,
    'totalAmount', amount
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE price_list_item_id IS NULL
  AND COALESCE(TRIM(calculation_method), '') = '';

CREATE INDEX IF NOT EXISTS idx_expenses_legacy_audit_method ON expenses(calculation_method);
