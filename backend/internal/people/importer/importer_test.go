package importer_test

import (
	"context"
	"strings"
	"testing"

	"gorm.io/gorm"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people/importer"
)

func TestRunDryRunValidatesRowsWithoutInserting(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com,ref-person-status-active,
Maria,Souza,Maria,93541134780,RG-67890,21998765432,maria@example.com,ref-person-status-active,maria-pix@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{DryRun: true})
	if err != nil {
		t.Fatalf("expected dry-run to succeed, got %v with report %+v", err, report)
	}

	if report.RowsRead != 2 {
		t.Fatalf("expected 2 rows read, got %d", report.RowsRead)
	}
	if report.RowsValidated != 2 {
		t.Fatalf("expected 2 rows validated, got %d", report.RowsValidated)
	}
	if report.RowsInserted != 0 {
		t.Fatalf("expected 0 inserted rows during dry-run, got %d", report.RowsInserted)
	}

	var count int64
	if err := database.Model(&db.Person{}).Count(&count).Error; err != nil {
		t.Fatalf("count people: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected dry-run rollback to leave 0 people, got %d", count)
	}
}

func TestRunImportsValidRows(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com,ref-person-status-active,
Maria,Souza,Maria,93541134780,RG-67890,21998765432,maria@example.com,ref-person-status-active,maria-pix@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	if report.RowsInserted != 2 {
		t.Fatalf("expected 2 inserted rows, got %d", report.RowsInserted)
	}

	var count int64
	if err := database.Model(&db.Person{}).Count(&count).Error; err != nil {
		t.Fatalf("count people: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 people, got %d", count)
	}
}

func TestRunRollsBackWhenAnyRowIsInvalid(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com,ref-person-status-active,
Bad,Phone,BadPhone,93541134780,RG-67890,1133334444,bad-phone@example.com,ref-person-status-active,maria-pix@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err == nil {
		t.Fatalf("expected import to fail")
	}
	if len(report.Errors) != 1 {
		t.Fatalf("expected 1 row error, got %+v", report.Errors)
	}
	if report.Errors[0].Row != 3 || report.Errors[0].Field != "cellular" {
		t.Fatalf("expected row 3 cellular error, got %+v", report.Errors[0])
	}

	var count int64
	if err := database.Model(&db.Person{}).Count(&count).Error; err != nil {
		t.Fatalf("count people: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected failed import rollback to leave 0 people, got %d", count)
	}
}

func TestRunDetectsDuplicateCPFWithinCSV(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com,ref-person-status-active,
Jose,Santos,Jose,39053344705,RG-67890,21998765432,jose@example.com,ref-person-status-active,maria-pix@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err == nil {
		t.Fatalf("expected import to fail")
	}
	if len(report.Errors) == 0 {
		t.Fatalf("expected duplicate CPF row error")
	}
}

func TestRunRejectsMissingRequiredHeaders(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err == nil {
		t.Fatalf("expected import to fail")
	}

	found := false
	for _, rowErr := range report.Errors {
		if rowErr.Row == 1 && rowErr.Field == "statusId" && rowErr.Message == "missing required CSV header" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected missing statusId header error, got %+v", report.Errors)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	database, err := db.Open(t.TempDir() + "/app.db")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate test database: %v", err)
	}
	if err := db.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	return database
}

func TestRunRejectsMissingPIXKeyHeader(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId
Joao,Silva,Joao,39053344705,RG-12345,11998765432,joao@example.com,ref-person-status-active
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err == nil {
		t.Fatalf("expected import to fail")
	}

	found := false
	for _, rowErr := range report.Errors {
		if rowErr.Row == 1 && rowErr.Field == "pixKey" && rowErr.Message == "missing required CSV header" {
			found = true
		}
	}

	if !found {
		t.Fatalf("expected missing pixKey header error, got %+v", report.Errors)
	}
}

func TestRunImportsPIXKey(t *testing.T) {
	database := newTestDB(t)
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Pix,Person,Pix,52998224725,RG-PIX01,31998765432,pix-person@example.com,ref-person-status-active,pix-person@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	if report.RowsInserted != 1 {
		t.Fatalf("expected 1 inserted row, got %d", report.RowsInserted)
	}

	var person db.Person
	if err := database.Where("email = ?", "pix-person@example.com").First(&person).Error; err != nil {
		t.Fatalf("find imported person: %v", err)
	}

	if person.PIXKey == nil {
		t.Fatal("expected PIXKey to be set")
	}

	if *person.PIXKey != "pix-person@example.com" {
		t.Fatalf("expected PIXKey %q, got %q", "pix-person@example.com", *person.PIXKey)
	}
}

func assertHeaderError(t *testing.T, report importer.Report, field string) {
	t.Helper()

	for _, rowErr := range report.Errors {
		if rowErr.Row == 1 && rowErr.Field == field && rowErr.Message == "missing required CSV header" {
			return
		}
	}

	t.Fatalf("expected missing %s header error, got %+v", field, report.Errors)
}
