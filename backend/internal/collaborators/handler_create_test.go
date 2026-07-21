package collaborators_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
	"enterpriseremotesystems/backend/internal/db"
)

const (
	peopleURL                 = "/api/v1/people/"
	collaboratorsURL          = "/api/v1/collaborators/"
	collaboratorCandidatesURL = "/api/v1/collaborators/candidates"
)

type apiErrorResponse struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type apiPersonResponse struct {
	Data struct {
		ID                    string `json:"id"`
		CanCreateCollaborator bool   `json:"canCreateCollaborator"`
	} `json:"data"`
}

type apiCollaboratorResponse struct {
	Data struct {
		ID                             string   `json:"id"`
		TenantID                       string   `json:"tenantId"`
		PersonID                       string   `json:"personId"`
		PersonName                     string   `json:"personName"`
		PersonNickname                 string   `json:"personNickname"`
		JourneyStartDate               string   `json:"journeyStartDate"`
		DefaultEndDate                 string   `json:"defaultEndDate"`
		ExtensionDays                  int      `json:"extensionDays"`
		ProjectedEndDate               string   `json:"projectedEndDate"`
		PaymentMethodID                string   `json:"paymentMethodId"`
		PaymentValue                   float64  `json:"paymentValue"`
		FixedMonthlyBRLAmount          *float64 `json:"fixedMonthlyBrlAmount"`
		DailyBRLAmount                 *float64 `json:"dailyBrlAmount"`
		GoldCommissionPercent          *float64 `json:"goldCommissionPercent"`
		TimeOffGoldSplitPercent        *float64 `json:"timeOffGoldSplitPercent"`
		SickDayOffReplacementGoldGrams *float64 `json:"sickDayOffReplacementGoldGrams"`
		PlanningAvailability           string   `json:"planningAvailability"`
		SectorID                       string   `json:"sectorId"`
		LocationID                     string   `json:"locationId"`
		TaskID                         string   `json:"taskId"`
		StatusID                       string   `json:"statusId"`
	} `json:"data"`
}

type apiReferenceDataResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiCollaboratorListResponse struct {
	Data struct {
		Items []struct {
			ID             string `json:"id"`
			PersonName     string `json:"personName"`
			PersonNickname string `json:"personNickname"`
		} `json:"items"`
		Total int64 `json:"total"`
	} `json:"data"`
}

type apiCollaboratorCandidatesResponse struct {
	Data []struct {
		ID                    string `json:"id"`
		CanCreateCollaborator bool   `json:"canCreateCollaborator"`
	} `json:"data"`
}

func TestListCandidatesRecomputesCompletionAndExcludesActiveJourney(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:                       "test",
		HTTPAddr:                  ":0",
		DBPath:                    dbPath,
		JWTSecret:                 "test-secret",
		DisableRouteAuthorization: true,
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}
	defer cleanup()

	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("get test sql database: %v", err)
	}
	defer sqlDB.Close()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	if err := database.Model(&db.Person{}).
		Where("id = ?", person.Data.ID).
		Update("can_create_collaborator", false).Error; err != nil {
		t.Fatalf("make persisted eligibility stale: %v", err)
	}

	candidates := listCollaboratorCandidates(t, server)
	if len(candidates.Data) != 1 {
		t.Fatalf("expected one candidate, got %+v", candidates.Data)
	}
	if candidates.Data[0].ID != person.Data.ID {
		t.Fatalf("expected candidate %q, got %q", person.Data.ID, candidates.Data[0].ID)
	}
	if !candidates.Data[0].CanCreateCollaborator {
		t.Fatal("expected candidate completion to be recomputed from current Person data")
	}

	created := createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
	if created.Data.PersonID != person.Data.ID {
		t.Fatalf("expected collaborator for person %q, got %q", person.Data.ID, created.Data.PersonID)
	}

	candidates = listCollaboratorCandidates(t, server)
	if len(candidates.Data) != 0 {
		t.Fatalf("expected active collaborator Person to be removed from candidates, got %+v", candidates.Data)
	}
}

func TestCreateCollaboratorFromCompletePersonReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	if !person.Data.CanCreateCollaborator {
		t.Fatal("expected test person to be eligible for collaborator creation")
	}

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected collaborator id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.PersonID != person.Data.ID {
		t.Fatalf("expected personId %q, got %q", person.Data.ID, body.Data.PersonID)
	}
	if body.Data.PersonName != "Person1 Silva" {
		t.Fatalf("expected personName %q, got %q", "Person1 Silva", body.Data.PersonName)
	}
	if body.Data.PersonNickname != "P1" {
		t.Fatalf("expected personNickname %q, got %q", "P1", body.Data.PersonNickname)
	}
	if body.Data.JourneyStartDate != "2026-06-01" {
		t.Fatalf("expected journey start date, got %q", body.Data.JourneyStartDate)
	}
	if body.Data.DefaultEndDate != "2026-08-30" {
		t.Fatalf("expected default end date 90 days later, got %q", body.Data.DefaultEndDate)
	}
	if body.Data.ProjectedEndDate != "2026-08-30" {
		t.Fatalf("expected projected end date to match default end date, got %q", body.Data.ProjectedEndDate)
	}
	if body.Data.ExtensionDays != 0 {
		t.Fatalf("expected extensionDays 0, got %d", body.Data.ExtensionDays)
	}
	if body.Data.PaymentMethodID != "ref-method-daily" {
		t.Fatalf("expected payment method id, got %q", body.Data.PaymentMethodID)
	}
	if body.Data.PaymentValue != 150 {
		t.Fatalf("expected payment value 150, got %f", body.Data.PaymentValue)
	}
	if body.Data.StatusID != "ref-collaborator-status-active" {
		t.Fatalf("expected active collaborator status id, got %q", body.Data.StatusID)
	}
}

func TestCreateGoldCommissionCollaboratorDefaultsReplacementRules(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentMethodId":       "ref-method-commission",
		"paymentValue":          7.5,
		"goldCommissionPercent": 7.5,
	}))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)

	if body.Data.GoldCommissionPercent == nil || *body.Data.GoldCommissionPercent != 7.5 {
		t.Fatalf("expected goldCommissionPercent 7.5, got %#v", body.Data.GoldCommissionPercent)
	}
	if body.Data.TimeOffGoldSplitPercent == nil || *body.Data.TimeOffGoldSplitPercent != 50.0 {
		t.Fatalf("expected default timeOffGoldSplitPercent 50.0, got %#v", body.Data.TimeOffGoldSplitPercent)
	}
	if body.Data.SickDayOffReplacementGoldGrams == nil || *body.Data.SickDayOffReplacementGoldGrams != 1.0 {
		t.Fatalf("expected default sickDayOffReplacementGoldGrams 1.0, got %#v", body.Data.SickDayOffReplacementGoldGrams)
	}
}

func TestCreateGoldCommissionCollaboratorAcceptsCustomReplacementRules(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentMethodId":                "ref-method-commission",
		"paymentValue":                   8.25,
		"goldCommissionPercent":          8.25,
		"timeOffGoldSplitPercent":        40.0,
		"sickDayOffReplacementGoldGrams": 1.25,
	}))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)

	if body.Data.TimeOffGoldSplitPercent == nil || *body.Data.TimeOffGoldSplitPercent != 40.0 {
		t.Fatalf("expected timeOffGoldSplitPercent 40.0, got %#v", body.Data.TimeOffGoldSplitPercent)
	}
	if body.Data.SickDayOffReplacementGoldGrams == nil || *body.Data.SickDayOffReplacementGoldGrams != 1.25 {
		t.Fatalf("expected sickDayOffReplacementGoldGrams 1.25, got %#v", body.Data.SickDayOffReplacementGoldGrams)
	}
}

func TestCreateGoldCommissionCollaboratorAcceptsEightDecimalPercent(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentMethodId":       "ref-method-commission",
		"paymentValue":          7.12345678,
		"goldCommissionPercent": 7.12345678,
	}))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)

	if body.Data.GoldCommissionPercent == nil || *body.Data.GoldCommissionPercent != 7.12345678 {
		t.Fatalf("expected goldCommissionPercent 7.12345678, got %#v", body.Data.GoldCommissionPercent)
	}
}

func TestCreateGoldCommissionCollaboratorRejectsTooManyPercentDecimals(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentMethodId":       "ref-method-commission",
		"paymentValue":          7.123456789,
		"goldCommissionPercent": 7.123456789,
	}))
	defer res.Body.Close()

	assertValidationError(t, res, "goldCommissionPercent", "Gold commission percent can have at most eight decimal places")
}

func TestCreateDailyBRLCollaboratorRejectsTooManyAmountDecimals(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentValue":   150.123,
		"dailyBrlAmount": 150.123,
	}))
	defer res.Body.Close()

	assertValidationError(t, res, "dailyBrlAmount", "Daily BRL amount can have at most two decimal places")
}

func TestUpdateCollaboratorEditsAssignmentPaymentAndExtensionDays(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	created := createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
	sector := createReferenceData(t, server, "sector", map[string]any{"code": "PROCESSING", "label": "Processing", "sortOrder": 20})
	location := createReferenceData(t, server, "location", map[string]any{"code": "NORTH_PIT", "label": "North Pit", "sortOrder": 20})
	task := createReferenceData(t, server, "task", map[string]any{"code": "SUPERVISOR", "label": "Supervisor", "sortOrder": 20})

	res := postJSON(t, server, http.MethodPut, collaboratorsURL+created.Data.ID, map[string]any{
		"sectorId":              sector.Data.ID,
		"locationId":            location.Data.ID,
		"taskId":                task.Data.ID,
		"paymentMethodId":       "ref-method-salary",
		"paymentValue":          2400.0,
		"fixedMonthlyBrlAmount": 2400.0,
		"extensionDays":         12,
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected update collaborator status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)

	if body.Data.SectorID != sector.Data.ID {
		t.Fatalf("expected sectorId %q, got %q", sector.Data.ID, body.Data.SectorID)
	}
	if body.Data.LocationID != location.Data.ID {
		t.Fatalf("expected locationId %q, got %q", location.Data.ID, body.Data.LocationID)
	}
	if body.Data.TaskID != task.Data.ID {
		t.Fatalf("expected taskId %q, got %q", task.Data.ID, body.Data.TaskID)
	}
	if body.Data.PaymentMethodID != "ref-method-salary" {
		t.Fatalf("expected salary payment method, got %q", body.Data.PaymentMethodID)
	}
	if body.Data.PaymentValue != 2400 {
		t.Fatalf("expected payment value 2400, got %f", body.Data.PaymentValue)
	}
	if body.Data.FixedMonthlyBRLAmount == nil || *body.Data.FixedMonthlyBRLAmount != 2400 {
		t.Fatalf("expected fixedMonthlyBrlAmount 2400, got %#v", body.Data.FixedMonthlyBRLAmount)
	}
	if body.Data.DailyBRLAmount != nil {
		t.Fatalf("expected dailyBrlAmount to be cleared, got %#v", body.Data.DailyBRLAmount)
	}
	if body.Data.ExtensionDays != 12 {
		t.Fatalf("expected extensionDays 12, got %d", body.Data.ExtensionDays)
	}
	if body.Data.ProjectedEndDate != "2026-09-11" {
		t.Fatalf("expected projected end date with 12 extension days, got %q", body.Data.ProjectedEndDate)
	}
}

func TestUpdateCollaboratorSavesPlanningAvailability(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	created := createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))

	res := postJSON(t, server, http.MethodPut, collaboratorsURL+created.Data.ID, map[string]any{
		"sectorId":             "ref-sector-mining",
		"locationId":           "ref-location-main-mine",
		"taskId":               "ref-task-miner",
		"paymentMethodId":      "ref-method-daily",
		"paymentValue":         150.0,
		"dailyBrlAmount":       150.0,
		"extensionDays":        0,
		"planningAvailability": "DAY_OFF",
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected update collaborator status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)
	if body.Data.PlanningAvailability != "DAY_OFF" {
		t.Fatalf("expected planningAvailability DAY_OFF, got %q", body.Data.PlanningAvailability)
	}

	res = postJSON(t, server, http.MethodPut, collaboratorsURL+created.Data.ID, map[string]any{
		"sectorId":             "ref-sector-mining",
		"locationId":           "ref-location-main-mine",
		"taskId":               "ref-task-miner",
		"paymentMethodId":      "ref-method-daily",
		"paymentValue":         150.0,
		"dailyBrlAmount":       150.0,
		"extensionDays":        0,
		"planningAvailability": "ACTIVE",
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected update collaborator status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	decodeJSON(t, res, &body)
	if body.Data.PlanningAvailability != "ACTIVE" {
		t.Fatalf("expected planningAvailability ACTIVE, got %q", body.Data.PlanningAvailability)
	}
}

func TestListCollaboratorsOrdersNewestCreatedFirst(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	olderPerson := createPerson(t, server, validCompletePersonPayload(1, nil))
	createCollaborator(t, server, validCollaboratorPayload(olderPerson.Data.ID, map[string]any{
		"journeyStartDate": "2099-01-01",
	}))

	time.Sleep(time.Millisecond)

	newerPerson := createPerson(t, server, validCompletePersonPayload(2, nil))
	newerCollaborator := createCollaborator(t, server, validCollaboratorPayload(newerPerson.Data.ID, map[string]any{
		"journeyStartDate": "2026-06-01",
	}))

	listed := listCollaborators(t, server, "page=1&pageSize=1")
	if listed.Data.Total != 2 {
		t.Fatalf("expected two collaborators, got %d", listed.Data.Total)
	}
	if len(listed.Data.Items) != 1 {
		t.Fatalf("expected one collaborator on the first page, got %d", len(listed.Data.Items))
	}
	if got := listed.Data.Items[0].ID; got != newerCollaborator.Data.ID {
		t.Fatalf("expected newest collaborator %q first, got %q", newerCollaborator.Data.ID, got)
	}
}

func TestListCollaboratorsFiltersByPersonNameAndNickname(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	firstPerson := createPerson(t, server, validCompletePersonPayload(1, map[string]any{
		"firstName": "Joao",
		"lastName":  "Garimpo",
		"nickname":  "Jota",
	}))
	secondPerson := createPerson(t, server, validCompletePersonPayload(2, map[string]any{
		"firstName": "Maria",
		"lastName":  "Serra",
		"nickname":  "Mina",
	}))

	firstCollaborator := createCollaborator(t, server, validCollaboratorPayload(firstPerson.Data.ID, nil))
	createCollaborator(t, server, validCollaboratorPayload(secondPerson.Data.ID, map[string]any{
		"journeyStartDate": "2026-06-02",
	}))

	byName := listCollaborators(t, server, "search=garimpo")
	if byName.Data.Total != 1 {
		t.Fatalf("expected one collaborator by legal name prefix search, got %d", byName.Data.Total)
	}
	if got := byName.Data.Items[0].ID; got != firstCollaborator.Data.ID {
		t.Fatalf("expected collaborator %q by legal name prefix search, got %q", firstCollaborator.Data.ID, got)
	}
	if got := byName.Data.Items[0].PersonName; got != "Joao Garimpo" {
		t.Fatalf("expected personName %q, got %q", "Joao Garimpo", got)
	}

	byNickname := listCollaborators(t, server, "search=Mina")
	if byNickname.Data.Total != 1 {
		t.Fatalf("expected one collaborator by nickname prefix search, got %d", byNickname.Data.Total)
	}
	if got := byNickname.Data.Items[0].PersonNickname; got != "Mina" {
		t.Fatalf("expected personNickname %q, got %q", "Mina", got)
	}

	byMiddleSubstring := listCollaborators(t, server, "search=arimpo")
	if byMiddleSubstring.Data.Total != 0 {
		t.Fatalf("expected no collaborators for middle-substring search, got %d", byMiddleSubstring.Data.Total)
	}
}

func TestUpdateCollaboratorRejectsNegativeExtensionDays(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	created := createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))

	res := postJSON(t, server, http.MethodPut, collaboratorsURL+created.Data.ID, map[string]any{
		"sectorId":        "ref-sector-mining",
		"locationId":      "ref-location-main-mine",
		"taskId":          "ref-task-miner",
		"paymentMethodId": "ref-method-daily",
		"paymentValue":    150.0,
		"dailyBrlAmount":  150.0,
		"extensionDays":   -1,
	})
	defer res.Body.Close()

	assertValidationError(t, res, "extensionDays", "Extension days must be zero or greater")
}

func TestCreateCollaboratorRejectsIncompletePerson(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validPersonalOnlyPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "personId", "Person profile must be complete before creating a collaborator")
}

func TestCreateCollaboratorRejectsDuplicateActiveJourneyForPerson(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))
	createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"journeyStartDate": "2026-07-01",
	}))
	defer res.Body.Close()

	assertValidationError(t, res, "personId", "Person already has an active collaborator journey")
}

func TestCreateCollaboratorRejectsInactiveReferenceData(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postJSON(t, server, http.MethodPatch, "/api/v1/reference-data/method/ref-method-daily/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate reference data status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "paymentMethodId", "Payment method must be active reference data of type method")
}

func TestCreateCollaboratorRejectsInvalidReferenceData(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	person := createPerson(t, server, validCompletePersonPayload(1, nil))

	res := postCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{
		"paymentMethodId": "ref-method-not-real",
	}))
	defer res.Body.Close()

	assertValidationError(t, res, "paymentMethodId", "Payment method must be active reference data of type method")
}

func TestCreateCollaboratorRejectsMissingRequiredFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postCollaborator(t, server, map[string]any{})
	defer res.Body.Close()

	assertValidationError(t, res, "personId", "Required")
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:                       "test",
		HTTPAddr:                  ":0",
		DBPath:                    dbPath,
		JWTSecret:                 "test-secret",
		DisableRouteAuthorization: true,
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}

	return server, cleanup
}

func createPerson(t *testing.T, server *fiber.App, payload map[string]any) apiPersonResponse {
	t.Helper()

	res := postJSON(t, server, http.MethodPost, peopleURL, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create person status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiPersonResponse
	decodeJSON(t, res, &body)
	return body
}

func createReferenceData(t *testing.T, server *fiber.App, typ string, payload map[string]any) apiReferenceDataResponse {
	t.Helper()

	res := postJSON(t, server, http.MethodPost, "/api/v1/reference-data/"+typ, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create reference data status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiReferenceDataResponse
	decodeJSON(t, res, &body)
	return body
}

func createCollaborator(t *testing.T, server *fiber.App, payload map[string]any) apiCollaboratorResponse {
	t.Helper()

	res := postCollaborator(t, server, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create collaborator status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)
	return body
}

func listCollaborators(t *testing.T, server *fiber.App, query string) apiCollaboratorListResponse {
	t.Helper()

	url := collaboratorsURL
	if query != "" {
		url += "?" + query
	}

	req := httptest.NewRequest(http.MethodGet, url, nil)
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected list collaborators status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiCollaboratorListResponse
	decodeJSON(t, res, &body)
	return body
}

func listCollaboratorCandidates(t *testing.T, server *fiber.App) apiCollaboratorCandidatesResponse {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, collaboratorCandidatesURL, nil)
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("GET %s: %v", collaboratorCandidatesURL, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected list candidates status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiCollaboratorCandidatesResponse
	decodeJSON(t, res, &body)
	return body
}

func postCollaborator(t *testing.T, server *fiber.App, payload map[string]any) *http.Response {
	t.Helper()
	return postJSON(t, server, http.MethodPost, collaboratorsURL, payload)
}

func postJSON(t *testing.T, server *fiber.App, method string, url string, payload map[string]any) *http.Response {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(method, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}

	return res
}

func validCollaboratorPayload(personID string, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"personId":         personID,
		"journeyStartDate": "2026-06-01",
		"paymentMethodId":  "ref-method-daily",
		"paymentValue":     150.0,
		"sectorId":         "ref-sector-mining",
		"locationId":       "ref-location-main-mine",
		"taskId":           "ref-task-miner",
		"statusId":         "ref-collaborator-status-active",
		"notes":            "First collaborator journey",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func validPersonalOnlyPayload(seq int, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"firstName": fmt.Sprintf("Person%d", seq),
		"lastName":  "Silva",
		"nickname":  fmt.Sprintf("P%d", seq),
		"cpf":       cpfForSeq(seq),
		"rg":        fmt.Sprintf("RG-%06d", seq),
		"cellular":  cellularForSeq(seq),
		"email":     fmt.Sprintf("person%d@example.com", seq),
		"country":   "Brasil",
		"statusId":  "ref-person-status-active",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func validCompletePersonPayload(seq int, overrides map[string]any) map[string]any {
	payload := validPersonalOnlyPayload(seq, map[string]any{
		"street1":           "Rua Completa 123",
		"street2":           "Apto 5",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001000",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            fmt.Sprintf("person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("emergency%d@example.com", seq),
	})
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func cpfForSeq(seq int) string {
	cpfs := []string{"39053344705", "93541134780", "35711002844", "12345678909"}
	return cpfs[(seq-1)%len(cpfs)]
}

func cellularForSeq(seq int) string {
	return fmt.Sprintf("11%d%08d", 9, 98765000+seq)
}

func assertValidationError(t *testing.T, res *http.Response, field string, message string) {
	t.Helper()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)

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

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
