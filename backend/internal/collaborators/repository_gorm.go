package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter CollaboratorListFilter) ([]db.CollaboratorJourney, int64, error) {
	var rows []db.CollaboratorJourney
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Preload("Person").
		Preload("PaymentMethod").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Preload("Status")

	if filter.StatusID != "" {
		q = q.Where("status_id = ?", filter.StatusID)
	}
	if filter.LocationID != "" {
		q = q.Where("location_id = ?", filter.LocationID)
	}
	if filter.PaymentMethodID != "" {
		q = q.Where("payment_method_id = ?", filter.PaymentMethodID)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	err := q.Order("journey_start_date DESC, created_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, collaborator *db.CollaboratorJourney) error {
	return r.db.WithContext(ctx).Create(collaborator).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Person").
		Preload("PaymentMethod").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Preload("Status").
		First(&row, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindPersonByID(ctx context.Context, personID string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).First(&row, "id = ?", personID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND type = ? AND active = ?", id, typ, true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ExistsActiveJourneyForPerson(ctx context.Context, personID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Joins("JOIN reference_data ON reference_data.id = collaborator_journeys.status_id").
		Where("collaborator_journeys.person_id = ?", personID).
		Where("collaborator_journeys.closed_at IS NULL").
		Where("reference_data.type = ? AND reference_data.code = ? AND reference_data.active = ?", "collaborator_status", "ACTIVE", true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
