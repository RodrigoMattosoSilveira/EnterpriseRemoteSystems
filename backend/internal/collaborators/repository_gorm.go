package collaborators

import (
	"context"
	"strings"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter CollaboratorListFilter) ([]db.CollaboratorJourney, int64, error) {
	var rows []db.CollaboratorJourney
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("collaborator_journeys.tenant_id = ?", tenantctx.TenantID(ctx)).
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
		q = applyCollaboratorSearch(q, search)
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

var collaboratorSearchReplacementPairs = []string{
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c",
}

var collaboratorSearchReplacer = strings.NewReplacer(collaboratorSearchReplacementPairs...)

var collaboratorSearchLIKEReplacer = strings.NewReplacer(
	`\`, `\\`,
	`%`, `\%`,
	`_`, `\_`,
)

func normalizeCollaboratorSearch(value string) string {
	return collaboratorSearchReplacer.Replace(strings.ToLower(strings.TrimSpace(value)))
}

func applyCollaboratorSearch(q *gorm.DB, normalizedSearch string) *gorm.DB {
	const personAlias = "collaborator_search_person"

	q = q.Joins(
		"JOIN people AS " + personAlias +
			" ON " + personAlias + ".id = collaborator_journeys.person_id" +
			" AND " + personAlias + ".tenant_id = collaborator_journeys.tenant_id",
	)

	fields := []string{
		personAlias + ".first_name",
		personAlias + ".last_name",
		personAlias + ".nickname",
		"TRIM(COALESCE(" + personAlias + ".first_name, '') || ' ' || COALESCE(" + personAlias + ".last_name, ''))",
	}

	conditions := make([]string, 0, len(fields))
	args := make([]any, 0, len(fields))
	pattern := "%" + collaboratorSearchLIKEReplacer.Replace(normalizedSearch) + "%"
	for _, field := range fields {
		conditions = append(conditions, normalizeCollaboratorSearchSQL(field)+" LIKE ? ESCAPE '\\'")
		args = append(args, pattern)
	}

	return q.Where("("+strings.Join(conditions, " OR ")+")", args...)
}

func normalizeCollaboratorSearchSQL(expression string) string {
	normalized := "LOWER(COALESCE(" + expression + ", ''))"
	for i := 0; i < len(collaboratorSearchReplacementPairs); i += 2 {
		from := collaboratorSearchReplacementPairs[i]
		to := collaboratorSearchReplacementPairs[i+1]
		normalized = "REPLACE(" + normalized + ", '" + from + "', '" + to + "')"

		upper := strings.ToUpper(from)
		if upper != from {
			normalized = "REPLACE(" + normalized + ", '" + upper + "', '" + to + "')"
		}
	}
	return normalized
}

func (r *gormRepository) ListCandidatePeople(ctx context.Context) ([]db.Person, error) {
	var rows []db.Person
	err := r.db.WithContext(ctx).
		Model(&db.Person{}).
		Where("people.tenant_id = ?", tenantctx.TenantID(ctx)).
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
		Where("id = ? AND tenant_id = ?", collaborator.ID, tenantctx.TenantID(ctx)).
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
		First(&row, "id = ? AND tenant_id = ?", id, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindPersonByID(ctx context.Context, personID string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", personID, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActiveReference(ctx context.Context, id string, typ string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).
		First(&row, "id = ? AND tenant_id = ? AND type = ? AND active = ?", id, tenantctx.TenantID(ctx), typ, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", id, tenantctx.TenantID(ctx), typ, true).
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
		Where("collaborator_journeys.tenant_id = ? AND collaborator_journeys.person_id = ?", tenantctx.TenantID(ctx), personID).
		Where("collaborator_journeys.closed_at IS NULL").
		Where("reference_data.tenant_id = ? AND reference_data.type = ? AND reference_data.code = ? AND reference_data.active = ?", tenantctx.TenantID(ctx), "collaborator_status", "ACTIVE", true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
