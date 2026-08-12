package referencedata

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
)

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) ListByType(ctx context.Context, tenantID string, typ string) ([]ReferenceDataDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	typ = normalizeType(typ)
	if err := validateTenantAndType(tenantID, typ); err != nil {
		return nil, err
	}

	rows, err := s.repo.ListByType(ctx, tenantID, typ)
	if err != nil {
		return nil, err
	}
	out := make([]ReferenceDataDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapRef(r))
	}
	return out, nil
}

func (s *service) Create(ctx context.Context, tenantID string, typ string, req CreateReferenceDataRequest) (*ReferenceDataDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	typ = normalizeType(typ)
	code := normalizeCode(req.Code)
	label := normalizeLabel(req.Label)
	description := strings.TrimSpace(req.Description)
	metadataJSON := strings.TrimSpace(req.MetadataJSON)
	active := true
	if req.Active != nil {
		active = *req.Active
	}

	if err := s.validateReferenceData(ctx, tenantID, typ, code, label, ""); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	row := &db.ReferenceData{
		BaseModel:    db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:     tenantID,
		Type:         typ,
		Code:         code,
		Label:        label,
		Description:  description,
		Active:       active,
		SortOrder:    req.SortOrder,
		MetadataJSON: metadataJSON,
	}
	if err := s.repo.Create(ctx, row); err != nil {
		return nil, err
	}
	dto := mapRef(*row)
	return &dto, nil
}

func (s *service) Update(ctx context.Context, tenantID string, typ string, id string, req UpdateReferenceDataRequest) (*ReferenceDataDTO, error) {
	tenantID = strings.TrimSpace(tenantID)
	typ = normalizeType(typ)
	id = strings.TrimSpace(id)
	code := normalizeCode(req.Code)
	label := normalizeLabel(req.Label)
	description := strings.TrimSpace(req.Description)
	metadataJSON := strings.TrimSpace(req.MetadataJSON)

	row, err := s.findTyped(ctx, tenantID, typ, id)
	if err != nil {
		return nil, err
	}

	if err := s.validateReferenceData(ctx, tenantID, typ, code, label, row.ID); err != nil {
		return nil, err
	}

	row.Code = code
	row.Label = label
	row.Description = description
	if req.Active != nil {
		row.Active = *req.Active
	}
	row.SortOrder = req.SortOrder
	row.MetadataJSON = metadataJSON
	row.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, row); err != nil {
		return nil, err
	}
	dto := mapRef(*row)
	return &dto, nil
}

func (s *service) Deactivate(ctx context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error) {
	return s.setActive(ctx, tenantID, typ, id, false)
}

func (s *service) Reactivate(ctx context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error) {
	return s.setActive(ctx, tenantID, typ, id, true)
}

func (s *service) setActive(ctx context.Context, tenantID string, typ string, id string, active bool) (*ReferenceDataDTO, error) {
	row, err := s.findTyped(ctx, strings.TrimSpace(tenantID), normalizeType(typ), strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	row.Active = active
	row.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, row); err != nil {
		return nil, err
	}
	dto := mapRef(*row)
	return &dto, nil
}

func (s *service) findTyped(ctx context.Context, tenantID string, typ string, id string) (*db.ReferenceData, error) {
	if err := validateTenantAndType(tenantID, typ); err != nil {
		return nil, err
	}
	row, err := s.repo.FindByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	if row.Type != typ {
		return nil, ValidationError{Fields: map[string]string{"id": "Reference data item does not belong to this type"}}
	}
	return row, nil
}

func (s *service) validateReferenceData(ctx context.Context, tenantID string, typ string, code string, label string, excludeID string) error {
	fields := map[string]string{}
	if strings.TrimSpace(tenantID) == "" {
		fields["tenantId"] = "Required"
	}
	if strings.TrimSpace(typ) == "" {
		fields["type"] = "Required"
	}
	if strings.TrimSpace(code) == "" {
		fields["code"] = "Required"
	}
	if strings.TrimSpace(label) == "" {
		fields["label"] = "Required"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}

	tenantExists, err := s.repo.ExistsActiveTenantByID(ctx, tenantID)
	if err != nil {
		return err
	}
	if !tenantExists {
		fields["tenantId"] = "Selected tenant must exist and be active"
		return ValidationError{Fields: fields}
	}

	codeExists, err := s.repo.ExistsByTenantTypeCode(ctx, tenantID, typ, code, excludeID)
	if err != nil {
		return err
	}
	if codeExists {
		fields["code"] = "Code already exists for this type"
	}

	labelExists, err := s.repo.ExistsByTenantTypeLabel(ctx, tenantID, typ, label, excludeID)
	if err != nil {
		return err
	}
	if labelExists {
		fields["label"] = "Name already exists for this type"
	}

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func validateTenantAndType(tenantID string, typ string) error {
	fields := map[string]string{}
	if strings.TrimSpace(tenantID) == "" {
		fields["tenantId"] = "Required"
	}
	if strings.TrimSpace(typ) == "" {
		fields["type"] = "Required"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func normalizeType(value string) string  { return strings.TrimSpace(value) }
func normalizeCode(value string) string  { return strings.ToUpper(strings.TrimSpace(value)) }
func normalizeLabel(value string) string { return strings.TrimSpace(value) }

func mapRef(r db.ReferenceData) ReferenceDataDTO {
	return ReferenceDataDTO{ID: r.ID, TenantID: r.TenantID, Type: r.Type, Code: r.Code, Label: r.Label, Description: r.Description, Active: r.Active, SortOrder: r.SortOrder, MetadataJSON: r.MetadataJSON}
}
