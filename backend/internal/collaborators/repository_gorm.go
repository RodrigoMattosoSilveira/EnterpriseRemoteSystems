package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/shared/textsearch"
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
		Preload("Membership.Person").
		Preload("Membership.Status").
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
	search := textsearch.Normalize(filter.Search)
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

func (r *gormRepository) ListForMembership(ctx context.Context, membershipID string) ([]db.CollaboratorJourney, error) {
	var rows []db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Where("collaborator_journeys.tenant_id = ? AND collaborator_journeys.membership_id = ?", tenantctx.TenantID(ctx), membershipID).
		Preload("Membership.Person").
		Preload("Membership.Status").
		Preload("PaymentMethod").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Preload("Status").
		Order("collaborator_journeys.journey_start_date DESC, collaborator_journeys.created_at DESC").
		Find(&rows).Error
	return rows, err
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

func applyCollaboratorSearch(q *gorm.DB, normalizedSearch string) *gorm.DB {
	const searchAlias = "collaborator_search_index"

	q = q.Joins(
		"JOIN people_search_index AS " + searchAlias +
			" ON " + searchAlias + ".membership_id = collaborator_journeys.membership_id" +
			" AND " + searchAlias + ".tenant_id = collaborator_journeys.tenant_id",
	)

	pattern := "%" + textsearch.EscapeLIKE(normalizedSearch) + "%"
	return q.Where(searchAlias+".search_text LIKE ? ESCAPE '\\'", pattern)
}

func (r *gormRepository) ListCandidateMemberships(ctx context.Context) ([]db.PersonTenantMembership, error) {
	var rows []db.PersonTenantMembership
	tenantID := tenantctx.TenantID(ctx)
	err := r.db.WithContext(ctx).
		Model(&db.PersonTenantMembership{}).
		Joins(`JOIN reference_data AS membership_status
			ON membership_status.id = person_tenant_memberships.status_id
			AND membership_status.tenant_id = person_tenant_memberships.tenant_id
			AND membership_status.type = 'person_status'
			AND membership_status.code = 'ACTIVE'
			AND membership_status.active = 1`).
		Joins(`JOIN global_people AS collaborator_candidate_person
			ON collaborator_candidate_person.id = person_tenant_memberships.person_id
			AND collaborator_candidate_person.can_create_collaborator = 1`).
		Where("person_tenant_memberships.tenant_id = ?", tenantID).
		Where(`NOT EXISTS (
			SELECT 1
			FROM collaborator_journeys
			WHERE collaborator_journeys.tenant_id = person_tenant_memberships.tenant_id
			  AND collaborator_journeys.membership_id = person_tenant_memberships.id
			  AND collaborator_journeys.closed_at IS NULL
		)`).
		Preload("Person").
		Preload("Status").
		Order("collaborator_candidate_person.last_name ASC, collaborator_candidate_person.first_name ASC").
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

func (r *gormRepository) UpdateWorkAssignment(ctx context.Context, collaborator *db.CollaboratorJourney) error {
	return r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("id = ? AND tenant_id = ?", collaborator.ID, tenantctx.TenantID(ctx)).
		Updates(map[string]any{
			"updated_at":  collaborator.UpdatedAt,
			"sector_id":   collaborator.SectorID,
			"location_id": collaborator.LocationID,
			"task_id":     collaborator.TaskID,
		}).Error
}

func (r *gormRepository) UpdateExtension(ctx context.Context, collaborator *db.CollaboratorJourney) error {
	result := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("id = ? AND tenant_id = ? AND closed_at IS NULL", collaborator.ID, tenantctx.TenantID(ctx)).
		Updates(map[string]any{
			"updated_at":         collaborator.UpdatedAt,
			"extension_days":     collaborator.ExtensionDays,
			"projected_end_date": collaborator.ProjectedEndDate,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Membership.Person").
		Preload("Membership.Status").
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

func (r *gormRepository) FindByIDForMembership(ctx context.Context, id string, membershipID string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Membership.Person").
		Preload("Membership.Status").
		Preload("PaymentMethod").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Preload("Status").
		First(&row, "id = ? AND tenant_id = ? AND membership_id = ?", id, tenantctx.TenantID(ctx), membershipID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActiveMembershipByID(ctx context.Context, membershipID string) (*db.PersonTenantMembership, error) {
	var row db.PersonTenantMembership
	tenantID := tenantctx.TenantID(ctx)
	err := r.db.WithContext(ctx).
		Joins(`JOIN reference_data AS membership_status
			ON membership_status.id = person_tenant_memberships.status_id
			AND membership_status.tenant_id = person_tenant_memberships.tenant_id
			AND membership_status.type = 'person_status'
			AND membership_status.code = 'ACTIVE'
			AND membership_status.active = 1`).
		Preload("Person").
		Preload("Status").
		First(&row, "person_tenant_memberships.id = ? AND person_tenant_memberships.tenant_id = ?", membershipID, tenantID).Error
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

func (r *gormRepository) ExistsOpenJourneyForMembership(ctx context.Context, membershipID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("tenant_id = ? AND membership_id = ? AND closed_at IS NULL", tenantctx.TenantID(ctx), membershipID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) LoadWorkCreditEvidence(ctx context.Context, journeyID string, membershipID string) (*WorkCreditEvidenceRecord, error) {
	journey, err := r.FindByIDForMembership(ctx, journeyID, membershipID)
	if err != nil {
		return nil, err
	}

	tenantID := tenantctx.TenantID(ctx)
	var workRows []WorkCreditWorkRow
	if err := r.db.WithContext(ctx).
		Table("work_period_assignments AS wpa").
		Select(`wpa.id AS assignment_id,
			wpa.work_period_id AS work_period_id,
			date(wp.work_date) AS work_date,
			wp.period_code AS period_code,
			wp.name AS work_period_name,
			wp.status AS work_period_status,
			wpa.planned_status AS planned_status,
			COALESCE(wpa.actual_status, '') AS actual_status,
			wpa.sector_id AS sector_id,
			COALESCE(sector.label, '') AS sector_label,
			wpa.location_id AS location_id,
			COALESCE(location.label, '') AS location_label,
			wpa.task_id AS task_id,
			COALESCE(task.label, '') AS task_label,
			COUNT(gp.id) AS production_entries,
			COALESCE(SUM(gp.gold_grams_produced), 0) AS gold_grams_produced`).
		Joins("JOIN work_periods AS wp ON wp.id = wpa.work_period_id AND wp.tenant_id = wpa.tenant_id").
		Joins("JOIN collaborator_journeys AS cj ON cj.id = wpa.collaborator_id AND cj.tenant_id = wpa.tenant_id").
		Joins("JOIN reference_data AS payment_method ON payment_method.id = cj.payment_method_id AND payment_method.tenant_id = cj.tenant_id AND payment_method.type = ?", "method").
		Joins("LEFT JOIN reference_data AS sector ON sector.id = wpa.sector_id AND sector.tenant_id = wpa.tenant_id").
		Joins("LEFT JOIN reference_data AS location ON location.id = wpa.location_id AND location.tenant_id = wpa.tenant_id").
		Joins("LEFT JOIN reference_data AS task ON task.id = wpa.task_id AND task.tenant_id = wpa.tenant_id").
		Joins("LEFT JOIN gold_production_entries AS gp ON gp.tenant_id = wpa.tenant_id AND gp.work_period_id = wpa.work_period_id AND gp.location_id = wpa.location_id AND gp.active = ? AND payment_method.code = ?", true, "COMMISSION").
		Where("wpa.tenant_id = ? AND wpa.collaborator_id = ? AND wpa.active = ? AND wpa.actual_status IS NOT NULL", tenantID, journeyID, true).
		Group(`wpa.id, wpa.work_period_id, wp.work_date, wp.period_code, wp.name, wp.status,
			wpa.planned_status, wpa.actual_status, wpa.sector_id, sector.label,
			wpa.location_id, location.label, wpa.task_id, task.label`).
		Order("wp.work_date DESC, wp.starts_at ASC, wpa.created_at DESC").
		Scan(&workRows).Error; err != nil {
		return nil, err
	}

	var accrualRows []WorkCreditAccrualRow
	if err := r.db.WithContext(ctx).
		Table("accrual_items AS ai").
		Select(`ai.id AS id,
			ai.accrual_run_id AS accrual_run_id,
			ar.status AS accrual_run_status,
			date(ar.accrual_date) AS accrual_date,
			ai.work_period_id AS work_period_id,
			date(wp.work_date) AS work_date,
			COALESCE(ai.work_period_assignment_id, '') AS work_period_assignment_id,
			ai.calculation_type AS calculation_type,
			ai.direction AS direction,
			ai.brl_amount AS brl_amount,
			ai.gold_gram_amount AS gold_gram_amount,
			ai.status AS status,
			ai.pending_reason AS pending_reason,
			ai.description AS description`).
		Joins("JOIN accrual_runs AS ar ON ar.id = ai.accrual_run_id AND ar.tenant_id = ai.tenant_id").
		Joins("JOIN work_periods AS wp ON wp.id = ai.work_period_id AND wp.tenant_id = ai.tenant_id").
		Where("ai.tenant_id = ? AND ai.collaborator_id = ?", tenantID, journeyID).
		Order("wp.work_date DESC, ar.created_at DESC, ai.created_at DESC").
		Scan(&accrualRows).Error; err != nil {
		return nil, err
	}

	var ledgerRows []db.LedgerEntry
	if err := r.db.WithContext(ctx).
		Where("ledger_entries.tenant_id = ? AND ledger_entries.collaborator_id = ?", tenantID, journeyID).
		Preload("ValueUnit").
		Preload("Receipt").
		Order("ledger_entries.effective_date DESC, ledger_entries.created_at DESC").
		Find(&ledgerRows).Error; err != nil {
		return nil, err
	}

	return &WorkCreditEvidenceRecord{
		Journey:            *journey,
		WorkRecognized:     workRows,
		EarningsCalculated: accrualRows,
		AccountPostings:    ledgerRows,
	}, nil
}
