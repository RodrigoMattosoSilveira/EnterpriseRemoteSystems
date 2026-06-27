package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListOutstandingReceipts(ctx context.Context, filter normalizedReceiptListFilter) ([]db.LedgerReceipt, int64, error) {
	var rows []db.LedgerReceipt
	var total int64
	statuses := []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"}

	q := r.db.WithContext(ctx).
		Model(&db.LedgerReceipt{}).
		Where("tenant_id = ?", defaultTenantID).
		Preload("LedgerEntry.ValueUnit").
		Preload("Collaborator.Person")

	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	} else {
		q = q.Where("status IN ?", statuses)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.
		Order(`CASE status
			WHEN 'PENDING_ISSUE' THEN 1
			WHEN 'ISSUED' THEN 2
			WHEN 'PRINTED' THEN 3
			WHEN 'SIGNED' THEN 4
			ELSE 9
		END ASC`).
		Order("created_at ASC, id ASC").
		Limit(filter.PageSize).
		Offset((filter.Page - 1) * filter.PageSize).
		Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) CountOutstandingReceiptsByStatus(ctx context.Context) (map[string]int64, error) {
	type statusCount struct {
		Status string
		Count  int64
	}
	var rows []statusCount
	err := r.db.WithContext(ctx).
		Model(&db.LedgerReceipt{}).
		Select("status, COUNT(*) AS count").
		Where("tenant_id = ? AND status IN ?", defaultTenantID, []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"}).
		Group("status").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := map[string]int64{"PENDING_ISSUE": 0, "ISSUED": 0, "PRINTED": 0, "SIGNED": 0}
	for _, row := range rows {
		out[row.Status] = row.Count
	}
	return out, nil
}

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
		Preload("PaymentMethod").
		Preload("Location").
		First(&row, "id = ? AND tenant_id = ?", collaboratorID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ListRecentDailyGoldProduction(ctx context.Context, locationID string, limit int) ([]DailyGoldProductionRow, error) {
	if limit <= 0 {
		return []DailyGoldProductionRow{}, nil
	}
	var rows []DailyGoldProductionRow
	err := r.db.WithContext(ctx).
		Table("gold_production_entries").
		Select("production_date, SUM(gold_grams_produced) AS gold_grams").
		Where("tenant_id = ? AND location_id = ? AND active = ?", defaultTenantID, locationID, true).
		Group("production_date").
		Order("production_date DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func (r *gormRepository) CountPendingAccrualItems(ctx context.Context, collaboratorID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.AccrualItem{}).
		Where("tenant_id = ? AND collaborator_id = ? AND status = ?", defaultTenantID, collaboratorID, "PENDING").
		Count(&count).Error
	return count, err
}

func (r *gormRepository) CountOutstandingReceiptsForCollaborator(ctx context.Context, collaboratorID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerReceipt{}).
		Where("tenant_id = ? AND collaborator_id = ? AND status IN ?", defaultTenantID, strings.TrimSpace(collaboratorID), []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"}).
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

func (r *gormRepository) FindLedgerEntriesBySource(ctx context.Context, sourceType, sourceID string) ([]db.LedgerEntry, error) {
	var rows []db.LedgerEntry
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		Where("tenant_id = ? AND source_type = ? AND source_id = ?", defaultTenantID, sourceType, sourceID).
		Order("created_at ASC, id ASC").
		Find(&rows).Error
	return rows, err
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

func (r *gormRepository) FindCollaboratorStatusByCode(ctx context.Context, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", defaultTenantID, "collaborator_status", code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CloseJourneyWithSettlement(ctx context.Context, collaboratorID, finishedStatusID string, closedAt time.Time, settlement *db.JourneySettlement, entries ...*db.LedgerEntry) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&db.CollaboratorJourney{}).
			Where("id = ? AND tenant_id = ? AND closed_at IS NULL", collaboratorID, defaultTenantID).
			Updates(map[string]any{"status_id": finishedStatusID, "closed_at": closedAt, "updated_at": closedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrJourneyAlreadyClosed
		}
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

func (r *gormRepository) FindReceiptByLedgerEntryID(ctx context.Context, ledgerEntryID string) (*db.LedgerReceipt, error) {
	var row db.LedgerReceipt
	err := r.db.WithContext(ctx).
		Preload("LedgerEntry.ValueUnit").
		Preload("Collaborator.Person").
		First(&row, "ledger_entry_id = ? AND tenant_id = ?", ledgerEntryID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) MarkReceiptPrinted(ctx context.Context, receiptID, printedBy string, printedAt time.Time) (*db.LedgerReceipt, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row db.LedgerReceipt
		if err := tx.First(&row, "id = ? AND tenant_id = ?", receiptID, defaultTenantID).Error; err != nil {
			return err
		}
		if row.Status == "CANCELLED" {
			return ErrReceiptCancelled
		}
		updates := map[string]any{
			"printed_at": printedAt,
			"updated_at": printedAt,
		}
		if row.IssuedAt == nil {
			updates["issued_at"] = printedAt
			updates["issued_by"] = printedBy
		}
		if row.Status == "PENDING_ISSUE" || row.Status == "ISSUED" || row.Status == "PRINTED" {
			updates["status"] = "PRINTED"
		}
		return tx.Model(&db.LedgerReceipt{}).Where("id = ? AND tenant_id = ?", receiptID, defaultTenantID).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	return r.FindReceiptByID(ctx, receiptID)
}

func (r *gormRepository) MarkReceiptReturned(ctx context.Context, receiptID, receivedBy, signedDocumentRef, notes string, returnedAt time.Time) (*db.LedgerReceipt, error) {
	receivedBy = strings.TrimSpace(receivedBy)
	signedDocumentRef = strings.TrimSpace(signedDocumentRef)
	notes = strings.TrimSpace(notes)
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row db.LedgerReceipt
		if err := tx.First(&row, "id = ? AND tenant_id = ?", receiptID, defaultTenantID).Error; err != nil {
			return err
		}
		if row.Status == "CANCELLED" {
			return ErrReceiptCancelled
		}
		if row.Status == "RETURNED" {
			return ErrReceiptAlreadyReturned
		}
		updates := map[string]any{
			"signed_at":           returnedAt,
			"returned_at":         returnedAt,
			"received_by":         receivedBy,
			"signed_document_ref": signedDocumentRef,
			"notes":               notes,
			"status":              "RETURNED",
			"updated_at":          returnedAt,
		}
		if row.IssuedAt == nil {
			updates["issued_at"] = returnedAt
			updates["issued_by"] = receivedBy
		}
		if row.PrintedAt == nil {
			updates["printed_at"] = returnedAt
		}
		return tx.Model(&db.LedgerReceipt{}).Where("id = ? AND tenant_id = ?", receiptID, defaultTenantID).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	return r.FindReceiptByID(ctx, receiptID)
}

func (r *gormRepository) FindReceiptByID(ctx context.Context, receiptID string) (*db.LedgerReceipt, error) {
	var row db.LedgerReceipt
	err := r.db.WithContext(ctx).
		Preload("LedgerEntry.ValueUnit").
		Preload("Collaborator.Person").
		First(&row, "id = ? AND tenant_id = ?", receiptID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CountDebitLedgerEntries(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("tenant_id = ? AND direction = ?", defaultTenantID, ledgerDirectionDebit).
		Count(&count).Error
	return count, err
}

func (r *gormRepository) CountDebitLedgerEntriesWithReceipts(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("ledger_entries AS le").
		Joins("JOIN ledger_receipts AS lr ON lr.ledger_entry_id = le.id AND lr.tenant_id = le.tenant_id").
		Where("le.tenant_id = ? AND le.direction = ?", defaultTenantID, ledgerDirectionDebit).
		Count(&count).Error
	return count, err
}

func (r *gormRepository) ListDebitLedgerEntriesMissingReceipts(ctx context.Context) ([]db.LedgerEntry, error) {
	var rows []db.LedgerEntry
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Joins("LEFT JOIN ledger_receipts AS lr ON lr.ledger_entry_id = ledger_entries.id AND lr.tenant_id = ledger_entries.tenant_id").
		Where("ledger_entries.tenant_id = ? AND ledger_entries.direction = ? AND lr.id IS NULL", defaultTenantID, ledgerDirectionDebit).
		Order("ledger_entries.created_at ASC, ledger_entries.id ASC").
		Find(&rows).Error
	return rows, err
}

func (r *gormRepository) CreateLedgerReceipts(ctx context.Context, receipts ...*db.LedgerReceipt) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, receipt := range receipts {
			if err := tx.Create(receipt).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *gormRepository) FindCollaboratorTenantID(ctx context.Context, collaboratorID string) (string, error) {
	var row db.CollaboratorJourney
	if err := r.db.WithContext(ctx).Select("tenant_id").First(&row, "id = ?", collaboratorID).Error; err != nil {
		return "", err
	}
	return row.TenantID, nil
}

func (r *gormRepository) FindLedgerEntryTenantID(ctx context.Context, entryID string) (string, error) {
	var row db.LedgerEntry
	if err := r.db.WithContext(ctx).Select("tenant_id").First(&row, "id = ?", entryID).Error; err != nil {
		return "", err
	}
	return row.TenantID, nil
}

func (r *gormRepository) GetTenantSetting(ctx context.Context, tenantID, key string) (string, error) {
	setting, err := r.GetTenantSettingRow(ctx, tenantID, key)
	if err != nil {
		return "", err
	}
	return setting.Value, nil
}

func (r *gormRepository) GetTenantSettingRow(ctx context.Context, tenantID, key string) (*db.TenantSetting, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		tenantID = defaultTenantID
	}
	var row db.TenantSetting
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND key = ?", tenantID, strings.TrimSpace(key)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) UpsertTenantSetting(ctx context.Context, tenantID, key, value, description, updatedBy string) (*db.TenantSetting, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		tenantID = defaultTenantID
	}
	now := time.Now().UTC()
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	description = strings.TrimSpace(description)
	updatedBy = strings.TrimSpace(updatedBy)

	var row db.TenantSetting
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		err := tx.First(&row, "tenant_id = ? AND key = ?", tenantID, key).Error
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			row = db.TenantSetting{
				BaseModel:   db.BaseModel{ID: "tenant-setting-" + ids.New(), CreatedAt: now, UpdatedAt: now},
				TenantID:    tenantID,
				Key:         key,
				Value:       value,
				Description: description,
				UpdatedBy:   updatedBy,
			}
			return tx.Create(&row).Error
		}
		row.Value = value
		row.Description = description
		row.UpdatedBy = updatedBy
		row.UpdatedAt = now
		return tx.Save(&row).Error
	})
	if err != nil {
		return nil, err
	}
	return &row, nil
}
