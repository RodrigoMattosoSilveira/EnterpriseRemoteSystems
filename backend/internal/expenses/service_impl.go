package expenses

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

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
	return &ExpenseListResult{Items: ToDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseDTO, error) {
	if err := ValidateCreateExpense(req); err != nil {
		return nil, err
	}

	expenseDate, err := parseExpenseDate(req.ExpenseDate)
	if err != nil {
		return nil, err
	}
	if err := s.validateCollaborator(ctx, req.CollaboratorID); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	expense := &db.Expense{
		BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		CollaboratorID: strings.TrimSpace(req.CollaboratorID),
		ExpenseDate:    expenseDate,
		Description:    strings.TrimSpace(req.Description),
		Active:         true,
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
	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*ExpenseDTO, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
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

	if err := s.validateCollaborator(ctx, req.CollaboratorID); err != nil {
		return nil, err
	}

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
	return ptr(ToDTO(*updated)), nil
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
	return ptr(ToDTO(*updated)), nil
}

func (s *service) Delete(ctx context.Context, id string, actorUserID string) error {
	_, err := s.Deactivate(ctx, id, actorUserID)
	return err
}

func (s *service) applyLegacyExpenseFields(ctx context.Context, expense *db.Expense, expenseCategoryID string, valueUnitID string, amount float64) error {
	if err := s.validateReference(ctx, "expenseCategoryId", expenseCategoryID, "expense_category", "Expense category must be active reference data of type expense_category"); err != nil {
		return err
	}
	if err := s.validateReference(ctx, "valueUnitId", valueUnitID, "value_unit", "Value unit must be active reference data of type value_unit"); err != nil {
		return err
	}
	expense.ExpenseCategoryID = strings.TrimSpace(expenseCategoryID)
	expense.ValueUnitID = strings.TrimSpace(valueUnitID)
	expense.Amount = amount
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
		goldPriceID = &goldPrice.ID
		goldBRLPerGram = &goldPrice.BRLPerGram
		goldPriceDate = normalizeStoredGoldPriceDate(goldPrice.PriceDate)
	}

	totalAmount := unitPriceAmount * quantity
	details, err := calculationDetailsJSON(item, currency, quantity, unitPriceAmount, totalAmount, goldPriceID, goldBRLPerGram, goldPriceDate)
	if err != nil {
		return err
	}

	itemID := item.ID
	unitPriceBRL := item.UnitPriceBRL
	expense.ExpenseCategoryID = category.ID
	expense.ValueUnitID = valueUnit.ID
	expense.Amount = totalAmount
	expense.PriceListItemID = &itemID
	expense.ItemType = item.ItemType
	expense.ItemDescription = item.Description
	expense.Quantity = &quantity
	expense.UnitPriceBRL = &unitPriceBRL
	expense.CurrencyCode = currency
	expense.GoldPriceID = goldPriceID
	expense.GoldBRLPerGram = goldBRLPerGram
	expense.UnitPriceAmount = &unitPriceAmount
	expense.TotalAmount = &totalAmount
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

func calculationDetailsJSON(item *db.ExpensePriceListItem, currency string, quantity float64, unitPriceAmount float64, totalAmount float64, goldPriceID *string, goldBRLPerGram *float64, goldPriceDate string) (string, error) {
	details := map[string]any{
		"priceListItemId": item.ID,
		"itemType":        item.ItemType,
		"itemCode":        item.Code,
		"itemDescription": item.Description,
		"unitPriceBrl":    item.UnitPriceBRL,
		"currencyCode":    currency,
		"quantity":        quantity,
		"unitPriceAmount": unitPriceAmount,
		"totalAmount":     totalAmount,
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
	expense.ItemType = ""
	expense.ItemDescription = ""
	expense.Quantity = nil
	expense.UnitPriceBRL = nil
	expense.CurrencyCode = ""
	expense.GoldPriceID = nil
	expense.GoldBRLPerGram = nil
	expense.UnitPriceAmount = nil
	expense.TotalAmount = nil
	expense.CalculationDetailsJSON = ""
}

func (s *service) validateCollaborator(ctx context.Context, collaboratorID string) error {
	collaborator, err := s.repo.FindCollaboratorByID(ctx, strings.TrimSpace(collaboratorID))
	if err != nil {
		return err
	}
	if !isActiveCollaborator(*collaborator) {
		return ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must be active and open"}}
	}
	return nil
}

func (s *service) validateReference(ctx context.Context, field string, id string, typ string, message string) error {
	exists, err := s.repo.ExistsActiveReference(ctx, strings.TrimSpace(id), typ)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return ValidationError{Fields: map[string]string{field: message}}
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
		CollaboratorID:    strings.TrimSpace(filter.CollaboratorID),
		ExpenseCategoryID: strings.TrimSpace(filter.ExpenseCategoryID),
		ValueUnitID:       strings.TrimSpace(filter.ValueUnitID),
		ItemType:          normalizeItemType(filter.ItemType),
		PriceListItemID:   strings.TrimSpace(filter.PriceListItemID),
		CurrencyCode:      normalizeCurrencyCode(filter.CurrencyCode),
		IncludeInactive:   filter.IncludeInactive,
		Page:              page,
		PageSize:          pageSize,
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

func isActiveCollaborator(row db.CollaboratorJourney) bool {
	if row.ClosedAt != nil {
		return false
	}
	return row.TenantID == defaultTenantID && row.Status.Type == "collaborator_status" && row.Status.Code == "ACTIVE" && row.Status.Active
}

func ptr[T any](value T) *T { return &value }
