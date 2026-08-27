package expenses

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter normalizedExpenseListFilter) ([]db.Expense, int64, error) {
	var rows []db.Expense
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.Expense{}).
		Where("expenses.tenant_id = ?", tenantctx.TenantID(ctx)).
		Preload("Collaborator.Person").
		Preload("ExpenseCategory").
		Preload("ValueUnit").
		Preload("PriceListItem").
		Preload("GoldPrice")

	if !filter.IncludeInactive {
		q = q.Where("expenses.active = ?", true)
	}
	if filter.CollaboratorID != "" {
		q = q.Where("expenses.collaborator_id = ?", filter.CollaboratorID)
	}
	if filter.CollaboratorSearch != "" {
		q = applyCollaboratorSearchFilter(q, filter.CollaboratorSearch)
	}
	if filter.ExpenseCategoryID != "" {
		q = q.Where("expenses.expense_category_id = ?", filter.ExpenseCategoryID)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("expenses.value_unit_id = ?", filter.ValueUnitID)
	}
	if filter.ItemType != "" {
		q = applyItemTypeFilter(q, filter.ItemType)
	}
	if filter.PriceListItemID != "" {
		q = q.Where("expenses.price_list_item_id = ?", filter.PriceListItemID)
	}
	if filter.CurrencyCode != "" {
		q = q.Where("expenses.currency_code = ?", filter.CurrencyCode)
	}
	if filter.DateFrom != nil {
		q = q.Where("expenses.expense_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		// Use an exclusive next-day upper bound instead of <= YYYY-MM-DD.
		// GORM/SQLite can persist date values with a midnight time component,
		// and lexical comparison against the bare date string can exclude
		// same-day rows in runtime/CI databases.
		q = q.Where("expenses.expense_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("expenses.expense_date DESC, expenses.created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func applyCollaboratorSearchFilter(q *gorm.DB, search string) *gorm.DB {
	like := strings.ToLower(strings.TrimSpace(search)) + "%"
	return q.Where(
		`EXISTS (
			SELECT 1
			FROM collaborator_journeys AS collaborator_search_journeys
			JOIN people AS collaborator_search_people
			  ON collaborator_search_people.id = collaborator_search_journeys.person_id
			 AND collaborator_search_people.tenant_id = collaborator_search_journeys.tenant_id
			WHERE collaborator_search_journeys.id = expenses.collaborator_id
			  AND collaborator_search_journeys.tenant_id = expenses.tenant_id
			  AND (
				LOWER(COALESCE(collaborator_search_people.first_name, '')) LIKE ?
				OR LOWER(COALESCE(collaborator_search_people.last_name, '')) LIKE ?
				OR LOWER(COALESCE(collaborator_search_people.nickname, '')) LIKE ?
				OR LOWER(COALESCE(collaborator_search_people.first_name, '') || ' ' || COALESCE(collaborator_search_people.last_name, '')) LIKE ?
			  )
		)`,
		like, like, like, like,
	)
}

func applyItemTypeFilter(q *gorm.DB, itemType string) *gorm.DB {
	// Canonical price-list expenses store the selected item type as an audit
	// snapshot on expenses.item_type. During the Bite 21 transition, some rows
	// may only be classifiable by their linked price-list item, and legacy
	// Canteen expenses may only have the expense category. Keep the filter useful
	// for all of those records while still using the canonical snapshot when it
	// is present.
	return q.Where(
		`(
			UPPER(TRIM(expenses.item_type)) = ?
			OR EXISTS (
				SELECT 1
				FROM expense_price_list_items AS item_type_filter_items
				WHERE item_type_filter_items.id = expenses.price_list_item_id
				  AND item_type_filter_items.tenant_id = expenses.tenant_id
				  AND UPPER(TRIM(item_type_filter_items.item_type)) = ?
			)
			OR EXISTS (
				SELECT 1
				FROM reference_data AS item_type_filter_categories
				WHERE item_type_filter_categories.id = expenses.expense_category_id
				  AND item_type_filter_categories.tenant_id = expenses.tenant_id
				  AND item_type_filter_categories.type = 'expense_category'
				  AND UPPER(TRIM(item_type_filter_categories.code)) = ?
			)
		)`,
		itemType, itemType, itemType,
	)
}

func (r *gormRepository) Create(ctx context.Context, expense *db.Expense) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(expense).Error; err != nil {
			return err
		}
		entry := expenseLedgerEntry(expense)
		if err := tx.Create(entry).Error; err != nil {
			return err
		}
		return ensureReceiptObligation(tx, entry.TenantID, entry.ID)
	})
}

func (r *gormRepository) Update(ctx context.Context, expense *db.Expense) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		previous, err := latestExpenseLedgerEntry(tx, expense.TenantID, expense.ID)
		if err != nil {
			return err
		}

		if err := tx.
			Model(&db.Expense{}).
			Where("id = ? AND tenant_id = ?", expense.ID, tenantctx.TenantID(ctx)).
			Updates(map[string]any{
				"person_id":                expense.PersonID,
				"collaborator_id":          expense.CollaboratorID,
				"expense_category_id":      expense.ExpenseCategoryID,
				"value_unit_id":            expense.ValueUnitID,
				"amount":                   expense.Amount,
				"expense_date":             expense.ExpenseDate,
				"description":              expense.Description,
				"active":                   expense.Active,
				"price_list_item_id":       expense.PriceListItemID,
				"price_list_item_code":     expense.PriceListItemCode,
				"item_type":                expense.ItemType,
				"item_description":         expense.ItemDescription,
				"quantity":                 expense.Quantity,
				"unit_price_brl":           expense.UnitPriceBRL,
				"currency_code":            expense.CurrencyCode,
				"gold_price_id":            expense.GoldPriceID,
				"gold_brl_per_gram":        expense.GoldBRLPerGram,
				"gold_price_date":          expense.GoldPriceDate,
				"unit_price_amount":        expense.UnitPriceAmount,
				"total_amount":             expense.TotalAmount,
				"calculation_method":       expense.CalculationMethod,
				"calculation_details_json": expense.CalculationDetailsJSON,
				"updated_at":               expense.UpdatedAt,
			}).Error; err != nil {
			return err
		}

		now := expense.UpdatedAt
		if now.IsZero() {
			now = time.Now().UTC()
		}
		if previous != nil {
			reversal := reversalLedgerEntry(*previous, now, "Expense ledger correction")
			if err := tx.Create(&reversal).Error; err != nil {
				return err
			}
		}
		if expense.Active {
			replacement := replacementExpenseLedgerEntry(expense, previous, now)
			if err := tx.Create(&replacement).Error; err != nil {
				return err
			}
			return ensureReceiptObligation(tx, replacement.TenantID, replacement.ID)
		}
		return nil
	})
}

func (r *gormRepository) Cancel(ctx context.Context, expense *db.Expense, actorUserID, reason string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		previous, err := latestExpenseLedgerEntry(tx, expense.TenantID, expense.ID)
		if err != nil {
			return err
		}

		updates := map[string]any{
			"active":              false,
			"cancelled_at":        expense.CancelledAt,
			"cancelled_by":        strings.TrimSpace(actorUserID),
			"cancellation_reason": strings.TrimSpace(reason),
			"updated_at":          expense.UpdatedAt,
		}
		result := tx.
			Model(&db.Expense{}).
			Where("id = ? AND tenant_id = ? AND active = ?", expense.ID, tenantctx.TenantID(ctx), true).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}

		if previous == nil {
			return nil
		}

		now := expense.UpdatedAt
		if now.IsZero() {
			now = time.Now().UTC()
		}
		reversal := reversalLedgerEntry(*previous, now, "Expense cancellation: "+strings.TrimSpace(reason))
		if err := tx.Create(&reversal).Error; err != nil {
			return err
		}

		debitEntryIDs := tx.
			Model(&db.LedgerEntry{}).
			Select("id").
			Where(
				"tenant_id = ? AND direction = ? AND correction_type IN (?, ?) AND ((source_type = ? AND source_id = ?) OR (source_type = ? AND source_id LIKE ?))",
				expense.TenantID,
				ledgerDirectionDebit,
				ledgerCorrectionTypeOriginal,
				ledgerCorrectionTypeReplacement,
				ledgerSourceTypeExpense,
				expense.ID,
				ledgerSourceTypeExpenseReplace,
				expense.ID+":%",
			)

		return tx.
			Model(&db.LedgerReceipt{}).
			Where("tenant_id = ? AND ledger_entry_id IN (?) AND status NOT IN ?", expense.TenantID, debitEntryIDs, []string{"RETURNED", "CANCELLED"}).
			Updates(map[string]any{
				"status":              "CANCELLED",
				"cancelled_at":        now,
				"cancelled_by":        strings.TrimSpace(actorUserID),
				"cancellation_reason": strings.TrimSpace(reason),
				"updated_at":          now,
			}).Error
	})
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.Expense, error) {
	var row db.Expense
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("Collaborator.Status").
		Preload("ExpenseCategory").
		Preload("ValueUnit").
		Preload("PriceListItem").
		Preload("GoldPrice").
		First(&row, "id = ? AND tenant_id = ?", id, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsRecreationFromExpenseID(ctx context.Context, sourceExpenseID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.Expense{}).
		Where("tenant_id = ? AND recreated_from_expense_id = ?", tenantctx.TenantID(ctx), strings.TrimSpace(sourceExpenseID)).
		Count(&count).Error
	return count > 0, err
}

func (r *gormRepository) FindFinancialPostingByExpenseID(ctx context.Context, expenseID string) (*db.LedgerEntry, error) {
	var row db.LedgerEntry
	err := r.db.WithContext(ctx).
		Preload("ValueUnit").
		Preload("Receipt").
		Where("tenant_id = ? AND direction = ? AND correction_type IN (?, ?) AND ((source_type = ? AND source_id = ?) OR (source_type = ? AND source_id LIKE ?))",
			tenantctx.TenantID(ctx),
			ledgerDirectionDebit,
			ledgerCorrectionTypeOriginal, ledgerCorrectionTypeReplacement,
			ledgerSourceTypeExpense, expenseID,
			ledgerSourceTypeExpenseReplace, expenseID+":%",
		).
		Order("created_at DESC, id DESC").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindFinancialPostingsByExpenseIDs(ctx context.Context, expenseIDs []string) (map[string]*db.LedgerEntry, error) {
	out := make(map[string]*db.LedgerEntry, len(expenseIDs))
	if len(expenseIDs) == 0 {
		return out, nil
	}

	replacementScope := r.db.Where("1 = 0")
	for _, expenseID := range expenseIDs {
		replacementScope = replacementScope.Or("source_type = ? AND source_id LIKE ?", ledgerSourceTypeExpenseReplace, strings.TrimSpace(expenseID)+":%")
	}

	var rows []db.LedgerEntry
	if err := r.db.WithContext(ctx).
		Preload("ValueUnit").
		Preload("Receipt").
		Where("tenant_id = ? AND direction = ? AND correction_type IN (?, ?)",
			tenantctx.TenantID(ctx),
			ledgerDirectionDebit,
			ledgerCorrectionTypeOriginal, ledgerCorrectionTypeReplacement,
		).
		Where(r.db.Where("source_type = ? AND source_id IN ?", ledgerSourceTypeExpense, expenseIDs).Or(replacementScope)).
		Order("created_at DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	for i := range rows {
		expenseID := expenseIDForPosting(rows[i])
		if expenseID == "" {
			continue
		}
		if _, exists := out[expenseID]; exists {
			continue
		}
		row := rows[i]
		out[expenseID] = &row
	}

	return out, nil
}

func expenseIDForPosting(row db.LedgerEntry) string {
	if row.SourceType == ledgerSourceTypeExpense {
		return strings.TrimSpace(row.SourceID)
	}
	if row.SourceType == ledgerSourceTypeExpenseReplace {
		expenseID, _, ok := strings.Cut(row.SourceID, ":")
		if ok {
			return strings.TrimSpace(expenseID)
		}
	}
	return ""
}

func (r *gormRepository) FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Status").
		Preload("Membership").
		First(&row, "id = ? AND tenant_id = ?", collaboratorID, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", id, tenantctx.TenantID(ctx), typ, true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) FindActiveReferenceByID(ctx context.Context, id string, typ string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND type = ? AND active = ?", strings.TrimSpace(id), tenantctx.TenantID(ctx), typ, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActiveReferenceByCode(ctx context.Context, typ string, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantctx.TenantID(ctx), typ, code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActivePriceListItemByID(ctx context.Context, id string) (*db.ExpensePriceListItem, error) {
	var row db.ExpensePriceListItem
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND active = ?", id, tenantctx.TenantID(ctx), true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindLatestActiveGoldPrice(ctx context.Context) (*db.GoldPrice, error) {
	var row db.GoldPrice
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND active = ?", tenantctx.TenantID(ctx), true).
		Order("price_date DESC, created_at DESC").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func formatDateForQuery(value time.Time) string {
	return value.Format(dateLayout)
}

func ensureReceiptObligation(tx *gorm.DB, tenantID, ledgerEntryID string) error {
	var count int64
	if err := tx.Model(&db.LedgerReceipt{}).Where("ledger_entry_id = ? AND tenant_id = ?", ledgerEntryID, tenantID).Count(&count).Error; err != nil {
		return err
	}
	if count != 1 {
		return ErrExpenseReceiptObligationMissing
	}
	return nil
}

func latestExpenseLedgerEntry(tx *gorm.DB, tenantID string, expenseID string) (*db.LedgerEntry, error) {
	var row db.LedgerEntry
	err := tx.
		Where("tenant_id = ? AND correction_type IN (?, ?) AND ((source_type = ? AND source_id = ?) OR (source_type = ? AND source_id LIKE ?))",
			tenantID,
			ledgerCorrectionTypeOriginal, ledgerCorrectionTypeReplacement,
			ledgerSourceTypeExpense, expenseID,
			ledgerSourceTypeExpenseReplace, expenseID+":%",
		).
		Order("created_at DESC").
		First(&row).Error
	if err == nil {
		return &row, nil
	}
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return nil, err
}

const (
	ledgerEntryTypeExpenseDeduction = "EXPENSE_DEDUCTION"
	ledgerDirectionDebit            = "DEBIT"
	ledgerSourceTypeExpense         = "EXPENSE"
	ledgerSourceTypeExpenseReplace  = "EXPENSE_REPLACEMENT"
	ledgerCorrectionTypeOriginal    = "ORIGINAL"
	ledgerCorrectionTypeReversal    = "REVERSAL"
	ledgerCorrectionTypeReplacement = "REPLACEMENT"
)

func expenseLedgerEntry(expense *db.Expense) *db.LedgerEntry {
	return &db.LedgerEntry{
		BaseModel: db.BaseModel{
			ID:        "ledger-expense-" + expense.ID,
			CreatedAt: expense.CreatedAt,
			UpdatedAt: expense.UpdatedAt,
		},
		TenantID:       expense.TenantID,
		PersonID:       expense.PersonID,
		CollaboratorID: expense.CollaboratorID,
		ValueUnitID:    expense.ValueUnitID,
		EntryType:      ledgerEntryTypeExpenseDeduction,
		Direction:      ledgerDirectionDebit,
		Amount:         expense.Amount,
		EffectiveDate:  expense.ExpenseDate,
		SourceType:     ledgerSourceTypeExpense,
		SourceID:       expense.ID,
		Description:    expense.Description,
		Active:         true,
		CorrectionType: ledgerCorrectionTypeOriginal,
	}
}

func reversalLedgerEntry(original db.LedgerEntry, now time.Time, reason string) db.LedgerEntry {
	return db.LedgerEntry{
		BaseModel: db.BaseModel{
			ID:        "ledger-reversal-" + ids.New(),
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:         original.TenantID,
		PersonID:         original.PersonID,
		CollaboratorID:   original.CollaboratorID,
		ValueUnitID:      original.ValueUnitID,
		EntryType:        original.EntryType,
		Direction:        oppositeDirection(original.Direction),
		Amount:           original.Amount,
		EffectiveDate:    now,
		SourceType:       "LEDGER_CORRECTION",
		SourceID:         "ledger-reversal-" + original.ID + "-" + ids.New(),
		Description:      "Reversal of ledger entry " + original.ID,
		Active:           true,
		CorrectionType:   ledgerCorrectionTypeReversal,
		RelatedEntryID:   &original.ID,
		CorrectionReason: reason,
	}
}

func replacementExpenseLedgerEntry(expense *db.Expense, original *db.LedgerEntry, now time.Time) db.LedgerEntry {
	var relatedID *string
	if original != nil {
		id := original.ID
		relatedID = &id
	}
	return db.LedgerEntry{
		BaseModel: db.BaseModel{
			ID:        "ledger-expense-replacement-" + ids.New(),
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:         expense.TenantID,
		PersonID:         expense.PersonID,
		CollaboratorID:   expense.CollaboratorID,
		ValueUnitID:      expense.ValueUnitID,
		EntryType:        ledgerEntryTypeExpenseDeduction,
		Direction:        ledgerDirectionDebit,
		Amount:           expense.Amount,
		EffectiveDate:    expense.ExpenseDate,
		SourceType:       ledgerSourceTypeExpenseReplace,
		SourceID:         expense.ID + ":" + ids.New(),
		Description:      expense.Description,
		Active:           true,
		CorrectionType:   ledgerCorrectionTypeReplacement,
		RelatedEntryID:   relatedID,
		CorrectionReason: "Expense replacement for " + expense.ID,
	}
}

func oppositeDirection(direction string) string {
	if direction == "CREDIT" {
		return "DEBIT"
	}
	return "CREDIT"
}
