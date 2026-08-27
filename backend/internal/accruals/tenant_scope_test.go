package accruals

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/workperiods"
	"gorm.io/gorm"
)

func TestCreateRunUsesSelectedTenantWorkPeriod(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "accrual-tenant.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	now := time.Now().UTC()
	tenantID := "tenant-b"
	if err := database.Create(&db.Tenant{
		BaseModel: db.BaseModel{ID: tenantID, CreatedAt: now, UpdatedAt: now},
		Code:      "TENANT_B",
		Name:      "Tenant B",
		Active:    true,
	}).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	workDate := time.Date(2026, time.August, 22, 0, 0, 0, 0, time.UTC)
	workPeriod := db.WorkPeriod{
		BaseModel:  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:   tenantID,
		WorkDate:   workDate,
		PeriodCode: "DAY",
		Name:       "Tenant B day",
		StartsAt:   workDate.Add(8 * time.Hour),
		EndsAt:     workDate.Add(17 * time.Hour),
		Status:     workperiods.StatusPlanning,
	}
	if err := database.Create(&workPeriod).Error; err != nil {
		t.Fatalf("create work period: %v", err)
	}

	svc := NewService(NewRepository(database))
	tenantBCtx := tenantctx.WithTenantID(context.Background(), tenantID)
	created, err := svc.CreateRun(tenantBCtx, workPeriod.ID, CreateAccrualRunRequest{AccrualDate: "2026-08-22"}, "tenant-b-admin")
	if err != nil {
		t.Fatalf("create Tenant B accrual run: %v", err)
	}

	var stored db.AccrualRun
	if err := database.First(&stored, "id = ?", created.ID).Error; err != nil {
		t.Fatalf("find stored accrual run: %v", err)
	}
	if stored.TenantID != tenantID {
		t.Fatalf("expected accrual run tenant %q, got %q", tenantID, stored.TenantID)
	}
	if stored.WorkPeriodID != workPeriod.ID {
		t.Fatalf("expected work period %q, got %q", workPeriod.ID, stored.WorkPeriodID)
	}

	defaultCtx := tenantctx.WithTenantID(context.Background(), db.DefaultTenantID)
	_, err = svc.GetRunByID(defaultCtx, created.ID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected Tenant B accrual run to be hidden from default tenant, got %v", err)
	}
}
