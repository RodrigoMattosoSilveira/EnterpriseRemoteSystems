package collaborators

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

func (s *service) List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error) {
	rows, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	return ToDTOList(rows), total, nil
}

func (s *service) Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error) {
	if err := ValidateCreateCollaborator(req); err != nil {
		return nil, err
	}

	startDate, err := parseDate(req.JourneyStartDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"journeyStartDate": "Journey start date must be YYYY-MM-DD"}}
	}

	person, err := s.repo.FindPersonByID(ctx, strings.TrimSpace(req.PersonID))
	if err != nil {
		return nil, err
	}
	if !person.CanCreateCollaborator {
		return nil, ValidationError{Fields: map[string]string{"personId": "Person profile must be complete before creating a collaborator"}}
	}

	activeExists, err := s.repo.ExistsActiveJourneyForPerson(ctx, person.ID)
	if err != nil {
		return nil, err
	}
	if activeExists {
		return nil, ValidationError{Fields: map[string]string{"personId": "Person already has an active collaborator journey"}}
	}

	if err := s.validateReference(ctx, "paymentMethodId", req.PaymentMethodID, "method", "Payment method must be active reference data of type method"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "sectorId", req.SectorID, "sector", "Sector must be active reference data of type sector"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "locationId", req.LocationID, "location", "Location must be active reference data of type location"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "taskId", req.TaskID, "task", "Task must be active reference data of type task"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "statusId", req.StatusID, "collaborator_status", "Status must be active reference data of type collaborator_status"); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	defaultEnd := startDate.AddDate(0, 0, 90)

	collaborator := &db.CollaboratorJourney{
		BaseModel:        db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:         defaultTenantID,
		PersonID:         strings.TrimSpace(req.PersonID),
		JourneyStartDate: startDate,
		DefaultEndDate:   defaultEnd,
		ExtensionDays:    0,
		ProjectedEndDate: defaultEnd,
		PaymentMethodID:  strings.TrimSpace(req.PaymentMethodID),
		PaymentValue:     req.PaymentValue,
		SectorID:         strings.TrimSpace(req.SectorID),
		LocationID:       strings.TrimSpace(req.LocationID),
		TaskID:           strings.TrimSpace(req.TaskID),
		StatusID:         strings.TrimSpace(req.StatusID),
		Notes:            strings.TrimSpace(req.Notes),
	}

	if err := s.repo.Create(ctx, collaborator); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, collaborator.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*CollaboratorDTO, error) {
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

func ptr[T any](value T) *T { return &value }
