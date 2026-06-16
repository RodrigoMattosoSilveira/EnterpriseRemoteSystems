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
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, map[string]string{
		HeaderActorID:          "temporary-expense@example.com",
		HeaderTenantID:         "tenant-a",
		HeaderActorPermissions: string(PermissionExpensesCreate),
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status 403, got %d", resp.StatusCode)
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
	authzGroup.Get("/roles", h.ListRoles)
	authzGroup.Get("/permissions", h.ListPermissions)
	authzGroup.Get("/actors", h.ListActors)
	authzGroup.Get("/audit-logs", h.ListAuditLogs)
	authzGroup.Post("/actors", h.CreateActor)
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
