package people_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

const peopleUpdateURLPrefix = "/api/v1/people/"

type apiUpdatedPersonResponse struct {
	Data struct {
		ID                      string   `json:"id"`
		TenantID                string   `json:"tenantId"`
		FirstName               string   `json:"firstName"`
		LastName                string   `json:"lastName"`
		Nickname                string   `json:"nickname"`
		CPF                     string   `json:"cpf"`
		RG                      string   `json:"rg"`
		Cellular                string   `json:"cellular"`
		Email                   string   `json:"email"`
		Street1                 string   `json:"street1"`
		Street2                 string   `json:"street2"`
		City                    string   `json:"city"`
		State                   string   `json:"state"`
		CEP                     string   `json:"cep"`
		Country                 string   `json:"country"`
		BankName                string   `json:"bankName"`
		BankNumber              string   `json:"bankNumber"`
		CheckingAccount         string   `json:"checkingAccount"`
		PIXKey                  string   `json:"pixKey"`
		EmergencyName           string   `json:"emergencyName"`
		EmergencyCellular       string   `json:"emergencyCellular"`
		EmergencyEmail          string   `json:"emergencyEmail"`
		ProfileCompletionStatus string   `json:"profileCompletionStatus"`
		CanCreateCollaborator   bool     `json:"canCreateCollaborator"`
		MissingSections         []string `json:"missingSections"`
		StatusID                string   `json:"statusId"`
		Notes                   string   `json:"notes"`
	} `json:"data"`
}

func TestUpdatePersonReturnsUpdatedPerson(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"firstName":         "Updated",
		"lastName":          "Person",
		"nickname":          "UpdatedNick",
		"cellular":          "(11) 98765-4321",
		"email":             "UPDATED@example.com",
		"street1":           "Rua Completa 123",
		"street2":           "Apto 5",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001-000",
		"country":           "Brasil",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            "updated@example.com",
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "(11) 91234-5678",
		"emergencyEmail":    "EMERGENCY@example.com",
		"notes":             "Updated notes",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiUpdatedPersonResponse
	decodeJSON(t, res, &body)

	if body.Data.ID != created.Data.ID {
		t.Fatalf("expected id %q, got %q", created.Data.ID, body.Data.ID)
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.FirstName != "Updated" {
		t.Fatalf("expected updated firstName, got %q", body.Data.FirstName)
	}
	if body.Data.Nickname != "UpdatedNick" {
		t.Fatalf("expected updated nickname, got %q", body.Data.Nickname)
	}
	if body.Data.Cellular != "11987654321" {
		t.Fatalf("expected normalized cellular %q, got %q", "11987654321", body.Data.Cellular)
	}
	if body.Data.Email != "updated@example.com" {
		t.Fatalf("expected normalized email %q, got %q", "updated@example.com", body.Data.Email)
	}
	if body.Data.CEP != "01001000" {
		t.Fatalf("expected normalized CEP %q, got %q", "01001000", body.Data.CEP)
	}
	if body.Data.EmergencyCellular != "11912345678" {
		t.Fatalf("expected normalized emergency cellular %q, got %q", "11912345678", body.Data.EmergencyCellular)
	}
	if body.Data.EmergencyEmail != "emergency@example.com" {
		t.Fatalf("expected normalized emergency email %q, got %q", "emergency@example.com", body.Data.EmergencyEmail)
	}
	if body.Data.ProfileCompletionStatus != "COMPLETE" {
		t.Fatalf("expected profile completion COMPLETE, got %q", body.Data.ProfileCompletionStatus)
	}
	if !body.Data.CanCreateCollaborator {
		t.Fatal("expected canCreateCollaborator to be true")
	}
	if len(body.Data.MissingSections) != 0 {
		t.Fatalf("expected no missing sections, got %+v", body.Data.MissingSections)
	}
}

func TestUpdatePersonAcceptsCEPWithCommonFormatting(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"street1": "Praça da Sé, 1",
		"city":    "São Paulo",
		"state":   "SP",
		"cep":     "01.001‑000",
		"country": "Brasil",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiUpdatedPersonResponse
	decodeJSON(t, res, &body)
	if body.Data.CEP != "01001000" {
		t.Fatalf("expected normalized CEP %q, got %q", "01001000", body.Data.CEP)
	}
}

func TestUpdatePersonAcceptsFiveDigitMunicipalityCEP(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"street1": "Rua Jasmin, 198",
		"state":   "Amapa",
		"city":    "Laranjal do Jari",
		"cep":     "68920",
		"country": "Brasil",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiUpdatedPersonResponse
	decodeJSON(t, res, &body)
	if body.Data.CEP != "68920000" {
		t.Fatalf("expected normalized CEP %q, got %q", "68920000", body.Data.CEP)
	}
}

func TestUpdatePersonRejectsMissingRequiredPersonalFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"firstName": "",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "firstName", "Required")
}

func TestUpdatePersonRejectsInvalidOptionalFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"cep":               "123",
		"country":           "Argentina",
		"emergencyCellular": "1133334444",
		"emergencyEmail":    "not-an-email",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)

	assertFieldError(t, body, "cep", "CEP is invalid")
	assertFieldError(t, body, "country", "Country must be Brasil")
	assertFieldError(t, body, "emergencyCellular", "Emergency cellular must be a valid Brazilian mobile number")
	assertFieldError(t, body, "emergencyEmail", "Emergency email is invalid")
}

func TestUpdatePersonRejectsDuplicateCPFOnDifferentPerson(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	first := createPerson(t, server, validPersonPayload(1, nil))
	createPerson(t, server, validPersonPayload(2, nil))

	payload := validPersonPayload(1, map[string]any{
		"cpf": "93541134780",
	})

	res := putPerson(t, server, first.Data.ID, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "cpf", "CPF already exists")
}

func TestUpdatePersonAllowsKeepingOwnUniqueFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, map[string]any{
		"pixKey": "own-pix@example.com",
	}))

	payload := validPersonPayload(1, map[string]any{
		"firstName": "Same Unique Fields Updated",
		"pixKey":    "own-pix@example.com",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
}

func TestUpdatePersonRejectsDuplicateRGCellularEmailAndPIXKeyOnDifferentPerson(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	first := createPerson(t, server, validPersonPayload(1, nil))
	createPerson(t, server, validPersonPayload(2, map[string]any{
		"pixKey": "existing-pix@example.com",
	}))

	payload := validPersonPayload(1, map[string]any{
		"rg":       "RG-000002",
		"cellular": "12998765432",
		"email":    "person2@example.com",
		"pixKey":   "existing-pix@example.com",
	})

	res := putPerson(t, server, first.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)

	assertFieldError(t, body, "rg", "RG already exists")
	assertFieldError(t, body, "cellular", "Cellular already exists")
	assertFieldError(t, body, "email", "Email already exists")
	assertFieldError(t, body, "pixKey", "PIX key already exists")
}

func TestUpdatePersonRecomputesProfileCompletionToIncomplete(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(1, map[string]any{
		"street1":           "Rua Completa 123",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001000",
		"country":           "Brasil",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            "updated@example.com",
		"emergencyName":     "",
		"emergencyCellular": "",
		"emergencyEmail":    "",
	})

	res := putPerson(t, server, created.Data.ID, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var errorBody apiErrorResponse
		decodeJSON(t, res, &errorBody)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, errorBody.Error)
	}

	var body apiUpdatedPersonResponse
	decodeJSON(t, res, &body)

	if body.Data.ProfileCompletionStatus != "INCOMPLETE" {
		t.Fatalf("expected profile completion INCOMPLETE, got %q", body.Data.ProfileCompletionStatus)
	}
	if body.Data.CanCreateCollaborator {
		t.Fatal("expected canCreateCollaborator to be false")
	}
	if len(body.Data.MissingSections) != 1 || body.Data.MissingSections[0] != "Emergency" {
		t.Fatalf("expected missing Emergency section, got %+v", body.Data.MissingSections)
	}
}

func TestUpdatePersonReturnsNotFoundForUnknownID(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := putPerson(t, server, "not-a-real-person-id", validPersonPayload(1, nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)

	if body.Error == nil {
		t.Fatal("expected error response")
	}
	if body.Error.Code != "not_found" {
		t.Fatalf("expected error code not_found, got %q", body.Error.Code)
	}
}

func putPerson(t *testing.T, server *fiber.App, id string, payload map[string]any) *http.Response {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, peopleUpdateURLPrefix+id, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("put person: %v", err)
	}

	return res
}

func assertFieldError(t *testing.T, body apiErrorResponse, field string, message string) {
	t.Helper()

	if body.Error == nil {
		t.Fatal("expected error response")
	}
	if body.Error.Code != "validation_failed" {
		t.Fatalf("expected error code validation_failed, got %q", body.Error.Code)
	}
	if body.Error.Fields[field] != message {
		t.Fatalf("expected field %q to be %q, got %q", field, message, body.Error.Fields[field])
	}
}
