package workperiodassignments

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
	"enterpriseremotesystems/backend/internal/workperiods"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) ListByWorkPeriod(ctx context.Context, workPeriodID string, filter WorkPeriodAssignmentListFilter) (*WorkPeriodAssignmentListResult, error) {
	if _, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID)); err != nil {
		return nil, err
	}

	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}

	rows, total, err := s.repo.ListByWorkPeriod(ctx, strings.TrimSpace(workPeriodID), normalized)
	if err != nil {
		return nil, err
	}
	return &WorkPeriodAssignmentListResult{Items: ToDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) GetPlanningTemplate(ctx context.Context, workPeriodID string) (*WorkPeriodPlanningTemplateDTO, error) {
	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}

	collaborators, err := s.repo.ListActiveCollaboratorsForPlanning(ctx)
	if err != nil {
		return nil, err
	}
	currentAssignments, err := s.repo.ListActiveAssignmentsForWorkPeriod(ctx, workPeriod.ID)
	if err != nil {
		return nil, err
	}

	var sourceWorkPeriod *db.WorkPeriod
	var templateAssignments []db.WorkPeriodAssignment
	if len(currentAssignments) == 0 {
		sourceWorkPeriod, err = s.repo.FindMostRecentPriorWorkPeriodByCode(ctx, *workPeriod)
		if err != nil {
			return nil, err
		}
		if sourceWorkPeriod != nil {
			templateAssignments, err = s.repo.ListActiveAssignmentsForWorkPeriod(ctx, sourceWorkPeriod.ID)
			if err != nil {
				return nil, err
			}
		}
	}

	currentByCollaborator := map[string]db.WorkPeriodAssignment{}
	for _, row := range currentAssignments {
		currentByCollaborator[row.CollaboratorID] = row
	}
	templateByCollaborator := map[string]db.WorkPeriodAssignment{}
	for _, row := range templateAssignments {
		templateByCollaborator[row.CollaboratorID] = row
	}

	rows := make([]WorkPeriodPlanningTemplateRow, 0, len(collaborators))
	for _, collaborator := range collaborators {
		planningRow := WorkPeriodPlanningTemplateRow{
			CollaboratorID:       collaborator.ID,
			CollaboratorName:     collaboratorName(collaborator),
			CollaboratorNickname: collaborator.Person.Nickname,
			ProjectedEndDate:     formatDate(collaborator.ProjectedEndDate),
			PlanningAvailability: PlanningAvailabilityActive,
			SectorID:             collaborator.SectorID,
			SectorLabel:          collaborator.Sector.Label,
			LocationID:           collaborator.LocationID,
			LocationLabel:        collaborator.Location.Label,
			TaskID:               collaborator.TaskID,
			TaskLabel:            collaborator.Task.Label,
		}
		if current, ok := currentByCollaborator[collaborator.ID]; ok {
			planningRow.AssignmentID = current.ID
			planningRow.Selected = current.PlannedStatus == PlannedStatusIncluded
			planningRow.PlanningAvailability = normalizePlanningAvailability(current.PlanningAvailability)
			planningRow.SectorID = current.SectorID
			planningRow.SectorLabel = current.Sector.Label
			planningRow.LocationID = current.LocationID
			planningRow.LocationLabel = current.Location.Label
			planningRow.TaskID = current.TaskID
			planningRow.TaskLabel = current.Task.Label
		} else if template, ok := templateByCollaborator[collaborator.ID]; ok {
			planningRow.TemplateAssignmentID = template.ID
			planningRow.Selected = template.PlannedStatus == PlannedStatusIncluded
			planningRow.PlanningAvailability = normalizePlanningAvailability(template.PlanningAvailability)
			planningRow.SectorID = template.SectorID
			planningRow.SectorLabel = template.Sector.Label
			planningRow.LocationID = template.LocationID
			planningRow.LocationLabel = template.Location.Label
			planningRow.TaskID = template.TaskID
			planningRow.TaskLabel = template.Task.Label
		}
		rows = append(rows, planningRow)
	}

	result := WorkPeriodPlanningTemplateDTO{
		WorkPeriodID: workPeriod.ID,
		Rows:         rows,
	}
	if sourceWorkPeriod != nil {
		result.SourceWorkPeriodID = sourceWorkPeriod.ID
		result.SourceWorkDate = formatDate(sourceWorkPeriod.WorkDate)
		result.SourcePeriodName = sourceWorkPeriod.Name
	}
	return ptr(result), nil
}

func (s *service) BulkPlan(ctx context.Context, workPeriodID string, req BulkPlanWorkPeriodAssignmentsRequest, actorUserID string) (*BulkPlanWorkPeriodAssignmentsResult, error) {
	if err := ValidateBulkPlanWorkPeriodAssignments(req); err != nil {
		return nil, err
	}
	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(*workPeriod); err != nil {
		return nil, err
	}
	currentAssignments, err := s.repo.ListActiveAssignmentsForWorkPeriod(ctx, workPeriod.ID)
	if err != nil {
		return nil, err
	}
	currentByCollaborator := map[string]db.WorkPeriodAssignment{}
	for _, row := range currentAssignments {
		currentByCollaborator[row.CollaboratorID] = row
	}

	now := time.Now().UTC()
	savedAssignments := []db.WorkPeriodAssignment{}
	selectedCount := 0
	for _, row := range req.Rows {
		collaboratorID := strings.TrimSpace(row.CollaboratorID)
		shouldSave := row.Selected || row.AvailabilityChanged
		if !shouldSave {
			continue
		}

		plannedStatus := PlannedStatusExcluded
		if row.Selected {
			plannedStatus = PlannedStatusIncluded
			selectedCount++
		}
		planningAvailability := normalizePlanningAvailability(row.PlanningAvailability)

		collaborator, err := s.loadActiveCollaborator(ctx, collaboratorID)
		if err != nil {
			return nil, err
		}
		if err := s.validateReplacementAssignment(ctx, strings.TrimSpace(row.ReplacementForAssignmentID), ""); err != nil {
			return nil, err
		}

		existing, hasExisting := currentByCollaborator[collaboratorID]
		effectiveSectorID := effectivePlanningReferenceID(row.SectorID, existing.SectorID, collaborator.SectorID)
		effectiveLocationID := effectivePlanningReferenceID(row.LocationID, existing.LocationID, collaborator.LocationID)
		effectiveTaskID := effectivePlanningReferenceID(row.TaskID, existing.TaskID, collaborator.TaskID)

		if row.Selected {
			if err := s.validateReference(ctx, "sectorId", effectiveSectorID, "sector", "Sector must be active reference data of type sector"); err != nil {
				return nil, err
			}
			if err := s.validateReference(ctx, "locationId", effectiveLocationID, "location", "Location must be active reference data of type location"); err != nil {
				return nil, err
			}
			if err := s.validateReference(ctx, "taskId", effectiveTaskID, "task", "Task must be active reference data of type task"); err != nil {
				return nil, err
			}
		} else if err := requirePlanningReferenceFallbacks(effectiveSectorID, effectiveLocationID, effectiveTaskID); err != nil {
			return nil, err
		}

		if hasExisting {
			existing.PlannedStatus = plannedStatus
			existing.PlanningAvailability = planningAvailability
			existing.ReplacementForAssignmentID = stringPtrOrNil(row.ReplacementForAssignmentID)
			existing.SectorID = effectiveSectorID
			existing.LocationID = effectiveLocationID
			existing.TaskID = effectiveTaskID
			existing.Active = true
			existing.UpdatedAt = now
			if err := s.repo.Update(ctx, &existing); err != nil {
				return nil, err
			}
			savedAssignments = append(savedAssignments, existing)
			continue
		}

		assignment := &db.WorkPeriodAssignment{
			BaseModel:                  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:                   defaultTenantID,
			WorkPeriodID:               workPeriod.ID,
			CollaboratorID:             collaboratorID,
			PlannedStatus:              plannedStatus,
			PlanningAvailability:       planningAvailability,
			ReplacementForAssignmentID: stringPtrOrNil(row.ReplacementForAssignmentID),
			SectorID:                   effectiveSectorID,
			LocationID:                 effectiveLocationID,
			TaskID:                     effectiveTaskID,
			Active:                     true,
		}
		if err := s.repo.Create(ctx, assignment); err != nil {
			return nil, err
		}
		savedAssignments = append(savedAssignments, *assignment)
	}

	return ptr(BulkPlanWorkPeriodAssignmentsResult{
		Assignments:   ToDTOList(savedAssignments),
		SelectedCount: selectedCount,
	}), nil
}

func (s *service) RefinePlanAssignment(ctx context.Context, workPeriodID string, req PlanAssignmentRefinementRequest, actorUserID string) (*PlanAssignmentRefinementResult, error) {
	if err := ValidatePlanAssignmentRefinement(req); err != nil {
		return nil, err
	}

	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(*workPeriod); err != nil {
		return nil, err
	}

	collaboratorID := strings.TrimSpace(req.CollaboratorID)
	if err := s.validateCollaborator(ctx, collaboratorID); err != nil {
		return nil, err
	}
	sector, err := s.validateAndLoadReference(ctx, "sectorId", req.SectorID, "sector", "Sector must be active reference data of type sector")
	if err != nil {
		return nil, err
	}
	location, err := s.validateAndLoadReference(ctx, "locationId", req.LocationID, "location", "Location must be active reference data of type location")
	if err != nil {
		return nil, err
	}
	task, err := s.validateAndLoadReference(ctx, "taskId", req.TaskID, "task", "Task must be active reference data of type task")
	if err != nil {
		return nil, err
	}

	futureDefaultsUpdated := false
	if req.ApplyToFutureDefaults {
		if err := s.repo.UpdateCollaboratorPlanningDefaults(ctx, collaboratorID, strings.TrimSpace(req.SectorID), strings.TrimSpace(req.LocationID), strings.TrimSpace(req.TaskID)); err != nil {
			return nil, err
		}
		futureDefaultsUpdated = true
	}

	return ptr(PlanAssignmentRefinementResult{
		CollaboratorID:        collaboratorID,
		SectorID:              strings.TrimSpace(req.SectorID),
		SectorLabel:           sector.Label,
		LocationID:            strings.TrimSpace(req.LocationID),
		LocationLabel:         location.Label,
		TaskID:                strings.TrimSpace(req.TaskID),
		TaskLabel:             task.Label,
		ApplyToFutureDefaults: req.ApplyToFutureDefaults,
		FutureDefaultsUpdated: futureDefaultsUpdated,
	}), nil
}

func (s *service) Create(ctx context.Context, workPeriodID string, req CreateWorkPeriodAssignmentRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error) {
	if err := ValidateCreateWorkPeriodAssignment(req); err != nil {
		return nil, err
	}

	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(*workPeriod); err != nil {
		return nil, err
	}

	collaboratorID := strings.TrimSpace(req.CollaboratorID)
	if err := s.validateCollaborator(ctx, collaboratorID); err != nil {
		return nil, err
	}
	if err := s.validateAvailableForWorkPeriod(ctx, workPeriod.ID, collaboratorID, ""); err != nil {
		return nil, err
	}
	if err := s.validateReplacementAssignment(ctx, strings.TrimSpace(req.ReplacementForAssignmentID), ""); err != nil {
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

	now := time.Now().UTC()
	assignment := &db.WorkPeriodAssignment{
		BaseModel:                  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                   defaultTenantID,
		WorkPeriodID:               workPeriod.ID,
		CollaboratorID:             collaboratorID,
		PlannedStatus:              strings.ToUpper(strings.TrimSpace(req.PlannedStatus)),
		PlanningAvailability:       normalizePlanningAvailability(req.PlanningAvailability),
		ReplacementForAssignmentID: stringPtrOrNil(req.ReplacementForAssignmentID),
		SectorID:                   strings.TrimSpace(req.SectorID),
		LocationID:                 strings.TrimSpace(req.LocationID),
		TaskID:                     strings.TrimSpace(req.TaskID),
		Active:                     true,
	}

	if err := s.repo.Create(ctx, assignment); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, assignment.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*WorkPeriodAssignmentDTO, error) {
	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) Update(ctx context.Context, id string, req UpdateWorkPeriodAssignmentRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error) {
	if err := ValidateUpdateWorkPeriodAssignment(req); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive work period assignments cannot be updated"}}
	}
	if err := ensureEditableWorkPeriod(existing.WorkPeriod); err != nil {
		return nil, err
	}

	collaboratorID := strings.TrimSpace(req.CollaboratorID)
	if err := s.validateCollaborator(ctx, collaboratorID); err != nil {
		return nil, err
	}
	if err := s.validateAvailableForWorkPeriod(ctx, existing.WorkPeriodID, collaboratorID, existing.ID); err != nil {
		return nil, err
	}
	if err := s.validateReplacementAssignment(ctx, strings.TrimSpace(req.ReplacementForAssignmentID), existing.ID); err != nil {
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

	planningAvailability := normalizePlanningAvailability(req.PlanningAvailability)
	if strings.TrimSpace(req.PlanningAvailability) == "" {
		planningAvailability = normalizePlanningAvailability(existing.PlanningAvailability)
	}

	existing.CollaboratorID = collaboratorID
	existing.PlannedStatus = strings.ToUpper(strings.TrimSpace(req.PlannedStatus))
	existing.PlanningAvailability = planningAvailability
	existing.ReplacementForAssignmentID = stringPtrOrNil(req.ReplacementForAssignmentID)
	existing.SectorID = strings.TrimSpace(req.SectorID)
	existing.LocationID = strings.TrimSpace(req.LocationID)
	existing.TaskID = strings.TrimSpace(req.TaskID)
	existing.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) MarkActualOutcome(ctx context.Context, id string, req MarkActualOutcomeRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error) {
	if err := ValidateMarkActualOutcome(req); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive work period assignments cannot be updated"}}
	}
	if existing.PlannedStatus != PlannedStatusIncluded {
		return nil, ValidationError{Fields: map[string]string{"plannedStatus": "Only included assignments can receive actual outcomes"}}
	}
	if err := ensureEditableWorkPeriod(existing.WorkPeriod); err != nil {
		return nil, err
	}

	status := strings.ToUpper(strings.TrimSpace(req.ActualStatus))
	existing.ActualStatus = &status
	existing.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) Deactivate(ctx context.Context, id string, actorUserID string) (*WorkPeriodAssignmentDTO, error) {
	existing, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(existing.WorkPeriod); err != nil {
		return nil, err
	}
	if !existing.Active {
		return ptr(ToDTO(*existing)), nil
	}
	existing.Active = false
	existing.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) Delete(ctx context.Context, id string, actorUserID string) error {
	_, err := s.Deactivate(ctx, id, actorUserID)
	return err
}

func (s *service) validateCollaborator(ctx context.Context, collaboratorID string) error {
	collaborator, err := s.repo.FindCollaboratorByID(ctx, strings.TrimSpace(collaboratorID))
	if err != nil {
		return err
	}
	if !isActiveCollaborator(*collaborator) {
		return ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must be active and open"}}
	}
	return nil
}

func (s *service) validateAvailableForWorkPeriod(ctx context.Context, workPeriodID string, collaboratorID string, excludeID string) error {
	exists, err := s.repo.ExistsActiveAssignmentForCollaborator(ctx, workPeriodID, collaboratorID, excludeID)
	if err != nil {
		return err
	}
	if exists {
		return ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator already has an active assignment for this work period"}}
	}
	return nil
}

func (s *service) validateReplacementAssignment(ctx context.Context, replacementForAssignmentID string, currentAssignmentID string) error {
	if strings.TrimSpace(replacementForAssignmentID) == "" {
		return nil
	}
	if replacementForAssignmentID == currentAssignmentID {
		return ValidationError{Fields: map[string]string{"replacementForAssignmentId": "Assignment cannot replace itself"}}
	}
	if _, err := s.repo.FindReplacementAssignmentByID(ctx, strings.TrimSpace(replacementForAssignmentID)); err != nil {
		return err
	}
	return nil
}

func (s *service) validateAndLoadReference(ctx context.Context, field string, id string, typ string, message string) (*db.ReferenceData, error) {
	if err := s.validateReference(ctx, field, id, typ, message); err != nil {
		return nil, err
	}
	row, err := s.repo.FindReferenceByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	return row, nil
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

func (s *service) loadActiveCollaborator(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	if !isActiveCollaborator(*collaborator) {
		return nil, ValidationError{Fields: map[string]string{"collaboratorId": "Collaborator must be active"}}
	}
	return collaborator, nil
}

func effectivePlanningReferenceID(requested string, existing string, fallback string) string {
	if trimmed := strings.TrimSpace(requested); trimmed != "" {
		return trimmed
	}
	if trimmed := strings.TrimSpace(existing); trimmed != "" {
		return trimmed
	}
	return strings.TrimSpace(fallback)
}

func requirePlanningReferenceFallbacks(sectorID string, locationID string, taskID string) error {
	fields := map[string]string{}
	requireString(fields, "sectorId", sectorID)
	requireString(fields, "locationId", locationID)
	requireString(fields, "taskId", taskID)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func normalizeListFilter(filter WorkPeriodAssignmentListFilter) (normalizedWorkPeriodAssignmentListFilter, error) {
	if err := ValidateListFilter(filter); err != nil {
		return normalizedWorkPeriodAssignmentListFilter{}, err
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	out := normalizedWorkPeriodAssignmentListFilter{
		PlannedStatus:   strings.ToUpper(strings.TrimSpace(filter.PlannedStatus)),
		ActualStatus:    strings.ToUpper(strings.TrimSpace(filter.ActualStatus)),
		CollaboratorID:  strings.TrimSpace(filter.CollaboratorID),
		IncludeInactive: filter.IncludeInactive,
		Page:            page,
		PageSize:        pageSize,
	}
	return out, nil
}

func ensureEditableWorkPeriod(workPeriod db.WorkPeriod) error {
	if workPeriod.Status == workperiods.StatusClosed {
		return ValidationError{Fields: map[string]string{"workPeriodId": "Closed work periods cannot be changed"}}
	}
	return nil
}

func isActiveCollaborator(row db.CollaboratorJourney) bool {
	if row.ClosedAt != nil {
		return false
	}
	return row.TenantID == defaultTenantID && row.Status.Type == "collaborator_status" && row.Status.Code == "ACTIVE" && row.Status.Active
}

func stringPtrOrNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format("2006-01-02")
}

func ptr[T any](value T) *T { return &value }
