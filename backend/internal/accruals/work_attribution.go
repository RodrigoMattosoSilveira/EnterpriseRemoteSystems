package accruals

import (
	"fmt"
	"strings"

	"enterpriseremotesystems/backend/internal/db"
)

// performedWorkAttribution stores the effective actual work (override if
// present, otherwise informed) without changing how compensation is computed.
// Fail closed on an unresolvable or cross-Tenant reference: never post a
// plausible-looking, unverified work attribution to the financial ledger.
func performedWorkAttribution(a db.WorkPeriodAssignment, tenantID string) (db.WorkAttribution, error) {
	sectorID, sector := a.SectorID, a.Sector
	if a.ActualSectorID != nil && strings.TrimSpace(*a.ActualSectorID) != "" {
		sectorID = strings.TrimSpace(*a.ActualSectorID)
		if a.ActualSector != nil {
			sector = *a.ActualSector
		} else {
			sector = db.ReferenceData{}
		}
	}
	locationID, location := a.LocationID, a.Location
	if a.ActualLocationID != nil && strings.TrimSpace(*a.ActualLocationID) != "" {
		locationID = strings.TrimSpace(*a.ActualLocationID)
		if a.ActualLocation != nil {
			location = *a.ActualLocation
		} else {
			location = db.ReferenceData{}
		}
	}
	taskID, task := a.TaskID, a.Task
	if a.ActualTaskID != nil && strings.TrimSpace(*a.ActualTaskID) != "" {
		taskID = strings.TrimSpace(*a.ActualTaskID)
		if a.ActualTask != nil {
			task = *a.ActualTask
		} else {
			task = db.ReferenceData{}
		}
	}
	for _, ref := range []struct {
		id   string
		row  db.ReferenceData
		kind string
	}{
		{sectorID, sector, "sector"}, {locationID, location, "location"}, {taskID, task, "task"},
	} {
		if strings.TrimSpace(ref.id) == "" || ref.row.ID != ref.id || ref.row.TenantID != tenantID || ref.row.Type != ref.kind || strings.TrimSpace(ref.row.Label) == "" {
			return db.WorkAttribution{}, fmt.Errorf("cannot capture %s attribution for assignment %s in tenant %s", ref.kind, a.ID, tenantID)
		}
	}
	return db.WorkAttribution{
		WorkSectorID: sectorID, WorkSectorLabel: sector.Label,
		WorkLocationID: locationID, WorkLocationLabel: location.Label,
		WorkTaskID: taskID, WorkTaskLabel: task.Label,
	}, nil
}
