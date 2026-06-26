PRAGMA foreign_keys = ON;

-- Starter price-list items for the corrected item-based expense workflow.
-- These rows are intentionally inserted only when the tenant/code combination
-- does not already exist, so tenant administrators can replace or adjust their
-- operational price lists without this migration overwriting local choices.
INSERT OR IGNORE INTO expense_price_list_items (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order
)
SELECT
  'seed-expense-price-list-' || id || '-canteen-water-bottle',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id,
  'CANTEEN',
  'CANTEEN_WATER_BOTTLE',
  'Water bottle',
  7.50,
  1,
  10
FROM tenants
WHERE active = 1;

INSERT OR IGNORE INTO expense_price_list_items (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order
)
SELECT
  'seed-expense-price-list-' || id || '-canteen-meal',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id,
  'CANTEEN',
  'CANTEEN_MEAL',
  'Meal',
  35.00,
  1,
  20
FROM tenants
WHERE active = 1;

INSERT OR IGNORE INTO expense_price_list_items (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order
)
SELECT
  'seed-expense-price-list-' || id || '-canteen-snack',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id,
  'CANTEEN',
  'CANTEEN_SNACK',
  'Canteen snack',
  12.25,
  1,
  30
FROM tenants
WHERE active = 1;

INSERT OR IGNORE INTO expense_price_list_items (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order
)
SELECT
  'seed-expense-price-list-' || id || '-administrative-processing-fee',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id,
  'ADMINISTRATIVE',
  'ADMINISTRATIVE_PROCESSING_FEE',
  'Administrative processing fee',
  25.00,
  1,
  10
FROM tenants
WHERE active = 1;

INSERT OR IGNORE INTO expense_price_list_items (
  id,
  created_at,
  updated_at,
  tenant_id,
  item_type,
  code,
  description,
  unit_price_brl,
  active,
  sort_order
)
SELECT
  'seed-expense-price-list-' || id || '-administrative-document-copy',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id,
  'ADMINISTRATIVE',
  'ADMINISTRATIVE_DOCUMENT_COPY',
  'Document copy or print',
  2.50,
  1,
  20
FROM tenants
WHERE active = 1;
