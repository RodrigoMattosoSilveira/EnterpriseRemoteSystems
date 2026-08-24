package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
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
		Where("ledger_receipts.tenant_id = ?", tenantctx.TenantID(ctx)).
		Preload("LedgerEntry.ValueUnit").
		Preload("Collaborator.Person")

	q = applyOutstandingReceiptWorkbenchFilters(q, filter)

	if filter.Status != "" {
		q = q.Where("ledger_receipts.status = ?", filter.Status)
	} else {
		q = q.Where("ledger_receipts.status IN ?", statuses)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.
		Order(`CASE ledger_receipts.status
			WHEN 'PENDING_ISSUE' THEN 1
			WHEN 'ISSUED' THEN 2
			WHEN 'PRINTED' THEN 3
			WHEN 'SIGNED' THEN 4
			ELSE 9
		END ASC`).
		Order("ledger_receipts.created_at ASC, ledger_receipts.id ASC").
		Limit(filter.PageSize).
		Offset((filter.Page - 1) * filter.PageSize).
		Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) CountOutstandingReceiptsByStatus(ctx context.Context, filter normalizedReceiptListFilter) (map[string]int64, error) {
	type statusCount struct {
		Status string
		Count  int64
	}
	var rows []statusCount
	q := r.db.WithContext(ctx).
		Model(&db.LedgerReceipt{}).
		Select("ledger_receipts.status, COUNT(*) AS count").
		Where("ledger_receipts.tenant_id = ? AND ledger_receipts.status IN ?", tenantctx.TenantID(ctx), []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"})
	q = applyOutstandingReceiptWorkbenchFilters(q, filter)
	err := q.Group("ledger_receipts.status").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := map[string]int64{"PENDING_ISSUE": 0, "ISSUED": 0, "PRINTED": 0, "SIGNED": 0}
	for _, row := range rows {
		out[row.Status] = row.Count
	}
	return out, nil
}

func applyOutstandingReceiptWorkbenchFilters(q *gorm.DB, filter normalizedReceiptListFilter) *gorm.DB {
	if filter.SourceType != "" {
		q = q.Joins("JOIN ledger_entries AS receipt_source_filter ON receipt_source_filter.id = ledger_receipts.ledger_entry_id AND receipt_source_filter.tenant_id = ledger_receipts.tenant_id").
			Where("receipt_source_filter.source_type = ?", filter.SourceType)
	}
	if strings.TrimSpace(filter.CollaboratorSearch) != "" {
		search := strings.TrimSpace(filter.CollaboratorSearch)
		needle := "%" + strings.ToLower(search) + "%"
		q = q.Joins("JOIN collaborator_journeys AS receipt_collaborator_filter ON receipt_collaborator_filter.id = ledger_receipts.collaborator_id AND receipt_collaborator_filter.tenant_id = ledger_receipts.tenant_id").
			Joins("JOIN people AS receipt_person_filter ON receipt_person_filter.id = receipt_collaborator_filter.person_id AND receipt_person_filter.tenant_id = ledger_receipts.tenant_id").
			Where(`(ledger_receipts.collaborator_id = ?
				OR LOWER(receipt_collaborator_filter.id) LIKE ?
				OR LOWER(receipt_person_filter.nickname) LIKE ?
				OR LOWER(receipt_person_filter.first_name || ' ' || receipt_person_filter.last_name) LIKE ?
				OR LOWER(receipt_person_filter.cpf) LIKE ?)`, search, needle, needle, needle, needle)
	}
	return q
}

func (r *gormRepository) ListEntries(ctx context.Context, collaboratorID string, filter normalizedLedgerEntryListFilter) ([]db.LedgerEntry, int64, error) {
	var rows []db.LedgerEntry
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("ledger_entries.tenant_id = ? AND ledger_entries.collaborator_id = ?", tenantctx.TenantID(ctx), collaboratorID).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		Preload("Receipt")

	if !filter.IncludeInactive {
		q = q.Where("ledger_entries.active = ?", true)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("ledger_entries.value_unit_id = ?", filter.ValueUnitID)
	}
	if filter.EntryType != "" {
		q = q.Where("ledger_entries.entry_type = ?", filter.EntryType)
	}
	if filter.Direction != "" {
		q = q.Where("ledger_entries.direction = ?", filter.Direction)
	}
	if filter.SourceType != "" {
		q = q.Where("ledger_entries.source_type = ?", filter.SourceType)
	}
	if filter.OutstandingReceipts {
		q = q.Joins("JOIN ledger_receipts AS receipt_filter ON receipt_filter.ledger_entry_id = ledger_entries.id AND receipt_filter.tenant_id = ledger_entries.tenant_id AND receipt_filter.status IN ?", []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"})
	}
	if filter.DateFrom != nil {
		q = q.Where("ledger_entries.effective_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where("ledger_entries.effective_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("ledger_entries.effective_date DESC, ledger_entries.created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) ListPersonEntries(ctx context.Context, personID string, filter normalizedLedgerEntryListFilter) ([]db.LedgerEntry, int64, error) {
	var rows []db.LedgerEntry
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("ledger_entries.tenant_id = ? AND ledger_entries.person_id = ?", tenantctx.TenantID(ctx), strings.TrimSpace(personID)).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		Preload("Receipt")

	if !filter.IncludeInactive {
		q = q.Where("ledger_entries.active = ?", true)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("ledger_entries.value_unit_id = ?", filter.ValueUnitID)
	}
	if filter.EntryType != "" {
		q = q.Where("ledger_entries.entry_type = ?", filter.EntryType)
	}
	if filter.Direction != "" {
		q = q.Where("ledger_entries.direction = ?", filter.Direction)
	}
	if filter.SourceType != "" {
		q = q.Where("ledger_entries.source_type = ?", filter.SourceType)
	}
	if filter.OutstandingReceipts {
		q = q.Joins("JOIN ledger_receipts AS receipt_filter ON receipt_filter.ledger_entry_id = ledger_entries.id AND receipt_filter.tenant_id = ledger_entries.tenant_id AND receipt_filter.status IN ?", []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"})
	}
	if filter.DateFrom != nil {
		q = q.Where("ledger_entries.effective_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where("ledger_entries.effective_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("ledger_entries.effective_date DESC, ledger_entries.created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) FindWorkPeriodAssignmentSourceDetails(ctx context.Context, assignmentIDs []string) (map[string]WorkPeriodAssignmentSourceDetail, error) {
	uniqueIDs := make([]string, 0, len(assignmentIDs))
	seen := map[string]bool{}
	for _, id := range assignmentIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		uniqueIDs = append(uniqueIDs, id)
	}
	if len(uniqueIDs) == 0 {
		return map[string]WorkPeriodAssignmentSourceDetail{}, nil
	}

	var rows []WorkPeriodAssignmentSourceDetail
	err := r.db.WithContext(ctx).
		Table("work_period_assignments AS wpa").
		Select(`wpa.id AS assignment_id,
			wp.id AS work_period_id,
			wp.work_date AS work_date,
			wp.period_code AS period_code,
			wp.name AS work_period_name`).
		Joins("JOIN work_periods AS wp ON wp.id = wpa.work_period_id AND wp.tenant_id = wpa.tenant_id").
		Where("wpa.tenant_id = ? AND wpa.id IN ?", tenantctx.TenantID(ctx), uniqueIDs).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]WorkPeriodAssignmentSourceDetail, len(rows))
	for _, row := range rows {
		out[row.AssignmentID] = row
	}
	return out, nil
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
		Where("le.tenant_id = ? AND le.collaborator_id = ? AND le.active = ?", tenantctx.TenantID(ctx), collaboratorID, true).
		Group("le.collaborator_id, p.nickname, p.first_name, p.last_name, le.value_unit_id, ru.code, ru.label, ru.sort_order").
		Having("ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001").
		Order("ru.sort_order ASC, ru.label ASC").
		Scan(&rows).Error
	return rows, err
}

func (r *gormRepository) ListPersonBalances(ctx context.Context, personID string) ([]BalanceRow, error) {
	var rows []BalanceRow
	err := r.db.WithContext(ctx).
		Table("ledger_entries AS le").
		Select(`le.person_id,
			COALESCE(NULLIF(TRIM(gp.nickname), ''), TRIM(gp.first_name || ' ' || gp.last_name)) AS person_label,
			le.value_unit_id,
			ru.code AS value_unit_code,
			ru.label AS value_unit_label,
			SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END) AS balance`).
		Joins("JOIN global_people gp ON gp.id = le.person_id").
		Joins("JOIN reference_data ru ON ru.id = le.value_unit_id AND ru.tenant_id = le.tenant_id").
		Where("le.tenant_id = ? AND le.person_id = ? AND le.active = ?", tenantctx.TenantID(ctx), strings.TrimSpace(personID), true).
		Group("le.person_id, gp.nickname, gp.first_name, gp.last_name, le.value_unit_id, ru.code, ru.label, ru.sort_order").
		Having("ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001").
		Order("ru.sort_order ASC, ru.label ASC").
		Scan(&rows).Error
	return rows, err
}

func (r *gormRepository) FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Person").
		Preload("Membership").
		Preload("Membership.Person").
		Preload("Status").
		Preload("PaymentMethod").
		Preload("Location").
		First(&row, "id = ? AND tenant_id = ?", collaboratorID, tenantctx.TenantID(ctx)).Error
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
		Where("tenant_id = ? AND location_id = ? AND active = ?", tenantctx.TenantID(ctx), locationID, true).
		Group("production_date").
		Order("production_date DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func (r *gormRepository) AccrualProjectionForCollaborator(ctx context.Context, collaboratorID string, startDate time.Time, endDate time.Time) (AccrualProjectionRow, error) {
	type row struct {
		BRLAmount       float64
		GoldGramAmount  float64
		WorkPeriodDates int
		PendingItems    int64
	}
	var result row
	err := r.db.WithContext(ctx).
		Table("accrual_items AS ai").
		Select(`COALESCE(SUM(CASE WHEN ai.status = 'READY' AND ai.direction = 'CREDIT' THEN COALESCE(ai.brl_amount, 0)
			WHEN ai.status = 'READY' AND ai.direction = 'DEBIT' THEN -COALESCE(ai.brl_amount, 0)
			ELSE 0 END), 0) AS brl_amount,
			COALESCE(SUM(CASE WHEN ai.status = 'READY' AND ai.direction = 'CREDIT' THEN COALESCE(ai.gold_gram_amount, 0)
			WHEN ai.status = 'READY' AND ai.direction = 'DEBIT' THEN -COALESCE(ai.gold_gram_amount, 0)
			ELSE 0 END), 0) AS gold_gram_amount,
			COUNT(DISTINCT CASE WHEN ai.status = 'READY' AND ai.work_period_assignment_id IS NOT NULL THEN wp.work_date END) AS work_period_dates,
			COALESCE(SUM(CASE WHEN ai.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_items`).
		Joins("JOIN work_periods AS wp ON wp.id = ai.work_period_id AND wp.tenant_id = ai.tenant_id").
		Joins("JOIN accrual_runs AS ar ON ar.id = ai.accrual_run_id AND ar.tenant_id = ai.tenant_id").
		Where("ai.tenant_id = ? AND ai.collaborator_id = ? AND wp.work_date >= ? AND wp.work_date <= ? AND ai.status IN ?", tenantctx.TenantID(ctx), collaboratorID, formatDateForQuery(startDate), formatDateForQuery(endDate), []string{"READY", "PENDING"}).
		Where(`ar.id = (
			SELECT latest_ar.id
			FROM accrual_runs AS latest_ar
			WHERE latest_ar.tenant_id = ai.tenant_id
			  AND latest_ar.work_period_id = ai.work_period_id
			  AND latest_ar.status <> 'VOIDED'
			ORDER BY latest_ar.created_at DESC, latest_ar.id DESC
			LIMIT 1
		)`).
		Scan(&result).Error
	if err != nil {
		return AccrualProjectionRow{}, err
	}
	return AccrualProjectionRow{
		BRLAmount:       result.BRLAmount,
		GoldGramAmount:  result.GoldGramAmount,
		WorkPeriodDates: result.WorkPeriodDates,
		PendingItems:    result.PendingItems,
	}, nil
}

func (r *gormRepository) CountPostedEarningWorkPeriodDates(ctx context.Context, collaboratorID string, startDate time.Time, endDate time.Time) (int, error) {
	var count int
	err := r.db.WithContext(ctx).
		Table("ledger_entries AS le").
		Select("COUNT(DISTINCT wp.work_date)").
		Joins("JOIN work_period_assignments AS wpa ON wpa.id = le.source_id AND wpa.tenant_id = le.tenant_id").
		Joins("JOIN work_periods AS wp ON wp.id = wpa.work_period_id AND wp.tenant_id = le.tenant_id").
		Where("le.tenant_id = ? AND le.collaborator_id = ? AND le.active = ? AND le.entry_type = ? AND le.direction = ? AND le.source_type = ? AND wp.work_date >= ? AND wp.work_date <= ?", tenantctx.TenantID(ctx), collaboratorID, true, "EARNING_CREDIT", "CREDIT", "WORK_PERIOD_ASSIGNMENT", formatDateForQuery(startDate), formatDateForQuery(endDate)).
		Scan(&count).Error
	return count, err
}

func (r *gormRepository) CountPendingAccrualItems(ctx context.Context, collaboratorID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.AccrualItem{}).
		Where("tenant_id = ? AND collaborator_id = ? AND status = ?", tenantctx.TenantID(ctx), collaboratorID, "PENDING").
		Count(&count).Error
	return count, err
}

func (r *gormRepository) CountOutstandingReceiptsForCollaborator(ctx context.Context, collaboratorID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerReceipt{}).
		Where("tenant_id = ? AND collaborator_id = ? AND status IN ?", tenantctx.TenantID(ctx), strings.TrimSpace(collaboratorID), []string{"PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED"}).
		Count(&count).Error
	return count, err
}

func formatDateForQuery(value time.Time) string { return value.Format(dateLayout) }

func (r *gormRepository) FindEntryByID(ctx context.Context, entryID string) (*db.LedgerEntry, error) {
	var row db.LedgerEntry
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("ValueUnit").
		Preload("Receipt").
		First(&row, "id = ? AND tenant_id = ?", entryID, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindValueUnitByID(ctx context.Context, valueUnitID string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND type = ? AND active = ?", valueUnitID, tenantctx.TenantID(ctx), "value_unit", true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) HasReversal(ctx context.Context, entryID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("tenant_id = ? AND correction_type = ? AND related_entry_id = ?", tenantctx.TenantID(ctx), "REVERSAL", entryID).
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
		return ensureDebitLedgerReceiptObligations(tx, entries...)
	})
}

func (r *gormRepository) FindValueUnitByCode(ctx context.Context, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantctx.TenantID(ctx), "value_unit", code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindSettlementByRequestID(ctx context.Context, collaboratorID, requestID string) (*db.JourneySettlement, error) {
	var row db.JourneySettlement
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND collaborator_id = ? AND request_id = ?", tenantctx.TenantID(ctx), collaboratorID, requestID).Error
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
		Preload("Receipt").
		First(&row, "tenant_id = ? AND source_type = ? AND source_id = ?", tenantctx.TenantID(ctx), sourceType, sourceID).Error
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
		Preload("Receipt").
		Where("tenant_id = ? AND source_type = ? AND source_id = ?", tenantctx.TenantID(ctx), sourceType, sourceID).
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
		return ensureDebitLedgerReceiptObligations(tx, entries...)
	})
}

func (r *gormRepository) FindCollaboratorStatusByCode(ctx context.Context, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantctx.TenantID(ctx), "collaborator_status", code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CloseJourneyWithAudit(ctx context.Context, collaboratorID, finishedStatusID string, closedAt time.Time, settlement *db.JourneySettlement) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&db.CollaboratorJourney{}).
			Where("id = ? AND tenant_id = ? AND closed_at IS NULL", collaboratorID, tenantctx.TenantID(ctx)).
			Updates(map[string]any{"status_id": finishedStatusID, "closed_at": closedAt, "updated_at": closedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrJourneyAlreadyClosed
		}
		return tx.Create(settlement).Error
	})
	if err != nil && strings.Contains(err.Error(), "collaborator_journey_non_zero_balance") {
		return ErrJourneyCloseBlocked
	}
	return err
}

func (r *gormRepository) FindReceiptByLedgerEntryID(ctx context.Context, ledgerEntryID string) (*db.LedgerReceipt, error) {
	var row db.LedgerReceipt
	err := r.db.WithContext(ctx).
		Preload("LedgerEntry.ValueUnit").
		Preload("Collaborator.Person").
		First(&row, "ledger_entry_id = ? AND tenant_id = ?", ledgerEntryID, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) MarkReceiptPrinted(ctx context.Context, receiptID, printedBy string, printedAt time.Time) (*db.LedgerReceipt, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row db.LedgerReceipt
		if err := tx.First(&row, "id = ? AND tenant_id = ?", receiptID, tenantctx.TenantID(ctx)).Error; err != nil {
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
		return tx.Model(&db.LedgerReceipt{}).Where("id = ? AND tenant_id = ?", receiptID, tenantctx.TenantID(ctx)).Updates(updates).Error
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
		if err := tx.First(&row, "id = ? AND tenant_id = ?", receiptID, tenantctx.TenantID(ctx)).Error; err != nil {
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
		return tx.Model(&db.LedgerReceipt{}).Where("id = ? AND tenant_id = ?", receiptID, tenantctx.TenantID(ctx)).Updates(updates).Error
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
		First(&row, "id = ? AND tenant_id = ?", receiptID, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) CountDebitLedgerEntries(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Where("tenant_id = ? AND direction = ?", tenantctx.TenantID(ctx), ledgerDirectionDebit).
		Count(&count).Error
	return count, err
}

func (r *gormRepository) CountDebitLedgerEntriesWithReceipts(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("ledger_entries AS le").
		Joins("JOIN ledger_receipts AS lr ON lr.ledger_entry_id = le.id AND lr.tenant_id = le.tenant_id").
		Where("le.tenant_id = ? AND le.direction = ?", tenantctx.TenantID(ctx), ledgerDirectionDebit).
		Count(&count).Error
	return count, err
}

func (r *gormRepository) ListDebitLedgerEntriesMissingReceipts(ctx context.Context) ([]db.LedgerEntry, error) {
	var rows []db.LedgerEntry
	err := r.db.WithContext(ctx).
		Model(&db.LedgerEntry{}).
		Joins("LEFT JOIN ledger_receipts AS lr ON lr.ledger_entry_id = ledger_entries.id AND lr.tenant_id = ledger_entries.tenant_id").
		Where("ledger_entries.tenant_id = ? AND ledger_entries.direction = ? AND lr.id IS NULL", tenantctx.TenantID(ctx), ledgerDirectionDebit).
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

func ensureDebitLedgerReceiptObligations(tx *gorm.DB, entries ...*db.LedgerEntry) error {
	for _, entry := range entries {
		if entry == nil || !strings.EqualFold(strings.TrimSpace(entry.Direction), ledgerDirectionDebit) {
			continue
		}
		var count int64
		if err := tx.Model(&db.LedgerReceipt{}).
			Where("tenant_id = ? AND ledger_entry_id = ?", entry.TenantID, entry.ID).
			Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return ErrDebitReceiptObligationMissing
		}
	}
	return nil
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
		tenantID = tenantctx.TenantID(ctx)
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
		tenantID = tenantctx.TenantID(ctx)
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
