-- Gold prices are financial source records. Preserve same-date revisions as
-- historical rows, but allow only one active price per tenant/date.
--
-- 000027 originally created gold_prices with UNIQUE (tenant_id, price_date),
-- which prevents audit-history replacement rows. SQLite cannot drop a table
-- constraint in place, so rebuild the table without that global uniqueness and
-- add a partial unique index for active rows only.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_gold_prices_tenant_id;
DROP INDEX IF EXISTS idx_gold_prices_tenant_active_date;
DROP INDEX IF EXISTS ux_gold_prices_one_active_per_tenant_date;

CREATE TABLE gold_prices_revision_history_tmp (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  price_date DATE NOT NULL,
  brl_per_gram REAL NOT NULL CHECK (brl_per_gram > 0),
  recorded_by TEXT NOT NULL,
  notes TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO gold_prices_revision_history_tmp (
  id,
  created_at,
  updated_at,
  tenant_id,
  price_date,
  brl_per_gram,
  recorded_by,
  notes,
  active
)
SELECT
  id,
  created_at,
  updated_at,
  tenant_id,
  substr(price_date, 1, 10),
  brl_per_gram,
  recorded_by,
  COALESCE(notes, ''),
  CASE WHEN active THEN 1 ELSE 0 END
FROM gold_prices;

DROP TABLE gold_prices;
ALTER TABLE gold_prices_revision_history_tmp RENAME TO gold_prices;

-- If any database was previously modified outside the 000027 global unique
-- constraint, keep the newest row active and deactivate older same-date rows
-- before creating the active-row uniqueness constraint.
UPDATE gold_prices
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND EXISTS (
    SELECT 1
    FROM gold_prices newer
    WHERE newer.tenant_id = gold_prices.tenant_id
      AND newer.price_date = gold_prices.price_date
      AND newer.active = 1
      AND (
        newer.created_at > gold_prices.created_at
        OR (newer.created_at = gold_prices.created_at AND newer.id > gold_prices.id)
      )
  );

CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_id ON gold_prices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_active_date ON gold_prices(tenant_id, active, price_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gold_prices_one_active_per_tenant_date
ON gold_prices(tenant_id, price_date)
WHERE active = 1;

COMMIT;

PRAGMA foreign_keys = ON;
