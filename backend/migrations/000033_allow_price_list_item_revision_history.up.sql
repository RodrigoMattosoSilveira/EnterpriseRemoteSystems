-- Price-list items are financial source records. Preserve item edits as
-- historical rows, but allow only one active item per tenant/type/code.
--
-- 000027 originally created expense_price_list_items with
-- UNIQUE (tenant_id, item_type, code), which prevents audit-history
-- replacement rows. SQLite cannot drop a table constraint in place, so rebuild
-- the table without that global uniqueness and add a partial unique index for
-- active rows only.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_id;
DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_type_active_sort;
DROP INDEX IF EXISTS idx_expense_price_list_items_superseded_price_list_item_id;
DROP INDEX IF EXISTS ux_expense_price_list_items_one_active_per_tenant_type_code;

CREATE TABLE expense_price_list_items_revision_history_tmp (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  item_type TEXT NOT NULL CHECK (item_type IN ('CANTEEN', 'ADMINISTRATIVE')),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_price_brl REAL NOT NULL CHECK (unit_price_brl > 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  superseded_price_list_item_id TEXT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO expense_price_list_items_revision_history_tmp (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order,
  superseded_price_list_item_id
)
SELECT
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  CASE WHEN active THEN 1 ELSE 0 END,
  sort_order,
  NULL
FROM expense_price_list_items;

DROP TABLE expense_price_list_items;
ALTER TABLE expense_price_list_items_revision_history_tmp RENAME TO expense_price_list_items;

-- If any database was previously modified outside the 000027 global unique
-- constraint, keep the newest row active and deactivate older same-code rows
-- before creating the active-row uniqueness constraint.
UPDATE expense_price_list_items
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND EXISTS (
    SELECT 1
    FROM expense_price_list_items newer
    WHERE newer.tenant_id = expense_price_list_items.tenant_id
      AND newer.item_type = expense_price_list_items.item_type
      AND newer.code = expense_price_list_items.code
      AND newer.active = 1
      AND (
        newer.created_at > expense_price_list_items.created_at
        OR (newer.created_at = expense_price_list_items.created_at AND newer.id > expense_price_list_items.id)
      )
  );

CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_id ON expense_price_list_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_type_active_sort ON expense_price_list_items(tenant_id, item_type, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_superseded_price_list_item_id ON expense_price_list_items(superseded_price_list_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_price_list_items_one_active_per_tenant_type_code
ON expense_price_list_items(tenant_id, item_type, code)
WHERE active = 1;

COMMIT;

PRAGMA foreign_keys = ON;
