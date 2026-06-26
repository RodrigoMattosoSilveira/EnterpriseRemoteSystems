package db

import (
	"strings"

	"gorm.io/gorm"
)

const goldPriceActiveDateConstraintSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_gold_prices_one_active_per_tenant_date
ON gold_prices(tenant_id, price_date)
WHERE active = 1;
`

func InstallGoldPriceActiveDateConstraint(database *gorm.DB) error {
	needsRebuild, err := goldPricesNeedRevisionHistoryRebuild(database)
	if err != nil {
		return err
	}
	if needsRebuild {
		if err := rebuildGoldPricesForRevisionHistory(database); err != nil {
			return err
		}
	}
	return database.Transaction(func(tx *gorm.DB) error {
		return installGoldPriceRevisionHistoryIndexes(tx)
	})
}

func goldPricesNeedRevisionHistoryRebuild(database *gorm.DB) (bool, error) {
	var tableSQL string
	if err := database.Raw(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gold_prices'`).Scan(&tableSQL).Error; err != nil {
		return false, err
	}
	if strings.TrimSpace(tableSQL) == "" {
		return false, nil
	}
	if hasGoldPriceGlobalDateUniqueConstraint(tableSQL) {
		return true, nil
	}
	return hasGoldPriceGlobalDateUniqueIndex(database)
}

func hasGoldPriceGlobalDateUniqueConstraint(tableSQL string) bool {
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
	return strings.Contains(normalized, "unique(tenant_id,price_date)")
}

func hasGoldPriceGlobalDateUniqueIndex(database *gorm.DB) (bool, error) {
	type indexRow struct {
		Name    string `gorm:"column:name"`
		Unique  int    `gorm:"column:unique"`
		Partial int    `gorm:"column:partial"`
	}

	var indexes []indexRow
	if err := database.Raw(`PRAGMA index_list(gold_prices)`).Scan(&indexes).Error; err != nil {
		return false, err
	}

	for _, index := range indexes {
		if index.Unique != 1 || index.Partial == 1 {
			continue
		}
		columns, err := goldPriceIndexColumns(database, index.Name)
		if err != nil {
			return false, err
		}
		if len(columns) == 2 && columns[0] == "tenant_id" && columns[1] == "price_date" {
			return true, nil
		}
	}
	return false, nil
}

func goldPriceIndexColumns(database *gorm.DB, indexName string) ([]string, error) {
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

func quoteSQLiteIdentifier(value string) string {
	return "\"" + strings.ReplaceAll(value, "\"", "\"\"") + "\""
}

func rebuildGoldPricesForRevisionHistory(database *gorm.DB) error {
	if err := database.Exec(`PRAGMA foreign_keys = OFF`).Error; err != nil {
		return err
	}
	defer database.Exec(`PRAGMA foreign_keys = ON`)

	return database.Transaction(func(tx *gorm.DB) error {
		statements := []string{
			`DROP INDEX IF EXISTS idx_gold_prices_tenant_id`,
			`DROP INDEX IF EXISTS idx_gold_prices_tenant_active_date`,
			`DROP INDEX IF EXISTS ux_gold_prices_one_active_per_tenant_date`,
			`DROP TABLE IF EXISTS gold_prices_revision_history_tmp`,
			`CREATE TABLE gold_prices_revision_history_tmp (
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
			)`,
			`INSERT INTO gold_prices_revision_history_tmp (
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
			FROM gold_prices`,
			`DROP TABLE gold_prices`,
			`ALTER TABLE gold_prices_revision_history_tmp RENAME TO gold_prices`,
		}
		for _, statement := range statements {
			if err := tx.Exec(statement).Error; err != nil {
				return err
			}
		}
		return installGoldPriceRevisionHistoryIndexes(tx)
	})
}

func installGoldPriceRevisionHistoryIndexes(tx *gorm.DB) error {
	statements := []string{
		`UPDATE gold_prices
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
		  )`,
		`CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_id ON gold_prices(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_active_date ON gold_prices(tenant_id, active, price_date DESC)`,
		goldPriceActiveDateConstraintSQL,
	}
	for _, statement := range statements {
		if err := tx.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}
