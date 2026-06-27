package db

import (
	"strings"

	"gorm.io/gorm"
)

const priceListItemActiveCodeConstraintSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_price_list_items_one_active_per_tenant_type_code
ON expense_price_list_items(tenant_id, item_type, code)
WHERE active = 1;
`

func InstallPriceListItemRevisionHistoryConstraint(database *gorm.DB) error {
	needsRebuild, err := priceListItemsNeedRevisionHistoryRebuild(database)
	if err != nil {
		return err
	}
	if needsRebuild {
		if err := rebuildPriceListItemsForRevisionHistory(database); err != nil {
			return err
		}
	}
	return database.Transaction(func(tx *gorm.DB) error {
		return installPriceListItemRevisionHistoryIndexes(tx)
	})
}

func priceListItemsNeedRevisionHistoryRebuild(database *gorm.DB) (bool, error) {
	var tableSQL string
	if err := database.Raw(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expense_price_list_items'`).Scan(&tableSQL).Error; err != nil {
		return false, err
	}
	if strings.TrimSpace(tableSQL) == "" {
		return false, nil
	}
	if hasPriceListItemGlobalCodeUniqueConstraint(tableSQL) {
		return true, nil
	}
	return hasPriceListItemGlobalCodeUniqueIndex(database)
}

func hasPriceListItemGlobalCodeUniqueConstraint(tableSQL string) bool {
	normalized := strings.ToLower(tableSQL)
	normalized = strings.NewReplacer(
		"`", "",
		"\"", "",
		"[", "",
		"]", "",
		" ", "",
		"\n", "",
		"\r", "",
		"\t", "",
	).Replace(normalized)
	return strings.Contains(normalized, "unique(tenant_id,item_type,code)")
}

func hasPriceListItemGlobalCodeUniqueIndex(database *gorm.DB) (bool, error) {
	type indexRow struct {
		Name    string `gorm:"column:name"`
		Unique  int    `gorm:"column:unique"`
		Partial int    `gorm:"column:partial"`
	}

	var indexes []indexRow
	if err := database.Raw(`PRAGMA index_list(expense_price_list_items)`).Scan(&indexes).Error; err != nil {
		return false, err
	}

	for _, index := range indexes {
		if index.Unique != 1 || index.Partial == 1 {
			continue
		}
		columns, err := priceListItemIndexColumns(database, index.Name)
		if err != nil {
			return false, err
		}
		if len(columns) == 3 && columns[0] == "tenant_id" && columns[1] == "item_type" && columns[2] == "code" {
			return true, nil
		}
	}
	return false, nil
}

func priceListItemIndexColumns(database *gorm.DB, indexName string) ([]string, error) {
	type columnRow struct {
		Seqno int    `gorm:"column:seqno"`
		Name  string `gorm:"column:name"`
	}

	var rows []columnRow
	if err := database.Raw(`PRAGMA index_info(` + quoteSQLiteIdentifier(indexName) + `)`).Scan(&rows).Error; err != nil {
		return nil, err
	}
	columns := make([]string, len(rows))
	for _, row := range rows {
		if row.Seqno < 0 || row.Seqno >= len(rows) {
			continue
		}
		columns[row.Seqno] = strings.ToLower(strings.TrimSpace(row.Name))
	}
	return columns, nil
}

func rebuildPriceListItemsForRevisionHistory(database *gorm.DB) error {
	if err := database.Exec(`PRAGMA foreign_keys = OFF`).Error; err != nil {
		return err
	}
	defer database.Exec(`PRAGMA foreign_keys = ON`)

	return database.Transaction(func(tx *gorm.DB) error {
		statements := []string{
			`DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_id`,
			`DROP INDEX IF EXISTS idx_expense_price_list_items_tenant_type_active_sort`,
			`DROP INDEX IF EXISTS ux_expense_price_list_items_one_active_per_tenant_type_code`,
			`DROP TABLE IF EXISTS expense_price_list_items_revision_history_tmp`,
			`CREATE TABLE expense_price_list_items_revision_history_tmp (
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
			)`,
			`INSERT INTO expense_price_list_items_revision_history_tmp (
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
			FROM expense_price_list_items`,
			`DROP TABLE expense_price_list_items`,
			`ALTER TABLE expense_price_list_items_revision_history_tmp RENAME TO expense_price_list_items`,
		}
		for _, statement := range statements {
			if err := tx.Exec(statement).Error; err != nil {
				return err
			}
		}
		return installPriceListItemRevisionHistoryIndexes(tx)
	})
}

func installPriceListItemRevisionHistoryIndexes(tx *gorm.DB) error {
	statements := []string{
		`UPDATE expense_price_list_items
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
		  )`,
		`CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_id ON expense_price_list_items(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_type_active_sort ON expense_price_list_items(tenant_id, item_type, active, sort_order)`,
		`CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_superseded_price_list_item_id ON expense_price_list_items(superseded_price_list_item_id)`,
		priceListItemActiveCodeConstraintSQL,
	}
	for _, statement := range statements {
		if err := tx.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}
