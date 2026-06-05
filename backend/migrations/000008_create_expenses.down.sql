PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_expenses_tenant_collaborator_date;
DROP INDEX IF EXISTS idx_expenses_expense_date;
DROP INDEX IF EXISTS idx_expenses_value_unit_id;
DROP INDEX IF EXISTS idx_expenses_expense_category_id;
DROP INDEX IF EXISTS idx_expenses_collaborator_id;
DROP INDEX IF EXISTS idx_expenses_tenant_id;
DROP TABLE IF EXISTS expenses;

DELETE FROM reference_data WHERE id IN (
  'ref-expense-category-canteen',
  'ref-expense-category-flight',
  'ref-expense-category-cargo',
  'ref-expense-category-other',
  'ref-value-unit-brl',
  'ref-value-unit-gold-gram'
);

PRAGMA foreign_keys = ON;
