package expenses

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

const (
	calculationMethodBRLPriceList         = "BRL_PRICE_LIST"
	calculationMethodLatestGoldConversion = "BRL_TO_GOLD_GRAM_LATEST_PRICE"
	calculationMethodLegacyDirectEntry    = "LEGACY_DIRECT_ENTRY"
)

var ErrExpenseReceiptObligationMissing = errors.New("expense ledger debit receipt obligation was not generated")

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) List(ctx context.Context, filter ExpenseListFilter) (*ExpenseListResult, error) {
	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}

	rows, total, err := s.repo.List(ctx, normalized)
	if err != nil {
		return nil, err
	}

	postings, err := s.repo.FindFinancialPostingsByExpenseIDs(ctx, expenseIDs(rows))
	if err != nil {
		return nil, err
	}

	return &ExpenseListResult{Items: ToDTOListWithFinancialPostings(rows, postings), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func expenseIDs(rows []db.Expense) []string {
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func (s *service) Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseDTO, error) {
	if err := ValidateCreateExpense(req); err != nil {
		return nil, err
	}

	expenseDate, err := parseExpenseDate(req.ExpenseDate)
	if err != nil {
		return nil, err
	}
	collaborator, err := s.validateCollaborator(ctx, req.CollaboratorID)
	if err != nil {
		return nil, err
	}

	var recreatedFromExpenseID *string
	if sourceID := strings.TrimSpace(req.RecreatedFromExpenseID); sourceID != "" {
		source, err := s.repo.FindByID(ctx, sourceID)
		if err != nil {
			return nil, err
		}
		if source.Active || source.CancelledAt == nil {
			return nil, ValidationError{Fields: map[string]string{"recreatedFromExpenseId": "Source expense must be cancelled before it can be recreated"}}
		}
		alreadyRecreated, err := s.repo.ExistsRecreationFromExpenseID(ctx, sourceID)
		if err != nil {
			return nil, err
		}
		if alreadyRecreated {
			return nil, ValidationError{Fields: map[string]string{"recreatedFromExpenseId": "Cancelled source expense has already been recreated"}}
		}
		recreatedFromExpenseID = &sourceID
	}

	now := time.Now().UTC()
	expense := &db.Expense{
		BaseModel:              db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:               tenantctx.TenantID(ctx),
		PersonID:               collaborator.Membership.PersonID,
		CollaboratorID:         strings.TrimSpace(req.CollaboratorID),
		ExpenseDate:            expenseDate,
		Description:            strings.TrimSpace(req.Description),
		Active:                 true,
		RecreatedFromExpenseID: recreatedFromExpenseID,
	}

	if usesPriceListCalculation(req.PriceListItemID, req.CurrencyCode, req.Quantity) {
		if err := s.applyPriceListCalculation(ctx, expense, req.PriceListItemID, req.CurrencyCode, req.Quantity); err != nil {
			return nil, err
		}
	} else if err := s.applyLegacyExpenseFields(ctx, expense, req.ExpenseCategoryID, req.ValueUnitID, req.Amount); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, expense); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, expense.ID)
	if err != nil {
		return nil, err
	}
	return s.expenseDTOWithPosting(ctx, *created)
}

func (s *service) CreateCanteenBatch(ctx context.Context, req CreateCanteenExpenseBatchRequest, actorUserID string) (*CreateCanteenExpenseBatchResult, error) {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", req.CollaboratorID)
	requireString(fields, "expenseDate", req.ExpenseDate)
	if strings.TrimSpace(req.ExpenseDate) != "" {
		if _, err := parseExpenseDate(req.ExpenseDate); err != nil {
			fields["expenseDate"] = "Expense date must be YYYY-MM-DD"
		}
	}
	if len(req.Items) == 0 {
		fields["items"] = "At least one Canteen item is required"
	}
	if len(req.Items) > 100 {
		fields["items"] = "No more than 100 Canteen items may be recorded at once"
	}
	if len(fields) > 0 {
		return nil, ValidationError{Fields: fields}
	}

	expenseDate, err := parseExpenseDate(req.ExpenseDate)
	if err != nil {
		return nil, err
	}
	collaborator, err := s.validateCollaborator(ctx, req.CollaboratorID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	expenses := make([]*db.Expense, 0, len(req.Items))
	for index, itemReq := range req.Items {
		if err := validatePriceListExpenseFields(
			req.CollaboratorID,
			itemReq.PriceListItemID,
			itemReq.CurrencyCode,
			itemReq.Quantity,
			req.ExpenseDate,
			"",
			"",
			0,
		); err != nil {
			return nil, prefixBatchItemValidationError(err, index)
		}

		expense := &db.Expense{
			BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:       tenantctx.TenantID(ctx),
			PersonID:       collaborator.Membership.PersonID,
			CollaboratorID: strings.TrimSpace(req.CollaboratorID),
			ExpenseDate:    expenseDate,
			Description:    strings.TrimSpace(req.Description),
			Active:         true,
		}
		if err := s.applyPriceListCalculation(ctx, expense, itemReq.PriceListItemID, itemReq.CurrencyCode, itemReq.Quantity); err != nil {
			return nil, prefixBatchItemValidationError(err, index)
		}
		if expense.ItemType != itemTypeCanteen {
			return nil, ValidationError{Fields: map[string]string{
				batchItemField(index, "priceListItemId"): "Only active Canteen price-list items may be recorded in a Canteen batch",
			}}
		}
		expenses = append(expenses, expense)
	}

	if err := s.repo.CreateBatch(ctx, expenses); err != nil {
		return nil, err
	}

	result := &CreateCanteenExpenseBatchResult{Items: make([]ExpenseDTO, 0, len(expenses))}
	for _, expense := range expenses {
		result.Items = append(result.Items, ToDTO(*expense))
	}
	return result, nil
}

func batchItemField(index int, field string) string {
	return "items." + strconv.Itoa(index) + "." + field
}

func prefixBatchItemValidationError(err error, index int) error {
	var validationErr ValidationError
	if !errors.As(err, &validationErr) {
		return err
	}
	fields := make(map[string]string, len(validationErr.Fields))
	for field, message := range validationErr.Fields {
		switch field {
		case "collaboratorId", "expenseDate":
			fields[field] = message
		default:
			fields[batchItemField(index, field)] = message
		}
	}
	return ValidationError{Fields: fields}
}

func (s *service) GetByID(ctx context.Context, id string) (*ExpenseDTO, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return s.expenseDTOWithPosting(ctx, *row)
}

func (s *service) Update(ctx context.Context, id string, req UpdateExpenseRequest, actorUserID string) (*ExpenseDTO, error) {
	if err := ValidateUpdateExpense(req); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive expenses cannot be updated"}}
	}

	expenseDate, err := parseExpenseDate(req.ExpenseDate)
	if err != nil {
		return nil, err
	}

	collaborator, err := s.validateCollaborator(ctx, req.CollaboratorID)
	if err != nil {
		return nil, err
	}

	existing.PersonID = collaborator.Membership.PersonID
	existing.CollaboratorID = strings.TrimSpace(req.CollaboratorID)
	existing.ExpenseDate = expenseDate
	existing.Description = strings.TrimSpace(req.Description)
	existing.UpdatedAt = time.Now().UTC()
	clearPriceListCalculation(existing)

	if usesPriceListCalculation(req.PriceListItemID, req.CurrencyCode, req.Quantity) {
		if err := s.applyPriceListCalculation(ctx, existing, req.PriceListItemID, req.CurrencyCode, req.Quantity); err != nil {
			return nil, err
		}
	} else if err := s.applyLegacyExpenseFields(ctx, existing, req.ExpenseCategoryID, req.ValueUnitID, req.Amount); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return s.expenseDTOWithPosting(ctx, *updated)
}

func (s *service) Cancel(ctx context.Context, id string, req CancelExpenseRequest, actorUserID string) (*ExpenseDTO, error) {
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		return nil, ValidationError{Fields: map[string]string{"reason": "Cancellation reason is required"}}
	}

	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		if existing.CancelledAt != nil {
			return s.expenseDTOWithPosting(ctx, *existing)
		}
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive expense cannot be cancelled"}}
	}

	now := time.Now().UTC()
	existing.Active = false
	existing.CancelledAt = &now
	existing.CancelledBy = strings.TrimSpace(actorUserID)
	existing.CancellationReason = reason
	existing.UpdatedAt = now
	if err := s.repo.Cancel(ctx, existing, actorUserID, reason); err != nil {
		return nil, err
	}

	cancelled, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return s.expenseDTOWithPosting(ctx, *cancelled)
}

func (s *service) Deactivate(ctx context.Context, id string, actorUserID string) (*ExpenseDTO, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return ptr(ToDTO(*existing)), nil
	}
	existing.Active = false
	existing.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return s.expenseDTOWithPosting(ctx, *updated)
}

func (s *service) Delete(ctx context.Context, id string, actorUserID string) error {
	_, err := s.Deactivate(ctx, id, actorUserID)
	return err
}

func (s *service) expenseDTOWithPosting(ctx context.Context, expense db.Expense) (*ExpenseDTO, error) {
	posting, err := s.repo.FindFinancialPostingByExpenseID(ctx, expense.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ptr(ToDTO(expense)), nil
		}
		return nil, err
	}
	return ptr(ToDTOWithFinancialPosting(expense, posting)), nil
}

func (s *service) applyLegacyExpenseFields(ctx context.Context, expense *db.Expense, expenseCategoryID string, valueUnitID string, amount float64) error {
	category, err := s.findActiveReference(ctx, "expenseCategoryId", expenseCategoryID, "expense_category", "Expense category must be active reference data of type expense_category")
	if err != nil {
		return err
	}
	valueUnit, err := s.findActiveReference(ctx, "valueUnitId", valueUnitID, "value_unit", "Value unit must be active reference data of type value_unit")
	if err != nil {
		return err
	}

	itemType := legacyItemTypeForCategory(category.Code)
	currency := normalizeCurrencyCode(valueUnit.Code)
	quantity := 1.0
	unitPriceAmount := amount
	totalAmount := amount
	var unitPriceBRL *float64
	if currency == CurrencyCodeBRL {
		unitPriceBRL = &amount
	}
	itemDescription := strings.TrimSpace(expense.Description)
	if itemDescription == "" {
		itemDescription = strings.TrimSpace(category.Label + " legacy expense")
	}
	details, err := legacyCalculationDetailsJSON(category, valueUnit, itemType, itemDescription, amount)
	if err != nil {
		return err
	}

	expense.ExpenseCategoryID = strings.TrimSpace(expenseCategoryID)
	expense.ValueUnitID = strings.TrimSpace(valueUnitID)
	expense.Amount = amount
	expense.PriceListItemCode = legacyPriceListItemCode(itemType)
	expense.ItemType = itemType
	expense.ItemDescription = itemDescription
	expense.Quantity = &quantity
	expense.UnitPriceBRL = unitPriceBRL
	expense.CurrencyCode = currency
	expense.UnitPriceAmount = &unitPriceAmount
	expense.TotalAmount = &totalAmount
	expense.CalculationMethod = calculationMethodLegacyDirectEntry
	expense.CalculationDetailsJSON = details
	return nil
}

func (s *service) applyPriceListCalculation(ctx context.Context, expense *db.Expense, priceListItemID string, currencyCode string, quantity float64) error {
	item, err := s.repo.FindActivePriceListItemByID(ctx, strings.TrimSpace(priceListItemID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ValidationError{Fields: map[string]string{"priceListItemId": "Price list item must be active"}}
		}
		return err
	}

	categoryCode := "ADMINISTRATIVE"
	if item.ItemType == itemTypeCanteen {
		categoryCode = "CANTEEN"
	}
	category, err := s.repo.FindActiveReferenceByCode(ctx, "expense_category", categoryCode)
	if err != nil {
		return err
	}

	currency := normalizeCurrencyCode(currencyCode)
	valueUnitCode := "BRL"
	if currency == CurrencyCodeGoldGram {
		valueUnitCode = "GOLD_GRAM"
	}
	valueUnit, err := s.repo.FindActiveReferenceByCode(ctx, "value_unit", valueUnitCode)
	if err != nil {
		return err
	}

	unitPriceAmount := item.UnitPriceBRL
	calculationMethod := calculationMethodBRLPriceList
	var goldPriceID *string
	var goldBRLPerGram *float64
	var goldPriceDate string
	if currency == CurrencyCodeGoldGram {
		goldPrice, err := s.repo.FindLatestActiveGoldPrice(ctx)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ValidationError{Fields: map[string]string{"currencyCode": "A current gold price is required for GOLD_GRAM expenses"}}
			}
			return err
		}
		unitPriceAmount = item.UnitPriceBRL / goldPrice.BRLPerGram
		calculationMethod = calculationMethodLatestGoldConversion
		goldPriceID = &goldPrice.ID
		goldBRLPerGram = &goldPrice.BRLPerGram
		goldPriceDate = normalizeStoredGoldPriceDate(goldPrice.PriceDate)
	}

	totalAmount := unitPriceAmount * quantity
	details, err := calculationDetailsJSON(item, currency, quantity, unitPriceAmount, totalAmount, goldPriceID, goldBRLPerGram, goldPriceDate, calculationMethod)
	if err != nil {
		return err
	}

	itemID := item.ID
	unitPriceBRL := item.UnitPriceBRL
	expense.ExpenseCategoryID = category.ID
	expense.ValueUnitID = valueUnit.ID
	expense.Amount = totalAmount
	expense.PriceListItemID = &itemID
	expense.PriceListItemCode = item.Code
	expense.ItemType = item.ItemType
	expense.ItemDescription = item.Description
	expense.Quantity = &quantity
	expense.UnitPriceBRL = &unitPriceBRL
	expense.CurrencyCode = currency
	expense.GoldPriceID = goldPriceID
	expense.GoldBRLPerGram = goldBRLPerGram
	expense.GoldPriceDate = goldPriceDate
	expense.UnitPriceAmount = &unitPriceAmount
	expense.TotalAmount = &totalAmount
	expense.CalculationMethod = calculationMethod
	expense.CalculationDetailsJSON = details
	if strings.TrimSpace(expense.Description) == "" {
		expense.Description = item.Description
	}
	return nil
}

func normalizeStoredGoldPriceDate(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) >= len(dateLayout) {
		return trimmed[:len(dateLayout)]
	}
	return trimmed
}

func legacyItemTypeForCategory(categoryCode string) string {
	if normalizeItemType(categoryCode) == itemTypeCanteen {
		return itemTypeCanteen
	}
	return itemTypeAdministrative
}

func legacyPriceListItemCode(itemType string) string {
	if itemType == itemTypeCanteen {
		return "LEGACY_CANTEEN_DIRECT_ENTRY"
	}
	return "LEGACY_ADMINISTRATIVE_DIRECT_ENTRY"
}

func legacyCalculationDetailsJSON(category *db.ReferenceData, valueUnit *db.ReferenceData, itemType string, itemDescription string, amount float64) (string, error) {
	details := map[string]any{
		"calculationVersion":        1,
		"calculationMethod":         calculationMethodLegacyDirectEntry,
		"source":                    "legacy_direct_entry_api",
		"legacyExpenseCategoryId":   category.ID,
		"legacyExpenseCategoryCode": normalizeItemType(category.Code),
		"legacyExpenseCategory":     category.Label,
		"legacyValueUnitId":         valueUnit.ID,
		"currencyCode":              normalizeCurrencyCode(valueUnit.Code),
		"itemType":                  itemType,
		"itemDescription":           itemDescription,
		"quantity":                  1,
		"unitPriceAmount":           amount,
		"totalAmount":               amount,
	}
	payload, err := json.Marshal(details)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

func calculationDetailsJSON(item *db.ExpensePriceListItem, currency string, quantity float64, unitPriceAmount float64, totalAmount float64, goldPriceID *string, goldBRLPerGram *float64, goldPriceDate string, calculationMethod string) (string, error) {
	details := map[string]any{
		"priceListItemId":    item.ID,
		"itemType":           item.ItemType,
		"itemCode":           item.Code,
		"itemDescription":    item.Description,
		"unitPriceBrl":       item.UnitPriceBRL,
		"currencyCode":       currency,
		"quantity":           quantity,
		"unitPriceAmount":    unitPriceAmount,
		"totalAmount":        totalAmount,
		"calculationMethod":  calculationMethod,
		"calculationVersion": 1,
	}
	if goldPriceID != nil && goldBRLPerGram != nil {
		details["goldPriceId"] = *goldPriceID
		details["goldBrlPerGram"] = *goldBRLPerGram
		details["goldPriceDate"] = goldPriceDate
	}
	payload, err := json.Marshal(details)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

func clearPriceListCalculation(expense *db.Expense) {
	expense.PriceListItemID = nil
	expense.PriceListItemCode = ""
	expense.ItemType = ""
	expense.ItemDescription = ""
	expense.Quantity = nil
	expense.UnitPriceBRL = nil
	expense.CurrencyCode = ""
	expense.GoldPriceID = nil
	expense.GoldBRLPerGram = nil
	expense.GoldPriceDate = ""
	expense.UnitPriceAmount = nil
	expense.TotalAmount = nil
	expense.CalculationMethod = ""
	expense.CalculationDetailsJSON = ""
}

func (s *service) validateCollaborator(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	collaborator, err := s.repo.FindCollaboratorByID(ctx, strings.TrimSpace(collaboratorID))
	if err != nil {
		return nil, err
	}
	if !isActiveCollaborator(ctx, *collaborator) {
		return nil, ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must be active and open"}}
	}
	if strings.TrimSpace(collaborator.Membership.PersonID) == "" {
		return nil, ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must resolve to a Person–Tenant Membership"}}
	}
	return collaborator, nil
}

func (s *service) validateReference(ctx context.Context, field string, id string, typ string, message string) error {
	_, err := s.findActiveReference(ctx, field, id, typ, message)
	return err
}

func (s *service) findActiveReference(ctx context.Context, field string, id string, typ string, message string) (*db.ReferenceData, error) {
	row, err := s.repo.FindActiveReferenceByID(ctx, strings.TrimSpace(id), typ)
	if err == nil {
		return row, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ValidationError{Fields: map[string]string{field: message}}
	}
	return nil, err
}

func normalizeListFilter(filter ExpenseListFilter) (normalizedExpenseListFilter, error) {
	if err := ValidateListFilter(filter); err != nil {
		return normalizedExpenseListFilter{}, err
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	out := normalizedExpenseListFilter{
		CollaboratorID:     strings.TrimSpace(filter.CollaboratorID),
		CollaboratorSearch: strings.TrimSpace(filter.CollaboratorSearch),
		ExpenseCategoryID:  strings.TrimSpace(filter.ExpenseCategoryID),
		ValueUnitID:        strings.TrimSpace(filter.ValueUnitID),
		ItemType:           normalizeItemType(filter.ItemType),
		PriceListItemID:    strings.TrimSpace(filter.PriceListItemID),
		CurrencyCode:       normalizeCurrencyCode(filter.CurrencyCode),
		IncludeInactive:    filter.IncludeInactive,
		Page:               page,
		PageSize:           pageSize,
	}

	if strings.TrimSpace(filter.DateFrom) != "" {
		value, err := parseDate(filter.DateFrom)
		if err != nil {
			return normalizedExpenseListFilter{}, ValidationError{Fields: map[string]string{"dateFrom": "Date from must be YYYY-MM-DD"}}
		}
		out.DateFrom = &value
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		value, err := parseDate(filter.DateTo)
		if err != nil {
			return normalizedExpenseListFilter{}, ValidationError{Fields: map[string]string{"dateTo": "Date to must be YYYY-MM-DD"}}
		}
		out.DateTo = &value
	}
	return out, nil
}

func parseExpenseDate(value string) (time.Time, error) {
	expenseDate, err := parseDate(value)
	if err != nil {
		return time.Time{}, ValidationError{Fields: map[string]string{"expenseDate": "Expense date must be YYYY-MM-DD"}}
	}
	return expenseDate, nil
}

func isActiveCollaborator(ctx context.Context, row db.CollaboratorJourney) bool {
	if row.ClosedAt != nil {
		return false
	}
	return row.TenantID == tenantctx.TenantID(ctx) && row.Status.Type == "collaborator_status" && row.Status.Code == "ACTIVE" && row.Status.Active
}

func ptr[T any](value T) *T { return &value }
