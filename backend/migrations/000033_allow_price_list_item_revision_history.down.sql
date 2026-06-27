-- Do not rebuild expense_price_list_items back to UNIQUE
-- (tenant_id, item_type, code): once revision history exists, that old
-- constraint would require deleting audit rows that may be referenced by
-- historical expenses. This down migration only removes the active-row
-- uniqueness guard.
DROP INDEX IF EXISTS ux_expense_price_list_items_one_active_per_tenant_type_code;
