package db

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	sqlite "github.com/ncruces/go-sqlite3/gormlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(path string) (*gorm.DB, error) {
	if err := ensureDir(path); err != nil {
		return nil, err
	}

	dsn := fmt.Sprintf("file:%s?mode=rwc&_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", path)

	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Warn)})
	if err != nil {
		return nil, fmt.Errorf("open sqlite3 database with gorm: %w", err)
	}

	// Configure the underlying sql.DB for better performance with SQLite.
	sqlDB, err := database.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql database: %w", err)
	}

	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return database, nil
}

func AutoMigrate(database *gorm.DB) error {
	return database.AutoMigrate(&Tenant{}, &ReferenceData{}, &Person{}, &CollaboratorJourney{}, &Expense{}, &LedgerEntry{}, &JourneySettlement{}, &LedgerReceipt{}, &WorkPeriod{}, &WorkPeriodAssignment{}, &GoldProductionEntry{}, &AccrualRun{}, &AccrualItem{})
}

func ensureDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
