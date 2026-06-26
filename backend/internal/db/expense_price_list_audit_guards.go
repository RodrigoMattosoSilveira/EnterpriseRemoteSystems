package db

import "gorm.io/gorm"

const expensePriceListAuditGuardSQL = `
CREATE TRIGGER IF NOT EXISTS trg_expenses_price_list_audit_insert_guard
BEFORE INSERT ON expenses
BEGIN
  SELECT RAISE(ABORT, 'price-list expense requires complete audit snapshot')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND (
      COALESCE(TRIM(NEW.price_list_item_code), '') = ''
      OR COALESCE(TRIM(NEW.item_type), '') NOT IN ('CANTEEN', 'ADMINISTRATIVE')
      OR COALESCE(TRIM(NEW.item_description), '') = ''
      OR NEW.quantity IS NULL
      OR NEW.quantity <= 0
      OR NEW.unit_price_brl IS NULL
      OR NEW.unit_price_brl <= 0
      OR COALESCE(TRIM(NEW.currency_code), '') NOT IN ('BRL', 'GOLD_GRAM')
      OR NEW.unit_price_amount IS NULL
      OR NEW.unit_price_amount <= 0
      OR NEW.total_amount IS NULL
      OR NEW.total_amount <= 0
      OR COALESCE(TRIM(NEW.calculation_method), '') = ''
      OR COALESCE(TRIM(NEW.calculation_details_json), '') = ''
    );

  SELECT RAISE(ABORT, 'gold price-list expense requires gold conversion audit snapshot')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND COALESCE(TRIM(NEW.currency_code), '') = 'GOLD_GRAM'
    AND (
      NEW.gold_price_id IS NULL
      OR COALESCE(TRIM(NEW.gold_price_id), '') = ''
      OR NEW.gold_brl_per_gram IS NULL
      OR NEW.gold_brl_per_gram <= 0
      OR COALESCE(TRIM(NEW.gold_price_date), '') = ''
      OR COALESCE(TRIM(NEW.calculation_method), '') <> 'BRL_TO_GOLD_GRAM_LATEST_PRICE'
    );

  SELECT RAISE(ABORT, 'BRL price-list expense requires BRL calculation method')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND COALESCE(TRIM(NEW.currency_code), '') = 'BRL'
    AND COALESCE(TRIM(NEW.calculation_method), '') <> 'BRL_PRICE_LIST';
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_price_list_audit_update_guard
BEFORE UPDATE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'price-list expense requires complete audit snapshot')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND (
      COALESCE(TRIM(NEW.price_list_item_code), '') = ''
      OR COALESCE(TRIM(NEW.item_type), '') NOT IN ('CANTEEN', 'ADMINISTRATIVE')
      OR COALESCE(TRIM(NEW.item_description), '') = ''
      OR NEW.quantity IS NULL
      OR NEW.quantity <= 0
      OR NEW.unit_price_brl IS NULL
      OR NEW.unit_price_brl <= 0
      OR COALESCE(TRIM(NEW.currency_code), '') NOT IN ('BRL', 'GOLD_GRAM')
      OR NEW.unit_price_amount IS NULL
      OR NEW.unit_price_amount <= 0
      OR NEW.total_amount IS NULL
      OR NEW.total_amount <= 0
      OR COALESCE(TRIM(NEW.calculation_method), '') = ''
      OR COALESCE(TRIM(NEW.calculation_details_json), '') = ''
    );

  SELECT RAISE(ABORT, 'gold price-list expense requires gold conversion audit snapshot')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND COALESCE(TRIM(NEW.currency_code), '') = 'GOLD_GRAM'
    AND (
      NEW.gold_price_id IS NULL
      OR COALESCE(TRIM(NEW.gold_price_id), '') = ''
      OR NEW.gold_brl_per_gram IS NULL
      OR NEW.gold_brl_per_gram <= 0
      OR COALESCE(TRIM(NEW.gold_price_date), '') = ''
      OR COALESCE(TRIM(NEW.calculation_method), '') <> 'BRL_TO_GOLD_GRAM_LATEST_PRICE'
    );

  SELECT RAISE(ABORT, 'BRL price-list expense requires BRL calculation method')
  WHERE NEW.price_list_item_id IS NOT NULL
    AND COALESCE(TRIM(NEW.currency_code), '') = 'BRL'
    AND COALESCE(TRIM(NEW.calculation_method), '') <> 'BRL_PRICE_LIST';
END;
`

func InstallExpensePriceListAuditGuards(database *gorm.DB) error {
	return database.Exec(expensePriceListAuditGuardSQL).Error
}
