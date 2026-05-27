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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com
Maria,Souza,Maria,93541134780,RG-100002,21998765432,maria@example.com,ref-person-status-active,Imported sample person,Rua B 200,,Rio de Janeiro,RJ,20040002,Brasil,Itau,341,98765-4,maria@example.com,Carlos Souza,21991234567,carlos@example.com
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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com
Maria,Souza,Maria,93541134780,RG-100002,21998765432,maria@example.com,ref-person-status-active,Imported sample person,Rua B 200,,Rio de Janeiro,RJ,20040002,Brasil,Itau,341,98765-4,maria@example.com,Carlos Souza,21991234567,carlos@example.com
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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com
Bad,Phone,BadPhone,93541134780,RG-100002,219987654,maria@example.com,ref-person-status-active,Imported sample person,Rua B 200,,Rio de Janeiro,RJ,20040002,Brasil,Itau,341,98765-4,maria@example.com,Carlos Souza,21991234567,carlos@example.com`

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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com
Maria,Souza,Maria,39053344705,RG-100002,21998765432,maria@example.com,ref-person-status-active,Imported sample person,Rua B 200,,Rio de Janeiro,RJ,20040002,Brasil,Itau,341,98765-4,maria@example.com,Carlos Souza,21991234567,carlos@example.com`

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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,Ana Silva,11991234567,ana@example.com
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
	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	if len(report.Errors) != 0 {
		t.Fatalf("expected no import errors, got %+v", report.Errors)
	}
	if report.RowsInserted != 1 {
		t.Fatalf("expected 1 inserted row, got %d", report.RowsInserted)
	}

	if len(report.Errors) != 0 {
		t.Fatalf("expected no import errors, got %+v", report.Errors)
	}

	if report.RowsRead != 1 {
		t.Fatalf("expected 1 row read, got %d", report.RowsRead)
	}

	if report.RowsValidated != 1 {
		t.Fatalf("expected 1 row validated, got %d", report.RowsValidated)
	}

	if report.RowsInserted != 1 {
		t.Fatalf("expected 1 row inserted, got %d", report.RowsInserted)
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

func TestRunImportsAddressFields(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Address,Person,Addr,52998224725,RG-ADDR01,31998765432,address-person@example.com,ref-person-status-active,Address test,Rua A 100,Apto 10,Sao Paulo,SP,01001000,Brasil,,,,,,
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	person := findPersonByEmail(t, database, "address-person@example.com")

	if person.Street1 != "Rua A 100" {
		t.Fatalf("expected Street1 %q, got %q", "Rua A 100", person.Street1)
	}
	if person.Street2 != "Apto 10" {
		t.Fatalf("expected Street2 %q, got %q", "Apto 10", person.Street2)
	}
	if person.City != "Sao Paulo" {
		t.Fatalf("expected City %q, got %q", "Sao Paulo", person.City)
	}
	if person.State != "SP" {
		t.Fatalf("expected State %q, got %q", "SP", person.State)
	}
	if person.CEP != "01001000" {
		t.Fatalf("expected CEP %q, got %q", "01001000", person.CEP)
	}
	if person.Country != "Brasil" {
		t.Fatalf("expected Country %q, got %q", "Brasil", person.Country)
	}
}

func TestRunImportsBankFields(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Bank,Person,Bank,15350946056,RG-BANK01,41998765432,bank-person@example.com,ref-person-status-active,Bank test,,,,,,Brasil,Banco do Brasil,001,12345-6,bank-person@example.com,,,
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	person := findPersonByEmail(t, database, "bank-person@example.com")

	if person.BankName != "Banco do Brasil" {
		t.Fatalf("expected BankName %q, got %q", "Banco do Brasil", person.BankName)
	}
	if person.BankNumber != "001" {
		t.Fatalf("expected BankNumber %q, got %q", "001", person.BankNumber)
	}
	if person.CheckingAccount != "12345-6" {
		t.Fatalf("expected CheckingAccount %q, got %q", "12345-6", person.CheckingAccount)
	}
}

func TestRunImportsEmergencyContactFields(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Emergency,Person,Emerg,93541134780,RG-EMERG01,61998765432,emergency-person@example.com,ref-person-status-active,Emergency test,,,,,,Brasil,,,,Ana Emergency,61991234567,ana.emergency@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	person := findPersonByEmail(t, database, "emergency-person@example.com")

	if person.EmergencyName != "Ana Emergency" {
		t.Fatalf("expected EmergencyName %q, got %q", "Ana Emergency", person.EmergencyName)
	}
	if person.EmergencyCellular != "61991234567" {
		t.Fatalf("expected EmergencyCellular %q, got %q", "61991234567", person.EmergencyCellular)
	}
	if person.EmergencyEmail != "ana.emergency@example.com" {
		t.Fatalf("expected EmergencyEmail %q, got %q", "ana.emergency@example.com", person.EmergencyEmail)
	}
}

func TestRunKeepsBlankOptionalFieldsBlankOrNull(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Blank,Optional,,39053344705,RG-BLANK01,71998765432,blank-optional@example.com,ref-person-status-active,,,,,,,,,,,,,
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	person := findPersonByEmail(t, database, "blank-optional@example.com")

	if person.Nickname != "" {
		t.Fatalf("expected blank Nickname, got %q", person.Nickname)
	}
	if person.Notes != "" {
		t.Fatalf("expected blank Notes, got %q", person.Notes)
	}
	if person.Street1 != "" {
		t.Fatalf("expected blank Street1, got %q", person.Street1)
	}
	if person.Street2 != "" {
		t.Fatalf("expected blank Street2, got %q", person.Street2)
	}
	if person.City != "" {
		t.Fatalf("expected blank City, got %q", person.City)
	}
	if person.State != "" {
		t.Fatalf("expected blank State, got %q", person.State)
	}
	if person.CEP != "" {
		t.Fatalf("expected blank CEP, got %q", person.CEP)
	}
	if person.BankName != "" {
		t.Fatalf("expected blank BankName, got %q", person.BankName)
	}
	if person.BankNumber != "" {
		t.Fatalf("expected blank BankNumber, got %q", person.BankNumber)
	}
	if person.CheckingAccount != "" {
		t.Fatalf("expected blank CheckingAccount, got %q", person.CheckingAccount)
	}
	if person.PIXKey != nil {
		t.Fatalf("expected nil PIXKey, got %q", *person.PIXKey)
	}
	if person.EmergencyName != "" {
		t.Fatalf("expected blank EmergencyName, got %q", person.EmergencyName)
	}
	if person.EmergencyCellular != "" {
		t.Fatalf("expected blank EmergencyCellular, got %q", person.EmergencyCellular)
	}
	if person.EmergencyEmail != "" {
		t.Fatalf("expected blank EmergencyEmail, got %q", person.EmergencyEmail)
	}
}

func TestRunFullRecordComputesCompletionCorrectly(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Full,Person,Full,93541134780,RG-FULL01,81998765432,full-person@example.com,ref-person-status-active,Full import,Rua Completa 123,Apto 5,Recife,PE,50010000,Brasil,Banco Full,999,88888-8,full-person@example.com,Ana Full,81991234567,ana.full@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err != nil {
		t.Fatalf("expected import to succeed, got %v with report %+v", err, report)
	}

	person := findPersonByEmail(t, database, "full-person@example.com")

	if person.ProfileCompletionStatus == "PERSONAL_ONLY" {
		t.Fatalf("expected full record not to remain PERSONAL_ONLY")
	}
	if person.ProfileCompletionStatus == "" {
		t.Fatal("expected ProfileCompletionStatus to be set")
	}
	if !person.CanCreateCollaborator {
		t.Fatal("expected full imported person to be eligible for collaborator creation")
	}
}

func TestRunRejectsMissingFullCSVHeader(t *testing.T) {
	database := newTestDB(t)

	csvData := `firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Missing,Headers,Missing,15350946056,RG-MISSING01,91998765432,missing-headers@example.com,ref-person-status-active,missing-headers@example.com
`

	report, err := importer.Run(context.Background(), database, strings.NewReader(csvData), importer.Options{})
	if err == nil {
		t.Fatalf("expected import to fail")
	}

	assertHeaderError(t, report, "notes")
	assertHeaderError(t, report, "street1")
	assertHeaderError(t, report, "street2")
	assertHeaderError(t, report, "city")
	assertHeaderError(t, report, "state")
	assertHeaderError(t, report, "cep")
	assertHeaderError(t, report, "country")
	assertHeaderError(t, report, "bankName")
	assertHeaderError(t, report, "bankNumber")
	assertHeaderError(t, report, "checkingAccount")
	assertHeaderError(t, report, "emergencyName")
	assertHeaderError(t, report, "emergencyCellular")
	assertHeaderError(t, report, "emergencyEmail")
}

func findPersonByEmail(t *testing.T, database *gorm.DB, email string) db.Person {
	t.Helper()

	var person db.Person
	if err := database.Where("email = ?", email).First(&person).Error; err != nil {
		t.Fatalf("find imported person by email %q: %v", email, err)
	}

	return person
}
