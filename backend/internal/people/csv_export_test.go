package people

import (
	"encoding/csv"
	"strings"
	"testing"
)

func TestEncodeCanonicalCSVUsesImporterContractAndExcludesEnvironmentIDs(t *testing.T) {
	data, err := EncodeCanonicalCSV([]PersonDTO{{
		ID: "global-id", GlobalPersonID: "global-id", MembershipID: "membership-id", TenantID: "tenant-a",
		FirstName: "Ana", LastName: "Silva", Nickname: "Ani", CPF: "39053344705", RG: "RG-100001",
		Cellular: "11998765432", Email: "ana@example.com", StatusID: "ref-person-status-active", Notes: "portable,note",
		Street1: "Rua A 100", Street2: "Apto 1", City: "Sao Paulo", State: "SP", CEP: "01001000", Country: "Brasil",
		BankName: "Banco do Brasil", BankNumber: "001", CheckingAccount: "12345-6", PIXKey: "ana@example.com",
		EmergencyName: "Carlos Silva", EmergencyCellular: "11991234567", EmergencyEmail: "carlos@example.com",
	}})
	if err != nil {
		t.Fatalf("encode export: %v", err)
	}
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	if err != nil {
		t.Fatalf("read export: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected header plus one row, got %d", len(rows))
	}
	headers := CanonicalCSVHeaders()
	if strings.Join(rows[0], ",") != strings.Join(headers, ",") {
		t.Fatalf("unexpected headers: %#v", rows[0])
	}
	if got, want := len(rows[1]), len(headers); got != want {
		t.Fatalf("row width %d, want %d", got, want)
	}
	exported := strings.Join(rows[1], "|")
	for _, forbidden := range []string{"global-id", "membership-id", "tenant-a"} {
		if strings.Contains(exported, forbidden) {
			t.Fatalf("export leaked environment-specific id %q", forbidden)
		}
	}
	if rows[1][8] != "portable,note" {
		t.Fatalf("CSV escaping did not preserve notes, got %q", rows[1][8])
	}
}

func TestEncodeCanonicalCSVEmptyTenantStillProducesImportableHeader(t *testing.T) {
	data, err := EncodeCanonicalCSV(nil)
	if err != nil {
		t.Fatalf("encode empty export: %v", err)
	}
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	if err != nil {
		t.Fatalf("read empty export: %v", err)
	}
	if len(rows) != 1 || strings.Join(rows[0], ",") != strings.Join(CanonicalCSVHeaders(), ",") {
		t.Fatalf("empty export must contain exactly the canonical header, got %#v", rows)
	}
}
