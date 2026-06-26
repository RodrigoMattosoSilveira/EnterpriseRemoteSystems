PRAGMA foreign_keys = ON;

DELETE FROM expense_price_list_items
WHERE id IN (
  SELECT 'seed-expense-price-list-' || id || '-canteen-water-bottle'
  FROM tenants
)
OR id IN (
  SELECT 'seed-expense-price-list-' || id || '-canteen-meal'
  FROM tenants
)
OR id IN (
  SELECT 'seed-expense-price-list-' || id || '-canteen-snack'
  FROM tenants
)
OR id IN (
  SELECT 'seed-expense-price-list-' || id || '-administrative-processing-fee'
  FROM tenants
)
OR id IN (
  SELECT 'seed-expense-price-list-' || id || '-administrative-document-copy'
  FROM tenants
);
