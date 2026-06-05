package expenses

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
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

	expenseDate, err := parseDate(req.ExpenseDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"expenseDate": "Expense date must be YYYY-MM-DD"}}
	}

	if err := s.validateCollaborator(ctx, req.CollaboratorID); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "expenseCategoryId", req.ExpenseCategoryID, "expense_category", "Expense category must be active reference data of type expense_category"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "valueUnitId", req.ValueUnitID, "value_unit", "Value unit must be active reference data of type value_unit"); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	expense := &db.Expense{
		BaseModel:         db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:          defaultTenantID,
		CollaboratorID:    strings.TrimSpace(req.CollaboratorID),
		ExpenseCategoryID: strings.TrimSpace(req.ExpenseCategoryID),
		ValueUnitID:       strings.TrimSpace(req.ValueUnitID),
		Amount:            req.Amount,
		ExpenseDate:       expenseDate,
		Description:       strings.TrimSpace(req.Description),
		Active:            true,
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

	expenseDate, err := parseDate(req.ExpenseDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"expenseDate": "Expense date must be YYYY-MM-DD"}}
	}

	if err := s.validateCollaborator(ctx, req.CollaboratorID); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "expenseCategoryId", req.ExpenseCategoryID, "expense_category", "Expense category must be active reference data of type expense_category"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "valueUnitId", req.ValueUnitID, "value_unit", "Value unit must be active reference data of type value_unit"); err != nil {
		return nil, err
	}

	existing.CollaboratorID = strings.TrimSpace(req.CollaboratorID)
	existing.ExpenseCategoryID = strings.TrimSpace(req.ExpenseCategoryID)
	existing.ValueUnitID = strings.TrimSpace(req.ValueUnitID)
	existing.Amount = req.Amount
	existing.ExpenseDate = expenseDate
	existing.Description = strings.TrimSpace(req.Description)
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

func isActiveCollaborator(row db.CollaboratorJourney) bool {
	if row.ClosedAt != nil {
		return false
	}
	return row.TenantID == defaultTenantID && row.Status.Type == "collaborator_status" && row.Status.Code == "ACTIVE" && row.Status.Active
}

func ptr[T any](value T) *T { return &value }
