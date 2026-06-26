DROP TRIGGER IF EXISTS trg_expenses_price_list_audit_insert_guard;
DROP TRIGGER IF EXISTS trg_expenses_price_list_audit_update_guard;

DROP INDEX IF EXISTS idx_expenses_price_list_item_code;
DROP INDEX IF EXISTS idx_expenses_gold_price_date;
DROP INDEX IF EXISTS idx_expenses_calculation_method;
