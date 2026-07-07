package workperiodassignments

import (
	"context"
	"errors"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedWorkPeriodAssignmentListFilter) ([]db.WorkPeriodAssignment, int64, error) {
	var rows []db.WorkPeriodAssignment
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.WorkPeriodAssignment{}).
		Where("tenant_id = ? AND work_period_id = ?", defaultTenantID, workPeriodID).
		Preload("Collaborator.Person").
		Preload("Sector").
		Preload("Location").
		Preload("Task")

	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	if filter.PlannedStatus != "" {
		q = q.Where("planned_status = ?", filter.PlannedStatus)
	}
	if filter.ActualStatus != "" {
		q = q.Where("actual_status = ?", filter.ActualStatus)
	}
	if filter.CollaboratorID != "" {
		q = q.Where("collaborator_id = ?", filter.CollaboratorID)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("planned_status ASC, created_at ASC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) ListActiveAssignmentsForWorkPeriod(ctx context.Context, workPeriodID string) ([]db.WorkPeriodAssignment, error) {
	var rows []db.WorkPeriodAssignment
	err := r.db.WithContext(ctx).
		Model(&db.WorkPeriodAssignment{}).
		Where("tenant_id = ? AND work_period_id = ? AND active = ?", defaultTenantID, workPeriodID, true).
		Preload("Collaborator.Person").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Order("created_at ASC").
		Find(&rows).Error
	return rows, err
}

func (r *gormRepository) ListActiveCollaboratorsForPlanning(ctx context.Context, workDate time.Time) ([]db.CollaboratorJourney, error) {
	var rows []db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Joins("JOIN people ON people.id = collaborator_journeys.person_id").
		Joins("JOIN reference_data statuses ON statuses.id = collaborator_journeys.status_id").
		Where("collaborator_journeys.tenant_id = ? AND collaborator_journeys.closed_at IS NULL", defaultTenantID).
		Where("date(collaborator_journeys.journey_start_date) <= ?", formatDateForPlanningQuery(workDate)).
		Where("date(collaborator_journeys.projected_end_date) >= ?", formatDateForPlanningQuery(workDate)).
		Where("statuses.tenant_id = ? AND statuses.type = ? AND statuses.code = ? AND statuses.active = ?", defaultTenantID, "collaborator_status", "ACTIVE", true).
		Preload("Person").
		Preload("Status").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Order("LOWER(people.nickname) ASC, LOWER(people.first_name) ASC, LOWER(people.last_name) ASC").
		Find(&rows).Error
	return rows, err
}

func formatDateForPlanningQuery(value time.Time) string {
	return value.Format("2006-01-02")
}

func (r *gormRepository) FindMostRecentPriorWorkPeriodByCode(ctx context.Context, workPeriod db.WorkPeriod) (*db.WorkPeriod, error) {
	var row db.WorkPeriod
	err := r.db.WithContext(ctx).
		Model(&db.WorkPeriod{}).
		Where("tenant_id = ? AND id <> ? AND period_code = ? AND work_date < ?", defaultTenantID, workPeriod.ID, workPeriod.PeriodCode, workPeriod.WorkDate).
		Order("work_date DESC, starts_at DESC, created_at DESC").
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) Create(ctx context.Context, assignment *db.WorkPeriodAssignment) error {
	return r.db.WithContext(ctx).Create(assignment).Error
}

func (r *gormRepository) Update(ctx context.Context, assignment *db.WorkPeriodAssignment) error {
	return r.db.WithContext(ctx).
		Model(&db.WorkPeriodAssignment{}).
		Where("id = ? AND tenant_id = ?", assignment.ID, defaultTenantID).
		Updates(map[string]any{
			"collaborator_id":               assignment.CollaboratorID,
			"planned_status":                assignment.PlannedStatus,
			"planning_availability":         normalizePlanningAvailability(assignment.PlanningAvailability),
			"actual_status":                 assignment.ActualStatus,
			"replacement_for_assignment_id": assignment.ReplacementForAssignmentID,
			"sector_id":                     assignment.SectorID,
			"location_id":                   assignment.LocationID,
			"task_id":                       assignment.TaskID,
			"active":                        assignment.Active,
			"updated_at":                    assignment.UpdatedAt,
		}).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error) {
	var row db.WorkPeriodAssignment
	err := r.db.WithContext(ctx).
		Preload("WorkPeriod").
		Preload("Collaborator.Person").
		Preload("Collaborator.Status").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error) {
	var row db.WorkPeriod
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindCollaboratorByID(ctx context.Context, id string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Person").
		Preload("Status").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindReferenceByID(ctx context.Context, id string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) UpdateCollaboratorPlanningDefaults(ctx context.Context, collaboratorID string, sectorID string, locationID string, taskID string) error {
	return r.db.WithContext(ctx).
		Model(&db.CollaboratorJourney{}).
		Where("id = ? AND tenant_id = ?", collaboratorID, defaultTenantID).
		Updates(map[string]any{
			"sector_id":   sectorID,
			"location_id": locationID,
			"task_id":     taskID,
			"updated_at":  gorm.Expr("CURRENT_TIMESTAMP"),
		}).Error
}

func (r *gormRepository) FindReplacementAssignmentByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error) {
	var row db.WorkPeriodAssignment
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ? AND active = ?", id, defaultTenantID, true).Error
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

func (r *gormRepository) ExistsActiveAssignmentForCollaborator(ctx context.Context, workPeriodID string, collaboratorID string, excludeID string) (bool, error) {
	var count int64
	q := r.db.WithContext(ctx).
		Model(&db.WorkPeriodAssignment{}).
		Where("tenant_id = ? AND work_period_id = ? AND collaborator_id = ? AND active = ?", defaultTenantID, workPeriodID, collaboratorID, true)
	if excludeID != "" {
		q = q.Where("id <> ?", excludeID)
	}
	err := q.Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
