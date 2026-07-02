package collaborators

import (
	"context"
	"strings"

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
		Where("collaborator_journeys.tenant_id = ?", defaultTenantID).
		Where("collaborator_journeys.closed_at IS NULL").
		Preload("Person").
		Preload("PaymentMethod").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Preload("Status")

	if search := strings.TrimSpace(filter.Search); search != "" {
		like := strings.ToLower(search) + "%"
		q = q.Joins("JOIN people ON people.id = collaborator_journeys.person_id AND people.tenant_id = collaborator_journeys.tenant_id").
			Where(`(
				LOWER(COALESCE(people.first_name, '')) LIKE ? OR
				LOWER(COALESCE(people.last_name, '')) LIKE ? OR
				LOWER(COALESCE(people.nickname, '')) LIKE ? OR
				LOWER(TRIM(COALESCE(people.first_name, '') || ' ' || COALESCE(people.last_name, ''))) LIKE ?
			)`, like, like, like, like)
	}
	if filter.StatusID != "" {
		q = q.Where("collaborator_journeys.status_id = ?", filter.StatusID)
	}
	if filter.LocationID != "" {
		q = q.Where("collaborator_journeys.location_id = ?", filter.LocationID)
	}
	if filter.PaymentMethodID != "" {
		q = q.Where("collaborator_journeys.payment_method_id = ?", filter.PaymentMethodID)
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

	err := q.Order("collaborator_journeys.journey_start_date DESC, collaborator_journeys.created_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, collaborator *db.CollaboratorJourney) error {
	return r.db.WithContext(ctx).Create(collaborator).Error
}

func (r *gormRepository) Update(ctx context.Context, collaborator *db.CollaboratorJourney) error {
	return r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("id = ? AND tenant_id = ?", collaborator.ID, defaultTenantID).
		Updates(map[string]any{
			"updated_at":                          collaborator.UpdatedAt,
			"extension_days":                      collaborator.ExtensionDays,
			"projected_end_date":                  collaborator.ProjectedEndDate,
			"payment_method_id":                   collaborator.PaymentMethodID,
			"payment_value":                       collaborator.PaymentValue,
			"fixed_monthly_brl_amount":            collaborator.FixedMonthlyBRLAmount,
			"daily_brl_amount":                    collaborator.DailyBRLAmount,
			"gold_commission_percent":             collaborator.GoldCommissionPercent,
			"time_off_gold_split_percent":         collaborator.TimeOffGoldSplitPercent,
			"sick_day_off_replacement_gold_grams": collaborator.SickDayOffReplacementGoldGrams,
			"sector_id":                           collaborator.SectorID,
			"location_id":                         collaborator.LocationID,
			"task_id":                             collaborator.TaskID,
		}).Error
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
		First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindPersonByID(ctx context.Context, personID string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", personID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActiveReference(ctx context.Context, id string, typ string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND type = ? AND active = ?", id, defaultTenantID, typ, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", id, defaultTenantID, typ, true).
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
		Where("collaborator_journeys.tenant_id = ? AND collaborator_journeys.person_id = ?", defaultTenantID, personID).
		Where("collaborator_journeys.closed_at IS NULL").
		Where("reference_data.tenant_id = ? AND reference_data.type = ? AND reference_data.code = ? AND reference_data.active = ?", defaultTenantID, "collaborator_status", "ACTIVE", true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
