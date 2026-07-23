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

	if filter.StatusID != "" {
		q = q.Where("collaborator_journeys.status_id = ?", filter.StatusID)
	}
	if filter.LocationID != "" {
		q = q.Where("collaborator_journeys.location_id = ?", filter.LocationID)
	}
	if filter.PaymentMethodID != "" {
		q = q.Where("collaborator_journeys.payment_method_id = ?", filter.PaymentMethodID)
	}

	page, pageSize := normalizedPage(filter.Page, filter.PageSize)
	search := normalizeCollaboratorSearch(filter.Search)
	if search != "" {
		var candidates []db.CollaboratorJourney
		if err := q.
			Order("collaborator_journeys.created_at DESC, collaborator_journeys.journey_start_date DESC").
			Find(&candidates).Error; err != nil {
			return nil, 0, err
		}

		filtered := make([]db.CollaboratorJourney, 0, len(candidates))
		for _, candidate := range candidates {
			if collaboratorMatchesSearch(candidate, search) {
				filtered = append(filtered, candidate)
			}
		}

		total = int64(len(filtered))
		start := (page - 1) * pageSize
		if start >= len(filtered) {
			return []db.CollaboratorJourney{}, total, nil
		}
		end := start + pageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		return filtered[start:end], total, nil
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.
		Order("collaborator_journeys.created_at DESC, collaborator_journeys.journey_start_date DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error
	return rows, total, err
}

func normalizedPage(page, pageSize int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	return page, pageSize
}

func collaboratorMatchesSearch(row db.CollaboratorJourney, normalizedSearch string) bool {
	fullName := strings.TrimSpace(strings.Join([]string{row.Person.FirstName, row.Person.LastName}, " "))
	for _, value := range []string{
		row.Person.FirstName,
		row.Person.LastName,
		row.Person.Nickname,
		fullName,
	} {
		if strings.Contains(normalizeCollaboratorSearch(value), normalizedSearch) {
			return true
		}
	}
	return false
}

var collaboratorSearchReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c",
)

func normalizeCollaboratorSearch(value string) string {
	return collaboratorSearchReplacer.Replace(strings.ToLower(strings.TrimSpace(value)))
}

func (r *gormRepository) ListCandidatePeople(ctx context.Context) ([]db.Person, error) {
	var rows []db.Person
	err := r.db.WithContext(ctx).
		Model(&db.Person{}).
		Where("people.tenant_id = ?", defaultTenantID).
		Where(`NOT EXISTS (
			SELECT 1
			FROM collaborator_journeys
			WHERE collaborator_journeys.tenant_id = people.tenant_id
			  AND collaborator_journeys.person_id = people.id
			  AND collaborator_journeys.closed_at IS NULL
		)`).
		Preload("Status").
		Order("people.last_name ASC, people.first_name ASC").
		Find(&rows).Error
	return rows, err
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
			"planning_availability":               normalizePlanningAvailability(collaborator.PlanningAvailability),
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
