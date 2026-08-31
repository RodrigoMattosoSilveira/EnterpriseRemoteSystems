package tenants

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

const DefaultTenantID = db.DefaultTenantID

var tenantCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{1,31}$`)

var ErrTenantInactive = errors.New("tenant is inactive")

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) List(ctx context.Context) ([]TenantDTO, error) {
	rows, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]TenantDTO, 0, len(rows))
	for _, row := range rows {
		result = append(result, mapTenant(row))
	}
	return result, nil
}

func (s *service) GetByID(ctx context.Context, id string) (*TenantDTO, error) {
	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	dto := mapTenant(*row)
	return &dto, nil
}

func (s *service) GetCurrent(ctx context.Context, tenantID string) (*TenantDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		tenantID = DefaultTenantID
	}
	return s.GetByID(ctx, tenantID)
}

func (s *service) Create(ctx context.Context, req CreateTenantRequest) (*TenantDTO, error) {
	code, name, description, fields := normalizeAndValidate(req.Code, req.Name, req.Description)
	if err := newValidationError(fields); err != nil {
		return nil, err
	}
	exists, err := s.repo.CodeExists(ctx, code, "")
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ValidationError{Fields: map[string]string{"code": "Tenant code must be unique"}}
	}

	active := true
	if req.Active != nil {
		active = *req.Active
	}
	now := time.Now().UTC()
	tenant := db.Tenant{
		BaseModel:   db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		Code:        code,
		Name:        name,
		Description: description,
		Active:      active,
	}
	if err := s.repo.Create(ctx, &tenant); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, tenant.ID)
}

func (s *service) Update(ctx context.Context, id string, req UpdateTenantRequest) (*TenantDTO, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, ValidationError{Fields: map[string]string{"id": "Tenant ID is required"}}
	}
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	code, name, description, fields := normalizeAndValidate(req.Code, req.Name, req.Description)
	if err := newValidationError(fields); err != nil {
		return nil, err
	}
	exists, err := s.repo.CodeExists(ctx, code, id)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ValidationError{Fields: map[string]string{"code": "Tenant code must be unique"}}
	}

	tenant := row.Tenant
	tenant.Code = code
	tenant.Name = name
	tenant.Description = description
	tenant.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, &tenant); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

func (s *service) SetActive(ctx context.Context, id string, active bool) (*TenantDTO, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, ValidationError{Fields: map[string]string{"id": "Tenant ID is required"}}
	}
	if err := s.repo.SetActive(ctx, id, active); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

func (s *service) ListTenantAdminCandidates(ctx context.Context, tenantID string) ([]TenantAdminCandidateDTO, error) {
	rows, err := s.repo.ListTenantAdminCandidates(ctx, strings.TrimSpace(tenantID))
	if err != nil {
		return nil, err
	}
	result := make([]TenantAdminCandidateDTO, 0, len(rows))
	for _, row := range rows {
		result = append(result, TenantAdminCandidateDTO{
			ActorID:             row.ActorID,
			ActorKey:            row.ActorKey,
			DisplayName:         row.DisplayName,
			GlobalPersonID:      row.GlobalPersonID,
			Active:              row.Active,
			Assigned:            row.Assigned,
			Eligible:            row.Eligible,
			IneligibilityReason: row.IneligibilityReason,
			TenantAdminTenantID: row.TenantAdminTenantID,
		})
	}
	return result, nil
}

func (s *service) AssignTenantAdmin(ctx context.Context, tenantID string, actorID string) (*TenantDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	actorID = strings.TrimSpace(actorID)
	fields := map[string]string{}
	if tenantID == "" {
		fields["tenantId"] = "Tenant ID is required"
	}
	if actorID == "" {
		fields["actorId"] = "Actor ID is required"
	}
	if err := newValidationError(fields); err != nil {
		return nil, err
	}
	if err := s.repo.AssignTenantAdmin(ctx, tenantID, actorID); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, tenantID)
}

func (s *service) RevokeTenantAdmin(ctx context.Context, tenantID string, actorID string) (*TenantDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	actorID = strings.TrimSpace(actorID)
	fields := map[string]string{}
	if tenantID == "" {
		fields["tenantId"] = "Tenant ID is required"
	}
	if actorID == "" {
		fields["actorId"] = "Actor ID is required"
	}
	if err := newValidationError(fields); err != nil {
		return nil, err
	}
	if err := s.repo.RevokeTenantAdmin(ctx, tenantID, actorID); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, tenantID)
}

func (s *service) RequireActive(ctx context.Context, tenantID string) error {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" || tenantID == "*" {
		return ValidationError{Fields: map[string]string{"tenantId": "A specific tenant must be selected"}}
	}
	exists, err := s.repo.ExistsByID(ctx, tenantID)
	if err != nil {
		return err
	}
	if !exists {
		return gorm.ErrRecordNotFound
	}
	active, err := s.repo.ExistsActiveByID(ctx, tenantID)
	if err != nil {
		return err
	}
	if !active {
		return ErrTenantInactive
	}
	return nil
}

func (s *service) RequireActiveDefault(ctx context.Context) error {
	return s.RequireActive(ctx, DefaultTenantID)
}

func mapTenant(row TenantRecord) TenantDTO {
	status := OperationalStatusInactive
	if row.Tenant.Active && row.TenantAdminCount > 0 {
		status = OperationalStatusActiveReady
	} else if row.Tenant.Active {
		status = OperationalStatusActiveNoAdmin
	}
	return TenantDTO{
		ID:                         row.Tenant.ID,
		Code:                       row.Tenant.Code,
		Name:                       row.Tenant.Name,
		Description:                row.Tenant.Description,
		Active:                     row.Tenant.Active,
		OperationalStatus:          status,
		TenantAdminCount:           row.TenantAdminCount,
		TenantAdminAssignmentCount: row.TenantAdminAssignmentCount,
		CreatedAt:                  row.Tenant.CreatedAt,
		UpdatedAt:                  row.Tenant.UpdatedAt,
	}
}

func normalizeAndValidate(rawCode string, rawName string, rawDescription string) (string, string, string, map[string]string) {
	code := strings.ToUpper(strings.TrimSpace(rawCode))
	name := strings.TrimSpace(rawName)
	description := strings.TrimSpace(rawDescription)
	fields := map[string]string{}
	if code == "" {
		fields["code"] = "Tenant code is required"
	} else if !tenantCodePattern.MatchString(code) {
		fields["code"] = "Use 2-32 uppercase letters, numbers, hyphens, or underscores"
	}
	if name == "" {
		fields["name"] = "Tenant name is required"
	} else if len(name) > 120 {
		fields["name"] = "Tenant name must be 120 characters or fewer"
	}
	if len(description) > 500 {
		fields["description"] = "Tenant description must be 500 characters or fewer"
	}
	return code, name, description, fields
}

func newValidationError(fields map[string]string) error {
	clean := map[string]string{}
	for field, message := range fields {
		if strings.TrimSpace(message) != "" {
			clean[field] = message
		}
	}
	if len(clean) == 0 {
		return nil
	}
	return ValidationError{Fields: clean}
}
