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

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) List(ctx context.Context, filter ExpenseListFilter) ([]ExpenseDTO, int64, error) {
	rows, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	return ToDTOList(rows), total, nil
}

func (s *service) Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseDTO, error) {
	if err := ValidateCreateExpense(req); err != nil {
		return nil, err
	}

	expenseDate, err := parseDate(req.ExpenseDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"expenseDate": "Expense date must be YYYY-MM-DD"}}
	}

	collaborator, err := s.repo.FindCollaboratorByID(ctx, strings.TrimSpace(req.CollaboratorID))
	if err != nil {
		return nil, err
	}
	if !isActiveCollaborator(*collaborator) {
		return nil, ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must be active"}}
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

func isActiveCollaborator(row db.CollaboratorJourney) bool {
	if row.ClosedAt != nil {
		return false
	}
	return row.Status.Type == "collaborator_status" && row.Status.Code == "ACTIVE" && row.Status.Active
}

func ptr[T any](value T) *T { return &value }
