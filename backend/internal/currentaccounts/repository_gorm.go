package currentaccounts

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListEntries(ctx context.Context, collaboratorID string, filter normalizedLedgerEntryListFilter) ([]db.LedgerEntry, int64, error) {
	var rows []db.LedgerEntry
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("tenant_id = ? AND collaborator_id = ?", defaultTenantID, collaboratorID).
		Preload("Collaborator.Person").
		Preload("ValueUnit")

	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("value_unit_id = ?", filter.ValueUnitID)
	}
	if filter.EntryType != "" {
		q = q.Where("entry_type = ?", filter.EntryType)
	}
	if filter.SourceType != "" {
		q = q.Where("source_type = ?", filter.SourceType)
	}
	if filter.DateFrom != nil {
		q = q.Where("effective_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where("effective_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("effective_date DESC, created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) ListBalances(ctx context.Context, collaboratorID string) ([]BalanceRow, error) {
	var rows []BalanceRow
	err := r.db.WithContext(ctx).
		Table("ledger_entries AS le").
		Select(`le.collaborator_id,
			COALESCE(NULLIF(TRIM(p.nickname), ''), TRIM(p.first_name || ' ' || p.last_name)) AS collaborator_label,
			le.value_unit_id,
			ru.code AS value_unit_code,
			ru.label AS value_unit_label,
			SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END) AS balance`).
		Joins("JOIN collaborator_journeys cj ON cj.id = le.collaborator_id AND cj.tenant_id = le.tenant_id").
		Joins("JOIN people p ON p.id = cj.person_id AND p.tenant_id = le.tenant_id").
		Joins("JOIN reference_data ru ON ru.id = le.value_unit_id AND ru.tenant_id = le.tenant_id").
		Where("le.tenant_id = ? AND le.collaborator_id = ? AND le.active = ?", defaultTenantID, collaboratorID, true).
		Group("le.collaborator_id, p.nickname, p.first_name, p.last_name, le.value_unit_id, ru.code, ru.label, ru.sort_order").
		Having("ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.00000001").
		Order("ru.sort_order ASC, ru.label ASC").
		Scan(&rows).Error
	return rows, err
}

func (r *gormRepository) FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Person").
		Preload("Status").
		First(&row, "id = ? AND tenant_id = ?", collaboratorID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CountPendingAccrualItems(ctx context.Context, collaboratorID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.AccrualItem{}).
		Where("tenant_id = ? AND collaborator_id = ? AND status = ?", defaultTenantID, collaboratorID, "PENDING").
		Count(&count).Error
	return count, err
}

func formatDateForQuery(value time.Time) string { return value.Format(dateLayout) }

func (r *gormRepository) FindEntryByID(ctx context.Context, entryID string) (*db.LedgerEntry, error) {
	var row db.LedgerEntry
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		First(&row, "id = ? AND tenant_id = ?", entryID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindValueUnitByID(ctx context.Context, valueUnitID string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND type = ? AND active = ?", valueUnitID, defaultTenantID, "value_unit", true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) HasReversal(ctx context.Context, entryID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("tenant_id = ? AND correction_type = ? AND related_entry_id = ?", defaultTenantID, "REVERSAL", entryID).
		Count(&count).Error
	return count > 0, err
}

func (r *gormRepository) CreateCorrectionEntries(ctx context.Context, entries ...*db.LedgerEntry) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, entry := range entries {
			if err := tx.Create(entry).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *gormRepository) FindValueUnitByCode(ctx context.Context, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", defaultTenantID, "value_unit", code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindSettlementByRequestID(ctx context.Context, collaboratorID, requestID string) (*db.JourneySettlement, error) {
	var row db.JourneySettlement
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND collaborator_id = ? AND request_id = ?", defaultTenantID, collaboratorID, requestID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindLedgerEntryBySource(ctx context.Context, sourceType, sourceID string) (*db.LedgerEntry, error) {
	var row db.LedgerEntry
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		First(&row, "tenant_id = ? AND source_type = ? AND source_id = ?", defaultTenantID, sourceType, sourceID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CreateSettlementWithEntries(ctx context.Context, settlement *db.JourneySettlement, entries ...*db.LedgerEntry) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(settlement).Error; err != nil {
			return err
		}
		for _, entry := range entries {
			if err := tx.Create(entry).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
