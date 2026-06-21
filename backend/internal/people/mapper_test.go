package people

import (
	"testing"

	"enterpriseremotesystems/backend/internal/db"
)

func TestToDTORecomputesCompletionFromProfileFields(t *testing.T) {
	person := db.Person{
		BaseModel:               db.BaseModel{ID: "person-stale-complete"},
		TenantID:                db.DefaultTenantID,
		FirstName:               "Zelia",
		LastName:                "Gold",
		Nickname:                "Zelia Gold",
		CPF:                     "93541134780",
		RG:                      "RG-000001",
		Cellular:                "11987654321",
		Email:                   "zelia@example.com",
		Country:                 "Brasil",
		StatusID:                "ref-person-status-active",
		ProfileCompletionStatus: ProfileComplete,
		CanCreateCollaborator:   true,
	}

	dto := ToDTO(person)

	if dto.ProfileCompletionStatus != ProfilePersonalOnly {
		t.Fatalf("expected recomputed status %q, got %q", ProfilePersonalOnly, dto.ProfileCompletionStatus)
	}
	if dto.CanCreateCollaborator {
		t.Fatal("expected recomputed canCreateCollaborator to be false")
	}
	if len(dto.MissingSections) != 3 {
		t.Fatalf("expected three missing sections, got %+v", dto.MissingSections)
	}
	expected := []string{"Address", "Bank", "Emergency"}
	for i, section := range expected {
		if dto.MissingSections[i] != section {
			t.Fatalf("expected missing section %d to be %q, got %q", i, section, dto.MissingSections[i])
		}
	}
}

func TestToDTOKeepsCompleteWhenProfileFieldsAreComplete(t *testing.T) {
	pixKey := "zelia-pix@example.com"
	person := db.Person{
		BaseModel:         db.BaseModel{ID: "person-complete"},
		TenantID:          db.DefaultTenantID,
		FirstName:         "Zelia",
		LastName:          "Gold",
		Nickname:          "Zelia Gold",
		CPF:               "93541134780",
		RG:                "RG-000001",
		Cellular:          "11987654321",
		Email:             "zelia@example.com",
		Street1:           "Rua Completa 123",
		City:              "Sao Paulo",
		State:             "SP",
		CEP:               "01001000",
		Country:           "Brasil",
		BankName:          "Banco Teste",
		BankNumber:        "001",
		CheckingAccount:   "12345-6",
		PIXKey:            &pixKey,
		EmergencyName:     "Emergency Contact",
		EmergencyCellular: "11912345678",
		EmergencyEmail:    "emergency@example.com",
		StatusID:          "ref-person-status-active",
	}

	dto := ToDTO(person)

	if dto.ProfileCompletionStatus != ProfileComplete {
		t.Fatalf("expected status %q, got %q", ProfileComplete, dto.ProfileCompletionStatus)
	}
	if !dto.CanCreateCollaborator {
		t.Fatal("expected canCreateCollaborator to be true")
	}
	if len(dto.MissingSections) != 0 {
		t.Fatalf("expected no missing sections, got %+v", dto.MissingSections)
	}
}
