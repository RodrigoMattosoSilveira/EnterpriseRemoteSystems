package collaborators

import (
	"testing"

	"enterpriseremotesystems/backend/internal/db"
)

func TestToDTOExposesTenantIndependentStatusCode(t *testing.T) {
	row := db.CollaboratorJourney{
		StatusID: "tenant-generated-active-status-id",
		Status: db.ReferenceData{
			Code:  "ACTIVE",
			Label: "Active",
		},
	}

	dto := ToDTO(row)

	if dto.StatusID != "tenant-generated-active-status-id" {
		t.Fatalf("expected tenant-scoped status id, got %q", dto.StatusID)
	}
	if dto.StatusCode != "ACTIVE" {
		t.Fatalf("expected status code ACTIVE, got %q", dto.StatusCode)
	}
}
