DROP INDEX IF EXISTS idx_expenses_gold_price_id;
DROP INDEX IF EXISTS idx_expenses_currency_code;
DROP INDEX IF EXISTS idx_expenses_item_type;
DROP INDEX IF EXISTS idx_expenses_price_list_item_id;
DROP INDEX IF EXISTS idx_gold_prices_tenant_active_date;
DROP INDEX IF EXISTS idx_gold_prices_tenant_id;
DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_type_active_sort;
DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_id;
DROP TABLE IF EXISTS gold_prices;
DROP TABLE IF EXISTS expense_price_list_items;

-- SQLite does not safely drop columns without rebuilding this production table.
-- The additive audit/calculation columns on expenses are intentionally left in place.
