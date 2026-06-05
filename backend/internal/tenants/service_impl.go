package tenants

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

const DefaultTenantID = db.DefaultTenantID

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) GetCurrent(ctx context.Context) (*TenantDTO, error) {
	tenant, err := s.repo.FindByID(ctx, DefaultTenantID)
	if err != nil {
		return nil, err
	}
	dto := mapTenant(*tenant)
	return &dto, nil
}

func (s *service) RequireActiveDefault(ctx context.Context) error {
	exists, err := s.repo.ExistsActiveByID(ctx, DefaultTenantID)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return ValidationError{Fields: map[string]string{"tenantId": "Default tenant must exist and be active"}}
}

func mapTenant(row db.Tenant) TenantDTO {
	return TenantDTO{ID: row.ID, Code: row.Code, Name: row.Name, Description: row.Description, Active: row.Active}
}
