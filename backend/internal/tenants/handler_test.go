package tenants_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	apppkg "enterpriseremotesystems/backend/internal/app"
	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"github.com/gofiber/fiber/v3"
)

type apiTenantResponse struct {
	Data tenantDTO `json:"data"`
}

type apiTenantsResponse struct {
	Data []tenantDTO `json:"data"`
}

type apiTenantAdminCandidatesResponse struct {
	Data []tenantAdminCandidateDTO `json:"data"`
}

type apiErrorResponse struct {
	Error struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type tenantDTO struct {
	ID                         string `json:"id"`
	Code                       string `json:"code"`
	Name                       string `json:"name"`
	Description                string `json:"description"`
	Active                     bool   `json:"active"`
	OperationalStatus          string `json:"operationalStatus"`
	TenantAdminCount           int64  `json:"tenantAdminCount"`
	TenantAdminAssignmentCount int64  `json:"tenantAdminAssignmentCount"`
}

type tenantAdminCandidateDTO struct {
	ActorID  string `json:"actorId"`
	ActorKey string `json:"actorKey"`
	Active   bool   `json:"active"`
	Assigned bool   `json:"assigned"`
}

func TestCurrentTenantReturnsSeededDefaultTenant(t *testing.T) {
	server, _, cleanup := newTestServer(t, true)
	defer cleanup()

	res := requestJSON(t, server, http.MethodGet, "/api/v1/tenants/current", nil, nil)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
	}

	var body apiTenantResponse
	decodeJSON(t, res, &body)

	if body.Data.ID != "default" {
		t.Fatalf("expected default tenant id, got %q", body.Data.ID)
	}
	if body.Data.Code != "DEFAULT" {
		t.Fatalf("expected default tenant code, got %q", body.Data.Code)
	}
	if body.Data.Name != "Default Tenant" {
		t.Fatalf("expected default tenant name, got %q", body.Data.Name)
	}
	if !body.Data.Active {
		t.Fatal("expected default tenant to be active")
	}
	if body.Data.OperationalStatus != "ACTIVE_NO_TENANT_ADMIN" {
		t.Fatalf("expected active tenant without assigned tenant admin, got %q", body.Data.OperationalStatus)
	}
}

func TestTenantLifecycleCreatesUpdatesDeactivatesAndPreservesHistory(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()

	created := createTenant(t, server, " north-site ", "North Site")
	if created.Code != "NORTH-SITE" || !created.Active {
		t.Fatalf("unexpected created tenant: %+v", created)
	}

	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open tenant database: %v", err)
	}
	var referenceCount int64
	if err := database.Model(&dbpkg.ReferenceData{}).Where("tenant_id = ?", created.ID).Count(&referenceCount).Error; err != nil {
		closeDatabase(t, database)
		t.Fatalf("count tenant reference data: %v", err)
	}
	var priceListCount int64
	if err := database.Model(&dbpkg.ExpensePriceListItem{}).Where("tenant_id = ? AND active = ?", created.ID, true).Count(&priceListCount).Error; err != nil {
		closeDatabase(t, database)
		t.Fatalf("count tenant price-list data: %v", err)
	}
	closeDatabase(t, database)
	if referenceCount < 30 {
		t.Fatalf("expected complete tenant reference baseline, got %d rows", referenceCount)
	}
	if priceListCount != 5 {
		t.Fatalf("expected five starter price-list rows, got %d", priceListCount)
	}

	res := requestJSON(t, server, http.MethodPut, "/api/v1/tenants/"+created.ID, map[string]any{
		"code":        "NORTH_01",
		"name":        "North Operations",
		"description": "Primary northern operation",
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected update status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var updatedBody apiTenantResponse
	decodeJSON(t, res, &updatedBody)
	if updatedBody.Data.Code != "NORTH_01" || updatedBody.Data.Name != "North Operations" {
		t.Fatalf("unexpected updated tenant: %+v", updatedBody.Data)
	}

	res = requestJSON(t, server, http.MethodPatch, "/api/v1/tenants/"+created.ID+"/active", map[string]any{"active": false}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var inactiveBody apiTenantResponse
	decodeJSON(t, res, &inactiveBody)
	if inactiveBody.Data.Active || inactiveBody.Data.OperationalStatus != "INACTIVE" {
		t.Fatalf("expected inactive tenant, got %+v", inactiveBody.Data)
	}

	res = requestJSON(t, server, http.MethodGet, "/api/v1/tenants/"+created.ID, nil, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected inactive tenant to remain readable, got %d", res.StatusCode)
	}

	res = requestJSON(t, server, http.MethodDelete, "/api/v1/tenants/"+created.ID, nil, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("expected deletion conflict, got %d", res.StatusCode)
	}
	var deleteBody apiErrorResponse
	decodeJSON(t, res, &deleteBody)
	if deleteBody.Error.Code != "tenant_deletion_not_allowed" {
		t.Fatalf("unexpected deletion error code %q", deleteBody.Error.Code)
	}
}

func TestTenantCodeMustBeUnique(t *testing.T) {
	server, _, cleanup := newTestServer(t, true)
	defer cleanup()

	createTenant(t, server, "SOUTH", "South Site")
	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code": "south",
		"name": "Duplicate South",
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected validation status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error.Fields["code"] == "" {
		t.Fatalf("expected tenant code validation field, got %+v", body.Error.Fields)
	}
}

func TestApplicationAdminCanAssignAndRevokeTenantAdministrator(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()

	tenant := createTenant(t, server, "WEST", "West Site")
	actorID := seedTenantBoundActor(t, dbPath, tenant.ID, "west-admin@example.com", true)

	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants/"+tenant.ID+"/admins", map[string]any{"actorId": actorID}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected assignment status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var assignedBody apiTenantResponse
	decodeJSON(t, res, &assignedBody)
	if assignedBody.Data.TenantAdminCount != 1 || assignedBody.Data.TenantAdminAssignmentCount != 1 || assignedBody.Data.OperationalStatus != "ACTIVE_READY" {
		t.Fatalf("expected tenant to become operationally ready, got %+v", assignedBody.Data)
	}

	res = requestJSON(t, server, http.MethodGet, "/api/v1/tenants/"+tenant.ID+"/admin-candidates", nil, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected candidates status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var candidatesBody apiTenantAdminCandidatesResponse
	decodeJSON(t, res, &candidatesBody)
	foundAssigned := false
	for _, candidate := range candidatesBody.Data {
		if candidate.ActorID == actorID {
			foundAssigned = candidate.Assigned && candidate.Active
		}
	}
	if !foundAssigned {
		t.Fatalf("expected seeded actor to be an assigned candidate: %+v", candidatesBody.Data)
	}

	res = requestJSON(t, server, http.MethodDelete, "/api/v1/tenants/"+tenant.ID+"/admins/"+actorID, nil, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected revoke status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var revokedBody apiTenantResponse
	decodeJSON(t, res, &revokedBody)
	if revokedBody.Data.TenantAdminCount != 0 || revokedBody.Data.TenantAdminAssignmentCount != 0 || revokedBody.Data.OperationalStatus != "ACTIVE_NO_TENANT_ADMIN" {
		t.Fatalf("unexpected tenant after revoke: %+v", revokedBody.Data)
	}
}

func TestTenantAdministratorCardinalityAllowsTwoAndRejectsThirdAssignment(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()

	tenant := createTenant(t, server, "CARDINALITY", "Cardinality Tenant")
	actorA := seedTenantBoundActor(t, dbPath, tenant.ID, "cardinality-admin-a@example.com", true)
	actorB := seedTenantBoundActor(t, dbPath, tenant.ID, "cardinality-admin-b@example.com", true)
	actorC := seedTenantBoundActor(t, dbPath, tenant.ID, "cardinality-admin-c@example.com", true)

	for index, actorID := range []string{actorA, actorB} {
		res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants/"+tenant.ID+"/admins", map[string]any{"actorId": actorID}, nil)
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			t.Fatalf("assign allowed Tenant Administrator %d: expected %d, got %d", index+1, http.StatusOK, res.StatusCode)
		}
		var body apiTenantResponse
		decodeJSON(t, res, &body)
		res.Body.Close()
		if body.Data.TenantAdminCount != int64(index+1) || body.Data.TenantAdminAssignmentCount != int64(index+1) {
			t.Fatalf("expected %d Tenant Administrator assignments, got %+v", index+1, body.Data)
		}
	}

	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants/"+tenant.ID+"/admins", map[string]any{"actorId": actorC}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected third Tenant Administrator status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if !strings.Contains(body.Error.Fields["tenantId"], "maximum of two") {
		t.Fatalf("expected Tenant cardinality validation error, got %+v", body.Error)
	}

	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer closeDatabase(t, database)
	var activeGrants int64
	if err := database.Model(&authz.AuthzActorRoleGrant{}).
		Where("role_id = ? AND tenant_id = ? AND active = ?", "authz-role-tenant-admin", tenant.ID, true).
		Count(&activeGrants).Error; err != nil {
		t.Fatalf("count Tenant Administrator grants: %v", err)
	}
	if activeGrants != 2 {
		t.Fatalf("expected exactly two persisted active Tenant Administrator grants, got %d", activeGrants)
	}
}

func TestTenantAdminCanReadOwnTenantButCannotManageTenantCatalog(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, false)
	defer cleanup()

	actorID := seedTenantBoundActor(t, dbPath, dbpkg.DefaultTenantID, "tenant-admin@example.com", true)
	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer closeDatabase(t, database)
	if err := authz.GrantRole(database, actorID, authz.RoleTenantAdmin, "default"); err != nil {
		t.Fatalf("grant tenant admin role: %v", err)
	}

	headers := actorHeaders("tenant-admin@example.com", "default")
	res := requestJSON(t, server, http.MethodGet, "/api/v1/tenants/default", nil, headers)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected own tenant read status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = requestJSON(t, server, http.MethodGet, "/api/v1/tenants", nil, headers)
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected tenant catalog to be application-admin-only, got %d", res.StatusCode)
	}

	res = requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{"code": "NOPE", "name": "Nope"}, headers)
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected tenant creation to be application-admin-only, got %d", res.StatusCode)
	}
}

func TestInactiveTenantBlocksWritesButKeepsReadsAvailable(t *testing.T) {
	server, _, cleanup := newTestServer(t, false)
	defer cleanup()

	adminHeaders := actorHeaders("bootstrap-admin", "default")
	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{"code": "PAUSED", "name": "Paused Site"}, adminHeaders)
	if res.StatusCode != http.StatusCreated {
		defer res.Body.Close()
		t.Fatalf("create paused tenant: expected %d, got %d", http.StatusCreated, res.StatusCode)
	}
	var createdBody apiTenantResponse
	decodeJSON(t, res, &createdBody)
	res.Body.Close()

	res = requestJSON(t, server, http.MethodPatch, "/api/v1/tenants/"+createdBody.Data.ID+"/active", map[string]any{"active": false}, adminHeaders)
	if res.StatusCode != http.StatusOK {
		defer res.Body.Close()
		t.Fatalf("deactivate tenant: expected %d, got %d", http.StatusOK, res.StatusCode)
	}
	res.Body.Close()

	pausedHeaders := actorHeaders("bootstrap-admin", createdBody.Data.ID)
	res = requestJSON(t, server, http.MethodPost, "/api/v1/people", map[string]any{}, pausedHeaders)
	defer res.Body.Close()
	if res.StatusCode != http.StatusLocked {
		t.Fatalf("expected inactive tenant write to be locked, got %d", res.StatusCode)
	}
	var lockedBody apiErrorResponse
	decodeJSON(t, res, &lockedBody)
	if lockedBody.Error.Code != "tenant_inactive" {
		t.Fatalf("unexpected inactive tenant error code %q", lockedBody.Error.Code)
	}

	res = requestJSON(t, server, http.MethodGet, "/api/v1/people", nil, pausedHeaders)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected historical read to remain available, got %d", res.StatusCode)
	}
}

func createTenant(t *testing.T, server *fiber.App, code string, name string) tenantDTO {
	t.Helper()
	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code": code,
		"name": name,
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create tenant: expected %d, got %d", http.StatusCreated, res.StatusCode)
	}
	var body apiTenantResponse
	decodeJSON(t, res, &body)
	return body.Data
}

func seedTenantBoundActor(t *testing.T, dbPath string, tenantID string, actorKey string, active bool) string {
	t.Helper()
	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer closeDatabase(t, database)

	var activeStatus dbpkg.ReferenceData
	if err := database.WithContext(context.Background()).
		Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).
		First(&activeStatus).Error; err != nil {
		t.Fatalf("find active Person status for tenant %s: %v", tenantID, err)
	}

	now := time.Now().UTC()
	person := dbpkg.GlobalPerson{
		BaseModel: dbpkg.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		FirstName: "Tenant",
		LastName:  "Administrator",
		Nickname:  actorKey,
		CPF:       ids.New(),
		RG:        ids.New(),
		Cellular:  ids.New(),
		Email:     actorKey,
		Country:   "Brasil",
	}
	if err := database.WithContext(context.Background()).Create(&person).Error; err != nil {
		t.Fatalf("seed tenant administrator global Person: %v", err)
	}
	membership := dbpkg.PersonTenantMembership{
		BaseModel: dbpkg.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:  tenantID,
		PersonID:  person.ID,
		StatusID:  activeStatus.ID,
	}
	if err := database.WithContext(context.Background()).Create(&membership).Error; err != nil {
		t.Fatalf("seed tenant administrator Membership: %v", err)
	}

	actor := authz.AuthzActor{
		ID:          ids.New(),
		ActorKey:    actorKey,
		DisplayName: actorKey,
		PersonID:    &person.ID,
		Active:      active,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := database.WithContext(context.Background()).Create(&actor).Error; err != nil {
		t.Fatalf("seed actor: %v", err)
	}

	account := authentication.Account{
		ID:                 ids.New(),
		ActorID:            actor.ID,
		Login:              actorKey,
		PasswordHash:       "test-password-hash",
		Active:             true,
		MustChangePassword: false,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := database.WithContext(context.Background()).Create(&account).Error; err != nil {
		t.Fatalf("seed tenant administrator Authentication Account: %v", err)
	}
	accountPerson := authentication.AccountPerson{
		AccountID: account.ID,
		PersonID:  person.ID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := database.WithContext(context.Background()).Create(&accountPerson).Error; err != nil {
		t.Fatalf("seed tenant administrator Account/Person binding: %v", err)
	}
	bindingTenantID := tenantID
	bindingMembershipID := membership.ID
	accountActor := authentication.AccountActor{
		AccountID:    account.ID,
		ActorID:      actor.ID,
		ScopeType:    authentication.AccountActorScopeTenant,
		TenantID:     &bindingTenantID,
		MembershipID: &bindingMembershipID,
		Primary:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := database.WithContext(context.Background()).Create(&accountActor).Error; err != nil {
		t.Fatalf("seed tenant administrator Account/Actor binding: %v", err)
	}
	return actor.ID
}

func closeDatabase(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("close SQL database: %v", err)
	}
}

func newTestServer(t *testing.T, disableRouteAuthorization bool) (*fiber.App, string, func()) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:                       "test",
		HTTPAddr:                  ":0",
		DBPath:                    dbPath,
		JWTSecret:                 "test-secret",
		AuthzBootstrapEnabled:     true,
		AuthzBootstrapActorKey:    "bootstrap-admin",
		DisableRouteAuthorization: disableRouteAuthorization,
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}

	return server, dbPath, cleanup
}

func actorHeaders(actorID string, tenantID string) map[string]string {
	return map[string]string{
		authz.HeaderActorID:  actorID,
		authz.HeaderTenantID: tenantID,
	}
}

func requestJSON(t *testing.T, server *fiber.App, method string, url string, body any, headers map[string]string) *http.Response {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, url, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return res
}

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
