package referencedata

import (
	"context"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"time"
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }
func (s *service) ListByType(ctx context.Context, typ string) ([]ReferenceDataDTO, error) {
	rows, err := s.repo.ListByType(ctx, typ)
	if err != nil {
		return nil, err
	}
	out := make([]ReferenceDataDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapRef(r))
	}
	return out, nil
}
func (s *service) Create(ctx context.Context, typ string, req CreateReferenceDataRequest) (*ReferenceDataDTO, error) {
	now := time.Now().UTC()
	row := &db.ReferenceData{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: typ, Code: req.Code, Label: req.Label, Description: req.Description, Active: req.Active, SortOrder: req.SortOrder, MetadataJSON: req.MetadataJSON}
	if err := s.repo.Create(ctx, row); err != nil {
		return nil, err
	}
	dto := mapRef(*row)
	return &dto, nil
}
func mapRef(r db.ReferenceData) ReferenceDataDTO {
	return ReferenceDataDTO{ID: r.ID, TenantID: r.TenantID, Type: r.Type, Code: r.Code, Label: r.Label, Description: r.Description, Active: r.Active, SortOrder: r.SortOrder, MetadataJSON: r.MetadataJSON}
}
