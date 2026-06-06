package workperiodassignments

import (
	"context"

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
	if filter.CollaboratorID != "" {
		q = q.Where("collaborator_id = ?", filter.CollaboratorID)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("planned_status ASC, created_at ASC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
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
		Preload("Status").
		First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
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
