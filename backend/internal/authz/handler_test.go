package authz

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

func TestAuthzAdminEndpointsRequireActor(t *testing.T) {
	database := newAuthzTestDB(t)
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected missing actor status 401, got %d", resp.StatusCode)
	}
}

func TestAuthzAdminEndpointsRejectActorWithoutPermission(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "persisted-expense@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, map[string]string{
		HeaderActorID:  "persisted-expense@example.com",
		HeaderTenantID: "tenant-a",
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status 403, got %d", resp.StatusCode)
	}
}

func TestAuthzCurrentActorReturnsPersistedOperatingContext(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "expense-current@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/current-actor", nil, map[string]string{
		HeaderActorID:  "expense-current@example.com",
		HeaderTenantID: "tenant-a",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected current actor status 200, got %d", resp.StatusCode)
	}
	current := decodeData[CurrentActorResponse](t, resp)
	if current.ActorKey != "expense-current@example.com" || current.ActorRecordID != actorID || current.TenantID != "tenant-a" {
		t.Fatalf("unexpected current actor response: %#v", current)
	}
	if len(current.RoleCodes) != 1 || current.RoleCodes[0] != string(RoleExpenseOperator) {
		t.Fatalf("unexpected current actor roles: %#v", current.RoleCodes)
	}
	if !containsString(current.Permissions, string(PermissionExpensesCreate)) {
		t.Fatalf("expected expenses.create permission: %#v", current.Permissions)
	}
}

func TestCurrentActorResponseSerializesEmptyAuthorizationCollectionsAsArrays(t *testing.T) {
	response := currentActorResponse(&Actor{
		ID:                   "person-only@example.test",
		RecordID:             "actor-person-only",
		TenantID:             "tenant-a",
		Scope:                ActorScopeTenant,
		PersonID:             "person-a",
		GlobalPersonID:       "global-person-a",
		MembershipID:         "membership-a",
		RoleCodes:            nil,
		Permissions:          map[Permission]struct{}{PermissionPeopleSelfRead: {}},
		IntrinsicPermissions: map[Permission]struct{}{PermissionPeopleSelfRead: {}},
		DelegatedPermissions: nil,
	})

	if response.RoleCodes == nil {
		t.Fatal("expected empty roleCodes array, got nil")
	}
	if response.Permissions == nil || response.IntrinsicPermissions == nil || response.DelegatedPermissions == nil {
		t.Fatalf("expected non-nil permission collections, got %#v", response)
	}

	payload, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal current actor response: %v", err)
	}
	for _, expected := range [][]byte{
		[]byte(`"roleCodes":[]`),
		[]byte(`"delegatedPermissions":[]`),
	} {
		if !bytes.Contains(payload, expected) {
			t.Fatalf("expected %s in current actor JSON, got %s", expected, payload)
		}
	}
}

func TestAuthzAdminCannotDeactivateOrRevokeItsOwnOperatingActor(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "self-admin@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "self-admin@example.com", HeaderTenantID: "default"}

	deactivateResp := doAuthzRequest(t, app, http.MethodPatch, "/api/v1/authz/actors/"+adminActorID+"/active", map[string]any{"active": false}, headers)
	if deactivateResp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected self-deactivation status 403, got %d", deactivateResp.StatusCode)
	}

	var grant AuthzActorRoleGrant
	if err := database.Where("actor_id = ? AND active = ?", adminActorID, true).First(&grant).Error; err != nil {
		t.Fatalf("find self admin grant: %v", err)
	}
	revokeResp := doAuthzRequest(t, app, http.MethodDelete, "/api/v1/authz/actors/"+adminActorID+"/role-grants/"+grant.ID, nil, headers)
	if revokeResp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected self-revoke status 403, got %d", revokeResp.StatusCode)
	}
}

func TestAuthzAdminCanDeactivateAnotherActor(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "lifecycle-admin@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	targetID := createAuthzActor(t, database, "operator-to-deactivate@example.com", nil, nil)
	grantAuthzRole(t, database, targetID, RoleExpenseOperator, "default")
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "lifecycle-admin@example.com", HeaderTenantID: "default"}

	resp := doAuthzRequest(t, app, http.MethodPatch, "/api/v1/authz/actors/"+targetID+"/active", map[string]any{"active": false}, headers)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status 200, got %d", resp.StatusCode)
	}
	updated := decodeData[ActorResponse](t, resp)
	if updated.Active {
		t.Fatalf("expected inactive actor, got %#v", updated)
	}
}

func TestAuthzAdminCanCreateActorGrantRoleAndRevokeGrant(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "app-admin-tooling@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "app-admin-tooling@example.com", HeaderTenantID: "tenant-a"}

	createBody := map[string]any{"actorKey": "expenses-tooling@example.com", "displayName": "Expenses Tooling"}
	createResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/actors", createBody, headers)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected create actor status 201, got %d", createResp.StatusCode)
	}
	created := decodeData[ActorResponse](t, createResp)
	if created.ID == "" || created.ActorKey != "expenses-tooling@example.com" || !created.Active {
		t.Fatalf("unexpected created actor: %#v", created)
	}

	auditResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/audit-logs?operation=authz.actors.create", nil, headers)
	if auditResp.StatusCode != http.StatusOK {
		t.Fatalf("expected audit log status 200, got %d", auditResp.StatusCode)
	}
	auditLogs := decodeData[[]AuditLogResponse](t, auditResp)
	if len(auditLogs) == 0 || auditLogs[0].Operation != "authz.actors.create" || auditLogs[0].TargetID != created.ID || auditLogs[0].Decision != AuditDecisionAuthorized {
		t.Fatalf("expected actor create audit log, got %#v", auditLogs)
	}

	grantBody := map[string]any{"roleCode": string(RoleExpenseOperator), "tenantId": "tenant-a"}
	grantResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/actors/"+created.ID+"/role-grants", grantBody, headers)
	if grantResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected grant status 201, got %d", grantResp.StatusCode)
	}
	grant := decodeData[ActorGrantResponse](t, grantResp)
	if grant.RoleCode != string(RoleExpenseOperator) || grant.TenantID != "tenant-a" || !grant.Active {
		t.Fatalf("unexpected grant: %#v", grant)
	}

	actor, err := NewGORMStore(database).FindActor(t.Context(), ActorLookup{ActorID: "expenses-tooling@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find granted actor: %v", err)
	}
	if !actor.HasPermission(PermissionLedgerReceiptsReturn) {
		t.Fatalf("expected granted actor to have expense operator permissions")
	}

	revokeResp := doAuthzRequest(t, app, http.MethodDelete, "/api/v1/authz/actors/"+created.ID+"/role-grants/"+grant.ID, nil, headers)
	if revokeResp.StatusCode != http.StatusOK {
		t.Fatalf("expected revoke status 200, got %d", revokeResp.StatusCode)
	}
	revoked := decodeData[ActorGrantResponse](t, revokeResp)
	if revoked.Active {
		t.Fatalf("expected revoked grant to be inactive: %#v", revoked)
	}

	actor, err = NewGORMStore(database).FindActor(t.Context(), ActorLookup{ActorID: "expenses-tooling@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find revoked actor: %v", err)
	}
	if actor.HasPermission(PermissionLedgerReceiptsReturn) {
		t.Fatalf("expected revoked actor to lose expense operator permissions")
	}

	actorsResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/actors", nil, headers)
	if actorsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected actors status 200 after revoke, got %d", actorsResp.StatusCode)
	}
	actors := decodeData[[]ActorResponse](t, actorsResp)
	for _, listedActor := range actors {
		if listedActor.ID != created.ID {
			continue
		}
		if len(listedActor.RoleGrants) != 0 {
			t.Fatalf("expected revoked grant to be hidden from actor list, got %#v", listedActor.RoleGrants)
		}
		return
	}
	t.Fatalf("expected created actor in actor list after revoke")
}

func TestAuthzAdminListsRolesPermissionsAndActors(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "app-admin-list@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "app-admin-list@example.com", HeaderTenantID: "tenant-a"}

	rolesResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, headers)
	if rolesResp.StatusCode != http.StatusOK {
		t.Fatalf("expected roles status 200, got %d", rolesResp.StatusCode)
	}
	roles := decodeData[[]RoleResponse](t, rolesResp)
	if len(roles) < 5 {
		t.Fatalf("expected seeded roles, got %#v", roles)
	}

	permissionsResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/permissions", nil, headers)
	if permissionsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected permissions status 200, got %d", permissionsResp.StatusCode)
	}
	permissions := decodeData[[]PermissionResponse](t, permissionsResp)
	if !containsPermissionResponse(permissions, string(PermissionAuthzManage)) {
		t.Fatalf("expected authz.manage permission in catalog: %#v", permissions)
	}

	actorsResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/actors", nil, headers)
	if actorsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected actors status 200, got %d", actorsResp.StatusCode)
	}
	actors := decodeData[[]ActorResponse](t, actorsResp)
	if len(actors) == 0 || actors[0].ActorKey == "" {
		t.Fatalf("expected actor list, got %#v", actors)
	}
}

func newAuthzTestApp(database *gorm.DB) *fiber.App {
	store := NewGORMStore(database)
	app := fiber.New()
	api := app.Group("/api")
	v1 := api.Group("/v1")
	authzGroup := v1.Group("/authz")
	h := NewHandler(store)
	authzGroup.Get("/current-actor", h.CurrentActor)
	authzGroup.Get("/roles", h.ListRoles)
	authzGroup.Get("/permissions", h.ListPermissions)
	authzGroup.Get("/actors", h.ListActors)
	authzGroup.Get("/audit-logs", h.ListAuditLogs)
	authzGroup.Post("/actors", h.CreateActor)
	authzGroup.Patch("/actors/:id/active", h.SetActorActive)
	authzGroup.Post("/actors/:id/role-grants", h.GrantActorRole)
	authzGroup.Delete("/actors/:id/role-grants/:grantId", h.RevokeActorRoleGrant)
	return app
}

func doAuthzRequest(t *testing.T, app *fiber.App, method string, path string, body any, headers map[string]string) *http.Response {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request %s %s: %v", method, path, err)
	}
	return resp
}

type apiTestResponse[T any] struct {
	Data  T   `json:"data"`
	Error any `json:"error"`
}

func decodeData[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	var envelope apiTestResponse[T]
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return envelope.Data
}

func containsPermissionResponse(rows []PermissionResponse, code string) bool {
	for _, row := range rows {
		if row.Code == code {
			return true
		}
	}
	return false
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
