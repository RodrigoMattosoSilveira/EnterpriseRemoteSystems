-- Do not rebuild gold_prices back to UNIQUE (tenant_id, price_date): once
-- revision history exists, that old constraint would require deleting audit
-- rows. This down migration only removes the active-row uniqueness guard.
DROP INDEX IF EXISTS ux_gold_prices_one_active_per_tenant_date;
